import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { roomApi } from '../api/client';
import type { TechTileInfo } from '../api/client';

const TRACK_LABELS: Record<string, string> = {
  TERRA_FORMING: '테라포밍',
  NAVIGATION: '항법',
  AI: 'AI',
  GAIA_FORMING: '가이아포밍',
  ECONOMY: '경제',
  SCIENCE: '과학',
};

const TRACK_ORDER = ['TERRA_FORMING', 'NAVIGATION', 'AI', 'GAIA_FORMING', 'ECONOMY', 'SCIENCE'];

interface Props {
  roomId: string;
}

/**
 * 교역소/아카데미 건설 시 기술 타일 선택 패널.
 * pendingActions에 TS/Academy 업그레이드가 있고 아직 타일을 선택하지 않은 경우 표시.
 */
export default function TechTilePickerPanel({ roomId }: Props) {
  const {
    turnState,
    tentativeTechTileCode,
    tentativeTechTrackCode,
    setTentativeTechTile,
  } = useGameStore();

  const [tiles, setTiles] = useState<TechTileInfo[]>([]);
  const [pickingTrackFor, setPickingTrackFor] = useState<string | null>(null); // COMMON tile code waiting for track selection

  // 교역소/아카데미 업그레이드 pending 여부 확인
  const pendingUpgrade = turnState.pendingActions.find(
    a => a.type === 'UPGRADE_BUILDING' &&
    (a.payload.toType === 'TRADING_STATION' || a.payload.toType === 'ACADEMY')
  );

  useEffect(() => {
    if (pendingUpgrade && roomId) {
      roomApi.getTechTracks(roomId).then(res => {
        setTiles(res.data.basicTiles.filter(t => !t.isTaken));
      }).catch(() => setTiles([]));
    }
  }, [pendingUpgrade, roomId]);

  if (!pendingUpgrade) return null;

  const buildingLabel = pendingUpgrade.payload.toType === 'TRADING_STATION' ? '교역소' : '아카데미';

  // 트랙별로 타일 그룹
  const trackTiles = TRACK_ORDER.map(track => ({
    track,
    label: TRACK_LABELS[track],
    tile: tiles.find(t => t.trackCode === track),
  }));
  const commonTiles = tiles.filter(t => t.trackCode === 'COMMON' || t.trackCode === 'EXPANSION');

  const handleSelectTile = (tile: TechTileInfo) => {
    if (tile.trackCode === 'COMMON' || tile.trackCode === 'EXPANSION') {
      setPickingTrackFor(tile.tileCode);
    } else {
      setTentativeTechTile(tile.tileCode, null);
      setPickingTrackFor(null);
    }
  };

  const handleSelectTrack = (tileCode: string, trackCode: string) => {
    setTentativeTechTile(tileCode, trackCode);
    setPickingTrackFor(null);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-2 border border-yellow-600">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold text-yellow-400">{buildingLabel} 건설 → 기술 타일 선택</h4>
        {tentativeTechTileCode && (
          <button
            onClick={() => setTentativeTechTile(null, null)}
            className="text-[9px] text-gray-400 hover:text-white"
          >
            선택 취소
          </button>
        )}
      </div>

      {tentativeTechTileCode ? (
        <div className="text-[10px] text-green-400">
          선택됨: {tentativeTechTileCode.replace('BASIC_', '')}
          {tentativeTechTrackCode ? ` (${TRACK_LABELS[tentativeTechTrackCode] ?? tentativeTechTrackCode})` : ''}
        </div>
      ) : (
        <>
          {/* 트랙별 타일 (track-specific) */}
          <div className="grid grid-cols-3 gap-1 mb-1">
            {trackTiles.map(({ track, label, tile }) => (
              <button
                key={track}
                onClick={() => tile && handleSelectTile(tile)}
                disabled={!tile}
                title={tile?.description}
                className={`text-[8px] px-1 py-0.5 rounded border ${
                  tile
                    ? 'bg-gray-700 hover:bg-blue-700 text-gray-200 border-gray-500 cursor-pointer'
                    : 'bg-gray-900 text-gray-600 border-gray-700 cursor-not-allowed opacity-50'
                }`}
              >
                {label}
                {tile ? '' : ' (없음)'}
              </button>
            ))}
          </div>

          {/* COMMON/EXPANSION 타일 */}
          {commonTiles.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              <span className="text-[8px] text-gray-400 self-center">공용:</span>
              {commonTiles.map(tile => (
                <div key={tile.tileCode}>
                  <button
                    onClick={() => handleSelectTile(tile)}
                    title={tile.description}
                    className="text-[8px] px-1 py-0.5 bg-gray-700 hover:bg-purple-700 text-gray-200 border border-gray-500 rounded cursor-pointer"
                  >
                    {tile.tileCode.replace('BASIC_', '')}
                  </button>
                  {pickingTrackFor === tile.tileCode && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {TRACK_ORDER.map(t => (
                        <button
                          key={t}
                          onClick={() => handleSelectTrack(tile.tileCode, t)}
                          className="text-[8px] px-1 py-0.5 bg-blue-700 hover:bg-blue-600 text-white rounded cursor-pointer"
                        >
                          {TRACK_LABELS[t]}
                        </button>
                      ))}
                      <button
                        onClick={() => setPickingTrackFor(null)}
                        className="text-[8px] px-1 py-0.5 bg-gray-600 text-white rounded cursor-pointer"
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="text-[8px] text-gray-500">타일 선택 없이 확정하면 타일 획득 안 함</div>
        </>
      )}
    </div>
  );
}
