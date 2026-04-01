import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { mapApi, roomApi } from '../api/client';
import type { GameHex, PlayerStateResponse, SeatView } from '../api/client';
import { ResourceCalculator } from '../utils/resourceCalculator';
import { BUILDING_COSTS } from '../constants/gameCosts';
import type { PlaceMineAction, UpgradeBuildingAction, FleetProbeAction, DeployGaiaformerAction, FleetShipAction, BoosterAction } from '../types/turnActions';
import { UPGRADE_OPTIONS } from '../constants/gameCosts';

import { PLANET_COLORS, VIVID_BORDER_COLORS } from '../constants/colors';
import { HOME_PLANET_TYPES, getTerraformDiscount, getNavBonus } from '../utils/terraformingCalculator';
import { analyzePending } from '../actions/pendingAnalyzer';
import { isHexClickable as isHexClickableRules } from '../actions/hexClickRules';
import { handleHexClick as handleHexClickRules } from '../actions/hexClickHandler';
import { getNavigationCost, navLevelToRange, getNavRangeBonus } from '../utils/navigationCalculator';
import { calcMineCost } from '../utils/mineActionCalculator';
import { calcUpgradeCost, calcLeechInfo, type LeechInfo } from '../utils/upgradeCalculator';
import pomerImg from '../assets/resource/Pomer.png';
import hivePng from '../assets/resource/Hive.png';
import knowledgePng from '../assets/resource/Knowledge.png';
import qicPng from '../assets/resource/QIC.png';
import creditImg from '../assets/resource/Credit.png';
import FreePowerImage from './FreePowerImage';
import ActionLogPanel from './ActionLogPanel';
import BiddingOverlay from './BiddingOverlay';
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
import blackPlanetPng from '../assets/planet/Black_planet.png';

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
  BLACK_PLANET: blackPlanetPng,
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
  onResultClick?: () => void;
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
      <div className="absolute z-10" style={{ top: '0.5cqw', left: '0.5cqw', backgroundColor: 'rgba(31,41,55,0.9)', padding: '0.35cqw', borderRadius: '0.3cqw', fontSize: '1.3cqw' }}>
        <div className="font-bold text-orange-400" style={{ marginBottom: '0.2cqw' }}>비딩</div>
        {playerStates.map((ps) => {
          const seat = seatBySeatNo.get(ps.seatNo);
          return (
              <div key={ps.seatNo} className="flex justify-between" style={{ gap: '0.5cqw' }}>
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
    <div style={{ backgroundColor: 'rgba(31,41,55,0.9)', padding: '0.35cqw', borderRadius: '0.3cqw', fontSize: '1.3cqw' }}>
      <div className="flex items-center font-bold text-purple-300" style={{ gap: '0.2cqw', marginBottom: '0.15cqw' }}>
        <img src={pomerImg} style={{ width: '1.3cqw', height: '1.3cqw' }} />
        <span>영구제거</span>
      </div>
      {players.map((ps) => {
        const seat = seatBySeatNo.get(ps.seatNo);
        const color = PLANET_COLORS[seat?.homePlanetType || 'TERRA'];
        return (
          <div key={ps.seatNo} className="flex justify-between" style={{ gap: '0.5cqw' }}>
            <span style={{ color }}>{seat?.raceNameKo || `P${ps.seatNo}`}:</span>
            <span className="font-bold">{ps.permanentlyRemovedGaiaformers}</span>
          </div>
        );
      })}
    </div>
  );
}

const LEGEND_HOME_TYPES = ['TERRA', 'VOLCANIC', 'OXIDE', 'DESERT', 'SWAMP', 'TITANIUM', 'ICE'] as const;
const LEGEND_OTHER_TYPES = ['GAIA', 'LOST_PLANET', 'ASTEROIDS'] as const;

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
      if (b.isLantidsMine) continue; // 란티다 기생 광산은 행성 종류에 포함하지 않음
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

  const renderPlanetIcon = (t: string) => {
    const img = PLANET_IMAGES[t];
    if (img) return <img src={img} style={{ width: '2.5cqw', height: '2.5cqw' }} className="flex-shrink-0 rounded-full object-cover" title={t} draggable={false} />;
    // 이미지 없으면 색상 원 폴백
    const color = PLANET_COLORS[t] ?? '#666';
    return <div className="rounded-full flex-shrink-0" style={{ width: '2.5cqw', height: '2.5cqw', backgroundColor: color }} title={t} />;
  };

  const renderMarker = (sn: number, t: string) => {
    const seat = seats.find(s => s.seatNo === sn);
    const pc = PLANET_COLORS[seat?.homePlanetType ?? ''] ?? '#aaa';
    const displayColor = pc === '#b8d4e3' ? '#cde' : pc;
    const count = countBySeat.get(sn)?.get(t) ?? 0;
    if (t === 'GAIA') {
      return (
        <div key={sn} className="flex items-center" style={{ gap: '0.2cqw' }}>
          <div className="rounded-full flex-shrink-0" style={{ width: '1.5cqw', height: '1.5cqw', backgroundColor: displayColor }} />
          <span className="font-bold leading-none text-white" style={{ fontSize: '1.4cqw' }}>{count}</span>
        </div>
      );
    }
    return <div key={sn} className="rounded-full flex-shrink-0" style={{ width: '1.5cqw', height: '1.5cqw', backgroundColor: displayColor }} />;
  };

  return (
    <div className="flex justify-center flex-shrink-0" style={{ marginTop: '0.3cqw' }}>
      <div className="flex items-start" style={{ gap: '0.5cqw' }}>
        {LEGEND_HOME_TYPES.map(t => {
          const markers = activeSeatNos.filter(sn => (countBySeat.get(sn)?.get(t) ?? 0) > 0);
          return (
            <div key={t} className="flex flex-col items-center" style={{ gap: '0.2cqw' }}>
              {renderPlanetIcon(t)}
              {markers.map(sn => renderMarker(sn, t))}
            </div>
          );
        })}
        <div className="self-stretch bg-gray-600" style={{ width: '1px', margin: '0 0.2cqw' }} />
        {LEGEND_OTHER_TYPES.map(t => {
          const markers = activeSeatNos.filter(sn => (countBySeat.get(sn)?.get(t) ?? 0) > 0);
          return (
            <div key={t} className="flex flex-col items-center" style={{ gap: '0.2cqw' }}>
              {renderPlanetIcon(t)}
              {markers.map(sn => renderMarker(sn, t))}
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
                        canRotate,
                        onRotate,
                      }: {
  sectorLabels: { positionNo: number; x: number; y: number }[];
  sectorLabelTextByPositionNo: Map<number, string>;
  canRotate?: boolean;
  onRotate?: (positionNo: number) => void;
}) {
  return (
      <>
        {sectorLabels.map((s) => {
          const labelText =
              sectorLabelTextByPositionNo.get(s.positionNo) ?? String(s.positionNo).padStart(2, '0');

          return (
              <g key={`sector-${s.positionNo}`}
                 onClick={() => canRotate && onRotate?.(s.positionNo)}
                 style={{ cursor: canRotate ? 'pointer' : 'default' }}
              >
                {canRotate && (
                    <circle cx={s.x} cy={s.y} r="16" fill="rgba(59,130,246,0.3)" stroke="#3b82f6" strokeWidth="1.5" />
                )}
                <text
                    x={s.x}
                    y={s.y}
                    fontSize="18"
                    fontWeight="bold"
                    fill={canRotate ? '#93c5fd' : '#fff'}
                    stroke="#000"
                    strokeWidth="1"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents={canRotate ? 'auto' : 'none'}
                >
                  {labelText}
                </text>
              </g>
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
  SPACE_STATION: hivePng,
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
  const sizeScale = (buildingType === 'MINE' ? 4.8 * 1.2 : buildingType === 'GAIAFORMER' ? 4.8 / (1.3 * 1.5) * 1.25 : buildingType === 'SPACE_STATION' ? 4.8 * 0.55 : 4.8) * 0.85;
  const size = r * sizeScale;

  // 우주정거장: 필터 없이 원본 이미지
  if (buildingType === 'SPACE_STATION') {
    return (
      <g pointerEvents="none" opacity={opacity}>
        <image href={img} x={cx - size / 2} y={cy - size / 2 - 6} width={size} height={size} />
      </g>
    );
  }

  // 그레이스케일 후 플레이어 색상으로 tint (밝은 영역 → 플레이어 색)
  const hex = color.replace('#', '');
  const cr = parseInt(hex.slice(0, 2), 16) / 255;
  const cg = parseInt(hex.slice(2, 4), 16) / 255;
  const cb = parseInt(hex.slice(4, 6), 16) / 255;
  const isBright = buildingType === 'GAIAFORMER';
  const boost = isBright ? 3.5 : 2.5;
  const gamma = isBright ? 1.2 : 2.0;
  const filterId = `bf-${hex}-${isBright ? 'b' : 'n'}`;
  const m = (c: number) => `${0.299*c*boost} ${0.587*c*boost} ${0.114*c*boost} 0 0`;
  const matrix = `${m(cr)}  ${m(cg)}  ${m(cb)}  0 0 0 1 0`;

  return (
    <g pointerEvents="none" opacity={opacity}>
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          {/* 이미지 모양 따라 테두리 생성 */}
          <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="dilated" />
          <feFlood floodColor={borderColor} floodOpacity="1" result="colorFlood" />
          <feComposite in="colorFlood" in2="dilated" operator="in" result="outline" />
          {/* 이미지 colorize */}
          <feColorMatrix type="saturate" values="0" in="SourceGraphic" result="gray" />
          <feComponentTransfer in="gray" result="boosted">
            <feFuncR type="gamma" amplitude="1" exponent={gamma} offset="0" />
            <feFuncG type="gamma" amplitude="1" exponent={gamma} offset="0" />
            <feFuncB type="gamma" amplitude="1" exponent={gamma} offset="0" />
          </feComponentTransfer>
          <feColorMatrix type="matrix" values={matrix} in="boosted" result="colorized" />
          {/* 테두리 위에 colorize 이미지 합성 */}
          <feComposite in="colorized" in2="outline" operator="over" />
        </filter>
      </defs>
      <image
        href={img}
        x={cx - size / 2} y={cy - size / 2 - (buildingType === 'GAIAFORMER' ? -4 : 6)}
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
                   lantidsParasite,
                   lantidsParasiteColor,
                   lantidsParasiteBorderColor,
                 }: {
  hex: GameHex;
  building: any | undefined;
  buildingOwnerColor: string | null;
  buildingOwnerBorderColor: string | null;
  isClickable: boolean;
  onClick: (hex: GameHex) => void;
  isTentative?: boolean;
  lantidsParasite?: any;
  lantidsParasiteColor?: string | null;
  lantidsParasiteBorderColor?: string | null;
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

        {/* 검은행성 프리뷰/확정: Black_planet 이미지 + 플레이어 마커 */}
        {building && (building.buildingType === 'LOST_PLANET_MINE' || hex.planetType === 'BLACK_PLANET') ? (
          <g pointerEvents="none">
            <image
              href={blackPlanetPng}
              x={x - HEX_SIZE * 0.75}
              y={y - HEX_SIZE * 0.75}
              width={HEX_SIZE * 1.5}
              height={HEX_SIZE * 1.5}
              clipPath={`url(#${clipId})`}
            />
            <circle cx={x} cy={y} r={HEX_SIZE * 0.22}
              fill={buildingOwnerColor ?? '#ffffff'}
              stroke="white" strokeWidth="1.5"
              opacity={isTentative ? 0.6 : 1.0} />
          </g>
        ) : building && renderBuildingShape(
          x, y, building.buildingType,
          buildingOwnerColor ?? '#ffffff',
          isTentative,
          buildingOwnerBorderColor ?? '#ffffff',
        )}

        {/* 모웨이드 링: 초월행성 색상(시안) 원형 테두리 */}
        {building?.hasRing && (
          <circle cx={x} cy={y} r={HEX_SIZE * 0.55} fill="none"
            stroke="#ef4444" strokeWidth="4"
            opacity={0.9} pointerEvents="none" />
        )}

        {/* 란티다 기생 광산: 오른쪽 위에 1/3 크기 */}
        {lantidsParasite && (() => {
          const pr = HEX_SIZE * 0.38 * 0.55;
          const px = x + HEX_SIZE * 0.45;
          const py = y - HEX_SIZE * 0.45;
          const color = lantidsParasiteColor ?? '#ffffff';
          const border = lantidsParasiteBorderColor ?? '#ffffff';
          const img = BUILDING_IMAGES.MINE;
          const size = pr * 4.8 * 1.2;
          const hexC = color.replace('#', '');
          const cr = parseInt(hexC.slice(0, 2), 16) / 255;
          const cg = parseInt(hexC.slice(2, 4), 16) / 255;
          const cb = parseInt(hexC.slice(4, 6), 16) / 255;
          const filterId = `bf-lant-${hexC}`;
          const m = (c: number) => `${0.299*c*2.5} ${0.587*c*2.5} ${0.114*c*2.5} 0 0`;
          const matrix = `${m(cr)}  ${m(cg)}  ${m(cb)}  0 0 0 1 0`;
          return (
            <g pointerEvents="none">
              <defs>
                <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
                  <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="dilated" />
                  <feFlood floodColor={border} floodOpacity="1" result="colorFlood" />
                  <feComposite in="colorFlood" in2="dilated" operator="in" result="outline" />
                  <feColorMatrix type="saturate" values="0" in="SourceGraphic" result="gray" />
                  <feComponentTransfer in="gray" result="boosted">
                    <feFuncR type="gamma" amplitude="1" exponent="2.0" offset="0" />
                    <feFuncG type="gamma" amplitude="1" exponent="2.0" offset="0" />
                    <feFuncB type="gamma" amplitude="1" exponent="2.0" offset="0" />
                  </feComponentTransfer>
                  <feColorMatrix type="matrix" values={matrix} in="boosted" result="colorized" />
                  <feComposite in="colorized" in2="outline" operator="over" />
                </filter>
              </defs>
              <image href={img} x={px - size / 2} y={py - size / 2} width={size} height={size} filter={`url(#${filterId})`} />
            </g>
          );
        })()}
      </g>
  );
}

function HighlightHexOverlay() {
  const highlightHex = useGameStore(s => s.highlightHex);
  if (!highlightHex) return null;
  const { x, y } = axialToPixel(highlightHex.q, highlightHex.r);
  return (
    <polygon
      points={hexPoints(x, y)}
      fill="rgba(255,255,255,0.35)"
      stroke="#fff"
      strokeWidth={2}
      style={{ pointerEvents: 'none' }}
    >
      <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1s" repeatCount="indefinite" />
    </polygon>
  );
}

export default function HexMap({ roomId, playerStates = [], seats: seatsProp = [], onResultClick }: Props) {
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
    updateLastPendingActionPayload,
    completeFleetShipHexSelection,
    addTentativeBuilding,
    updatePreviewState,
    clearFleetShipMode,
    setHexes,
    federationMode,
    addFederationBuilding,
    removeFederationBuilding,
    addFederationToken,
    removeFederationToken,
    federationGroups,
    techTileData,
    selectingPassBooster,
    tentativeTechTileCode,
    tentativeCoverTileCode,
  } = useGameStore(useShallow(s => ({
    hexes: s.hexes, buildings: s.buildings, gamePhase: s.gamePhase,
    nextSetupSeatNo: s.nextSetupSeatNo, currentTurnSeatNo: s.currentTurnSeatNo,
    playerId: s.playerId, mySeatNo: s.mySeatNo, seats: s.seats,
    turnState: s.turnState, fleetProbes: s.fleetProbes, fleetShipMode: s.fleetShipMode,
    tinkeroidsExtraRingPlanet: s.tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet: s.moweidsExtraRingPlanet,
    addPendingAction: s.addPendingAction, updateLastPendingActionPayload: s.updateLastPendingActionPayload,
    completeFleetShipHexSelection: s.completeFleetShipHexSelection, addTentativeBuilding: s.addTentativeBuilding,
    updatePreviewState: s.updatePreviewState, clearFleetShipMode: s.clearFleetShipMode, setHexes: s.setHexes,
    federationMode: s.federationMode, addFederationBuilding: s.addFederationBuilding,
    removeFederationBuilding: s.removeFederationBuilding, addFederationToken: s.addFederationToken,
    removeFederationToken: s.removeFederationToken, federationGroups: s.federationGroups,
    techTileData: s.techTileData, selectingPassBooster: s.selectingPassBooster,
    tentativeTechTileCode: s.tentativeTechTileCode,
    tentativeCoverTileCode: s.tentativeCoverTileCode,
  })));

  const { hexes: localHexes, loading, error } = useHexes(roomId);
  // store에 hexes가 있으면 우선 사용 (ROUND_STARTED 시 갱신됨), 없으면 로컬 로딩 사용
  const hexes = storeHexes.length > 0 ? storeHexes : localHexes;

  // 섹터 회전 가능 여부: 4명 입장 후 비딩 시작 전(MAP_ROTATE 페이즈)에만 허용
  const canRotateSector = useMemo(() => {
    return gamePhase === 'MAP_ROTATE';
  }, [gamePhase]);

  const [rotating, setRotating] = useState(false);
  const handleRotateSector = useCallback(async (positionNo: number) => {
    if (rotating) return;
    setRotating(true);
    try {
      const res = await mapApi.rotateSector(roomId, positionNo);
      setHexes(res.data);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '섹터 회전 실패');
    } finally {
      setRotating(false);
    }
  }, [roomId, rotating, setHexes]);

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
    const allBuildings = [...buildings, ...turnState.tentativeBuildings];
    for (const b of allBuildings) {
      if (!b.isLantidsMine) m.set(`${b.hexQ},${b.hexR}`, b); // 메인 건물 우선
    }
    // 란티다 기생 광산은 메인이 없을 때만 (단독 기생은 메인으로)
    for (const b of allBuildings) {
      if (b.isLantidsMine && !m.has(`${b.hexQ},${b.hexR}`)) m.set(`${b.hexQ},${b.hexR}`, b);
    }
    return m;
  }, [buildings, turnState.tentativeBuildings]);

  // 란티다 기생 광산 별도 맵 (같은 좌표에 메인 건물이 있는 경우)
  const lantidsParasiteByCoord = useMemo(() => {
    const m = new Map<string, any>();
    const allBuildings = [...buildings, ...turnState.tentativeBuildings];
    for (const b of allBuildings) {
      if (b.isLantidsMine) m.set(`${b.hexQ},${b.hexR}`, b);
    }
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
        return '#000000';
      },
      [seatByPlayerId],
  );

  const isHexClickableLocal = useCallback(
      (hex: GameHex) => {
        return isHexClickableRules({
          hex, playerId, mySeatNo,
          mySeat: mySeat ? { raceCode: mySeat.raceCode, homePlanetType: mySeat.homePlanetType } : null,
          gamePhase, isMyTurn, buildingByCoord, buildings,
          tentativeBuildings: turnState.tentativeBuildings,
          pendingActions: turnState.pendingActions,
          previewPlayerState: turnState.previewPlayerState,
          playerStates, fleetShipMode, federationMode,
          fleetProbes, techTileData, lantidsParasiteByCoord,
          seats, tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet,
          tentativeTechTileCode,
        });
      },
      [isMyTurn, mySeat, playerId, buildingByCoord, buildings, turnState.pendingActions,
       turnState.previewPlayerState, turnState.tentativeBuildings, gamePhase, playerStates, mySeatNo, fleetProbes, fleetShipMode, federationMode, lantidsParasiteByCoord, tentativeTechTileCode],
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

        // 아카데미 서브타입 처리: ACADEMY_KNOWLEDGE / ACADEMY_QIC → toType=ACADEMY, academyType 추출
        let actualToType = toType;
        let academyType: string | undefined;
        if (toType === 'ACADEMY_KNOWLEDGE') { actualToType = 'ACADEMY'; academyType = 'KNOWLEDGE'; }
        else if (toType === 'ACADEMY_QIC') { actualToType = 'ACADEMY'; academyType = 'QIC'; }

        const leech = calcLeechInfo(hexQ, hexR, actualToType, allBuildings, playerStates, playerId, techTileData);

        const action: UpgradeBuildingAction = {
          id: `action-${Date.now()}-${Math.random()}`,
          type: 'UPGRADE_BUILDING',
          timestamp: Date.now(),
          payload: { hexQ, hexR, fromType, toType: actualToType, cost, leech, factionCode: mySeat?.raceCode ?? null, academyType },
        };
        addPendingAction(action);
        // 임시 건물 표시 (업그레이드된 타입으로)
        addTentativeBuilding({
          id: `temp-${Date.now()}`,
          gameId: roomId,
          playerId,
          hexQ,
          hexR,
          buildingType: actualToType,
        });
        setUpgradeChoiceHex(null);
      },
      [playerId, turnState.previewPlayerState, turnState.tentativeBuildings,
       playerStates, mySeatNo, buildings, addPendingAction, addTentativeBuilding, roomId],
  );

  /** 헥스 클릭 - 셋업 광산 / PLAYING 광산·업그레이드 / 연방 */
  const handleHexClick = useCallback(
      (hex: GameHex) => {
        if (!playerId || !mySeat) {
          // 연방 모드는 playerId 없어도 처리 가능
          if (federationMode) {
            handleHexClickRules(
              { hex, roomId, playerId: playerId!, mySeatNo: mySeatNo!, mySeat: mySeat as any, gamePhase, isMyTurn, buildingByCoord, buildings, hexes, turnState, playerStates, fleetShipMode, federationMode, fleetProbes, techTileData, lantidsParasiteByCoord, seats, upgradeChoiceHex, tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet, tentativeTechTileCode } as any,
              { addPendingAction, addTentativeBuilding, completeFleetShipHexSelection, addFederationBuilding, removeFederationBuilding, addFederationToken, removeFederationToken, addUpgradeAction, setUpgradeChoiceHex, updatePreviewState, axialToPixel },
            );
            return;
          }
          return;
        }
        handleHexClickRules(
          {
            hex, roomId, playerId, mySeatNo: mySeatNo!, mySeat: { raceCode: mySeat.raceCode, homePlanetType: mySeat.homePlanetType },
            gamePhase, isMyTurn, buildingByCoord, buildings, hexes, turnState, playerStates,
            fleetShipMode, federationMode, fleetProbes, techTileData, lantidsParasiteByCoord, seats, upgradeChoiceHex,
            tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet, tentativeTechTileCode,
          },
          {
            addPendingAction, addTentativeBuilding, completeFleetShipHexSelection,
            addFederationBuilding, removeFederationBuilding, addFederationToken, removeFederationToken,
            addUpgradeAction, setUpgradeChoiceHex, updatePreviewState, axialToPixel,
          },
        );
      },
      [isMyTurn, mySeat, playerId, buildingByCoord, buildings, roomId, gamePhase,
       turnState.previewPlayerState, turnState.pendingActions, turnState.tentativeBuildings,
       playerStates, mySeatNo, addPendingAction, completeFleetShipHexSelection, addTentativeBuilding, addUpgradeAction, fleetProbes,
       fleetShipMode, upgradeChoiceHex, federationMode,
       addFederationBuilding, removeFederationBuilding, addFederationToken, removeFederationToken],
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
      <div className="bg-gray-900 rounded-lg p-1 pb-4 relative h-full flex flex-col overflow-hidden" style={{ containerType: 'inline-size' }}>
        <VpPanel playerStates={playerStates} seatBySeatNo={seatBySeatNo} />
        {/* 결과 버튼 + 포머 소각 패널 - 우하단 수직 스택 */}
        <div className="absolute z-10 flex flex-col items-end" style={{ bottom: '1cqw', right: '0.5cqw', gap: '0.4cqw' }}>
          {onResultClick && (
            <button
              onClick={onResultClick}
              style={{ fontSize: '1.1cqw', padding: '0.2cqw 0.6cqw', borderRadius: '0.3cqw' }}
              className="bg-yellow-600/80 hover:bg-yellow-500/80 text-white font-bold transition"
            >결과</button>
          )}
          <RemovedPomerPanel playerStates={playerStates} seatBySeatNo={seatBySeatNo} />
        </div>

        {(() => {
            // 맵 회전 페이즈 (4명 입장 후, 비딩 전)
            if (gamePhase === 'MAP_ROTATE') {
              return (
                <div className="flex justify-center">
                  <div className="w-[70%] rounded text-center font-semibold bg-yellow-600 text-black flex flex-col items-center gap-1" style={{ padding: '0.4cqw', fontSize: '1.6cqw' }}>
                    <span>중복된 행성을 확인하고 섹터 중앙 번호를 선택하여 맵을 회전시켜주세요.</span>
                    <button
                      onClick={async () => {
                        try {
                          const res = await roomApi.startBidding(roomId);
                          if (!res.data.success) alert(res.data.message ?? '비딩 시작 실패');
                        } catch (e: any) {
                          alert(e?.response?.data?.message ?? '비딩 시작 실패');
                        }
                      }}
                      className="bg-green-700 hover:bg-green-600 text-white font-bold rounded border-2 border-black"
                      style={{ fontSize: '1.6cqw', padding: '0.2cqw 1cqw', marginTop: '0.3cqw' }}
                    >
                      비딩 시작
                    </button>
                  </div>
                </div>
              );
            }
            // 대기 상태 / 비딩 진행 중
            if (!mySeatNo && (gamePhase === null || gamePhase === 'BIDDING' || gamePhase === 'BID_SEAT_PICK') && seats.some(s => s.playerId === null)) {
              const isBidding = gamePhase === 'BIDDING' || gamePhase === 'BID_SEAT_PICK';
              const pCount = useGameStore.getState().participantCount || 1;
              const msg = isBidding ? '비딩을 진행중입니다.' : `플레이어 입장을 대기중입니다. (현재${pCount})`;
              return <div className="flex justify-center"><div className="w-[60%] rounded text-center font-semibold bg-yellow-600 text-black" style={{ padding: '0.3cqw', fontSize: '2cqw' }}>{msg}</div></div>;
            }
            if (!isMyTurn) return null;

            // 패스 부스터 선택 중 메시지
            if (selectingPassBooster && !turnState.tentativeBooster) {
              return (
                <div className="flex justify-center">
                  <div className="w-[60%] rounded text-center font-semibold bg-amber-600 text-black" style={{ padding: '0.3cqw', fontSize: '2cqw' }}>
                    패스 — 다음 라운드 부스터를 선택해 주세요
                  </div>
                </div>
              );
            }
            if (selectingPassBooster && turnState.tentativeBooster) {
              return (
                <div className="flex justify-center">
                  <div className="w-[60%] rounded text-center font-semibold bg-amber-600 text-black" style={{ padding: '0.3cqw', fontSize: '2cqw' }}>
                    다음 라운드 부스터 선택 완료 — 확정을 눌러주세요
                  </div>
                </div>
              );
            }

            const pending = turnState.pendingActions;
            const { tentativeTechTileCode, tentativeTechTrackCode, federationMode: fedMode } = useGameStore.getState();
            const bannerAnalysis = analyzePending(pending, fleetShipMode, tentativeTechTileCode, gamePhase, tentativeTechTrackCode);
            let message = bannerAnalysis.bannerMessage;
            let hasAction = bannerAnalysis.hasPending || bannerAnalysis.needsFleetHex;
            // 연방 모드 배너 (이미 연방 타일을 선택 완료한 경우 스킵 → pendingAnalyzer 메시지 사용)
            // 단, PLACE_SPECIAL_MINE(3삽/무한거리 광산)은 fedMode 배너 유지
            const hasFedPending = pending.some(a => a.type === 'FORM_FEDERATION');
            const isSpecialMinePhase = fedMode?.phase === 'PLACE_SPECIAL_MINE';
            if (fedMode && (!hasFedPending || isSpecialMinePhase)) {
              hasAction = true;
              const fedStore = useGameStore.getState();
              let fedButtons: React.ReactNode = null;
              if (fedMode.phase === 'SELECT_BUILDINGS') {
                const count = fedMode.selectedBuildings?.length ?? 0;
                message = `건물 선택: ${count}개`;
                fedButtons = <>
                  <button onClick={async () => {
                    if (!fedMode || !playerId) return;
                    try {
                      const res = await roomApi.validateFederationBuildings(roomId, playerId, fedMode.selectedBuildings);
                      if (!res.data.success) { alert(res.data.message ?? '건물 선택 조건 미충족'); return; }
                      useGameStore.setState((s) => ({
                        federationMode: s.federationMode ? { ...s.federationMode, phase: 'PLACE_TOKENS' as const, minTokens: res.data.minTokens ?? 0 } : null,
                      }));
                    } catch (e: any) { alert(e?.response?.data?.message ?? e?.message ?? '검증 오류'); }
                  }} className="bg-blue-600 hover:bg-blue-500 border-2 border-black px-2 py-0.5 rounded font-bold" style={{ fontSize: '1.5cqw' }}>확정</button>
                  <button onClick={() => fedStore.setFederationMode(null)} className="bg-red-600 hover:bg-red-500 border-2 border-black px-2 py-0.5 rounded font-bold" style={{ fontSize: '1.5cqw' }}>취소</button>
                </>;
              } else if (fedMode.phase === 'PLACE_TOKENS') {
                const placed = fedMode.placedTokens?.length ?? 0;
                const minTk = fedMode.minTokens ?? 0;
                const myPs = playerStates.find(p => p.seatNo === mySeatNo);
                const totalTokens = myPs ? myPs.powerBowl1 + myPs.powerBowl2 + myPs.powerBowl3 : 0;
                message = `토큰 배치: ${placed}개 (최소: ${minTk} / 보유: ${totalTokens})`;
                fedButtons = <>
                  <button onClick={async () => {
                    if (!fedMode || !playerId) return;
                    try {
                      const res = await roomApi.validateFederation(roomId, playerId, fedMode.placedTokens, fedMode.selectedBuildings);
                      if (!res.data.success) { alert(res.data.message ?? '연방 조건 미충족'); return; }
                      fedStore.setFederationPhase('SELECT_TILE');
                    } catch (e: any) { alert(e?.response?.data?.message ?? '검증 오류'); }
                  }} className="bg-blue-600 hover:bg-blue-500 border-2 border-black px-2 py-0.5 rounded font-bold" style={{ fontSize: '1.5cqw' }}>확정</button>
                  <button onClick={() => fedStore.setFederationMode(null)} className="bg-red-600 hover:bg-red-500 border-2 border-black px-2 py-0.5 rounded font-bold" style={{ fontSize: '1.5cqw' }}>취소</button>
                </>;
              } else if (fedMode.phase === 'SELECT_TILE') {
                message = '연방 타일을 선택하세요.';
              } else if (fedMode.phase === 'PLACE_SPECIAL_MINE') {
                const is3tf = fedMode.specialTileCode === 'FED_EXP_TILE_5';
                message = is3tf ? '(3테라포밍, 광산비용 무료) 광산을 건설해주세요.' : '(거리 제한 없음, 광산비용 무료) 광산을 건설해주세요.';
              }
              return (
                <div className="flex justify-center">
                  <div className="w-[60%] bg-emerald-600 text-white rounded font-semibold flex items-center gap-2 px-2" style={{ padding: '0.3cqw', fontSize: '2cqw' }}>
                    <span className="flex-1 text-center">{message}</span>
                    <div className="flex gap-1 flex-shrink-0">{fedButtons}</div>
                  </div>
                </div>
              );
            }
            return (
              <div className="flex justify-center">
                <div className={`w-[60%] rounded text-center font-semibold ${hasAction ? 'bg-emerald-600 text-white' : 'bg-yellow-600 text-black'}`} style={{ padding: '0.3cqw', fontSize: '2cqw' }}>
                  {message}
                </div>
              </div>
            );
        })()}


        <svg
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            className="w-full"
            style={{ flex: '1 1 0', minHeight: 0 }}
        >
          {/* 즉시 포밍 여부: BOOSTER_12 또는 TF Mars GAIAFORM 액션 pending 시만 GAIA 미리보기 */}
          {(() => {
            const isInstantGaiaform = turnState.pendingActions.some(a =>
              (a.type === 'BOOSTER_ACTION' && a.payload.actionType === 'PLACE_GAIAFORMER') ||
              (a.type === 'FLEET_SHIP_ACTION' && (a.payload.actionCode as string)?.includes('GAIAFORM'))
            );
            return hexes.map((hex) => {
            const building = buildingByCoord.get(`${hex.hexQ},${hex.hexR}`);
            const clickable = isHexClickableLocal(hex);
            const isTentative = building ? turnState.tentativeBuildings.some(
              tb => tb.hexQ === building.hexQ && tb.hexR === building.hexR
            ) : false;
            // 즉시포밍 액션 pending 중에만 임시 GAIAFORMER → GAIA 미리보기 표시
            const displayHex = (isTentative && building?.buildingType === 'GAIAFORMER' && hex.planetType === 'TRANSDIM' && isInstantGaiaform)
              ? { ...hex, planetType: 'GAIA' }
              : hex;

            // 연방 모드 하이라이트
            const isFedSelected = federationMode?.selectedBuildings?.some(h => h[0] === hex.hexQ && h[1] === hex.hexR);
            const isFedToken = federationMode?.placedTokens?.some(h => h[0] === hex.hexQ && h[1] === hex.hexR);

            // 확정된 연방 표시
            const fedGroup = federationGroups.find(g =>
              g.buildingHexes.some(h => h[0] === hex.hexQ && h[1] === hex.hexR) ||
              g.tokenHexes.some(h => h[0] === hex.hexQ && h[1] === hex.hexR)
            );
            const isFedBuilding = fedGroup?.buildingHexes.some(h => h[0] === hex.hexQ && h[1] === hex.hexR);
            const isFedTokenPlaced = fedGroup?.tokenHexes.some(h => h[0] === hex.hexQ && h[1] === hex.hexR);
            const fedOwnerPlanet = fedGroup ? (seatByPlayerId.get(fedGroup.playerId) as any)?.homePlanetType : null;
            const fedOwnerColor = fedGroup ? (fedOwnerPlanet === 'TITANIUM' ? '#a855f7' : (fedOwnerPlanet ? PLANET_COLORS[fedOwnerPlanet] : '#888')) : null;

            return (
                <g key={`${hex.hexQ},${hex.hexR}`}>
                  <HexTile
                      hex={displayHex}
                      building={building}
                      buildingOwnerColor={building ? getBuildingOwnerColor(building) : null}
                      buildingOwnerBorderColor={building ? getBuildingOwnerBorderColor(building) : null}
                      isClickable={clickable}
                      onClick={handleHexClick}
                      isTentative={isTentative}
                      lantidsParasite={lantidsParasiteByCoord.get(`${hex.hexQ},${hex.hexR}`)}
                      lantidsParasiteColor={lantidsParasiteByCoord.has(`${hex.hexQ},${hex.hexR}`) ? getBuildingOwnerColor(lantidsParasiteByCoord.get(`${hex.hexQ},${hex.hexR}`)) : null}
                      lantidsParasiteBorderColor={lantidsParasiteByCoord.has(`${hex.hexQ},${hex.hexR}`) ? getBuildingOwnerBorderColor(lantidsParasiteByCoord.get(`${hex.hexQ},${hex.hexR}`)) : null}
                  />
                  {/* 확정된 연방 토큰 위치: 플레이어 색 작은 원 */}
                  {isFedTokenPlaced && fedOwnerColor && (() => {
                    const { x, y } = axialToPixel(hex.hexQ, hex.hexR);
                    return (
                      <g pointerEvents="none">
                        <circle cx={x} cy={y} r={HEX_SIZE * 0.25} fill={fedOwnerColor} stroke={fedOwnerColor} strokeWidth="1.5" opacity={0.7} />
                      </g>
                    );
                  })()}
                  {/* 연방 건물 선택 표시 */}
                  {isFedSelected && (() => {
                    const { x, y } = axialToPixel(hex.hexQ, hex.hexR);
                    return <circle cx={x} cy={y} r={HEX_SIZE * 0.7} fill="none" stroke="#f97316" strokeWidth="3" strokeDasharray="4,2" opacity={0.8} pointerEvents="none" />;
                  })()}
                  {/* 배치 중 토큰 표시 */}
                  {isFedToken && (() => {
                    const { x, y } = axialToPixel(hex.hexQ, hex.hexR);
                    const ivitsMode = mySeat?.raceCode === 'IVITS';
                    return (
                      <g pointerEvents="none">
                        <circle cx={x} cy={y} r={HEX_SIZE * 0.3} fill={ivitsMode ? '#06b6d4' : '#a855f7'} stroke="#fff" strokeWidth="1.5" opacity={0.8} />
                        <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="8" fontWeight="bold">{ivitsMode ? 'Q' : 'P'}</text>
                      </g>
                    );
                  })()}
                </g>
            );
          });
          })()}

          {/* 연방 그룹 외곽선 */}
          {federationGroups.map((group, gi) => {
            const allFedHexes = new Set<string>();
            group.buildingHexes.forEach(h => allFedHexes.add(h[0] + ',' + h[1]));
            group.tokenHexes.forEach(h => allFedHexes.add(h[0] + ',' + h[1]));
            if (allFedHexes.size === 0) return null;

            const ownerSeat = seatByPlayerId.get(group.playerId);
            const ownerPlanet = (ownerSeat as any)?.homePlanetType;
            const color = ownerSeat ? (ownerPlanet === 'TITANIUM' ? '#a855f7' : PLANET_COLORS[ownerPlanet] || '#888') : '#888';

            // flat-top 헥스 6방향: 이웃 좌표 + 외곽 변 (꼭짓점 인덱스)
            const dirs = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
            const edges: string[] = [];

            allFedHexes.forEach(key => {
              const [q, r] = key.split(',').map(Number);
              const { x: cx, y: cy } = axialToPixel(q, r);

              for (let i = 0; i < 6; i++) {
                const nq = q + dirs[i][0];
                const nr = r + dirs[i][1];
                if (!allFedHexes.has(nq + ',' + nr)) {
                  // 이 변은 외곽 → 꼭짓점 i와 i+1을 잇는 선분
                  const angle1 = (60 * i) * Math.PI / 180;
                  const angle2 = (60 * (i + 1)) * Math.PI / 180;
                  const s = HEX_SIZE * 0.95;
                  const x1 = cx + s * Math.cos(angle1);
                  const y1 = cy + s * Math.sin(angle1);
                  const x2 = cx + s * Math.cos(angle2);
                  const y2 = cy + s * Math.sin(angle2);
                  edges.push(`M${x1},${y1}L${x2},${y2}`);
                }
              }
            });

            if (edges.length === 0) return null;
            return (
              <path key={`fed-border-${gi}`} d={edges.join(' ')} fill="none"
                stroke={color} strokeWidth="6" opacity={0.7} pointerEvents="none" />
            );
          })}

          <SectorLabels
              sectorLabels={sectorLabels}
              sectorLabelTextByPositionNo={sectorLabelTextByPositionNo}
              canRotate={canRotateSector}
              onRotate={handleRotateSector}
          />

          {/* 업그레이드 선택 패널 - 건물 오른쪽에 냉장고 형태로 표시 */}
          {/* 업그레이드 팝업 바깥 클릭 시 닫기 */}
          {upgradeChoiceHex && (
            <rect x="-9999" y="-9999" width="99999" height="99999" fill="transparent"
              onClick={() => setUpgradeChoiceHex(null)} style={{ cursor: 'default' }} />
          )}
          {upgradeChoiceHex && playerId && (() => {
            const allBuildings = [...buildings, ...turnState.tentativeBuildings];
            const myState = turnState.previewPlayerState || playerStates.find(p => p.seatNo === mySeatNo);
            const leechText = (leech: LeechInfo[]) =>
              leech.length === 0 ? '' : `리치: ${leech.map(l => `${l.seatNo}번 +${l.power}pw(-${l.vpCost}VP)`).join(' ')}`;
            const panelW = 210;
            const px = upgradeChoiceHex.px + HEX_SIZE * 1.2;

            const isBescods = mySeat?.raceCode === 'BESCODS';
            const isBalTaks = mySeat?.raceCode === 'BAL_TAKS';

            // TRADING_STATION → RESEARCH_LAB / PLANETARY_INSTITUTE (+ ACADEMY for BESCODS)
            if (upgradeChoiceHex.fromType === 'TRADING_STATION') {
              // 매안: 교역소→PI 불가
              const canPIBescods = !isBescods;
              const costRL = calcUpgradeCost(upgradeChoiceHex.fromType, 'RESEARCH_LAB', upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, allBuildings, playerId);
              const costPI = calcUpgradeCost(upgradeChoiceHex.fromType, 'PLANETARY_INSTITUTE', upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, allBuildings, playerId);
              const canRL = (!myState || ResourceCalculator.canAfford(myState, costRL)) && (myState?.stockResearchLab ?? 1) > 0;
              const canPI = canPIBescods && (!myState || ResourceCalculator.canAfford(myState, costPI)) && (myState?.stockPlanetaryInstitute ?? 1) > 0;
              const leechResLab = calcLeechInfo(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, 'RESEARCH_LAB', allBuildings, playerStates, playerId, techTileData);
              const leechPI = calcLeechInfo(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, 'PLANETARY_INSTITUTE', allBuildings, playerStates, playerId, techTileData);

              // 매안: 교역소→아카데미 추가
              const costAcademy = isBescods ? calcUpgradeCost(upgradeChoiceHex.fromType, 'ACADEMY', upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, allBuildings, playerId) : null;
              const myAcademies = isBescods ? allBuildings.filter(b => b.playerId === playerId && b.buildingType === 'ACADEMY') : [];
              const hasKnowledgeAcademy = myAcademies.some(b => (b as any).academyType === 'KNOWLEDGE');
              const hasQicAcademy = myAcademies.some(b => (b as any).academyType === 'QIC');
              const canAcademyK = isBescods && costAcademy && (!myState || ResourceCalculator.canAfford(myState, costAcademy)) && (myState?.stockAcademy ?? 1) > 0 && !hasKnowledgeAcademy;
              const canAcademyQ = isBescods && costAcademy && (!myState || ResourceCalculator.canAfford(myState, costAcademy)) && (myState?.stockAcademy ?? 1) > 0 && !hasQicAcademy;

              const panelH = isBescods ? 300 : 195;
              const py = upgradeChoiceHex.py - panelH / 2;
              return (
                <foreignObject x={px} y={py} width={panelW} height={panelH}>
                  <div style={{ width: panelW, height: panelH, fontFamily: 'sans-serif' }}
                    className="flex flex-col rounded-lg overflow-hidden border-2 border-yellow-500 shadow-xl">
                    <div className="bg-yellow-600 text-black text-[15px] font-bold text-center py-1.5 px-1.5">업그레이드 선택</div>
                    <button onClick={() => canRL && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'RESEARCH_LAB')}
                      disabled={!canRL}
                      className={`flex-1 flex flex-col items-center justify-center border-b border-yellow-500 px-1.5 ${canRL ? 'bg-blue-800 hover:bg-blue-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}>
                      <span className="text-white text-[15px] font-bold">연구소</span>
                      <span className="text-blue-200 text-[13px]">5c · 3o</span>
                      {leechResLab.length > 0 && <span className="text-yellow-300 text-[12px] mt-0.5 text-center leading-tight">{leechText(leechResLab)}</span>}
                    </button>
                    {!isBescods && (
                      <button onClick={() => canPI && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'PLANETARY_INSTITUTE')}
                        disabled={!canPI}
                        className={`flex-1 flex flex-col items-center justify-center border-b border-yellow-500 px-1.5 ${canPI ? 'bg-purple-800 hover:bg-purple-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}>
                        <span className="text-white text-[15px] font-bold">행성 의회</span>
                        <span className="text-purple-200 text-[13px]">6c · 4o</span>
                        {leechPI.length > 0 && <span className="text-yellow-300 text-[12px] mt-0.5 text-center leading-tight">{leechText(leechPI)}</span>}
                      </button>
                    )}
                    {isBescods && (
                      <>
                        <button onClick={() => canAcademyK && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'ACADEMY_KNOWLEDGE')}
                          disabled={!canAcademyK}
                          className={`flex-1 flex flex-col items-center justify-center border-b border-yellow-500 px-1.5 ${canAcademyK ? 'bg-green-800 hover:bg-green-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}>
                          <span className="text-white text-[15px] font-bold">아카데미 (2지식 수입)</span>
                          <span className="text-green-200 text-[13px]">6c · 6o</span>
                        </button>
                        <button onClick={() => canAcademyQ && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'ACADEMY_QIC')}
                          disabled={!canAcademyQ}
                          className={`flex-1 flex flex-col items-center justify-center border-b border-yellow-500 px-1.5 ${canAcademyQ ? 'bg-cyan-800 hover:bg-cyan-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}>
                          <span className="text-white text-[15px] font-bold">아카데미 (1QIC 액션)</span>
                          <span className="text-cyan-200 text-[13px]">6c · 6o</span>
                        </button>
                      </>
                    )}
                    <button onClick={() => setUpgradeChoiceHex(null)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-[13px] text-center py-1.5 cursor-pointer">취소</button>
                  </div>
                </foreignObject>
              );
            }

            // RESEARCH_LAB → ACADEMY (일반) / PI (매안)
            if (upgradeChoiceHex.fromType === 'RESEARCH_LAB') {
              // 매안: 연구소→PI만 가능
              if (isBescods) {
                const costPI2 = calcUpgradeCost(upgradeChoiceHex.fromType, 'PLANETARY_INSTITUTE', upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, allBuildings, playerId);
                const canPI2 = (!myState || ResourceCalculator.canAfford(myState, costPI2)) && (myState?.stockPlanetaryInstitute ?? 1) > 0;
                const leechPI2 = calcLeechInfo(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, 'PLANETARY_INSTITUTE', allBuildings, playerStates, playerId, techTileData);
                const panelH2 = 120;
                const py2 = upgradeChoiceHex.py - panelH2 / 2;
                return (
                  <foreignObject x={px} y={py2} width={panelW} height={panelH2}>
                    <div style={{ width: panelW, height: panelH2, fontFamily: 'sans-serif' }}
                      className="flex flex-col rounded-lg overflow-hidden border-2 border-yellow-500 shadow-xl">
                      <div className="bg-yellow-600 text-black text-[15px] font-bold text-center py-1.5 px-1.5">업그레이드</div>
                      <button onClick={() => canPI2 && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'PLANETARY_INSTITUTE')}
                        disabled={!canPI2}
                        className={`flex-1 flex flex-col items-center justify-center border-b border-yellow-500 px-1.5 ${canPI2 ? 'bg-purple-800 hover:bg-purple-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}>
                        <span className="text-white text-[15px] font-bold">행성 의회</span>
                        <span className="text-purple-200 text-[13px]">6c · 4o</span>
                        {leechPI2.length > 0 && <span className="text-yellow-300 text-[12px] mt-0.5 text-center leading-tight">{leechText(leechPI2)}</span>}
                      </button>
                      <button onClick={() => setUpgradeChoiceHex(null)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-[13px] text-center py-1.5 cursor-pointer">취소</button>
                    </div>
                  </foreignObject>
                );
              }
              const costAcademy = calcUpgradeCost(upgradeChoiceHex.fromType, 'ACADEMY', upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, allBuildings, playerId);
              const canAffordAcademy = !myState || ResourceCalculator.canAfford(myState, costAcademy);
              const hasStock = (myState?.stockAcademy ?? 1) > 0;
              // 이미 지은 아카데미 종류 확인 (같은 종류 2번 불가)
              const myAcademies = allBuildings.filter(b => b.playerId === playerId && b.buildingType === 'ACADEMY');
              const hasKnowledgeAcademy = myAcademies.some(b => (b as any).academyType === 'KNOWLEDGE');
              const hasQicAcademy = myAcademies.some(b => (b as any).academyType === 'QIC');
              const canKnowledge = canAffordAcademy && hasStock && !hasKnowledgeAcademy;
              const canQic = canAffordAcademy && hasStock && !hasQicAcademy;
              const leechAcademy = calcLeechInfo(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, 'ACADEMY', allBuildings, playerStates, playerId, techTileData);
              const panelH = 210;
              const py = upgradeChoiceHex.py - panelH / 2;
              const isItars = mySeat?.raceCode === 'ITARS';
              return (
                <foreignObject x={px} y={py} width={panelW} height={panelH}>
                  <div style={{ width: panelW, height: panelH, fontFamily: 'sans-serif' }}
                    className="flex flex-col rounded-lg overflow-hidden border-2 border-yellow-500 shadow-xl">
                    <div className="bg-yellow-600 text-black text-[15px] font-bold text-center py-1.5 px-1.5">아카데미 선택 (6c · 6o)</div>
                    <button onClick={() => canKnowledge && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'ACADEMY_KNOWLEDGE')}
                      disabled={!canKnowledge}
                      className={`flex-1 flex items-center justify-center gap-2 border-b border-yellow-500 px-1.5 ${canKnowledge ? 'bg-indigo-800 hover:bg-indigo-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}>
                      <img src={knowledgePng} alt="지식" className="w-7 h-7" />
                      <div className="flex flex-col items-start">
                        <span className="text-white text-[15px] font-bold">아카데미</span>
                        <span className="text-green-200 text-[13px]">{isItars ? '3' : '2'}지식 수입</span>
                      </div>
                    </button>
                    <button onClick={() => canQic && addUpgradeAction(upgradeChoiceHex.hexQ, upgradeChoiceHex.hexR, upgradeChoiceHex.fromType, 'ACADEMY_QIC')}
                      disabled={!canQic}
                      className={`flex-1 flex items-center justify-center gap-2 border-b border-yellow-500 px-1.5 ${canQic ? 'bg-green-800 hover:bg-green-600 cursor-pointer' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}>
                      <img src={isBalTaks ? creditImg : qicPng} alt={isBalTaks ? '돈' : 'QIC'} className="w-7 h-7" />
                      <div className="flex flex-col items-start">
                        <span className="text-white text-[15px] font-bold">아카데미</span>
                        <span className="text-indigo-200 text-[13px]">{isBalTaks ? '4돈 획득 액션' : 'QIC 획득 액션'}</span>
                      </div>
                    </button>
                    <button onClick={() => setUpgradeChoiceHex(null)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-[13px] text-center py-1.5 cursor-pointer">취소</button>
                  </div>
                </foreignObject>
              );
            }

            return null;
          })()}
          {/* 액션 로그 호버 하이라이트 */}
          <HighlightHexOverlay />
        </svg>

        <ActionLogPanel />
        <BiddingOverlay playerStates={playerStates} />
        <Legend seats={seatsProp} />
      </div>
  );
}