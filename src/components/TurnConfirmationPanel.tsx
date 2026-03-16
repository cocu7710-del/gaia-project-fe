import type { GameAction, BoosterAction } from '../types/turnActions';
import type { PlayerStateResponse } from '../api/client';
import { useGameStore } from '../store/gameStore';

interface TurnConfirmationPanelProps {
  isMyTurn: boolean;
  gamePhase: string | null;
  pendingActions: GameAction[];
  burnPowerCount: number;
  previewResources: PlayerStateResponse | null;
  originalResources: PlayerStateResponse | null;
  onConfirm: () => Promise<void>;
  onRollback: () => void;
  onPassTurn: () => void;
  isConfirming: boolean;
  error: string | null;
  selectingPassBooster?: boolean;
}

export default function TurnConfirmationPanel({
  isMyTurn,
  gamePhase,
  pendingActions,
  onConfirm,
  onRollback,
  onPassTurn,
  isConfirming,
  error,
  selectingPassBooster,
}: TurnConfirmationPanelProps) {
  const { tentativeTechTileCode, fleetShipMode } = useGameStore();
  const isPlayingPhase = gamePhase === 'PLAYING';

  // 부스터/파워 테라포밍/split 함대 액션 후 후속 행동(광산/우주선) 미완료 시 확정 불가
  const boosterPending = pendingActions.some(a => a.type === 'BOOSTER_ACTION');
  const boosterActionType = (pendingActions.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined)?.payload.actionType;
  const powerTerraformPending = pendingActions.some(
    a => a.type === 'POWER_ACTION' &&
      (a.payload.powerActionCode === 'PWR_TERRAFORM' || a.payload.powerActionCode === 'PWR_TERRAFORM_2'),
  );
  // split fleet ship 액션 (TF_MARS_TERRAFORM, TWILIGHT_NAV): 광산 배치 필요
  const fleetShipSplitPending = pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && !(a.payload as any).isImmediate,
  );
  // 팩션 능력 선언형 (SPACE_GIANTS_TERRAFORM_2, GLEENS_JUMP, IVITS_PLACE_STATION): 후속 행동 필요
  const factionAbilityPending = pendingActions.some(a => a.type === 'FACTION_ABILITY');
  // 하이브 우주정거장: 좌표 선택 완료 시 후속 행동 불필요
  const ivitsStationReady = pendingActions.some(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'IVITS_PLACE_STATION' && (a.payload as any).hexQ != null
  );
  const firaksReady = pendingActions.some(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'FIRAKS_DOWNGRADE' && (a.payload as any).hexQ != null && (a.payload as any).trackCode
  );
  const bescodsReady = pendingActions.some(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'BESCODS_ADVANCE_LOWEST_TRACK'
  );
  // 후속 행동 불필요한 종족 능력 (바로 확정 가능)
  const gleensFedReady = pendingActions.some(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'GLEENS_FEDERATION_TOKEN'
  );
  const ambasReady = pendingActions.some(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'AMBAS_SWAP' && (a.payload as any).hexQ != null
  );
  const tinkeroidsReady = pendingActions.some(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'TINKEROIDS_USE_ACTION'
  );
  const factionAbilityReady = ivitsStationReady || firaksReady || bescodsReady || gleensFedReady || ambasReady || tinkeroidsReady;
  const hasMineOrFleet = pendingActions.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE' || a.type === 'DEPLOY_GAIAFORMER');
  const needsFollowUp = (boosterPending || powerTerraformPending || fleetShipSplitPending || (factionAbilityPending && !factionAbilityReady)) && !hasMineOrFleet;

  // 헥스 선택 모드 중 (fleetShipMode 활성 = pendingActions 비어있지만 확정 불가)
  const needsFleetHex = fleetShipMode !== null;

  // 연구소/아카데미 건설 시 기술 타일 선택 필수
  // (공용 타일은 트랙까지 선택해야 tentativeTechTileCode가 설정됨 → 별도 체크 불필요)
  const upgradePending = pendingActions.some(
    a => a.type === 'UPGRADE_BUILDING' &&
      (a.payload.toType === 'RESEARCH_LAB' || a.payload.toType === 'ACADEMY'
        || (a.payload.toType === 'PLANETARY_INSTITUTE' && a.payload.factionCode === 'SPACE_GIANTS'))
  );
  const rebellionTechPending = pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'REBELLION_TECH' && !(a.payload as any).trackCode
  );
  const twilightUpgradePending = pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'TWILIGHT_UPGRADE'
  );
  const needsTechTile = (upgradePending || rebellionTechPending || twilightUpgradePending) && !tentativeTechTileCode;

  const hasMainAction = pendingActions.length > 0 && !needsFollowUp && !needsTechTile && !needsFleetHex;

  if (!isMyTurn) return null;

  if (selectingPassBooster) {
    const { tentativeBooster } = useGameStore.getState();
    return (
      <div className="game-panel !border-amber-500/30 ring-1 ring-amber-500/20">
        {/* 초기화 + 확정 */}
        <div className="flex gap-1 mb-1">
          <button
            onClick={onRollback}
            disabled={isConfirming}
            className="flex-1 bg-yellow-600/80 hover:bg-yellow-500/80 text-white py-1 px-1.5 rounded-lg
                       transition font-semibold text-[8px] whitespace-nowrap"
          >
            초기화
          </button>
          <button
            onClick={onConfirm}
            disabled={!tentativeBooster || isConfirming}
            className="flex-1 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/60
                       disabled:cursor-not-allowed text-white py-1 px-1.5 rounded-lg
                       transition font-semibold text-[8px] whitespace-nowrap"
          >
            {isConfirming ? '확정중' : '확정'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-panel">
      {/* 에러 */}
      {error && (
        <div className="mb-1.5 p-1.5 bg-red-900/50 border border-red-600/30 text-red-200 rounded-lg text-[9px]">
          {error}
        </div>
      )}

      {/* 초기화 + 확정 (항상 표시) */}
      <div className="flex gap-1 mb-1">
        <button
          onClick={onRollback}
          disabled={isConfirming}
          className="flex-1 bg-yellow-600/80 hover:bg-yellow-500/80 disabled:bg-gray-700/60
                     disabled:cursor-not-allowed text-white py-1 px-1.5 rounded-lg
                     transition font-semibold text-[8px] whitespace-nowrap"
        >
          초기화
        </button>

        <button
          onClick={onConfirm}
          disabled={!hasMainAction || isConfirming}
          className="flex-1 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/60
                     disabled:cursor-not-allowed text-white py-1 px-1.5 rounded-lg
                     transition font-semibold text-[8px] whitespace-nowrap"
        >
          {isConfirming ? '확정중' : '확정'}
        </button>
      </div>

      {/* 패스 (PLAYING 페이즈에서 항상 표시) */}
      {isPlayingPhase && (
        <button
          onClick={onPassTurn}
          disabled={isConfirming}
          className="w-full bg-red-600/80 hover:bg-red-500/80 disabled:bg-gray-700/40
                     disabled:cursor-not-allowed text-white py-1 px-1.5 rounded-lg
                     transition font-semibold text-[8px] whitespace-nowrap"
        >
          {isConfirming ? '처리중...' : '패스'}
        </button>
      )}
    </div>
  );
}
