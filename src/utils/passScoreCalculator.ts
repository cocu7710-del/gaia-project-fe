import type { PlayerStateResponse } from '../api/client';

/** 패스 컨텍스트 (부스터 + 고급 타일 공용) */
export interface PassContext {
  mines: number;
  ts: number;
  rl: number;
  piAcademy: number;
  gaiaCount: number;
  planetTypes: number;
  deepStructures: number;
  deepSectors: number;
  asteroidSectors: number;
  gaiaformers: number;
  fedTokenCount: number;
}

export function buildPassContext(ps: PlayerStateResponse, buildings: any[], hexes: any[], federationGroups?: any[]): PassContext {
  const myBlds = buildings.filter((b: any) => b.playerId === ps.playerId && b.buildingType !== 'GAIAFORMER' && !b.isLantidsMine);
  const mines = myBlds.filter((b: any) => b.buildingType === 'MINE' || b.buildingType === 'LOST_PLANET_MINE').length;
  const ts = myBlds.filter((b: any) => b.buildingType === 'TRADING_STATION').length;
  const rl = myBlds.filter((b: any) => b.buildingType === 'RESEARCH_LAB').length;
  const piAcademy = myBlds.filter((b: any) => b.buildingType === 'PLANETARY_INSTITUTE' || b.buildingType === 'ACADEMY').length;
  const gaiaCount = myBlds.filter((b: any) => {
    const h = hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR);
    return h && h.planetType === 'GAIA';
  }).length;
  const planetTypes = new Set<string>();
  for (const b of myBlds) {
    const h = hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR);
    if (h && h.planetType !== 'EMPTY' && h.planetType !== 'TRANSDIM') planetTypes.add(h.planetType);
  }
  const deepStructures = myBlds.filter((b: any) => {
    const h = hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR);
    return h && h.sectorId && h.sectorId.startsWith('DEEP_SECTOR');
  }).length;
  const deepSectors = new Set(myBlds
    .filter((b: any) => { const h = hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR); return h && h.sectorId && h.sectorId.startsWith('DEEP_SECTOR'); })
    .map((b: any) => { const h = hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR); return h?.sectorId; })
    .filter(Boolean)
  ).size;
  const asteroidSectors = new Set(myBlds
    .filter((b: any) => { const h = hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR); return h && h.planetType === 'ASTEROIDS'; })
    .map((b: any) => { const h = hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR); return h?.sectorId; })
    .filter(Boolean)
  ).size;
  const gaiaformersOnMap = buildings.filter((b: any) => b.playerId === ps.playerId && b.buildingType === 'GAIAFORMER').length;
  const gaiaformers = (ps.stockGaiaformer ?? 0) + gaiaformersOnMap + ((ps as any).baltaksConvertedGaiaformers ?? 0);
  const fedTokenCount = (federationGroups ?? []).filter((g: any) => g.playerId === ps.playerId).length;
  return { mines, ts, rl, piAcademy, gaiaCount, planetTypes: planetTypes.size, deepStructures, deepSectors, asteroidSectors, gaiaformers, fedTokenCount };
}

/** 부스터 패스 VP */
export function calcBoosterPassVp(boosterCode: string | null, ctx: PassContext): number {
  if (!boosterCode) return 0;
  switch (boosterCode) {
    case 'BOOSTER_4': return ctx.mines * 1;
    case 'BOOSTER_5': return ctx.rl * 3;
    case 'BOOSTER_6': return ctx.ts * 2;
    case 'BOOSTER_7': return ctx.piAcademy * 4;
    case 'BOOSTER_8': return ctx.gaiaCount * 1;
    case 'BOOSTER_9': return ctx.planetTypes * 1;
    case 'BOOSTER_10': return ctx.gaiaformers * 3;
    case 'BOOSTER_11': return ctx.deepStructures * 2;
    default: return 0;
  }
}

/** 고급 타일 패스 VP */
export function calcAdvTilePassVp(ownedTileCodes: string[], ctx: PassContext): number {
  let vp = 0;
  for (const code of ownedTileCodes) {
    switch (code) {
      case 'ADV_TILE_11': vp += ctx.deepSectors * 2; break;        // 건물이 있는 깊은 구역 섹터당 2VP
      case 'ADV_TILE_12': vp += ctx.asteroidSectors * 2; break;     // 소행성 구역당 2VP
      case 'ADV_TILE_13': vp += ctx.fedTokenCount * 3; break;       // 연방 토큰 1개당 3VP
      case 'ADV_TILE_14': vp += ctx.rl * 3; break;                  // 연구소 1개당 3VP
      case 'ADV_TILE_15': vp += ctx.planetTypes * 1; break;         // 행성 종류 1개당 1VP
    }
  }
  return vp;
}

/** 전체 패스 VP (합산) */
export function calcPassVp(boosterCode: string | null, ps: PlayerStateResponse | null, buildings: any[], hexes: any[], ownedAdvTileCodes: string[] = [], federationGroups?: any[]): number {
  if (!ps) return 0;
  const ctx = buildPassContext(ps, buildings, hexes, federationGroups);
  return calcBoosterPassVp(boosterCode, ctx) + calcAdvTilePassVp(ownedAdvTileCodes, ctx);
}

/** 패스 VP 상세 (부스터 + 고급타일 분리) */
export function calcPassVpDetail(boosterCode: string | null, ps: PlayerStateResponse | null, buildings: any[], hexes: any[], ownedAdvTileCodes: string[] = [], federationGroups?: any[]): { booster: number; advTile: number; total: number } {
  if (!ps) return { booster: 0, advTile: 0, total: 0 };
  const ctx = buildPassContext(ps, buildings, hexes, federationGroups);
  const booster = calcBoosterPassVp(boosterCode, ctx);
  const advTile = calcAdvTilePassVp(ownedAdvTileCodes, ctx);
  return { booster, advTile, total: booster + advTile };
}
