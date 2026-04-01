import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { roomApi, mapApi, buildingApi, fleetApi } from '../api/client';
import type { BoosterOfferResponse, PlayerStateResponse } from '../api/client';
import { PowerLeechDialog } from '../components/PowerLeechDialog';
import { PowerIncomeDialog } from '../components/PowerIncomeDialog';
import BiddingDialog from '../components/BiddingDialog';
import { ItarsGaiaChoiceDialog } from '../components/ItarsGaiaChoiceDialog';
import { TerransGaiaDialog } from '../components/TerransGaiaDialog';
import { TinkeroidsActionChoiceDialog } from '../components/TinkeroidsActionChoiceDialog';
import { getTerraformDiscount } from '../utils/terraformingCalculator';
import { analyzePending } from '../actions/pendingAnalyzer';
import { buildConfirmPlan, executeConfirmPlan } from '../actions/confirmExecutor';
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
import CommonAdvTile from '../components/CommonAdvTile';
import CoverTileSelector from '../components/CoverTileSelector';
import GameResultPanel from '../components/GameResultPanel';
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
  const [showGameResult, setShowGameResult] = useState(false);

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
            try {
              const partRes = await roomApi.getParticipants(roomId);
              useGameStore.getState().setParticipantCount(partRes.data.participants.length);
            } catch {}
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
            // 부스터 선택 완료 후 팅커로이드 액션 선택 단계 복원
            if (stateRes.data.gamePhase === 'TINKEROIDS_ACTION_PHASE'
                && stateRes.data.pendingSpecialPlayerId
                && stateRes.data.pendingSpecialData) {
              setTinkeroidsActionChoice({
                tinkeroidsPlayerId: stateRes.data.pendingSpecialPlayerId,
                availableActions: stateRes.data.pendingSpecialData.availableActions as string[],
                currentRound: stateRes.data.pendingSpecialData.currentRound as number,
              });
            }
          }
          break;

        case 'GAME_STARTED':
          updateGameStarted(
            event.payload.gamePhase as string,
            event.payload.nextSetupSeatNo as number | null
          );
          await loadBoosters();
          // 맵 회전이 반영된 최신 hex 데이터 로드
          if (roomId) {
            const hexResStart = await mapApi.getHexes(roomId);
            setHexes(hexResStart.data);
          }
          break;

        case 'MAP_ROTATED':
          // 다른 플레이어의 맵 회전을 실시간 반영
          if (roomId) {
            const hexResRotated = await mapApi.getHexes(roomId);
            setHexes(hexResRotated.data);
          }
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
          setDeferredAction(null); // 턴 변경 시 deferred 배너 해제
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
            await loadBoosters();
            try { const fedRes = await roomApi.getFederationGroups(roomId); setFederationGroups(fedRes.data); } catch {}
          }
          break;

        case 'PLAYER_PASSED':
          if (roomId) {
            const allPassedFlag = event.payload.allPassed as boolean;
            // BE에서 최신 상태 로드 (passedSeatNos 포함)
            const [stateResPass2, playerRes5] = await Promise.all([
              roomApi.getPublicState(roomId),
              roomApi.getPlayerStates(roomId),
            ]);
            setPublicState(stateResPass2.data);
            setPlayerStates(playerRes5.data);
            await loadBoosters();
            if (allPassedFlag) {
              // 라운드 종료 시 전체 상태는 이미 위에서 갱신됨
            }
          }
          break;

        case 'GAME_FINISHED':
          if (roomId) {
            const [stateResFin, playerResFin] = await Promise.all([
              roomApi.getPublicState(roomId),
              roomApi.getPlayerStates(roomId),
            ]);
            setPublicState(stateResFin.data);
            setPlayerStates(playerResFin.data);
            setShowGameResult(true);
          }
          break;

        case 'ACTION_LOGGED': {
          const entry = event.payload.entry as any;
          if (entry) useGameStore.getState().appendActionLog(entry);
          break;
        }

        case 'BIDDING_STARTED':
        case 'BID_UPDATED': {
          const bidPayload = event.payload as any;
          useGameStore.getState().setBiddingState(bidPayload);
          if (bidPayload.gamePhase) {
            useGameStore.getState().setGamePhase(bidPayload.gamePhase);
          }
          break;
        }
        case 'BID_WON': {
          if (roomId) {
            const bidRes = await roomApi.getBiddingState(roomId);
            useGameStore.getState().setBiddingState(bidRes.data as any);
            if (bidRes.data.gamePhase) {
              useGameStore.getState().setGamePhase(bidRes.data.gamePhase);
            }
          }
          break;
        }
        case 'BID_SEAT_PICKED': {
          if (roomId) {
            const [seatRes, bidRes2] = await Promise.all([
              roomApi.getPublicState(roomId),
              roomApi.getBiddingState(roomId),
            ]);
            setPublicState(seatRes.data);
            useGameStore.getState().setBiddingState(bidRes2.data as any);
            if (bidRes2.data.gamePhase) {
              useGameStore.getState().setGamePhase(bidRes2.data.gamePhase);
            }
            // 내 좌석 감지
            const myPid = playerId || urlPlayerId;
            if (myPid) {
              const mySeat = seatRes.data.seats.find((s: any) => s.playerId === myPid);
              if (mySeat) setMySeatNo(mySeat.seatNo);
            }
          }
          break;
        }
        case 'BIDDING_COMPLETED': {
          useGameStore.getState().setBiddingState(null);
          if (roomId) {
            const pubRes = await roomApi.getPublicState(roomId);
            setPublicState(pubRes.data);
            const psRes = await roomApi.getPlayerStates(roomId);
            setPlayerStates(psRes.data);
            // 내 좌석 감지
            const myPid2 = playerId || urlPlayerId;
            if (myPid2) {
              const mySeat2 = pubRes.data.seats.find((s: any) => s.playerId === myPid2);
              if (mySeat2) setMySeatNo(mySeat2.seatNo);
            }
          }
          break;
        }

        case 'POWER_INCOME_CHOICE': {
          const piPayload = event.payload;
          useGameStore.getState().setPowerIncomeChoice({
            players: piPayload.players as any[],
          });
          if (roomId) {
            const prPi = await roomApi.getPlayerStates(roomId);
            setPlayerStates(prPi.data);
          }
          break;
        }

        case 'POWER_INCOME_COMPLETED': {
          const completedPid = event.payload.completedPlayerId as string;
          const currentChoice = useGameStore.getState().powerIncomeChoice;
          if (currentChoice) {
            const remaining = currentChoice.players.filter(p => p.playerId !== completedPid);
            if (remaining.length === 0) {
              useGameStore.getState().setPowerIncomeChoice(null);
            } else {
              useGameStore.getState().setPowerIncomeChoice({ players: remaining });
            }
          }
          if (roomId) {
            const prPic = await roomApi.getPlayerStates(roomId);
            setPlayerStates(prPic.data);
          }
          break;
        }

        case 'ROUND_STARTED':
          useGameStore.getState().appendActionLog({
            actionId: `round-${Date.now()}`, playerId: '', seatNo: 0, factionCode: '',
            roundNumber: (event.payload.roundNumber as number) ?? 0,
            actionType: 'ROUND_STARTED', actionData: {},
          });
          useGameStore.getState().setPowerIncomeChoice(null);
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
            setTechRefreshKey(k => k + 1);
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
          // 플레이어 상태 + 건물 갱신 (방금 지은 광산 반영)
          if (roomId) {
            const [prLeech, buildLeech] = await Promise.all([
              roomApi.getPlayerStates(roomId),
              buildingApi.getBuildings(roomId),
            ]);
            setPlayerStates(prLeech.data);
            setBuildings(buildLeech.data);
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
          if (deferredPayload.actionType === 'PLACE_MINE_TERRAFORM_3'
              && deferredPayload.triggerPlayerId === (playerId || urlPlayerId)) {
            setDeferredAction({ type: 'PLACE_MINE_TERRAFORM_3', terraformDiscount: 3 });
            // 3삽 할인 pending 추가 → HexMap에서 광산 건설 모드 활성화
            clearPendingActions();
            addPendingAction({
              id: `deferred-tf3-${Date.now()}`,
              type: 'BOOSTER_ACTION',
              timestamp: Date.now(),
              payload: { boosterCode: 'DEFERRED_TERRAFORM_3', actionType: 'TERRAFORM_THREE_STEP', terraformDiscount: 3, navBonus: 0 },
            });
          }
          if (deferredPayload.actionType === 'PLACE_MINE_NO_RANGE'
              && deferredPayload.triggerPlayerId === (playerId || urlPlayerId)) {
            setDeferredAction({ type: 'PLACE_MINE_NO_RANGE', terraformDiscount: 0 });
            clearPendingActions();
            addPendingAction({
              id: `deferred-norange-${Date.now()}`,
              type: 'BOOSTER_ACTION',
              timestamp: Date.now(),
              payload: { boosterCode: 'DEFERRED_NO_RANGE', actionType: 'PLACE_MINE_NO_RANGE', terraformDiscount: 0, navBonus: 99 },
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
            // 팅커로이드 액션 선택 단계 복원
            if (stateRes2.data.gamePhase === 'TINKEROIDS_ACTION_PHASE'
                && stateRes2.data.pendingSpecialPlayerId
                && stateRes2.data.pendingSpecialData) {
              setTinkeroidsActionChoice({
                tinkeroidsPlayerId: stateRes2.data.pendingSpecialPlayerId,
                availableActions: stateRes2.data.pendingSpecialData.availableActions as string[],
                currentRound: stateRes2.data.pendingSpecialData.currentRound as number,
              });
            }
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

  // URL에서 playerId 검증 및 복원 (playerId 없으면 관전 모드)
  const isSpectator = !urlPlayerId && !playerId;
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

        // 7-0. 참가자 수 로드
        try {
          const partRes = await roomApi.getParticipants(roomId);
          useGameStore.getState().setParticipantCount(partRes.data.participants.length);
        } catch {}

        // 7-1. 비딩 상태 복원
        if (phase === 'BIDDING' || phase === 'BID_SEAT_PICK') {
          try {
            const bidRes = await roomApi.getBiddingState(roomId);
            useGameStore.getState().setBiddingState(bidRes.data as any);
          } catch {}
        }

        // 8-0. 액션 로그 로드
        try {
          const logRes = await roomApi.getActionLog(roomId);
          useGameStore.getState().setActionLogs(logRes.data ?? []);
        } catch {}

        // 8-1. 파워 수입 복원 (POWER_INCOME_PHASE)
        if (phase === 'POWER_INCOME_PHASE') {
          try {
            const allPs = playerRes.data;
            const piPlayers: { playerId: string; items: any[] }[] = [];
            for (const ps of allPs) {
              if (!ps.playerId) continue;
              const itemsRes = await roomApi.getPowerIncomeItems(roomId, ps.playerId);
              if (itemsRes.data && itemsRes.data.length > 0) {
                piPlayers.push({ playerId: ps.playerId, items: itemsRes.data });
              }
            }
            if (piPlayers.length > 0) {
              useGameStore.getState().setPowerIncomeChoice({ players: piPlayers });
            }
          } catch {}
        }

        // 8. 파워 리치 복원 (재접속 시 pending 리치가 있으면 복원)
        try {
          const leechRes = await roomApi.getPendingLeeches(roomId);
          if (leechRes.data && leechRes.data.length > 0) {
            const pendingOffers = leechRes.data.filter(o => o.status === 'PENDING');
            if (pendingOffers.length > 0) {
              const deciderIds = pendingOffers.map(o => o.receivePlayerId);
              setLeechBatch({
                batchKey: `restore-${Date.now()}`,
                currentLeechId: pendingOffers[0].id,
                currentDeciderId: deciderIds[0],
                deciderIds,
                offers: pendingOffers,
              });
            }
          }
        } catch {}
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
    // pendingAnalyzer로 확정 가능 여부 체크
    const { tentativeTechTileCode: confirmTechTile, tentativeTechTrackCode: confirmTechTrack, fleetShipMode: confirmFleetShipMode } = useGameStore.getState();
    const confirmAnalysis = analyzePending(turnState.pendingActions, confirmFleetShipMode, confirmTechTile, gamePhase, confirmTechTrack);
    if (!confirmAnalysis.canConfirm) {
      setConfirmError(confirmAnalysis.needsFollowUp ? '위치를 선택하세요.' : '조건을 충족하세요.');
      return;
    }

    setIsConfirming(true);
    setConfirmError(null);

    try {
      // store에서 최신 상태 직접 읽기 (stale closure 방지)
      const latestTurnState = useGameStore.getState().turnState;

      // 파워 소각 먼저 처리 (자유 행동)
      if (latestTurnState.burnPowerCount > 0) {
        for (let i = 0; i < latestTurnState.burnPowerCount; i++) {
          await roomApi.burnPower(roomId, playerId);
        }
      }

      const freeConverts = latestTurnState.freeConvertActions ?? [];
      const sendFreeConverts = async (afterMain: boolean) => {
        for (const fc of freeConverts) {
          if (fc.afterMain !== afterMain) continue;
          const isBrain = fc.code.endsWith('_BRAIN');
          const realCode = isBrain ? fc.code.replace('_BRAIN', '') : fc.code;
          await roomApi.freeConvert(roomId, playerId, realCode, isBrain || undefined);
        }
      };

      // 메인 전 프리 액션
      await sendFreeConverts(false);

      if (gamePhase === 'PLAYING') {
        const plan = buildConfirmPlan(roomId, playerId, latestTurnState.pendingActions);
        const result = await executeConfirmPlan(plan);
        if (!result.success) { setConfirmError(result.error || '액션 확정 실패'); return; }

        // 메인 후 프리 액션
        await sendFreeConverts(true);

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
      // deferred 배너는 WS 이벤트로 새로 설정될 수 있으므로 여기서 해제하지 않음
      setTechRefreshKey(k => k + 1);
      // 상태 갱신 (사용한 액션 코드 + 플레이어 상태)
      if (roomId) {
        const [refreshRes] = await Promise.all([
          roomApi.getPlayerStates(roomId),
          loadUsedPowerActions(),
        ]);
        setPlayerStates(refreshRes.data);
      }

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

  // 턴 패스 핸들러 (PLAYING 페이즈) - 6라운드는 바로 종료, 그 외는 부스터 선택
  // 프리 액션/파워 소각은 유지하고 메인 액션만 정리
  const handlePassTurn = () => {
    useGameStore.setState((state) => ({
      fleetShipMode: null,
      federationMode: null,
      tentativeTechTileCode: null,
      tentativeTechTrackCode: null,
      tentativeCoverTileCode: null,
      turnState: {
        ...state.turnState,
        pendingActions: [],
        tentativeBuildings: [],
        tentativeBooster: null,
        confirmError: null,
        // freeConvertActions, burnPowerCount, previewPlayerState 유지
      },
    }));
    if (useGameStore.getState().currentRound === 6) {
      handlePassWithBooster(null);
    } else {
      setSelectingPassBooster(true);
    }
  };

  // 부스터 선택 후 패스 확정 (6라운드는 boosterCode=null)
  const handlePassWithBooster = async (boosterCode: string | null) => {
    if (!roomId || !playerId) return;

    setIsConfirming(true);
    setConfirmError(null);

    try {
      // 파워 소각 먼저 처리
      if (turnState.burnPowerCount > 0) {
        for (let i = 0; i < turnState.burnPowerCount; i++) {
          await roomApi.burnPower(roomId, playerId);
        }
      }
      // 프리 액션 자원 변환 처리 (패스는 메인 액션 없으므로 전부 실행)
      if (turnState.freeConvertActions && turnState.freeConvertActions.length > 0) {
        for (const fc of turnState.freeConvertActions) {
          const isBrain = fc.code.endsWith('_BRAIN');
          const realCode = isBrain ? fc.code.replace('_BRAIN', '') : fc.code;
          await roomApi.freeConvert(roomId, playerId, realCode, isBrain || undefined);
        }
      }
      const res = await roomApi.passRound(roomId, playerId, boosterCode);
      if (res.data.success) {
        setSelectingPassBooster(false);
        clearPendingActions(true);
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
      {/* 게임 결과창 */}
      {showGameResult && roomId && (
        <GameResultPanel roomId={roomId} onClose={() => setShowGameResult(false)} />
      )}
      {/* 상단 정보 */}
      <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-700/40">
        <div className="flex items-center gap-2">
          <h1
            className="text-sm font-bold tracking-tight text-white/90 cursor-pointer hover:text-emerald-300 transition"
            onClick={() => window.location.href = '/'}
          >Gaia Project</h1>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{isSpectator ? <span className="text-yellow-400 font-bold">관전 모드</span> : nickname}</span>
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
        <div className="w-[25%] flex flex-col gap-1 overflow-y-auto min-h-0 min-w-0 pb-4">
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

          {/* 게임 시작은 비딩 완료 후 자동 진행 */}

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

          {/* 라운드 & 최종 점수 */}
          <ScoringTracks roomId={roomId!} seats={seats} refreshKey={techRefreshKey} />
        </div>

        {/* 중앙: 맵 */}
        <div className="w-[48%] min-h-0 min-w-0 pb-2 relative">
          <div className="w-full h-full overflow-hidden">
            <HexMap roomId={roomId!} playerStates={playerStates} seats={seats} onResultClick={() => setShowGameResult(prev => !prev)} />
          </div>
          {/* 확정/초기화/패스 - 맵 우상단 오버레이 */}
          <div className="absolute top-0 right-0 z-20" style={{ width: '15%', minWidth: 80 }}>
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
            {/* 고급 타일 커버 선택: 개인판에서 직접 선택 */}
            {/* COMMON 고급 기술 타일 */}
            <CommonAdvTile
              roomId={roomId!}
              playerStates={playerStates}
              isMyTurn={isMyTurn}
              mySeatNo={mySeatNo}
            />
          </div>
        </div>

        {/* 우측: 함대 + 파워 + 연방 + 부스터 */}
        <div className="w-[27%] flex flex-col gap-1 overflow-y-auto min-h-0 min-w-0 pb-4">
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
          {/* 지식 트랙 */}
          <TechTracks
            roomId={roomId!}
            playerStates={playerStates}
            isMyTurn={isMyTurn}
            mySeatNo={mySeatNo}
            gamePhase={gamePhase}
            refreshKey={techRefreshKey}
          />
          <FederationSupply roomId={roomId!} playerId={playerId} isMyTurn={isMyTurn} refreshKey={techRefreshKey} />

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

      {deferredAction?.type === 'PLACE_MINE_NO_RANGE' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-blue-900/90 backdrop-blur-sm border border-blue-500/40 text-blue-100 px-6 py-2.5 rounded-xl z-40 text-sm flex items-center gap-2 shadow-lg shadow-blue-900/20">
          <span>연방 타일: 거리 제한 없이 광산을 배치할 위치를 선택하세요.</span>
          <button
            onClick={() => setDeferredAction(null)}
            className="text-blue-300 hover:text-white text-xs ml-2"
          >
            취소
          </button>
        </div>
      )}

      {deferredAction?.type === 'PLACE_MINE_TERRAFORM_3' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-900/90 backdrop-blur-sm border border-emerald-500/40 text-emerald-100 px-6 py-2.5 rounded-xl z-40 text-sm flex items-center gap-2 shadow-lg shadow-emerald-900/20">
          <span>연방 타일: 테라포밍 3단계 할인 적용 — 광산을 배치할 위치를 선택하세요.</span>
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

      {/* 비딩 다이얼로그 */}
      {currentPlayerId && (
        <BiddingDialog roomId={roomId!} myPlayerId={currentPlayerId} seats={seats} />
      )}

      {/* 파워 수입 순서 선택 다이얼로그 */}
      {currentPlayerId && (
        <PowerIncomeDialog roomId={roomId!} myPlayerId={currentPlayerId} />
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
