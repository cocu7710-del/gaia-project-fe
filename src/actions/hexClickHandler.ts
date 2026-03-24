/**
 * 헥스 클릭 핸들러
 *
 * HexMap의 handleHexClick(~340줄)을 규칙 단위로 분리.
 * 각 규칙은 클릭을 처리했으면 true, 아니면 false를 반환.
 */

import type { GameHex, PlayerStateResponse } from '../api/client';
import type { GameAction, PlaceMineAction, FleetProbeAction, DeployGaiaformerAction, BoosterAction } from '../types/turnActions';
import { UPGRADE_OPTIONS, BUILDING_COSTS } from '../constants/gameCosts';
import { getTerraformDiscount, getNavBonus } from '../utils/terraformingCalculator';
import { getNavigationCost, navLevelToRange, getNavRangeBonus } from '../utils/navigationCalculator';
import { calcMineCost } from '../utils/mineActionCalculator';
import type { ResourceCost } from '../types/turnActions';

function getSectorIdFromHex(hex: GameHex): string | null {
  const anyHex = hex as any;
  return (anyHex.sectorId ?? anyHex.sector_id ?? null) as string | null;
}

// ============================================================
// Context / Callbacks
// ============================================================

export interface HexClickContext {
  hex: GameHex;
  roomId: string;
  playerId: string;
  mySeatNo: number;
  mySeat: { raceCode: string; homePlanetType: string };
  gamePhase: string | null;
  isMyTurn: boolean;

  buildingByCoord: Map<string, any>;
  buildings: any[];
  hexes: GameHex[];
  turnState: {
    pendingActions: GameAction[];
    previewPlayerState: PlayerStateResponse | null;
    tentativeBuildings: any[];
  };
  playerStates: PlayerStateResponse[];
  fleetShipMode: any | null;
  federationMode: any | null;
  fleetProbes: Record<string, string[]>;
  techTileData: any;
  lantidsParasiteByCoord: Map<string, any>;
  seats: any[];
  upgradeChoiceHex: { hexQ: number; hexR: number } | null;
  tinkeroidsExtraRingPlanet: string | null;
  moweidsExtraRingPlanet: string | null;
  tentativeTechTileCode: string | null;
}

export interface HexClickCallbacks {
  addPendingAction: (action: GameAction) => void;
  addTentativeBuilding: (building: any) => void;
  completeFleetShipHexSelection: (patch: Record<string, unknown>, building: any) => void;
  addFederationBuilding: (q: number, r: number) => void;
  removeFederationBuilding: (q: number, r: number) => void;
  addFederationToken: (q: number, r: number) => void;
  removeFederationToken: (q: number, r: number) => void;
  addUpgradeAction: (hexQ: number, hexR: number, fromType: string, toType: string) => void;
  setUpgradeChoiceHex: (val: { hexQ: number; hexR: number; fromType: string; px: number; py: number } | null) => void;
  updatePreviewState: () => void;
  axialToPixel: (q: number, r: number) => { x: number; y: number };
}

// ============================================================
// 헬퍼
// ============================================================

function uid(): string {
  return `action-${Date.now()}-${Math.random()}`;
}

function getMyState(ctx: HexClickContext): PlayerStateResponse | null {
  return ctx.turnState.previewPlayerState ?? ctx.playerStates.find(p => p.seatNo === ctx.mySeatNo) ?? null;
}

function getMyBuildings(ctx: HexClickContext): any[] {
  return [...ctx.buildings, ...ctx.turnState.tentativeBuildings].filter(b => b.playerId === ctx.playerId);
}

function calcNavInfo(ctx: HexClickContext, extraNavBonus = 0) {
  const myState = getMyState(ctx)!;
  const myBuildings = getMyBuildings(ctx);
  const effectiveNavRange = navLevelToRange(myState.techNavigation) + getNavRangeBonus(ctx.techTileData, ctx.playerId) + extraNavBonus;
  return getNavigationCost(ctx.hex.hexQ, ctx.hex.hexR, myBuildings, effectiveNavRange, myState.qic);
}

// ============================================================
// 규칙 1: 연방 모드
// ============================================================

function handleFederationMode(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  if (!ctx.federationMode) return false;

  if (ctx.federationMode.phase === 'SELECT_BUILDINGS') {
    const already = ctx.federationMode.selectedBuildings.some((h: number[]) => h[0] === ctx.hex.hexQ && h[1] === ctx.hex.hexR);
    if (already) cb.removeFederationBuilding(ctx.hex.hexQ, ctx.hex.hexR);
    else cb.addFederationBuilding(ctx.hex.hexQ, ctx.hex.hexR);
    return true;
  }

  if (ctx.federationMode.phase === 'PLACE_TOKENS') {
    const already = ctx.federationMode.placedTokens.some((h: number[]) => h[0] === ctx.hex.hexQ && h[1] === ctx.hex.hexR);
    if (already) cb.removeFederationToken(ctx.hex.hexQ, ctx.hex.hexR);
    else cb.addFederationToken(ctx.hex.hexQ, ctx.hex.hexR);
    return true;
  }

  return true; // SELECT_TILE 등 → 클릭 무시
}

// ============================================================
// 규칙 2: 함대 선박 hex 선택 모드
// ============================================================

function handleFleetShipMode(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  if (!ctx.fleetShipMode) return false;

  const buildingType = ctx.fleetShipMode.needsUpgradeMineToTs ? 'TRADING_STATION'
    : ctx.fleetShipMode.needsTsToRl ? 'RESEARCH_LAB'
    : ctx.fleetShipMode.needsGaiaformHex ? 'GAIAFORMER'
    : 'MINE';

  cb.completeFleetShipHexSelection(
    { hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR },
    { id: `temp-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId, hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType },
  );
  return true;
}

// ============================================================
// 규칙 3: 팩션 능력 hex 선택
// ============================================================

function handleFactionAbilityHex(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  const pending = ctx.turnState.pendingActions;

  // 하이브 우주정거장
  const ivits = pending.find(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'IVITS_PLACE_STATION');
  if (ivits && ctx.hex.planetType === 'EMPTY') {
    ivits.payload.hexQ = ctx.hex.hexQ;
    ivits.payload.hexR = ctx.hex.hexR;
    cb.addTentativeBuilding({ id: `temp-station-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId, hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'SPACE_STATION' });
    return true;
  }

  // 파이락 다운그레이드
  const firaks = pending.find(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'FIRAKS_DOWNGRADE' && !a.payload?.hexQ);
  if (firaks) {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    if (building?.playerId === ctx.playerId && building?.buildingType === 'RESEARCH_LAB') {
      firaks.payload.hexQ = ctx.hex.hexQ;
      firaks.payload.hexR = ctx.hex.hexR;
      cb.addTentativeBuilding({ id: `temp-firaks-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId, hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'TRADING_STATION' });
    }
    return true;
  }

  // 엠바스 교환
  const ambas = pending.find(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'AMBAS_SWAP' && !a.payload?.hexQ);
  if (ambas) {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    if (building?.playerId === ctx.playerId && building?.buildingType === 'MINE') {
      ambas.payload.hexQ = ctx.hex.hexQ;
      ambas.payload.hexR = ctx.hex.hexR;
      cb.addTentativeBuilding({ id: `temp-ambas-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId, hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'PLANETARY_INSTITUTE' });
      cb.updatePreviewState();
    }
    return true;
  }

  // 모웨이드 링
  const moweids = pending.find(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'MOWEIDS_RING' && !a.payload?.hexQ);
  if (moweids) {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    if (building?.playerId === ctx.playerId && !(building as any).hasRing) {
      moweids.payload.hexQ = ctx.hex.hexQ;
      moweids.payload.hexR = ctx.hex.hexR;
      cb.updatePreviewState();
    }
    return true;
  }

  return false;
}

// ============================================================
// 규칙 4: 기타 pending 차단
// ============================================================

// ============================================================
// 규칙 4.5: 검은행성 배치
// ============================================================

function handleLostPlanet(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  const lostPlanetAction = ctx.turnState.pendingActions.find(
    a => a.type === 'PLACE_LOST_PLANET' && a.payload?.hexQ == null,
  );
  if (!lostPlanetAction) return false;

  if (ctx.hex.planetType !== 'EMPTY') return true; // 처리됨 (무효 클릭)

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return true;

  // 좌표 기록 + tentative building
  lostPlanetAction.payload.hexQ = ctx.hex.hexQ;
  lostPlanetAction.payload.hexR = ctx.hex.hexR;
  cb.addTentativeBuilding({
    id: `temp-lp-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId,
    hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'LOST_PLANET_MINE',
  });
  cb.updatePreviewState();
  return true;
}

function handleBlockOtherPending(ctx: HexClickContext): boolean {
  const pending = ctx.turnState.pendingActions;
  if (pending.length === 0) return false;

  const terraformDiscount = getTerraformDiscount(pending);
  const navBonus = getNavBonus(pending);
  const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
  const hasPendingNavBoost = navBonus > 0 && !pending.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE' || a.type === 'DEPLOY_GAIAFORMER');
  const boosterAct = pending.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined;
  const hasPendingGaiaformerBooster = boosterAct?.payload.actionType === 'PLACE_GAIAFORMER' && !pending.some(a => a.type === 'PLACE_MINE');

  if (!hasPendingTerraform && !hasPendingNavBoost && !hasPendingGaiaformerBooster) {
    return true; // 차단
  }
  return false;
}

// ============================================================
// 규칙 5: 함대 입장
// ============================================================

function handleFleetProbe(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  const sectorId = getSectorIdFromHex(ctx.hex);
  if (!sectorId?.startsWith('FORGOTTEN_FLEET_')) return false;

  const fleetName = sectorId.replace('FORGOTTEN_FLEET_', '');
  const navBonus = getNavBonus(ctx.turnState.pendingActions);
  const myState = getMyState(ctx);
  const { qicNeeded: navQic } = calcNavInfo(ctx, navBonus);
  const baseCost = BUILDING_COSTS.FLEET_PROBE.base;
  const cost = navQic > 0 ? { ...baseCost, qic: (baseCost.qic ?? 0) + navQic } : baseCost;
  const slotIndex = (ctx.fleetProbes[fleetName] || []).length;
  const powerCharge = (slotIndex === 1 || slotIndex === 2) ? 2 : slotIndex === 3 ? 3 : 0;

  const action: FleetProbeAction = {
    id: uid(), type: 'FLEET_PROBE', timestamp: Date.now(),
    payload: { fleetName, cost, powerCharge },
  };
  cb.addPendingAction(action);
  return true;
}

// ============================================================
// 규칙 6: TRANSDIM 가이아포머 배치
// ============================================================

function handleGaiaformerDeploy(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  if (ctx.hex.planetType !== 'TRANSDIM') return false;
  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return false;

  const pending = ctx.turnState.pendingActions;
  const navBonus = getNavBonus(pending);
  const boosterAct = pending.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined;
  const isBoosterGaiaformer = boosterAct?.payload.actionType === 'PLACE_GAIAFORMER' && !pending.some(a => a.type === 'PLACE_MINE');

  const myState = getMyState(ctx);
  if (!myState) return false;

  const gaiaLevel = myState.techGaia;
  const powerSpent = isBoosterGaiaformer ? 0 : (gaiaLevel <= 2 ? 6 : gaiaLevel === 3 ? 4 : gaiaLevel === 4 ? 5 : 4);
  const { qicNeeded: navQic } = calcNavInfo(ctx, navBonus);

  const action: DeployGaiaformerAction = {
    id: uid(), type: 'DEPLOY_GAIAFORMER', timestamp: Date.now(),
    payload: { hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, powerSpent, qicUsed: navQic },
  };
  cb.addPendingAction(action);
  cb.addTentativeBuilding({
    id: `temp-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId,
    hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'GAIAFORMER',
  });
  return true;
}

// ============================================================
// 규칙 7: GAIA 행성 가이아포머 → 광산
// ============================================================

function handleGaiaMine(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (!building || building.playerId !== ctx.playerId || building.buildingType !== 'GAIAFORMER' || ctx.hex.planetType !== 'GAIA') return false;

  const action: PlaceMineAction = {
    id: uid(), type: 'PLACE_MINE', timestamp: Date.now(),
    payload: { hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, cost: { credit: 2, ore: 1 } },
  };
  cb.addPendingAction(action);
  cb.addTentativeBuilding({
    id: `temp-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId,
    hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'MINE',
  });
  return true;
}

// ============================================================
// 규칙 8: 셋업 광산 배치
// ============================================================

function handleSetupMine(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  if (!ctx.gamePhase?.startsWith('SETUP_MINE')) return false;

  const setupBuildingType = (ctx.mySeat.raceCode === 'IVITS' || ctx.mySeat.raceCode === 'TINKEROIDS')
    ? 'PLANETARY_INSTITUTE' : 'MINE';

  const action: PlaceMineAction = {
    id: uid(), type: 'PLACE_MINE', timestamp: Date.now(),
    payload: { hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, cost: { credit: 0, ore: 0 } },
  };
  cb.addPendingAction(action);
  cb.addTentativeBuilding({
    id: `temp-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId,
    hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: setupBuildingType,
  });
  return true;
}

// ============================================================
// 규칙 9: 업그레이드
// ============================================================

function handleUpgrade(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  if (ctx.gamePhase !== 'PLAYING') return false;

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (!building || building.playerId !== ctx.playerId) return false;

  const pending = ctx.turnState.pendingActions;
  const terraformDiscount = getTerraformDiscount(pending);
  const navBonus = getNavBonus(pending);
  const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
  const hasPendingNavBoost = navBonus > 0 && !pending.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE' || a.type === 'DEPLOY_GAIAFORMER');
  if (hasPendingTerraform || hasPendingNavBoost) return false;

  const fromType = building.buildingType;
  const options = UPGRADE_OPTIONS[fromType];
  if (!options) return false;

  if (options.length === 1) {
    cb.addUpgradeAction(ctx.hex.hexQ, ctx.hex.hexR, fromType, options[0]);
  } else {
    if (ctx.upgradeChoiceHex?.hexQ === ctx.hex.hexQ && ctx.upgradeChoiceHex?.hexR === ctx.hex.hexR) {
      cb.setUpgradeChoiceHex(null);
    } else {
      const { x: px, y: py } = cb.axialToPixel(ctx.hex.hexQ, ctx.hex.hexR);
      cb.setUpgradeChoiceHex({ hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, fromType, px, py });
    }
  }
  return true;
}

// ============================================================
// 규칙 10: 란티다 기생 광산
// ============================================================

function handleLantidsMine(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  if (ctx.gamePhase !== 'PLAYING' || ctx.mySeat.raceCode !== 'LANTIDS') return false;

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (!building || building.playerId === ctx.playerId) return false;
  if (ctx.lantidsParasiteByCoord.has(`${ctx.hex.hexQ},${ctx.hex.hexR}`)) return false;

  const myState = getMyState(ctx);
  if (!myState) return false;

  const navBonus = getNavBonus(ctx.turnState.pendingActions);
  const { qicNeeded: navQic } = calcNavInfo(ctx, navBonus);
  const cost: ResourceCost = { credit: 2, ore: 1, qic: navQic };

  const action: PlaceMineAction = {
    id: uid(), type: 'PLACE_MINE', timestamp: Date.now(),
    payload: { hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, cost, gaiaformerUsed: false, isLantidsMine: true },
  };
  cb.addPendingAction(action);
  cb.addTentativeBuilding({
    id: `temp-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId,
    hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'MINE', isLantidsMine: true,
  });
  return true;
}

// ============================================================
// 규칙 11: 일반 광산 건설
// ============================================================

function handlePlayingMine(ctx: HexClickContext, cb: HexClickCallbacks): boolean {
  if (ctx.gamePhase !== 'PLAYING') return false;

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return false;

  const myState = getMyState(ctx);
  if (!myState) return false;

  const pending = ctx.turnState.pendingActions;
  let terraformDiscount = getTerraformDiscount(pending);
  const navBonus = getNavBonus(pending);

  // 2삽 기술 타일 할인
  const TERRAFORM_2_TILES = ['BASIC_EXP_TILE_3'];
  if (terraformDiscount === 0 && pending.some(a => a.type === 'UPGRADE_BUILDING')
    && ctx.tentativeTechTileCode && TERRAFORM_2_TILES.includes(ctx.tentativeTechTileCode)) {
    terraformDiscount = 2;
  }

  const { qicNeeded: navQic } = calcNavInfo(ctx, navBonus);

  const result = calcMineCost(
    ctx.hex.planetType, ctx.mySeat.raceCode, ctx.mySeat.homePlanetType,
    myState.techTerraforming, terraformDiscount, myState, ctx.seats, navQic,
    ctx.tinkeroidsExtraRingPlanet, ctx.moweidsExtraRingPlanet,
  );

  if (!result.possible) {
    alert('자원이 부족합니다.');
    return true; // 처리됨 (에러)
  }

  const cost: ResourceCost = { credit: result.credit, ore: result.ore, qic: result.qic };

  // 기오덴 PI: 새 행성 개척 여부
  const isGeodensNewPlanet = ctx.mySeat.raceCode === 'GEODENS'
    && myState.stockPlanetaryInstitute === 0
    && !result.gaiaformerUsed;

  // 다카니안 PI: 새 섹터 여부
  let isDakaniansNewSector: boolean | undefined;
  if (ctx.mySeat.raceCode === 'DAKANIANS' && myState.stockPlanetaryInstitute === 0) {
    const targetSectorId = getSectorIdFromHex(ctx.hex);
    if (targetSectorId) {
      const sectorHexes = ctx.hexes.filter(h => getSectorIdFromHex(h) === targetSectorId);
      const myBlds = ctx.buildings.filter(b => b.playerId === ctx.playerId);
      const hasMyBuildingInSector = sectorHexes.some(sh => myBlds.some(b => b.hexQ === sh.hexQ && b.hexR === sh.hexR));
      isDakaniansNewSector = !hasMyBuildingInSector || undefined;
    }
  }

  const action: PlaceMineAction = {
    id: uid(), type: 'PLACE_MINE', timestamp: Date.now(),
    payload: {
      hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, cost,
      gaiaformerUsed: result.gaiaformerUsed || undefined,
      vpBonus: result.vpBonus || undefined,
      isNewPlanet: isGeodensNewPlanet || undefined,
      isNewSector: isDakaniansNewSector,
    },
  };
  cb.addPendingAction(action);
  cb.addTentativeBuilding({
    id: `temp-${Date.now()}`, gameId: ctx.roomId, playerId: ctx.playerId,
    hexQ: ctx.hex.hexQ, hexR: ctx.hex.hexR, buildingType: 'MINE',
  });
  return true;
}

// ============================================================
// 메인: 규칙 체인 실행
// ============================================================

type HexClickRule = (ctx: HexClickContext, cb: HexClickCallbacks) => boolean;

const RULES: HexClickRule[] = [
  handleFederationMode,
  handleFleetShipMode,
  handleFactionAbilityHex,
  handleLostPlanet,
  (ctx) => handleBlockOtherPending(ctx), // cb 불필요
  handleFleetProbe,
  handleGaiaformerDeploy,
  handleGaiaMine,
  handleSetupMine,
  handleUpgrade,
  handleLantidsMine,
  handlePlayingMine,
];

export function handleHexClick(ctx: HexClickContext, cb: HexClickCallbacks): void {
  // 기본 조건
  if (ctx.federationMode) {
    handleFederationMode(ctx, cb);
    return;
  }
  if (!ctx.isMyTurn || !ctx.mySeat || !ctx.playerId) return;

  for (const rule of RULES) {
    if (rule(ctx, cb)) return;
  }
}
