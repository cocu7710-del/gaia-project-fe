import { useEffect, useState, type ReactElement, useCallback } from 'react';
import { roomApi } from '../api/client';
import type { TechTrackResponse, TechTrackInfo, TechTileInfo, AdvancedTechTileInfo, PlayerStateResponse } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage.ts';
import { ADV_TECH_TILE_IMAGE_MAP } from '../constants/advTechTileImage.ts';
import { PLANET_COLORS } from '../constants/colors';
import type { AdvanceTechAction } from '../types/turnActions';
import type { FederationTileInfo } from '../api/client';
import { hasFleetTechPending as checkFleetTechPending, hasPendingTechPick as checkPendingTechPick } from '../actions/pendingAnalyzer';
import { FEDERATION_TOKEN_IMAGE_MAP } from '../constants/federationTokenImage';

import oreImg from '../assets/resource/Ore.png';
import creditImg from '../assets/resource/Credit.png';
import knowledgeImg from '../assets/resource/Knowledge.png';
import qicImg from '../assets/resource/QIC.png';
import powerImg from '../assets/resource/Power.png';
import terraformImg from '../assets/resource/Terraforming.png';
import distanceImg from '../assets/resource/Distance.png';
import pomerImg from '../assets/resource/Pomer.png';
import lostPlanetImg from '../assets/planet/LOST_PLANET.png';
import trackBoardImg from '../assets/TrackBoard.png';
import typeAImg from '../assets/Type_A.png';
import typeBImg from '../assets/Type_B.png';

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
  TERRA_FORMING: 'bg-transparent',
  NAVIGATION: 'bg-transparent',
  AI: 'bg-transparent',
  GAIA_FORMING: 'bg-transparent',
  ECONOMY: 'bg-transparent',
  SCIENCE: 'bg-transparent',
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
  const [terraFedTile, setTerraFedTile] = useState<FederationTileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { turnState, addPendingAction, updatePreviewState, tentativeTechTileCode, tentativeTechTrackCode, setTentativeTechTile, setTechTileData, economyTrackOption, fleetShipMode, federationGroups } = useGameStore();
  const itarsGaiaChoice = useGameStore(s => s.itarsGaiaChoice);
  const [pickingTrackFor, setPickingTrackFor] = useState<string | null>(null);

  // 함대 기술타일 선택 시 (tentativeTechTileCode 있고 trackCode null) → 트랙 클릭 대기
  // 인공물 코드(ARTIFACT_*)는 트랙 선택 불필요 — 제외
  // BASIC_EXP_TILE_3: 광산 배치 전에는 트랙 선택 모드 진입 금지
  const TERRAFORM_2_MINE_TILES = ['BASIC_EXP_TILE_3'];
  useEffect(() => {
    // tileCode가 해제되면 pickingTrackFor도 초기화
    if (!tentativeTechTileCode) {
      if (pickingTrackFor) setPickingTrackFor(null);
      return;
    }
    if (tentativeTechTrackCode !== null || pickingTrackFor) return;
    if (tentativeTechTileCode.startsWith('ARTIFACT_')) return;
    if (TERRAFORM_2_MINE_TILES.includes(tentativeTechTileCode)) {
      // 광산이 pending에 있을 때만 트랙 선택 모드로 진입
      const hasMine = turnState.pendingActions.some(a => a.type === 'PLACE_MINE');
      if (!hasMine) return;
    }
    setPickingTrackFor(tentativeTechTileCode);
  }, [tentativeTechTileCode, tentativeTechTrackCode, turnState.pendingActions]);

  const hasFleetTechPending = checkFleetTechPending(turnState.pendingActions);
  const hasPendingTechPickBase = isMyTurn && (!fleetShipMode || hasFleetTechPending)
    && checkPendingTechPick(turnState.pendingActions);

  const myPlayerId = useGameStore(s => s.playerId);

  // 아이타 PI 기술타일 선택 모드
  const isItarsTilePicking = itarsGaiaChoice?.tilePicking === true && itarsGaiaChoice.itarsPlayerId === myPlayerId;

  const handleTileClick = useCallback((tile: TechTileInfo) => {
    // 아이타 기술타일 선택 모드: 임시 선택 (확정은 ItarsGaiaChoiceDialog에서)
    if (isItarsTilePicking) {
      if (tile.tileCode.startsWith('ADV_')) return; // 기본 타일만
      const isMineOwned = tile.takenByPlayerId === myPlayerId || ((tile as any).ownerPlayerIds ?? []).includes(myPlayerId);
      if (isMineOwned) return;
      if (tile.trackCode === 'COMMON' || tile.trackCode === 'EXPANSION') {
        setPickingTrackFor(tile.tileCode);
      } else {
        setTentativeTechTile(tile.tileCode, tile.trackCode);
      }
      return;
    }
    // 기본 타일: 본인 보유만 차단, 고급 타일: 누구든 가져가면 차단
    const isAdv = tile.tileCode.startsWith('ADV_');
    const isMineOwned = tile.takenByPlayerId === myPlayerId || ((tile as any).ownerPlayerIds ?? []).includes(myPlayerId);
    if (!hasPendingTechPickBase || (isAdv && tile.isTaken) || isMineOwned || tentativeTechTileCode) return;
    if (['BASIC_EXP_TILE_3'].includes(tile.tileCode)) {
      // 2삽 1광산 타일: 타일만 선택 → 광산 배치 → 이후 트랙 선택
      setTentativeTechTile(tile.tileCode, null);
    } else if (tile.trackCode === 'COMMON' || tile.trackCode === 'EXPANSION') {
      setPickingTrackFor(tile.tileCode);
    } else {
      setTentativeTechTile(tile.tileCode, tile.trackCode);
    }
  }, [hasPendingTechPickBase, tentativeTechTileCode, setTentativeTechTile, isItarsTilePicking, myPlayerId]);


  useEffect(() => {
    const loadTechData = async () => {
      try {
        setLoading(true);
        const [techRes, fedRes] = await Promise.all([
          roomApi.getTechTracks(roomId),
          roomApi.getFederationTiles(roomId),
        ]);
        setTechData(techRes.data);
        setTechTileData(techRes.data);
        setTerraFedTile(fedRes.data.terraformingTrackTile ?? null);
        useGameStore.setState({ terraFedTileCode: fedRes.data.terraformingTrackTile?.tileCode ?? null });
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

  const hasPendingTechPick = hasPendingTechPickBase || isItarsTilePicking;

  const myPlayerState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);

  // preview 상태 반영: 내 플레이어는 previewPlayerState로 교체
  const effectivePlayerStates = myPlayerState && mySeatNo != null
    ? playerStates.map(ps => ps.seatNo === mySeatNo ? myPlayerState as PlayerStateResponse : ps)
    : playerStates;

  // 파이락 다운그레이드: 연구소 선택 후 트랙 선택 대기 여부
  const firaksPendingTrack = turnState.pendingActions.find(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'FIRAKS_DOWNGRADE'
      && (a.payload as any).hexQ != null && !(a.payload as any).trackCode
  );

  // 매드안드로이드: 최저 트랙 선택 대기
  const bescodsPending = turnState.pendingActions.find(
    a => a.type === 'FACTION_ABILITY' && (a.payload as any).abilityCode === 'BESCODS_ADVANCE_LOWEST_TRACK'
      && !(a.payload as any).trackCode
  );
  const bescodsLowestLevel = myPlayerState ? Math.min(
    myPlayerState.techTerraforming ?? 0, myPlayerState.techNavigation ?? 0,
    myPlayerState.techAi ?? 0, myPlayerState.techGaia ?? 0,
    myPlayerState.techEconomy ?? 0, myPlayerState.techScience ?? 0,
  ) : -1;

  const handleTrackClick = (trackCode: string) => {
    // 아이타 기술타일 선택: 공용 타일 → 트랙 지정 (임시 선택)
    if (isItarsTilePicking && pickingTrackFor) {
      setTentativeTechTile(pickingTrackFor, trackCode);
      setPickingTrackFor(null);
      return;
    }
    // 매드안드로이드: 최저 트랙만 선택 가능
    if (bescodsPending) {
      const field = trackToPlayerField[trackCode];
      if (!field || !myPlayerState) return;
      const level = (myPlayerState[field] as number) ?? 0;
      if (level !== bescodsLowestLevel || level >= 5) return;
      useGameStore.getState().updateLastPendingActionPayload({ trackCode });
      setTentativeTechTile('__BESCODS__', trackCode);
      return;
    }
    // 파이락 다운그레이드: 트랙 선택
    if (firaksPendingTrack) {
      (firaksPendingTrack.payload as any).trackCode = trackCode;
      // 프리뷰 강제 갱신을 위해 store 트리거
      setTentativeTechTile('__FIRAKS__', trackCode);
      return;
    }
    // 공용/함대 타일 선택 후 트랙 지정 모드
    if (pickingTrackFor) {
      setTentativeTechTile(pickingTrackFor, trackCode);
      setPickingTrackFor(null);
      // 거리 트랙 4→5 도달 시 검은행성 배치 pending 자동 추가
      if (trackCode === 'NAVIGATION' && myPlayerState) {
        const navLevel = myPlayerState.techNavigation ?? 0;
        if (navLevel === 4) {
          addPendingAction({
            id: `lp-${Date.now()}`,
            type: 'PLACE_LOST_PLANET',
            timestamp: Date.now(),
            payload: {},
          });
        }
      }
      return;
    }
    // ECLIPSE_TECH: 트랙 선택 (trackCode 미설정 상태)
    const eclipseTechPending = turnState.pendingActions.find(
      a => a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'ECLIPSE_TECH' && !(a.payload as any).trackCode
    );
    if (eclipseTechPending) {
      (eclipseTechPending.payload as any).trackCode = trackCode;
      setTentativeTechTile('__ECLIPSE_TECH__', trackCode);
      // 거리 트랙 4→5 도달 시 검은행성 배치 pending 자동 추가
      if (trackCode === 'NAVIGATION' && myPlayerState && (myPlayerState.techNavigation ?? 0) === 4) {
        addPendingAction({
          id: `lp-${Date.now()}`,
          type: 'PLACE_LOST_PLANET',
          timestamp: Date.now(),
          payload: {},
        });
      }
      return;
    }
    if (!isMyTurn || !isPlayingPhase || hasPendingAction) return;
    if (!myPlayerState || myPlayerState.knowledge < 4) return;

    const field = trackToPlayerField[trackCode];
    if (!field || (myPlayerState[field] as number) >= 5) return;

    // 4→5 진입: 사용 가능한 연방 토큰 필요
    if ((myPlayerState[field] as number) === 4) {
      const hasUsableFed = federationGroups.some(g => g.playerId === myPlayerId && !g.used);
      if (!hasUsableFed) return;
    }

    const action: AdvanceTechAction = {
      id: `action-${Date.now()}`,
      type: 'ADVANCE_TECH',
      timestamp: Date.now(),
      payload: { trackCode, cost: { knowledge: 4 } },
    };
    addPendingAction(action);

    // 거리 트랙 4→5 도달 시 검은행성 배치 pending 자동 추가
    const currentLevel = (myPlayerState[field] as number) ?? 0;
    if (trackCode === 'NAVIGATION' && currentLevel === 4) {
      addPendingAction({
        id: `lp-${Date.now()}`,
        type: 'PLACE_LOST_PLANET',
        timestamp: Date.now(),
        payload: {},
      });
    }
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
    <div className="flex flex-col">
      {/* 기술 타일 선택 배너 제거됨 — 맵 배너에서 안내 */}

      {/* ===== 트랙 보드: 이미지 고정 + 투명 오버레이 ===== */}
      <div className="relative">
        {/* 1) 이미지 고정 (비율 유지) */}
        <img src={trackBoardImg} alt="TrackBoard" className="w-full h-auto block rounded-lg" draggable={false} />

        {/* 2) 투명 클릭 오버레이 — absolute로 이미지 위에 겹침 */}
        <div className="absolute inset-0">
          {tracks.map((track, colIdx) => {
            const field = trackToPlayerField[track.trackCode];
            const myLevel = field && myPlayerState ? (myPlayerState[field] as number) : -1;
            const canAdvance = !hasPendingTechPick && !pickingTrackFor && isMyTurn && isPlayingPhase && !hasPendingAction
              && myPlayerState != null && myPlayerState.knowledge >= 4;
            const eclipseTechPending = turnState.pendingActions.find(
              a => a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'ECLIPSE_TECH' && !(a.payload as any).trackCode
            );
            const isPickingTrack = !!pickingTrackFor || !!firaksPendingTrack || !!bescodsPending || !!eclipseTechPending;
            const isColumnClickable = (canAdvance && myLevel < 5) || isPickingTrack;

            // 트랙 X 좌표 (%) — 경제/과학은 1% 왼쪽으로
            const colLeftOffset = (colIdx >= 4) ? -1 : 0;
            const colLeft = colIdx * 16.67 + colLeftOffset;
            const colWidth = 16;
            // 고급 타일 개별 X 오프셋 (px)
            const advLeftOffsetPx = colIdx === 0 ? 5 : colIdx === 1 ? 3 : 0;

            // 레벨 Y 좌표 (%) — 이미지 분석 기반
            const LEVEL_Y: Record<number, { top: number; height: number }> = {
              5: { top: 2, height: 6.8 },
              // 고급 타일: 별도 처리
              4: { top: 21, height: 6.6 },
              3: { top: 28, height: 7.8 },
              // 3파워 구역: 이미지에 포함
              2: { top: 41, height: 7.6 },
              1: { top: 49, height: 8.2 },
              0: { top: 57, height: 9.6 },
            };
            const ADV_TILE_Y = { top: 10.8, height: 10 };
            const BASIC_TILE_Y = { top: 80, height: 20 };

            return (
              <div key={track.trackCode}>
                {/* 트랙 컬럼 클릭 영역 (전체) */}
                {isColumnClickable && (
                  <div
                    className="absolute cursor-pointer"
                    style={{ left: `${colLeft}%`, top: '0%', width: `${colWidth}%`, height: '80%', zIndex: 1 }}
                    onClick={() => handleTrackClick(track.trackCode)}
                    title={isPickingTrack ? '이 트랙에 적용' : '지식 4 소모 → 전진'}
                  />
                )}

                {/* 레벨 셀 (플레이어 마커 표시) */}
                {[5, 4, 3, 2, 1, 0].map(levelNum => {
                  const pos = LEVEL_Y[levelNum];
                  if (!pos) return null;
                  const players = getPlayersAtLevel(track.trackCode, levelNum);
                  const isMyLevel = levelNum === myLevel;

                  return (
                    <div
                      key={`${track.trackCode}-${levelNum}`}
                      className={`absolute flex items-end justify-start`}
                      style={{ left: `${colLeft + 1.5}%`, top: `${pos.top - 1}%`, width: `${colWidth}%`, height: `${pos.height}%`, zIndex: 2, pointerEvents: 'none' }}
                    >
                      {/* 테라포밍 5단계 연방 토큰 (5단계 진입 프리뷰 중이면 숨김) */}
                      {(() => {
                        if (levelNum !== 5 || track.trackCode !== 'TERRA_FORMING' || !terraFedTile) return null;
                        const origState = playerStates.find(p => p.seatNo === mySeatNo);
                        const origLevel = (origState as any)?.techTerraforming ?? 0;
                        const entering5 = (tentativeTechTrackCode === 'TERRA_FORMING' && origLevel === 4)
                          || (turnState.pendingActions.some(a => a.type === 'ADVANCE_TECH' && a.payload.trackCode === 'TERRA_FORMING') && origLevel === 4);
                        if (entering5) return null;
                        return true;
                      })() && (
                        <div className="w-full flex justify-center">
                          {FEDERATION_TOKEN_IMAGE_MAP[terraFedTile.tileCode] ? (
                            <img src={FEDERATION_TOKEN_IMAGE_MAP[terraFedTile.tileCode]} alt={terraFedTile.tileCode}
                              style={{ height: '2vw', width: 'auto' }} className="object-contain" draggable={false} />
                          ) : null}
                        </div>
                      )}
                      {/* 플레이어 마커 */}
                      {players.length > 0 && (
                        <div className="flex gap-px">
                          {players.map(ps => {
                            const planetType = getPlanetTypeFromFaction(ps.factionCode);
                            return (
                              <div key={ps.seatNo} className="rounded-full border border-white/80"
                                style={{ backgroundColor: PLANET_COLORS[planetType] || '#fff', width: '0.6vw', height: '0.6vw', minWidth: 6, minHeight: 6 }}
                                title={`${ps.seatNo}번 좌석`} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 고급 타일 오버레이 (클릭 가능) */}
                {(() => {
                  const advTile = getAdvTileForTrack(track.trackCode);
                  if (!advTile || advTile.isTaken) return null;
                  const imgSrc = ADV_TECH_TILE_IMAGE_MAP[advTile.tileCode];
                  // 고급 타일 클릭 가능 여부: 기술타일 선택 모드 + 미선택 + 미획득 + 해당트랙4이상 + 연방토큰 보유 + 덮을 기본타일 보유
                  const hasUsableFedToken = federationGroups.some(g => g.playerId === myPlayerId && !g.used);
                  const hasUncoveredBasicTile = techData ? techData.basicTiles.some(t => (t.ownerPlayerIds ?? []).includes(myPlayerId ?? '')) : false;
                  const advCanClick = hasPendingTechPick && !tentativeTechTileCode && !advTile.isTaken && myLevel >= 4 && hasUsableFedToken && hasUncoveredBasicTile;
                  return (
                    <div
                      className={`absolute flex items-end justify-end ${advCanClick ? 'cursor-pointer ring-2 ring-yellow-400 rounded' : ''}`}
                      style={{ left: `calc(${colLeft}% + ${advLeftOffsetPx}px)`, top: `${ADV_TILE_Y.top}%`, width: `${colWidth}%`, height: `${ADV_TILE_Y.height}%`, zIndex: advCanClick ? 10 : 3, padding: '1px', pointerEvents: advCanClick ? 'auto' : 'none' }}
                      title={advCanClick ? '클릭하여 고급 타일 선택' : `[고급] ${advTile.description}`}
                      onClick={advCanClick ? () => {
                        // 고급 타일은 트랙을 null로 → 플레이어가 원하는 트랙 선택
                        setTentativeTechTile(advTile.tileCode, null);
                        setPickingTrackFor(advTile.tileCode);
                      } : undefined}
                    >
                      {imgSrc && (
                        <img src={imgSrc} alt={advTile.tileCode} style={{ maxHeight: '120%', maxWidth: '120%' }} className="object-contain" draggable={false} />
                      )}
                    </div>
                  );
                })()}

              </div>
            );
          })}

        </div>

        {/* 기본 타일 + 공용 타일 (이미지 위, absolute) */}
        <TechTileOverlay
        tracks={tracks}
        basicTiles={basicTiles}
        getTileForTrack={getTileForTrack}
        hasPendingTechPick={hasPendingTechPick}
        tentativeTechTileCode={tentativeTechTileCode}
        pickingTrackFor={pickingTrackFor}
        myPlayerId={myPlayerId}
        onTileClick={handleTileClick}
      />

          {/* 경제 트랙 3,4번 칸 옵션 오버레이 */}
          {economyTrackOption && (
            <img
              src={economyTrackOption === 'OPTION_A' ? typeAImg : typeBImg}
              alt={economyTrackOption}
              className="absolute pointer-events-none"
              style={{ left: '73.68%', top: '20.4%', width: '8%', height: '14.4%', objectFit: 'fill', zIndex: 4 }}
              draggable={false}
            />
          )}
      </div>
    </div>
  );
}


// 종족 코드 → 행성 타입 매핑
function getPlanetTypeFromFaction(factionCode: string | null): string {
  if (!factionCode) return 'TERRA';

  const factionToPlanet: Record<string, string> = {
    TERRANS: 'TERRA', LANTIDS: 'TERRA',
    HADSCH_HALLAS: 'VOLCANIC', IVITS: 'VOLCANIC',
    TAKLONS: 'SWAMP', AMBAS: 'SWAMP',
    GEODENS: 'OXIDE', BAL_TAKS: 'OXIDE',
    GLEENS: 'DESERT', XENOS: 'DESERT',
    FIRAKS: 'TITANIUM', BESCODS: 'TITANIUM',
    ITARS: 'ICE', NEVLAS: 'ICE',
    MOWEIDS: 'LOST_PLANET', SPACE_GIANTS: 'LOST_PLANET',
    TINKEROIDS: 'ASTEROIDS', DAKANIANS: 'ASTEROIDS',
  };

  return factionToPlanet[factionCode] || 'TERRA';
}

// ============================================================
// 기본 타일 + 공용 타일 오버레이 컴포넌트
// ============================================================

const TRACK_ORDER = ['TERRA_FORMING', 'NAVIGATION', 'AI', 'GAIA_FORMING', 'ECONOMY', 'SCIENCE'];

function TechTileOverlay({
  tracks,
  basicTiles,
  getTileForTrack,
  hasPendingTechPick,
  tentativeTechTileCode,
  pickingTrackFor,
  myPlayerId,
  onTileClick,
}: {
  tracks: TechTrackInfo[];
  basicTiles: TechTileInfo[];
  getTileForTrack: (trackCode: string) => TechTileInfo | undefined;
  hasPendingTechPick: boolean;
  tentativeTechTileCode: string | null;
  pickingTrackFor: string | null;
  myPlayerId: string | null;
  onTileClick: (tile: TechTileInfo) => void;
}) {
  // 트랙별 기본 타일 (6개) — 이미지 하단 80~100% 영역, 각 트랙 X 좌표
  const trackTiles = tracks.map((track, colIdx) => {
    const tile = getTileForTrack(track.trackCode);
    if (!tile) return null;
    const colLeft = colIdx * 16.67 + ((colIdx >= 4) ? -1 : 0);
    return { tile, left: colLeft, colIdx };
  }).filter(Boolean) as { tile: TechTileInfo; left: number; colIdx: number }[];

  // 공용 타일 (COMMON만, EXPANSION은 함대 영역에서 표시)
  const commonTiles = basicTiles.filter(t => t.trackCode === 'COMMON');

  const renderTile = (tile: TechTileInfo, style: React.CSSProperties) => {
    const imgSrc = TECH_TILE_IMAGE_MAP[tile.tileCode];
    const isMineOwned = tile.takenByPlayerId === myPlayerId || ((tile as any).ownerPlayerIds ?? []).includes(myPlayerId);
    const canClick = hasPendingTechPick && !tentativeTechTileCode && !pickingTrackFor && !isMineOwned;

    return (
      <div
        key={tile.tileCode}
        className={`absolute flex items-center justify-center ${canClick ? 'cursor-pointer ring-2 ring-green-400 rounded' : ''}`}
        style={{ ...style, zIndex: 4, pointerEvents: canClick ? 'auto' : 'none' }}
        onClick={canClick ? () => onTileClick(tile) : undefined}
        title={canClick ? '클릭하여 선택' : tile.description}
      >
        {imgSrc && (
          <img src={imgSrc} alt={tile.tileCode} className="max-h-[90%] max-w-[90%] object-contain" draggable={false} />
        )}
      </div>
    );
  };

  return (
    <div className="absolute flex flex-col" style={{ left: 0, right: 0, top: '69.5%', bottom: 0, zIndex: 5 }}>
      {/* 위: 트랙별 기본 타일 6개 */}
      <div className="flex gap-0.5" style={{ padding: '0 2px' }}>
        {trackTiles.map(({ tile }) => {
          const imgSrc = TECH_TILE_IMAGE_MAP[tile.tileCode];
          const isMineOwned = tile.takenByPlayerId === myPlayerId || ((tile as any).ownerPlayerIds ?? []).includes(myPlayerId);
          const canClick = hasPendingTechPick && !tentativeTechTileCode && !pickingTrackFor && !isMineOwned;
          return (
            <div key={tile.tileCode}
              className={`flex items-center justify-center ${canClick ? 'cursor-pointer ring-2 ring-green-400 rounded' : ''}`}
              style={{ width: '16%', pointerEvents: canClick ? 'auto' : 'none' }}
              onClick={canClick ? () => onTileClick(tile) : undefined}
              title={canClick ? '클릭하여 선택' : tile.description}
            >
              {imgSrc && <img src={imgSrc} alt={tile.tileCode} className="object-contain w-full h-full" draggable={false} />}
            </div>
          );
        })}
      </div>
      {/* 아래: 공용 타일 3개 (그룹으로 묶어서 위치 조정) */}
      {commonTiles.length > 0 && (
        <div className="flex justify-center" style={{ marginTop: '2.5%', paddingRight: '1%', gap: '16.5%' }}>
          {commonTiles.map((tile, idx) => {
            const imgSrc = TECH_TILE_IMAGE_MAP[tile.tileCode];
            const isMineOwned = tile.takenByPlayerId === myPlayerId || ((tile as any).ownerPlayerIds ?? []).includes(myPlayerId);
            const canClick = hasPendingTechPick && !tentativeTechTileCode && !pickingTrackFor && !isMineOwned;
            return (
              <div key={tile.tileCode}
                className={`flex items-center justify-center ${canClick ? 'cursor-pointer ring-2 ring-green-400 rounded' : ''}`}
                style={{ width: '16%', pointerEvents: canClick ? 'auto' : 'none', ...(idx === 0 ? { marginLeft: '-3%' } : {}) }}
                onClick={canClick ? () => onTileClick(tile) : undefined}
                title={canClick ? '클릭하여 선택' : tile.description}
              >
                {imgSrc && <img src={imgSrc} alt={tile.tileCode} className="object-contain w-full" draggable={false} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
