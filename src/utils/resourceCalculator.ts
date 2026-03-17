import type { PlayerStateResponse } from '../api/client';
import type { ResourceCost } from '../types/turnActions';

export class ResourceCalculator {
  static canAfford(
    playerState: PlayerStateResponse,
    cost: ResourceCost
  ): boolean {
    return (
      playerState.credit >= (cost.credit || 0) &&
      playerState.ore >= (cost.ore || 0) &&
      playerState.knowledge >= (cost.knowledge || 0) &&
      playerState.qic >= (cost.qic || 0) &&
      playerState.powerBowl3 >= (cost.power || 0) &&
      playerState.victoryPoints >= (cost.vp || 0)
    );
  }

  static applyResourceCost(
    state: PlayerStateResponse,
    cost: ResourceCost
  ): PlayerStateResponse {
    const powerCost = cost.power || 0;
    // 네블라 PI: bowl3 토큰 1개 = 2파워 (올림 계산)
    const isNevlasPi = (state as any).factionCode === 'NEVLAS' && (state as any).stockPlanetaryInstitute === 0;
    const actualTokens = isNevlasPi && powerCost > 0 ? Math.ceil(powerCost / 2) : powerCost;
    return {
      ...state,
      credit: state.credit - (cost.credit || 0),
      ore: state.ore - (cost.ore || 0),
      knowledge: state.knowledge - (cost.knowledge || 0),
      qic: state.qic - (cost.qic || 0),
      // 사용된 파워는 3구역에서 차감 → 1구역으로 반환
      powerBowl1: state.powerBowl1 + actualTokens,
      powerBowl3: state.powerBowl3 - actualTokens,
      victoryPoints: state.victoryPoints - (cost.vp || 0),
    };
  }

  static applyResourceGain(
    state: PlayerStateResponse,
    gain: ResourceCost
  ): PlayerStateResponse {
    const qicGain = gain.qic || 0;
    let qicAdd = 0;
    let oreAdd = 0;
    if (qicGain > 0 && state.factionCode === 'GLEENS') {
      // 글린: 아카데미 건설 후 QIC → 광석, 건설 전 버림
      if (state.stockAcademy < 2) oreAdd = qicGain;
    } else {
      qicAdd = qicGain;
    }
    return {
      ...state,
      credit: state.credit + (gain.credit || 0),
      ore: Math.min(15, state.ore + (gain.ore || 0) + oreAdd),
      knowledge: state.knowledge + (gain.knowledge || 0),
      qic: state.qic + qicAdd,
      powerBowl3: state.powerBowl3 + (gain.power || 0),
      powerBowl1: state.powerBowl1 + (gain.powerToken || 0),
      victoryPoints: state.victoryPoints + (gain.vp || 0),
    };
  }

  static calculateResourceDelta(
    original: PlayerStateResponse,
    preview: PlayerStateResponse
  ) {
    return {
      credit: preview.credit - original.credit,
      ore: preview.ore - original.ore,
      knowledge: preview.knowledge - original.knowledge,
      qic: preview.qic - original.qic,
      power: preview.powerBowl3 - original.powerBowl3
    };
  }
}
