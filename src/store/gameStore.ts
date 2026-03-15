import { create } from 'zustand';
import type { GamePublicStateResponse, GameHex, GameBuilding, SeatView, PlayerStateResponse, TechTrackResponse } from '../api/client';
import type { TurnState } from '../types/turnState';
import type { GameAction, ResourceCost } from '../types/turnActions';
import { ResourceCalculator } from '../utils/resourceCalculator';

/** 연방 토큰 배치용: 파워 토큰 1개 영구 제거 (bowl1→bowl2→bowl3 순) */
function removePowerTokenPreview(ps: PlayerStateResponse): PlayerStateResponse {
  if (ps.powerBowl1 > 0) return { ...ps, powerBowl1: ps.powerBowl1 - 1 };
  if (ps.powerBowl2 > 0) return { ...ps, powerBowl2: ps.powerBowl2 - 1 };
  return { ...ps, powerBowl3: ps.powerBowl3 - 1 };
}

/** 파워 순환 프리뷰 (bowl1→bowl2→bowl3) */
function applyPowerCharge(p: PlayerStateResponse, amount: number): PlayerStateResponse {
  let rem = amount;
  const fb1 = Math.min(p.powerBowl1, rem);
  p = { ...p, powerBowl1: p.powerBowl1 - fb1, powerBowl2: p.powerBowl2 + fb1 };
  rem -= fb1;
  if (rem > 0) {
    const fb2 = Math.min(p.powerBowl2, rem);
    p = { ...p, powerBowl2: p.powerBowl2 - fb2, powerBowl3: p.powerBowl3 + fb2 };
  }
  return p;
}

/** 공용: 트랙 1칸 전진 프리뷰 (레벨 +1 + 즉시 보상) */
function applyTrackAdvance(preview: PlayerStateResponse, trackCode: string): PlayerStateResponse {
  const field = TECH_TRACK_FIELD[trackCode];
  if (!field) return preview;
  const currentLevel = (preview[field] as number) ?? 0;
  const newLevel = currentLevel + 1;
  let p = { ...preview, [field]: newLevel };

  // 모든 트랙 공통: 2→3 진입 시 파워 3 순환
  if (currentLevel === 2) p = applyPowerCharge(p, 3);

  // 트랙별 즉시 보상
  switch (trackCode) {
    case 'TERRA_FORMING':
      if (newLevel === 1 || newLevel === 4) p = { ...p, ore: p.ore + 2 };
      break;
    case 'NAVIGATION':
      if (newLevel === 1 || newLevel === 3) p = { ...p, qic: p.qic + 1 };
      break;
    case 'AI':
      p = { ...p, qic: p.qic + (newLevel <= 2 ? 1 : 2) };
      break;
    case 'GAIA_FORMING':
      if (newLevel === 1 || newLevel === 3 || newLevel === 4) p = { ...p, stockGaiaformer: (p.stockGaiaformer ?? 0) + 1 };
      else if (newLevel === 2) p = { ...p, powerBowl1: p.powerBowl1 + 3 }; // 파워 토큰 +3
      break;
    case 'ECONOMY':
      if (newLevel === 1) { p = { ...p, credit: p.credit + 2 }; p = applyPowerCharge(p, 1); }
      else if (newLevel === 2) { p = { ...p, ore: p.ore + 1, credit: p.credit + 2 }; p = applyPowerCharge(p, 2); }
      else if (newLevel === 3) { p = { ...p, ore: p.ore + 1, credit: p.credit + 3 }; } // 옵션 A 기본
      else if (newLevel === 4) { p = { ...p, ore: p.ore + 2, credit: p.credit + 4 }; }
      break;
    // SCIENCE: 수입은 라운드 수입 단계에서 처리 (즉시 보상 없음)
  }
  return p;
}

function applyFreeConvert(preview: PlayerStateResponse, code: string): PlayerStateResponse {
  switch (code) {
    case 'ORE_TO_CREDIT':    return { ...preview, ore: preview.ore - 1, credit: preview.credit + 1 };
    case 'ORE_TO_TOKEN':     return { ...preview, ore: preview.ore - 1, powerBowl1: preview.powerBowl1 + 1 };
    case 'ORE_TO_POWER3':   return { ...preview, ore: preview.ore - 1, powerBowl3: preview.powerBowl3 + 1 };
    case 'POWER_TO_CREDIT':  return { ...preview, powerBowl3: preview.powerBowl3 - 1, powerBowl1: preview.powerBowl1 + 1, credit: preview.credit + 1 };
    case 'POWER_TO_ORE':     return { ...preview, powerBowl3: preview.powerBowl3 - 3, powerBowl1: preview.powerBowl1 + 3, ore: preview.ore + 1 };
    case 'POWER_TO_KNOWLEDGE': return { ...preview, powerBowl3: preview.powerBowl3 - 4, powerBowl1: preview.powerBowl1 + 4, knowledge: preview.knowledge + 1 };
    case 'POWER_TO_QIC':     return { ...preview, powerBowl3: preview.powerBowl3 - 4, powerBowl1: preview.powerBowl1 + 4, qic: preview.qic + 1 };
    case 'KNOWLEDGE_TO_CREDIT': return { ...preview, knowledge: preview.knowledge - 1, credit: preview.credit + 1 };
    case 'QIC_TO_ORE': return { ...preview, qic: preview.qic - 1, ore: preview.ore + 1 };
    case 'BAL_TAKS_CONVERT_GAIAFORMER': return { ...preview, stockGaiaformer: preview.stockGaiaformer - 1, qic: preview.qic + 1 };
    case 'HADSCH_HALLAS_3C_ORE': return { ...preview, credit: preview.credit - 3, ore: preview.ore + 1 };
    case 'HADSCH_HALLAS_4C_KNOWLEDGE': return { ...preview, credit: preview.credit - 4, knowledge: preview.knowledge + 1 };
    case 'HADSCH_HALLAS_4C_QIC': return { ...preview, credit: preview.credit - 4, qic: preview.qic + 1 };
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
    if (act.type === 'PLACE_MINE') {
      preview = { ...preview, stockMine: Math.max(0, preview.stockMine - 1) };
      // 원시행성 VP +6
      if (act.payload.vpBonus) preview = { ...preview, victoryPoints: preview.victoryPoints + act.payload.vpBonus };
      // 란티다 PI: 기생 광산 시 지식 +2
      if (preview.factionCode === 'LANTIDS' && preview.stockPlanetaryInstitute === 0 && act.payload.isLantidsMine) {
        preview = { ...preview, knowledge: preview.knowledge + 2 };
      }
      // 기오덴 PI: 새 행성 개척 시 지식 +3
      if (preview.factionCode === 'GEODENS' && preview.stockPlanetaryInstitute === 0 && act.payload.isNewPlanet) {
        preview = { ...preview, knowledge: preview.knowledge + 3 };
      }
    }
    if (act.type === 'UPGRADE_BUILDING') {
      // 재고 변경 프리뷰
      const toType = act.payload.toType;
      if (toType === 'TRADING_STATION') preview = { ...preview, stockTradingStation: Math.max(0, preview.stockTradingStation - 1), stockMine: preview.stockMine + 1 };
      else if (toType === 'RESEARCH_LAB') preview = { ...preview, stockResearchLab: Math.max(0, preview.stockResearchLab - 1), stockTradingStation: preview.stockTradingStation + 1 };
      else if (toType === 'PLANETARY_INSTITUTE') preview = { ...preview, stockPlanetaryInstitute: Math.max(0, preview.stockPlanetaryInstitute - 1), stockTradingStation: preview.stockTradingStation + 1 };
      else if (toType === 'ACADEMY') preview = { ...preview, stockAcademy: Math.max(0, preview.stockAcademy - 1), stockResearchLab: preview.stockResearchLab + 1 };
    }
    if ((act.type === 'POWER_ACTION') && act.payload.gain) {
      preview = ResourceCalculator.applyResourceGain(preview, act.payload.gain);
    }
    if (act.type === 'ADVANCE_TECH') {
      preview = applyTrackAdvance(preview, act.payload.trackCode);
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
    const isItars = preview.factionCode === 'ITARS';
    preview = {
      ...preview,
      powerBowl2: preview.powerBowl2 - burnPowerCount * 2,
      powerBowl3: preview.powerBowl3 + burnPowerCount,  // 모든 종족: 1개는 3구역
      ...(isItars ? { gaiaPower: (preview.gaiaPower || 0) + burnPowerCount } : {}), // 아이타: 추가 1개 가이아
    };
  }
  for (const code of freeConvertActions) {
    preview = applyFreeConvert(preview, code);
  }
  if (tentativeTechTrackCode) {
    preview = applyTrackAdvance(preview, tentativeTechTrackCode);
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

  // 파워 리치 배치 상태 (동시 결정)
  leechBatch: {
    batchKey: string;
    currentLeechId: string | null;      // 하위호환용 (deprecated)
    currentDeciderId: string | null;    // 하위호환용 (deprecated)
    deciderIds: string[];               // 동시 결정 대상 플레이어 ID 목록
    offers: Array<{
      id: string;
      receivePlayerId: string;
      receiveSeatNo: number;
      powerAmount: number;
      vpCost: number;
      isTaklons: boolean;
    }>;
  } | null;

  // 연방 그룹 데이터 (건물/토큰 위치)
  federationGroups: Array<{ playerId: string; tileCode: string; buildingHexes: number[][]; tokenHexes: number[][] }>;

  // 팅커로이드 액션 타일 선택 (라운드 시작 시)
  tinkeroidsActionChoice: {
    tinkeroidsPlayerId: string;
    availableActions: string[];
    currentRound: number;
  } | null;

  // 아이타 가이아→기술타일 선택 (라운드 종료 시)
  itarsGaiaChoice: {
    itarsPlayerId: string;
    availableChoices: number;
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

  // 연방 형성 모드
  federationMode: {
    selectedBuildings: number[][]; // [q,r] 배열 (내 건물 선택)
    placedTokens: number[][];     // [q,r] 배열
    phase: 'SELECT_BUILDINGS' | 'PLACE_TOKENS' | 'SELECT_TILE';
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

  // 연방 모드 액션
  setFederationMode: (mode: GameState['federationMode']) => void;
  addFederationBuilding: (q: number, r: number) => void;
  removeFederationBuilding: (q: number, r: number) => void;
  addFederationToken: (q: number, r: number) => void;
  removeFederationToken: (q: number, r: number) => void;
  setFederationPhase: (phase: 'SELECT_BUILDINGS' | 'PLACE_TOKENS' | 'SELECT_TILE') => void;

  setTentativeTechTile: (tileCode: string | null, trackCode: string | null) => void;
  setTechTileData: (data: TechTrackResponse | null) => void;

  // 파워 리치 배치 액션
  setLeechBatch: (batch: GameState['leechBatch']) => void;
  updateLeechDecided: (decidedLeechId: string, nextLeechId: string | null, nextDeciderId: string | null) => void;
  clearLeechBatch: () => void;

  // 팅커로이드 액션 선택
  setTinkeroidsActionChoice: (data: GameState['tinkeroidsActionChoice']) => void;

  // 아이타 가이아 선택
  setItarsGaiaChoice: (data: GameState['itarsGaiaChoice']) => void;

  // 연방 그룹
  setFederationGroups: (groups: GameState['federationGroups']) => void;
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
  federationMode: null,
  leechBatch: null,
  federationGroups: [],
  tinkeroidsActionChoice: null,
  itarsGaiaChoice: null,
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
      federationMode: null,
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

  // 연방 모드
  setFederationMode: (mode) => set({ federationMode: mode }),
  addFederationBuilding: (q, r) => set((state) => {
    if (!state.federationMode) return state;
    return { federationMode: { ...state.federationMode, selectedBuildings: [...state.federationMode.selectedBuildings, [q, r]] } };
  }),
  removeFederationBuilding: (q, r) => set((state) => {
    if (!state.federationMode) return state;
    return { federationMode: { ...state.federationMode, selectedBuildings: state.federationMode.selectedBuildings.filter(h => h[0] !== q || h[1] !== r) } };
  }),
  addFederationToken: (q, r) => set((state) => {
    if (!state.federationMode || !state.turnState.previewPlayerState) return state;
    const preview = state.turnState.previewPlayerState;
    const isIvits = preview.factionCode === 'IVITS';
    // 자원 부족 시 배치 불가
    if (isIvits) {
      if (preview.qic <= 0) return state;
    } else {
      const total = preview.powerBowl1 + preview.powerBowl2 + preview.powerBowl3;
      if (total <= 0) return state;
    }
    // 프리뷰에서 자원 차감
    const newPreview = isIvits
      ? { ...preview, qic: preview.qic - 1 }
      : removePowerTokenPreview(preview);
    return {
      federationMode: { ...state.federationMode, placedTokens: [...state.federationMode.placedTokens, [q, r]] },
      turnState: { ...state.turnState, previewPlayerState: newPreview },
    };
  }),
  removeFederationToken: (q, r) => set((state) => {
    if (!state.federationMode || !state.turnState.originalPlayerState) return state;
    const isIvits = state.turnState.originalPlayerState.factionCode === 'IVITS';
    const newTokens = state.federationMode.placedTokens.filter(h => h[0] !== q || h[1] !== r);
    // 원본에서 재계산: 남은 토큰 수만큼 차감
    let newPreview = { ...state.turnState.originalPlayerState };
    // 기존 pending/burn/freeConvert도 반영
    newPreview = calculatePreviewState(
      state.turnState.originalPlayerState,
      state.turnState.pendingActions,
      state.turnState.burnPowerCount,
      state.turnState.freeConvertActions ?? [],
    ) ?? newPreview;
    // 남은 토큰 수만큼 파워/QIC 차감
    for (let i = 0; i < newTokens.length; i++) {
      if (isIvits) {
        newPreview = { ...newPreview, qic: newPreview.qic - 1 };
      } else {
        newPreview = removePowerTokenPreview(newPreview);
      }
    }
    return {
      federationMode: { ...state.federationMode, placedTokens: newTokens },
      turnState: { ...state.turnState, previewPlayerState: newPreview },
    };
  }),
  setFederationPhase: (phase) => set((state) => {
    if (!state.federationMode) return state;
    return { federationMode: { ...state.federationMode, phase } };
  }),

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

  updateLeechDecided: (decidedLeechId, _nextLeechId, _nextDeciderId) =>
    set((state) => {
      if (!state.leechBatch) return state;
      // 결정된 offer의 플레이어를 deciderIds에서 제거
      const decidedOffer = state.leechBatch.offers.find(o => o.id === decidedLeechId);
      const decidedPlayerId = decidedOffer?.receivePlayerId;
      const newDeciderIds = state.leechBatch.deciderIds.filter(id => id !== decidedPlayerId);
      const newOffers = state.leechBatch.offers.filter(o => o.id !== decidedLeechId);
      if (newDeciderIds.length === 0) {
        return { leechBatch: null };
      }
      return {
        leechBatch: {
          ...state.leechBatch,
          deciderIds: newDeciderIds,
          offers: newOffers,
          currentDeciderId: newDeciderIds[0] ?? null,
          currentLeechId: newOffers[0]?.id ?? null,
        },
      };
    }),

  clearLeechBatch: () => set({ leechBatch: null }),

  setTinkeroidsActionChoice: (data) => set({ tinkeroidsActionChoice: data }),

  setItarsGaiaChoice: (data) => set({ itarsGaiaChoice: data }),

  setFederationGroups: (groups) => set({ federationGroups: groups }),
}));
