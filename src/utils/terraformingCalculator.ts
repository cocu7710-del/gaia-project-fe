/**
 * 테라포밍 거리/비용 계산 유틸리티
 *
 * 순환 배열 (범례 표시 순서와 동일):
 * TERRA(0) - VOLCANIC(1) - OXIDE(2) - DESERT(3) - SWAMP(4) - TITANIUM(5) - ICE(6)
 *
 * TERRA 기준:
 *   1단계: VOLCANIC, ICE
 *   2단계: OXIDE, TITANIUM
 *   3단계: DESERT, SWAMP
 */

const TERRAFORM_RING = ['TERRA', 'VOLCANIC', 'OXIDE', 'DESERT', 'SWAMP', 'TITANIUM', 'ICE'] as const;
const N = TERRAFORM_RING.length;

/** 테라포밍 가능한 행성 타입 (홈 행성 7종) */
export const HOME_PLANET_TYPES = new Set(TERRAFORM_RING);

/**
 * 두 행성 간 테라포밍 단계 수 (순환 최단 거리)
 * 같은 행성 → 0, 테라포밍 불가 행성 → Infinity
 *
 * 소행성(ASTEROIDS)/미행성(LOST_PLANET) 종족 특수 규칙:
 *   - 자기 홈(동일 타입) → 0단계
 *   - 테라포밍 링 7종 중 어느 것이든 → 1단계
 *   - TRANSDIM/GAIA/EMPTY → Infinity (불가)
 */
export function getTerraformingSteps(from: string, to: string): number {
  if (from === to) return 0;

  // 소행성/미행성 종족: 링 행성은 항상 1단계
  if (from === 'ASTEROIDS' || from === 'LOST_PLANET') {
    return HOME_PLANET_TYPES.has(to) ? 1 : Infinity;
  }

  const a = TERRAFORM_RING.indexOf(from as any);
  const b = TERRAFORM_RING.indexOf(to as any);
  if (a === -1 || b === -1) return Infinity;
  const diff = Math.abs(a - b);
  return Math.min(diff, N - diff);
}

/**
 * 테라포밍 트랙 레벨 → 단계당 광석 비용
 *   레벨 0~1 : 3광석
 *   레벨 2   : 2광석
 *   레벨 3~5 : 1광석
 */
export function getOrePerStep(techTerraforming: number): number {
  if (techTerraforming <= 1) return 3;
  if (techTerraforming === 2) return 2;
  return 1;
}

/**
 * 테라포밍 총 광석 비용
 * @param from         내 홈 행성 타입
 * @param to           목표 행성 타입
 * @param techLevel    테라포밍 트랙 레벨
 * @param discount     파워 액션으로 할인받는 단계 수 (PWR_TERRAFORM=1, PWR_TERRAFORM_2=2)
 */
export function getTerraformingOreCost(
  from: string,
  to: string,
  techLevel: number,
  discount: number,
): number {
  const steps = getTerraformingSteps(from, to);
  if (!isFinite(steps) || steps === 0) return 0;
  const effectiveSteps = Math.max(0, steps - discount);
  return effectiveSteps * getOrePerStep(techLevel);
}

/**
 * pending 액션에서 항법 거리 보너스 추출 (BOOSTER_13: +3, TWILIGHT_NAV: +3)
 */
export function getNavBonus(pendingActions: { type: string; payload: any }[]): number {
  const boosterAct = pendingActions.find(
    a => a.type === 'BOOSTER_ACTION' && a.payload.actionType === 'NAVIGATION_PLUS_3',
  );
  if (boosterAct) return boosterAct.payload.navBonus ?? 3;

  // 함대 선박: TWILIGHT_NAV
  const fleetAct = pendingActions.find(
    a => a.type === 'FLEET_SHIP_ACTION' && a.payload.actionCode === 'TWILIGHT_NAV',
  );
  if (fleetAct) return fleetAct.payload.navBonus ?? 3;

  // 팩션 능력: GLEENS_JUMP (2거리 점프)
  const factionAct = pendingActions.find(
    a => a.type === 'FACTION_ABILITY' && a.payload.abilityCode === 'GLEENS_JUMP',
  );
  if (factionAct) return factionAct.payload.navBonus ?? 2;

  return 0;
}

/**
 * pending 액션에서 테라포밍 할인 단계 수 추출
 */
export function getTerraformDiscount(pendingActions: { type: string; payload: any }[]): number {
  // 파워 액션 테라포밍
  const pwrAct = pendingActions.find(
    a => a.type === 'POWER_ACTION' &&
    (a.payload.powerActionCode === 'PWR_TERRAFORM' || a.payload.powerActionCode === 'PWR_TERRAFORM_2'),
  );
  if (pwrAct) return pwrAct.payload.powerActionCode === 'PWR_TERRAFORM_2' ? 2 : 1;

  // 부스터 액션 테라포밍 (BOOSTER_14: 1단계 할인)
  const boosterAct = pendingActions.find(
    a => a.type === 'BOOSTER_ACTION' && a.payload.actionType === 'TERRAFORM_ONE_STEP',
  );
  if (boosterAct) return boosterAct.payload.terraformDiscount ?? 1;

  // 함대 선박: TF_MARS_TERRAFORM (크레딧 3 → 테라포밍 1단계)
  const fleetAct = pendingActions.find(
    a => a.type === 'FLEET_SHIP_ACTION' && a.payload.actionCode === 'TF_MARS_TERRAFORM',
  );
  if (fleetAct) return fleetAct.payload.terraformDiscount ?? 1;

  // 팩션 능력: SPACE_GIANTS_TERRAFORM_2 (2삽 테라포밍)
  const factionAct = pendingActions.find(
    a => a.type === 'FACTION_ABILITY' && a.payload.abilityCode === 'SPACE_GIANTS_TERRAFORM_2',
  );
  if (factionAct) return factionAct.payload.terraformDiscount ?? 2;

  return 0;
}
