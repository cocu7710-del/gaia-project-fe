import { useGameStore } from '../store/gameStore';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage';
import type { TechTrackResponse } from '../api/client';

/**
 * 고급 기술 타일 획득 시 덮을 기본 타일 선택 패널
 * - 고급 타일(ADV_)을 tentativeTechTileCode로 선택한 상태에서 표시
 * - 플레이어가 보유한 미덮인(uncovered) 기본 타일 목록을 보여줌
 * - 클릭하면 tentativeCoverTileCode 설정
 */
export default function CoverTileSelector() {
  const tentativeTechTileCode = useGameStore(s => s.tentativeTechTileCode);
  const tentativeCoverTileCode = useGameStore(s => s.tentativeCoverTileCode);
  const setTentativeCoverTile = useGameStore(s => s.setTentativeCoverTile);
  const techTileData = useGameStore(s => s.techTileData);
  const myPlayerId = useGameStore(s => s.playerId);

  // 고급 타일이 선택된 경우에만 표시
  if (!tentativeTechTileCode || !tentativeTechTileCode.startsWith('ADV_')) return null;

  // 내가 보유한 기본 타일 목록 (uncovered만)
  const myBasicTiles = getMyUncoveredBasicTiles(techTileData, myPlayerId);

  if (myBasicTiles.length === 0) {
    return (
      <div className="game-panel !border-red-500/30 mt-1">
        <div className="text-[8px] text-red-300 text-center">
          덮을 기본 타일이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="game-panel !border-purple-500/30 mt-1">
      <div className="text-[8px] text-purple-300 mb-1 text-center font-semibold">
        덮을 기본 타일 선택
      </div>
      <div className="flex flex-wrap gap-1 justify-center">
        {myBasicTiles.map(tile => {
          const imgSrc = TECH_TILE_IMAGE_MAP[tile.tileCode];
          const isSelected = tentativeCoverTileCode === tile.tileCode;
          return (
            <div
              key={tile.tileCode}
              className={`cursor-pointer rounded transition ${
                isSelected ? 'ring-2 ring-purple-400 bg-purple-900/40' : 'hover:ring-1 hover:ring-purple-400/50'
              }`}
              style={{ width: '28%', maxWidth: 50 }}
              onClick={() => setTentativeCoverTile(isSelected ? null : tile.tileCode)}
              title={`${tile.description} (클릭하여 선택)`}
            >
              {imgSrc && <img src={imgSrc} alt={tile.tileCode} className="w-full object-contain" draggable={false} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 플레이어가 보유한 미덮인 기본 타일 목록 추출 */
function getMyUncoveredBasicTiles(
  techTileData: TechTrackResponse | null,
  myPlayerId: string | null,
): { tileCode: string; description: string }[] {
  if (!techTileData || !myPlayerId) return [];

  return techTileData.basicTiles
    .filter(tile => {
      const isOwned = (tile.ownerPlayerIds ?? []).includes(myPlayerId);
      // coveredBy 정보는 서버에서 isTaken으로 관리되지 않으므로,
      // 기본 타일은 ownerPlayerIds에 내 ID가 있으면 보유 중
      return isOwned;
    })
    .map(tile => ({ tileCode: tile.tileCode, description: tile.description }));
}
