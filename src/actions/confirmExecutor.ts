/**
 * 턴 확정 실행기
 *
 * handleConfirmTurn의 ~210줄 if-else 체인을 테이블 기반으로 교체.
 * 패턴: [modifier API 호출 (선택)] → [main API 호출]
 */

import type { GameAction, FleetShipAction, DeployGaiaformerAction } from '../types/turnActions';
import { roomApi, fleetApi, buildingApi } from '../api/client';
import { getTerraformDiscount } from '../utils/terraformingCalculator';
import { useGameStore } from '../store/gameStore';

interface ConfirmStep {
  api: () => Promise<{ data: { success: boolean; message?: string } }>;
  errorLabel: string;
}

/**
 * PLAYING 페이즈에서 pending actions를 분석하여 실행할 API 호출 목록을 반환
 */
export function buildConfirmPlan(
  roomId: string,
  playerId: string,
  actions: GameAction[],
): ConfirmStep[] {
  const steps: ConfirmStep[] = [];

  const mineAction = actions.find(a => a.type === 'PLACE_MINE');
  const fleetProbeAction = actions.find(a => a.type === 'FLEET_PROBE');
  const gaiaformerAction = actions.find(a => a.type === 'DEPLOY_GAIAFORMER') as DeployGaiaformerAction | undefined;
  const powerAction = actions.find(a => a.type === 'POWER_ACTION');
  const boosterAction = actions.find(a => a.type === 'BOOSTER_ACTION');
  const fleetShipAction = actions.find(a => a.type === 'FLEET_SHIP_ACTION') as FleetShipAction | undefined;
  const factionAbilityAction = actions.find(a => a.type === 'FACTION_ABILITY');
  const terraformDiscount = getTerraformDiscount(actions);
  const { tentativeTechTileCode: techTile, tentativeTechTrackCode: techTrack } = useGameStore.getState();

  // 후속 행동 (광산/우주선/가이아포머)
  const followUp = mineAction || fleetProbeAction || gaiaformerAction;

  // === 1. 팩션 능력 단독 (후속 행동 없음) ===
  if (factionAbilityAction && !followUp) {
    const code = factionAbilityAction.payload.abilityCode;
    steps.push({
      api: () => roomApi.useFactionAbility(
        roomId, playerId, code,
        factionAbilityAction.payload.trackCode,
        factionAbilityAction.payload.hexQ,
        factionAbilityAction.payload.hexR,
      ),
      errorLabel: '종족 능력 실패',
    });
    return steps;
  }

  // === 2. Modifier + Follow-up 패턴 ===

  // 2a. 팩션 능력 + 후속
  if (factionAbilityAction && followUp) {
    steps.push({
      api: () => roomApi.useFactionAbility(roomId, playerId, factionAbilityAction.payload.abilityCode),
      errorLabel: '종족 능력 실패',
    });
  }

  // 2b. 부스터 액션 + 후속 (deferred 제외)
  if (boosterAction && followUp) {
    const isDeferred = boosterAction.payload.boosterCode?.startsWith('DEFERRED_');
    if (!isDeferred) {
      steps.push({
        api: () => roomApi.useBoosterAction(roomId, playerId),
        errorLabel: '부스터 액션 실패',
      });
    }
  }

  // 2c. 함대 split 액션 + 후속
  if (fleetShipAction && !fleetShipAction.payload.isImmediate && followUp) {
    steps.push({
      api: () => roomApi.fleetShipAction(roomId, playerId, fleetShipAction.payload.actionCode),
      errorLabel: '함대 액션 실패',
    });
  }

  // 2d. 파워 테라포밍 + 광산
  if (powerAction && mineAction) {
    steps.push({
      api: () => roomApi.usePowerAction(roomId, playerId, powerAction.payload.powerActionCode, powerAction.payload.useBrainstone),
      errorLabel: '파워 액션 실패',
    });
  }

  // === 3. 후속 행동 (광산/우주선/가이아포머) ===
  if (mineAction) {
    const qicUsed = mineAction.payload.cost?.qic ?? 0;
    const gaiaformerUsed = mineAction.payload.gaiaformerUsed ?? false;
    steps.push({
      api: () => roomApi.placeMine(roomId, playerId, mineAction.payload.hexQ, mineAction.payload.hexR, qicUsed, gaiaformerUsed, terraformDiscount),
      errorLabel: '광산 건설 실패',
    });
    return steps;
  }

  if (fleetProbeAction) {
    const navQic = fleetProbeAction.payload.cost?.qic ?? 0;
    steps.push({
      api: () => fleetApi.placeFleetProbe(roomId, playerId, fleetProbeAction.payload.fleetName, navQic),
      errorLabel: '우주선 입장 실패',
    });
    return steps;
  }

  if (gaiaformerAction) {
    const isBoosterGaiaform = !!boosterAction;
    steps.push({
      api: () => roomApi.deployGaiaformer(roomId, playerId, gaiaformerAction.payload.hexQ, gaiaformerAction.payload.hexR, gaiaformerAction.payload.qicUsed, isBoosterGaiaform || undefined),
      errorLabel: '가이아포머 배치 실패',
    });
    return steps;
  }

  // === 4. 단독 액션 (modifier나 follow-up 없음) ===
  if (steps.length > 0) return steps; // modifier만 있는 경우 (팩션 능력 단독)

  const firstAction = actions[0];
  if (!firstAction) return steps;

  switch (firstAction.type) {
    case 'PLACE_MINE': {
      const qicUsed = firstAction.payload.cost?.qic ?? 0;
      const gaiaformerUsed = firstAction.payload.gaiaformerUsed ?? false;
      steps.push({
        api: () => roomApi.placeMine(roomId, playerId, firstAction.payload.hexQ, firstAction.payload.hexR, qicUsed, gaiaformerUsed, 0),
        errorLabel: '광산 건설 실패',
      });
      break;
    }

    case 'UPGRADE_BUILDING': {
      steps.push({
        api: () => roomApi.upgradeBuilding(
          roomId, playerId, firstAction.payload.hexQ, firstAction.payload.hexR, firstAction.payload.toType,
          techTile ?? undefined, techTrack ?? undefined, firstAction.payload.academyType ?? undefined,
        ),
        errorLabel: '건물 업그레이드 실패',
      });
      // 2삽 기술 타일 → 후속 광산 건설
      if (mineAction) {
        const qicUsed = mineAction.payload.cost?.qic ?? 0;
        const gaiaformerUsed = mineAction.payload.gaiaformerUsed ?? false;
        steps.push({
          api: () => roomApi.placeMine(roomId, playerId, mineAction.payload.hexQ, mineAction.payload.hexR, qicUsed, gaiaformerUsed, terraformDiscount),
          errorLabel: '광산 건설 실패',
        });
      }
      // 검은행성 배치 (거리 5단계 트랙 전진 보상)
      const lostPlanetAction = actions.find(a => a.type === 'PLACE_LOST_PLANET');
      if (lostPlanetAction) {
        steps.push({
          api: () => roomApi.placeLostPlanet(roomId, playerId, lostPlanetAction.payload.hexQ, lostPlanetAction.payload.hexR),
          errorLabel: '검은행성 배치 실패',
        });
      }
      break;
    }

    case 'POWER_ACTION': {
      steps.push({
        api: () => roomApi.usePowerAction(roomId, playerId, firstAction.payload.powerActionCode, firstAction.payload.useBrainstone),
        errorLabel: '파워 액션 실패',
      });
      break;
    }

    case 'FLEET_PROBE': {
      const navQic = firstAction.payload.cost?.qic ?? 0;
      steps.push({
        api: () => fleetApi.placeFleetProbe(roomId, playerId, firstAction.payload.fleetName, navQic),
        errorLabel: '함대 입장 실패',
      });
      break;
    }

    case 'ADVANCE_TECH': {
      steps.push({
        api: () => roomApi.advanceTechTrack(roomId, playerId, firstAction.payload.trackCode),
        errorLabel: '기술 트랙 전진 실패',
      });
      // 거리 5단계 → 검은행성 배치
      const lpAction = actions.find(a => a.type === 'PLACE_LOST_PLANET');
      if (lpAction) {
        steps.push({
          api: () => roomApi.placeLostPlanet(roomId, playerId, lpAction.payload.hexQ, lpAction.payload.hexR),
          errorLabel: '검은행성 배치 실패',
        });
      }
      break;
    }

    case 'PLACE_LOST_PLANET': {
      steps.push({
        api: () => roomApi.placeLostPlanet(roomId, playerId, firstAction.payload.hexQ, firstAction.payload.hexR),
        errorLabel: '검은행성 배치 실패',
      });
      break;
    }

    case 'DEPLOY_GAIAFORMER': {
      steps.push({
        api: () => roomApi.deployGaiaformer(roomId, playerId, firstAction.payload.hexQ, firstAction.payload.hexR, firstAction.payload.qicUsed),
        errorLabel: '가이아포머 배치 실패',
      });
      break;
    }

    case 'FLEET_SHIP_ACTION': {
      const fsa = firstAction as FleetShipAction;
      const needsTile = fsa.payload.actionCode === 'REBELLION_TECH' || fsa.payload.actionCode === 'TWILIGHT_UPGRADE';
      const needsArtifact = fsa.payload.actionCode === 'TWILIGHT_ARTIFACT';
      const trackCode = needsTile ? techTile ?? undefined
        : needsArtifact ? techTile ?? (fsa.payload as any).artifactCode ?? undefined
        : fsa.payload.trackCode;
      const techTrackCode = needsTile ? techTrack ?? undefined : undefined;
      steps.push({
        api: () => roomApi.fleetShipAction(roomId, playerId, fsa.payload.actionCode, fsa.payload.hexQ, fsa.payload.hexR, trackCode, techTrackCode),
        errorLabel: '함대 액션 실패',
      });
      break;
    }

    case 'TECH_TILE_ACTION': {
      steps.push({
        api: () => roomApi.useTechTileAction(roomId, playerId, firstAction.payload.tileCode),
        errorLabel: '기술 타일 액션 실패',
      });
      break;
    }

    case 'FORM_FEDERATION': {
      steps.push({
        api: () => roomApi.formFederation(roomId, playerId, firstAction.payload.tileCode, firstAction.payload.placedTokens, firstAction.payload.selectedBuildings),
        errorLabel: '연방 형성 실패',
      });
      break;
    }

    default: {
      steps.push({
        api: () => roomApi.confirmAction(roomId, playerId, firstAction.type, JSON.stringify(firstAction.payload)),
        errorLabel: '액션 확정 실패',
      });
    }
  }

  return steps;
}

/**
 * 실행기: steps를 순서대로 호출하고, 실패 시 중단
 */
export async function executeConfirmPlan(
  steps: ConfirmStep[],
): Promise<{ success: boolean; error?: string }> {
  for (const step of steps) {
    try {
      const res = await step.api();
      if (!res.data.success) {
        return { success: false, error: res.data.message || step.errorLabel };
      }
    } catch (e: any) {
      return { success: false, error: e?.response?.data?.message || step.errorLabel };
    }
  }
  return { success: true };
}
