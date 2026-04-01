/**
 * 액션 레지스트리
 *
 * 파워 액션, 함대 선박 액션, 부스터 액션의 정의를 단일 소스로 통합.
 * 각 컴포넌트는 이 레지스트리를 참조하여 비용, 라벨, 후속 행동 종류를 결정.
 */

import type { ResourceCost } from '../types/turnActions';

// ============================================================
// 파워 액션
// ============================================================

export interface PowerActionDef {
  code: string;
  cost: number; // bowl3 파워 소모량
  description: string;
  gain: ResourceCost;
  /** 테라포밍 후속 행동 (PWR_TERRAFORM: 1, PWR_TERRAFORM_2: 2) */
  terraformDiscount?: number;
  /** 파워 액션 보드 상 좌측 위치 (%) */
  left: number;
}

export const POWER_ACTION_DEFS: PowerActionDef[] = [
  { code: 'PWR_KNOWLEDGE',   cost: 7, left: 10.5, description: '지식 +3',       gain: { knowledge: 3 } },
  { code: 'PWR_TERRAFORM_2', cost: 5, left: 23,   description: '테라포밍 2단계', gain: {}, terraformDiscount: 2 },
  { code: 'PWR_ORE',         cost: 4, left: 36,   description: '광석 +2',       gain: { ore: 2 } },
  { code: 'PWR_CREDIT',      cost: 4, left: 49,   description: '크레딧 +7',     gain: { credit: 7 } },
  { code: 'PWR_KNOWLEDGE_2', cost: 4, left: 62,   description: '지식 +2',       gain: { knowledge: 2 } },
  { code: 'PWR_TERRAFORM',   cost: 3, left: 75,   description: '테라포밍 1단계', gain: {}, terraformDiscount: 1 },
  { code: 'PWR_TOKEN',       cost: 3, left: 88,   description: '파워토큰 +2',    gain: { powerToken: 2 } },
];

export const POWER_ACTION_MAP = Object.fromEntries(POWER_ACTION_DEFS.map(d => [d.code, d]));

// ============================================================
// 함대 선박 액션
// ============================================================

export type FleetHexType = 'GAIAFORM' | 'ASTEROID_MINE' | 'UPGRADE_MINE_TO_TS' | 'UPGRADE_TS_TO_RL' | null;

export interface FleetShipActionDef {
  actionCode: string;
  fleetName: string;
  label: string;
  cost: ResourceCost;
  description: string;
  /** true: 단독 API로 턴 종료 / false: 후속 행동 필요 (split) */
  isImmediate: boolean;
  /** 후속 테라포밍 할인 */
  terraformDiscount?: number;
  /** 후속 항법 보너스 */
  navBonus?: number;
  /** 헥스 선택 필요 타입 */
  hexSelectType?: FleetHexType;
  /** 트랙 선택 필요 */
  needsTrack?: boolean;
  /** 기술 타일 선택 필요 */
  needsTile?: boolean;
  /** 인공물 선택 필요 */
  needsArtifact?: boolean;
  /** 가이아포머 재고 필요 */
  requiresGaiaformer?: boolean;
}

export const FLEET_SHIP_ACTION_DEFS: Record<string, FleetShipActionDef> = {
  // TF_MARS
  TF_MARS_VP:        { actionCode: 'TF_MARS_VP',        fleetName: 'TF_MARS',   label: 'QIC2→VP(타일+2)',          cost: { qic: 2 },                isImmediate: true,  description: 'QIC 2 소모 → 보유 기술 타일 수+2만큼 VP 획득' },
  TF_MARS_GAIAFORM:  { actionCode: 'TF_MARS_GAIAFORM',  fleetName: 'TF_MARS',   label: '파워2→즉시가이아',         cost: { power: 2 },              isImmediate: true,  hexSelectType: 'GAIAFORM', requiresGaiaformer: true, description: '파워 2 소모 → 차원변형 행성에 즉시 광산 건설' },
  TF_MARS_TERRAFORM: { actionCode: 'TF_MARS_TERRAFORM', fleetName: 'TF_MARS',   label: '크레딧3→테라1단계',        cost: { credit: 3 },             isImmediate: false, terraformDiscount: 1, description: '크레딧 3 소모 → 다음 광산 건설 시 테라포밍 1단계 무료' },
  // ECLIPSE
  ECLIPSE_VP:        { actionCode: 'ECLIPSE_VP',        fleetName: 'ECLIPSE',   label: 'QIC2→VP(행성+2)',          cost: { qic: 2 },                isImmediate: true,  description: 'QIC 2 소모 → 식민화한 행성 종류 수+2만큼 VP 획득' },
  ECLIPSE_TECH:      { actionCode: 'ECLIPSE_TECH',      fleetName: 'ECLIPSE',   label: '파워3+지식2→트랙+1',       cost: { power: 3, knowledge: 2 }, isImmediate: true,  needsTrack: true, description: '파워 3 + 지식 2 → 기술 트랙 1단계 전진' },
  ECLIPSE_MINE:      { actionCode: 'ECLIPSE_MINE',      fleetName: 'ECLIPSE',   label: '크레딧6→소행성광산',        cost: { credit: 6 },             isImmediate: true,  hexSelectType: 'ASTEROID_MINE', description: '크레딧 6 → 소행성 행성에 무료 광산 건설' },
  // REBELLION
  REBELLION_TECH:    { actionCode: 'REBELLION_TECH',    fleetName: 'REBELLION', label: 'QIC3→기술타일',            cost: { qic: 3 },                isImmediate: true,  needsTile: true, description: 'QIC 3 → 기본 기술 타일 1장 획득' },
  REBELLION_UPGRADE: { actionCode: 'REBELLION_UPGRADE', fleetName: 'REBELLION', label: '파워3+광석1→광산↑교역소',   cost: { power: 3, ore: 1 },      isImmediate: true,  hexSelectType: 'UPGRADE_MINE_TO_TS', description: '파워 3 + 광석 1 → 내 광산을 교역소로 업그레이드' },
  REBELLION_CONVERT: { actionCode: 'REBELLION_CONVERT', fleetName: 'REBELLION', label: '지식2→QIC1+크레딧2',       cost: { knowledge: 2 },          isImmediate: true,  description: '지식 2 → QIC 1 + 크레딧 2 획득' },
  // TWILIGHT
  TWILIGHT_FED:      { actionCode: 'TWILIGHT_FED',      fleetName: 'TWILIGHT',  label: 'QIC3→연방수입',            cost: { qic: 3 },                isImmediate: true,  description: 'QIC 3 → 연방 수입 (QIC+1 광석+1 VP+2)' },
  TWILIGHT_UPGRADE:  { actionCode: 'TWILIGHT_UPGRADE',  fleetName: 'TWILIGHT',  label: '파워3+광석2→교역소↑연구소', cost: { power: 3, ore: 2 },      isImmediate: true,  hexSelectType: 'UPGRADE_TS_TO_RL', description: '파워 3 + 광석 2 → 내 교역소를 연구소로 업그레이드' },
  TWILIGHT_NAV:      { actionCode: 'TWILIGHT_NAV',      fleetName: 'TWILIGHT',  label: '지식1→항법+3',             cost: { knowledge: 1 },          isImmediate: false, navBonus: 3, description: '지식 1 소모 → 다음 광산 건설 시 항법 거리 +3' },
  TWILIGHT_ARTIFACT: { actionCode: 'TWILIGHT_ARTIFACT', fleetName: 'TWILIGHT',  label: '파워6→인공물',             cost: { power: 6 },              isImmediate: true,  needsArtifact: true, description: '파워 6 소각 → 인공물 선택 획득' },
};

// ============================================================
// 부스터 액션
// ============================================================

export interface BoosterActionDef {
  boosterCode: string;
  actionType: string;
  label: string;
  terraformDiscount: number;
  navBonus: number;
  requiresGaiaformer?: boolean;
}

export const BOOSTER_ACTION_DEFS: Record<string, BoosterActionDef> = {
  BOOSTER_12: { boosterCode: 'BOOSTER_12', actionType: 'PLACE_GAIAFORMER',    label: '포머 배치',   terraformDiscount: 0, navBonus: 0, requiresGaiaformer: true },
  BOOSTER_13: { boosterCode: 'BOOSTER_13', actionType: 'NAVIGATION_PLUS_3',   label: '항해+3',      terraformDiscount: 0, navBonus: 3 },
  BOOSTER_14: { boosterCode: 'BOOSTER_14', actionType: 'TERRAFORM_ONE_STEP',  label: '테라포밍 1삽', terraformDiscount: 1, navBonus: 0 },
};

// ============================================================
// 함대 메타 (순서, 라벨, 색상)
// ============================================================

export const FLEET_ORDER = ['TF_MARS', 'ECLIPSE', 'REBELLION', 'TWILIGHT'] as const;

export const FLEET_LABELS: Record<string, string> = {
  TF_MARS: 'TF 마스',
  ECLIPSE: '이클립스',
  REBELLION: '반란군',
  TWILIGHT: '트와일라잇',
};

export const FLEET_COLORS: Record<string, string> = {
  TF_MARS: 'border-red-600',
  ECLIPSE: 'border-blue-500',
  REBELLION: 'border-yellow-500',
  TWILIGHT: 'border-purple-500',
};
