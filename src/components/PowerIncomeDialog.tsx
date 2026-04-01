import React from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';
import powerImg from '../assets/resource/Power.png';

interface Props {
  roomId: string;
  myPlayerId: string;
}

/** 파워 순환 시뮬레이션 (applyPowerCharge와 동일 로직) */
function simulateCharge(b1: number, b2: number, b3: number, brain: number | null, amount: number) {
  let rem = amount;
  // bowl1 → bowl2
  const fb1 = Math.min(b1, rem);
  b1 -= fb1; b2 += fb1; rem -= fb1;
  if (rem > 0 && brain === 1) { brain = 2; rem--; }
  // bowl2 → bowl3: 브레인 우선
  if (rem > 0 && brain === 2) { brain = 3; rem--; }
  if (rem > 0) { const fb2 = Math.min(b2, rem); b2 -= fb2; b3 += fb2; rem -= fb2; }
  return { b1, b2, b3, brain };
}

export const PowerIncomeDialog: React.FC<Props> = ({ roomId, myPlayerId }) => {
  const data = useGameStore(s => s.powerIncomeChoice);
  const mySeatNo = useGameStore(s => s.mySeatNo);
  const [appliedOrder, setAppliedOrder] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [playerStates, setPlayerStates] = React.useState<any[]>([]);

  React.useEffect(() => {
    setAppliedOrder([]);
    if (roomId) {
      roomApi.getPlayerStates(roomId).then(res => setPlayerStates(res.data)).catch(() => {});
    }
  }, [data, roomId]);

  if (!data) return null;

  const myData = data.players.find(p => p.playerId === myPlayerId);

  if (!myData) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-purple-900/90 backdrop-blur-sm border border-purple-500/40 text-purple-200 px-6 py-2.5 rounded-xl z-40 text-sm shadow-lg">
        파워 수입 순서 선택 중...
      </div>
    );
  }

  // 현재 파워 상태
  const myState = playerStates.find(p => p.seatNo === mySeatNo);
  const baseBowl1 = myState?.powerBowl1 ?? 0;
  const baseBowl2 = myState?.powerBowl2 ?? 0;
  const baseBowl3 = myState?.powerBowl3 ?? 0;
  const baseBrain = myState?.brainstoneBowl ?? null;

  // 선택 순서에 따른 프리뷰 계산
  const allItems = myData.items;
  const appliedSet = new Set(appliedOrder);
  const remainingItems = allItems.filter(item => !appliedSet.has(item.id));
  const allDone = remainingItems.length === 0;

  let previewB1 = baseBowl1, previewB2 = baseBowl2, previewB3 = baseBowl3, previewBrain = baseBrain;
  for (const itemId of appliedOrder) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) continue;
    if (item.powerBowl1 > 0) {
      previewB1 += item.powerBowl1;
    }
    if (item.powerCharge > 0) {
      const result = simulateCharge(previewB1, previewB2, previewB3, previewBrain, item.powerCharge);
      previewB1 = result.b1; previewB2 = result.b2; previewB3 = result.b3; previewBrain = result.brain;
    }
  }

  const handleApply = (itemId: string) => {
    if (appliedSet.has(itemId)) return;
    setAppliedOrder(prev => [...prev, itemId]);
  };

  const handleComplete = async () => {
    if (loading || !allDone) return;
    setLoading(true);
    try {
      const res = await roomApi.completePowerIncome(roomId, myPlayerId, appliedOrder);
      if (res.data.success) {
        // 자기만 제거, 다른 플레이어 진행 상태 유지
        const current = useGameStore.getState().powerIncomeChoice;
        if (current) {
          const remaining = current.players.filter(p => p.playerId !== myPlayerId);
          if (remaining.length === 0) {
            useGameStore.getState().setPowerIncomeChoice(null);
          } else {
            useGameStore.getState().setPowerIncomeChoice({ players: remaining });
          }
        }
      }
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '오류');
    } finally {
      setLoading(false);
    }
  };

  const changed = (val: number, base: number) => val !== base;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-purple-500 rounded-xl p-4 w-80 text-white">
        <h3 className="text-sm font-bold text-purple-400 mb-2">파워 수입 순서 선택</h3>

        {/* 파워 프리뷰 */}
        <div className="flex items-center justify-center gap-3 mb-3 bg-gray-900/80 rounded-lg py-2 px-3">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-purple-900 border border-purple-400" />
            <span className={`font-bold text-sm ${changed(previewB1, baseBowl1) ? 'text-yellow-300' : 'text-white'}`}>{previewB1}</span>
          </div>
          <span className="text-gray-500">/</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-purple-700 border border-purple-300" />
            <span className={`font-bold text-sm ${changed(previewB2, baseBowl2) ? 'text-yellow-300' : 'text-white'}`}>{previewB2}</span>
          </div>
          <span className="text-gray-500">/</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-pink-500 border border-pink-300" />
            <span className={`font-bold text-sm ${changed(previewB3, baseBowl3) ? 'text-yellow-300' : 'text-white'}`}>{previewB3}</span>
          </div>
          {previewBrain != null && (
            <>
              <span className="text-gray-500">B:</span>
              <span className={`font-bold text-sm ${previewBrain !== baseBrain ? 'text-yellow-300' : 'text-amber-400'}`}>{previewBrain}구역</span>
            </>
          )}
        </div>

        <p className="text-gray-400 text-[10px] mb-2">원하는 순서로 클릭하세요</p>

        <div className="flex flex-col gap-1.5">
          {allItems.map((item) => {
            const applied = appliedSet.has(item.id);
            const orderNum = appliedOrder.indexOf(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleApply(item.id)}
                disabled={applied || loading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  applied
                    ? 'bg-gray-700 text-gray-500'
                    : 'bg-purple-700 hover:bg-purple-600 cursor-pointer'
                }`}
              >
                {applied && <span className="text-purple-300 text-xs w-4">{orderNum + 1}</span>}
                <img src={powerImg} className="w-4 h-4" />
                <span>{item.label}</span>
                {applied && <span className="ml-auto text-green-400 text-xs">✓</span>}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mt-3">
          {appliedOrder.length > 0 && (
            <button
              onClick={() => setAppliedOrder([])}
              disabled={loading}
              className="flex-1 bg-yellow-600 hover:bg-yellow-500 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
            >
              초기화
            </button>
          )}
          {allDone && (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
            >
              {loading ? '처리중...' : '완료'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
