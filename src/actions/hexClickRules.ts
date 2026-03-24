/**
 * 헥스 클릭 가능 여부 규칙 체인
 *
 * HexMap의 isHexClickable(~250줄)을 개별 규칙 함수로 분리.
 * 각 규칙은 { clickable, handled } 를 반환:
 *   handled=true → 이 규칙이 최종 결정, 이후 규칙 무시
 *   handled=false → 다음 규칙으로 넘김
 */

import type { GameHex, PlayerStateResponse } from '../api/client';
import type { GameAction, BoosterAction } from '../types/turnActions';
import type { ResourceCost } from '../types/turnActions';
import { ResourceCalculator } from '../utils/resourceCalculator';
import { UPGRADE_OPTIONS } from '../constants/gameCosts';
import { HOME_PLANET_TYPES, getTerraformDiscount, getNavBonus } from '../utils/terraformingCalculator';
import { getNavigationCost, navLevelToRange, getNavRangeBonus } from '../utils/navigationCalculator';
import { calcMineCost } from '../utils/mineActionCalculator';
import { calcUpgradeCost } from '../utils/upgradeCalculator';

// ============================================================
// 공통 타입
// ============================================================

export interface HexClickContext {
  hex: GameHex;
  playerId: string | null;
  mySeatNo: number | null;
  mySeat: { raceCode: string; homePlanetType: string } | null;
  gamePhase: string | null;
  isMyTurn: boolean;

  // 건물/맵 데이터
  buildingByCoord: Map<string, any>;
  buildings: any[];
  tentativeBuildings: any[];

  // pending 상태
  pendingActions: GameAction[];
  previewPlayerState: PlayerStateResponse | null;
  playerStates: PlayerStateResponse[];

  // 모드
  fleetShipMode: any | null;
  federationMode: any | null;

  // 기타
  fleetProbes: Record<string, string[]>;
  techTileData: any;
  lantidsParasiteByCoord: Map<string, boolean>;
  seats: any[];
  tinkeroidsExtraRingPlanet: string | null;
  moweidsExtraRingPlanet: string | null;
  tentativeTechTileCode: string | null;
}

interface RuleResult {
  clickable: boolean;
  handled: boolean;
}

const SKIP: RuleResult = { clickable: false, handled: false };

// ============================================================
// 헬퍼: 내 건물 목록, 상태, 항법 거리 계산
// ============================================================

function getMyState(ctx: HexClickContext): PlayerStateResponse | null {
  return ctx.previewPlayerState ?? ctx.playerStates.find(p => p.seatNo === ctx.mySeatNo) ?? null;
}

function getMyBuildings(ctx: HexClickContext): any[] {
  return [...ctx.buildings, ...ctx.tentativeBuildings].filter(b => b.playerId === ctx.playerId);
}

function checkNavReachable(ctx: HexClickContext, myState: PlayerStateResponse, extraNavBonus = 0): boolean {
  const myBuildings = getMyBuildings(ctx);
  const effectiveNavRange = navLevelToRange(myState.techNavigation) + getNavRangeBonus(ctx.techTileData, ctx.playerId) + extraNavBonus;
  const { reachable } = getNavigationCost(ctx.hex.hexQ, ctx.hex.hexR, myBuildings, effectiveNavRange, myState.qic);
  return reachable;
}

// ============================================================
// 규칙 1: 연방 모드
// ============================================================

function ruleFederationMode(ctx: HexClickContext): RuleResult {
  if (!ctx.federationMode) return SKIP;

  if (ctx.federationMode.phase === 'SELECT_BUILDINGS') {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    return { clickable: !!building && building.playerId === ctx.playerId, handled: true };
  }

  if (ctx.federationMode.phase === 'PLACE_TOKENS') {
    if (ctx.hex.planetType !== 'EMPTY') return { clickable: false, handled: true };
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    if (building?.playerId === ctx.playerId) return { clickable: false, handled: true };
    return { clickable: true, handled: true };
  }

  return { clickable: false, handled: true }; // SELECT_TILE 등
}

// ============================================================
// 규칙 2: 기본 조건 (내 턴, 좌석 있음)
// ============================================================

function ruleBasicConditions(ctx: HexClickContext): RuleResult {
  if (!ctx.isMyTurn || !ctx.mySeat) return { clickable: false, handled: true };
  return SKIP;
}

// ============================================================
// 규칙 3: 함대 선박 hex 선택 모드
// ============================================================

function ruleFleetShipMode(ctx: HexClickContext): RuleResult {
  if (!ctx.fleetShipMode) return SKIP;

  const sectorId = getSectorIdFromHex(ctx.hex, ctx);
  if (sectorId?.startsWith('FORGOTTEN_FLEET_')) return { clickable: false, handled: true };

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  const myState = getMyState(ctx);

  if (ctx.fleetShipMode.needsGaiaformHex) {
    if (ctx.hex.planetType !== 'TRANSDIM' || building) return { clickable: false, handled: true };
    if (!myState || myState.stockGaiaformer <= 0) return { clickable: false, handled: true };
    return { clickable: checkNavReachable(ctx, myState), handled: true };
  }

  if (ctx.fleetShipMode.needsAsteroidHex) {
    if (ctx.hex.planetType !== 'ASTEROIDS' || building) return { clickable: false, handled: true };
    if (!myState) return { clickable: false, handled: true };
    return { clickable: checkNavReachable(ctx, myState), handled: true };
  }

  if (ctx.fleetShipMode.needsUpgradeMineToTs) {
    return { clickable: building?.playerId === ctx.playerId && building?.buildingType === 'MINE', handled: true };
  }

  if (ctx.fleetShipMode.needsTsToRl) {
    return { clickable: building?.playerId === ctx.playerId && building?.buildingType === 'TRADING_STATION', handled: true };
  }

  return { clickable: false, handled: true };
}

// ============================================================
// 규칙 4: 팩션 능력 hex 선택 (IVITS, FIRAKS, AMBAS, MOWEIDS)
// ============================================================

function ruleFactionAbilityHex(ctx: HexClickContext): RuleResult {
  const pending = ctx.pendingActions;

  // 하이브 우주정거장
  const ivitsPending = pending.some(
    a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'IVITS_PLACE_STATION',
  ) && !pending.some(a => a.type === 'PLACE_MINE');

  if (ivitsPending) {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    if (ctx.hex.planetType !== 'EMPTY' || building) return { clickable: false, handled: true };
    const myState = getMyState(ctx);
    if (!myState) return { clickable: false, handled: true };
    return { clickable: checkNavReachable(ctx, myState), handled: true };
  }

  // 파이락 다운그레이드
  const firaksPending = pending.some(
    a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'FIRAKS_DOWNGRADE' && !a.payload?.hexQ,
  );
  if (firaksPending) {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    return { clickable: building?.playerId === ctx.playerId && building?.buildingType === 'RESEARCH_LAB', handled: true };
  }

  // 엠바스 교환
  const ambasPending = pending.some(
    a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'AMBAS_SWAP' && !a.payload?.hexQ,
  );
  if (ambasPending) {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    return { clickable: building?.playerId === ctx.playerId && building?.buildingType === 'MINE', handled: true };
  }

  // 모웨이드 링
  const moweidsRingPending = pending.some(
    a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'MOWEIDS_RING' && !a.payload?.hexQ,
  );
  if (moweidsRingPending) {
    const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
    return { clickable: !!building && building.playerId === ctx.playerId && !building.hasRing, handled: true };
  }

  return SKIP;
}

// ============================================================
// 규칙 5: 함대 입장 (FORGOTTEN_FLEET)
// ============================================================

function ruleFleetProbe(ctx: HexClickContext): RuleResult {
  const sectorId = getSectorIdFromHex(ctx.hex, ctx);
  if (!sectorId?.startsWith('FORGOTTEN_FLEET_')) return SKIP;

  const pending = ctx.pendingActions;
  const terraformDiscount = getTerraformDiscount(pending);
  const navBonus = getNavBonus(pending);
  const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
  const hasOther = computeHasOtherPending(ctx);

  if (hasOther || hasPendingTerraform) return { clickable: false, handled: true };
  if (ctx.gamePhase !== 'PLAYING') return { clickable: false, handled: true };

  const fleetName = sectorId.replace('FORGOTTEN_FLEET_', '');
  if (ctx.playerId && (ctx.fleetProbes[fleetName] || []).includes(ctx.playerId)) return { clickable: false, handled: true };
  if (ctx.playerId) {
    const myFleetCount = Object.values(ctx.fleetProbes).filter(ids => ids.includes(ctx.playerId!)).length;
    if (myFleetCount >= 3) return { clickable: false, handled: true };
  }

  const myState = getMyState(ctx);
  if (!myState || myState.victoryPoints < 5) return { clickable: false, handled: true };
  if ((myState.factionCode === 'NEVLAS' || myState.factionCode === 'ITARS')
    && (myState.powerBowl1 + myState.powerBowl2 + myState.powerBowl3) <= 0) return { clickable: false, handled: true };

  return { clickable: checkNavReachable(ctx, myState, navBonus), handled: true };
}

// ============================================================
// 규칙 5.5: 검은행성 배치 (PLACE_LOST_PLANET pending, hexQ 미설정)
// ============================================================

function ruleLostPlanet(ctx: HexClickContext): RuleResult {
  const lostPlanetPending = ctx.pendingActions.some(
    a => a.type === 'PLACE_LOST_PLANET' && a.payload?.hexQ == null,
  );
  if (!lostPlanetPending) return SKIP;

  // EMPTY 헥스만
  if (ctx.hex.planetType !== 'EMPTY') return { clickable: false, handled: true };

  // 기존 건물 없음
  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return { clickable: false, handled: true };

  // 항법 거리 체크
  const myState = getMyState(ctx);
  if (!myState) return { clickable: false, handled: true };
  return { clickable: checkNavReachable(ctx, myState), handled: true };
}

// ============================================================
// 규칙 5.6: 2삽 기술 타일 광산 배치 모드
// ============================================================

function ruleTerraform2Mine(ctx: HexClickContext): RuleResult {
  const pending = ctx.pendingActions;
  const TERRAFORM_2_TILES = ['BASIC_EXP_TILE_3'];
  const isActive = pending.some(a => a.type === 'UPGRADE_BUILDING')
    && ctx.tentativeTechTileCode != null
    && TERRAFORM_2_TILES.includes(ctx.tentativeTechTileCode)
    && !pending.some(a => a.type === 'PLACE_MINE');
  if (!isActive) return SKIP;

  // 빈 행성만 (건물 있으면 불가)
  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return { clickable: false, handled: true };

  const isMineable = HOME_PLANET_TYPES.has(ctx.hex.planetType)
    || ctx.hex.planetType === ctx.mySeat?.homePlanetType
    || ctx.hex.planetType === 'ASTEROIDS'
    || ctx.hex.planetType === 'LOST_PLANET'
    || ctx.hex.planetType === 'GAIA';
  if (!isMineable) return { clickable: false, handled: true };

  const myState = getMyState(ctx);
  if (!myState || myState.stockMine <= 0) return { clickable: false, handled: true };

  // 2삽 할인 적용
  const navBonus = getNavBonus(pending);
  const effectiveNavRange = navLevelToRange(myState.techNavigation) + getNavRangeBonus(ctx.techTileData, ctx.playerId) + navBonus;
  const myBuildings = getMyBuildings(ctx);
  const { reachable, qicNeeded: navQic } = getNavigationCost(ctx.hex.hexQ, ctx.hex.hexR, myBuildings, effectiveNavRange, myState.qic);
  if (!reachable) return { clickable: false, handled: true };

  const result = calcMineCost(
    ctx.hex.planetType, ctx.mySeat!.raceCode, ctx.mySeat!.homePlanetType,
    myState.techTerraforming, 2, myState, ctx.seats, navQic,
    ctx.tinkeroidsExtraRingPlanet, ctx.moweidsExtraRingPlanet,
  );
  return { clickable: result.possible, handled: true };
}

// ============================================================
// 규칙 6: 기타 pending이 있으면 차단
// ============================================================

function ruleBlockOtherPending(ctx: HexClickContext): RuleResult {
  if (computeHasOtherPending(ctx)) return { clickable: false, handled: true };
  return SKIP;
}

// ============================================================
// 규칙 7: 부스터 즉시 가이아포머 배치
// ============================================================

function ruleBoosterGaiaformer(ctx: HexClickContext): RuleResult {
  const pending = ctx.pendingActions;
  const boosterAct = pending.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined;
  const hasPendingGaiaformerBooster = boosterAct?.payload.actionType === 'PLACE_GAIAFORMER'
    && !pending.some(a => a.type === 'PLACE_MINE');
  if (!hasPendingGaiaformerBooster) return SKIP;

  if (ctx.hex.planetType !== 'TRANSDIM') return { clickable: false, handled: true };
  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return { clickable: false, handled: true };
  const myState = getMyState(ctx);
  if (!myState || myState.stockGaiaformer < 1) return { clickable: false, handled: true };
  const navBonus = getNavBonus(pending);
  return { clickable: checkNavReachable(ctx, myState, navBonus), handled: true };
}

// ============================================================
// 규칙 8: TRANSDIM 가이아포머 배치 (일반)
// ============================================================

function ruleGaiaformerDeploy(ctx: HexClickContext): RuleResult {
  if (ctx.hex.planetType !== 'TRANSDIM' || ctx.gamePhase !== 'PLAYING') return SKIP;

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return SKIP; // 건물 있으면 다른 규칙에서 처리

  const pending = ctx.pendingActions;
  const terraformDiscount = getTerraformDiscount(pending);
  const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
  if (hasPendingTerraform) return { clickable: false, handled: true };

  const myState = getMyState(ctx);
  if (!myState || myState.stockGaiaformer < 1) return { clickable: false, handled: true };
  const gaiaLevel = myState.techGaia;
  const requiredPower = gaiaLevel <= 2 ? 6 : gaiaLevel === 3 ? 4 : gaiaLevel === 4 ? 5 : 4;
  const totalPower = myState.powerBowl1 + myState.powerBowl2 + myState.powerBowl3;
  if (totalPower < requiredPower) return { clickable: false, handled: true };

  const navBonus = getNavBonus(pending);
  return { clickable: checkNavReachable(ctx, myState, navBonus), handled: true };
}

// ============================================================
// 규칙 9: 건물이 있는 헥스 (업그레이드, 가이아 광산, 란티다 기생)
// ============================================================

function ruleBuildingHex(ctx: HexClickContext): RuleResult {
  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (!building) return SKIP;

  const pending = ctx.pendingActions;
  const terraformDiscount = getTerraformDiscount(pending);
  const navBonus = getNavBonus(pending);
  const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
  const hasPendingNavBoost = navBonus > 0 && !pending.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE' || a.type === 'DEPLOY_GAIAFORMER');

  // GAIA 행성 가이아포머 → 광산
  if (ctx.gamePhase === 'PLAYING' && building.playerId === ctx.playerId && building.buildingType === 'GAIAFORMER' && ctx.hex.planetType === 'GAIA') {
    const myState = getMyState(ctx);
    if (!myState || myState.stockMine <= 0) return { clickable: false, handled: true };
    return { clickable: myState.credit >= 2 && myState.ore >= 1, handled: true };
  }

  // 내 건물 업그레이드
  if (ctx.gamePhase === 'PLAYING' && building.playerId === ctx.playerId && !hasPendingTerraform && !hasPendingNavBoost) {
    const options = UPGRADE_OPTIONS[building.buildingType];
    if (!options) return { clickable: false, handled: true };
    const myState = getMyState(ctx);
    if (!myState) return { clickable: true, handled: true };
    const allBuildings = [...ctx.buildings, ...ctx.tentativeBuildings];
    const canUpgrade = options.some(toType => {
      const stock = toType === 'TRADING_STATION' ? myState.stockTradingStation
        : toType === 'RESEARCH_LAB' ? myState.stockResearchLab
        : toType === 'PLANETARY_INSTITUTE' ? myState.stockPlanetaryInstitute
        : toType === 'ACADEMY' ? myState.stockAcademy : 1;
      if (stock <= 0) return false;
      const cost = calcUpgradeCost(building.buildingType, toType, building.hexQ, building.hexR, allBuildings, ctx.playerId!);
      return ResourceCalculator.canAfford(myState, cost);
    });
    return { clickable: canUpgrade, handled: true };
  }

  // 란티다 기생 광산
  if (ctx.gamePhase === 'PLAYING' && ctx.mySeat?.raceCode === 'LANTIDS'
    && building.playerId !== ctx.playerId && !ctx.lantidsParasiteByCoord.has(`${ctx.hex.hexQ},${ctx.hex.hexR}`)) {
    if (hasPendingTerraform || computeHasOtherPending(ctx)) return { clickable: false, handled: true };
    const myState = getMyState(ctx);
    if (!myState || myState.stockMine <= 0) return { clickable: false, handled: true };
    if (myState.credit < 2 || myState.ore < 1) return { clickable: false, handled: true };
    return { clickable: checkNavReachable(ctx, myState, navBonus), handled: true };
  }

  return { clickable: false, handled: true };
}

// ============================================================
// 규칙 10: 셋업 광산 배치
// ============================================================

function ruleSetupMine(ctx: HexClickContext): RuleResult {
  if (!ctx.gamePhase?.startsWith('SETUP_MINE')) return SKIP;

  // 행성 타입 필터
  const isMineable = HOME_PLANET_TYPES.has(ctx.hex.planetType)
    || ctx.hex.planetType === ctx.mySeat?.homePlanetType
    || ctx.hex.planetType === 'ASTEROIDS'
    || ctx.hex.planetType === 'LOST_PLANET'
    || ctx.hex.planetType === 'GAIA';
  if (!isMineable) return { clickable: false, handled: true };

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return { clickable: false, handled: true };

  return { clickable: ctx.hex.planetType === ctx.mySeat?.homePlanetType, handled: true };
}

// ============================================================
// 규칙 11: PLAYING 광산 건설
// ============================================================

function rulePlayingMine(ctx: HexClickContext): RuleResult {
  if (ctx.gamePhase !== 'PLAYING') return SKIP;

  // 행성 타입 필터
  const isMineable = HOME_PLANET_TYPES.has(ctx.hex.planetType)
    || ctx.hex.planetType === ctx.mySeat?.homePlanetType
    || ctx.hex.planetType === 'ASTEROIDS'
    || ctx.hex.planetType === 'LOST_PLANET'
    || ctx.hex.planetType === 'GAIA';
  if (!isMineable) return { clickable: false, handled: true };

  const building = ctx.buildingByCoord.get(`${ctx.hex.hexQ},${ctx.hex.hexR}`);
  if (building) return SKIP; // 건물 있는 헥스는 ruleBuildingHex에서 처리

  const myState = getMyState(ctx);
  if (!myState || myState.stockMine <= 0) return { clickable: false, handled: true };

  const pending = ctx.pendingActions;
  let terraformDiscount = getTerraformDiscount(pending);
  const navBonus = getNavBonus(pending);

  // 2삽 기술 타일 할인 (UPGRADE_BUILDING + tentativeTechTileCode)
  const TERRAFORM_2_TILES = ['BASIC_EXP_TILE_3'];
  if (terraformDiscount === 0 && pending.some(a => a.type === 'UPGRADE_BUILDING')
    && ctx.tentativeTechTileCode && TERRAFORM_2_TILES.includes(ctx.tentativeTechTileCode)) {
    terraformDiscount = 2;
  }

  const myBuildings = getMyBuildings(ctx);
  const effectiveNavRange = navLevelToRange(myState.techNavigation) + getNavRangeBonus(ctx.techTileData, ctx.playerId) + navBonus;
  const { reachable, qicNeeded: navQic } = getNavigationCost(ctx.hex.hexQ, ctx.hex.hexR, myBuildings, effectiveNavRange, myState.qic);
  if (!reachable) return { clickable: false, handled: true };

  const result = calcMineCost(
    ctx.hex.planetType, ctx.mySeat!.raceCode, ctx.mySeat!.homePlanetType,
    myState.techTerraforming, terraformDiscount, myState, ctx.seats, navQic,
    ctx.tinkeroidsExtraRingPlanet, ctx.moweidsExtraRingPlanet,
  );
  return { clickable: result.possible, handled: true };
}

// ============================================================
// 헬퍼: hasOtherPending 계산
// ============================================================

function computeHasOtherPending(ctx: HexClickContext): boolean {
  const pending = ctx.pendingActions;
  if (pending.length === 0) return false;

  const terraformDiscount = getTerraformDiscount(pending);
  const navBonus = getNavBonus(pending);
  const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
  const hasPendingNavBoost = navBonus > 0 && !pending.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE' || a.type === 'DEPLOY_GAIAFORMER');
  const boosterAct = pending.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined;
  const hasPendingGaiaformerBooster = boosterAct?.payload.actionType === 'PLACE_GAIAFORMER' && !pending.some(a => a.type === 'PLACE_MINE');
  const ivitsPending = pending.some(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'IVITS_PLACE_STATION') && !pending.some(a => a.type === 'PLACE_MINE');
  const firaksPending = pending.some(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'FIRAKS_DOWNGRADE' && !a.payload?.hexQ);
  const ambasPending = pending.some(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'AMBAS_SWAP' && !a.payload?.hexQ);
  const moweidsRingPending = pending.some(a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'MOWEIDS_RING' && !a.payload?.hexQ);

  // 2삽 기술 타일 → 광산 배치 대기 (UPGRADE_BUILDING pending + tentativeTechTileCode 매칭)
  const TERRAFORM_2_TILE_CODES = ['BASIC_EXP_TILE_3'];
  const terraform2MinePending = pending.some(a => a.type === 'UPGRADE_BUILDING')
    && ctx.tentativeTechTileCode != null
    && TERRAFORM_2_TILE_CODES.includes(ctx.tentativeTechTileCode)
    && !pending.some(a => a.type === 'PLACE_MINE');

  const lostPlanetPending = pending.some(a => a.type === 'PLACE_LOST_PLANET' && a.payload?.hexQ == null);

  return pending.length > 0 && !hasPendingTerraform && !hasPendingNavBoost && !hasPendingGaiaformerBooster
    && !ivitsPending && !firaksPending && !ambasPending && !moweidsRingPending && !terraform2MinePending && !lostPlanetPending;
}

// ============================================================
// 헬퍼: 섹터 ID 추출 (HexMap에서 사용하는 것과 동일)
// ============================================================

function getSectorIdFromHex(hex: GameHex, _ctx?: HexClickContext): string | null {
  const anyHex = hex as any;
  return (anyHex.sectorId ?? anyHex.sector_id ?? null) as string | null;
}

// ============================================================
// 메인: 규칙 체인 실행
// ============================================================

const RULES = [
  ruleFederationMode,
  ruleBasicConditions,
  ruleFleetShipMode,
  ruleFactionAbilityHex,
  ruleLostPlanet,
  ruleTerraform2Mine,
  ruleFleetProbe,
  ruleBlockOtherPending,
  ruleBoosterGaiaformer,
  ruleGaiaformerDeploy,
  ruleBuildingHex,
  ruleSetupMine,
  rulePlayingMine,
];

export function isHexClickable(ctx: HexClickContext): boolean {
  for (const rule of RULES) {
    const result = rule(ctx);
    if (result.handled) return result.clickable;
  }
  return false;
}
