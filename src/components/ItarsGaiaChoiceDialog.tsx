import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';
import type { TechTileInfo } from '../api/client';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage';

interface Props {
  roomId: string;
  myPlayerId: string;
}

const TRACK_LABELS: Record<string, string> = {
  TERRA_FORMING: '테라', NAVIGATION: '항법', AI: 'AI',
  GAIA_FORMING: '가이아', ECONOMY: '경제', SCIENCE: '과학',
};
const TRACK_ORDER = ['TERRA_FORMING', 'NAVIGATION', 'AI', 'GAIA_FORMING', 'ECONOMY', 'SCIENCE'];

export const ItarsGaiaChoiceDialog: React.FC<Props> = ({ roomId, myPlayerId }) => {
  const itarsGaiaChoice = useGameStore(s => s.itarsGaiaChoice);
  const [tiles, setTiles] = useState<TechTileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackPickingFor, setTrackPickingFor] = useState<string | null>(null);

  const isMyChoice = itarsGaiaChoice?.itarsPlayerId === myPlayerId;

  useEffect(() => {
    if (itarsGaiaChoice && isMyChoice) {
      roomApi.getTechTracks(roomId).then(res => {
        setTiles(res.data.basicTiles.filter(t => !t.isTaken));
      }).catch(() => setTiles([]));
    }
  }, [itarsGaiaChoice, isMyChoice, roomId]);

  if (!itarsGaiaChoice) return null;

  // 다른 플레이어: 대기 배너
  if (!isMyChoice) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-cyan-900/90 backdrop-blur-sm border border-cyan-500/40 text-cyan-200 px-6 py-2.5 rounded-xl z-40 text-sm shadow-lg">
        아이타가 가이아 기술 타일을 선택 중입니다...
      </div>
    );
  }

  const handleTakeTile = async (tileCode: string, techTrackCode?: string) => {
    setLoading(true);
    try {
      const res = await roomApi.itarsGaiaChoice(roomId, myPlayerId, 'TAKE_TILE', tileCode, techTrackCode);
      if (!res.data.success) {
        alert(res.data.message ?? '기술 타일 획득 실패');
      }
      setTrackPickingFor(null);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '오류');
    } finally {
      setLoading(false);
    }
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

  const handleTileClick = (tile: TechTileInfo) => {
    if (tile.trackCode === 'COMMON' || tile.trackCode === 'EXPANSION') {
      setTrackPickingFor(tile.tileCode);
    } else {
      handleTakeTile(tile.tileCode);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-cyan-500 rounded-xl p-5 w-[420px] text-white">
        <h3 className="text-lg font-bold text-cyan-400 mb-2">아이타 PI - 가이아 기술 타일</h3>
        <p className="text-gray-300 text-sm mb-1">
          가이아 파워 4개를 제거하고 기본 기술 타일 1개를 획득합니다.
        </p>
        <div className="bg-gray-700 rounded-lg p-2 my-3 text-center">
          <span className="text-lg font-bold text-green-400">
            {itarsGaiaChoice.availableChoices}회 선택 가능
          </span>
          <span className="text-gray-400 text-sm ml-2">(가이아 {itarsGaiaChoice.availableChoices * 4}개)</span>
        </div>

        {/* 트랙 선택 모드 */}
        {trackPickingFor && (
          <div className="mb-3 p-2 bg-blue-900/50 border border-blue-600/30 rounded">
            <p className="text-[10px] text-blue-300 mb-1">{trackPickingFor} → 트랙 선택:</p>
            <div className="flex flex-wrap gap-1">
              {TRACK_ORDER.map(t => (
                <button key={t} onClick={() => handleTakeTile(trackPickingFor, t)}
                  disabled={loading}
                  className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">
                  {TRACK_LABELS[t]}
                </button>
              ))}
              <button onClick={() => setTrackPickingFor(null)}
                className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs cursor-pointer">
                취소
              </button>
            </div>
          </div>
        )}

        {/* 기술 타일 목록 */}
        {!trackPickingFor && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tiles.length === 0 ? (
              <p className="text-gray-400 text-sm">가져갈 수 있는 타일 없음</p>
            ) : tiles.map(tile => {
              const imgSrc = TECH_TILE_IMAGE_MAP[tile.tileCode];
              return (
                <button key={tile.tileCode}
                  onClick={() => !loading && handleTileClick(tile)}
                  disabled={loading}
                  title={tile.description}
                  className="rounded cursor-pointer ring-2 ring-green-400 hover:brightness-125 transition disabled:opacity-50">
                  {imgSrc ? (
                    <img src={imgSrc} alt={tile.tileCode} className="h-12 w-auto object-contain" draggable={false} />
                  ) : (
                    <span className="text-xs text-white px-2 py-1">{tile.tileCode}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 스킵 버튼 */}
        <button onClick={handleSkip} disabled={loading}
          className="w-full bg-gray-600 hover:bg-gray-500 py-2 rounded-lg font-semibold disabled:opacity-50">
          {loading ? '처리중...' : '건너뛰기 (남은 가이아 복귀)'}
        </button>
      </div>
    </div>
  );
};
