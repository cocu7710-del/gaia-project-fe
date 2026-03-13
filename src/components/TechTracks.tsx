import { useEffect, useState, type ReactElement, useCallback } from 'react';
import { roomApi } from '../api/client';
import type { TechTrackResponse, TechTrackInfo, TechTileInfo, AdvancedTechTileInfo, PlayerStateResponse } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage.ts';
import { ADV_TECH_TILE_IMAGE_MAP } from '../constants/advTechTileImage.ts';
import { PLANET_COLORS } from '../constants/colors';
import type { AdvanceTechAction } from '../types/turnActions';

interface TechTracksProps {
  roomId: string;
  playerStates?: PlayerStateResponse[];
  isMyTurn?: boolean;
  mySeatNo?: number | null;
  gamePhase?: string | null;
  refreshKey?: number;
}

// 트랙별 배경색
const trackBgColors: Record<string, string> = {
  TERRA_FORMING: 'bg-red-700',
  NAVIGATION: 'bg-sky-600',
  AI: 'bg-green-700',
  GAIA_FORMING: 'bg-purple-700',
  ECONOMY: 'bg-orange-600',
  SCIENCE: 'bg-blue-700',
};

// 트랙 코드 → 플레이어 상태 필드 매핑
const trackToPlayerField: Record<string, keyof PlayerStateResponse> = {
  TERRA_FORMING: 'techTerraforming',
  NAVIGATION: 'techNavigation',
  AI: 'techAi',
  GAIA_FORMING: 'techGaia',
  ECONOMY: 'techEconomy',
  SCIENCE: 'techScience',
};


export default function TechTracks({ roomId, playerStates = [], isMyTurn = false, mySeatNo = null, gamePhase, refreshKey = 0 }: TechTracksProps) {
  const [techData, setTechData] = useState<TechTrackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { turnState, addPendingAction, updatePreviewState, tentativeTechTileCode, tentativeTechTrackCode, setTentativeTechTile, setTechTileData } = useGameStore();
  const [pickingTrackFor, setPickingTrackFor] = useState<string | null>(null);

  const hasPendingTechPickBase = isMyTurn && turnState.pendingActions.some(
    a => a.type === 'UPGRADE_BUILDING' &&
      (a.payload.toType === 'RESEARCH_LAB' || a.payload.toType === 'ACADEMY')
  );

  const handleTileClick = useCallback((tile: TechTileInfo) => {
    if (!hasPendingTechPickBase || tile.isTaken || tentativeTechTileCode) return;
    if (tile.trackCode === 'COMMON' || tile.trackCode === 'EXPANSION') {
      setPickingTrackFor(tile.tileCode);
    } else {
      setTentativeTechTile(tile.tileCode, tile.trackCode);
    }
  }, [hasPendingTechPickBase, tentativeTechTileCode, setTentativeTechTile]);


  useEffect(() => {
    const loadTechData = async () => {
      try {
        setLoading(true);
        const res = await roomApi.getTechTracks(roomId);
        setTechData(res.data);
        setTechTileData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.message || '기술 트랙 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    loadTechData();
  }, [roomId, refreshKey]);

  if (loading) {
    return <div className="bg-gray-800 p-2 rounded-lg text-gray-400 text-center text-xs h-full">로딩...</div>;
  }

  if (error) {
    return <div className="bg-gray-800 p-2 rounded-lg text-red-400 text-center text-xs h-full">{error}</div>;
  }

  if (!techData) {
    return null;
  }

  const { tracks, basicTiles, advancedTiles } = techData;

  const isPlayingPhase = gamePhase === 'PLAYING';
  const hasPendingAction = turnState.pendingActions.length > 0;

  const hasPendingTechPick = hasPendingTechPickBase;

  const myPlayerState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);

  // preview 상태 반영: 내 플레이어는 previewPlayerState로 교체
  const effectivePlayerStates = myPlayerState && mySeatNo != null
    ? playerStates.map(ps => ps.seatNo === mySeatNo ? myPlayerState as PlayerStateResponse : ps)
    : playerStates;

  const handleTrackClick = (trackCode: string) => {
    // 공용/함대 타일 선택 후 트랙 지정 모드
    if (pickingTrackFor) {
      setTentativeTechTile(pickingTrackFor, trackCode);
      setPickingTrackFor(null);
      return;
    }
    if (!isMyTurn || !isPlayingPhase || hasPendingAction) return;
    if (!myPlayerState || myPlayerState.knowledge < 4) return;

    const field = trackToPlayerField[trackCode];
    if (!field || (myPlayerState[field] as number) >= 5) return;

    const action: AdvanceTechAction = {
      id: `action-${Date.now()}`,
      type: 'ADVANCE_TECH',
      timestamp: Date.now(),
      payload: { trackCode, cost: { knowledge: 4 } },
    };
    addPendingAction(action);
    updatePreviewState();
  };

  // playerId → 플레이어 색상 (팩션 행성 기반)
  const getPlayerColorById = (playerId: string | null | undefined): string | null => {
    if (!playerId) return null;
    const ps = playerStates.find(p => p.playerId === playerId);
    if (!ps) return null;
    const planetType = getPlanetTypeFromFaction(ps.factionCode);
    return PLANET_COLORS[planetType] || '#ffffff';
  };

  // 트랙별 기본 타일 매핑
  const getTileForTrack = (trackCode: string): TechTileInfo | undefined => {
    return basicTiles.find((tile) => tile.trackCode === trackCode);
  };

  // 트랙별 고급 타일 매핑
  const getAdvTileForTrack = (trackCode: string): AdvancedTechTileInfo | undefined => {
    return advancedTiles.find((tile) => tile.trackCode === trackCode);
  };

  // 특정 트랙/레벨에 있는 플레이어들 찾기 (preview 반영)
  const getPlayersAtLevel = (trackCode: string, level: number): PlayerStateResponse[] => {
    const field = trackToPlayerField[trackCode];
    if (!field) return [];
    return effectivePlayerStates.filter((ps) => (ps[field] as number) === level);
  };

  return (
    <div className="bg-gray-800 p-2 rounded-lg h-full flex flex-col">
      <h3 className="text-sm font-bold mb-1">지식 트랙</h3>

      {/* 기술 타일 선택 배너 */}
      {hasPendingTechPick && (
        <div className={`mb-1 px-2 py-1 rounded text-[10px] font-semibold text-center text-white ${
          pickingTrackFor ? 'bg-green-700 animate-pulse' : 'bg-yellow-700'
        }`}>
          {pickingTrackFor
            ? `▼ ${pickingTrackFor.replace('BASIC_', '')} 선택됨 — 아래 트랙을 클릭하여 지식을 올릴 트랙을 지정하세요 ▼`
            : tentativeTechTileCode
              ? `선택됨: ${tentativeTechTileCode.replace('BASIC_', '')}${tentativeTechTrackCode ? ` (${tentativeTechTrackCode})` : ''} — 확정 시 적용`
              : '기술 타일을 선택하세요 (트랙 아래 또는 하단 공용타일)'}
          {(tentativeTechTileCode || pickingTrackFor) && (
            <button
              onClick={() => { setTentativeTechTile(null, null); setPickingTrackFor(null); }}
              className="ml-2 text-yellow-200 underline text-[9px]"
            >취소</button>
          )}
        </div>
      )}

      {/* 6개 트랙 가로 배치 */}
      <div className="flex-1 flex gap-1">
        {tracks.map((track) => {
          const field = trackToPlayerField[track.trackCode];
          const myLevel = field && myPlayerState ? (myPlayerState[field] as number) : -1;
          const canAdvance = !hasPendingTechPick && !pickingTrackFor && isMyTurn && isPlayingPhase && !hasPendingAction
            && myPlayerState != null && myPlayerState.knowledge >= 4;
          const isPickingTrack = !!pickingTrackFor;
          return (
            <TrackColumn
              key={track.trackCode}
              track={track}
              basicTile={getTileForTrack(track.trackCode)}
              advancedTile={getAdvTileForTrack(track.trackCode)}
              getPlayersAtLevel={(level) => getPlayersAtLevel(track.trackCode, level)}
              myLevel={myLevel}
              canAdvance={canAdvance}
              isPickingTrack={isPickingTrack}
              onTrackClick={() => handleTrackClick(track.trackCode)}
              onTileClick={handleTileClick}
              isTileClickable={hasPendingTechPick && !tentativeTechTileCode && !pickingTrackFor}
              getPlayerColorById={getPlayerColorById}
            />
          );
        })}
      </div>

      {/* 트랙 아래: COMMON 공용타일 (연구소/아카데미 업그레이드 시 선택 가능) */}
      {(() => {
        const commonTiles = basicTiles.filter((t) => t.trackCode === 'COMMON');
        if (commonTiles.length === 0) return null;
        return (
          <div className="mt-1 px-0">
            <div className="flex gap-1">
              {commonTiles.map((tile) => {
                const code = tile.tileCode;
                const imgSrc = TECH_TILE_IMAGE_MAP[code];
                const takenColor = getPlayerColorById(tile.takenByPlayerId);
                const isSelected = pickingTrackFor === tile.tileCode;
                const canClick = hasPendingTechPick && !tentativeTechTileCode && !pickingTrackFor && !tile.isTaken;
                return (
                  <div
                    key={tile.tileCode}
                    onClick={canClick ? () => handleTileClick(tile) : undefined}
                    className={`flex-1 bg-gray-700 border rounded px-1 py-1 text-center relative ${
                      tile.isTaken ? 'opacity-40' : ''
                    } ${
                      isSelected
                        ? 'border-green-400 ring-2 ring-green-400 bg-green-900/30'
                        : canClick
                          ? 'border-yellow-400 cursor-pointer hover:bg-gray-600 ring-1 ring-yellow-400'
                          : 'border-gray-600'
                    }`}
                    style={tile.isTaken && takenColor ? { outline: `2px solid ${takenColor}`, outlineOffset: '-2px' } : undefined}
                    title={tile.description}
                  >
                    {takenColor && (
                      <div
                        className="absolute right-0.5 top-0.5 w-2 h-2 rounded-full border border-white/80"
                        style={{ backgroundColor: takenColor }}
                      />
                    )}
                    {imgSrc ? (
                      <img src={imgSrc} alt={code} className="mx-auto h-10 w-auto object-contain" draggable={false} />
                    ) : (
                      <span className="text-[8px]">{code ?? ''}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* EXPANSION 확장타일 (함대 입장 시에만 획득 가능) */}
      {(() => {
        const expansionTiles = basicTiles.filter((t) => t.trackCode === 'EXPANSION');
        if (expansionTiles.length === 0) return null;
        return (
          <div className="mt-1 px-0">
            <div className="flex gap-1">
              {expansionTiles.map((tile) => {
                const code = tile.tileCode;
                const imgSrc = TECH_TILE_IMAGE_MAP[code];
                const takenColor = getPlayerColorById(tile.takenByPlayerId);
                return (
                  <div
                    key={tile.tileCode}
                    className={`flex-1 bg-gray-700 border rounded px-1 py-1 text-center relative ${
                      tile.isTaken ? 'opacity-40' : ''
                    } border-gray-600`}
                    style={tile.isTaken && takenColor ? { outline: `2px solid ${takenColor}`, outlineOffset: '-2px' } : undefined}
                    title={`[함대] ${tile.description}`}
                  >
                    {takenColor && (
                      <div
                        className="absolute right-0.5 top-0.5 w-2 h-2 rounded-full border border-white/80"
                        style={{ backgroundColor: takenColor }}
                      />
                    )}
                    {imgSrc ? (
                      <img src={imgSrc} alt={code} className="mx-auto h-10 w-auto object-contain opacity-70" draggable={false} />
                    ) : (
                      <span className="text-[8px]">{code ?? ''}</span>
                    )}
                    <div className="text-[7px] text-gray-400">함대</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// 개별 트랙 컬럼 (세로 레벨 0~5, 고급 타일은 4-5 사이)
function TrackColumn({
  track,
  basicTile,
  advancedTile,
  getPlayersAtLevel,
  myLevel = -1,
  canAdvance = false,
  isPickingTrack = false,
  onTrackClick,
  onTileClick,
  isTileClickable = false,
  getPlayerColorById,
}: {
  track: TechTrackInfo;
  basicTile?: TechTileInfo;
  advancedTile?: AdvancedTechTileInfo;
  getPlayersAtLevel: (level: number) => PlayerStateResponse[];
  myLevel?: number;
  canAdvance?: boolean;
  isPickingTrack?: boolean;
  onTrackClick?: () => void;
  onTileClick?: (tile: TechTileInfo) => void;
  isTileClickable?: boolean;
  getPlayerColorById?: (playerId: string | null | undefined) => string | null;
}) {
  const bgColor = trackBgColors[track.trackCode] || 'bg-gray-700';

  // 레벨 5, 고급타일, 4, 3, 2, 1, 0 순서로 렌더링
  const renderLevels = () => {
    const elements: ReactElement[] = [];

    // 레벨 5
    const level5 = track.levels.find((l) => l.level === 5);
    if (level5) {
      elements.push(renderLevelCell(level5, 5));
    }

// 고급 기술 타일 (4-5 사이) - 이미지로 렌더링
    if (advancedTile) {
      /**
       * advancedTile.tileCode 예:
       *   "ADV_TILE_1"
       * 이미지 파일명도 ADV_TILE_1.png 이므로
       * tileCode를 그대로 이미지 매핑 키로 사용한다.
       */
      const code = advancedTile.tileCode;

      /**
       * TECH_TILE_IMAGE_MAP에서 이미지 src 조회
       * - 없으면 undefined → fallback 텍스트 표시
       */
      const imgSrc = ADV_TECH_TILE_IMAGE_MAP[code];

      const advTakenColor = getPlayerColorById?.(advancedTile.takenByPlayerId) ?? null;
      elements.push(
          <div
              key="adv-tile"
              className="bg-yellow-700 px-0.5 py-1 text-center relative"
              style={advancedTile.isTaken && advTakenColor ? { outline: `2px solid ${advTakenColor}`, outlineOffset: '-2px' } : undefined}
              title={`[고급] ${advancedTile.description}`}
          >
            {/* 고급 타일: 가져간 플레이어 색 오른쪽에 표시 */}
            {advTakenColor && (
              <div
                className="absolute right-0.5 top-0.5 w-2 h-2 rounded-full border border-white/80"
                style={{ backgroundColor: advTakenColor }}
              />
            )}
            {imgSrc ? (
                <img
                    src={imgSrc}
                    alt={code}
                    className="mx-auto h-10 w-auto object-contain"
                    draggable={false}
                />
            ) : (
                <span className="text-[7px] text-yellow-200">
          {code.replace('ADV_', '')}
        </span>
            )}
          </div>
      );
    }

    // 레벨 4, 3, [2→3 파워 인디케이터], 2, 1, 0
    for (let i = 4; i >= 0; i--) {
      const level = track.levels.find((l) => l.level === i);
      if (level) {
        elements.push(renderLevelCell(level, i));
      }
      // 레벨 3 아래(2→3 경계)에 공통 보상 표시
      if (i === 3) {
        elements.push(
          <div
            key="power-reward-2to3"
            className="flex items-center justify-center gap-0.5 bg-purple-900/70 border-y border-purple-500/50 text-purple-200 text-[7px] font-bold py-0.5"
          >
            ⚡3
          </div>
        );
      }
    }

    return elements;
  };

  const renderLevelCell = (level: { level: number; description: string; hasFederationToken: boolean }, levelNum: number) => {
    const players = getPlayersAtLevel(levelNum);
    const isMyLevel = levelNum === myLevel;

    return (
      <div
        key={level.level}
        className={`${bgColor} flex items-center overflow-hidden px-0.5 gap-0.5
          ${isMyLevel ? 'ring-1 ring-inset ring-yellow-400' : ''}
        `}
        style={{ minHeight: '20px' }}
        title={level.description}
      >
        {/* 플레이어 마커 - 가로 왼쪽 정렬 */}
        {players.map((ps) => {
          const planetType = getPlanetTypeFromFaction(ps.factionCode);
          return (
            <div
              key={ps.seatNo}
              className="w-2 h-2 rounded-full border border-white/80 flex-shrink-0"
              style={{ backgroundColor: PLANET_COLORS[planetType] || '#fff' }}
              title={`${ps.seatNo}번 좌석`}
            />
          );
        })}

        {/* 연방 토큰 */}
        {level.hasFederationToken && (
          <div className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0 ml-auto" title="연방 토큰" />
        )}
      </div>
    );
  };

  const isColumnClickable = (canAdvance && myLevel < 5) || isPickingTrack;

  return (
    <div
      className={`flex-1 flex flex-col gap-1${isColumnClickable ? ' cursor-pointer' : ''}${isPickingTrack ? ' ring-1 ring-yellow-400 rounded' : ''}`}
      onClick={isColumnClickable ? onTrackClick : undefined}
      title={isPickingTrack ? '이 트랙에 적용' : isColumnClickable ? '지식 4 소모 → 전진' : undefined}
    >
      {/* 트랙 이름 */}
      <div className={`${bgColor} rounded-t px-1 py-0.5 text-center`}>
        <span className="text-[8px] font-bold">{track.trackNameKo}</span>
      </div>

      {/* 레벨들 (5 → 고급타일 → 4 → 3 → 2 → 1 → 0) */}
      {renderLevels()}

      {/* 기본 기술 타일 (텍스트 -> 이미지로 대체) */}
      {basicTile && (() => {
        const code = basicTile.tileCode;
        const imgSrc = TECH_TILE_IMAGE_MAP[code];
        const takenColor = getPlayerColorById?.(basicTile.takenByPlayerId) ?? null;
        const canClick = isTileClickable && !basicTile.isTaken;

        return (
            <div
                onClick={canClick ? (e) => { e.stopPropagation(); onTileClick?.(basicTile); } : undefined}
                className={`${bgColor} rounded-b px-0.5 py-1 text-center relative ${
                    canClick ? 'cursor-pointer ring-2 ring-yellow-400 hover:brightness-125' : ''
                }`}
                style={basicTile.isTaken && takenColor ? { outline: `2px solid ${takenColor}`, outlineOffset: '-2px' } : undefined}
                title={canClick ? '클릭하여 선택' : basicTile.description}
            >
              {takenColor && (
                <div
                  className="absolute left-0.5 top-0.5 w-2 h-2 rounded-full border border-white/80"
                  style={{ backgroundColor: takenColor }}
                />
              )}
              {imgSrc ? (
                  <img src={imgSrc} alt={code} className="mx-auto h-10 w-auto object-contain" draggable={false} />
              ) : (
                  <span className="text-[7px]">{code}</span>
              )}
            </div>
        );
      })()}
    </div>
  );
}

// 종족 코드 → 행성 타입 매핑
function getPlanetTypeFromFaction(factionCode: string | null): string {
  if (!factionCode) return 'TERRA';

  const factionToPlanet: Record<string, string> = {
    TERRANS: 'TERRA', LANTIDS: 'TERRA',
    HADSCH_HALLAS: 'DESERT', IVITS: 'DESERT',
    TAKLONS: 'SWAMP', AMBAS: 'SWAMP',
    GEODENS: 'VOLCANIC', BAL_TAKS: 'VOLCANIC',
    GLEENS: 'OXIDE', XENOS: 'OXIDE',
    FIRAKS: 'TITANIUM', BESCODS: 'TITANIUM',
    ITARS: 'ICE', NEVLAS: 'ICE',
    MOWEIDS: 'LOST_PLANET', SPACE_GIANTS: 'LOST_PLANET',
    TINKEROIDS: 'ASTEROIDS', DAKANIANS: 'ASTEROIDS',
  };

  return factionToPlanet[factionCode] || 'TERRA';
}
