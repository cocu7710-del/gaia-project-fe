import React from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';

interface Props {
  roomId: string;
  myPlayerId: string;
}

export const PowerLeechDialog: React.FC<Props> = ({ roomId, myPlayerId }) => {
  const leechBatch = useGameStore(s => s.leechBatch);
  const [isDeciding, setIsDeciding] = React.useState(false);
  const [taklonsChoice, setTaklonsChoice] = React.useState<'TOKEN_FIRST' | 'CHARGE_FIRST'>('CHARGE_FIRST');

  // 동시 결정: 내가 결정 대상 목록에 있는지 확인
  const isMyDecision = leechBatch?.deciderIds?.includes(myPlayerId)
    ?? leechBatch?.currentDeciderId === myPlayerId;
  if (!leechBatch || !isMyDecision) return null;

  // 내 offer 찾기
  const currentOffer = leechBatch.offers.find(o => o.receivePlayerId === myPlayerId);
  if (!currentOffer) return null;

  const handleDecide = async (accept: boolean) => {
    setIsDeciding(true);
    try {
      await roomApi.decideLeech(roomId, currentOffer.id, myPlayerId, accept,
        currentOffer.isTaklons && accept ? taklonsChoice : undefined);
    } finally {
      setIsDeciding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-yellow-500 rounded-xl p-6 w-80 text-white">
        <h3 className="text-lg font-bold text-yellow-400 mb-4">파워 리치</h3>
        <p className="text-gray-300 mb-1">인접 플레이어가 건물을 건설했습니다.</p>
        <div className="bg-gray-700 rounded-lg p-3 my-3 text-center">
          <span className="text-2xl font-bold text-blue-400">{currentOffer.powerAmount} 파워</span>
          {currentOffer.vpCost > 0 && (
            <span className="text-red-400 ml-2 text-sm">(-{currentOffer.vpCost} VP)</span>
          )}
        </div>

        {currentOffer.isTaklons && (
          <div className="mb-3">
            <p className="text-sm text-yellow-300 mb-1">타클론 PI — 순서 선택:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTaklonsChoice('CHARGE_FIRST')}
                className={`flex-1 text-xs py-1 rounded ${taklonsChoice === 'CHARGE_FIRST' ? 'bg-blue-600' : 'bg-gray-600'}`}
              >
                파워 충전 → 토큰
              </button>
              <button
                onClick={() => setTaklonsChoice('TOKEN_FIRST')}
                className={`flex-1 text-xs py-1 rounded ${taklonsChoice === 'TOKEN_FIRST' ? 'bg-blue-600' : 'bg-gray-600'}`}
              >
                토큰 먼저 → 파워 충전
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            disabled={isDeciding}
            onClick={() => handleDecide(true)}
            className="flex-1 bg-blue-600 hover:bg-blue-500 py-2 rounded-lg font-semibold disabled:opacity-50"
          >
            받기
          </button>
          <button
            disabled={isDeciding}
            onClick={() => handleDecide(false)}
            className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded-lg disabled:opacity-50"
          >
            거절
          </button>
        </div>
      </div>
    </div>
  );
};
