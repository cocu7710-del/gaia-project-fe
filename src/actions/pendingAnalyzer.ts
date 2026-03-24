/**
 * Pending Action 상태 분석기
 *
 * 4곳(TurnConfirmationPanel, HexMap 배너, HexMap isHexClickable, LobbyPage handleConfirmTurn)에서
 * 중복되던 pending 상태 분석 로직을 단일 함수로 통합.
 */

import type { GameAction, BoosterAction, ResourceCost } from '../types/turnActions';

// fleetShipMode 타입 (gameStore에서 가져오기 어려우므로 여기서 정의)
export interface FleetShipMode {
  actionCode: string;
  fleetName: string;
  cost: ResourceCost;
  needsGaiaformHex?: boolean;
  needsAsteroidHex?: boolean;
  needsUpgradeMineToTs?: boolean;
  needsTsToRl?: boolean;
  needsTrack?: boolean;
  needsTile?: boolean;
}

export interface PendingAnalysis {
  // === 기본 상태 ===
  hasPending: boolean;

  // === Modifier (후속 행동 필요) ===
  /** 테라포밍 할인 단계 (0이면 테라포밍 모디파이어 없음) */
  terraformDiscount: number;
  /** 항법 보너스 (0이면 항법 모디파이어 없음) */
  navBonus: number;
  /** 가이아포머 배치 모디파이어 (BOOSTER_12) */
  isGaiaformerPlace: boolean;
  /** 후속 행동(광산/우주선/가이아포머) 완료 여부 */
  hasFollowUp: boolean;
  /** 후속 행동이 필요한데 아직 안 됨 */
  needsFollowUp: boolean;

  // === 헥스 선택 모드 ===
  needsFleetHex: boolean;
  /** 헥스 선택 모드 상세 (배너 메시지용) */
  fleetHexType: 'UPGRADE_MINE_TO_TS' | 'UPGRADE_TS_TO_RL' | 'GAIAFORM' | 'ASTEROID_MINE' | 'OTHER' | null;

  // === 기술 타일 / 트랙 선택 필요 ===
  needsTechTile: boolean;
  /** 기술 타일은 선택됐고 트랙만 선택하면 되는 상태 (또는 ECLIPSE_TECH 트랙 선택) */
  needsTrackSelect: boolean;
  /** 2삽 기술 타일 선택됨 → 광산 배치 필요 */
  needsTerraform2Mine: boolean;
  /** 검은행성 배치 필요 (거리 트랙 5단계) */
  needsLostPlanet: boolean;

  // === 팩션 능력 상태 ===
  factionAbilityReady: boolean;

  // === 최종 확정 가능 여부 ===
  canConfirm: boolean;

  // === 배너 메시지 ===
  bannerMessage: string;
}

/**
 * getTerraformDiscount — 기존 terraformingCalculator.ts의 로직을 여기에 통합
 */
function calcTerraformDiscount(pendingActions: GameAction[]): number {
  // 파워 액션 테라포밍
  const pwrAct = pendingActions.find(
    a => a.type === 'POWER_ACTION' &&
      (a.payload.powerActionCode === 'PWR_TERRAFORM' || a.payload.powerActionCode === 'PWR_TERRAFORM_2'),
  );
  if (pwrAct) return pwrAct.payload.powerActionCode === 'PWR_TERRAFORM_2' ? 2 : 1;

  // 부스터 액션 테라포밍
  const boosterAct = pendingActions.find(
    a => a.type === 'BOOSTER_ACTION' && ['TERRAFORM_ONE_STEP', 'TERRAFORM_TWO_STEP', 'TERRAFORM_THREE_STEP'].includes(a.payload.actionType),
  );
  if (boosterAct) return boosterAct.payload.terraformDiscount ?? 1;

  // 함대 선박: TF_MARS_TERRAFORM
  const fleetAct = pendingActions.find(
    a => a.type === 'FLEET_SHIP_ACTION' && a.payload.actionCode === 'TF_MARS_TERRAFORM',
  );
  if (fleetAct) return fleetAct.payload.terraformDiscount ?? 1;

  // 팩션 능력: 테라포밍
  const factionAct = pendingActions.find(
    a => a.type === 'FACTION_ABILITY' &&
      (a.payload.abilityCode === 'SPACE_GIANTS_TERRAFORM_2' ||
       (a.payload.abilityCode === 'TINKEROIDS_USE_ACTION' && a.payload.terraformDiscount > 0)),
  );
  if (factionAct) return factionAct.payload.terraformDiscount ?? 1;

  return 0;
}

/**
 * getNavBonus — 기존 terraformingCalculator.ts의 로직
 */
function calcNavBonus(pendingActions: GameAction[]): number {
  const boosterNav = pendingActions.find(
    a => a.type === 'BOOSTER_ACTION' && a.payload.actionType === 'NAVIGATION_PLUS_3',
  );
  if (boosterNav) return boosterNav.payload.navBonus ?? 3;

  const fleetNav = pendingActions.find(
    a => a.type === 'FLEET_SHIP_ACTION' && a.payload.actionCode === 'TWILIGHT_NAV',
  );
  if (fleetNav) return fleetNav.payload.navBonus ?? 3;

  const factionNav = pendingActions.find(
    a => a.type === 'FACTION_ABILITY' && a.payload.abilityCode === 'GLEENS_JUMP',
  );
  if (factionNav) return factionNav.payload.navBonus ?? 2;

  return 0;
}

/**
 * 팩션 능력이 "확정 가능" 상태인지 (후속 행동 불필요)
 */
function checkFactionAbilityReady(pendingActions: GameAction[]): boolean {
  const fa = pendingActions.find(a => a.type === 'FACTION_ABILITY');
  if (!fa) return false;

  const code = fa.payload?.abilityCode;
  switch (code) {
    // 즉시 확정 가능 (후속 행동 불필요)
    case 'BESCODS_ADVANCE_LOWEST_TRACK':
    case 'GLEENS_FEDERATION_TOKEN':
    case 'TINKEROIDS_USE_ACTION':
    case 'QIC_ACADEMY_ACTION':
      return true;

    // 헥스 선택 완료 시 확정 가능
    case 'IVITS_PLACE_STATION':
    case 'AMBAS_SWAP':
    case 'MOWEIDS_RING':
      return fa.payload?.hexQ != null;

    // 파이락: 헥스 + 트랙 선택 완료
    case 'FIRAKS_DOWNGRADE':
      return fa.payload?.hexQ != null && fa.payload?.trackCode;

    // 기본: 후속 행동 필요 (테라포밍, 점프 등)
    default:
      return false;
  }
}

/**
 * 배너 메시지 생성
 */
function buildBannerMessage(
  gamePhase: string | null,
  pendingActions: GameAction[],
  fleetShipMode: FleetShipMode | null,
  analysis: Omit<PendingAnalysis, 'bannerMessage'>,
): string {
  // 셋업 페이즈
  if (gamePhase !== 'PLAYING') {
    return '당신의 차례입니다! 광산을 배치하세요.';
  }

  // 헥스 선택 대기 (함대 업그레이드/가이아포머/소행성)
  if (analysis.needsFleetHex) {
    switch (analysis.fleetHexType) {
      case 'UPGRADE_MINE_TO_TS': return '업그레이드할 광산을 선택하세요.';
      case 'UPGRADE_TS_TO_RL': return '업그레이드할 교역소를 선택하세요.';
      case 'GAIAFORM': return '가이아포머를 배치할 행성을 선택하세요.';
      case 'ASTEROID_MINE': return '광산을 건설할 소행성을 선택하세요.';
      default: return '대상 위치를 선택하세요.';
    }
  }

  // 검은행성 배치 대기
  if (analysis.needsLostPlanet) {
    return '검은행성을 배치할 빈 헥스를 선택하세요.';
  }

  // 2삽 기술 타일 → 광산 배치 대기
  if (analysis.needsTerraform2Mine) {
    return '테라포밍 2단계 할인 — 광산을 배치할 위치를 선택하세요.';
  }

  // 트랙 선택 대기 (ECLIPSE_TECH 등)
  if (analysis.needsTrackSelect) {
    return '진보할 지식트랙을 선택해 주세요.';
  }

  // 기술 타일 선택 대기
  if (analysis.needsTechTile) {
    return '획득할 기술타일을 선택해 주세요.';
  }

  // 후속 행동 대기 (테라포밍/항법/가이아포머/종족 능력)
  if (analysis.needsFollowUp) {
    if (analysis.isGaiaformerPlace) return '가이아포머를 배치할 행성을 선택하세요.';
    if (analysis.terraformDiscount > 0) return `테라포밍 ${analysis.terraformDiscount}단계 할인 적용 — 행동을 선택하세요.`;
    if (analysis.navBonus > 0) return `항법 +${analysis.navBonus}거리 적용 — 행동을 선택하세요.`;

    const fa = pendingActions.find(a => a.type === 'FACTION_ABILITY');
    if (fa) {
      const code = fa.payload?.abilityCode;
      if (code === 'IVITS_PLACE_STATION' && !fa.payload?.hexQ) return '우주정거장을 배치할 빈 헥스를 선택하세요.';
      if (code === 'FIRAKS_DOWNGRADE' && !fa.payload?.hexQ) return '다운그레이드할 연구소를 선택하세요.';
      if (code === 'AMBAS_SWAP' && !fa.payload?.hexQ) return '교환할 광산을 선택하세요.';
      if (code === 'MOWEIDS_RING' && !fa.payload?.hexQ) return '링을 씌울 건물을 선택하세요.';
      if (code === 'BESCODS_ADVANCE_LOWEST_TRACK') return '전진할 최저 지식트랙을 선택하세요.';
    }
    return '행동을 선택하세요.';
  }

  // 확정 대기
  if (pendingActions.length > 0) {
    const first = pendingActions[0];
    const UPGRADE_NAMES: Record<string, string> = {
      TRADING_STATION: '교역소', RESEARCH_LAB: '연구소',
      PLANETARY_INSTITUTE: '행성 의회', ACADEMY: '아카데미',
      ACADEMY_KNOWLEDGE: '지식 아카데미', ACADEMY_QIC: 'QIC 아카데미',
    };

    switch (first.type) {
      case 'PLACE_MINE': return '광산 건설을 진행하시겠습니까?';
      case 'UPGRADE_BUILDING': {
        const name = UPGRADE_NAMES[first.payload.toType] ?? first.payload.toType;
        return `${name} 업그레이드를 진행하시겠습니까?`;
      }
      case 'POWER_ACTION': return `파워 액션 ${first.payload.description ?? ''}`;
      case 'ADVANCE_TECH': {
        const TRACK_NAMES: Record<string, string> = {
          TERRA_FORMING: '테라포밍', NAVIGATION: '거리', AI: 'AI',
          GAIA_FORMING: '가이아', ECONOMY: '경제', SCIENCE: '과학',
        };
        const trackName = TRACK_NAMES[first.payload.trackCode] ?? first.payload.trackCode;
        return `${trackName} 트랙을 전진 하시겠습니까?`;
      }
      case 'FLEET_PROBE': return '함대 입장을 진행하시겠습니까?';
      case 'DEPLOY_GAIAFORMER': return '가이아포머 배치를 진행하시겠습니까?';
      case 'TECH_TILE_ACTION': return '기술 타일 액션을 사용하시겠습니까?';
      case 'FORM_FEDERATION': return '연방 형성을 진행하시겠습니까?';
      case 'FLEET_SHIP_ACTION': {
        const code = (first.payload as any)?.actionCode;
        if (code === 'REBELLION_UPGRADE') return '광산을 교역소로 업그레이드 하시겠습니까?';
        if (code === 'TWILIGHT_UPGRADE') return '교역소를 연구소로 업그레이드 하시겠습니까?';
        if (code === 'TWILIGHT_ARTIFACT') return '인공물 타일을 획득하시겠습니까? (파워 6 소각)';
        if (code === 'ECLIPSE_TECH') return '진보할 지식트랙을 선택해 주세요.';
        return `함대 액션을 진행하시겠습니까?`;
      }
      case 'FACTION_ABILITY': {
        const code = (first.payload as any)?.abilityCode;
        if (code === 'MOWEIDS_RING') return '건물에 링 씌우기를 진행하시겠습니까?';
        if (code === 'AMBAS_SWAP') return '광산↔의회 교환을 진행하시겠습니까?';
        if (code === 'FIRAKS_DOWNGRADE') return '진보할 지식트랙을 선택해 주세요.';
        return '종족 능력을 사용하시겠습니까?';
      }
      default: return '확정을 눌러주세요.';
    }
  }

  return '당신의 차례입니다! 행동을 선택하세요.';
}

/**
 * 메인 분석 함수 — 4곳의 중복 로직을 대체
 */
export function analyzePending(
  pendingActions: GameAction[],
  fleetShipMode: FleetShipMode | null,
  tentativeTechTileCode: string | null,
  gamePhase: string | null,
): PendingAnalysis {
  const hasPending = pendingActions.length > 0;

  // --- Modifier 분석 ---
  const terraformDiscount = calcTerraformDiscount(pendingActions);
  const navBonus = calcNavBonus(pendingActions);
  const boosterAct = pendingActions.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined;
  const isGaiaformerPlace = boosterAct?.payload.actionType === 'PLACE_GAIAFORMER';

  // --- 후속 행동 완료 여부 ---
  const hasFollowUp = pendingActions.some(a =>
    a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE' || a.type === 'DEPLOY_GAIAFORMER',
  );

  // --- 후속 행동 필요 여부 ---
  const hasModifier = terraformDiscount > 0 || navBonus > 0 || isGaiaformerPlace;
  const boosterPending = pendingActions.some(a => a.type === 'BOOSTER_ACTION');
  const powerTerraformPending = pendingActions.some(
    a => a.type === 'POWER_ACTION' &&
      (a.payload.powerActionCode === 'PWR_TERRAFORM' || a.payload.powerActionCode === 'PWR_TERRAFORM_2'),
  );
  const fleetShipSplitPending = pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && !(a.payload as any).isImmediate,
  );
  const factionAbilityPending = pendingActions.some(a => a.type === 'FACTION_ABILITY');
  const factionAbilityReady = checkFactionAbilityReady(pendingActions);

  const needsFollowUp =
    (boosterPending || powerTerraformPending || fleetShipSplitPending || (factionAbilityPending && !factionAbilityReady))
    && !hasFollowUp;

  // --- 헥스 선택 모드 ---
  const needsFleetHex = fleetShipMode !== null;
  let fleetHexType: PendingAnalysis['fleetHexType'] = null;
  if (fleetShipMode) {
    if (fleetShipMode.needsUpgradeMineToTs) fleetHexType = 'UPGRADE_MINE_TO_TS';
    else if (fleetShipMode.needsTsToRl) fleetHexType = 'UPGRADE_TS_TO_RL';
    else if (fleetShipMode.needsGaiaformHex) fleetHexType = 'GAIAFORM';
    else if (fleetShipMode.needsAsteroidHex) fleetHexType = 'ASTEROID_MINE';
    else fleetHexType = 'OTHER';
  }

  // --- 기술 타일 선택 필요 ---
  const upgradePending = pendingActions.some(
    a => a.type === 'UPGRADE_BUILDING' &&
      (a.payload.toType === 'RESEARCH_LAB' || a.payload.toType === 'ACADEMY'
        || (a.payload.toType === 'PLANETARY_INSTITUTE' && a.payload.factionCode === 'SPACE_GIANTS')),
  );
  const rebellionTechPending = pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'REBELLION_TECH' && !(a.payload as any).trackCode,
  );
  const twilightUpgradePending = pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'TWILIGHT_UPGRADE',
  );
  const eclipseTechPending = pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'ECLIPSE_TECH' && !(a.payload as any).trackCode,
  );
  // 헥스 선택이 진행 중이면 기술 타일/트랙 선택은 아직 불필요
  const needsTechTile = !needsFleetHex && (upgradePending || rebellionTechPending || twilightUpgradePending) && !tentativeTechTileCode;
  const needsTrackSelect = !needsFleetHex && eclipseTechPending;

  // 2삽 기술 타일 선택됨 → 광산 배치 필요 (PLACE_MINE pending 아직 없으면)
  const TERRAFORM_2_TILE_CODES = ['BASIC_EXP_TILE_3'];
  const needsTerraform2Mine = !needsFleetHex && !needsTechTile && !needsTrackSelect
    && upgradePending && tentativeTechTileCode != null
    && TERRAFORM_2_TILE_CODES.includes(tentativeTechTileCode)
    && !hasFollowUp;

  // 검은행성 배치 필요 (PLACE_LOST_PLANET pending이 있고 hexQ 미설정)
  const needsLostPlanet = pendingActions.some(
    a => a.type === 'PLACE_LOST_PLANET' && a.payload?.hexQ == null,
  );

  // --- 최종 확정 가능 여부 ---
  const canConfirm = hasPending && !needsFollowUp && !needsTechTile && !needsTrackSelect && !needsFleetHex && !needsTerraform2Mine && !needsLostPlanet;

  // --- 배너 메시지 ---
  const partialAnalysis = {
    hasPending, terraformDiscount, navBonus, isGaiaformerPlace, hasFollowUp,
    needsFollowUp, needsFleetHex, fleetHexType, needsTechTile, needsTrackSelect, needsTerraform2Mine, needsLostPlanet,
    factionAbilityReady, canConfirm,
  };
  const bannerMessage = buildBannerMessage(gamePhase, pendingActions, fleetShipMode, partialAnalysis);

  return { ...partialAnalysis, bannerMessage };
}
