export const PLANET_COLORS: Record<string, string> = {
  TERRA: '#4a90d9',      // 파랑
  VOLCANIC: '#c94444',   // 빨강
  OXIDE: '#e67e22',      // 주황
  DESERT: '#d4a84b',     // 노랑
  SWAMP: '#8b6b47',      // 갈색
  TITANIUM: '#7f8c8d',   // 회색
  ICE: '#b8d4e3',        // 하양
  GAIA: '#27ae60',
  TRANSDIM: '#000000',
  ASTEROIDS: '#f18fb0',
  LOST_PLANET: '#80ffe5',
  EMPTY: '#34495e',
};

/** 건물 테두리용 선명한 색상 (ICE/하양은 가시성을 위해 검정) */
export const VIVID_BORDER_COLORS: Record<string, string> = {
  TERRA: '#0077ff',      // 진한 파랑
  VOLCANIC: '#ff2020',   // 진한 빨강
  OXIDE: '#ff8800',      // 진한 주황
  DESERT: '#ffdd00',     // 진한 노랑
  SWAMP: '#7a4a1e',      // 진한 갈색
  TITANIUM: '#aaaaaa',   // 밝은 회색
  ICE: '#000000',        // 하양 → 검정
  GAIA: '#00cc44',       // 진한 초록
  TRANSDIM: '#000000',
  ASTEROIDS: '#ff4499',  // 진한 핑크
  LOST_PLANET: '#00ffdd',// 진한 민트
  EMPTY: '#34495e',
};
