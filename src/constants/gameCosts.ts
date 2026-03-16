import type { ResourceCost } from '../types/turnActions';

export const BUILDING_COSTS: Record<string, { base: ResourceCost }> = {
  MINE: {
    base: { credit: 2, ore: 1 }
  },
  MINE_INITIAL: {
    base: { credit: 0, ore: 0 }
  },
  TRADING_STATION: {
    base: { credit: 6, ore: 2 }   // adjacency discount (3c) 추후 추가
  },
  RESEARCH_LAB: {
    base: { credit: 5, ore: 3 }
  },
  PLANETARY_INSTITUTE: {
    base: { credit: 6, ore: 4 }
  },
  ACADEMY: {
    base: { credit: 6, ore: 6 }
  },
  FLEET_PROBE: {
    base: { vp: 5 }
  },
};

// 각 건물에서 업그레이드 가능한 대상 목록
export const UPGRADE_OPTIONS: Record<string, string[]> = {
  MINE: ['TRADING_STATION'],
  TRADING_STATION: ['RESEARCH_LAB', 'PLANETARY_INSTITUTE'],
  RESEARCH_LAB: ['ACADEMY_KNOWLEDGE', 'ACADEMY_QIC'],
};
