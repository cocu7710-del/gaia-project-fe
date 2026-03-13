import { create } from 'zustand';
import type { GamePublicStateResponse, GameHex, GameBuilding, SeatView, PlayerStateResponse, TechTrackResponse } from '../api/client';
import type { TurnState } from '../types/turnState';
import type { GameAction, ResourceCost } from '../types/turnActions';
import { ResourceCalculator } from '../utils/resourceCalculator';

function applyFreeConvert(preview: PlayerStateResponse, code: string): PlayerStateResponse {
  switch (code) {
    case 'ORE_TO_CREDIT':    return { ...preview, ore: preview.ore - 1, credit: preview.credit + 1 };
    case 'ORE_TO_TOKEN':     return { ...preview, ore: preview.ore - 1, powerBowl1: preview.powerBowl1 + 1 };
    case 'ORE_TO_POWER3':   return { ...preview, ore: preview.ore - 1, powerBowl3: preview.powerBowl3 + 1 };
    case 'POWER_TO_CREDIT':  return { ...preview, powerBowl3: preview.powerBowl3 - 1, powerBowl1: preview.powerBowl1 + 1, credit: preview.credit + 1 };
    case 'POWER_TO_ORE':     return { ...preview, powerBowl3: preview.powerBowl3 - 3, powerBowl1: preview.powerBowl1 + 3, ore: preview.ore + 1 };
    case 'POWER_TO_KNOWLEDGE': return { ...preview, powerBowl3: preview.powerBowl3 - 4, powerBowl1: preview.powerBowl1 + 4, knowledge: preview.knowledge + 1 };
    case 'POWER_TO_QIC':     return { ...preview, powerBowl3: preview.powerBowl3 - 4, powerBowl1: preview.powerBowl1 + 4, qic: preview.qic + 1 };
    default: return preview;
  }
}

// 액션 타일별 즉시 효과 (preview 반영용)
const TECH_TILE_ACTION_PREVIEW: Record<string, { powerCharge?: number; ore?: number; knowledge?: number; qic?: number; credit?: number }> = {
  BASIC_TILE_1: { powerCharge: 4 },   // 파워 4 차징
  ADV_TILE_7:   { ore: 3 },           // 광석 3
  ADV_TILE_8:   { knowledge: 3 },     // 지식 3
  ADV_TILE_9:   { qic: 1, credit: 5 },// QIC 1 + 크레딧 5
};

const TECH_TRACK_FIELD: Record<string, keyof PlayerStateResponse> = {
  TERRA_FORMING: 'techTerraforming',
  NAVIGATION: 'techNavigation',
  AI: 'techAi',
  GAIA_FORMING: 'techGaia',
  ECONOMY: 'techEconomy',
  SCIENCE: 'techScience',
};

function calculatePreviewState(
  originalState: PlayerStateResponse | null,
  actions: GameAction[],
  burnPowerCount: number,
  freeConvertActions: string[] = [],
  tentativeTechTrackCode: string | null = null,
): PlayerStateResponse | null {
  if (!originalState) return null;
  let preview = { ...originalState };
  for (const act of actions) {
    if (act.type === 'PLACE_MINE' || act.type === 'UPGRADE_BUILDING' ||
        act.type === 'POWER_ACTION' || act.type === 'FLEET_PROBE' || act.type === 'ADVANCE_TECH' ||
        act.type === 'FLEET_SHIP_ACTION') {
      preview = ResourceCalculator.applyResourceCost(preview, act.payload.cost);
    }
    if (act.type === 'PLACE_MINE' && act.payload.gaiaformerUsed) {
      preview = { ...preview, stockGaiaformer: preview.stockGaiaformer - 1 };
    }
    if ((act.type === 'POWER_ACTION') && act.payload.gain) {
      preview = ResourceCalculator.applyResourceGain(preview, act.payload.gain);
    }
    if (act.type === 'FLEET_PROBE' && act.payload.powerCharge > 0) {
      // 파워 순환: bowl1 → bowl2 → bowl3 순서로 충전
      let remaining = act.payload.powerCharge;
      const fromBowl1 = Math.min(preview.powerBowl1, remaining);
      preview = { ...preview, powerBowl1: preview.powerBowl1 - fromBowl1, powerBowl2: preview.powerBowl2 + fromBowl1 };
      remaining -= fromBowl1;
      if (remaining > 0) {
        const fromBowl2 = Math.min(preview.powerBowl2, remaining);
        preview = { ...preview, powerBowl2: preview.powerBowl2 - fromBowl2, powerBowl3: preview.powerBowl3 + fromBowl2 };
      }
    }
    if (act.type === 'DEPLOY_GAIAFORMER') {
      // 파워를 가이아 구역으로 이동 (bowl1 ALL → bowl2 → bowl3 순서)
      let remaining = act.payload.powerSpent;
      const fromBowl1 = Math.min(preview.powerBowl1, remaining);
      preview = { ...preview, powerBowl1: preview.powerBowl1 - fromBowl1, gaiaPower: (preview.gaiaPower || 0) + fromBowl1 };
      remaining -= fromBowl1;
      if (remaining > 0) {
        const fromBowl2 = Math.min(preview.powerBowl2, remaining);
        preview = { ...preview, powerBowl2: preview.powerBowl2 - fromBowl2, gaiaPower: (preview.gaiaPower || 0) + fromBowl2 };
        remaining -= fromBowl2;
      }
      if (remaining > 0) {
        const fromBowl3 = Math.min(preview.powerBowl3, remaining);
        preview = { ...preview, powerBowl3: preview.powerBowl3 - fromBowl3, gaiaPower: (preview.gaiaPower || 0) + fromBowl3 };
      }
      preview = { ...preview, stockGaiaformer: preview.stockGaiaformer - 1 };
      if (act.payload.qicUsed > 0) {
        preview = { ...preview, qic: preview.qic - act.payload.qicUsed };
      }
    }
    if (act.type === 'ADVANCE_TECH') {
      const field = ({
        TERRA_FORMING: 'techTerraforming',
        NAVIGATION: 'techNavigation',
        AI: 'techAi',
        GAIA_FORMING: 'techGaia',
        ECONOMY: 'techEconomy',
        SCIENCE: 'techScience',
      } as Record<string, keyof typeof preview>)[act.payload.trackCode];
      if (field) preview = { ...preview, [field]: (preview[field] as number) + 1 };
    }
    if (act.type === 'TECH_TILE_ACTION') {
      const effect = TECH_TILE_ACTION_PREVIEW[act.payload.tileCode];
      if (effect) {
        if (effect.powerCharge) {
          let remaining = effect.powerCharge;
          const fromBowl1 = Math.min(preview.powerBowl1, remaining);
          preview = { ...preview, powerBowl1: preview.powerBowl1 - fromBowl1, powerBowl2: preview.powerBowl2 + fromBowl1 };
          remaining -= fromBowl1;
          if (remaining > 0) {
            const fromBowl2 = Math.min(preview.powerBowl2, remaining);
            preview = { ...preview, powerBowl2: preview.powerBowl2 - fromBowl2, powerBowl3: preview.powerBowl3 + fromBowl2 };
          }
        }
        if (effect.ore) preview = { ...preview, ore: preview.ore + effect.ore };
        if (effect.knowledge) preview = { ...preview, knowledge: preview.knowledge + effect.knowledge };
        if (effect.qic) preview = { ...preview, qic: preview.qic + effect.qic };
        if (effect.credit) preview = { ...preview, credit: preview.credit + effect.credit };
      }
    }
  }
  if (burnPowerCount > 0) {
    preview = {
      ...preview,
      powerBowl2: preview.powerBowl2 - burnPowerCount * 2,
      powerBowl3: preview.powerBowl3 + burnPowerCount,
    };
  }
  for (const code of freeConvertActions) {
    preview = applyFreeConvert(preview, code);
  }
  if (tentativeTechTrackCode) {
    const field = TECH_TRACK_FIELD[tentativeTechTrackCode];
    if (field) preview = { ...preview, [field]: (preview[field] as number) + 1 };
  }
  return preview;
}

interface GameState {
  // 방 정보
  roomId: string | null;
  roomCode: string | null;
  playerId: string | null;
  nickname: string | null;

  // 게임 상태
  status: string;
  currentRound: number | null;
  gamePhase: string | null;
  nextSetupSeatNo: number | null;
  currentTurnSeatNo: number | null;
  economyTrackOption: string | null;
  tinkeroidsExtraRingPlanet: string | null;
  moweidsExtraRingPlanet: string | null;

  // 좌석 정보
  seats: SeatView[];
  mySeatNo: number | null;

  // 맵 정보
  hexes: GameHex[];
  buildings: GameBuilding[];

  // 턴 확정 시스템
  turnState: TurnState;

  // 교역소/아카데미 건설 시 선택한 기술 타일 (확정 전 임시)
  tentativeTechTileCode: string | null;
  tentativeTechTrackCode: string | null;

  // 기술 타일 현황 (TechTracks에서 fetch 후 저장)
  techTileData: TechTrackResponse | null;

  // 이번 라운드에 사용된 파워 액션 코드
  usedPowerActionCodes: string[];

  // 함대 점유 현황: fleetName → [playerId, ...] 입장 순서
  fleetProbes: Record<string, string[]>;

  // 파워 리치 배치 상태
  leechBatch: {
    batchKey: string;
    currentLeechId: string | null;
    currentDeciderId: string | null;
    offers: Array<{
      id: string;
      receivePlayerId: string;
      receiveSeatNo: number;
      powerAmount: number;
      vpCost: number;
      isTaklons: boolean;
    }>;
  } | null;

  // 함대 선박 액션: hex/track 선택 대기 모드
  fleetShipMode: {
    actionCode: string;
    fleetName: string;
    cost: ResourceCost;
    needsGaiaformHex?: boolean;
    needsAsteroidHex?: boolean;
    needsUpgradeMineToTs?: boolean;
    needsTsToRl?: boolean;
    needsTrack?: boolean;
    needsTile?: boolean;
  } | null;

  // Actions
  setRoomInfo: (roomId: string, roomCode: string) => void;
  setPlayerInfo: (playerId: string, nickname: string) => void;
  setPublicState: (state: GamePublicStateResponse) => void;
  setHexes: (hexes: GameHex[]) => void;
  setBuildings: (buildings: GameBuilding[]) => void;
  addBuilding: (building: GameBuilding) => void;
  setMySeatNo: (seatNo: number) => void;
  reset: () => void;

  // WebSocket 실시간 동기화 액션
  updateSeatClaimed: (seatNo: number, playerId: string) => void;
  updateGameStarted: (gamePhase: string, nextSetupSeatNo: number | null) => void;
  updateMinePlaced: (hexQ: number, hexR: number, playerId: string, nextSeatNo: number | null, gamePhase: string) => void;
  setGamePhase: (gamePhase: string) => void;
  setNextSetupSeatNo: (seatNo: number | null) => void;
  setCurrentTurnSeatNo: (seatNo: number | null) => void;

  // 턴 확정 시스템 액션
  initializeTurn: (playerState: PlayerStateResponse) => void;
  addPendingAction: (action: GameAction) => void;
  clearPendingActions: () => void;
  addTentativeBuilding: (building: GameBuilding) => void;
  setTentativeBooster: (boosterCode: string | null) => void;
  updatePreviewState: () => void;
  setConfirmError: (error: string | null) => void;
  setIsConfirming: (value: boolean) => void;
  setUsedPowerActionCodes: (codes: string[]) => void;
  incrementBurnPower: () => void;
  addFreeConvert: (code: string) => void;
  setFleetProbes: (probes: Record<string, string[]>) => void;
  setFleetShipMode: (mode: GameState['fleetShipMode']) => void;
  clearFleetShipMode: () => void;

  setTentativeTechTile: (tileCode: string | null, trackCode: string | null) => void;
  setTechTileData: (data: TechTrackResponse | null) => void;

  // 파워 리치 배치 액션
  setLeechBatch: (batch: GameState['leechBatch']) => void;
  updateLeechDecided: (decidedLeechId: string, nextLeechId: string | null, nextDeciderId: string | null) => void;
  clearLeechBatch: () => void;
}

const initialState = {
  roomId: null,
  roomCode: null,
  playerId: null,
  nickname: null,
  status: 'READY',
  currentRound: null,
  gamePhase: null,
  nextSetupSeatNo: null,
  currentTurnSeatNo: null,
  economyTrackOption: null,
  tinkeroidsExtraRingPlanet: null,
  moweidsExtraRingPlanet: null,
  seats: [],
  mySeatNo: null,
  hexes: [],
  buildings: [],
  techTileData: null,
  usedPowerActionCodes: [],
  fleetProbes: {},
  fleetShipMode: null,
  leechBatch: null,
  tentativeTechTileCode: null,
  tentativeTechTrackCode: null,
  turnState: {
    originalPlayerState: null,
    pendingActions: [],
    previewPlayerState: null,
    tentativeBuildings: [],
    tentativeBooster: null,
    burnPowerCount: 0,
    isConfirming: false,
    confirmError: null
  }
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setRoomInfo: (roomId, roomCode) => set({ roomId, roomCode }),

  setPlayerInfo: (playerId, nickname) => set({ playerId, nickname }),

  setPublicState: (state) =>
    set({
      status: state.status,
      currentRound: state.currentRound,
      gamePhase: state.gamePhase,
      nextSetupSeatNo: state.nextSetupSeatNo,
      currentTurnSeatNo: state.currentTurnSeatNo,
      economyTrackOption: state.economyTrackOption,
      tinkeroidsExtraRingPlanet: state.tinkeroidsExtraRingPlanet ?? null,
      moweidsExtraRingPlanet: state.moweidsExtraRingPlanet ?? null,
      seats: state.seats,
    }),

  setHexes: (hexes) => set({ hexes }),

  setBuildings: (buildings) => set({ buildings }),

  addBuilding: (building) =>
    set((state) => ({ buildings: [...state.buildings, building] })),

  setMySeatNo: (seatNo) => set({ mySeatNo: seatNo }),

  reset: () => set(initialState),

  // WebSocket 실시간 동기화 액션
  updateSeatClaimed: (seatNo, playerId) =>
    set((state) => ({
      seats: state.seats.map((seat) =>
        seat.seatNo === seatNo ? { ...seat, playerId } : seat
      ),
    })),

  updateGameStarted: (gamePhase, nextSetupSeatNo) =>
    set({
      status: 'IN_PROGRESS',
      gamePhase,
      nextSetupSeatNo,
    }),

  updateMinePlaced: (hexQ, hexR, playerId, nextSeatNo, gamePhase) =>
    set((state) => ({
      buildings: [
        ...state.buildings,
        {
          id: `temp-${Date.now()}`,
          gameId: state.roomId || '',
          playerId,
          hexQ,
          hexR,
          buildingType: 'MINE',
        },
      ],
      nextSetupSeatNo: nextSeatNo,
      gamePhase,
    })),

  setGamePhase: (gamePhase) => set({ gamePhase }),

  setNextSetupSeatNo: (seatNo) => set({ nextSetupSeatNo: seatNo }),

  setCurrentTurnSeatNo: (seatNo) => set({ currentTurnSeatNo: seatNo }),

  // 턴 확정 시스템 액션
  initializeTurn: (playerState: PlayerStateResponse) =>
    set({
      turnState: {
        originalPlayerState: { ...playerState },
        pendingActions: [],
        previewPlayerState: { ...playerState },
        tentativeBuildings: [],
        tentativeBooster: null,
        burnPowerCount: 0,
        freeConvertActions: [],
        isConfirming: false,
        confirmError: null,
      },
    }),

  addPendingAction: (action: GameAction) =>
    set((state) => {
      const newActions = [...state.turnState.pendingActions, action];
      return {
        turnState: {
          ...state.turnState,
          pendingActions: newActions,
          previewPlayerState: calculatePreviewState(state.turnState.originalPlayerState, newActions, state.turnState.burnPowerCount, state.turnState.freeConvertActions),
        },
      };
    }),

  clearPendingActions: () =>
    set((state) => ({
      fleetShipMode: null,
      tentativeTechTileCode: null,
      tentativeTechTrackCode: null,
      turnState: {
        ...state.turnState,
        pendingActions: [],
        previewPlayerState: state.turnState.originalPlayerState
          ? { ...state.turnState.originalPlayerState }
          : null,
        tentativeBuildings: [],
        tentativeBooster: null,
        burnPowerCount: 0,
        freeConvertActions: [],
        confirmError: null,
      },
    })),

  addTentativeBuilding: (building: GameBuilding) =>
    set((state) => ({
      turnState: {
        ...state.turnState,
        tentativeBuildings: [...state.turnState.tentativeBuildings, building],
      },
    })),

  setTentativeBooster: (boosterCode: string | null) =>
    set((state) => ({
      turnState: { ...state.turnState, tentativeBooster: boosterCode },
    })),

  updatePreviewState: () =>
    set((state) => ({
      turnState: {
        ...state.turnState,
        previewPlayerState: calculatePreviewState(
          state.turnState.originalPlayerState,
          state.turnState.pendingActions,
          state.turnState.burnPowerCount,
          state.turnState.freeConvertActions,
        ),
      },
    })),

  incrementBurnPower: () =>
    set((state) => {
      const current = state.turnState.previewPlayerState ?? state.turnState.originalPlayerState;
      if (!current || current.powerBowl2 < 2) return state;
      const newCount = state.turnState.burnPowerCount + 1;
      return {
        turnState: {
          ...state.turnState,
          burnPowerCount: newCount,
          previewPlayerState: calculatePreviewState(
            state.turnState.originalPlayerState,
            state.turnState.pendingActions,
            newCount,
            state.turnState.freeConvertActions,
          ),
        },
      };
    }),

  addFreeConvert: (code: string) =>
    set((state) => {
      const newCodes = [...(state.turnState.freeConvertActions ?? []), code];
      return {
        turnState: {
          ...state.turnState,
          freeConvertActions: newCodes,
          previewPlayerState: calculatePreviewState(
            state.turnState.originalPlayerState,
            state.turnState.pendingActions,
            state.turnState.burnPowerCount,
            newCodes,
          ),
        },
      };
    }),

  setConfirmError: (error: string | null) =>
    set((state) => ({
      turnState: { ...state.turnState, confirmError: error },
    })),

  setIsConfirming: (value: boolean) =>
    set((state) => ({
      turnState: { ...state.turnState, isConfirming: value },
    })),

  setUsedPowerActionCodes: (codes: string[]) => set({ usedPowerActionCodes: codes }),

  setFleetProbes: (probes: Record<string, string[]>) => set({ fleetProbes: probes }),

  setFleetShipMode: (mode) => set({ fleetShipMode: mode }),

  clearFleetShipMode: () => set({ fleetShipMode: null }),

  setTechTileData: (data) => set({ techTileData: data }),

  setTentativeTechTile: (tileCode, trackCode) =>
    set((state) => ({
      tentativeTechTileCode: tileCode,
      tentativeTechTrackCode: trackCode,
      turnState: {
        ...state.turnState,
        previewPlayerState: calculatePreviewState(
          state.turnState.originalPlayerState,
          state.turnState.pendingActions,
          state.turnState.burnPowerCount,
          state.turnState.freeConvertActions,
          trackCode,
        ),
      },
    })),

  setLeechBatch: (batch) => set({ leechBatch: batch }),

  updateLeechDecided: (decidedLeechId, nextLeechId, nextDeciderId) =>
    set((state) => {
      if (!state.leechBatch) return state;
      if (nextLeechId === null) return { leechBatch: null };
      return {
        leechBatch: {
          ...state.leechBatch,
          currentLeechId: nextLeechId,
          currentDeciderId: nextDeciderId,
        },
      };
    }),

  clearLeechBatch: () => set({ leechBatch: null }),
}));
