import type { GameAction } from '../types/turnActions';
import type { PlayerStateResponse } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { analyzePending } from '../actions/pendingAnalyzer';

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
  const { tentativeTechTileCode, tentativeTechTrackCode, fleetShipMode, turnState: { tentativeBooster } } = useGameStore();
  const isPlayingPhase = gamePhase === 'PLAYING';

  const analysis = analyzePending(pendingActions, fleetShipMode, tentativeTechTileCode, gamePhase, tentativeTechTrackCode);
  const hasMainAction = analysis.canConfirm;

  if (!isMyTurn) return null;

  if (selectingPassBooster) {
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
          {isConfirming ? '처리중...' : useGameStore.getState().currentRound === 6 ? '종료' : '패스'}
        </button>
      )}
    </div>
  );
}
