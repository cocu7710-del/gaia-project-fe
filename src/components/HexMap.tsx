import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { mapApi } from '../api/client';
import type { GameHex, PlayerStateResponse, SeatView } from '../api/client';
import { ResourceCalculator } from '../utils/resourceCalculator';
import { BUILDING_COSTS } from '../constants/gameCosts';
import type { PlaceMineAction, UpgradeBuildingAction, FleetProbeAction, DeployGaiaformerAction, FleetShipAction, BoosterAction } from '../types/turnActions';
import { UPGRADE_OPTIONS } from '../constants/gameCosts';

import { PLANET_COLORS, VIVID_BORDER_COLORS } from '../constants/colors';
import { HOME_PLANET_TYPES, getTerraformDiscount, getNavBonus } from '../utils/terraformingCalculator';
import { getNavigationCost, navLevelToRange } from '../utils/navigationCalculator';
import { calcMineCost } from '../utils/mineActionCalculator';
import { calcUpgradeCost, calcLeechInfo } from '../utils/upgradeCalculator';
import pomerImg from '../assets/resource/Pomer.png';
import FreePowerImage from './FreePowerImage';
import mineBuildingPng from '../assets/building/Mine.png';
import tradingStationBuildingPng from '../assets/building/TradingStation.png';
import researchLabBuildingPng from '../assets/building/Research.png';
import academyBuildingPng from '../assets/building/Academy.png';
import planetaryInstituteBuildingPng from '../assets/building/PlanetaryInstitute.png';
import terraPng from '../assets/planet/TERRA.png';
import desertPng from '../assets/planet/DESERT.png';
import swampPng from '../assets/planet/SWAMP.png';
import volcanicPng from '../assets/planet/VOLCANIC.png';
import oxidePng from '../assets/planet/OXIDE.png';
import titaniumPng from '../assets/planet/TITANIUM.png';
import icePng from '../assets/planet/ICE.png';
import gaiaPng from '../assets/planet/GAIA.png';
import transdimPng from '../assets/planet/TRANSDIM.png';
import asteroidsPng from '../assets/planet/ASTEROIDS.png';
import lostPlanetPng from '../assets/planet/LOST_PLANET.png';

import tfMarsPng from '../assets/forgotten_fleet/FORGOTTEN_FLEET_TF_MARS.png';
import eclipsePng from '../assets/forgotten_fleet/FORGOTTEN_FLEET_ECLIPSE.png';
import rebellionPng from '../assets/forgotten_fleet/FORGOTTEN_FLEET_REBELLION.png';
import twilightPng from '../assets/forgotten_fleet/FORGOTTEN_FLEET_TWILIGHT.png';

const HEX_SIZE = 41;

/** sectorId → 우주선 이미지 매핑 */
const FLEET_IMAGES: Record<string, string> = {
  FORGOTTEN_FLEET_TF_MARS: tfMarsPng,
  FORGOTTEN_FLEET_ECLIPSE: eclipsePng,
  FORGOTTEN_FLEET_REBELLION: rebellionPng,
  FORGOTTEN_FLEET_TWILIGHT: twilightPng,
};

/** planetType → 이미지 매핑 */
const PLANET_IMAGES: Record<string, string> = {
  TERRA: terraPng,
  DESERT: desertPng,
  SWAMP: swampPng,
  VOLCANIC: volcanicPng,
  OXIDE: oxidePng,
  TITANIUM: titaniumPng,
  ICE: icePng,
  GAIA: gaiaPng,
  TRANSDIM: transdimPng,
  ASTEROIDS: asteroidsPng,
  LOST_PLANET: lostPlanetPng,
};

/** planetType → 이미지 크기 비율 (기본 0.9) */
const PLANET_IMAGE_SCALE: Record<string, number> = {
  VOLCANIC: 0.7,
};


/** 섹터별 반투명 채움 색상 (positionNo 1~10) */
const SECTOR_FILL_COLORS: Record<number, string> = {
  1: 'rgba(139, 69, 69, 0.6)',
  2: 'rgba(139, 90, 43, 0.6)',
  3: 'rgba(34, 85, 51, 0.6)',
  4: 'rgba(0, 77, 77, 0.6)',
  5: 'rgba(25, 51, 102, 0.6)',
  6: 'rgba(102, 51, 102, 0.6)',
  7: 'rgba(51, 51, 102, 0.6)',
  8: 'rgba(77, 38, 77, 0.6)',
  9: 'rgba(51, 77, 51, 0.6)',
  10: 'rgba(102, 77, 51, 0.6)',
};

type TileType = 'sector' | 'deep' | 'single';

interface Props {
  roomId: string;
  playerStates?: PlayerStateResponse[];
  seats?: SeatView[];
}

/** flat-top axial → pixel */
function axialToPixel(q: number, r: number) {
  const x = HEX_SIZE * (3 / 2) * q;
  const y = HEX_SIZE * Math.sqrt(3) * (r + q / 2);
  return { x, y };
}

/** 헥스 폴리곤 (flat-top) */
function hexPoints(cx: number, cy: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    const x = cx + HEX_SIZE * Math.cos(a);
    const y = cy + HEX_SIZE * Math.sin(a);
    pts.push(`${x},${y}`);
  }
  return pts.join(' ');
}

/** positionNo로 타일 타입 구분 */
function getTileType(positionNo: number): TileType {
  if (positionNo >= 1 && positionNo <= 10) return 'sector';
  if (positionNo >= 11 && positionNo <= 18) return 'deep';
  return 'single';
}

function getHexStroke(tileType: TileType): string {
  return tileType === 'sector' ? '#555555' : '#ffffff';
}

function getSectorFillColor(tileType: TileType, positionNo: number): string | null {
  if (tileType !== 'sector') return null;
  return SECTOR_FILL_COLORS[positionNo] || null;
}

/** sector_id에서 뒤 숫자만 뽑기: "SECTOR_8" -> "8" */
function parseSectorNumberText(sectorId?: string | null): string | null {
  if (!sectorId) return null;
  const m = sectorId.match(/(\d+)$/);
  return m ? m[1] : null;
}

/** GameHex에서 sectorId 필드명 차이(sectorId vs sector_id)를 안전하게 흡수 */
function getSectorIdFromHex(hex: GameHex): string | null {
  const anyHex = hex as any;
  return (anyHex.sectorId ?? anyHex.sector_id ?? null) as string | null;
}

/** ====== 커스텀 훅: 맵 데이터 로딩 ====== */
function useHexes(roomId: string) {
  const [hexes, setHexes] = useState<GameHex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await mapApi.getHexes(roomId);
        if (!mounted) return;
        setHexes(res.data);
        setError(null);
      } catch (err: any) {
        if (!mounted) return;
        setError(err.response?.data?.message ?? '맵 데이터 로드 실패');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [roomId]);

  return { hexes, loading, error };
}

function VpPanel({
                   playerStates,
                   seatBySeatNo,
                 }: {
  playerStates: PlayerStateResponse[];
  seatBySeatNo: Map<number, any>;
}) {
  if (playerStates.length === 0) return null;

  return (
      <div className="absolute top-2 left-2 bg-gray-800/90 p-2 rounded text-[10px] z-10">
        <div className="font-bold text-orange-400 mb-1">VP</div>
        {playerStates.map((ps) => {
          const seat = seatBySeatNo.get(ps.seatNo);
          return (
              <div key={ps.seatNo} className="flex justify-between gap-2">
            <span style={{ color: PLANET_COLORS[seat?.homePlanetType || 'TERRA'] }}>
              {seat?.raceNameKo || `P${ps.seatNo}`}:
            </span>
                <span className="font-bold">{ps.victoryPoints}</span>
              </div>
          );
        })}
      </div>
  );
}

function RemovedPomerPanel({
  playerStates,
  seatBySeatNo,
}: {
  playerStates: PlayerStateResponse[];
  seatBySeatNo: Map<number, any>;
}) {
  const players = playerStates.filter(ps => ps.permanentlyRemovedGaiaformers > 0);
  if (players.length === 0) return null;

  return (
    <div className="absolute bottom-10 left-2 bg-gray-800/90 p-2 rounded text-[10px] z-10">
      <div className="flex items-center gap-1 font-bold text-purple-300 mb-1">
        <img src={pomerImg} className="w-3 h-3" />
        <span>영구제거</span>
      </div>
      {players.map((ps) => {
        const seat = seatBySeatNo.get(ps.seatNo);
        const color = PLANET_COLORS[seat?.homePlanetType || 'TERRA'];
        return (
          <div key={ps.seatNo} className="flex justify-between gap-2">
            <span style={{ color }}>{seat?.raceNameKo || `P${ps.seatNo}`}:</span>
            <span className="font-bold">{ps.permanentlyRemovedGaiaformers}</span>
          </div>
        );
      })}
    </div>
  );
}

const LEGEND_HOME_TYPES = ['TERRA', 'VOLCANIC', 'OXIDE', 'DESERT', 'SWAMP', 'TITANIUM', 'ICE'] as const;
const LEGEND_OTHER_TYPES = ['GAIA', 'LOST_PLANET', 'TRANSDIM', 'ASTEROIDS'] as const;

function Legend({ seats }: { seats: SeatView[] }) {
  const buildings = useGameStore(s => s.buildings);
  const hexes = useGameStore(s => s.hexes);

  const planetByCoord = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of hexes) {
      if (h.planetType) map.set(`${h.hexQ},${h.hexR}`, h.planetType);
    }
    return map;
  }, [hexes]);

  // { seatNo → { planetType → count } }
  const countBySeat = useMemo(() => {
    const result = new Map<number, Map<string, number>>();
    const seatByPid = new Map<string, SeatView>();
    for (const s of seats) {
      if (s.playerId) seatByPid.set(s.playerId, s);
    }
    for (const b of buildings) {
      const pt = planetByCoord.get(`${b.hexQ},${b.hexR}`);
      if (!pt) continue;
      const seat = seatByPid.get(b.playerId);
      if (!seat) continue;
      if (!result.has(seat.seatNo)) result.set(seat.seatNo, new Map());
      const inner = result.get(seat.seatNo)!;
      inner.set(pt, (inner.get(pt) ?? 0) + 1);
    }
    return result;
  }, [buildings, planetByCoord, seats]);

  const activeSeatNos = useMemo(
    () => seats.filter(s => s.playerId).map(s => s.seatNo).sort(),
    [seats],
  );

  if (activeSeatNos.length === 0) return null;

  return (
    <div className="mt-3 flex justify-center">
      <div className="flex items-start gap-1">
        {LEGEND_HOME_TYPES.map(t => {
          const color = PLANET_COLORS[t] ?? '#666';
          const border = color === '#000000' ? '1px solid #666' : undefined;
          const markers = activeSeatNos.filter(sn => (countBySeat.get(sn)?.get(t) ?? 0) > 0);
          return (
            <div key={t} className="flex flex-col items-center gap-0.5">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color, border }} title={t} />
              {markers.map(sn => {
                const seat = seats.find(s => s.seatNo === sn);
                const pc = PLANET_COLORS[seat?.homePlanetType ?? ''] ?? '#aaa';
                return <div key={sn} className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pc === '#b8d4e3' ? '#cde' : pc }} />;
              })}
            </div>
          );
        })}
        <div className="w-px self-stretch bg-gray-600 mx-0.5" />
        {LEGEND_OTHER_TYPES.map(t => {
          const color = PLANET_COLORS[t] ?? '#666';
          const border = color === '#b8d4e3' || color === '#000000' ? '1px solid #666' : undefined;
          const markers = activeSeatNos.filter(sn => (countBySeat.get(sn)?.get(t) ?? 0) > 0);
          return (
            <div key={t} className="flex flex-col items-center gap-0.5">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color, border }} title={t} />
              {markers.map(sn => {
                const seat = seats.find(s => s.seatNo === sn);
                const pc = PLANET_COLORS[seat?.homePlanetType ?? ''] ?? '#aaa';
                const displayColor = pc === '#b8d4e3' ? '#cde' : pc;
                const count = countBySeat.get(sn)?.get(t) ?? 0;
                if (t === 'GAIA') {
                  return (
                    <div key={sn} className="flex items-center gap-0.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: displayColor }} />
                      <span className="text-[8px] font-bold leading-none text-white">{count}</span>
                    </div>
                  );
                }
                return <div key={sn} className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: displayColor }} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectorLabels({
                        sectorLabels,
                        sectorLabelTextByPositionNo,
                      }: {
  sectorLabels: { positionNo: number; x: number; y: number }[];
  sectorLabelTextByPositionNo: Map<number, string>;
}) {
  return (
      <>
        {sectorLabels.map((s) => {
          const labelText =
              sectorLabelTextByPositionNo.get(s.positionNo) ?? String(s.positionNo).padStart(2, '0');

          return (
              <text
                  key={`sector-${s.positionNo}`}
                  x={s.x}
                  y={s.y}
                  fontSize="18"
                  fontWeight="bold"
                  fill="#fff"
                  stroke="#000"
                  strokeWidth="1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
              >
                {labelText}
              </text>
          );
        })}
      </>
  );
}


const BUILDING_IMAGES: Record<string, string> = {
  MINE: mineBuildingPng,
  TRADING_STATION: tradingStationBuildingPng,
  RESEARCH_LAB: researchLabBuildingPng,
  ACADEMY: academyBuildingPng,
  PLANETARY_INSTITUTE: planetaryInstituteBuildingPng,
  GAIAFORMER: pomerImg,
};

/** 건물 타입 → 이미지 (플레이어 색상으로 colorize) */
function renderBuildingShape(
  cx: number, cy: number,
  buildingType: string,
  color: string,
  isTentative: boolean,
  borderColor: string,
) {
  const r = HEX_SIZE * 0.38;
  const opacity = isTentative ? 0.6 : 1.0;
  const img = BUILDING_IMAGES[buildingType] ?? BUILDING_IMAGES.MINE;
  const sizeScale = buildingType === 'MINE' ? 4.8 * 1.2 : buildingType === 'GAIAFORMER' ? 4.8 / (1.3 * 1.5) : 4.8;
  const size = r * sizeScale;

  // 그레이스케일 후 플레이어 색상으로 tint (밝은 영역 → 플레이어 색)
  const hex = color.replace('#', '');
  const cr = parseInt(hex.slice(0, 2), 16) / 255;
  const cg = parseInt(hex.slice(2, 4), 16) / 255;
  const cb = parseInt(hex.slice(4, 6), 16) / 255;
  const filterId = `bf-${hex}`;
  // luminance 계수 * color * 2배 boost (밝은 픽셀이 플레이어 색으로 채워짐)
  const m = (c: number) => `${0.299*c*2.5} ${0.587*c*2.5} ${0.114*c*2.5} 0 0`;
  const matrix = `${m(cr)}  ${m(cg)}  ${m(cb)}  0 0 0 1 0`;

  return (
    <g pointerEvents="none" opacity={opacity}>
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          {/* 이미지 모양 따라 테두리 생성 */}
          <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="dilated" />
          <feFlood floodColor={borderColor} floodOpacity="1" result="colorFlood" />
          <feComposite in="colorFlood" in2="dilated" operator="in" result="outline" />
          {/* 이미지 colorize */}
          <feColorMatrix type="saturate" values="0" in="SourceGraphic" result="gray" />
          <feComponentTransfer in="gray" result="boosted">
            <feFuncR type="gamma" amplitude="1" exponent="2.0" offset="0" />
            <feFuncG type="gamma" amplitude="1" exponent="2.0" offset="0" />
            <feFuncB type="gamma" amplitude="1" exponent="2.0" offset="0" />
          </feComponentTransfer>
          <feColorMatrix type="matrix" values={matrix} in="boosted" result="colorized" />
          {/* 테두리 위에 colorize 이미지 합성 */}
          <feComposite in="colorized" in2="outline" operator="over" />
        </filter>
      </defs>
      <image
        href={img}
        x={cx - size / 2} y={cy - size / 2 - (buildingType === 'GAIAFORMER' ? -4 : 12)}
        width={size} height={size}
        filter={`url(#${filterId})`}
      />
    </g>
  );
}

function HexTile({
                   hex,
                   building,
                   buildingOwnerColor,
                   buildingOwnerBorderColor,
                   isClickable,
                   onClick,
                   isTentative = false,
                 }: {
  hex: GameHex;
  building: any | undefined;
  buildingOwnerColor: string | null;
  buildingOwnerBorderColor: string | null;
  isClickable: boolean;
  onClick: (hex: GameHex) => void;
  isTentative?: boolean;
}) {
  const { x, y } = axialToPixel(hex.hexQ, hex.hexR);

  const tileType = getTileType(hex.positionNo);
  const stroke = getHexStroke(tileType);
  const strokeWidth = tileType === 'sector' ? 1 : 2;

  const sectorFill = getSectorFillColor(tileType, hex.positionNo);
  const planetImg = PLANET_IMAGES[hex.planetType];
  const sectorId = getSectorIdFromHex(hex);
  const fleetImg = tileType === 'single' && sectorId ? FLEET_IMAGES[sectorId] : null;

  // 채움 색상 결정: 이미지가 있는 행성은 섹터 배경색, 없으면 행성 색상
  const fillColor = sectorFill
      ? sectorFill
      : planetImg || fleetImg
          ? PLANET_COLORS.EMPTY
          : PLANET_COLORS[hex.planetType] || PLANET_COLORS.EMPTY;

  const clipId = `hex-clip-${hex.hexQ}-${hex.hexR}`;

  return (
      <g>
        <defs>
          <clipPath id={clipId}>
            <polygon points={hexPoints(x, y)} />
          </clipPath>
        </defs>

        <polygon
            points={hexPoints(x, y)}
            fill={fillColor}
            stroke={stroke}
            strokeWidth={strokeWidth}
            className={isClickable ? 'cursor-pointer' : ''}
            onClick={() => isClickable && onClick(hex)}
        />

        {planetImg && (() => {
          const scale = PLANET_IMAGE_SCALE[hex.planetType] ?? 0.9;
          return (
              <image
                  href={planetImg}
                  x={x - HEX_SIZE * scale}
                  y={y - HEX_SIZE * scale}
                  width={HEX_SIZE * scale * 2}
                  height={HEX_SIZE * scale * 2}
                  clipPath={`url(#${clipId})`}
                  className={isClickable ? 'cursor-pointer' : ''}
                  onClick={() => isClickable && onClick(hex)}
                  style={{ pointerEvents: isClickable ? 'auto' : 'none' }}
              />
          );
        })()}

        {fleetImg && (
            <image
                href={fleetImg}
                x={x - HEX_SIZE * 0.85}
                y={y - HEX_SIZE * 0.85}
                width={HEX_SIZE * 1.7}
                height={HEX_SIZE * 1.7}
                clipPath={`url(#${clipId})`}
                style={{ pointerEvents: 'none' }}
            />
        )}

        {building && renderBuildingShape(
          x, y, building.buildingType,
          buildingOwnerColor ?? '#ffffff',
          isTentative,
          buildingOwnerBorderColor ?? '#ffffff',
        )}
      </g>
  );
}

export default function HexMap({ roomId, playerStates = [], seats: seatsProp = [] }: Props) {
  const {
    hexes: storeHexes,
    buildings,
    gamePhase,
    nextSetupSeatNo,
    currentTurnSeatNo,
    playerId,
    mySeatNo,
    seats,
    turnState,
    fleetProbes,
    fleetShipMode,
    tinkeroidsExtraRingPlanet,
    moweidsExtraRingPlanet,
    addPendingAction,
    addTentativeBuilding,
    clearFleetShipMode,
  } = useGameStore();

  const { hexes: localHexes, loading, error } = useHexes(roomId);
  // store에 hexes가 있으면 우선 사용 (ROUND_STARTED 시 갱신됨), 없으면 로컬 로딩 사용
  const hexes = storeHexes.length > 0 ? storeHexes : localHexes;

  // PLAYING 페이즈 업그레이드 선택 (TS → ResLab or PI)
  const [upgradeChoiceHex, setUpgradeChoiceHex] = useState<{ hexQ: number; hexR: number; fromType: string; px: number; py: number } | null>(null);

  /** seats / buildings 빠른 조회용 맵 */
  const seatBySeatNo = useMemo(() => {
    const m = new Map<number, any>();
    for (const s of seats) m.set(s.seatNo, s);
    return m;
  }, [seats]);

  const seatByPlayerId = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of seats) if (s.playerId) m.set(s.playerId, s);
    return m;
  }, [seats]);

  const buildingByCoord = useMemo(() => {
    const m = new Map<string, any>();
    // Include both confirmed and tentative buildings
    const allBuildings = [...buildings, ...turnState.tentativeBuildings];
    for (const b of allBuildings) m.set(`${b.hexQ},${b.hexR}`, b);
    return m;
  }, [buildings, turnState.tentativeBuildings]);

  const mySeat = mySeatNo !== null ? seatBySeatNo.get(mySeatNo) : undefined;

  const isMyTurn = useMemo(() => {
    if (!mySeatNo) return false;
    if (gamePhase?.startsWith('SETUP_MINE')) return mySeatNo === nextSetupSeatNo;
    if (gamePhase === 'PLAYING') return mySeatNo === currentTurnSeatNo;
    return false;
  }, [gamePhase, mySeatNo, nextSetupSeatNo, currentTurnSeatNo]);

  /** ====== SVG viewBox 자동 계산 ====== */
  const viewBox = useMemo(() => {
    if (hexes.length === 0) return '0 0 800 600';
    const pixels = hexes.map((h) => axialToPixel(h.hexQ, h.hexR));
    const padding = HEX_SIZE * 1.2;
    const minX = Math.min(...pixels.map((p) => p.x)) - padding;
    const maxX = Math.max(...pixels.map((p) => p.x)) + padding;
    const minY = Math.min(...pixels.map((p) => p.y)) - padding;
    const maxY = Math.max(...pixels.map((p) => p.y)) + padding;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [hexes]);

  /**
   * 섹터 라벨 “좌표” 계산
   * - positionNo(1~10)별로 해당 타일들의 q/r 평균 -> 중앙 좌표 추정
   */
  const sectorLabels = useMemo(() => {
    const sectorCenters = new Map<number, { sumQ: number; sumR: number; count: number }>();

    for (const hex of hexes) {
      if (hex.positionNo < 1 || hex.positionNo > 10) continue;
      const cur = sectorCenters.get(hex.positionNo) ?? { sumQ: 0, sumR: 0, count: 0 };
      cur.sumQ += hex.hexQ;
      cur.sumR += hex.hexR;
      cur.count += 1;
      sectorCenters.set(hex.positionNo, cur);
    }

    return Array.from(sectorCenters.entries()).map(([positionNo, data]) => {
      const centerQ = data.sumQ / data.count;
      const centerR = data.sumR / data.count;
      const { x, y } = axialToPixel(centerQ, centerR);
      return { positionNo, x, y };
    });
  }, [hexes]);

  /**
   * 표시 텍스트만 변경:
   * - positionNo(1~10) -> sector_id의 뒤 숫자 텍스트(예: "8") 매핑
   */
  const sectorLabelTextByPositionNo = useMemo(() => {
    const map = new Map<number, string>();

    for (const hex of hexes) {
      if (hex.positionNo < 1 || hex.positionNo > 10) continue;

      const sectorId = getSectorIdFromHex(hex);
      const labelText = parseSectorNumberText(sectorId);
      if (!labelText) continue;

      if (!map.has(hex.positionNo)) map.set(hex.positionNo, labelText);
    }

    return map;
  }, [hexes]);

  const getBuildingOwnerColor = useCallback(
      (building: any) => {
        const seat = seatByPlayerId.get(building.playerId);
        return seat ? PLANET_COLORS[seat.homePlanetType] || '#ffffff' : '#ffffff';
      },
      [seatByPlayerId],
  );

  const getBuildingOwnerBorderColor = useCallback(
      (building: any) => {
        const seat = seatByPlayerId.get(building.playerId);
        return seat ? VIVID_BORDER_COLORS[seat.homePlanetType] || '#ffffff' : '#ffffff';
      },
      [seatByPlayerId],
  );

  const isHexClickable = useCallback(
      (hex: GameHex) => {
        if (!isMyTurn) return false;
        if (!mySeat) return false;

        // 함대 선박 hex 선택 모드
        if (fleetShipMode) {
          const sectorId = getSectorIdFromHex(hex);
          if (sectorId?.startsWith('FORGOTTEN_FLEET_')) return false;
          const building = buildingByCoord.get(`${hex.hexQ},${hex.hexR}`);
          if (fleetShipMode.needsGaiaformHex) {
            return hex.planetType === 'TRANSDIM' && !building;
          }
          if (fleetShipMode.needsAsteroidHex) {
            return hex.planetType === 'ASTEROIDS' && !building;
          }
          if (fleetShipMode.needsUpgradeMineToTs) {
            return building?.playerId === playerId && building?.buildingType === 'MINE';
          }
          if (fleetShipMode.needsTsToRl) {
            return building?.playerId === playerId && building?.buildingType === 'TRADING_STATION';
          }
          return false;
        }

        const pending = turnState.pendingActions;
        const terraformDiscount = getTerraformDiscount(pending);
        const navBonus = getNavBonus(pending);
        // 테라포밍 pending: 광산 배치 전 상태
        const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
        // 항법 보너스 pending: 광산/우주선 배치 전 상태
        const hasPendingNavBoost = navBonus > 0 && !pending.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE');
        // BOOSTER_12 즉시 포밍: 광산 배치 전 상태
        const boosterAct = pending.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined;
        const hasPendingGaiaformerBooster = boosterAct?.payload.actionType === 'PLACE_GAIAFORMER' && !pending.some(a => a.type === 'PLACE_MINE');
const hasOtherPending = pending.length > 0 && !hasPendingTerraform && !hasPendingNavBoost && !hasPendingGaiaformerBooster;

        // 함대 헥스 (FORGOTTEN_FLEET_*)
        const sectorId = getSectorIdFromHex(hex);
        if (sectorId?.startsWith('FORGOTTEN_FLEET_')) {
          // 항법 보너스 pending 중에는 우주선 입장 허용 (테라포밍 pending, 기타 pending은 차단)
          if (hasOtherPending || hasPendingTerraform) return false;
          if (gamePhase !== 'PLAYING') return false;
          const fleetName = sectorId.replace('FORGOTTEN_FLEET_', '');
          if (playerId && (fleetProbes[fleetName] || []).includes(playerId)) return false;
          const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
          if (!myState || myState.victoryPoints < 5) return false;
          // 항법 거리 체크 (광산과 동일: navRange + navBonus, QIC로 추가 확장 가능)
          const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
          const effectiveNavRange = navLevelToRange(myState.techNavigation) + navBonus;
          const { reachable } = getNavigationCost(hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState.qic);
          return reachable;
        }

        if (hasOtherPending) return false;

        // BOOSTER_12 즉시 포밍: TRANSDIM 행성에 가이아포머 배치 (파워 비용 없음)
        if (hasPendingGaiaformerBooster) {
          if (hex.planetType !== 'TRANSDIM') return false;
          const bldg = buildingByCoord.get(`${hex.hexQ},${hex.hexR}`);
          if (bldg) return false;
          const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
          if (!myState || myState.stockGaiaformer < 1) return false;
          const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
          const effectiveNavRange = navLevelToRange(myState.techNavigation) + navBonus;
          const { reachable } = getNavigationCost(hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState.qic);
          return reachable;
        }

        const building = buildingByCoord.get(`${hex.hexQ},${hex.hexR}`);

        // TRANSDIM → 가이아포머 배치 (테라포밍/항법 보너스 pending 중엔 불가)
        if (hex.planetType === 'TRANSDIM' && !building && gamePhase === 'PLAYING' && !hasPendingTerraform && !hasPendingNavBoost) {
          const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
          if (!myState || myState.stockGaiaformer < 1) return false;
          const gaiaLevel = myState.techGaia;
          const requiredPower = gaiaLevel <= 2 ? 6 : gaiaLevel === 3 ? 4 : gaiaLevel === 4 ? 5 : 4;
          const totalPower = myState.powerBowl1 + myState.powerBowl2 + myState.powerBowl3;
          if (totalPower < requiredPower) return false;
          const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
          const effectiveNavRange = navLevelToRange(myState.techNavigation) + navBonus;
          const { reachable } = getNavigationCost(hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState.qic);
          return reachable;
        }

        // 클릭 가능한 행성 타입 필터
        // 링 7종, 홈 행성, 소행성(가이아포머), 원시행성(3삽), 가이아(확장 종족만)
        const isMineable =
          HOME_PLANET_TYPES.has(hex.planetType) ||
          hex.planetType === mySeat.homePlanetType ||
          hex.planetType === 'ASTEROIDS' ||
          hex.planetType === 'LOST_PLANET' ||
          hex.planetType === 'GAIA';
        if (!isMineable) return false;

        if (building) {
          // GAIA 행성에 내 가이아포머가 있는 경우 → 광산 건설 가능
          if (gamePhase === 'PLAYING' && building.playerId === playerId && building.buildingType === 'GAIAFORMER' && hex.planetType === 'GAIA') {
            const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
            if (!myState) return false;
            return myState.credit >= 2 && myState.ore >= 1;
          }
          // 이미 건물 있는 헥스
          if (gamePhase === 'PLAYING' && building.playerId === playerId && !hasPendingTerraform) {
            const options = UPGRADE_OPTIONS[building.buildingType];
            if (!options) return false;
            const myState = turnState.previewPlayerState || playerStates.find(p => p.seatNo === mySeatNo);
            if (!myState) return true;
            const allBuildings = [...buildings, ...turnState.tentativeBuildings];
            return options.some(toType => {
              const cost = calcUpgradeCost(building.buildingType, toType, building.hexQ, building.hexR, allBuildings, playerId!);
              return ResourceCalculator.canAfford(myState, cost);
            });
          }
          return false;
        }

        const isSetupPhase = gamePhase?.startsWith('SETUP_MINE');
        if (isSetupPhase) {
          return hex.planetType === mySeat.homePlanetType;
        }

        if (gamePhase === 'PLAYING') {
          const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
          if (!myState) return false;

          const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
          const effectiveNavRange = navLevelToRange(myState.techNavigation) + navBonus;
          const { reachable, qicNeeded: navQic } = getNavigationCost(
            hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState.qic,
          );
          if (!reachable) return false;

          const result = calcMineCost(
            hex.planetType, mySeat.raceCode, mySeat.homePlanetType,
            myState.techTerraforming, terraformDiscount, myState, seats, navQic,
            tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet,
          );
          return result.possible;
        }

        return false;
      },
      [isMyTurn, mySeat, playerId, buildingByCoord, buildings, turnState.pendingActions,
       turnState.previewPlayerState, turnState.tentativeBuildings, gamePhase, playerStates, mySeatNo, fleetProbes, fleetShipMode],
  );

  /** 업그레이드 액션 추가 */
  const addUpgradeAction = useCallback(
      (hexQ: number, hexR: number, fromType: string, toType: string) => {
        if (!playerId) return;
        const allBuildings = [...buildings, ...turnState.tentativeBuildings];
        const cost = calcUpgradeCost(fromType, toType, hexQ, hexR, allBuildings, playerId);
        const currentPlayerState = turnState.previewPlayerState ||
          playerStates.find(p => p.seatNo === mySeatNo);

        if (currentPlayerState && !ResourceCalculator.canAfford(currentPlayerState, cost)) {
          alert('자원이 부족합니다.');
          return;
        }

        const leech = calcLeechInfo(hexQ, hexR, toType, allBuildings, playerStates, playerId);

        const action: UpgradeBuildingAction = {
          id: `action-${Date.now()}-${Math.random()}`,
          type: 'UPGRADE_BUILDING',
          timestamp: Date.now(),
          payload: { hexQ, hexR, fromType, toType, cost, leech },
        };
        addPendingAction(action);
        // 임시 건물 표시 (업그레이드된 타입으로)
        addTentativeBuilding({
          id: `temp-${Date.now()}`,
          gameId: roomId,
          playerId,
          hexQ,
          hexR,
          buildingType: toType,
        });
        setUpgradeChoiceHex(null);
      },
      [playerId, turnState.previewPlayerState, turnState.tentativeBuildings,
       playerStates, mySeatNo, buildings, addPendingAction, addTentativeBuilding, roomId],
  );

  /** 헥스 클릭 - 셋업 광산 / PLAYING 광산·업그레이드 */
  const handleHexClick = useCallback(
      (hex: GameHex) => {
        if (!isMyTurn || !mySeat || !playerId) return;

        // 함대 선박 hex 선택 모드: FleetShipAction 생성 후 pending에 추가
        if (fleetShipMode) {
          const action: FleetShipAction = {
            id: `fsa-${Date.now()}-${Math.random()}`,
            type: 'FLEET_SHIP_ACTION',
            timestamp: Date.now(),
            payload: {
              fleetName: fleetShipMode.fleetName,
              actionCode: fleetShipMode.actionCode,
              cost: fleetShipMode.cost,
              isImmediate: true,
              hexQ: hex.hexQ,
              hexR: hex.hexR,
            },
          };
          addPendingAction(action);
          clearFleetShipMode();
          // 건물 업그레이드 모드는 임시 건물 변경 표시
          if (fleetShipMode.needsUpgradeMineToTs) {
            addTentativeBuilding({ id: `temp-${Date.now()}`, gameId: roomId, playerId, hexQ: hex.hexQ, hexR: hex.hexR, buildingType: 'TRADING_STATION' });
          } else if (fleetShipMode.needsTsToRl) {
            addTentativeBuilding({ id: `temp-${Date.now()}`, gameId: roomId, playerId, hexQ: hex.hexQ, hexR: hex.hexR, buildingType: 'RESEARCH_LAB' });
          } else if (fleetShipMode.needsGaiaformHex) {
            addTentativeBuilding({ id: `temp-${Date.now()}`, gameId: roomId, playerId, hexQ: hex.hexQ, hexR: hex.hexR, buildingType: 'GAIAFORMER' });
          } else {
            // 광산 건설 (asteroid 등)
            addTentativeBuilding({ id: `temp-${Date.now()}`, gameId: roomId, playerId, hexQ: hex.hexQ, hexR: hex.hexR, buildingType: 'MINE' });
          }
          return;
        }

        const pending = turnState.pendingActions;
        const terraformDiscount = getTerraformDiscount(pending);
        const navBonus = getNavBonus(pending);
        const hasPendingTerraform = terraformDiscount > 0 && !pending.some(a => a.type === 'PLACE_MINE');
        const hasPendingNavBoost = navBonus > 0 && !pending.some(a => a.type === 'PLACE_MINE' || a.type === 'FLEET_PROBE');
        const boosterActClick = pending.find(a => a.type === 'BOOSTER_ACTION') as BoosterAction | undefined;
        const hasPendingGaiaformerBooster = boosterActClick?.payload.actionType === 'PLACE_GAIAFORMER' && !pending.some(a => a.type === 'PLACE_MINE');

        // 테라포밍/항법 보너스 액션 이외의 경우 이미 다른 액션이 있으면 차단
        if (pending.length > 0 && !hasPendingTerraform && !hasPendingNavBoost && !hasPendingGaiaformerBooster) {
          alert('이미 액션을 선택했습니다. 확정하거나 초기화하세요.');
          return;
        }

        // --- 함대 입장 ---
        const sectorId = getSectorIdFromHex(hex);
        if (sectorId?.startsWith('FORGOTTEN_FLEET_')) {
          const fleetName = sectorId.replace('FORGOTTEN_FLEET_', '');
          const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
          const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
          const effectiveNavRange = myState ? navLevelToRange(myState.techNavigation) + navBonus : navBonus;
          const { qicNeeded: navQic } = getNavigationCost(
            hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState?.qic ?? 0,
          );
          const baseCost = BUILDING_COSTS.FLEET_PROBE.base;
          const cost = navQic > 0 ? { ...baseCost, qic: (baseCost.qic ?? 0) + navQic } : baseCost;
          const slotIndex = (fleetProbes[fleetName] || []).length;
          const powerCharge = (slotIndex === 1 || slotIndex === 2) ? 2 : slotIndex === 3 ? 3 : 0;
          const action: FleetProbeAction = {
            id: `action-${Date.now()}-${Math.random()}`,
            type: 'FLEET_PROBE',
            timestamp: Date.now(),
            payload: { fleetName, cost, powerCharge },
          };
          addPendingAction(action);
          return;
        }

        // --- TRANSDIM: 가이아포머 배치 ---
        if (hex.planetType === 'TRANSDIM') {
          const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
          if (!myState) return;
          const gaiaLevel = myState.techGaia;
          const powerSpent = gaiaLevel <= 2 ? 6 : gaiaLevel === 3 ? 4 : gaiaLevel === 4 ? 5 : 4;
          const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
          const effectiveNavRange = navLevelToRange(myState.techNavigation) + navBonus;
          const { qicNeeded: navQic } = getNavigationCost(hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState.qic);
          const action: DeployGaiaformerAction = {
            id: `action-${Date.now()}-${Math.random()}`,
            type: 'DEPLOY_GAIAFORMER',
            timestamp: Date.now(),
            payload: { hexQ: hex.hexQ, hexR: hex.hexR, powerSpent, qicUsed: navQic },
          };
          addPendingAction(action);
          addTentativeBuilding({
            id: `temp-${Date.now()}`,
            gameId: roomId,
            playerId,
            hexQ: hex.hexQ,
            hexR: hex.hexR,
            buildingType: 'GAIAFORMER',
          });
          return;
        }

        const building = buildingByCoord.get(`${hex.hexQ},${hex.hexR}`);

        // --- GAIA 행성에 내 가이아포머 → 광산 건설 ---
        if (building && building.playerId === playerId && building.buildingType === 'GAIAFORMER' && hex.planetType === 'GAIA') {
          const cost = { credit: 2, ore: 1 };
          const action: PlaceMineAction = {
            id: `action-${Date.now()}-${Math.random()}`,
            type: 'PLACE_MINE',
            timestamp: Date.now(),
            payload: { hexQ: hex.hexQ, hexR: hex.hexR, cost },
          };
          addPendingAction(action);
          addTentativeBuilding({
            id: `temp-${Date.now()}`,
            gameId: roomId,
            playerId,
            hexQ: hex.hexQ,
            hexR: hex.hexR,
            buildingType: 'MINE',
          });
          return;
        }

        // --- BOOSTER_12 즉시 포밍: TRANSDIM 행성 가이아포머 배치 (파워 비용 없음) ---
        if (hasPendingGaiaformerBooster && hex.planetType === 'TRANSDIM' && !building && gamePhase === 'PLAYING') {
          const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
          if (!myState) return;
          const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
          const effectiveNavRange = navLevelToRange(myState.techNavigation) + navBonus;
          const { qicNeeded: navQic } = getNavigationCost(hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState.qic);
          const action: DeployGaiaformerAction = {
            id: `action-${Date.now()}-${Math.random()}`,
            type: 'DEPLOY_GAIAFORMER',
            timestamp: Date.now(),
            payload: { hexQ: hex.hexQ, hexR: hex.hexR, powerSpent: 0, qicUsed: navQic },
          };
          addPendingAction(action);
          addTentativeBuilding({
            id: `temp-${Date.now()}`,
            gameId: roomId,
            playerId,
            hexQ: hex.hexQ,
            hexR: hex.hexR,
            buildingType: 'GAIAFORMER',
          });
          return;
        }

        const isSetupPhase = gamePhase?.startsWith('SETUP_MINE');

        // --- 셋업 페이즈: 광산 (또는 의회) 배치 ---
        if (isSetupPhase) {
          const setupBuildingType =
            (mySeat.raceCode === 'IVITS' || mySeat.raceCode === 'TINKEROIDS')
              ? 'PLANETARY_INSTITUTE'
              : 'MINE';
          const action: PlaceMineAction = {
            id: `action-${Date.now()}-${Math.random()}`,
            type: 'PLACE_MINE',
            timestamp: Date.now(),
            payload: { hexQ: hex.hexQ, hexR: hex.hexR, cost: { credit: 0, ore: 0 } },
          };
          addPendingAction(action);
          addTentativeBuilding({
            id: `temp-${Date.now()}`,
            gameId: roomId,
            playerId,
            hexQ: hex.hexQ,
            hexR: hex.hexR,
            buildingType: setupBuildingType,
          });
          return;
        }

        // --- PLAYING 페이즈 ---
        if (gamePhase === 'PLAYING') {
          // 내 건물 클릭 → 업그레이드 (테라포밍 pending 중엔 불가)
          if (building && building.playerId === playerId && !hasPendingTerraform) {
            const fromType = building.buildingType;
            const options = UPGRADE_OPTIONS[fromType];
            if (!options) return;
            if (options.length === 1) {
              addUpgradeAction(hex.hexQ, hex.hexR, fromType, options[0]);
            } else {
              // 같은 건물 다시 클릭 → 패널 닫기 (토글)
              if (upgradeChoiceHex?.hexQ === hex.hexQ && upgradeChoiceHex?.hexR === hex.hexR) {
                setUpgradeChoiceHex(null);
                return;
              }
              const { x: px, y: py } = axialToPixel(hex.hexQ, hex.hexR);
              setUpgradeChoiceHex({ hexQ: hex.hexQ, hexR: hex.hexR, fromType, px, py });
            }
            return;
          }

          // 빈 행성 → 광산 건설
          if (!building) {
            const myState = turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo);
            if (!myState) return;

            const myBuildings = [...buildings, ...turnState.tentativeBuildings].filter(b => b.playerId === playerId);
            const effectiveNavRange = navLevelToRange(myState.techNavigation) + navBonus;
            const { qicNeeded: navQic } = getNavigationCost(
              hex.hexQ, hex.hexR, myBuildings, effectiveNavRange, myState.qic,
            );

            const result = calcMineCost(
              hex.planetType, mySeat.raceCode, mySeat.homePlanetType,
              myState.techTerraforming, terraformDiscount, myState, seats, navQic,
            );

            if (!result.possible) {
              alert('자원이 부족합니다.');
              return;
            }

            const cost = { credit: result.credit, ore: result.ore, qic: result.qic };
            const action: PlaceMineAction = {
              id: `action-${Date.now()}-${Math.random()}`,
              type: 'PLACE_MINE',
              timestamp: Date.now(),
              payload: {
                hexQ: hex.hexQ, hexR: hex.hexR, cost,
                gaiaformerUsed: result.gaiaformerUsed || undefined,
                vpBonus: result.vpBonus || undefined,
              },
            };
            addPendingAction(action);
            addTentativeBuilding({
              id: `temp-${Date.now()}`,
              gameId: roomId,
              playerId,
              hexQ: hex.hexQ,
              hexR: hex.hexR,
              buildingType: 'MINE',
            });
          }
        }
      },
      [isMyTurn, mySeat, playerId, buildingByCoord, buildings, roomId, gamePhase,
       turnState.previewPlayerState, turnState.pendingActions, turnState.tentativeBuildings,
       playerStates, mySeatNo, addPendingAction, addTentativeBuilding, addUpgradeAction, fleetProbes,
       fleetShipMode, clearFleetShipMode, upgradeChoiceHex],
  );

  if (loading) {
    return (
        <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-center h-96">
          <p className="text-white">맵 로딩 중...</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-center h-96">
          <p className="text-red-400">{error}</p>
        </div>
    );
  }

  return (
      <div className="bg-gray-900 rounded-lg p-4 overflow-auto relative">
        <VpPanel playerStates={playerStates} seatBySeatNo={seatBySeatNo} />
        <RemovedPomerPanel playerStates={playerStates} seatBySeatNo={seatBySeatNo} />

        {isMyTurn && (
            <div className="mb-2 p-2 bg-yellow-600 text-black rounded text-center font-semibold">
              {gamePhase === 'PLAYING'
                ? '당신의 차례입니다! 행동을 선택하세요.'
                : '당신의 차례입니다! 광산을 배치하세요.'}
            </div>
        )}


        <svg
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-auto"
            style={{ minHeight: '500px', maxHeight: '70vh' }}
        >
          {/* 즉시 포밍 여부: BOOSTER_12 또는 TF Mars GAIAFORM 액션 pending 시만 GAIA 미리보기 */}
          {(() => {
            const isInstantGaiaform = turnState.pendingActions.some(a =>
              (a.type === 'BOOSTER_ACTION' && a.payload.actionType === 'PLACE_GAIAFORMER') ||
              (a.type === 'FLEET_SHIP_ACTION' && (a.payload.actionCode as string)?.includes('GAIAFORM'))
            );
            return hexes.map((hex) => {
            const building = buildingByCoord.get(`${hex.hexQ},${hex.hexR}`);
            const clickable = isHexClickable(hex);
            const isTentative = building ? turnState.tentativeBuildings.some(
              tb => tb.hexQ === building.hexQ && tb.hexR === building.hexR
            ) : false;
            // 즉시포밍 액션 pending 중에만 임시 GAIAFORMER → GAIA 미리보기 표시
            const displayHex = (isTentative && building?.buildingType === 'GAIAFORMER' && hex.planetType === 'TRANSDIM' && isInstantGaiaform)
              ? { ...hex, planetType: 'GAIA' }
              : hex;

            return (
                <HexTile
                    key={`${hex.hexQ},${hex.hexR}`}
                    hex={displayHex}
                    building={building}
                    buildingOwnerColor={building ? getBuildingOwnerColor(building) : null}
                    buildingOwnerBorderColor={building ? getBuildingOwnerBorderColor(building) : null}
                    isClickable={clickable}
                    onClick={handleHexClick}
                    isTentative={isTentative}
                />
            );
          });
          })()}

          <SectorLabels
              sectorLabels={sectorLabels}
              sectorLabelTextByPositionNo={sectorLabelTextByPositionNo}
          />

          {/* 업그레이드 선택 패널 - 건물 오른쪽에 냉장고 형태로 표시 */}
          {upgradeChoiceHex && playerId && (() => {
            const allBuildings = [...buildings, ...turnState.tentativeBuildings];
            const myState = turnState.previewPlayerState || playerStates.find(p => p.seatNo === mySeatNo);
            const costRL = calcUpgradeCost(upgradeChoiceHex.fromType, 'RESEARCH_LAB', upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, allBuildings, playerId);
            const costPI = calcUpgradeCost(upgradeChoiceHex.fromType, 'PLANETARY_INSTITUTE', upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, allBuildings, playerId);
            const canRL = !myState || ResourceCalculator.canAfford(myState, costRL);
            const canPI = !myState || ResourceCalculator.canAfford(myState, costPI);
            const leechResLab = calcLeechInfo(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, 'RESEARCH_LAB', allBuildings, playerStates, playerId);
            const leechPI = calcLeechInfo(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, 'PLANETARY_INSTITUTE', allBuildings, playerStates, playerId);
            const leechText = (leech: typeof leechResLab) =>
              leech.length === 0 ? '' : `리치: ${leech.map(l => `${l.seatNo}번 +${l.power}pw(-${l.vpCost}VP)`).join(' ')}`;
            const panelW = 140;
            const panelH = 130;
            const px = upgradeChoiceHex.px + HEX_SIZE * 1.2;
            const py = upgradeChoiceHex.py - panelH / 2;
            return (
              <foreignObject x={px} y={py} width={panelW} height={panelH}>
                <div
                  style={{ width: panelW, height: panelH, fontFamily: 'sans-serif' }}
                  className="flex flex-col rounded-lg overflow-hidden border-2 border-yellow-500 shadow-xl"
                >
                  {/* 헤더 */}
                  <div className="bg-yellow-600 text-black text-[10px] font-bold text-center py-1 px-1">
                    업그레이드 선택
                  </div>

                  {/* 연구소 칸 */}
                  <button
                    onClick={() => canRL && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'RESEARCH_LAB')}
                    disabled={!canRL}
                    className={`flex-1 flex flex-col items-center justify-center border-b border-yellow-500 px-1 ${canRL ? 'bg-blue-800 hover:bg-blue-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}
                  >
                    <span className="text-white text-[10px] font-bold">연구소</span>
                    <span className="text-blue-200 text-[9px]">5c · 3o</span>
                    {leechResLab.length > 0 && (
                      <span className="text-yellow-300 text-[8px] mt-0.5 text-center leading-tight">{leechText(leechResLab)}</span>
                    )}
                  </button>

                  {/* 행성 의회 칸 */}
                  <button
                    onClick={() => canPI && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'PLANETARY_INSTITUTE')}
                    disabled={!canPI}
                    className={`flex-1 flex flex-col items-center justify-center border-b border-yellow-500 px-1 ${canPI ? 'bg-purple-800 hover:bg-purple-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}
                  >
                    <span className="text-white text-[10px] font-bold">행성 의회</span>
                    <span className="text-purple-200 text-[9px]">6c · 4o</span>
                    {leechPI.length > 0 && (
                      <span className="text-yellow-300 text-[8px] mt-0.5 text-center leading-tight">{leechText(leechPI)}</span>
                    )}
                  </button>

                  {/* 취소 칸 */}
                  <button
                    onClick={() => setUpgradeChoiceHex(null)}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-[9px] text-center py-1 cursor-pointer"
                  >
                    취소
                  </button>
                </div>
              </foreignObject>
            );
          })()}
        </svg>

        {/* FreePower 이미지 (클릭 가능한 프리 액션 오버레이 포함) */}
        {(() => {
          const myPS = gamePhase === 'PLAYING' && playerId
            ? (turnState.previewPlayerState ?? playerStates.find(p => p.seatNo === mySeatNo))
            : undefined;
          return (
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '9%', minWidth: 60 }}>
              <FreePowerImage
                ore={myPS?.ore ?? 0}
                powerBowl3={myPS?.powerBowl3 ?? 0}
                interactive={!!myPS && isMyTurn}
              />
            </div>
          );
        })()}

        <Legend seats={seatsProp} />
      </div>
  );
}