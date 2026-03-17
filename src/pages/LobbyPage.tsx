import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { roomApi, mapApi, buildingApi, fleetApi } from '../api/client';
import type { BoosterOfferResponse, PlayerStateResponse } from '../api/client';
import { PowerLeechDialog } from '../components/PowerLeechDialog';
import { ItarsGaiaChoiceDialog } from '../components/ItarsGaiaChoiceDialog';
import { TerransGaiaDialog } from '../components/TerransGaiaDialog';
import { TinkeroidsActionChoiceDialog } from '../components/TinkeroidsActionChoiceDialog';
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
import FederationSupply from '../components/FederationSupply';
import RoundBoosters from '../components/RoundBoosters';
import TurnConfirmationPanel from '../components/TurnConfirmationPanel';
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
    setFederationGroups,
    leechBatch,
    setLeechBatch,
    updateLeechDecided,
    clearLeechBatch,
    setItarsGaiaChoice,
    setTinkeroidsActionChoice,
    itarsGaiaChoice,
    tinkeroidsActionChoice,
    setTentativeTechTile,
    selectingPassBooster,
    setSelectingPassBooster,
  } = useGameStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [boosters, setBoosters] = useState<BoosterOfferResponse[]>([]);
  const [boosterPickSeatNo, setBoosterPickSeatNo] = useState<number>(4); // 4→3→2→1
  const [playerStates, setPlayerStates] = useState<PlayerStateResponse[]>([]);

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
          if (roomId) {
            const [playerRes3, buildingRes3, hexRes3] = await Promise.all([
              roomApi.getPlayerStates(roomId),
              buildingApi.getBuildings(roomId),
              mapApi.getHexes(roomId),
            ]);
            // BE 상태 먼저 반영 후 pendingActions 클리어 (깜빡임 방지)
            setPlayerStates(playerRes3.data);
            clearPendingActions();
            setBuildings(buildingRes3.data);
            setHexes(hexRes3.data);
            setTechRefreshKey(k => k + 1);
            await loadUsedPowerActions();
            await loadFleetProbes();
            try { const fedRes = await roomApi.getFederationGroups(roomId); setFederationGroups(fedRes.data); } catch {}
          }
          break;

        case 'PLAYER_PASSED':
          if (roomId) {
            const allPassedFlag = event.payload.allPassed as boolean;
            // seatNo 직접 사용, 없으면 playerId로 찾기
            const currentSeats = useGameStore.getState().seats;
            const passedSeatNo = (event.payload.seatNo as number | undefined)
              ?? currentSeats.find(s => s.playerId === (event.payload.playerId as string))?.seatNo;
            if (passedSeatNo != null) useGameStore.getState().addPassedSeatNo(passedSeatNo);
            await loadBoosters();
            const playerRes5 = await roomApi.getPlayerStates(roomId);
            setPlayerStates(playerRes5.data);
            if (allPassedFlag) {
              useGameStore.getState().clearPassedSeatNos();
              // 라운드 종료 시 전체 상태 갱신 (gamePhase, currentTurnSeatNo 반영)
              const stateResPass = await roomApi.getPublicState(roomId);
              setPublicState(stateResPass.data);
            }
          }
          break;

        case 'ROUND_STARTED':
          useGameStore.getState().clearPassedSeatNos();
          setItarsGaiaChoice(null);
          setTinkeroidsActionChoice(null);
          if (roomId) {
            const [stateRes3, playerRes4, hexRes2, buildingRes4] = await Promise.all([
              roomApi.getPublicState(roomId),
              roomApi.getPlayerStates(roomId),
              mapApi.getHexes(roomId),
              buildingApi.getBuildings(roomId),
            ]);
            setPublicState(stateRes3.data);
            // turnOrder는 BE에서 갱신됨 → setPublicState로 seats에 반영
            setPlayerStates(playerRes4.data);
            clearPendingActions();
            setHexes(hexRes2.data);
            setBuildings(buildingRes4.data);
            await loadBoosters();
            setUsedPowerActionCodes([]);
          }
          break;

        case 'TINKEROIDS_ACTION_CHOICE': {
          const tinkPayload = event.payload;
          setTinkeroidsActionChoice({
            tinkeroidsPlayerId: tinkPayload.tinkeroidsPlayerId as string,
            availableActions: tinkPayload.availableActions as string[],
            currentRound: tinkPayload.currentRound as number,
          });
          break;
        }

        case 'TERRANS_GAIA_CHOICE': {
          const terransPayload = event.payload;
          useGameStore.getState().setTerransGaiaChoice({
            terransPlayerId: terransPayload.terransPlayerId as string,
            gaiaPower: terransPayload.gaiaPower as number,
          });
          break;
        }

        case 'ITARS_GAIA_CHOICE': {
          const itarsPayload = event.payload;
          setTentativeTechTile(null, null);
          setItarsGaiaChoice({
            itarsPlayerId: itarsPayload.itarsPlayerId as string,
            availableChoices: itarsPayload.availableChoices as number,
            tilePicking: false,
          });
          if (roomId) {
            const prItars = await roomApi.getPlayerStates(roomId);
            setPlayerStates(prItars.data);
          }
          setTechRefreshKey(k => k + 1);
          break;
        }

        case 'LEECH_OFFERED': {
          const offers = event.payload.offers as any[];
          const deciderIds = (event.payload.deciderIds as string[]) ?? offers.map((o: any) => o.receivePlayerId);
          setLeechBatch({
            batchKey: event.payload.batchKey as string,
            currentLeechId: offers[0]?.id ?? null,
            currentDeciderId: deciderIds[0] ?? null,
            deciderIds,
            offers,
          });
          // 플레이어 상태 갱신
          if (roomId) {
            const prLeech = await roomApi.getPlayerStates(roomId);
            setPlayerStates(prLeech.data);
          }
          break;
        }

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
          // 전체 상태 갱신 (건물/헥스 포함)
          if (roomId) {
            const [prDecided, buildingResDecided, hexResDecided] = await Promise.all([
              roomApi.getPlayerStates(roomId),
              buildingApi.getBuildings(roomId),
              mapApi.getHexes(roomId),
            ]);
            setPlayerStates(prDecided.data);
            setBuildings(buildingResDecided.data);
            setHexes(hexResDecided.data);
          }
          break;
        }

        case 'DEFERRED_ACTION_REQUIRED': {
          const deferredPayload = event.payload;
          if (deferredPayload.actionType === 'PLACE_MINE_TERRAFORM_2'
              && deferredPayload.triggerPlayerId === (playerId || urlPlayerId)) {
            setDeferredAction({ type: 'PLACE_MINE_TERRAFORM_2', terraformDiscount: 2 });
            // 2삽 할인 pending 추가 → HexMap에서 광산 건설 모드 활성화
            clearPendingActions();
            addPendingAction({
              id: `deferred-tf2-${Date.now()}`,
              type: 'BOOSTER_ACTION',
              timestamp: Date.now(),
              payload: { boosterCode: 'DEFERRED_TERRAFORM_2', actionType: 'TERRAFORM_TWO_STEP', terraformDiscount: 2, navBonus: 0 },
            });
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
  // 이벤트 직렬화: 이전 이벤트 처리 완료 후 다음 이벤트 처리
  const eventQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!roomId) return;

    gameSocket.connect(roomId, () => {
      setWsConnected(true);
    });

    const removeHandler = gameSocket.addHandler((event: GameEvent) => {
      eventQueueRef.current = eventQueueRef.current
        .then(() => eventHandlerRef.current(event))
        .catch(err => console.error('WS event handler error:', err));
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
        // turnOrder는 seats에 포함되어 setPublicState에서 자동 반영

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
        // 연방 그룹 로드
        try { const fedRes = await roomApi.getFederationGroups(roomId); setFederationGroups(fedRes.data); } catch {}

        // 7. 특수 페이즈 복원 (새로고침/재접속 시)
        const phase = stateRes.data.gamePhase;
        const specialPlayerId = stateRes.data.pendingSpecialPlayerId;
        const specialData = stateRes.data.pendingSpecialData;
        if (phase === 'ITARS_GAIA_PHASE' && specialPlayerId && specialData) {
          setItarsGaiaChoice({
            itarsPlayerId: specialPlayerId,
            availableChoices: specialData.availableChoices as number,
            tilePicking: false,
          });
        } else if (phase === 'TINKEROIDS_ACTION_PHASE' && specialPlayerId) {
          // 팅커로이드는 BE에서 availableActions를 별도로 받아야 하지만,
          // 현재 구조상 WS 이벤트로만 전달됨 — 최소한 다이얼로그 표시를 위해 빈 액션으로 세팅
          // (실제 선택 시 BE에서 검증하므로 안전)
          setTinkeroidsActionChoice({
            tinkeroidsPlayerId: specialPlayerId,
            availableActions: (specialData?.availableActions as string[]) ?? [],
            currentRound: stateRes.data.currentRound ?? 1,
          });
        }
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
    // 진행 중인 액션이 있으면 초기화하지 않음 (프리뷰 유지)
    if (turnState.pendingActions.length > 0 || turnState.burnPowerCount > 0 ||
        (turnState.freeConvertActions && turnState.freeConvertActions.length > 0)) return;

    const myPlayerState = playerStates.find(p => p.seatNo === mySeatNo);
    if (myPlayerState) {
      initializeTurn(myPlayerState);
    }
  }, [mySeatNo, playerStates, initializeTurn]);

  // 내 턴인지 판단 (리치 결정 대기 / 확정 중에는 모든 플레이어 행동 차단)
  const isMyTurn = useMemo(() => {
    if (!mySeatNo) return false;
    if (turnState.isConfirming) return false;
    if (leechBatch && (leechBatch.deciderIds?.length > 0 || leechBatch.currentDeciderId != null)) return false;
    if (gamePhase?.startsWith('SETUP_MINE')) return mySeatNo === nextSetupSeatNo;
    if (gamePhase === 'BOOSTER_SELECTION') return mySeatNo === boosterPickSeatNo;
    if (gamePhase === 'PLAYING') return mySeatNo === currentTurnSeatNo;
    return false;
  }, [mySeatNo, gamePhase, nextSetupSeatNo, boosterPickSeatNo, currentTurnSeatNo, leechBatch, turnState.isConfirming]);

  // 특수 페이즈 (ITARS_GAIA_PHASE / TINKEROIDS_ACTION_PHASE) 대상 플레이어 좌석
  const specialPhaseSeatNo = useMemo(() => {
    const specialPlayerId = itarsGaiaChoice?.itarsPlayerId ?? tinkeroidsActionChoice?.tinkeroidsPlayerId ?? null;
    if (!specialPlayerId) return null;
    return seats.find(s => s.playerId === specialPlayerId)?.seatNo ?? null;
  }, [itarsGaiaChoice, tinkeroidsActionChoice, seats]);

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
    if (!roomId || !playerId) return;

    // 패스 부스터 선택 후 확정
    if (selectingPassBooster && turnState.tentativeBooster) {
      await handlePassWithBooster(turnState.tentativeBooster);
      return;
    }

    if (turnState.pendingActions.length === 0) {
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
    if (hasPendingFleetShipSplit && !hasMine && !hasFleet && !hasGaiaformer) {
      setConfirmError('위치를 선택하세요.');
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
          // _BRAIN 접미사: 브레인스톤 사용
          const isBrain = code.endsWith('_BRAIN');
          const realCode = isBrain ? code.replace('_BRAIN', '') : code;
          await roomApi.freeConvert(roomId, playerId, realCode, isBrain || undefined);
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
        const factionAbilityAction = actions.find(a => a.type === 'FACTION_ABILITY');

        // QIC 아카데미 액션 (프리 액션: 턴 소모 없음)
        if (factionAbilityAction?.payload?.abilityCode === 'QIC_ACADEMY_ACTION') {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'QIC_ACADEMY_ACTION');
          if (!res.data.success) { setConfirmError(res.data.message || 'QIC 아카데미 액션 실패'); return; }

        // 하이브 우주정거장: hexQ/hexR가 payload에 있으면 API 호출
        } else if (factionAbilityAction?.payload?.abilityCode === 'IVITS_PLACE_STATION' && factionAbilityAction?.payload?.hexQ != null) {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'IVITS_PLACE_STATION',
            undefined, factionAbilityAction!.payload.hexQ, factionAbilityAction!.payload.hexR);
          if (!res.data.success) { setConfirmError(res.data.message || '우주정거장 배치 실패'); return; }

        // 파이락 다운그레이드: 연구소 좌표 + 트랙 코드로 BE 호출
        } else if (factionAbilityAction?.payload?.abilityCode === 'FIRAKS_DOWNGRADE' && factionAbilityAction.payload.hexQ != null) {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'FIRAKS_DOWNGRADE',
            factionAbilityAction.payload.trackCode, factionAbilityAction.payload.hexQ, factionAbilityAction.payload.hexR);
          if (!res.data.success) { setConfirmError(res.data.message || '파이락 다운그레이드 실패'); return; }

        // 매드안드로이드: 최저 트랙 전진 (trackCode 유무 모두 지원)
        } else if (factionAbilityAction?.payload?.abilityCode === 'BESCODS_ADVANCE_LOWEST_TRACK') {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'BESCODS_ADVANCE_LOWEST_TRACK',
            factionAbilityAction.payload.trackCode);
          if (!res.data.success) { setConfirmError(res.data.message || '매드안드로이드 능력 실패'); return; }

        // 글린 PI: 연방 토큰 획득
        } else if (factionAbilityAction?.payload?.abilityCode === 'GLEENS_FEDERATION_TOKEN') {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'GLEENS_FEDERATION_TOKEN');
          if (!res.data.success) { setConfirmError(res.data.message || '글린 연방 토큰 실패'); return; }

        // 엠바스 PI: 광산↔의회 교환
        } else if (factionAbilityAction?.payload?.abilityCode === 'AMBAS_SWAP' && factionAbilityAction.payload.hexQ != null) {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'AMBAS_SWAP',
            undefined, factionAbilityAction.payload.hexQ, factionAbilityAction.payload.hexR);
          if (!res.data.success) { setConfirmError(res.data.message || '엠바스 교환 실패'); return; }

        // 모웨이드 PI: 링 씌우기
        } else if (factionAbilityAction?.payload?.abilityCode === 'MOWEIDS_RING' && factionAbilityAction.payload.hexQ != null) {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'MOWEIDS_RING',
            undefined, factionAbilityAction.payload.hexQ, factionAbilityAction.payload.hexR);
          if (!res.data.success) { setConfirmError(res.data.message || '모웨이드 링 실패'); return; }

        // 팅커로이드: 즉시 효과 액션 사용
        } else if (factionAbilityAction?.payload?.abilityCode === 'TINKEROIDS_USE_ACTION') {
          const res = await roomApi.useFactionAbility(roomId, playerId, 'TINKEROIDS_USE_ACTION');
          if (!res.data.success) { setConfirmError(res.data.message || '팅커로이드 액션 실패'); return; }

        // 종족 능력(2삽/점프) + 후속 광산/우주선/가이아포머: 확정 시 BE 능력 선언 → 후속 행동
        } else if (factionAbilityAction && mineAction) {
          // 먼저 BE에 능력 선언
          const abilityRes = await roomApi.useFactionAbility(roomId, playerId, factionAbilityAction.payload.abilityCode);
          if (!abilityRes.data.success) { setConfirmError(abilityRes.data.message || '종족 능력 실패'); return; }
          const qicUsed = mineAction.payload.cost?.qic ?? 0;
          const gaiaformerUsed = mineAction.payload.gaiaformerUsed ?? false;
          const res = await roomApi.placeMine(roomId, playerId, mineAction.payload.hexQ, mineAction.payload.hexR, qicUsed, gaiaformerUsed, terraformDiscount);
          if (!res.data.success) { setConfirmError(res.data.message || '광산 건설 실패'); return; }

        } else if (factionAbilityAction && fleetAction) {
          const abilityRes = await roomApi.useFactionAbility(roomId, playerId, factionAbilityAction.payload.abilityCode);
          if (!abilityRes.data.success) { setConfirmError(abilityRes.data.message || '종족 능력 실패'); return; }
          const navQic = fleetAction.payload.cost?.qic ?? 0;
          const res = await fleetApi.placeFleetProbe(roomId, playerId, fleetAction.payload.fleetName, navQic);
          if (!res.data.success) { setConfirmError(res.data.message || '우주선 입장 실패'); return; }

        } else if (factionAbilityAction && gaiaformerAction) {
          const abilityRes = await roomApi.useFactionAbility(roomId, playerId, factionAbilityAction.payload.abilityCode);
          if (!abilityRes.data.success) { setConfirmError(abilityRes.data.message || '종족 능력 실패'); return; }
          const res = await roomApi.deployGaiaformer(roomId, playerId, gaiaformerAction.payload.hexQ, gaiaformerAction.payload.hexR, gaiaformerAction.payload.qicUsed);
          if (!res.data.success) { setConfirmError(res.data.message || '가이아포머 배치 실패'); return; }

        } else if (boosterActionPending && gaiaformerAction) {
          // BOOSTER_12 즉시 포밍: 부스터 사용 + 즉시 GAIA 변환
          const boosterRes = await roomApi.useBoosterAction(roomId, playerId);
          if (!boosterRes.data.success) { setConfirmError(boosterRes.data.message || '부스터 액션 실패'); return; }
          const res = await roomApi.deployGaiaformer(roomId, playerId, gaiaformerAction.payload.hexQ, gaiaformerAction.payload.hexR, gaiaformerAction.payload.qicUsed, true);
          if (!res.data.success) { setConfirmError(res.data.message || '가이아포머 배치 실패'); return; }

        } else if (boosterActionPending && mineAction) {
          const isDeferred = boosterActionPending.payload.boosterCode === 'DEFERRED_TERRAFORM_2';
          if (!isDeferred) {
            // 부스터 액션 + 광산 건설 콤보 (TERRAFORM_ONE_STEP, NAVIGATION_PLUS_3 모두)
            const boosterRes = await roomApi.useBoosterAction(roomId, playerId);
            if (!boosterRes.data.success) { setConfirmError(boosterRes.data.message || '부스터 액션 실패'); return; }
          }
          // deferred(기술타일 2삽)면 부스터 API 스킵, 광산만 건설 (BE에서 이미 터 진행 처리됨)
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

        } else if (pendingFleetShip && hasFleet && !pendingFleetShip.payload.isImmediate) {
          // 함대 선박 split 액션 (TWILIGHT_NAV) + 우주선 입장
          const fsaRes = await roomApi.fleetShipAction(roomId, playerId, pendingFleetShip.payload.actionCode);
          if (!fsaRes.data.success) { setConfirmError(fsaRes.data.message || '함대 액션 실패'); return; }
          const navQic = fleetAction!.payload.cost?.qic ?? 0;
          const res = await fleetApi.placeFleetProbe(roomId, playerId, fleetAction!.payload.fleetName, navQic);
          if (!res.data.success) { setConfirmError(res.data.message || '우주선 입장 실패'); return; }

        } else if (pendingFleetShip && hasGaiaformer && !pendingFleetShip.payload.isImmediate) {
          // 함대 선박 split 액션 (TWILIGHT_NAV) + 가이아포머 배치
          const fsaRes = await roomApi.fleetShipAction(roomId, playerId, pendingFleetShip.payload.actionCode);
          if (!fsaRes.data.success) { setConfirmError(fsaRes.data.message || '함대 액션 실패'); return; }
          const res = await roomApi.deployGaiaformer(roomId, playerId, gaiaformerAction!.payload.hexQ, gaiaformerAction!.payload.hexR, gaiaformerAction!.payload.qicUsed);
          if (!res.data.success) { setConfirmError(res.data.message || '가이아포머 배치 실패'); return; }

        } else if (powerAction && mineAction) {
          // 파워 테라포밍 액션 + 광산 건설 콤보
          const pwrRes = await roomApi.usePowerAction(roomId, playerId, powerAction.payload.powerActionCode, powerAction.payload.useBrainstone);
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
            tentativeTechTrackCode ?? undefined,
            firstAction.payload.academyType ?? undefined
          );
          if (!res.data.success) { setConfirmError(res.data.message || '건물 업그레이드 실패'); return; }

        } else if (firstAction.type === 'POWER_ACTION') {
          const code: string = firstAction.payload.powerActionCode;
          const res = await roomApi.usePowerAction(roomId, playerId, code, firstAction.payload.useBrainstone);
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
          // REBELLION_TECH / TWILIGHT_UPGRADE: tentativeTechTileCode/TrackCode에서 타일+트랙 코드 읽기
          const { tentativeTechTileCode: techTile, tentativeTechTrackCode: techTrack } = useGameStore.getState();
          const needsTile = fsa.payload.actionCode === 'REBELLION_TECH' || fsa.payload.actionCode === 'TWILIGHT_UPGRADE';
          const needsArtifact = fsa.payload.actionCode === 'TWILIGHT_ARTIFACT';
          const trackCode = needsTile
            ? techTile ?? undefined
            : needsArtifact
              ? techTile ?? (fsa.payload as any).artifactCode ?? undefined
              : fsa.payload.trackCode;
          const techTrackCode = needsTile
            ? techTrack ?? undefined
            : undefined;
          const res = await roomApi.fleetShipAction(
            roomId, playerId, fsa.payload.actionCode,
            fsa.payload.hexQ, fsa.payload.hexR, trackCode, techTrackCode
          );
          if (!res.data.success) { setConfirmError(res.data.message || '함대 액션 실패'); return; }

        } else if (firstAction.type === 'TECH_TILE_ACTION') {
          const res = await roomApi.useTechTileAction(roomId, playerId, firstAction.payload.tileCode);
          if (!res.data.success) { setConfirmError(res.data.message || '기술 타일 액션 실패'); return; }

        } else if (firstAction.type === 'FORM_FEDERATION') {
          const res = await roomApi.formFederation(roomId, playerId, firstAction.payload.tileCode, firstAction.payload.placedTokens, firstAction.payload.selectedBuildings);
          if (!res.data.success) { setConfirmError(res.data.message || '연방 형성 실패'); return; }

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

      clearPendingActions(true);  // 프리뷰 유지 (WS 이벤트로 갱신될 때까지 깜빡임 방지)
      setDeferredAction(null);    // deferred 배너 해제
      setTechRefreshKey(k => k + 1);

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
        clearPendingActions(true);  // 프리뷰 유지
        // 내 패스 순서 기록
        if (mySeatNo != null) useGameStore.getState().addPassedSeatNo(mySeatNo);
        // WebSocket 이벤트(TURN_CHANGED/ROUND_STARTED)로 갱신
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
    <div className="h-screen p-1.5 overflow-hidden">
      {/* 상단 정보 */}
      <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-700/40">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold tracking-tight text-white/90">Gaia Project</h1>
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

      {/* 메인 컨텐츠 - 3열 구조, 뷰포트에 꽉 맞춤 */}
      <div className="flex gap-1.5" style={{ height: 'calc(100vh - 36px)' }}>
        {/* 좌측: 플레이어 보드 + 확정 + 지식트랙 + 점수 */}
        <div className="w-[30%] flex flex-col gap-1 overflow-y-auto min-h-0 min-w-0 pb-4">
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
                : (gamePhase === 'ITARS_GAIA_PHASE' || gamePhase === 'TINKEROIDS_ACTION_PHASE')
                ? specialPhaseSeatNo
                : null
            }
            specialPhaseSeatNo={specialPhaseSeatNo}
            playerStates={playerStates}
            boosters={boosters}
            onClaimSeat={handleClaimSeat}
            isMyTurn={isMyTurn}
            gamePhase={gamePhase}
            onBurnPower={handleBurnPower}
            roomId={roomId}
            onFactionAbilityDone={async () => {
              if (!roomId) return;
              const playerRes = await roomApi.getPlayerStates(roomId);
              setPlayerStates(playerRes.data);
            }}
          />

          {/* 게임 시작 버튼 */}
          {status === 'READY' && seats.every((s) => s.playerId) && !gamePhase && (
            <button
              onClick={handleStartGame}
              className="bg-emerald-600/80 hover:bg-emerald-500/80 text-white py-1.5 px-3 rounded-xl transition font-semibold shadow-lg shadow-emerald-900/30 text-sm"
            >
              게임 시작
            </button>
          )}

          {/* 지식 트랙 */}
          <TechTracks
            roomId={roomId!}
            playerStates={playerStates}
            isMyTurn={isMyTurn}
            mySeatNo={mySeatNo}
            gamePhase={gamePhase}
            refreshKey={techRefreshKey}
          />

          {/* 라운드 & 최종 점수 */}
          <ScoringTracks roomId={roomId!} seats={seats} refreshKey={techRefreshKey} />
        </div>

        {/* 중앙: 맵 */}
        <div className="w-[40%] min-h-0 min-w-0 overflow-hidden pb-2 relative">
          <HexMap roomId={roomId!} playerStates={playerStates} seats={seats} />
          {/* 초기화/확정/패스 - 맵 우측 상단 오버레이 (메시지 배너 아래) */}
          <div className="absolute top-10 right-2 z-20" style={{ width: '100px' }}>
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
          </div>
        </div>

        {/* 우측: 함대 + 파워 + 연방 + 부스터 */}
        <div className="w-[30%] flex flex-col gap-1 overflow-y-auto min-h-0 min-w-0 pb-4">
          <FederationTiles
            roomId={roomId!}
            playerStates={playerStates}
            refreshKey={techRefreshKey}
          />
          <PowerActions
            roomId={roomId!}
            mySeatNo={mySeatNo}
            isMyTurn={isMyTurn}
            playerStates={playerStates}
          />
          <FederationSupply roomId={roomId!} playerId={playerId} isMyTurn={isMyTurn} refreshKey={techRefreshKey} />
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

      {/* 팅커로이드 액션 타일 선택 다이얼로그 */}
      {currentPlayerId && (
        <TinkeroidsActionChoiceDialog roomId={roomId!} myPlayerId={currentPlayerId} />
      )}

      {/* 아이타 가이아→기술타일 선택 다이얼로그 */}
      {currentPlayerId && (
        <ItarsGaiaChoiceDialog roomId={roomId!} myPlayerId={currentPlayerId} />
      )}
      {currentPlayerId && (
        <TerransGaiaDialog roomId={roomId!} myPlayerId={currentPlayerId} />
      )}
    </div>
  );
}
