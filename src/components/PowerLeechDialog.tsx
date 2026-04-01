import React from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';
import powerImg from '../assets/resource/Power.png';

interface Props {
  roomId: string;
  myPlayerId: string;
}

/** 파워 순환 시뮬레이션 */
function simulateCharge(b1: number, b2: number, b3: number, brain: number | null, amount: number) {
  let rem = amount;
  const fb1 = Math.min(b1, rem);
  b1 -= fb1; b2 += fb1; rem -= fb1;
  if (rem > 0 && brain === 1) { brain = 2; rem--; }
  if (rem > 0 && brain === 2) { brain = 3; rem--; }
  if (rem > 0) { const fb2 = Math.min(b2, rem); b2 -= fb2; b3 += fb2; rem -= fb2; }
  return { b1, b2, b3, brain };
}

export const PowerLeechDialog: React.FC<Props> = ({ roomId, myPlayerId }) => {
  const leechBatch = useGameStore(s => s.leechBatch);
  const mySeatNo = useGameStore(s => s.mySeatNo);
  const [isDeciding, setIsDeciding] = React.useState(false);
  const [taklonsOrder, setTaklonsOrder] = React.useState<string[]>([]);
  const [playerStates, setPlayerStates] = React.useState<any[]>([]);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (!roomId) return;
    roomApi.getPlayerStates(roomId).then(res => setPlayerStates(res.data)).catch(() => {});
  }, [roomId, leechBatch]);

  React.useEffect(() => {
    setTaklonsOrder([]);
  }, [leechBatch]);

  const isMyDecision = leechBatch?.deciderIds?.includes(myPlayerId)
    ?? leechBatch?.currentDeciderId === myPlayerId;
  if (!leechBatch || !isMyDecision) return null;

  const currentOffer = leechBatch.offers.find(o => o.receivePlayerId === myPlayerId);
  if (!currentOffer) return null;

  const myVP = playerStates.find(p => p.seatNo === mySeatNo)?.victoryPoints;
  const myState = playerStates.find(p => p.seatNo === mySeatNo);
  const baseBowl1 = myState?.powerBowl1 ?? 0;
  const baseBowl2 = myState?.powerBowl2 ?? 0;
  const baseBowl3 = myState?.powerBowl3 ?? 0;
  const baseBrain = myState?.brainstoneBowl ?? null;

  const handleDecide = async (accept: boolean) => {
    setIsDeciding(true);
    try {
      let taklonsChoice: string | undefined;
      if (currentOffer.isTaklons && accept) {
        taklonsChoice = taklonsOrder[0] === 'TOKEN' ? 'TOKEN_FIRST' : 'CHARGE_FIRST';
      }
      await roomApi.decideLeech(roomId, currentOffer.id, myPlayerId, accept, taklonsChoice);
    } finally {
      setIsDeciding(false);
    }
  };

  // 타클론 PI: 순서 선택 항목
  const isTaklonsPI = currentOffer.isTaklons;
  const taklonsItems = isTaklonsPI ? [
    { id: 'CHARGE', label: `${currentOffer.powerAmount}파순` },
    { id: 'TOKEN', label: '1토추' },
  ] : [];
  const taklonsSet = new Set(taklonsOrder);
  const taklonsAllDone = isTaklonsPI ? taklonsOrder.length === 2 : true;

  // 파워 프리뷰 (타클론)
  let previewB1 = baseBowl1, previewB2 = baseBowl2, previewB3 = baseBowl3, previewBrain = baseBrain;
  if (isTaklonsPI) {
    for (const id of taklonsOrder) {
      if (id === 'TOKEN') {
        previewB1 += 1;
      } else if (id === 'CHARGE') {
        const r = simulateCharge(previewB1, previewB2, previewB3, previewBrain, currentOffer.powerAmount);
        previewB1 = r.b1; previewB2 = r.b2; previewB3 = r.b3; previewBrain = r.brain;
      }
    }
  }

  const changed = (val: number, base: number) => val !== base;

  if (collapsed) {
    return (
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 cursor-pointer"
        onClick={() => setCollapsed(false)}>
        <div className="bg-yellow-600 text-black px-6 py-1.5 rounded-t-lg font-bold text-sm flex items-center gap-2 shadow-lg">
          <span>파워 리치 {currentOffer.powerAmount}p</span>
          {currentOffer.vpCost > 0 && <span className="text-red-800">(-{currentOffer.vpCost}VP)</span>}
          <span className="text-xs">({baseBowl1}/{baseBowl2}/{baseBowl3})</span>
          <span className="text-xs ml-1">클릭하여 열기</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-yellow-500 rounded-xl p-3 w-72 text-white">
        <h3 className="text-sm font-bold text-yellow-400 mb-2 flex items-center">
          <span>파워 리치 {myVP != null && <span className="text-gray-400 font-normal text-xs ml-1">{myVP}VP</span>}
          {myState && <span className="text-gray-400 font-normal text-xs ml-1">({baseBowl1}/{baseBowl2}/{baseBowl3})</span>}</span>
          <button onClick={() => setCollapsed(true)} className="ml-auto text-gray-400 hover:text-white text-xs border border-gray-600 px-1.5 py-0.5 rounded">내리기</button>
        </h3>
        <div className="bg-gray-700 rounded-lg p-2 my-2 text-center">
          <span className="text-lg font-bold text-blue-400">{currentOffer.powerAmount} 파워</span>
          {currentOffer.vpCost > 0 && (
            <span className="text-red-400 ml-2 text-xs">(-{currentOffer.vpCost} VP)</span>
          )}
        </div>

        {/* 타클론 PI: 파워 프리뷰 + 순서 선택 */}
        {isTaklonsPI && (
          <>
            <div className="flex items-center justify-center gap-3 mb-2 bg-gray-900/80 rounded-lg py-1.5 px-3">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-900 border border-purple-400" />
                <span className={`font-bold text-xs ${changed(previewB1, baseBowl1) ? 'text-yellow-300' : 'text-white'}`}>{previewB1}</span>
              </div>
              <span className="text-gray-500 text-xs">/</span>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-700 border border-purple-300" />
                <span className={`font-bold text-xs ${changed(previewB2, baseBowl2) ? 'text-yellow-300' : 'text-white'}`}>{previewB2}</span>
              </div>
              <span className="text-gray-500 text-xs">/</span>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-pink-500 border border-pink-300" />
                <span className={`font-bold text-xs ${changed(previewB3, baseBowl3) ? 'text-yellow-300' : 'text-white'}`}>{previewB3}</span>
              </div>
              {previewBrain != null && (
                <>
                  <span className="text-gray-500 text-xs">B:</span>
                  <span className={`font-bold text-xs ${previewBrain !== baseBrain ? 'text-yellow-300' : 'text-amber-400'}`}>{previewBrain}구역</span>
                </>
              )}
            </div>

            <p className="text-[10px] text-yellow-300 mb-1">타클론 PI — 받을 순서 클릭:</p>
            <div className="flex flex-col gap-1 mb-2">
              {taklonsItems.map(item => {
                const applied = taklonsSet.has(item.id);
                const orderNum = taklonsOrder.indexOf(item.id);
                return (
                  <button key={item.id}
                    onClick={() => !applied && setTaklonsOrder(prev => [...prev, item.id])}
                    disabled={applied}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      applied ? 'bg-gray-700 text-gray-500' : 'bg-purple-700 hover:bg-purple-600 cursor-pointer'
                    }`}
                  >
                    {applied && <span className="text-purple-300 text-xs w-3">{orderNum + 1}</span>}
                    <img src={powerImg} className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    {applied && <span className="ml-auto text-green-400 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
            {taklonsOrder.length > 0 && !taklonsAllDone && (
              <button onClick={() => setTaklonsOrder([])}
                className="w-full text-[10px] text-yellow-300 mb-1 hover:underline">초기화</button>
            )}
          </>
        )}

        <div className="flex gap-1.5 mt-2">
          <button
            disabled={isDeciding || (isTaklonsPI && !taklonsAllDone)}
            onClick={() => handleDecide(true)}
            className="flex-1 bg-blue-600 hover:bg-blue-500 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          >
            받기
          </button>
          <button
            disabled={isDeciding}
            onClick={() => handleDecide(false)}
            className="flex-1 bg-gray-600 hover:bg-gray-500 py-1.5 rounded-lg text-sm disabled:opacity-50"
          >
            거절
          </button>
        </div>
      </div>
    </div>
  );
};
