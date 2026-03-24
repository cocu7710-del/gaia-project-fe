import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 방 관련 API
export const roomApi = {
  // 방 생성
  createRoom: (title: string) =>
    apiClient.post<CreateRoomResponse>('/api/rooms', { title }),

  // 방 코드로 roomId 조회
  getRoomByCode: (roomCode: string) =>
    apiClient.get<RoomLookupResponse>(`/api/rooms/code/${roomCode}`),

  // 방 입장
  enterRoom: (roomId: string, nickname: string, rejoinToken?: string) =>
    apiClient.post<EnterGameResponse>(`/api/rooms/${roomId}/enter`, { nickname, rejoinToken }),

  // 방 공개 상태 조회
  getPublicState: (roomId: string) =>
    apiClient.get<GamePublicStateResponse>(`/api/rooms/${roomId}/public-state`),

  // 참가자 목록 조회
  getParticipants: (roomId: string) =>
    apiClient.get<ParticipantListResponse>(`/api/rooms/${roomId}/participants`),

  // 참가자 검증 (재입장 시)
  verifyParticipant: (roomId: string, playerId: string) =>
    apiClient.get<VerifyParticipantResponse>(`/api/rooms/${roomId}/participants/${playerId}/verify`),

  // 좌석 선택
  claimSeat: (roomId: string, seatNo: number, playerId: string) =>
    apiClient.post<ClaimSeatResponse>(`/api/rooms/${roomId}/seats/${seatNo}/claim?playerId=${playerId}`),

  // 부스터 목록 조회
  getBoosters: (roomId: string) =>
    apiClient.get<BoosterOfferResponse[]>(`/api/round/${roomId}/booster`),

  // 부스터 선택
  selectBooster: (roomId: string, playerId: string, boosterCode: string) =>
    apiClient.post<SelectBoosterResponse>(`/api/rooms/${roomId}/boosters/select`, { playerId, boosterCode }),

  // 게임 시작
  startGame: (roomId: string) =>
    apiClient.post<StartGameResponse>(`/api/rooms/${roomId}/start`),

  // 플레이어 상태 조회
  getPlayerStates: (roomId: string) =>
    apiClient.get<PlayerStateResponse[]>(`/api/rooms/${roomId}/players`),

  // 건물 업그레이드 (PLAYING 페이즈)
  upgradeBuilding: (roomId: string, playerId: string, hexQ: number, hexR: number,
                    targetBuildingType: string, techTileCode?: string, techTrackCode?: string, academyType?: string) =>
    apiClient.post<UpgradeBuildingResponse>(`/api/rooms/${roomId}/actions/upgrade`, {
      playerId,
      hexQ,
      hexR,
      targetBuildingType,
      techTileCode: techTileCode || null,
      techTrackCode: techTrackCode || null,
      academyType: academyType || null,
    }),

  // PLAYING 페이즈 광산 건설
  placeMine: (roomId: string, playerId: string, hexQ: number, hexR: number, qicUsed = 0, gaiaformerUsed = false, terraformDiscount = 0) =>
    apiClient.post<PlaceMinePlayResponse>(`/api/rooms/${roomId}/actions/mine`, {
      playerId,
      hexQ,
      hexR,
      qicUsed,
      gaiaformerUsed,
      terraformDiscount,
    }),

  placeLostPlanet: (roomId: string, playerId: string, hexQ: number, hexR: number) =>
    apiClient.post<PlaceMinePlayResponse>(`/api/rooms/${roomId}/actions/lost-planet`, {
      playerId,
      hexQ,
      hexR,
    }),

  // 가이아 포머 배치 (차원변형 행성)
  deployGaiaformer: (roomId: string, playerId: string, hexQ: number, hexR: number, qicUsed = 0, isInstant = false) =>
    apiClient.post<{ success: boolean; message: string; hexQ: number; hexR: number; nextTurnSeatNo: number }>(
      `/api/rooms/${roomId}/actions/deploy-gaiaformer`,
      { playerId, hexQ, hexR, qicUsed, isInstant },
    ),

  // 부스터 액션 사용 (라운드당 1회)
  useBoosterAction: (roomId: string, playerId: string) =>
    apiClient.post<{ success: boolean; actionType: string; message?: string }>(
      `/api/round/${roomId}/booster/action`,
      { playerId },
    ),

  // 지식 트랙 전진 (지식 4 소모)
  advanceTechTrack: (roomId: string, playerId: string, trackCode: string) =>
    apiClient.post<AdvanceTechResponse>(`/api/rooms/${roomId}/actions/tech-advance`, { playerId, trackCode }),

  // 파워 액션 사용
  usePowerAction: (roomId: string, playerId: string, powerActionCode: string, useBrainstone?: boolean) =>
    apiClient.post<UsePowerActionResponse>(`/api/rooms/${roomId}/actions/power`, {
      playerId,
      powerActionCode,
      useBrainstone: useBrainstone ?? null,
    }),

  // 현재 라운드에서 사용된 파워 액션 코드 목록 조회
  getUsedPowerActions: (roomId: string) =>
    apiClient.get<string[]>(`/api/rooms/${roomId}/actions/power/used`),

  // 파워 소각 (bowl2 -2, bowl3 +1, 자유 행동)
  burnPower: (roomId: string, playerId: string) =>
    apiClient.post(`/api/rooms/${roomId}/actions/burn-power`, { playerId }),

  // 라운드 패스 (다음 라운드 부스터 선택 포함)
  passRound: (roomId: string, playerId: string, nextRoundBoosterCode: string) =>
    apiClient.post<PassRoundResponse>(`/api/rooms/${roomId}/pass`, { playerId, nextRoundBoosterCode }),

  // 액션 확정 및 턴 넘김
  confirmAction: (roomId: string, playerId: string, actionType: string, actionData: string) =>
    apiClient.post<ConfirmActionResponse>(`/api/rooms/${roomId}/actions/save`, {
      actionId: null,
      playerId,
      actionType,
      actionData,
    }),

  // 기술 타일 액션 사용 (라운드당 1회)
  useTechTileAction: (roomId: string, playerId: string, tileCode: string) =>
    apiClient.post<ConfirmActionResponse>(`/api/rooms/${roomId}/actions/tech-tile-action`, { playerId, tileCode }),

  // 종족 고유 능력 사용
  useFactionAbility: (roomId: string, playerId: string, abilityCode: string, trackCode?: string, hexQ?: number, hexR?: number) =>
    apiClient.post<{ gameId: string; success: boolean; message: string | null; abilityCode: string; nextTurnSeatNo: number | null }>(
      `/api/rooms/${roomId}/actions/faction-ability`,
      { playerId, abilityCode, trackCode, hexQ, hexR }
    ),

  // 프리 액션: 자원 변환 (턴 소모 없음)
  freeConvert: (roomId: string, playerId: string, convertCode: string, useBrainstone?: boolean) =>
    apiClient.post<{ success: boolean; message: string | null }>(
      `/api/rooms/${roomId}/actions/free-convert`,
      { playerId, convertCode, useBrainstone: useBrainstone ?? null }
    ),

  // 기술 트랙 및 타일 조회
  getTechTracks: (roomId: string) =>
    apiClient.get<TechTrackResponse>(`/api/rooms/${roomId}/tech`),

  // 라운드 & 최종 점수 타일 조회
  getScoringTiles: (roomId: string) =>
    apiClient.get<ScoringTilesResponse>(`/api/rooms/${roomId}/scoring`),

  // 함대 선박 특수 액션
  fleetShipAction: (roomId: string, playerId: string, actionCode: string,
                    hexQ?: number, hexR?: number, trackCode?: string, techTrackCode?: string) =>
    apiClient.post<FleetShipActionResponse>(`/api/rooms/${roomId}/actions/fleet-ship`, {
      playerId, actionCode, hexQ, hexR, trackCode, techTrackCode,
    }),

  // 연방 타일 조회
  getFederationTiles: (roomId: string) =>
    apiClient.get<FederationTilesResponse>(`/api/rooms/${roomId}/federation`),

  // 연방 건물 선택 검증
  validateFederationBuildings: (roomId: string, playerId: string, buildingHexes: number[][]) =>
    apiClient.post<{ success: boolean; message?: string; totalPower?: number; minTokens?: number; groups?: number }>(
      `/api/rooms/${roomId}/federation/validate-buildings`,
      { playerId, buildingHexes, tokenHexes: [] }
    ),

  // 연방 배치 조건 체크
  validateFederation: (roomId: string, playerId: string, tokenHexes: number[][], buildingHexes: number[][] = []) =>
    apiClient.post<{ gameId: string; success: boolean; message?: string }>(
      `/api/rooms/${roomId}/federation/validate`,
      { playerId, buildingHexes, tokenHexes }
    ),

  // 연방 형성 (타일 선택 후 확정)
  formFederation: (roomId: string, playerId: string, federationTileCode: string, tokenHexes: number[][], buildingHexes: number[][] = []) =>
    apiClient.post<{ gameId: string; success: boolean; message?: string; federationTileCode?: string; nextTurnSeatNo?: number }>(
      `/api/rooms/${roomId}/federation/form`,
      { playerId, federationTileCode, buildingHexes, tokenHexes }
    ),

  // 연방 그룹 목록 조회
  getFederationGroups: (roomId: string) =>
    apiClient.get<Array<{ playerId: string; tileCode: string; buildingHexes: number[][]; tokenHexes: number[][] }>>(
      `/api/rooms/${roomId}/federation/groups`
    ),

  // 파워 리치 결정 (수락/거절)
  decideLeech: (roomId: string, leechId: string, playerId: string, accept: boolean, taklonsChoice?: string) =>
    apiClient.post<{ success: boolean; message?: string }>(
      `/api/rooms/${roomId}/leech/${leechId}/decide`,
      { playerId, accept, taklonsChoice: taklonsChoice ?? null }
    ),

  // 현재 대기 중인 리치 오퍼 조회 (페이지 복구용)
  getPendingLeeches: (roomId: string) =>
    apiClient.get<LeechOffer[]>(`/api/rooms/${roomId}/leech/pending`),

  // 팅커로이드 라운드 시작 액션 타일 선택
  tinkeroidsActionChoice: (roomId: string, playerId: string, actionCode: string) =>
    apiClient.post<{ gameId: string; success: boolean; message?: string }>(
      `/api/rooms/${roomId}/actions/tinkeroids-action-choice`,
      { playerId, actionCode }
    ),

  // 아이타 라운드 종료 가이아→기술타일 선택
  itarsGaiaChoice: (roomId: string, playerId: string, action: 'TAKE_TILE' | 'SKIP',
                    tileCode?: string, techTrackCode?: string) =>
    apiClient.post<{ gameId: string; success: boolean; message?: string; abilityCode?: string }>(
      `/api/rooms/${roomId}/actions/itars-gaia-choice`,
      { playerId, action, tileCode, techTrackCode }
    ),
  // 테란 가이아→자원 수동 변환
  terransGaiaConvert: (roomId: string, playerId: string, credits: number, ores: number, qics: number, knowledges: number) =>
    apiClient.post<{ success: boolean; message?: string }>(
      `/api/rooms/${roomId}/actions/terrans-gaia-convert`,
      { playerId, credits, ores, qics, knowledges },
    ),
};

// 맵 관련 API
export const mapApi = {
  // 전체 헥스 조회
  getHexes: (roomId: string) =>
    apiClient.get<GameHex[]>(`/api/rooms/${roomId}/map/hexes`),

  // 섹터 60도 회전 (캐릭터 선택 전에만 가능)
  rotateSector: (roomId: string, positionNo: number) =>
    apiClient.post<GameHex[]>(`/api/rooms/${roomId}/map/sectors/${positionNo}/rotate`),
};

// 건물 관련 API
export const buildingApi = {
  // 초기 광산 배치
  placeInitialMine: (roomId: string, playerId: string, hexQ: number, hexR: number) =>
    apiClient.post<PlaceInitialMineResponse>(`/api/rooms/${roomId}/buildings/mine/initial`, {
      playerId,
      hexQ,
      hexR,
    }),

  // 건물 목록 조회
  getBuildings: (roomId: string) =>
    apiClient.get<GameBuilding[]>(`/api/rooms/${roomId}/buildings`),
};

// 함대 관련 API
export const fleetApi = {
  placeFleetProbe: (roomId: string, playerId: string, fleetName: string, qicUsed = 0) =>
    apiClient.post<FleetProbeResponse>(`/api/rooms/${roomId}/actions/fleet-probe`, { playerId, fleetName, qicUsed }),

  getFleetOccupancy: (roomId: string) =>
    apiClient.get<FleetOccupancyResponse>(`/api/rooms/${roomId}/fleet/occupancy`),
};

// 타입 정의
interface RoomLookupResponse {
  found: boolean;
  roomId?: string;
  message?: string;
}

interface CreateRoomResponse {
  roomId: string;
  title: string;
  roomCode: string;
  status: string;
  factions: string[];
}

interface EnterGameResponse {
  gameId: string;
  playerId: string | null;
  success: boolean;
  spectator: boolean;
  rejoinToken: string | null;
  message: string | null;
}

interface GamePublicStateResponse {
  roomId: string;
  status: string;
  currentRound: number | null;
  economyTrackOption: string | null;
  gamePhase: string | null;
  nextSetupSeatNo: number | null;
  currentTurnSeatNo: number | null;
  tinkeroidsExtraRingPlanet: string | null;
  moweidsExtraRingPlanet: string | null;
  pendingSpecialPlayerId: string | null;
  pendingSpecialData: Record<string, unknown> | null;
  seats: SeatView[];
}

interface SeatView {
  seatNo: number;
  turnOrder: number;
  raceCode: string;
  raceNameKo: string;
  homePlanetType: string;
  playerId: string | null;
  nickname: string | null;
}

interface ParticipantListResponse {
  roomId: string;
  totalCount: number;
  participants: ParticipantView[];
}

interface ParticipantView {
  playerId: string;
  nickname: string;
  claimedSeatNo: number | null;
  factionName: string | null;
  enteredAt: string;
}

interface ClaimSeatResponse {
  roomId: string;
  success: boolean;
  message: string | null;
  publicState: GamePublicStateResponse | null;
}

interface SelectBoosterResponse {
  roomId: string;
  success: boolean;
  message: string | null;
  nextPickSeatNo: number;
}

interface BoosterOfferResponse {
  id: string;
  boosterCode: string;
  position: number;
  pickedBySeatNo: number | null;
}

interface FleetProbeResponse {
  gameId: string;
  playerId: string;
  success: boolean;
  message: string | null;
  fleetName: string | null;
  unlockedActions: string[];
  nextTurnSeatNo: number | null;
}

interface UpgradeBuildingResponse {
  gameId: string;
  success: boolean;
  message: string | null;
  hexQ: number;
  hexR: number;
  fromBuildingType: string | null;
  toBuildingType: string | null;
  nextTurnSeatNo: number | null;
}

interface PlaceMinePlayResponse {
  gameId: string;
  success: boolean;
  message: string | null;
  hexQ: number;
  hexR: number;
  nextTurnSeatNo: number | null;
}

interface AdvanceTechResponse {
  gameId: string;
  success: boolean;
  message: string | null;
  trackCode: string | null;
  newLevel: number;
  nextTurnSeatNo: number | null;
}

interface UsePowerActionResponse {
  gameId: string;
  success: boolean;
  message: string | null;
  powerActionCode: string;
  nextTurnSeatNo: number | null;
}

interface PassRoundResponse {
  gameId: string;
  playerId: string;
  success: boolean;
  message: string | null;
  roundNumber: number | null;
  nextTurnSeatNo: number | null;
  allPassed: boolean;
}

interface ConfirmActionResponse {
  gameId: string;
  actionId: string | null;
  success: boolean;
  message: string | null;
  nextTurnSeatNo: number | null;
  roundEnded: boolean;
}

interface StartGameResponse {
  gameId: string;
  success: boolean;
  message: string | null;
  currentRound: number | null;
  currentTurnSeatNo: number | null;
  gamePhase: string | null;
  nextSetupSeatNo: number | null;
}

interface GameHex {
  gameId: string;
  hexQ: number;
  hexR: number;
  planetType: string;
  sectorId: string;
  positionNo: number;
}

interface GameBuilding {
  id: string;
  gameId: string;
  playerId: string;
  hexQ: number;
  hexR: number;
  buildingType: string;
  isLantidsMine?: boolean;
  hasRing?: boolean;
}

interface PlaceInitialMineResponse {
  gameId: string;
  buildingId: string;
  hexQ: number;
  hexR: number;
  seatNo: number;
  remainingMines: number;
  isSetupComplete: boolean;
  nextSeatNo: number | null;
  gamePhase: string;
  buildingType: string;
}

interface VerifyParticipantResponse {
  roomId: string;
  playerId: string;
  valid: boolean;
  nickname: string | null;
  seatNo: number | null;
  factionName: string | null;
  message: string | null;
}

interface PlayerStateResponse {
  playerId: string;
  seatNo: number;
  factionCode: string | null;
  credit: number;
  ore: number;
  knowledge: number;
  qic: number;
  powerBowl1: number;
  powerBowl2: number;
  powerBowl3: number;
  victoryPoints: number;
  stockMine: number;
  stockTradingStation: number;
  stockResearchLab: number;
  stockPlanetaryInstitute: number;
  stockAcademy: number;
  stockGaiaformer: number;
  gaiaPower: number;
  brainstoneBowl: number | null;
  techTerraforming: number;
  techNavigation: number;
  techAi: number;
  techGaia: number;
  techEconomy: number;
  techScience: number;
  boosterActionUsed: boolean;
  factionAbilityUsed: boolean;
  baltaksConvertedGaiaformers: number;
  permanentlyRemovedGaiaformers: number;
  hasQicAcademy: boolean;
  qicAcademyActionUsed: boolean;
}

interface TechTrackResponse {
  tracks: TechTrackInfo[];
  basicTiles: TechTileInfo[];
  advancedTiles: AdvancedTechTileInfo[];
}

interface TechTrackInfo {
  trackCode: string;
  trackNameKo: string;
  position: number;
  levels: TrackLevelInfo[];
}

interface TrackLevelInfo {
  level: number;
  description: string;
  hasFederationToken: boolean;
}

interface TechTileInfo {
  tileCode: string;
  trackCode: string;
  position: number;
  abilityType: string;
  description: string;
  isTaken: boolean;
  takenByPlayerId: string | null;
  isActionUsed: boolean;
  ownerPlayerIds: string[];
}

interface AdvancedTechTileInfo {
  tileCode: string;
  trackCode: string;
  position: number;
  abilityType: string;
  description: string;
  isTaken: boolean;
  takenByPlayerId: string | null;
  isActionUsed: boolean;
}

interface ScoringTilesResponse {
  roundScorings: RoundScoringInfo[];
  finalScorings: FinalScoringInfo[];
}

interface RoundScoringInfo {
  roundNumber: number;
  tileCode: string;
  description: string;
}

interface FinalScoringInfo {
  position: number;
  tileCode: string;
  description: string;
  playerProgress?: Record<string, number>;  // playerId → 달성 개수
}

interface FederationTilesResponse {
  generalSupply: FederationTileInfo[];
  terraformingTrackTile: FederationTileInfo | null;
  forgottenFleet: FederationTileInfo[];
  artifacts?: ArtifactInfo[]; // 트와일라잇 인공물 4개
}

interface FederationTileInfo {
  tileCode: string;
  description: string;
  quantity: number;
  position: number | null;
}

interface ArtifactInfo {
  artifactCode: string;
  description: string;
  position: number; // 1-4
  isTaken: boolean;
  acquiredByPlayerId: string | null;
}

interface FleetShipActionResponse {
  gameId: string;
  success: boolean;
  message: string | null;
  actionCode: string;
  gainedVP: number;
  nextTurnSeatNo: number | null;
  turnEnded: boolean;
}

interface FleetOccupancyResponse {
  gameId: string;
  probesByFleet: Record<string, string[]>; // fleetName → [playerId, ...] in entry order
}

export interface LeechOffer {
  id: string;
  receivePlayerId: string;
  receiveSeatNo: number;
  powerAmount: number;
  vpCost: number;
  isTaklons: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'AUTO_ACCEPTED';
}

export type {
  FleetOccupancyResponse,
  CreateRoomResponse,
  AdvanceTechResponse,
  EnterGameResponse,
  GamePublicStateResponse,
  UpgradeBuildingResponse,
  PlaceMinePlayResponse,
  UsePowerActionResponse,
  PassRoundResponse,
  ConfirmActionResponse,
  SeatView,
  ParticipantListResponse,
  ParticipantView,
  ClaimSeatResponse,
  SelectBoosterResponse,
  StartGameResponse,
  GameHex,
  GameBuilding,
  PlaceInitialMineResponse,
  VerifyParticipantResponse,
  BoosterOfferResponse,
  PlayerStateResponse,
  TechTrackResponse,
  TechTrackInfo,
  TrackLevelInfo,
  TechTileInfo,
  AdvancedTechTileInfo,
  ScoringTilesResponse,
  RoundScoringInfo,
  FinalScoringInfo,
  FederationTilesResponse,
  FederationTileInfo,
  ArtifactInfo,
  FleetShipActionResponse,
};
