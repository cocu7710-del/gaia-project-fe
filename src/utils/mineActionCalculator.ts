/**
 * 종족별 광산 건설 비용 계산
 *
 * 공통 규칙:
 *   소행성(ASTEROIDS) - 비홈 종족: 가이아포머 1개 제거 (2c+1o 없음)
 *   원시행성(LOST_PLANET) - 비홈 종족: 3삽 + 2c+1o + 6VP 보너스
 *
 * 확장 종족:
 *   다카니안(DAKANIANS)    : 기본 7종 1삽, 가이아 2QIC
 *   팅커로이드(TINKEROIDS) : 플레이 중 종족 행성 3삽, 미플레이 1삽, 가이아 2QIC
 *   모웨이드(MOWEIDS)      : 팅커로이드와 동일 규칙(단, 다카니안/팅커로이드 기준), 가이아 1QIC
 *   스페이스자이언트(SPACE_GIANTS): 기본 7종 2삽, 가이아 2QIC
 */

import type { PlayerStateResponse, SeatView } from '../api/client';
import { HOME_PLANET_TYPES, getTerraformingSteps, getOrePerStep } from './terraformingCalculator';
import { ResourceCalculator } from './resourceCalculator';
import type { ResourceCost } from '../types/turnActions';

export type MineCostResult = {
  possible: boolean;
  credit: number;
  ore: number;
  qic: number;           // navQic + 종족 QIC 합산
  gaiaformerUsed: boolean;
  vpBonus: number;       // 원시행성 +6
};

const IMPOSSIBLE: MineCostResult = {
  possible: false, credit: 0, ore: 0, qic: 0, gaiaformerUsed: false, vpBonus: 0,
};

const EXPANSION_FACTIONS = new Set(['TINKEROIDS', 'DAKANIANS', 'MOWEIDS', 'SPACE_GIANTS']);

/** 현재 게임에서 플레이 중인 홈 행성 타입 집합 (기본 7종 링 한정) */
function getPlayedRingPlanets(seats: SeatView[]): Set<string> {
  const played = new Set<string>();
  for (const s of seats) {
    if (HOME_PLANET_TYPES.has(s.homePlanetType)) played.add(s.homePlanetType);
  }
  return played;
}

/**
 * 링 행성에 대한 테라포밍 단계 수 반환 (종족별)
 * targetPlanetType은 HOME_PLANET_TYPES 안의 값이어야 함
 */
function calcTerraformSteps(
  targetPlanetType: string,
  myFactionCode: string,
  myHomePlanetType: string,
  seats: SeatView[],
  terraformDiscount: number,
  extraTinkeroidsRingPlanet: string | null,
  extraMoweidsRingPlanet: string | null,
): number {
  let steps: number;

  switch (myFactionCode) {
    case 'DAKANIANS':
      steps = 1;
      break;

    case 'SPACE_GIANTS':
      steps = 2;
      break;

    case 'TINKEROIDS': {
      // 플레이 중인 종족 행성 → 3삽, 추가 할당 행성 → 3삽, 나머지 → 1삽
      const played = getPlayedRingPlanets(seats);
      steps = (played.has(targetPlanetType) || targetPlanetType === extraTinkeroidsRingPlanet) ? 3 : 1;
      break;
    }

    case 'MOWEIDS': {
      // 팅커로이드와 동일 규칙 (다카니안/팅커로이드 기준)
      const played = getPlayedRingPlanets(seats);
      steps = (played.has(targetPlanetType) || targetPlanetType === extraMoweidsRingPlanet) ? 3 : 1;
      break;
    }

    default:
      // 일반 종족: 테라포밍 링 최단 거리
      steps = getTerraformingSteps(myHomePlanetType, targetPlanetType);
      break;
  }

  return Math.max(0, steps - terraformDiscount);
}

/**
 * 종족·행성별 광산 건설 비용 계산
 * @param navQic - 항법 거리 확장에 사용할 QIC (이미 계산된 값)
 */
export function calcMineCost(
  targetPlanetType: string,
  myFactionCode: string,
  myHomePlanetType: string,
  techTerraforming: number,
  terraformDiscount: number,
  myState: PlayerStateResponse,
  seats: SeatView[],
  navQic: number,
  extraTinkeroidsRingPlanet: string | null = null,
  extraMoweidsRingPlanet: string | null = null,
): MineCostResult {
  const BASE_CREDIT = 2;
  const BASE_ORE = 1;

  const afford = (cost: ResourceCost) => ResourceCalculator.canAfford(myState, cost);

  // 가이아 행성 (GAIA) - 모든 종족 가능
  // 기본 종족 + 모웨이드: 1 QIC 추가, 나머지 확장 종족: 2 QIC 추가
  if (targetPlanetType === 'GAIA') {
    const gaiaQic = (EXPANSION_FACTIONS.has(myFactionCode) && myFactionCode !== 'MOWEIDS') ? 2 : 1;
    const totalQic = gaiaQic + navQic;
    const cost = { credit: BASE_CREDIT, ore: BASE_ORE, qic: totalQic };
    return { possible: afford(cost), credit: BASE_CREDIT, ore: BASE_ORE, qic: totalQic, gaiaformerUsed: false, vpBonus: 0 };
  }

  // 홈 행성: 테라포밍 없음, 기본 비용만 (다카니안=ASTEROIDS 포함)
  if (targetPlanetType === myHomePlanetType) {
    const cost = { credit: BASE_CREDIT, ore: BASE_ORE, qic: navQic };
    return { possible: afford(cost), credit: BASE_CREDIT, ore: BASE_ORE, qic: navQic, gaiaformerUsed: false, vpBonus: 0 };
  }

  // 소행성 (ASTEROIDS) - 비홈 종족만: 가이아포머 1개 제거
  if (targetPlanetType === 'ASTEROIDS') {
    const possible = myState.stockGaiaformer > 0 && myState.qic >= navQic;
    return { possible, credit: 0, ore: 0, qic: navQic, gaiaformerUsed: true, vpBonus: 0 };
  }

  // 원시행성 (LOST_PLANET) - 홈 종족 포함 모든 종족: 3삽 + 기본 비용 + 6VP
  if (targetPlanetType === 'LOST_PLANET') {
    const orePerStep = getOrePerStep(techTerraforming);
    const effectiveSteps = Math.max(0, 3 - terraformDiscount);
    const totalOre = BASE_ORE + effectiveSteps * orePerStep;
    const cost = { credit: BASE_CREDIT, ore: totalOre, qic: navQic };
    return { possible: afford(cost), credit: BASE_CREDIT, ore: totalOre, qic: navQic, gaiaformerUsed: false, vpBonus: 6 };
  }

  // 기본 7종 링 행성
  if (!HOME_PLANET_TYPES.has(targetPlanetType)) return IMPOSSIBLE;

  const effectiveSteps = calcTerraformSteps(targetPlanetType, myFactionCode, myHomePlanetType, seats, terraformDiscount, extraTinkeroidsRingPlanet, extraMoweidsRingPlanet);
  const orePerStep = getOrePerStep(techTerraforming);
  const totalOre = BASE_ORE + effectiveSteps * orePerStep;
  const cost = { credit: BASE_CREDIT, ore: totalOre, qic: navQic };
  return { possible: afford(cost), credit: BASE_CREDIT, ore: totalOre, qic: navQic, gaiaformerUsed: false, vpBonus: 0 };
}
