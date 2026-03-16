export type GameActionType =
  | 'PLACE_MINE'
  | 'UPGRADE_BUILDING'
  | 'SELECT_BOOSTER'
  | 'PASS_TURN'
  | 'POWER_ACTION'
  | 'FLEET_PROBE'
  | 'ADVANCE_TECH'
  | 'BOOSTER_ACTION'
  | 'DEPLOY_GAIAFORMER'
  | 'FLEET_SHIP_ACTION'
  | 'TECH_TILE_ACTION'
  | 'FACTION_ABILITY'
  | 'FORM_FEDERATION';

export interface ResourceCost {
  credit?: number;
  ore?: number;
  knowledge?: number;
  qic?: number;
  power?: number;
  vp?: number;
  powerToken?: number; // 파워 토큰 추가 (bowl1에 직접 추가)
}

export interface GameAction {
  id: string;
  type: GameActionType;
  payload: any;
  timestamp: number;
}

export interface PlaceMineAction extends GameAction {
  type: 'PLACE_MINE';
  payload: {
    hexQ: number;
    hexR: number;
    cost: ResourceCost;
    gaiaformerUsed?: boolean; // 소행성 비홈 건설 시 가이아포머 제거
    vpBonus?: number;         // 원시행성 건설 시 +6VP
    isNewSector?: boolean;    // 다카니안 PI: 새 섹터 광산 건설 시 +2c+1k
  };
}

export interface UpgradeBuildingAction extends GameAction {
  type: 'UPGRADE_BUILDING';
  payload: {
    hexQ: number;
    hexR: number;
    fromType: string;
    toType: string;
    cost: ResourceCost;
    leech?: { playerId: string; seatNo: number; power: number; vpCost: number }[];
  };
}

export interface SelectBoosterAction extends GameAction {
  type: 'SELECT_BOOSTER';
  payload: {
    boosterCode: string;
  };
}

export interface PassTurnAction extends GameAction {
  type: 'PASS_TURN';
  payload: Record<string, never>;
}

export interface PowerAction extends GameAction {
  type: 'POWER_ACTION';
  payload: {
    powerActionCode: string;
    cost: ResourceCost;
    gain: ResourceCost;   // 즉시 획득 자원 (preview 반영용)
    description: string;
  };
}

export interface FleetProbeAction extends GameAction {
  type: 'FLEET_PROBE';
  payload: {
    fleetName: string;
    cost: ResourceCost;
    powerCharge: number; // 2번째/3번째 입장: 2, 4번째 입장: 3, 첫 번째: 0
  };
}

export interface AdvanceTechAction extends GameAction {
  type: 'ADVANCE_TECH';
  payload: {
    trackCode: string;
    cost: ResourceCost;
  };
}

export interface DeployGaiaformerAction extends GameAction {
  type: 'DEPLOY_GAIAFORMER';
  payload: {
    hexQ: number;
    hexR: number;
    powerSpent: number; // 가이아 구역으로 이동한 파워 수
    qicUsed: number;
  };
}

export interface FleetShipAction extends GameAction {
  type: 'FLEET_SHIP_ACTION';
  payload: {
    fleetName: string;        // TF_MARS | ECLIPSE | REBELLION | TWILIGHT
    actionCode: string;       // e.g. TF_MARS_VP, TF_MARS_TERRAFORM, etc.
    cost: ResourceCost;
    isImmediate: boolean;     // true: 단독 API 호출로 턴 종료 / false: 후속 액션 필요
    // 후속 액션용 힌트
    terraformDiscount?: number;  // TF_MARS_TERRAFORM: 1
    navBonus?: number;           // TWILIGHT_NAV: 3
    // hex-in-fleet 액션용 좌표 (선택 후 채워짐)
    hexQ?: number;
    hexR?: number;
    // track-in-fleet 액션용 트랙 코드
    trackCode?: string;
    // hex-in-fleet 모드 플래그
    needsGaiaformHex?: boolean;  // TF_MARS_GAIAFORM: TRANSDIM 헥스 선택
    needsAsteroidHex?: boolean;  // ECLIPSE_MINE: ASTEROIDS 헥스 선택
    needsUpgradeMineToTs?: boolean; // REBELLION_UPGRADE: 내 광산 선택
    needsTsToRl?: boolean;       // TWILIGHT_UPGRADE: 내 교역소 선택
    needsTrack?: boolean;        // ECLIPSE_TECH, REBELLION_TECH: 트랙 선택
  };
}

export interface BoosterAction extends GameAction {
  type: 'BOOSTER_ACTION';
  payload: {
    boosterCode: string;
    actionType: string; // TERRAFORM_ONE_STEP | PLACE_GAIAFORMER | NAVIGATION_PLUS_3
    terraformDiscount: number; // 1 for TERRAFORM_ONE_STEP, 0 otherwise
    navBonus: number;          // 3 for NAVIGATION_PLUS_3, 0 otherwise
  };
}

export interface TechTileActionAction extends GameAction {
  type: 'TECH_TILE_ACTION';
  payload: {
    tileCode: string;
    description: string;
  };
}

export interface FactionAbilityAction extends GameAction {
  type: 'FACTION_ABILITY';
  payload: {
    abilityCode: string;
    terraformDiscount?: number;  // SPACE_GIANTS_TERRAFORM_2: 2
    navBonus?: number;           // GLEENS_JUMP: 2
  };
}

export interface FormFederationAction extends GameAction {
  type: 'FORM_FEDERATION';
  payload: {
    tileCode: string;
    placedTokens: number[][];
    selectedBuildings: number[][];
  };
}
