import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';

interface Props {
  roomId: string;
  myPlayerId: string;
}

export const ItarsGaiaChoiceDialog: React.FC<Props> = ({ roomId, myPlayerId }) => {
  const itarsGaiaChoice = useGameStore(s => s.itarsGaiaChoice);
  const setItarsGaiaChoice = useGameStore(s => s.setItarsGaiaChoice);
  const tentativeTechTileCode = useGameStore(s => s.tentativeTechTileCode);
  const tentativeTechTrackCode = useGameStore(s => s.tentativeTechTrackCode);
  const setTentativeTechTile = useGameStore(s => s.setTentativeTechTile);
  const [loading, setLoading] = useState(false);

  if (!itarsGaiaChoice) return null;

  const isMyChoice = itarsGaiaChoice.itarsPlayerId === myPlayerId;

  // 다른 플레이어: 대기 배너 (맵 위)
  if (!isMyChoice) {
    return (
      <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-orange-900/90 backdrop-blur-sm border border-orange-500/40 text-orange-200 px-6 py-2.5 rounded-xl z-40 text-sm shadow-lg">
        아이타가 의회 능력 사용 여부를 선택 중입니다...
      </div>
    );
  }

  // 기술 타일 선택 모드
  if (itarsGaiaChoice.tilePicking) {
    const hasSelection = tentativeTechTileCode && tentativeTechTrackCode;
    const needsTrack = tentativeTechTileCode && !tentativeTechTrackCode;

    const handleConfirm = async () => {
      if (!hasSelection) return;
      setLoading(true);
      try {
        const coverTile = useGameStore.getState().tentativeCoverTileCode ?? undefined;
        await roomApi.itarsGaiaChoice(roomId, myPlayerId, 'TAKE_TILE', tentativeTechTileCode!, tentativeTechTrackCode!, coverTile);
        setTentativeTechTile(null, null);
        // WS 이벤트로 상태 갱신됨
      } catch (e: any) {
        alert(e?.response?.data?.message ?? '오류');
      } finally {
        setLoading(false);
      }
    };

    const handleCancel = () => {
      setTentativeTechTile(null, null);
      setItarsGaiaChoice({ ...itarsGaiaChoice, tilePicking: false });
    };

    return (
      <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-orange-900/90 backdrop-blur-sm border border-orange-500/40 text-orange-200 px-6 py-2.5 rounded-xl z-40 text-sm shadow-lg flex items-center gap-3">
        {hasSelection ? (
          <>
            <span>선택: {tentativeTechTileCode!.replace('BASIC_', '').replace('ADV_', '고급 ')} ({tentativeTechTrackCode})</span>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? '처리중...' : '확정'}
            </button>
            <button
              onClick={() => setTentativeTechTile(null, null)}
              disabled={loading}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs cursor-pointer"
            >
              다시 선택
            </button>
          </>
        ) : needsTrack ? (
          <>
            <span>선택: {tentativeTechTileCode!.replace('BASIC_', '')} → 트랙을 클릭하세요</span>
            <button
              onClick={() => setTentativeTechTile(null, null)}
              disabled={loading}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs cursor-pointer"
            >
              다시 선택
            </button>
          </>
        ) : (
          <>
            <span>기술 트랙에서 타일을 선택하세요 (가이아 4 소모)</span>
          </>
        )}
        <button
          onClick={handleCancel}
          disabled={loading}
          className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs cursor-pointer"
        >
          취소
        </button>
      </div>
    );
  }

  const handleUse = () => {
    setItarsGaiaChoice({ ...itarsGaiaChoice, tilePicking: true });
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await roomApi.itarsGaiaChoice(roomId, myPlayerId, 'SKIP');
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-cyan-500 rounded-xl p-5 w-[340px] text-white">
        <h3 className="text-lg font-bold text-cyan-400 mb-2">아이타 PI - 의회 능력</h3>
        <p className="text-gray-300 text-sm mb-3">
          가이아 파워 4개를 소모하여 기본 기술 타일 1개를 획득합니다.
        </p>
        <div className="bg-gray-700 rounded-lg p-2 mb-4 text-center">
          <span className="text-lg font-bold text-green-400">
            {itarsGaiaChoice.availableChoices}회 사용 가능
          </span>
          <span className="text-gray-400 text-sm ml-2">(가이아 {itarsGaiaChoice.availableChoices * 4}개)</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleUse}
            disabled={loading}
            className="flex-1 bg-cyan-700 hover:bg-cyan-600 py-2.5 rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
          >
            능력 사용
          </button>
          <button
            onClick={handleSkip}
            disabled={loading}
            className="flex-1 bg-gray-600 hover:bg-gray-500 py-2.5 rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
          >
            {loading ? '처리중...' : '미사용'}
          </button>
        </div>
      </div>
    </div>
  );
};
