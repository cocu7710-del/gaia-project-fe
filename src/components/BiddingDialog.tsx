import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';
import type { SeatView } from '../api/client';

const FACTION_NAME_KO: Record<string, string> = {
  TERRANS: '테란', LANTIDS: '란티드', HADSCH_HALLAS: '하드쉬할라', IVITS: '하이브',
  TAKLONS: '타클론', AMBAS: '엠바스', GEODENS: '기오덴', BAL_TAKS: '발타크',
  GLEENS: '글린', XENOS: '제노스', FIRAKS: '파이락', BESCODS: '매드안드로이드',
  ITARS: '아이타', NEVLAS: '네블라', MOWEIDS: '모웨이드', SPACE_GIANTS: '스페이스자이언트',
  TINKEROIDS: '팅커로이드', DAKANIANS: '다카니안',
};

interface Props {
  roomId: string;
  myPlayerId: string;
  seats: SeatView[];
}

export default function BiddingDialog({ roomId, myPlayerId, seats }: Props) {
  const biddingState = useGameStore(s => s.biddingState);
  const [bidInput, setBidInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const prevTurnRef = useRef<string | null>(null);

  const gamePhase = biddingState?.gamePhase ?? '';
  const biddingRound = biddingState?.biddingRound ?? 0;
  const currentBid = biddingState?.currentBid ?? 0;
  const turnPlayerId = biddingState?.turnPlayerId ?? '';
  const bidders = biddingState?.bidders ?? [];

  const isMyTurn = turnPlayerId === myPlayerId;
  const isBiddingPhase = gamePhase === 'BIDDING';
  const isSeatPickPhase = gamePhase === 'BID_SEAT_PICK';
  const isMyPick = isSeatPickPhase && turnPlayerId === myPlayerId;

  // 내 턴이 되면 자동으로 열기
  useEffect(() => {
    if ((isMyTurn || isMyPick) && prevTurnRef.current !== turnPlayerId) {
      setMinimized(false);
    }
    prevTurnRef.current = turnPlayerId;
  }, [isMyTurn, isMyPick, turnPlayerId]);

  if (!biddingState) return null;

  // 내 비딩 정보
  const myBid = bidders.find(b => b.playerId === myPlayerId);
  const activeBidders = bidders.filter(b => !b.isPassed && b.pickOrder === 0);

  const handlePlaceBid = async () => {
    const amount = parseInt(bidInput);
    if (isNaN(amount) || amount <= currentBid) return;
    setLoading(true);
    try {
      const res = await roomApi.placeBid(roomId, myPlayerId, amount);
      if (!res.data.success) alert(res.data.message);
      setBidInput('');
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '비딩 실패');
    } finally {
      setLoading(false);
    }
  };

  const handlePass = async () => {
    setLoading(true);
    try {
      const res = await roomApi.passBid(roomId, myPlayerId);
      if (!res.data.success) alert(res.data.message);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '패스 실패');
    } finally {
      setLoading(false);
    }
  };

  const handlePickSeat = async (seatNo: number) => {
    setLoading(true);
    try {
      const res = await roomApi.pickBidSeat(roomId, myPlayerId, seatNo);
      if (!res.data.success) alert(res.data.message);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '좌석 선택 실패');
    } finally {
      setLoading(false);
    }
  };

  // 최소화 상태: 하단 바
  if (minimized) {
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-amber-500 rounded-lg px-4 py-2 flex items-center gap-3 cursor-pointer shadow-lg"
        onClick={() => setMinimized(false)}
      >
        <span className="text-amber-400 font-bold text-sm">비딩 R{biddingRound}</span>
        <span className="text-white text-sm">현재 {currentBid}</span>
        {(isMyTurn || isMyPick) && <span className="text-yellow-300 font-bold text-sm animate-pulse">내 차례!</span>}
        <span className="text-gray-400 text-xs">(클릭하여 열기)</span>
      </div>
    );
  }

  // 이미 좌석 선택 완료한 플레이어
  if (myBid && myBid.pickOrder > 0) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-gray-800 border border-amber-500 rounded-xl p-3.5 w-[270px] text-white text-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-amber-400">비딩 진행 중 (라운드 {biddingRound})</h3>
            <button onClick={() => setMinimized(true)} className="text-gray-400 hover:text-white text-lg">▼</button>
          </div>
          <p className="text-gray-300 text-sm mb-3">다른 플레이어의 비딩을 기다리고 있습니다...</p>
          <BidderList bidders={bidders} turnPlayerId={turnPlayerId} myPlayerId={myPlayerId} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-amber-500 rounded-xl p-3.5 w-[270px] text-white text-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-amber-400">
            {isSeatPickPhase ? '좌석 선택' : `비딩 라운드 ${biddingRound}`}
          </h3>
          <button onClick={() => setMinimized(true)} className="text-gray-400 hover:text-white text-lg">▼</button>
        </div>

        {/* 비딩 참가자 목록 */}
        <BidderList bidders={bidders} turnPlayerId={turnPlayerId} myPlayerId={myPlayerId} />

        {/* 현재 비딩 금액 */}
        {isBiddingPhase && (
          <div className="mt-3 text-center">
            <span className="text-gray-400 text-sm">현재 비딩: </span>
            <span className="text-amber-300 font-bold text-xl">{currentBid}</span>
          </div>
        )}

        {/* 내 턴 - 비딩 입력 */}
        {isBiddingPhase && isMyTurn && !myBid?.isPassed && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="number"
                min={currentBid + 1}
                value={bidInput}
                onChange={e => setBidInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={`${currentBid + 1} 이상 입력`}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                disabled={loading}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePlaceBid}
                disabled={loading || !bidInput || parseInt(bidInput) <= currentBid}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 disabled:text-gray-400 text-white font-bold py-2 rounded transition-colors"
              >
                확정
              </button>
              <button
                onClick={handlePass}
                disabled={loading}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:bg-gray-600 text-white font-bold py-2 rounded transition-colors"
              >
                패스
              </button>
            </div>
          </div>
        )}

        {/* 내 턴 아님 */}
        {isBiddingPhase && !isMyTurn && !myBid?.isPassed && (
          <div className="mt-4 text-center text-gray-400 text-sm">
            {bidders.find(b => b.playerId === turnPlayerId)?.nickname}의 비딩 차례입니다...
          </div>
        )}

        {/* 패스한 상태 */}
        {isBiddingPhase && myBid?.isPassed && (
          <div className="mt-4 text-center text-red-400 text-sm font-bold">
            패스했습니다. 다른 플레이어의 비딩을 기다리는 중...
          </div>
        )}

        {/* 좌석 선택 (낙찰자) */}
        {isSeatPickPhase && isMyPick && (
          <div className="mt-4">
            <p className="text-amber-300 text-sm mb-2 font-bold">낙찰! 좌석(캐릭터)을 선택하세요:</p>
            <div className="grid grid-cols-2 gap-2">
              {seats.map(s => {
                const taken = !!s.playerId;
                return (
                  <button
                    key={s.seatNo}
                    onClick={() => !taken && handlePickSeat(s.seatNo)}
                    disabled={loading || taken}
                    className={`rounded p-2 text-sm transition-colors border-2 ${
                      taken
                        ? 'bg-gray-800 border-red-500 opacity-50 cursor-not-allowed'
                        : 'bg-gray-700 hover:bg-gray-600 border-green-500 cursor-pointer'
                    }`}
                  >
                    <div className={`font-bold ${taken ? 'text-red-400' : 'text-green-300'}`}>{s.seatNo}턴</div>
                    <div className={`text-xs ${taken ? 'text-red-300' : 'text-gray-300'}`}>
                      {s.raceNameKo || FACTION_NAME_KO[s.raceCode ?? ''] || s.raceCode}
                    </div>
                    {taken && <div className="text-[10px] text-red-400 mt-0.5">선택됨</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 좌석 선택 대기 (다른 플레이어) */}
        {isSeatPickPhase && !isMyPick && (
          <div className="mt-4 text-center text-gray-400 text-sm">
            {bidders.find(b => b.playerId === turnPlayerId)?.nickname}이(가) 좌석을 선택 중입니다...
          </div>
        )}
      </div>
    </div>
  );
}

function BidderList({ bidders, turnPlayerId, myPlayerId }: {
  bidders: { playerId: string; nickname: string; bidAmount: number; isPassed: boolean; pickOrder: number; seatNo: number }[];
  turnPlayerId: string;
  myPlayerId: string;
}) {
  return (
    <div className="space-y-1">
      {bidders.map(b => {
        const isMe = b.playerId === myPlayerId;
        const isTurn = b.playerId === turnPlayerId;
        const isDone = b.pickOrder > 0;
        return (
          <div
            key={b.playerId}
            className={`flex items-center justify-between px-2 py-1 rounded text-sm
              ${isTurn ? 'bg-amber-500/20 border border-amber-500/50' : ''}
              ${b.isPassed ? 'opacity-40' : ''}
              ${isDone ? 'opacity-50' : ''}`}
          >
            <span className={isMe ? 'text-yellow-300 font-bold' : 'text-gray-200'}>
              {b.nickname}{isMe ? ' (나)' : ''}
              {isDone ? ` [${b.seatNo}번]` : ''}
            </span>
            <span className={`font-bold ${b.isPassed ? 'text-red-400' : 'text-amber-300'}`}>
              {isDone ? `확정 -${b.bidAmount}` : b.isPassed ? 'PASS' : b.bidAmount > 0 ? b.bidAmount : '-'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
