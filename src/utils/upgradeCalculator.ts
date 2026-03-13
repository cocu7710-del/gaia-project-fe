import type { GameBuilding, PlayerStateResponse } from '../api/client';
import { hexDistance } from './navigationCalculator';
import type { ResourceCost } from '../types/turnActions';

/** 건물 파워 값 (리치 계산용) */
export function buildingPowerValue(buildingType: string): number {
  switch (buildingType) {
    case 'MINE': return 1;
    case 'TRADING_STATION':
    case 'RESEARCH_LAB': return 2;
    case 'PLANETARY_INSTITUTE':
    case 'ACADEMY': return 3;
    default: return 0;
  }
}

/** 2거리 이내 다른 플레이어 건물 존재 여부 */
export function hasNearbyEnemyBuildings(
  hexQ: number, hexR: number,
  allBuildings: GameBuilding[],
  myPlayerId: string,
): boolean {
  return allBuildings.some(
    b => b.playerId !== myPlayerId && hexDistance(hexQ, hexR, b.hexQ, b.hexR) <= 2,
  );
}

/** 업그레이드 비용 계산 */
export function calcUpgradeCost(
  fromType: string,
  toType: string,
  hexQ: number,
  hexR: number,
  allBuildings: GameBuilding[],
  myPlayerId: string,
): ResourceCost {
  switch (toType) {
    case 'TRADING_STATION': {
      const nearbyEnemy = hasNearbyEnemyBuildings(hexQ, hexR, allBuildings, myPlayerId);
      return { credit: nearbyEnemy ? 3 : 6, ore: 2 };
    }
    case 'RESEARCH_LAB':
      return { credit: 5, ore: 3 };
    case 'PLANETARY_INSTITUTE':
      return { credit: 6, ore: 4 };
    case 'ACADEMY':
      return { credit: 6, ore: 6 };
    default:
      return {};
  }
}

export type LeechInfo = {
  playerId: string;
  seatNo: number;
  power: number;   // 실제 받을 파워
  vpCost: number;  // 지불할 VP
};

/** 파워 리치 정보 계산 */
export function calcLeechInfo(
  hexQ: number, hexR: number,
  toType: string,
  allBuildings: GameBuilding[],
  playerStates: PlayerStateResponse[],
  myPlayerId: string,
): LeechInfo[] {
  if (buildingPowerValue(toType) === 0) return [];

  // 플레이어별로 2거리 이내 건물 중 가장 높은 파워 값 계산
  const maxPowerByPlayer = new Map<string, number>();
  for (const b of allBuildings) {
    if (b.playerId !== myPlayerId && hexDistance(hexQ, hexR, b.hexQ, b.hexR) <= 2) {
      const pv = buildingPowerValue(b.buildingType);
      const prev = maxPowerByPlayer.get(b.playerId) ?? 0;
      if (pv > prev) maxPowerByPlayer.set(b.playerId, pv);
    }
  }

  const result: LeechInfo[] = [];
  for (const [pid, leechPower] of maxPowerByPlayer) {
    const ps = playerStates.find(s => s.playerId === pid);
    if (!ps) continue;
    const vpCost = leechPower - 1;
    if (ps.victoryPoints >= vpCost) {
      result.push({ playerId: pid, seatNo: ps.seatNo, power: leechPower, vpCost });
    } else {
      result.push({ playerId: pid, seatNo: ps.seatNo, power: 1, vpCost: 0 });
    }
  }
  return result;
}
