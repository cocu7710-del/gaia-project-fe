import powerActionImg from '@/assets/board/powerAction.jpg';
import closeImg from '../assets/resource/Close.png';
import { useGameStore } from '../store/gameStore';
import { ResourceCalculator } from '../utils/resourceCalculator';
import type { PowerAction } from '../types/turnActions';

interface PowerActionsProps {
  roomId: string;
  mySeatNo: number | null;
  isMyTurn: boolean;
  playerStates: { seatNo: number; powerBowl3: number; [key: string]: any }[];
}

const POWER_ACTION_SLOTS = [
  { code: 'PWR_KNOWLEDGE', cost: 7, left: 10.5, description: '지식 +3',       gain: { knowledge: 3 } },
  { code: 'PWR_TERRAFORM_2', cost: 5, left: 23,   description: '테라포밍 2단계', gain: {} },
  { code: 'PWR_ORE',        cost: 4, left: 36,   description: '광석 +2',       gain: { ore: 2 } },
  { code: 'PWR_CREDIT',    cost: 4, left: 49,   description: '크레딧 +7',     gain: { credit: 7 } },
  { code: 'PWR_KNOWLEDGE_2', cost: 4, left: 62,   description: '지식 +2',      gain: { knowledge: 2 } },
  { code: 'PWR_TERRAFORM', cost: 3, left: 75,   description: '테라포밍 1단계', gain: {} },
  { code: 'PWR_TOKEN',     cost: 3, left: 88,   description: '파워토큰 +2',    gain: { powerToken: 2 } },
];

export default function PowerActions({ mySeatNo, isMyTurn, playerStates }: PowerActionsProps) {
  const { turnState, addPendingAction, gamePhase, usedPowerActionCodes } = useGameStore();

  const isPlayingPhase = gamePhase === 'PLAYING';
  const hasPendingAction = turnState.pendingActions.length > 0;

  // 이미 사용된 파워 액션: 서버 기록 + 현재 pending
  const usedInPending = turnState.pendingActions
    .filter(a => a.type === 'POWER_ACTION')
    .map(a => a.payload.powerActionCode as string);
  const usedCodes = new Set([...usedPowerActionCodes, ...usedInPending]);

  const currentState = turnState.previewPlayerState ||
    playerStates.find(p => p.seatNo === mySeatNo);

  const handleClick = (code: string, cost: number, description: string, gain: Record<string, number>) => {
    if (!isMyTurn || !isPlayingPhase || hasPendingAction || usedCodes.has(code)) return;
    if (currentState && !ResourceCalculator.canAfford(currentState as any, { power: cost })) return;

    const action: PowerAction = {
      id: `action-${Date.now()}-${Math.random()}`,
      type: 'POWER_ACTION',
      timestamp: Date.now(),
      payload: { powerActionCode: code, cost: { power: cost }, gain, description },
    };
    addPendingAction(action);
  };

  return (
    <div className="game-panel">
      <div className="relative w-full">
        <img
          src={powerActionImg}
          alt="Power Actions"
          className="w-full h-auto rounded"
          draggable={false}
        />

        {POWER_ACTION_SLOTS.map((slot) => {
          const isUsed = usedCodes.has(slot.code);
          const canAfford = !currentState || ResourceCalculator.canAfford(currentState as any, { power: slot.cost });
          const canClick = isMyTurn && isPlayingPhase && !hasPendingAction && !isUsed && canAfford;

          return (
            <button
              key={slot.code}
              onClick={() => handleClick(slot.code, slot.cost, slot.description, slot.gain)}
              disabled={!canClick}
              className={`absolute top-0 h-full transition-all ${
                isUsed
                  ? 'bg-black/60 cursor-not-allowed'
                  : !canAfford && isMyTurn && isPlayingPhase
                    ? 'bg-black/40 cursor-not-allowed'
                    : canClick
                      ? 'hover:bg-white/20 cursor-pointer'
                      : 'cursor-default'
              }`}
              style={{ left: `${slot.left - 6}%`, width: '12%' }}
              title={`${slot.description} (파워 ${slot.cost})`}
            >
              {isUsed && (
                <div className="w-full h-full flex items-center justify-center">
                  <img src={closeImg} className="w-12 h-12 object-contain" draggable={false} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
