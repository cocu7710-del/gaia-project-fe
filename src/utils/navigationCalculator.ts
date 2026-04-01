/**
 * Navigation 기술 레벨 → 실제 항법 거리 변환
 * 레벨 0~1: 1거리 / 레벨 2~3: 2거리 / 레벨 4: 3거리 / 레벨 5: 4거리
 */
export function navLevelToRange(level: number): number {
  if (level <= 1) return 1;
  if (level <= 3) return 2;
  if (level === 4) return 3;
  return 4; // level 5
}

/**
 * 타일 보너스 포함 항법 거리 (BASIC_EXP_TILE_1 보유 시 +1)
 */
export function getNavRangeBonus(techTileData: any, playerId: string | null): number {
  if (!techTileData || !playerId) return 0;
  const hasTile = techTileData.basicTiles?.some(
    (t: any) => t.tileCode === 'BASIC_EXP_TILE_1' && (t.ownerPlayerIds ?? []).includes(playerId)
  );
  return hasTile ? 1 : 0;
}

/** flat-top axial 헥스 거리 계산 */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q2 - q1;
  const dr = r2 - r1;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * 내 건물들에서 목표 헥스까지 최소 거리
 */
export function minDistFromMyBuildings(
  targetQ: number,
  targetR: number,
  myBuildings: { hexQ: number; hexR: number }[],
): number {
  if (myBuildings.length === 0) return Infinity;
  return Math.min(...myBuildings.map(b => hexDistance(b.hexQ, b.hexR, targetQ, targetR)));
}

/**
 * 목표 헥스 도달에 필요한 Qic 수 계산
 * - navRange: techNavigation 값 (= 기본 항법 거리)
 * - Qic 1개당 범위 +2
 * @returns { reachable: 도달 가능 여부, qicNeeded: 필요 Qic 수 }
 */
export function getNavigationCost(
  targetQ: number,
  targetR: number,
  myBuildings: { hexQ: number; hexR: number }[],
  navRange: number,
  availableQic: number,
): { reachable: boolean; qicNeeded: number } {
  const minDist = minDistFromMyBuildings(targetQ, targetR, myBuildings);
  if (minDist <= navRange) return { reachable: true, qicNeeded: 0 };
  const qicNeeded = Math.ceil((minDist - navRange) / 2);
  return { reachable: qicNeeded <= availableQic, qicNeeded };
}
