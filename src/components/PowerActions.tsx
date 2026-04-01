import powerActionImg from '@/assets/board/powerAction.jpg';
import closeImg from '../assets/resource/Close.png';
import { useGameStore } from '../store/gameStore';
import { isNevlasPiActive, effectiveBowl3Power } from '../utils/resourceCalculator';
import type { PowerAction } from '../types/turnActions';

interface PowerActionsProps {
  roomId: string;
  mySeatNo: number | null;
  isMyTurn: boolean;
  playerStates: { seatNo: number; powerBowl3: number; [key: string]: any }[];
}

interface PowerActionSlot {
  code: string;
  cost: number;
  left: number;
  width: number;
  description: string;
  gain: Record<string, number>;
}

const POWER_ACTION_SLOTS: PowerActionSlot[] = [
  { code: 'PWR_KNOWLEDGE',   cost: 7, left: 0,    width: 14.3, description: '지식 +3',       gain: { knowledge: 3 } },
  { code: 'PWR_TERRAFORM_2', cost: 5, left: 14.3, width: 14.3, description: '테라포밍 2단계', gain: {} },
  { code: 'PWR_ORE',         cost: 4, left: 28.6, width: 14.3, description: '광석 +2',       gain: { ore: 2 } },
  { code: 'PWR_CREDIT',      cost: 4, left: 42.9, width: 14.3, description: '크레딧 +7',     gain: { credit: 7 } },
  { code: 'PWR_KNOWLEDGE_2', cost: 4, left: 57.2, width: 14.3, description: '지식 +2',       gain: { knowledge: 2 } },
  { code: 'PWR_TERRAFORM',   cost: 3, left: 71.5, width: 14.3, description: '테라포밍 1단계', gain: {} },
  { code: 'PWR_TOKEN',       cost: 3, left: 85.8, width: 14.2, description: '파워토큰 +2',    gain: { powerToken: 2 } },
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

    // 타클론: 브레인스톤 사용 여부 확인
    let useBrainstone = false;
    if (currentState && (currentState as any).factionCode === 'TAKLONS'
        && (currentState as any).brainstoneBowl === 3) {
      // 브레인스톤(3파워) 사용 가능 — 사용할지 물어봄
      const bowl3 = (currentState as any).powerBowl3 ?? 0;
      const brainstoneAvail = 3;
      // 브레인스톤 없이도 가능한지 체크
      const canWithout = bowl3 >= cost;
      const canWith = (bowl3 + brainstoneAvail) >= cost;
      if (canWith && !canWithout) {
        // 브레인스톤 없이는 불가 → 자동 사용
        useBrainstone = true;
      } else if (canWith && canWithout) {
        // 둘 다 가능 → 선택
        useBrainstone = confirm('브레인스톤을 사용하시겠습니까? (3파워, 남는 파워 반환 없음)');
      }
    }

    // 네블라 PI: bowl3 * 2로 파워 판정
    const actualAfford = effectiveBowl3Power(currentState?.powerBowl3 ?? 0, isNevlasPiActive(currentState)) >= cost;
    if (currentState && !useBrainstone && !actualAfford) return;

    const action: PowerAction = {
      id: `action-${Date.now()}-${Math.random()}`,
      type: 'POWER_ACTION',
      timestamp: Date.now(),
      payload: { powerActionCode: code, cost: { power: cost }, gain, description, useBrainstone },
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
          const isTaklonsBrain3 = currentState && (currentState as any).factionCode === 'TAKLONS' && (currentState as any).brainstoneBowl === 3;
          const bowl3 = currentState?.powerBowl3 ?? 0;
          const effectivePower = effectiveBowl3Power(bowl3, isNevlasPiActive(currentState)) + (isTaklonsBrain3 ? 3 : 0);
          const canAfford = !currentState || effectivePower >= slot.cost;
          const canClick = isMyTurn && isPlayingPhase && !hasPendingAction && !isUsed && canAfford;

          return (
            <button
              key={slot.code}
              onClick={() => handleClick(slot.code, slot.cost, slot.description, slot.gain)}
              disabled={!canClick}
              className={`absolute top-0 h-full transition-all ${
                isUsed
                  ? 'cursor-not-allowed'
                  : !canAfford && isMyTurn && isPlayingPhase
                    ? 'cursor-not-allowed'
                    : canClick
                      ? 'hover:bg-white/20 cursor-pointer'
                      : 'cursor-default'
              }`}
              style={{ left: `${slot.left}%`, width: `${slot.width}%` }}
              title={`${slot.description} (파워 ${slot.cost})`}
            >
              {isUsed && (
                <div className="absolute inset-0 flex items-end justify-center pb-[5%]">
                  <img src={closeImg} className="w-[85%] aspect-square object-contain" draggable={false} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
