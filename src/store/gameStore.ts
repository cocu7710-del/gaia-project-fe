import { create } from 'zustand';
import type { GamePublicStateResponse, GameHex, GameBuilding, SeatView, PlayerStateResponse, TechTrackResponse } from '../api/client';
import type { TurnState } from '../types/turnState';
import type { GameAction, ResourceCost } from '../types/turnActions';
import { ResourceCalculator } from '../utils/resourceCalculator';

/** 글린 QIC 획득: QIC아카데미 건설 전 → 광석 변환, 건설 후 → 정상 QIC 획득 */
function addQicPreview(ps: PlayerStateResponse, amount: number): PlayerStateResponse {
  if (ps.factionCode === 'GLEENS') {
    // hasQicAcademy가 true면 QIC아카데미 건설 완료 → 정상 QIC 획득
    if ((ps as any).hasQicAcademy) {
      return { ...ps, qic: ps.qic + amount };
    }
    // 건설 전: QIC 대신 광석으로 변환
    return { ...ps, ore: Math.min(15, ps.ore + amount) };
  }
  return { ...ps, qic: ps.qic + amount };
}

/** 연방 토큰 배치용: 파워 토큰 1개 영구 제거 (bowl1→bowl2→bowl3 순) */
function removePowerTokenPreview(ps: PlayerStateResponse): PlayerStateResponse {
  if (ps.powerBowl1 > 0) return { ...ps, powerBowl1: ps.powerBowl1 - 1 };
  if (ps.powerBowl2 > 0) return { ...ps, powerBowl2: ps.powerBowl2 - 1 };
  return { ...ps, powerBowl3: ps.powerBowl3 - 1 };
}

/** 파워 순환 프리뷰 (bowl1→bowl2→bowl3, 방금 이동한 토큰도 같은 순환에서 사용 가능) */
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
      if (newLevel === 1 || newLevel === 3) p = addQicPreview(p, 1);
      break;
    case 'AI':
      p = addQicPreview(p, newLevel <= 2 ? 1 : 2);
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
  // 타클론 브레인스톤 프리 변환: brainstoneBowl 3→1, 파워 토큰 소모 없이 브레인스톤 가치만큼
  if (code.endsWith('_BRAIN')) {
    const base = code.replace('_BRAIN', '');
    const bs = { ...preview, brainstoneBowl: 1 }; // 브레인스톤 bowl3→1
    switch (base) {
      case 'POWER_TO_CREDIT':    return { ...bs, credit: bs.credit + 3 }; // 3파워 = 3c
      case 'POWER_TO_ORE':       return { ...bs, ore: bs.ore + 1 };       // 3파워 = 1o
      case 'POWER_TO_KNOWLEDGE': return { ...bs, powerBowl3: bs.powerBowl3 - 1, powerBowl1: bs.powerBowl1 + 1, knowledge: bs.knowledge + 1 }; // 브레인(3)+일반(1)=4
      case 'POWER_TO_QIC':       return addQicPreview({ ...bs, powerBowl3: bs.powerBowl3 - 1, powerBowl1: bs.powerBowl1 + 1 }, 1);
      default: return preview;
    }
  }
  switch (code) {
    case 'ORE_TO_CREDIT':    return { ...preview, ore: preview.ore - 1, credit: preview.credit + 1 };
    case 'ORE_TO_TOKEN':     return { ...preview, ore: preview.ore - 1, powerBowl1: preview.powerBowl1 + 1 };
    case 'ORE_TO_POWER3':   return { ...preview, ore: preview.ore - 1, powerBowl3: preview.powerBowl3 + 1 };
    case 'POWER_TO_CREDIT': {
      const npi = preview.factionCode === 'NEVLAS' && preview.stockPlanetaryInstitute === 0;
      const tokens = 1;
      return { ...preview, powerBowl3: preview.powerBowl3 - tokens, powerBowl1: preview.powerBowl1 + tokens, credit: preview.credit + (npi ? 2 : 1) };
    }
    case 'POWER_TO_ORE': {
      const npi = preview.factionCode === 'NEVLAS' && preview.stockPlanetaryInstitute === 0;
      const tokens = npi ? 2 : 3;
      return { ...preview, powerBowl3: preview.powerBowl3 - tokens, powerBowl1: preview.powerBowl1 + tokens, ore: preview.ore + 1 };
    }
    case 'POWER_TO_KNOWLEDGE': {
      const npi = preview.factionCode === 'NEVLAS' && preview.stockPlanetaryInstitute === 0;
      const tokens = npi ? 2 : 4;
      return { ...preview, powerBowl3: preview.powerBowl3 - tokens, powerBowl1: preview.powerBowl1 + tokens, knowledge: preview.knowledge + 1 };
    }
    case 'POWER_TO_QIC': {
      const npi = preview.factionCode === 'NEVLAS' && preview.stockPlanetaryInstitute === 0;
      const tokens = npi ? 2 : 4;
      return addQicPreview({ ...preview, powerBowl3: preview.powerBowl3 - tokens, powerBowl1: preview.powerBowl1 + tokens }, 1);
    }
    case 'KNOWLEDGE_TO_CREDIT': return { ...preview, knowledge: preview.knowledge - 1, credit: preview.credit + 1 };
    case 'QIC_TO_ORE': return { ...preview, qic: preview.qic - 1, ore: preview.ore + 1 };
    case 'BAL_TAKS_CONVERT_GAIAFORMER': return addQicPreview({ ...preview, stockGaiaformer: preview.stockGaiaformer - 1 }, 1);
    case 'HADSCH_HALLAS_3C_ORE': return { ...preview, credit: preview.credit - 3, ore: preview.ore + 1 };
    case 'HADSCH_HALLAS_4C_KNOWLEDGE': return { ...preview, credit: preview.credit - 4, knowledge: preview.knowledge + 1 };
    case 'HADSCH_HALLAS_4C_QIC': return addQicPreview({ ...preview, credit: preview.credit - 4 }, 1);
    case 'NEVLAS_4P_ORE_CREDIT': return { ...preview, powerBowl3: preview.powerBowl3 - 2, powerBowl1: preview.powerBowl1 + 2, ore: preview.ore + 1, credit: preview.credit + 1 };
    case 'NEVLAS_6P_ORE2': return { ...preview, powerBowl3: preview.powerBowl3 - 3, powerBowl1: preview.powerBowl1 + 3, ore: preview.ore + 2 };
    case 'NEVLAS_POWER3_TO_GAIA_KNOWLEDGE': return { ...preview, powerBowl3: preview.powerBowl3 - 1, gaiaPower: (preview.gaiaPower || 0) + 1, knowledge: preview.knowledge + 1 };
    default: return preview;
  }
}

// 연방 타일별 즉시 보상 (preview 반영용)
const FEDERATION_TILE_REWARD: Record<string, { credit?: number; ore?: number; knowledge?: number; qic?: number; powerToken?: number; vp?: number; powerToBowl3?: number }> = {
  FED_TILE_1:     { knowledge: 2, vp: 6 },
  FED_TILE_2:     { credit: 6, vp: 7 },
  FED_TILE_3:     { vp: 12 },
  FED_TILE_4:     { qic: 1, vp: 8 },
  FED_TILE_5:     { ore: 2, vp: 7 },
  FED_TILE_6:     { powerToken: 2, vp: 8 },
  FED_EXP_TILE_1: { knowledge: 8 },
  FED_EXP_TILE_2: { knowledge: 4, vp: 4 },
  FED_EXP_TILE_3: { credit: 8, vp: 8 },
  FED_EXP_TILE_4: { ore: 2, qic: 1, vp: 4 },
  FED_EXP_TILE_5: {},  // 3테라+무료광산 (별도 처리)
  FED_EXP_TILE_6: { vp: 12 },
  FED_EXP_TILE_7: {},  // 무료 광산 (별도 처리)
  FED_EXP_TILE_8: { powerToBowl3: 2, vp: 7 },
  GLEENS_FEDERATION: { credit: 2, ore: 1, knowledge: 1 },
};

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
  // burn power를 먼저 적용 (자유 행동이므로 다른 액션보다 선행)
  if (burnPowerCount > 0) {
    const isItars = preview.factionCode === 'ITARS';
    preview = {
      ...preview,
      powerBowl2: preview.powerBowl2 - burnPowerCount * 2,
      powerBowl3: preview.powerBowl3 + burnPowerCount,
      ...(isItars ? { gaiaPower: (preview.gaiaPower || 0) + burnPowerCount } : {}),
    };
  }
  // 프리 액션 (소각 뒤, 메인 액션 전에 적용 — BE 확정 순서와 동일)
  for (const code of freeConvertActions) {
    preview = applyFreeConvert(preview, code);
  }
  for (const act of actions) {
    // TWILIGHT_ARTIFACT: 파워 6 소각 (bowl1→2→3 순 영구 제거) + 즉시 효과
    if (act.type === 'FLEET_SHIP_ACTION' && (act.payload as any).actionCode === 'TWILIGHT_ARTIFACT') {
      let rem = 6;
      let b1 = preview.powerBowl1, b2 = preview.powerBowl2, b3 = preview.powerBowl3;
      const f1 = Math.min(b1, rem); b1 -= f1; rem -= f1;
      const f2 = Math.min(b2, rem); b2 -= f2; rem -= f2;
      const f3 = Math.min(b3, rem); b3 -= f3;
      preview = { ...preview, powerBowl1: b1, powerBowl2: b2, powerBowl3: b3 };
      // 즉시 효과 프리뷰 (인공물 코드별 — payload에서 직접 읽기)
      const artCode = (act.payload as any).artifactCode as string | undefined;
      if (artCode) {
        const ARTIFACT_IMMEDIATE: Record<string, { credit?: number; ore?: number; knowledge?: number; qic?: number; vp?: number }> = {
          ARTIFACT_1: { knowledge: 3, qic: 1 },
          ARTIFACT_2: { credit: 5, ore: 2 },
          ARTIFACT_3: { credit: 3, ore: 3 },
          ARTIFACT_7: { vp: 7 },
          ARTIFACT_8: { vp: 7 },
        };
        const rew = ARTIFACT_IMMEDIATE[artCode];
        if (rew) {
          preview = {
            ...preview,
            credit: preview.credit + (rew.credit ?? 0),
            ore: preview.ore + (rew.ore ?? 0),
            knowledge: preview.knowledge + (rew.knowledge ?? 0),
            qic: preview.qic + (rew.qic ?? 0),
            victoryPoints: preview.victoryPoints + (rew.vp ?? 0),
          };
        }
      }
      continue;
    }
    if (act.type === 'PLACE_MINE' || act.type === 'UPGRADE_BUILDING' ||
        act.type === 'POWER_ACTION' || act.type === 'FLEET_PROBE' || act.type === 'ADVANCE_TECH' ||
        act.type === 'FLEET_SHIP_ACTION') {
      // 타클론 브레인스톤 사용 시: bowl3 대신 brainstoneBowl 이동
      if (act.payload.useBrainstone && preview.brainstoneBowl === 3 && act.payload.cost?.power) {
        const powerCost = act.payload.cost.power;
        const brainstonePower = 3;
        const extraNeeded = Math.max(0, powerCost - brainstonePower);
        preview = {
          ...preview,
          brainstoneBowl: 1,
          powerBowl3: preview.powerBowl3 - extraNeeded,
          powerBowl1: preview.powerBowl1 + extraNeeded,
          // 나머지 비용 (power 외)
          credit: preview.credit - (act.payload.cost.credit || 0),
          ore: preview.ore - (act.payload.cost.ore || 0),
          knowledge: preview.knowledge - (act.payload.cost.knowledge || 0),
          qic: preview.qic - (act.payload.cost.qic || 0),
          victoryPoints: preview.victoryPoints - (act.payload.cost.vp || 0),
        };
      } else {
        preview = ResourceCalculator.applyResourceCost(preview, act.payload.cost);
      }
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
      // 다카니안 PI: 새 섹터 광산 건설 시 +2c+1k
      if (preview.factionCode === 'DAKANIANS' && preview.stockPlanetaryInstitute === 0 && act.payload.isNewSector) {
        preview = { ...preview, credit: preview.credit + 2, knowledge: preview.knowledge + 1 };
      }
    }
    if (act.type === 'PLACE_LOST_PLANET') {
      // 검은행성: 광산 재고 감소 없음, VP +6
      preview = { ...preview, victoryPoints: preview.victoryPoints + 6 };
    }
    if (act.type === 'UPGRADE_BUILDING') {
      // 재고 변경 프리뷰
      const toType = act.payload.toType;
      if (toType === 'TRADING_STATION') preview = { ...preview, stockTradingStation: Math.max(0, preview.stockTradingStation - 1), stockMine: preview.stockMine + 1 };
      else if (toType === 'RESEARCH_LAB') preview = { ...preview, stockResearchLab: Math.max(0, preview.stockResearchLab - 1), stockTradingStation: preview.stockTradingStation + 1 };
      else if (toType === 'PLANETARY_INSTITUTE') {
        preview = { ...preview, stockPlanetaryInstitute: Math.max(0, preview.stockPlanetaryInstitute - 1), stockTradingStation: preview.stockTradingStation + 1 };
        // 글린 PI: 전용 연방 토큰 즉시 보상 2c+1o+1k
        if (preview.factionCode === 'GLEENS') {
          preview = { ...preview, credit: preview.credit + 2, ore: preview.ore + 1, knowledge: preview.knowledge + 1 };
        }
      }
      else if (toType === 'ACADEMY') preview = { ...preview, stockAcademy: Math.max(0, preview.stockAcademy - 1), stockResearchLab: preview.stockResearchLab + 1 };
    }
    if ((act.type === 'POWER_ACTION') && act.payload.gain) {
      preview = ResourceCalculator.applyResourceGain(preview, act.payload.gain);
    }
    if (act.type === 'ADVANCE_TECH') {
      preview = applyTrackAdvance(preview, act.payload.trackCode);
    }
    if (act.type === 'FLEET_PROBE') {
      // 네블라/아이타: 우주선 입장 시 파워 토큰 1개 영구 소각
      if (preview.factionCode === 'NEVLAS' || preview.factionCode === 'ITARS') {
        if (preview.powerBowl1 > 0) preview = { ...preview, powerBowl1: preview.powerBowl1 - 1 };
        else if (preview.powerBowl2 > 0) preview = { ...preview, powerBowl2: preview.powerBowl2 - 1 };
        else if (preview.powerBowl3 > 0) preview = { ...preview, powerBowl3: preview.powerBowl3 - 1 };
      }
      // 파워 순환
      if (act.payload.powerCharge > 0) {
        preview = applyPowerCharge(preview, act.payload.powerCharge);
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
    if (act.type === 'FACTION_ABILITY' && act.payload.abilityCode === 'GLEENS_FEDERATION_TOKEN') {
      preview = { ...preview, credit: preview.credit - 2, ore: preview.ore - 1, knowledge: preview.knowledge - 1 };
    }
    if (act.type === 'FACTION_ABILITY' && act.payload.abilityCode === 'QIC_ACADEMY_ACTION') {
      preview = addQicPreview(preview, 1);
    }
    if (act.type === 'FACTION_ABILITY' && act.payload.abilityCode === 'TINKEROIDS_USE_ACTION') {
      switch (act.payload.tinkAction) {
        case 'TINK_POWER_4': preview = applyPowerCharge(preview, 4); break;
        case 'TINK_QIC_1': preview = addQicPreview(preview, 1); break;
        case 'TINK_KNOWLEDGE_3': preview = { ...preview, knowledge: preview.knowledge + 3 }; break;
        case 'TINK_QIC_2': preview = addQicPreview(preview, 2); break;
      }
    }
    if (act.type === 'FORM_FEDERATION') {
      const reward = FEDERATION_TILE_REWARD[act.payload.tileCode];
      if (reward) {
        if (reward.credit) preview = { ...preview, credit: preview.credit + reward.credit };
        if (reward.ore) preview = { ...preview, ore: preview.ore + reward.ore };
        if (reward.knowledge) preview = { ...preview, knowledge: preview.knowledge + reward.knowledge };
        if (reward.qic) preview = addQicPreview(preview, reward.qic);
        if (reward.vp) preview = { ...preview, victoryPoints: preview.victoryPoints + reward.vp };
        if (reward.powerToken) preview = { ...preview, powerBowl1: preview.powerBowl1 + reward.powerToken };
        if (reward.powerToBowl3) preview = { ...preview, powerBowl3: preview.powerBowl3 + reward.powerToBowl3 };
      }
    }
    if (act.type === 'TECH_TILE_ACTION') {
      const effect = TECH_TILE_ACTION_PREVIEW[act.payload.tileCode];
      if (effect) {
        if (effect.powerCharge) {
          preview = applyPowerCharge(preview, effect.powerCharge);
        }
        if (effect.ore) preview = { ...preview, ore: preview.ore + effect.ore };
        if (effect.knowledge) preview = { ...preview, knowledge: preview.knowledge + effect.knowledge };
        if (effect.qic) preview = addQicPreview(preview, effect.qic);
        if (effect.credit) preview = { ...preview, credit: preview.credit + effect.credit };
      }
    }
  }
  // freeConvertActions는 이미 burn 뒤, actions 뒤에 적용됨 (위에서 이동 완료)
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
  roundFirstSeatNo: number | null;
  roundSeatOrder: number[];  // 현재 라운드 좌석 순서 (ROUND_STARTED에서 설정)
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
  federationGroups: Array<{ playerId: string; tileCode: string; buildingHexes: number[][]; tokenHexes: number[][]; used?: boolean }>;
  // 인공물 (트와일라잇 — 획득자 포함)
  gameArtifacts: Array<{ artifactCode: string; position: number; isTaken: boolean; acquiredByPlayerId: string | null }>;

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
    tilePicking: boolean; // true: 기술타일 선택 모드 (TechTracks에서 선택)
  } | null;
  terransGaiaChoice: {
    terransPlayerId: string;
    gaiaPower: number;
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

  // 패스 부스터 선택 모드
  selectingPassBooster: boolean;
  setSelectingPassBooster: (v: boolean) => void;

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
  updateLastPendingActionPayload: (patch: Record<string, unknown>) => void;
  completeFleetShipHexSelection: (patch: Record<string, unknown>, tentativeBuilding: GameBuilding) => void;
  clearPendingActions: (keepPreview?: boolean) => void;
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
  setTerransGaiaChoice: (data: GameState['terransGaiaChoice']) => void;

  // 연방 그룹
  setFederationGroups: (groups: GameState['federationGroups']) => void;
  setGameArtifacts: (artifacts: GameState['gameArtifacts']) => void;

  // 패스 순서 추적
  passedSeatNos: number[];
  addPassedSeatNo: (seatNo: number) => void;
  clearPassedSeatNos: () => void;
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
  roundFirstSeatNo: null,
  roundSeatOrder: [],
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
  gameArtifacts: [],
  tinkeroidsActionChoice: null,
  itarsGaiaChoice: null,
  terransGaiaChoice: null,
  passedSeatNos: [],
  selectingPassBooster: false,
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

  updateLastPendingActionPayload: (patch: Record<string, unknown>) =>
    set((state) => {
      const actions = [...state.turnState.pendingActions];
      if (actions.length === 0) return {};
      const last = actions[actions.length - 1];
      actions[actions.length - 1] = { ...last, payload: { ...last.payload, ...patch } };
      return {
        turnState: {
          ...state.turnState,
          pendingActions: actions,
          previewPlayerState: calculatePreviewState(state.turnState.originalPlayerState, actions, state.turnState.burnPowerCount, state.turnState.freeConvertActions),
        },
      };
    }),

  completeFleetShipHexSelection: (patch: Record<string, unknown>, tentativeBuilding: GameBuilding) =>
    set((state) => {
      const actions = [...state.turnState.pendingActions];
      if (actions.length > 0) {
        const last = actions[actions.length - 1];
        actions[actions.length - 1] = { ...last, payload: { ...last.payload, ...patch } };
      }
      return {
        fleetShipMode: null,
        turnState: {
          ...state.turnState,
          pendingActions: actions,
          tentativeBuildings: [...state.turnState.tentativeBuildings, tentativeBuilding],
          previewPlayerState: calculatePreviewState(state.turnState.originalPlayerState, actions, state.turnState.burnPowerCount, state.turnState.freeConvertActions),
        },
      };
    }),

  clearPendingActions: (keepPreview?: boolean) =>
    set((state) => ({
      fleetShipMode: null,
      federationMode: null,
      tentativeTechTileCode: null,
      tentativeTechTrackCode: null,
      turnState: {
        ...state.turnState,
        pendingActions: [],
        // keepPreview=true: 확정 성공 후 프리뷰 유지 (WS 이벤트로 갱신될 때까지)
        previewPlayerState: keepPreview
          ? state.turnState.previewPlayerState
          : state.turnState.originalPlayerState
            ? { ...state.turnState.originalPlayerState }
            : null,
        originalPlayerState: keepPreview
          ? state.turnState.previewPlayerState
          : state.turnState.originalPlayerState,
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
  setTerransGaiaChoice: (data) => set({ terransGaiaChoice: data }),

  setFederationGroups: (groups) => set({ federationGroups: groups }),
  setGameArtifacts: (artifacts) => set({ gameArtifacts: artifacts }),

  addPassedSeatNo: (seatNo) => set((state) => ({
    passedSeatNos: state.passedSeatNos.includes(seatNo)
      ? state.passedSeatNos
      : [...state.passedSeatNos, seatNo],
  })),
  clearPassedSeatNos: () => set({ passedSeatNos: [] }),

  setSelectingPassBooster: (v) => set({ selectingPassBooster: v }),
}));
