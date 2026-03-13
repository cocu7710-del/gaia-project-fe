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
  const { tentativeTechTileCode, tentativeTechTrackCode, fleetShipMode } = useGameStore();
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
  const hasMineOrFleet = pendingActions.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE' || a.type === 'DEPLOY_GAIAFORMER');
  const needsFollowUp = (boosterPending || powerTerraformPending || fleetShipSplitPending) && !hasMineOrFleet;

  // 헥스 선택 모드 중 (fleetShipMode 활성 = pendingActions 비어있지만 확정 불가)
  const needsFleetHex = fleetShipMode !== null;

  // 연구소/아카데미 건설 시 기술 타일 선택 필수
  // (공용 타일은 트랙까지 선택해야 tentativeTechTileCode가 설정됨 → 별도 체크 불필요)
  const upgradePending = pendingActions.some(
    a => a.type === 'UPGRADE_BUILDING' &&
      (a.payload.toType === 'RESEARCH_LAB' || a.payload.toType === 'ACADEMY')
  );
  const needsTechTile = upgradePending && !tentativeTechTileCode;

  const hasMainAction = pendingActions.length > 0 && !needsFollowUp && !needsTechTile && !needsFleetHex;

  if (!isMyTurn) return null;

  if (selectingPassBooster) {
    return (
      <div className="game-panel !border-amber-500/30 ring-1 ring-amber-500/20">
        <p className="text-[10px] text-amber-400 text-center whitespace-nowrap mb-1 font-medium">
          다음 라운드 부스터 선택
        </p>
        <p className="text-[9px] text-gray-400 text-center mb-1.5">아래에서 부스터를 클릭하세요</p>
        <button
          onClick={onRollback}
          className="w-full bg-red-600/80 hover:bg-red-500/80 text-white py-1 px-2 rounded-lg
                     transition font-semibold text-[10px] whitespace-nowrap"
        >
          초기화
        </button>
      </div>
    );
  }

  return (
    <div className="game-panel">
      {/* 후속 행동 안내 */}
      {needsFleetHex && (
        <div className="mb-1.5 p-1.5 bg-amber-900/50 border border-amber-600/30 text-amber-200 rounded-lg text-[9px]">
          맵에서 대상 위치를 선택하세요
        </div>
      )}
      {needsFollowUp && (
        <div className="mb-1.5 p-1.5 bg-amber-900/50 border border-amber-600/30 text-amber-200 rounded-lg text-[9px]">
          {boosterActionType === 'PLACE_GAIAFORMER'
            ? '가이아포머 배치할 보라색(TRANSDIM) 행성을 선택하세요'
            : fleetShipSplitPending
              ? '광산을 배치할 위치를 선택하세요 (함대 액션 적용됨)'
              : boosterPending
                ? '광산 또는 우주선 입장 위치를 선택하세요'
                : '광산을 배치할 위치를 선택하세요'}
        </div>
      )}
      {needsTechTile && (
        <div className="mb-1.5 p-1.5 bg-amber-900/50 border border-amber-600/30 text-amber-200 rounded-lg text-[9px]">
          지식 트랙에서 기술 타일을 선택하세요
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="mb-1.5 p-1.5 bg-red-900/50 border border-red-600/30 text-red-200 rounded-lg text-[9px]">
          {error}
        </div>
      )}

      {/* 초기화 + 확정 (항상 표시) */}
      <div className="flex gap-1.5 mb-1.5">
        <button
          onClick={onRollback}
          disabled={isConfirming}
          className="flex-1 bg-red-600/80 hover:bg-red-500/80 disabled:bg-gray-700/60
                     disabled:cursor-not-allowed text-white py-1.5 px-2 rounded-lg
                     transition font-semibold text-[10px] whitespace-nowrap"
        >
          초기화
        </button>

        <button
          onClick={onConfirm}
          disabled={!hasMainAction || isConfirming}
          className="flex-1 bg-emerald-600/80 hover:bg-emerald-500/80 disabled:bg-gray-700/60
                     disabled:cursor-not-allowed text-white py-1.5 px-2 rounded-lg
                     transition font-semibold text-[10px] whitespace-nowrap"
        >
          {isConfirming ? '확정중' : '확정'}
        </button>
      </div>

      {/* 패스 (PLAYING 페이즈에서 항상 표시) */}
      {isPlayingPhase && (
        <button
          onClick={onPassTurn}
          disabled={isConfirming}
          className="w-full bg-gray-600/60 hover:bg-gray-500/60 disabled:bg-gray-700/40
                     disabled:cursor-not-allowed text-white py-1.5 px-2 rounded-lg
                     transition font-semibold text-[10px] whitespace-nowrap"
        >
          {isConfirming ? '처리중...' : '패스'}
        </button>
      )}
    </div>
  );
}
