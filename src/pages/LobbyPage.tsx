import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { roomApi, mapApi, buildingApi, fleetApi } from '../api/client';
import type { BoosterOfferResponse, PlayerStateResponse } from '../api/client';
import { PowerLeechDialog } from '../components/PowerLeechDialog';
import { getTerraformDiscount } from '../utils/terraformingCalculator';
import type { FleetShipAction, DeployGaiaformerAction } from '../types/turnActions';
import type { BoosterAction } from '../types/turnActions';
import { useGameStore } from '../store/gameStore';
import { gameSocket } from '../websocket/gameSocket';
import type { GameEvent } from '../websocket/gameSocket';
import HexMap from '../components/HexMap';
import SeatSelector from '../components/SeatSelector';
import GameInfo from '../components/GameInfo';
import TechTracks from '../components/TechTracks';
import ScoringTracks from '../components/ScoringTracks';
import FederationTiles from '../components/FederationTiles';
import PowerActions from '../components/PowerActions';
import RoundBoosters from '../components/RoundBoosters';
import TurnConfirmationPanel from '../components/TurnConfirmationPanel';
import FactionAbilityPanel from '../components/FactionAbilityPanel';

export default function LobbyPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const urlPlayerId = searchParams.get('playerId');

  const {
    playerId,
    nickname,
    status,
    gamePhase,
    seats,
    mySeatNo,
    nextSetupSeatNo,
    currentTurnSeatNo,
    setPublicState,
    setHexes,
    setBuildings,
    setMySeatNo,
    setPlayerInfo,
    updateSeatClaimed,
    updateGameStarted,
    updateMinePlaced,
    setCurrentTurnSeatNo,
    turnState,
    initializeTurn,
    addPendingAction,
    clearPendingActions,
    setConfirmError,
    setIsConfirming,
    setUsedPowerActionCodes,
    incrementBurnPower,
    setFleetProbes,
    leechBatch,
    setLeechBatch,
    updateLeechDecided,
    clearLeechBatch,
  } = useGameStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [boosters, setBoosters] = useState<BoosterOfferResponse[]>([]);
  const [boosterPickSeatNo, setBoosterPickSeatNo] = useState<number>(4); // 4→3→2→1
  const [playerStates, setPlayerStates] = useState<PlayerStateResponse[]>([]);
  const [selectingPassBooster, setSelectingPassBooster] = useState(false);
  const [techRefreshKey, setTechRefreshKey] = useState(0);
  const [deferredAction, setDeferredAction] = React.useState<{ type: string; terraformDiscount: number } | null>(null);

  // 파워 액션 사용 현황 로드
  const loadUsedPowerActions = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await roomApi.getUsedPowerActions(roomId);
      setUsedPowerActionCodes(res.data ?? []);
    } catch {
      // 무시
    }
  }, [roomId, setUsedPowerActionCodes]);

  // 함대 점유 현황 로드
  const loadFleetProbes = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fleetApi.getFleetOccupancy(roomId);
      setFleetProbes(res.data.probesByFleet);
    } catch {
      // 무시
    }
  }, [roomId, setFleetProbes]);

  // 부스터 로드 공통 함수
  const loadBoosters = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await roomApi.getBoosters(roomId);
      if (res.data?.length > 0) {
        setBoosters(res.data);
        const pickedCount = res.data.filter((b: BoosterOfferResponse) => b.pickedBySeatNo !== null).length;
        setBoosterPickSeatNo(4 - pickedCount);
      }
    } catch {
      // 부스터 미생성 상태
    }
  }, [roomId]);

  // WebSocket 이벤트 핸들러 (ref로 관리 - 연결 끊김 방지)
  const eventHandlerRef = useRef<(event: GameEvent) => void>(() => {});

  useEffect(() => {
    eventHandlerRef.current = async (event: GameEvent) => {
      switch (event.eventType) {
        case 'PLAYER_JOINED':
          if (roomId) {
            const stateRes = await roomApi.getPublicState(roomId);
            setPublicState(stateRes.data);
          }
          break;

        case 'SEAT_CLAIMED':
          if (event.payload.seatNo && event.playerId && roomId) {
            updateSeatClaimed(event.payload.seatNo as number, event.playerId);
            const playerRes = await roomApi.getPlayerStates(roomId);
            setPlayerStates(playerRes.data);
          }
          break;

        case 'BOOSTER_SELECTED':
          if (roomId) {
            const stateRes = await roomApi.getPublicState(roomId);
            setPublicState(stateRes.data);
            await loadBoosters();
            setBoosterPickSeatNo(event.payload.nextPickSeatNo as number);
          }
          break;

        case 'GAME_STARTED':
          updateGameStarted(
            event.payload.gamePhase as string,
            event.payload.nextSetupSeatNo as number | null
          );
          await loadBoosters();
          break;

        case 'MINE_PLACED':
          if (event.playerId && roomId) {
            updateMinePlaced(
              event.payload.hexQ as number,
              event.payload.hexR as number,
              event.playerId,
              (event.payload.nextSeatNo as number) || null,
              event.payload.gamePhase as string
            );
            const buildingRes = await buildingApi.getBuildings(roomId);
            setBuildings(buildingRes.data);
            if (event.payload.gamePhase === 'BOOSTER_SELECTION') {
              await loadBoosters();
              setBoosterPickSeatNo(4);
            }
          }
          break;

        case 'TURN_CHANGED':
          setCurrentTurnSeatNo(event.payload.newTurnSeatNo as number | null);
          clearPendingActions();
          if (roomId) {
            const [playerRes3, buildingRes3, hexRes3] = await Promise.all([
              roomApi.getPlayerStates(roomId),
              buildingApi.getBuildings(roomId),
              mapApi.getHexes(roomId),
            ]);
            setPlayerStates(playerRes3.data);
            setBuildings(buildingRes3.data);
            setHexes(hexRes3.data);
            setTechRefreshKey(k => k + 1);
            await loadUsedPowerActions();
            await loadFleetProbes();
          }
          break;

        case 'PLAYER_PASSED':
          if (roomId) {
            await loadBoosters();
            const playerRes5 = await roomApi.getPlayerStates(roomId);
            setPlayerStates(playerRes5.data);
          }
          break;

        case 'ROUND_STARTED':
          clearPendingActions();
          if (roomId) {
            const [stateRes3, playerRes4, hexRes2, buildingRes4] = await Promise.all([
              roomApi.getPublicState(roomId),
              roomApi.getPlayerStates(roomId),
              mapApi.getHexes(roomId),
              buildingApi.getBuildings(roomId),
            ]);
            setPublicState(stateRes3.data);
            setPlayerStates(playerRes4.data);
            setHexes(hexRes2.data);
            setBuildings(buildingRes4.data);
            await loadBoosters();
            setUsedPowerActionCodes([]);
          }
          break;

        case 'LEECH_OFFERED':
          setLeechBatch({
            batchKey: event.payload.batchKey as string,
            currentLeechId: event.payload.currentLeechId as string,
            currentDeciderId: event.payload.currentDeciderId as string,
            offers: event.payload.offers as any[],
          });
          // 플레이어 상태 갱신
          if (roomId) {
            const prLeech = await roomApi.getPlayerStates(roomId);
            setPlayerStates(prLeech.data);
          }
          break;

        case 'LEECH_DECIDED': {
          const decidedPayload = event.payload;
          if (decidedPayload.allResolved) {
            clearLeechBatch();
          } else {
            updateLeechDecided(
              decidedPayload.decidedLeechId as string,
              decidedPayload.nextLeechId as string,
              decidedPayload.nextDeciderId as string
            );
          }
          // 플레이어 상태 갱신
          if (roomId) {
            const prDecided = await roomApi.getPlayerStates(roomId);
            setPlayerStates(prDecided.data);
          }
          break;
        }

        case 'DEFERRED_ACTION_REQUIRED': {
          const deferredPayload = event.payload;
          if (deferredPayload.actionType === 'PLACE_MINE_TERRAFORM_2'
              && deferredPayload.triggerPlayerId === (playerId || urlPlayerId)) {
            setDeferredAction({ type: 'PLACE_MINE_TERRAFORM_2', terraformDiscount: 2 });
          }
          break;
        }

        case 'STATE_UPDATED':
          if (roomId) {
            const [stateRes2, buildingRes2, playerRes2, hexRes2] = await Promise.all([
              roomApi.getPublicState(roomId),
              buildingApi.getBuildings(roomId),
              roomApi.getPlayerStates(roomId),
              mapApi.getHexes(roomId),
            ]);
            setPublicState(stateRes2.data);
            setBuildings(buildingRes2.data);
            setPlayerStates(playerRes2.data);
            setHexes(hexRes2.data);
            setTechRefreshKey(k => k + 1);
            await loadBoosters();
          }
          break;
      }
    };
  });

  // WebSocket 연결 (roomId만 의존 - 핸들러 변경으로 재연결 안 됨)
  useEffect(() => {
    if (!roomId) return;

    gameSocket.connect(roomId, () => {
      setWsConnected(true);
    });

    const removeHandler = gameSocket.addHandler((event: GameEvent) => {
      eventHandlerRef.current(event);
    });

    return () => {
      removeHandler();
      gameSocket.disconnect();
      setWsConnected(false);
    };
  }, [roomId]);

  // URL에서 playerId 검증 및 복원
  useEffect(() => {
    if (!roomId || !urlPlayerId || playerId) return;

    const verifyAndRestore = async () => {
      try {
        setVerifying(true);
        const res = await roomApi.verifyParticipant(roomId, urlPlayerId);

        if (res.data.valid && res.data.nickname) {
          // 유효한 playerId - 상태 복원
          setPlayerInfo(urlPlayerId, res.data.nickname);
          if (res.data.seatNo) {
            setMySeatNo(res.data.seatNo);
          }
        }
      } catch (err) {
        console.error('참가자 검증 실패:', err);
      } finally {
        setVerifying(false);
      }
    };

    verifyAndRestore();
  }, [roomId, urlPlayerId, playerId]);

  // 초기 데이터 로드
  useEffect(() => {
    if (!roomId) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // 1. 공개 상태 조회
        const stateRes = await roomApi.getPublicState(roomId);
        setPublicState(stateRes.data);

        // 2. 맵 헥스 조회
        const hexRes = await mapApi.getHexes(roomId);
        setHexes(hexRes.data);

        // 3. 건물 조회
        const buildingRes = await buildingApi.getBuildings(roomId);
        setBuildings(buildingRes.data);

        // 4. 플레이어 상태 조회
        const playerRes = await roomApi.getPlayerStates(roomId);
        setPlayerStates(playerRes.data);

        // 5. 내 좌석 확인 (playerId 또는 urlPlayerId 사용)
        const currentPlayerId = playerId || urlPlayerId;
        if (currentPlayerId) {
          const mySeat = stateRes.data.seats.find((s) => s.playerId === currentPlayerId);
          if (mySeat) {
            setMySeatNo(mySeat.seatNo);
          }
        }

        // 6. 부스터 로드 (항상 시도)
        await loadBoosters();
        await loadUsedPowerActions();
        await loadFleetProbes();
      } catch (err: any) {
        setError(err.response?.data?.message || '데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [roomId, playerId, urlPlayerId]);

  // 부스터 목록 로드 (gamePhase/status 변경 시)
  useEffect(() => {
    loadBoosters();
  }, [loadBoosters, gamePhase, status]);

  // 좌석 선택 핸들러
  const handleClaimSeat = async (seatNo: number) => {
    if (!roomId || !playerId) return;

    try {
      const res = await roomApi.claimSeat(roomId, seatNo, playerId);
      if (res.data.success && res.data.publicState) {
        setPublicState(res.data.publicState);
        setMySeatNo(seatNo);
        // HTTP 응답 시점 = 트랜잭션 커밋 완료 → 본인 상태 포함 보장
        const playerRes = await roomApi.getPlayerStates(roomId);
        setPlayerStates(playerRes.data);
      } else {
        alert(res.data.message || '좌석 선택 실패');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '좌석 선택 실패');
    }
  };

  // 게임 시작 핸들러
  const handleStartGame = async () => {
    if (!roomId) return;

    try {
      const res = await roomApi.startGame(roomId);
      if (res.data.success) {
        // 상태 다시 로드
        const stateRes = await roomApi.getPublicState(roomId);
        setPublicState(stateRes.data);
      } else {
        alert(res.data.message || '게임 시작 실패');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '게임 시작 실패');
    }
  };

  // 부스터 선택 핸들러
  const handleSelectBooster = async (boosterCode: string) => {
    if (!roomId || !playerId) return;

    try {
      const res = await roomApi.selectBooster(roomId, playerId, boosterCode);
      if (res.data.success) {
        await loadBoosters();
        setBoosterPickSeatNo(res.data.nextPickSeatNo);

        if (res.data.nextPickSeatNo === 0) {
          const stateRes = await roomApi.getPublicState(roomId);
          setPublicState(stateRes.data);
        }
      } else {
        alert(res.data.message || '부스터 선택 실패');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '부스터 선택 실패');
    }
  };

  // 턴 초기화 - 내 플레이어 상태 로드 시
  useEffect(() => {
    if (!mySeatNo || playerStates.length === 0) return;

    const myPlayerState = playerStates.find(p => p.seatNo === mySeatNo);
    if (myPlayerState) {
      initializeTurn(myPlayerState);
    }
  }, [mySeatNo, playerStates, initializeTurn]);

  // 내 턴인지 판단
  const isMyTurn = useMemo(() => {
    if (!mySeatNo) return false;
    if (gamePhase?.startsWith('SETUP_MINE')) return mySeatNo === nextSetupSeatNo;
    if (gamePhase === 'BOOSTER_SELECTION') return mySeatNo === boosterPickSeatNo;
    if (gamePhase === 'PLAYING') return mySeatNo === currentTurnSeatNo;
    return false;
  }, [mySeatNo, gamePhase, nextSetupSeatNo, boosterPickSeatNo, currentTurnSeatNo]);

  // 파워 소각 - 로컬에서만 추적, 턴 확정 시 백엔드 반영
  const handleBurnPower = () => {
    incrementBurnPower();
  };

  // 부스터 액션 사용 - 광산 배치 모드로 진입 (로컬 pending 추가)
  const handleUseBoosterAction = (boosterCode: string, actionType: string) => {
    if (turnState.pendingActions.length > 0) {
      alert('이미 액션을 선택했습니다.');
      return;
    }
    const action: BoosterAction = {
      id: `action-${Date.now()}-${Math.random()}`,
      type: 'BOOSTER_ACTION',
      timestamp: Date.now(),
      payload: {
        boosterCode,
        actionType,
        terraformDiscount: actionType === 'TERRAFORM_ONE_STEP' ? 1 : 0,
        navBonus: actionType === 'NAVIGATION_PLUS_3' ? 3 : 0,
      },
    };
    addPendingAction(action);
  };

  // 턴 확정 핸들러
  const handleConfirmTurn = async () => {
    if (!roomId || !playerId || turnState.pendingActions.length === 0) {
      return;
    }
    // 부스터/파워 액션이 있는데 후속 액션(광산/우주선)이 아직 없는 경우 방지
    const pendingBooster = turnState.pendingActions.find(a => a.type === 'BOOSTER_ACTION');
    const hasPendingPowerTerraform = turnState.pendingActions.some(
      a => a.type === 'POWER_ACTION' &&
        (a.payload.powerActionCode === 'PWR_TERRAFORM' || a.payload.powerActionCode === 'PWR_TERRAFORM_2')
    );
    const pendingFleetShip = turnState.pendingActions.find(a => a.type === 'FLEET_SHIP_ACTION') as FleetShipAction | undefined;
    const hasPendingFleetShipSplit = pendingFleetShip && !pendingFleetShip.payload.isImmediate;
    const hasMine = turnState.pendingActions.some(a => a.type === 'PLACE_MINE');
    const hasFleet = turnState.pendingActions.some(a => a.type === 'FLEET_PROBE');
    const hasGaiaformer = turnState.pendingActions.some(a => a.type === 'DEPLOY_GAIAFORMER');
    if (pendingBooster && !hasMine && !hasFleet && !hasGaiaformer) {
      setConfirmError('위치를 선택하세요.');
      return;
    }
    if (hasPendingPowerTerraform && !hasMine) {
      setConfirmError('광산을 배치할 위치를 선택하세요.');
      return;
    }
    if (hasPendingFleetShipSplit && !hasMine) {
      setConfirmError('광산을 배치할 위치를 선택하세요.');
      return;
    }

    setIsConfirming(true);
    setConfirmError(null);

    try {
      // 파워 소각 먼저 처리 (자유 행동)
      if (turnState.burnPowerCount > 0) {
        for (let i = 0; i < turnState.burnPowerCount; i++) {
          await roomApi.burnPower(roomId, playerId);
        }
      }

      // 프리 액션 자원 변환 처리
      if (turnState.freeConvertActions && turnState.freeConvertActions.length > 0) {
        for (const code of turnState.freeConvertActions) {
          await roomApi.freeConvert(roomId, playerId, code);
        }
      }

      if (gamePhase === 'PLAYING') {
        const actions = turnState.pendingActions;
        const terraformDiscount = getTerraformDiscount(actions);
        const mineAction = actions.find(a => a.type === 'PLACE_MINE');
        const powerAction = actions.find(a => a.type === 'POWER_ACTION');
        const boosterActionPending = actions.find(a => a.type === 'BOOSTER_ACTION');
        const firstAction = actions[0];

        const fleetAction = actions.find(a => a.type === 'FLEET_PROBE');
        const gaiaformerAction = actions.find(a => a.type === 'DEPLOY_GAIAFORMER') as DeployGaiaformerAction | undefined;

        if (boosterActionPending && gaiaformerAction) {
          // BOOSTER_12 즉시 포밍: 부스터 사용 + 즉시 GAIA 변환
          const boosterRes = await roomApi.useBoosterAction(roomId, playerId);
          if (!boosterRes.data.success) { setConfirmError(boosterRes.data.message || '부스터 액션 실패'); return; }
          const res = await roomApi.deployGaiaformer(roomId, playerId, gaiaformerAction.payload.hexQ, gaiaformerAction.payload.hexR, gaiaformerAction.payload.qicUsed, true);
          if (!res.data.success) { setConfirmError(res.data.message || '가이아포머 배치 실패'); return; }

        } else if (boosterActionPending && mineAction) {
          // 부스터 액션 + 광산 건설 콤보 (TERRAFORM_ONE_STEP, NAVIGATION_PLUS_3 모두)
          const boosterRes = await roomApi.useBoosterAction(roomId, playerId);
          if (!boosterRes.data.success) { setConfirmError(boosterRes.data.message || '부스터 액션 실패'); return; }
          const qicUsed = mineAction.payload.cost?.qic ?? 0;
          const gaiaformerUsed = mineAction.payload.gaiaformerUsed ?? false;
          const res = await roomApi.placeMine(roomId, playerId, mineAction.payload.hexQ, mineAction.payload.hexR, qicUsed, gaiaformerUsed, terraformDiscount);
          if (!res.data.success) { setConfirmError(res.data.message || '광산 건설 실패'); return; }

        } else if (boosterActionPending && fleetAction) {
          // 부스터 항법 액션 + 우주선 입장 콤보
          const boosterRes = await roomApi.useBoosterAction(roomId, playerId);
          if (!boosterRes.data.success) { setConfirmError(boosterRes.data.message || '부스터 액션 실패'); return; }
          const navQic = fleetAction.payload.cost?.qic ?? 0;
          const res = await fleetApi.placeFleetProbe(roomId, playerId, fleetAction.payload.fleetName, navQic);
          if (!res.data.success) { setConfirmError(res.data.message || '우주선 입장 실패'); return; }

        } else if (pendingFleetShip && hasMine && !pendingFleetShip.payload.isImmediate) {
          // 함대 선박 split 액션 (TF_MARS_TERRAFORM, TWILIGHT_NAV) + 광산 건설
          const fsaRes = await roomApi.fleetShipAction(roomId, playerId, pendingFleetShip.payload.actionCode);
          if (!fsaRes.data.success) { setConfirmError(fsaRes.data.message || '함대 액션 실패'); return; }
          const qicUsed = mineAction!.payload.cost?.qic ?? 0;
          const gaiaformerUsed = mineAction!.payload.gaiaformerUsed ?? false;
          const res = await roomApi.placeMine(roomId, playerId, mineAction!.payload.hexQ, mineAction!.payload.hexR, qicUsed, gaiaformerUsed, terraformDiscount);
          if (!res.data.success) { setConfirmError(res.data.message || '광산 건설 실패'); return; }

        } else if (powerAction && mineAction) {
          // 파워 테라포밍 액션 + 광산 건설 콤보
          const pwrRes = await roomApi.usePowerAction(roomId, playerId, powerAction.payload.powerActionCode);
          if (!pwrRes.data.success) { setConfirmError(pwrRes.data.message || '파워 액션 실패'); return; }
          const qicUsed = mineAction.payload.cost?.qic ?? 0;
          const gaiaformerUsed = mineAction.payload.gaiaformerUsed ?? false;
          const res = await roomApi.placeMine(roomId, playerId, mineAction.payload.hexQ, mineAction.payload.hexR, qicUsed, gaiaformerUsed, terraformDiscount);
          if (!res.data.success) { setConfirmError(res.data.message || '광산 건설 실패'); return; }

        } else if (firstAction.type === 'PLACE_MINE') {
          const qicUsed = firstAction.payload.cost?.qic ?? 0;
          const gaiaformerUsed = firstAction.payload.gaiaformerUsed ?? false;
          const res = await roomApi.placeMine(roomId, playerId, firstAction.payload.hexQ, firstAction.payload.hexR, qicUsed, gaiaformerUsed, 0);
          if (!res.data.success) { setConfirmError(res.data.message || '광산 건설 실패'); return; }

        } else if (firstAction.type === 'UPGRADE_BUILDING') {
          const { tentativeTechTileCode, tentativeTechTrackCode } = useGameStore.getState();
          console.log('[UPGRADE] toType:', firstAction.payload.toType, 'tileCode:', tentativeTechTileCode, 'trackCode:', tentativeTechTrackCode);
          const res = await roomApi.upgradeBuilding(
            roomId, playerId, firstAction.payload.hexQ, firstAction.payload.hexR, firstAction.payload.toType,
            tentativeTechTileCode ?? undefined,
            tentativeTechTrackCode ?? undefined
          );
          if (!res.data.success) { setConfirmError(res.data.message || '건물 업그레이드 실패'); return; }

        } else if (firstAction.type === 'POWER_ACTION') {
          const code: string = firstAction.payload.powerActionCode;
          const res = await roomApi.usePowerAction(roomId, playerId, code);
          if (!res.data.success) { setConfirmError(res.data.message || '파워 액션 실패'); return; }

        } else if (firstAction.type === 'FLEET_PROBE') {
          const navQic = firstAction.payload.cost?.qic ?? 0;
          const res = await fleetApi.placeFleetProbe(roomId, playerId, firstAction.payload.fleetName, navQic);
          if (!res.data.success) { setConfirmError(res.data.message || '함대 입장 실패'); return; }

        } else if (firstAction.type === 'ADVANCE_TECH') {
          const res = await roomApi.advanceTechTrack(roomId, playerId, firstAction.payload.trackCode);
          if (!res.data.success) { setConfirmError(res.data.message || '기술 트랙 전진 실패'); return; }

        } else if (firstAction.type === 'DEPLOY_GAIAFORMER') {
          const res = await roomApi.deployGaiaformer(roomId, playerId, firstAction.payload.hexQ, firstAction.payload.hexR, firstAction.payload.qicUsed);
          if (!res.data.success) { setConfirmError(res.data.message || '가이아포머 배치 실패'); return; }

        } else if (firstAction.type === 'FLEET_SHIP_ACTION') {
          // 즉시 처리 함대 선박 액션 (hex/track 포함)
          const fsa = firstAction as FleetShipAction;
          const res = await roomApi.fleetShipAction(
            roomId, playerId, fsa.payload.actionCode,
            fsa.payload.hexQ, fsa.payload.hexR, fsa.payload.trackCode
          );
          if (!res.data.success) { setConfirmError(res.data.message || '함대 액션 실패'); return; }

        } else if (firstAction.type === 'TECH_TILE_ACTION') {
          const res = await roomApi.useTechTileAction(roomId, playerId, firstAction.payload.tileCode);
          if (!res.data.success) { setConfirmError(res.data.message || '기술 타일 액션 실패'); return; }

        } else {
          // 기타 액션: confirmAction으로 기록
          const res = await roomApi.confirmAction(roomId, playerId, firstAction.type, JSON.stringify(firstAction.payload));
          if (!res.data.success) { setConfirmError(res.data.message || '액션 확정 실패'); return; }
        }

      } else {
        // SETUP 페이즈: 기존 방식
        for (const action of turnState.pendingActions) {
          if (action.type === 'PLACE_MINE') {
            await buildingApi.placeInitialMine(roomId, playerId, action.payload.hexQ, action.payload.hexR);
          } else if (action.type === 'SELECT_BOOSTER') {
            const res = await roomApi.selectBooster(roomId, playerId, action.payload.boosterCode);
            if (res.data.success) {
              await loadBoosters();
              setBoosterPickSeatNo(res.data.nextPickSeatNo);
            }
          }
        }
      }

      clearPendingActions();
      setTechRefreshKey(k => k + 1);

      const [stateRes, buildingRes, playerRes, hexRes] = await Promise.all([
        roomApi.getPublicState(roomId),
        buildingApi.getBuildings(roomId),
        roomApi.getPlayerStates(roomId),
        mapApi.getHexes(roomId),
      ]);

      setPublicState(stateRes.data);
      setBuildings(buildingRes.data);
      setPlayerStates(playerRes.data);
      setHexes(hexRes.data);

    } catch (err: any) {
      const errorMsg = err.response?.data?.message || '턴 확정 중 오류 발생';
      setConfirmError(errorMsg);
    } finally {
      setIsConfirming(false);
    }
  };

  // 턴 롤백 핸들러
  const handleRollbackTurn = () => {
    clearPendingActions();
    setSelectingPassBooster(false);
  };

  // 턴 패스 핸들러 (PLAYING 페이즈) - 부스터 선택 모드 진입
  const handlePassTurn = () => {
    clearPendingActions();
    setSelectingPassBooster(true);
  };

  // 부스터 선택 후 패스 확정
  const handlePassWithBooster = async (boosterCode: string) => {
    if (!roomId || !playerId) return;

    setIsConfirming(true);
    setConfirmError(null);

    try {
      const res = await roomApi.passRound(roomId, playerId, boosterCode);
      if (res.data.success) {
        setSelectingPassBooster(false);
        clearPendingActions();
        await loadBoosters();
        // TURN_CHANGED / ROUND_CHANGED 웹소켓 이벤트로 자동 갱신되지만 fallback
        if (res.data.nextTurnSeatNo !== null && res.data.nextTurnSeatNo !== undefined) {
          setCurrentTurnSeatNo(res.data.nextTurnSeatNo);
        }
        const playerRes = await roomApi.getPlayerStates(roomId);
        setPlayerStates(playerRes.data);
      } else {
        setConfirmError(res.data.message || '패스 실패');
      }
    } catch (err: any) {
      setConfirmError(err.response?.data?.message || '패스 중 오류 발생');
    } finally {
      setIsConfirming(false);
    }
  };

  if (loading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">{verifying ? '참가자 확인 중...' : '로딩 중...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-red-400">{error}</p>
      </div>
    );
  }

  const currentPlayerId = playerId || urlPlayerId;

  return (
    <div className="min-h-screen p-3">
      {/* 상단 정보 */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-700/40">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight text-white/90">Gaia Project</h1>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{nickname}</span>
            <span className="text-gray-600">|</span>
            <span className="font-mono text-gray-500">{roomId?.substring(0, 8)}</span>
            <button
              onClick={() => {
                if (roomId) {
                  navigator.clipboard.writeText(roomId);
                  alert('방 ID가 복사되었습니다!');
                }
              }}
              className="text-[10px] bg-gray-700/60 hover:bg-gray-600/60 px-1.5 py-0.5 rounded transition"
              title="방 ID 복사"
            >
              복사
            </button>
            <span className={`flex items-center gap-1 ${wsConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`} />
              {wsConnected ? '연결됨' : '연결 중'}
            </span>
          </div>
        </div>
        <GameInfo />
      </div>

      {/* 메인 컨텐츠 - 3열 구조 */}
      <div className="flex gap-3" style={{ height: 'calc(100vh - 80px)' }}>
        {/* 좌측: 캐릭 상태 (전체 높이) - 20% */}
        <div className="w-[20%] flex flex-col gap-2">
          <SeatSelector
            seats={seats}
            mySeatNo={mySeatNo}
            playerId={playerId}
            currentTurnSeatNo={
              gamePhase?.startsWith('SETUP_MINE')
                ? nextSetupSeatNo
                : gamePhase === 'BOOSTER_SELECTION'
                ? boosterPickSeatNo
                : gamePhase === 'PLAYING'
                ? currentTurnSeatNo
                : null
            }
            playerStates={playerStates}
            boosters={boosters}
            onClaimSeat={handleClaimSeat}
            isMyTurn={isMyTurn}
            gamePhase={gamePhase}
            onBurnPower={handleBurnPower}
          />

          {/* 게임 시작 버튼 */}
          {status === 'READY' && seats.every((s) => s.playerId) && !gamePhase && (
            <button
              onClick={handleStartGame}
              className="bg-emerald-600/80 hover:bg-emerald-500/80 text-white py-2 px-4 rounded-xl transition font-semibold shadow-lg shadow-emerald-900/30"
            >
              게임 시작
            </button>
          )}

          {/* Turn Confirmation Panel */}
          <TurnConfirmationPanel
            isMyTurn={isMyTurn}
            gamePhase={gamePhase}
            pendingActions={turnState.pendingActions}
            burnPowerCount={turnState.burnPowerCount}
            previewResources={turnState.previewPlayerState}
            originalResources={turnState.originalPlayerState}
            onConfirm={handleConfirmTurn}
            onRollback={handleRollbackTurn}
            onPassTurn={handlePassTurn}
            isConfirming={turnState.isConfirming}
            error={turnState.confirmError}
            selectingPassBooster={selectingPassBooster}
          />

          {/* 최종 점수 */}
          <ScoringTracks roomId={roomId!} seats={seats} />
        </div>

        {/* 중앙: 맵 (상단) + 지식트랙 (하단) - 55% */}
        <div className="w-[55%] flex flex-col gap-3">
          {/* 맵 */}
          <div className="flex-1">
            <HexMap roomId={roomId!} playerStates={playerStates} seats={seats} />
          </div>
          {/* 지식 트랙 */}
          <div style={{ height: '35%' }}>
            <TechTracks
              roomId={roomId!}
              playerStates={playerStates}
              isMyTurn={isMyTurn}
              mySeatNo={mySeatNo}
              gamePhase={gamePhase}
              refreshKey={techRefreshKey}
            />
          </div>
        </div>

        {/* 우측: 연방타일 + 파워액션 + 라운드부스터 + 행성종류판 - 25% */}
        <div className="w-[25%] flex flex-col gap-3">
          {/* 잊힌 함대 */}
          <FederationTiles
            roomId={roomId!}
            playerStates={playerStates}
          />
          {/* 파워 액션 */}
          <PowerActions
            roomId={roomId!}
            mySeatNo={mySeatNo}
            isMyTurn={isMyTurn}
            playerStates={playerStates}
          />
          {/* 라운드 부스터 */}
          <RoundBoosters
            boosters={boosters}
            mySeatNo={mySeatNo}
            boosterPickSeatNo={boosterPickSeatNo}
            gamePhase={gamePhase}
            seats={seats}
            onSelectBooster={handleSelectBooster}
            selectingPassBooster={selectingPassBooster}
            onPassBoosterSelect={handlePassWithBooster}
            onCancelPassBooster={() => setSelectingPassBooster(false)}
            boosterActionUsed={turnState.originalPlayerState?.boosterActionUsed ?? false}
            onUseBoosterAction={handleUseBoosterAction}
            isMyTurn={isMyTurn}
            playerStates={playerStates}
          />
        </div>
      </div>

      {/* 파워 리치 결정 대기 배너 (내 차례가 아닌 경우) */}
      {leechBatch && leechBatch.currentDeciderId !== currentPlayerId && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-yellow-900/90 backdrop-blur-sm border border-yellow-500/40 text-yellow-200 px-6 py-2.5 rounded-xl z-40 text-sm shadow-lg shadow-yellow-900/20">
          파워 리치 결정 대기 중...
        </div>
      )}

      {/* 2삽 광산 배치 안내 배너 */}
      {deferredAction?.type === 'PLACE_MINE_TERRAFORM_2' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-900/90 backdrop-blur-sm border border-emerald-500/40 text-emerald-100 px-6 py-2.5 rounded-xl z-40 text-sm flex items-center gap-2 shadow-lg shadow-emerald-900/20">
          <span>테라포밍 2단계 할인 적용 — 광산을 배치할 위치를 선택하세요.</span>
          <button
            onClick={() => setDeferredAction(null)}
            className="text-emerald-300 hover:text-white text-xs ml-2"
          >
            취소
          </button>
        </div>
      )}

      {/* 파워 리치 결정 다이얼로그 */}
      {currentPlayerId && (
        <PowerLeechDialog roomId={roomId!} myPlayerId={currentPlayerId} />
      )}
    </div>
  );
}
