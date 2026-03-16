import type { PlayerStateResponse } from '../api/client';

/** 수입 결과 */
export interface IncomeResult {
  credit: number;
  ore: number;
  knowledge: number;
  qic: number;
  powerCharge: number; // 파워 순환 (bowl1→2→3)
  powerToken: number;  // 파워 토큰 획득 (bowl1 직접 추가)
}

const ZERO: IncomeResult = { credit: 0, ore: 0, knowledge: 0, qic: 0, powerCharge: 0, powerToken: 0 };

function add(a: IncomeResult, b: Partial<IncomeResult>): IncomeResult {
  return {
    credit:      a.credit      + (b.credit      ?? 0),
    ore:         a.ore         + (b.ore         ?? 0),
    knowledge:   a.knowledge   + (b.knowledge   ?? 0),
    qic:         a.qic         + (b.qic         ?? 0),
    powerCharge: a.powerCharge + (b.powerCharge ?? 0),
    powerToken:  a.powerToken  + (b.powerToken  ?? 0),
  };
}

// ─────────────────────────────────────────
// 1. 종족별 기본 수입 (FactionType.getBaseIncome 기준)
// ─────────────────────────────────────────
const FACTION_BASE: Record<string, Partial<IncomeResult>> = {
  FIRAKS:        { ore: 1, knowledge: 2 },
  HADSCH_HALLAS: { credit: 3, ore: 1, knowledge: 1 },
  ITARS:         { ore: 1, knowledge: 1, powerToken: 1 },
  LANTIDS:       { ore: 1, knowledge: 1, powerToken: 1 },
  AMBAS:         { ore: 2, knowledge: 1 },
  BESCODS:       { ore: 1 },
};
const DEFAULT_FACTION_BASE: Partial<IncomeResult> = { ore: 1, knowledge: 1 };

// ─────────────────────────────────────────
// 2. 라운드 부스터 수입 (RoundBoosterType.income 기준)
// ─────────────────────────────────────────
const BOOSTER_INCOME: Record<string, Partial<IncomeResult>> = {
  BOOSTER_1:  { ore: 1, knowledge: 1 },
  BOOSTER_2:  { credit: 2, qic: 1 },
  BOOSTER_3:  { ore: 1, powerToken: 2 },
  BOOSTER_4:  { ore: 1 },
  BOOSTER_5:  { knowledge: 1 },
  BOOSTER_6:  { ore: 1 },
  BOOSTER_7:  { powerCharge: 4 },
  BOOSTER_8:  { credit: 4 },
  BOOSTER_9:  { ore: 1 },
  BOOSTER_10: { ore: 1 },
  BOOSTER_11: { credit: 3 },
  BOOSTER_12: { powerCharge: 2 },
  BOOSTER_13: { powerCharge: 2 },
  BOOSTER_14: { credit: 2 },
};

// ─────────────────────────────────────────
// 3. 경제 트랙 수입 (TechTrackIncomeVo.getEconomyIncome 기준)
// ─────────────────────────────────────────
function getEconomyIncome(level: number, isOptionA: boolean): Partial<IncomeResult> {
  switch (level) {
    case 1: return { credit: 2, powerCharge: 1 };
    case 2: return { credit: 2, ore: 1, powerCharge: 2 };
    case 3: return isOptionA ? { credit: 3, ore: 1 } : { credit: 2, ore: 1, powerCharge: 3 };
    case 4: return isOptionA ? { credit: 4, ore: 2 } : { credit: 2, ore: 2, powerCharge: 2 };
    case 5: return { credit: 6, ore: 3, powerCharge: 2 };
    default: return {};
  }
}

// ─────────────────────────────────────────
// 4. 과학 트랙 수입 (TechTrackIncomeVo.getScienceIncome 기준)
// ─────────────────────────────────────────
function getScienceKnowledge(level: number): number {
  if (level <= 0) return 0;
  if (level >= 4) return 4;
  return level; // 1, 2, 3
}

// ─────────────────────────────────────────
// 5. 건물 수입 (BuildingIncomeVo 기준)
// ─────────────────────────────────────────
function getMineOre(stockMine: number): number {
  const placed = 8 - stockMine;
  let ore = 0;
  for (let i = 1; i <= placed; i++) {
    if (i === 3) continue; // 3번째 광산 수입 없음
    ore++;
  }
  return ore;
}

function getTsCredit(stockTs: number): number {
  const placed = 4 - stockTs;
  const slots = [3, 4, 4, 5];
  let c = 0;
  for (let i = 0; i < placed && i < slots.length; i++) c += slots[i];
  return c;
}

// ─────────────────────────────────────────
// 6. 의회(PI) 수입 — 종족별
// ─────────────────────────────────────────
const PI_INCOME: Record<string, Partial<IncomeResult>> = {
  IVITS:         { powerCharge: 4, qic: 1 },
  GLEENS:        { powerCharge: 4, ore: 1 },
  AMBAS:         { powerCharge: 4, powerToken: 2 },
  BESCODS:       { powerCharge: 4, powerToken: 2 },
  LANTIDS:       { powerCharge: 4 },
  SPACE_GIANTS:  { powerCharge: 6, powerToken: 1 },
};
const DEFAULT_PI_INCOME: Partial<IncomeResult> = { powerCharge: 4, powerToken: 1 };

// ─────────────────────────────────────────
// 7. 기술 타일 수입 (INCOME 타입)
// ─────────────────────────────────────────
const TECH_TILE_INCOME: Record<string, Partial<IncomeResult>> = {
  BASIC_TILE_2: { ore: 1, powerCharge: 1 },
  BASIC_TILE_3: { credit: 4 },
  BASIC_TILE_4: { knowledge: 1, credit: 1 },
};

// ─────────────────────────────────────────
// 메인: 수입 계산
// ─────────────────────────────────────────
export function calcIncome(
  ps: PlayerStateResponse,
  factionCode: string | null,
  boosterCode: string | null,
  economyTrackOption: string | null,
  ownedTechTileCodes?: string[],
): IncomeResult {
  let result = { ...ZERO };
  const isOptionA = economyTrackOption !== 'OPTION_B';

  // 1. 종족 기본 수입
  result = add(result, (factionCode && FACTION_BASE[factionCode]) || DEFAULT_FACTION_BASE);

  // 2. 건물 수입
  const piIncome = ps.stockPlanetaryInstitute < 1
    ? (factionCode && PI_INCOME[factionCode]) || DEFAULT_PI_INCOME
    : {};
  const totalAcademies = 2 - ps.stockAcademy;
  const qicAcademyCount = ps.hasQicAcademy ? 1 : 0;
  const knowledgeAcademyCount = Math.max(0, totalAcademies - qicAcademyCount);
  const isItars = factionCode === 'ITARS';
  const academyKnowledge = knowledgeAcademyCount * (isItars ? 3 : 2);
  result = add(result, {
    ore:         getMineOre(ps.stockMine),
    credit:      getTsCredit(ps.stockTradingStation),
    knowledge:   (3 - ps.stockResearchLab)                       // 연구소: 지식 1/개
                 + academyKnowledge,                              // 지식 아카데미: 2(아이타 3)지식/개
  });
  result = add(result, piIncome);

  // 3. 기술 트랙 수입
  result = add(result, getEconomyIncome(ps.techEconomy, isOptionA));
  result = add(result, { knowledge: getScienceKnowledge(ps.techScience) });

  // 4. 부스터 수입
  if (boosterCode && BOOSTER_INCOME[boosterCode]) {
    result = add(result, BOOSTER_INCOME[boosterCode]);
  }

  // 5. 기술 타일 수입 (덮이지 않은 INCOME 타입)
  if (ownedTechTileCodes) {
    for (const code of ownedTechTileCodes) {
      if (TECH_TILE_INCOME[code]) {
        result = add(result, TECH_TILE_INCOME[code]);
      }
    }
  }

  return result;
}
