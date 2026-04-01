import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import type { SeatView, PlayerStateResponse, BoosterOfferResponse } from '../api/client';
import { roomApi } from '../api/client';
import { useGameStore, FEDERATION_TILE_REWARD } from '../store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage.ts';
import { ADV_TECH_TILE_IMAGE_MAP } from '../constants/advTechTileImage.ts';
import { FEDERATION_TOKEN_IMAGE_MAP } from '../constants/federationTokenImage';
import { ARTIFACT_IMAGE_MAP } from '../constants/artifactImage';
import { BOOSTER_IMAGE_MAP } from '../constants/boosterImage';
import type { TechTileActionAction, FactionAbilityAction, BoosterAction } from '../types/turnActions';
import { BOOSTER_ACTION_DEFS } from '../actions/actionRegistry';
import { PLANET_COLORS } from '../constants/colors';
import { navLevelToRange } from '../utils/navigationCalculator';
import { getOrePerStep } from '../utils/terraformingCalculator';
import { calcIncome } from '../utils/incomeCalculator';
import creditImg from '../assets/resource/Credit.png';
import oreImg from '../assets/resource/Ore.png';
import knowledgeImg from '../assets/resource/Knowledge.png';
import qicImg from '../assets/resource/QIC.png';
import pomerImg from '../assets/resource/Pomer.png';
import powerImg from '../assets/resource/Power.png';
import distanceImg from '../assets/resource/Distance.png';
import terraformImg from '../assets/resource/Terraforming.png';
import mineImg from '../assets/building/Mine.png';
import tradingStationImg from '../assets/building/TradingStation.png';
import researchLabImg from '../assets/building/Research.png';
import academyImg from '../assets/building/Academy.png';
import planetaryInstituteImg from '../assets/building/PlanetaryInstitute.png';
import closeImg from '../assets/resource/Close.png';

/** HexMap과 동일한 방식으로 건물 이미지를 플레이어 색으로 colorize */
function ColorizedBuilding({ src, color, size = 24, bright = false }: { src: string; color: string; size?: number | string; bright?: boolean }) {
  const hex = color.replace('#', '');
  const cr = parseInt(hex.slice(0, 2), 16) / 255;
  const cg = parseInt(hex.slice(2, 4), 16) / 255;
  const cb = parseInt(hex.slice(4, 6), 16) / 255;
  const boost = bright ? 3.5 : 2.5;
  const gamma = bright ? 1.2 : 2.0;
  const filterId = `bfi-${hex}-${bright ? 'b' : 'n'}`;
  const m = (c: number) => `${0.299*c*boost} ${0.587*c*boost} ${0.114*c*boost} 0 0`;
  const matrix = `${m(cr)}  ${m(cg)}  ${m(cb)}  0 0 0 1 0`;
  return (
    <svg width={size} height={size} style={{ display: 'inline-block', flexShrink: 0 }}>
      <defs>
        <filter id={filterId}>
          <feColorMatrix type="saturate" values="0" in="SourceGraphic" result="gray" />
          <feComponentTransfer in="gray" result="boosted">
            <feFuncR type="gamma" amplitude="1" exponent={gamma} offset="0" />
            <feFuncG type="gamma" amplitude="1" exponent={gamma} offset="0" />
            <feFuncB type="gamma" amplitude="1" exponent={gamma} offset="0" />
          </feComponentTransfer>
          <feColorMatrix type="matrix" values={matrix} in="boosted" />
        </filter>
      </defs>
      <image href={src} x="0" y="0" width={size} height={size} filter={`url(#${filterId})`} />
    </svg>
  );
}

// 시작 자원 (트랙 1 즉시 보상 포함)
// TERRA1: +2ore, NAV1: +1qic, AI1: +1qic, GAIA1: +1gaiaformer(자원아님), ECON1: +2c+1파순, SCI1: 없음
const FACTION_RESOURCES: Record<string, { credit: number; ore: number; knowledge: number; qic: number; power1: number; power2: number; power3: number }> = {
  TERRANS:       { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },           // +가이아1 (gaiaformer, 자원변동없음)
  LANTIDS:       { credit: 13, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  HADSCH_HALLAS: { credit: 17, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 3, power3: 1 },           // +경제1 (+2c, 1파순: p2→p3)
  IVITS:         { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  TAKLONS:       { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  AMBAS:         { credit: 15, ore: 4, knowledge: 3, qic: 2, power1: 4, power2: 4, power3: 0 },           // +거리1 (+1qic)
  GEODENS:       { credit: 15, ore: 6, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },           // +테라1 (+2ore)
  BAL_TAKS:      { credit: 15, ore: 4, knowledge: 3, qic: 0, power1: 4, power2: 4, power3: 0 },           // +가이아1 (gaiaformer, 자원변동없음)
  GLEENS:        { credit: 15, ore: 5, knowledge: 3, qic: 0, power1: 4, power2: 4, power3: 0 },           // +거리1 (+1qic→글린 아카데미전 ore 변환 = ore+1)
  XENOS:         { credit: 15, ore: 4, knowledge: 3, qic: 2, power1: 4, power2: 4, power3: 0 },           // +AI1 (+1qic)
  FIRAKS:        { credit: 15, ore: 3, knowledge: 2, qic: 1, power1: 4, power2: 4, power3: 0 },
  BESCODS:       { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  ITARS:         { credit: 15, ore: 5, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  NEVLAS:        { credit: 15, ore: 4, knowledge: 2, qic: 1, power1: 4, power2: 4, power3: 0 },           // +지식1 (즉시보상 없음)
  TINKEROIDS:    { credit: 15, ore: 4, knowledge: 2, qic: 1, power1: 4, power2: 4, power3: 0 },           // +지식1 (즉시보상 없음)
  DAKANIANS:     { credit: 17, ore: 7, knowledge: 3, qic: 2, power1: 4, power2: 3, power3: 1 },           // +거리1(+1qic) +경제1(+2c, 1파순)
  MOWEIDS:       { credit: 15, ore: 6, knowledge: 6, qic: 2, power1: 4, power2: 4, power3: 0 },           // +가이아1 (gaiaformer, 자원변동없음)
  SPACE_GIANTS:  { credit: 15, ore: 6, knowledge: 3, qic: 2, power1: 4, power2: 4, power3: 0 },           // +거리1 (+1qic)
};

const DEFAULT_RESOURCES = { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 };

// SVG 호(arc) 경로 생성
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

interface Props {
  seats: SeatView[];
  mySeatNo: number | null;
  playerId: string | null;
  currentTurnSeatNo?: number | null;
  specialPhaseSeatNo?: number | null;
  playerStates?: PlayerStateResponse[];
  boosters?: BoosterOfferResponse[];
  onClaimSeat: (seatNo: number) => void;
  isMyTurn?: boolean;
  gamePhase?: string | null;
  onBurnPower?: () => void;
  roomId?: string;
  onFactionAbilityDone?: () => void;
}

export default function SeatSelector({ seats, mySeatNo, playerId, currentTurnSeatNo, specialPhaseSeatNo, playerStates = [], boosters = [], onClaimSeat, isMyTurn = false, gamePhase, onBurnPower, roomId, onFactionAbilityDone }: Props) {
  const { turnState, tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet, economyTrackOption, addFreeConvert, techTileData, addPendingAction, leechBatch, federationGroups, gameArtifacts, passedSeatNos, powerIncomeChoice, fleetShipMode, setFleetShipMode, clearPendingActions, setTentativeFedTokenCode, setFederationMode } = useGameStore(useShallow(s => ({
    turnState: s.turnState, tinkeroidsExtraRingPlanet: s.tinkeroidsExtraRingPlanet,
    moweidsExtraRingPlanet: s.moweidsExtraRingPlanet, economyTrackOption: s.economyTrackOption,
    addFreeConvert: s.addFreeConvert, techTileData: s.techTileData, addPendingAction: s.addPendingAction,
    leechBatch: s.leechBatch, federationGroups: s.federationGroups, gameArtifacts: s.gameArtifacts,
    passedSeatNos: s.passedSeatNos, powerIncomeChoice: s.powerIncomeChoice, fleetShipMode: s.fleetShipMode,
    setFleetShipMode: s.setFleetShipMode, clearPendingActions: s.clearPendingActions,
    setTentativeFedTokenCode: s.setTentativeFedTokenCode, setFederationMode: s.setFederationMode,
  })));
  const [abilityLoading, setAbilityLoading] = useState(false);
  const [powerConvertSeatNo, setPowerConvertSeatNo] = useState<number | null>(null);
  const [hoveredSeatNo, setHoveredSeatNo] = useState<number | null>(null);
  const svgRefs = useRef<Record<number, HTMLElement | null>>({});
  const { previewPlayerState } = turnState;

  // 내 턴이 아니면 자원 교환창 자동 닫기
  useEffect(() => {
    if (!isMyTurn && powerConvertSeatNo !== null) {
      setPowerConvertSeatNo(null);
    }
  }, [isMyTurn, powerConvertSeatNo]);

  const getPlayerState = (seatNo: number): PlayerStateResponse | undefined => {
    const playerState = playerStates.find((p) => p.seatNo === seatNo);
    // Use preview state if it's the current player's turn
    const isMyOwnSeat = seatNo === mySeatNo;
    return isMyOwnSeat && previewPlayerState ? previewPlayerState : playerState;
  };

  // 정렬: PLAYING 중이면 turnOrder 순 (패스 안 한 사람 위, 패스한 사람 아래), 그 외 seatNo 순
  const sortedSeats = [...seats].sort((a, b) => {
    if (gamePhase !== 'PLAYING') return a.seatNo - b.seatNo;
    const aPass = passedSeatNos.indexOf(a.seatNo);
    const bPass = passedSeatNos.indexOf(b.seatNo);
    const aPassed = aPass >= 0;
    const bPassed = bPass >= 0;
    // 둘 다 미패스 → turnOrder 순 (같으면 seatNo)
    if (!aPassed && !bPassed) return (a.turnOrder || a.seatNo) - (b.turnOrder || b.seatNo);
    // 패스한 사람은 아래로
    if (!aPassed && bPassed) return -1;
    if (aPassed && !bPassed) return 1;
    // 둘 다 패스 → 패스 순서대로
    return aPass - bPass;
  });

  return (
    <div className="flex flex-col gap-1">
      {sortedSeats.map((seat) => {
        const isMyOwnSeat = seat.playerId === playerId;
        const isTaken = seat.playerId !== null;
        const canSelect = false; // 비딩 시스템으로 좌석 선택
        const isCurrentTurn = currentTurnSeatNo === seat.seatNo;
        const isSpecialPhaseTurn = specialPhaseSeatNo === seat.seatNo && !isCurrentTurn;
        const isLeechDecider = leechBatch != null && seat.playerId != null && (
          leechBatch.deciderIds?.includes(seat.playerId) || leechBatch.currentDeciderId === seat.playerId
        );
        const playerState = getPlayerState(seat.seatNo);
        const planetColor = PLANET_COLORS[seat.homePlanetType] || '#666';

        // 이 플레이어의 부스터 코드
        const myBooster = boosters.find(b => b.pickedBySeatNo === seat.seatNo);
        const boosterCode = myBooster?.boosterCode ?? null;

        const fallback = FACTION_RESOURCES[seat.raceCode] || DEFAULT_RESOURCES;
        const resources = playerState ? {
          credit: playerState.credit,
          ore: playerState.ore,
          knowledge: playerState.knowledge,
          qic: playerState.qic,
          power1: playerState.powerBowl1,
          power2: playerState.powerBowl2,
          power3: playerState.powerBowl3,
          gaia: playerState.gaiaPower || 0,
          brainstoneBowl: playerState.brainstoneBowl,
          vp: playerState.victoryPoints,
          // 지식 트랙 (API에서 가져와야 함)
          techTerraforming: playerState.techTerraforming || 0,
          techNavigation: playerState.techNavigation || 0,
          techAi: playerState.techAi || 0,
          techGaia: playerState.techGaia || 0,
          techEconomy: playerState.techEconomy || 0,
          techScience: playerState.techScience || 0,
          // 거리, 테라포밍 비용 (기술 트랙에서 계산)
          navigationRange: navLevelToRange(playerState.techNavigation)
            + (techTileData?.basicTiles.some(t => t.tileCode === 'BASIC_EXP_TILE_1' && (t.ownerPlayerIds ?? []).includes(seat.playerId!)) ? 1 : 0),
          terraformCost: getOrePerStep(playerState.techTerraforming),
          stockGaiaformer: playerState.stockGaiaformer || 0,
        } : {
          ...fallback,
          gaia: 0,
          brainstoneBowl: null as number | null,
          vp: 10,
          techTerraforming: 0,
          techNavigation: 0,
          techAi: 0,
          techGaia: 0,
          techEconomy: 0,
          techScience: 0,
          navigationRange: navLevelToRange(0),
          terraformCost: getOrePerStep(0),
          stockGaiaformer: 0,
        };

        // 지식트랙 배열
        const techTracks = [
          resources.techTerraforming,
          resources.techNavigation,
          resources.techAi,
          resources.techGaia,
          resources.techEconomy,
          resources.techScience,
        ];

        return (
          <div
            key={seat.seatNo}
            data-seat={seat.seatNo}
            onMouseEnter={() => setHoveredSeatNo(seat.seatNo)}
            onMouseLeave={() => setHoveredSeatNo(null)}
            onTouchStart={() => setHoveredSeatNo(prev => prev === seat.seatNo ? null : seat.seatNo)}
            className={`relative game-panel ${
              isCurrentTurn ? 'ring-2 ring-emerald-400/70 !border-emerald-500/30' : ''
            } ${
              isSpecialPhaseTurn ? 'ring-2 ring-blue-400/70 !border-blue-500/30' : ''
            } ${
              isLeechDecider ? 'ring-2 ring-purple-400/70 !border-purple-500/30' : ''
            } ${
              powerIncomeChoice?.players.some(p => p.playerId === seat.playerId) ? 'ring-2 ring-purple-400/70 !border-purple-500/30' : ''
            }`}
          >
            {/* 메인 영역 */}
            <div className="flex items-center p-1.5">
              {/* 중앙: 원형 초상화 + 파워볼 구역 */}
              <div className="relative" ref={(el) => { svgRefs.current[seat.seatNo] = el; }}>
                <svg viewBox="0 0 100 100" className="w-[4.8vw] h-[4.8vw] min-w-[40px] min-h-[40px] max-w-[96px] max-h-[96px]">
                  {/* 배경 원 */}
                  <circle cx="50" cy="50" r="48" fill="#0d0d1a" />

                  {/* 파워볼 구역들 (호 형태) - 더 굵게 */}
                  {/* Bowl 1: 6시(180도) ~ 10시(300도) - 어두운 보라 */}
                  <path
                    d={describeArc(50, 50, 38, 180, 300)}
                    fill="none"
                    stroke="#581c87"
                    strokeWidth="14"
                  />
                  {/* Bowl 1 숫자 - 8시 방향 */}
                  <text x="19" y="75" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
                    {resources.power1}
                  </text>

                  {/* Bowl 2: 10시(300도) ~ 1시(30도) - 중간 보라 */}
                  {(() => {
                    const bowl2WithBrain = resources.power2 + (resources.brainstoneBowl === 2 ? 1 : 0);
                    const canBurn = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && bowl2WithBrain >= 2;
                    return (
                      <g onClick={() => canBurn && onBurnPower?.()} style={{ cursor: canBurn ? 'pointer' : 'default' }}>
                        <path d={describeArc(50, 50, 38, 300, 390)} fill="none" stroke="#7c3aed" strokeWidth="14" />
                        <text x="40" y="18" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
                          {resources.power2}
                        </text>
                      </g>
                    );
                  })()}

                  {/* Bowl 3: 1시(30도) ~ 4시(110도) - 밝은 핑크 — 클릭 시 파워 교환 팝업 */}
                  {(() => {
                    const canClick3 = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING';
                    return (
                      <g onClick={() => canClick3 && setPowerConvertSeatNo(prev => prev === seat.seatNo ? null : seat.seatNo)}
                         style={{ cursor: canClick3 ? 'pointer' : 'default' }}>
                        <path d={describeArc(50, 50, 38, 30, 110)} fill="none" stroke="#ec4899" strokeWidth="14" />
                        <text x="84" y="40" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
                          {resources.power3}
                        </text>
                      </g>
                    );
                  })()}

                  {/* 가이아 구역: 5시~6시 방향 (130도 ~ 180도) - 초록 */}
                  <path
                    d={describeArc(50, 50, 38, 130, 180)}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="14"
                  />
                  {/* 가이아 숫자 - 5시 방향 */}
                  <text x="65" y="90" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
                    {resources.gaia}
                  </text>

                  {/* 타클론 브레인스톤 표시 */}
                  {resources.brainstoneBowl != null && (() => {
                    // 브레인스톤이 위치한 볼/가이아 옆에 골든 마커 표시
                    const pos = resources.brainstoneBowl === 0
                      ? { x: 80, y: 90 }  // 가이아 구역 옆
                      : resources.brainstoneBowl === 1
                      ? { x: 8, y: 60 }   // Bowl 1 옆
                      : resources.brainstoneBowl === 2
                      ? { x: 27, y: 10 }  // Bowl 2 옆
                      : { x: 92, y: 28 }; // Bowl 3 옆
                    return (
                      <g>
                        <circle cx={pos.x} cy={pos.y} r="6" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1" />
                        <text x={pos.x} y={pos.y + 3.5} textAnchor="middle" fill="#000" fontSize="8" fontWeight="bold">B</text>
                      </g>
                    );
                  })()}

                  {/* 내부 원 (캐릭터 영역) - 클릭으로 좌석 선택 */}
                  <g
                    onClick={() => canSelect && onClaimSeat(seat.seatNo)}
                    style={{ cursor: canSelect ? 'pointer' : 'default' }}
                  >
                    <circle
                      cx="50" cy="50" r="24"
                      fill={canSelect ? '#2a2a5f' : '#1e1e3f'}
                      stroke={canSelect ? '#facc15' : planetColor}
                      strokeWidth={canSelect ? 4 : 3}
                    />
                    {/* 게임 시작 전: 좌석 번호, 게임 시작 후: VP */}
                    <text x="50" y={playerState ? 53 : 56} textAnchor="middle" fill={canSelect ? '#facc15' : 'white'} fontSize={playerState ? 12 : 18} fontWeight="bold">
                      {playerState ? `${(isMyOwnSeat && previewPlayerState?.victoryPoints != null) ? previewPlayerState.victoryPoints : playerState.victoryPoints}vp` : seat.seatNo}
                    </text>
                  </g>
                </svg>

              </div>
              {/* 파워 교환 팝업 — game-panel(relative) 기준 absolute */}
              {powerConvertSeatNo === seat.seatNo && playerState && (() => {
                const pw = previewPlayerState?.powerBowl3 ?? playerState.powerBowl3 ?? 0;
                const oreVal = previewPlayerState?.ore ?? playerState.ore ?? 0;
                const kVal = previewPlayerState?.knowledge ?? playerState.knowledge ?? 0;
                const qicVal = previewPlayerState?.qic ?? playerState.qic ?? 0;
                const isNevlasPi = seat.raceCode === 'NEVLAS' && playerState.stockPlanetaryInstitute === 0;
                const isTaklonsBrain3 = seat.raceCode === 'TAKLONS' && (previewPlayerState?.brainstoneBowl ?? playerState.brainstoneBowl) === 3;
                const effectivePw = (isNevlasPi ? pw * 2 : pw) + (isTaklonsBrain3 ? 3 : 0);

                const handleConvert = (code: string, costPower: number) => {
                  if (isTaklonsBrain3 && costPower > 0) {
                    // 브레인스톤 없이 일반 토큰만으로 가능한지
                    const normalPw = isNevlasPi ? pw * 2 : pw;
                    const canWithout = normalPw >= costPower;
                    if (!canWithout) {
                      // 일반만으론 불가 → 브레인스톤 자동 사용
                      addFreeConvert(code + '_BRAIN');
                      return;
                    }
                    // 일반으로도 가능 → 선택
                    if (confirm('브레인스톤을 사용하시겠습니까?')) {
                      addFreeConvert(code + '_BRAIN');
                      return;
                    }
                  }
                  addFreeConvert(code);
                };

                const gfVal = previewPlayerState?.stockGaiaformer ?? playerState.stockGaiaformer ?? 0;
                const rows: { code: string; costPw: number; costOre?: number; costK?: number; costQic?: number; costGaiaformer?: number; label: React.ReactNode }[] = [];

                // 네블라 종족 능력: 3구역 파워 1 → 지식 1 (맨 위)
                if (seat.raceCode === 'NEVLAS') {
                  rows.push(
                    { code: 'NEVLAS_POWER3_TO_GAIA_KNOWLEDGE', costPw: 1, label: <><img src={powerImg} className="w-3.5 h-3.5 inline"/>1 → <img src={knowledgeImg} className="w-3.5 h-3.5 inline"/>1</> },
                  );
                }

                rows.push(
                  { code: 'POWER_TO_CREDIT', costPw: 1, label: <><img src={powerImg} className="w-3.5 h-3.5 inline"/>{isNevlasPi ? '2' : '1'} → <img src={creditImg} className="w-3.5 h-3.5 inline"/>{isNevlasPi ? '2' : '1'}</> },
                  { code: 'POWER_TO_ORE', costPw: 3, label: <><img src={powerImg} className="w-3.5 h-3.5 inline"/>{isNevlasPi ? '4' : '3'} → <img src={oreImg} className="w-3.5 h-3.5 inline"/>1</> },
                  { code: 'POWER_TO_QIC', costPw: 4, label: <><img src={powerImg} className="w-3.5 h-3.5 inline"/>{isNevlasPi ? '4' : '4'} → <img src={qicImg} className="w-3.5 h-3.5 inline"/>1</> },
                  { code: 'POWER_TO_KNOWLEDGE', costPw: 4, label: <><img src={powerImg} className="w-3.5 h-3.5 inline"/>{isNevlasPi ? '4' : '4'} → <img src={knowledgeImg} className="w-3.5 h-3.5 inline"/>1</> },
                );

                // 네블라 PI 추가 옵션
                if (isNevlasPi) {
                  // 돈 교환을 2→2로 교체 (이미 위에서 처리)
                  rows.push(
                    { code: 'NEVLAS_4P_ORE_CREDIT', costPw: 4, label: <><img src={powerImg} className="w-3.5 h-3.5 inline"/>4 → <img src={creditImg} className="w-3.5 h-3.5 inline"/>1<img src={oreImg} className="w-3.5 h-3.5 inline"/>1</> },
                    { code: 'NEVLAS_6P_ORE2', costPw: 6, label: <><img src={powerImg} className="w-3.5 h-3.5 inline"/>6 → <img src={oreImg} className="w-3.5 h-3.5 inline"/>2</> },
                  );
                }

                // QIC → 광석
                rows.push(
                  { code: 'QIC_TO_ORE', costPw: 0, costQic: 1, label: <><img src={qicImg} className="w-3.5 h-3.5 inline"/>1 → <img src={oreImg} className="w-3.5 h-3.5 inline"/>1</> },
                );

                // 광석/지식 교환
                rows.push(
                  { code: 'ORE_TO_CREDIT', costPw: 0, costOre: 1, label: <><img src={oreImg} className="w-3.5 h-3.5 inline"/>1 → <img src={creditImg} className="w-3.5 h-3.5 inline"/>1</> },
                  { code: 'ORE_TO_TOKEN', costPw: 0, costOre: 1, label: <><img src={oreImg} className="w-3.5 h-3.5 inline"/>1 → <img src={powerImg} className="w-3.5 h-3.5 inline"/>토큰1</> },
                  { code: 'KNOWLEDGE_TO_CREDIT', costPw: 0, costK: 1, label: <><img src={knowledgeImg} className="w-3.5 h-3.5 inline"/>1 → <img src={creditImg} className="w-3.5 h-3.5 inline"/>1</> },
                );

                // 캐릭터 능력 교환 (맨 아래)
                if (seat.raceCode === 'BAL_TAKS') {
                  rows.push(
                    { code: 'BAL_TAKS_CONVERT_GAIAFORMER', costPw: 0, costGaiaformer: 1, label: <><img src={pomerImg} className="w-3.5 h-3.5 inline"/> → <img src={qicImg} className="w-3.5 h-3.5 inline"/>1</> },
                  );
                }

                return createPortal(
                  <>
                  <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setPowerConvertSeatNo(null)} />
                  <div
                    className="bg-gray-900/95 border border-purple-500/50 rounded-lg p-1.5 shadow-lg"
                    style={{ position: 'fixed', zIndex: 9999, width: 'max-content' }}
                    ref={(el) => {
                      if (!el) return;
                      const anchor = svgRefs.current[seat.seatNo];
                      if (!anchor) return;
                      const update = () => {
                        const rect = anchor.getBoundingClientRect();
                        el.style.left = `${rect.right + 4}px`;
                        el.style.top = `${rect.top + rect.height * 0.3}px`;
                      };
                      update();
                      const scrollParent = anchor.closest('.overflow-y-auto');
                      if (scrollParent) {
                        const handler = () => update();
                        scrollParent.addEventListener('scroll', handler);
                        // cleanup on unmount via MutationObserver trick
                        const obs = new MutationObserver(() => {
                          if (!el.isConnected) { scrollParent.removeEventListener('scroll', handler); obs.disconnect(); }
                        });
                        obs.observe(el.parentNode!, { childList: true });
                      }
                    }}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] text-purple-300 font-bold">자원 교환</span>
                      <button onClick={() => setPowerConvertSeatNo(null)} className="text-[9px] text-gray-400 hover:text-white ml-3">✕</button>
                    </div>
                    {rows.map((r) => {
                      const disabled = (r.costPw > 0 && effectivePw < r.costPw)
                        || (r.costOre && oreVal < r.costOre)
                        || (r.costK && kVal < r.costK)
                        || (r.costQic && qicVal < r.costQic)
                        || (r.costGaiaformer && gfVal < r.costGaiaformer);
                      return (
                        <button key={r.code} onClick={() => !disabled && handleConvert(r.code, r.costPw)}
                          disabled={!!disabled}
                          className={`w-full text-left px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 mb-0.5 transition-colors
                            ${disabled ? 'text-gray-600' : 'text-white hover:bg-purple-500/20 cursor-pointer'}`}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  </>,
                  document.body,
                );
              })()}

              {/* 오른쪽: 이름 + 자원/건물 통합 그리드 */}
              {(() => {
                // 보유 기술 타일 코드 (덮이지 않은 것만)
                const pid = seat.playerId?.toString() ?? '';
                const ownedTiles = techTileData
                  ? [
                      ...techTileData.basicTiles.filter(t => (t.ownerPlayerIds ?? []).some(id => id === pid) && !(t.coveredByMap ?? {})[pid]),
                      ...techTileData.advancedTiles.filter(t => t.takenByPlayerId === pid),
                    ].map(t => t.tileCode)
                  : [];
                const myArtifactCodes = gameArtifacts
                  .filter(a => a.acquiredByPlayerId === seat.playerId)
                  .map(a => a.artifactCode);
                // pending 인공물도 수입 프리뷰에 포함
                if (isMyOwnSeat) {
                  for (const act of turnState.pendingActions) {
                    if (act.type === 'FLEET_SHIP_ACTION' && (act.payload as any).actionCode === 'TWILIGHT_ARTIFACT' && (act.payload as any).artifactCode) {
                      myArtifactCodes.push((act.payload as any).artifactCode);
                    }
                  }
                }
                const effectivePs = (isMyOwnSeat && previewPlayerState) ? previewPlayerState : playerState;
                const income = effectivePs
                  ? calcIncome(effectivePs, seat.raceCode ?? null, boosterCode, economyTrackOption ?? null, ownedTiles, myArtifactCodes)
                  : null;
                const hasPassed = passedSeatNos.includes(seat.seatNo);
                // 패스 전: 부스터 수입 제외한 기본 수입만, 패스 후: 부스터 포함 전체 수입
                const incomeWithoutBooster = effectivePs
                  ? calcIncome(effectivePs, seat.raceCode ?? null, null, economyTrackOption ?? null, ownedTiles, myArtifactCodes)
                  : null;
                const displayIncome = hasPassed ? income : incomeWithoutBooster;
                const showIncome = gamePhase === 'PLAYING' && !!displayIncome;

                // 하쉬할라 PI: 자원 클릭으로 크레딧 변환 가능 여부
                const isHadschPi = seat.raceCode === 'HADSCH_HALLAS' && playerState && playerState.stockPlanetaryInstitute === 0;
                const canHadschConvert = isHadschPi && isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING';

                // 자원 셀: [아이콘][값] + [(+수입)] + 하쉬할라 클릭
                const ResCell = ({ icon, value, inc, incColor, convertCode, convertCost }: {
                  icon: string; value: number; inc?: number; incColor: string;
                  convertCode?: string; convertCost?: number;
                }) => {
                  const canClick = canHadschConvert && convertCode && convertCost && (playerState?.credit ?? 0) >= convertCost;
                  return (
                    <div
                      className={`flex items-center gap-0.5 ${canClick ? 'cursor-pointer hover:bg-yellow-500/20 rounded px-0.5 -mx-0.5' : ''}`}
                      onClick={canClick ? () => addFreeConvert(convertCode!) : undefined}
                      title={canClick ? `${convertCost}크레딧 → +1 (클릭)` : undefined}
                    >
                      <img src={icon} style={{ width: '1.1vw', height: '1.1vw', flexShrink: 0 }} />
                      <span className="text-white font-bold" style={{ fontSize: '0.78vw' }}>{value}</span>
                      {showIncome && inc !== undefined && (
                        <span className={`opacity-70 ${incColor}`} style={{ fontSize: '0.65vw' }}>+{inc}</span>
                      )}
                    </div>
                  );
                };

                // 건물 셀: [컬러 아이콘][재고수]
                const BldCell = ({ img, count }: { img: string; count: number }) => (
                  <div className={`flex items-center gap-0 ${count === 0 ? 'opacity-25' : ''}`}>
                    <ColorizedBuilding src={img} color={planetColor} size="1.5vw" />
                    <span className="text-white font-bold" style={{ fontSize: '0.72vw' }}>{count}</span>
                  </div>
                );

                return (
                  <div className="flex flex-col ml-1 flex-1 min-w-0">
                    {/* 이름 + 타이머 */}
                    <div className="mb-0.5 truncate flex items-center gap-1" style={{ fontSize: '0.72vw' }}>
                      <span style={{ color: planetColor }}>{seat.raceNameKo}</span>
                      {seat.nickname && <span className={isMyOwnSeat ? 'text-lime-400' : 'text-gray-300'}> {seat.nickname}</span>}
                      {isMyOwnSeat && <span className="text-yellow-400"> (나)</span>}
                      {(() => {
                        const passIdx = passedSeatNos.indexOf(seat.seatNo);
                        return passIdx >= 0 ? (
                          <span className="text-red-400 font-bold"> Pass({passIdx + 1})</span>
                        ) : null;
                      })()}
                      {/* 연방 선언 버튼 */}
                      {isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && !turnState.pendingActions.length && !useGameStore.getState().federationMode && (
                        <button
                          onClick={() => useGameStore.getState().setFederationMode({ selectedBuildings: [], placedTokens: [], phase: 'SELECT_BUILDINGS' })}
                          className="px-1.5 py-0.5 rounded text-yellow-300 border border-yellow-500 hover:bg-yellow-500/20 font-bold"
                          style={{ fontSize: '0.66vw', lineHeight: 1.2 }}
                        >연방 선언</button>
                      )}
                      {/* 누적 사용 시간 */}
                      {playerState && (
                        <PlayerTimer
                          baseSeconds={playerState.usedTimeSeconds ?? 0}
                          turnStartedAt={playerState.turnStartedAt}
                          isActive={gamePhase !== 'FINISHED' && (
                            leechBatch && leechBatch.deciderIds?.length > 0
                              ? isLeechDecider
                              : (currentTurnSeatNo === seat.seatNo || specialPhaseSeatNo === seat.seatNo)
                          )}
                        />
                      )}
                    </div>

                    {/* 행1: 돈 광 지식 QIC 파순 토추 */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0">
                      <ResCell icon={creditImg}    value={resources.credit}    inc={displayIncome?.credit}    incColor="text-yellow-300" />
                      <ResCell icon={oreImg}       value={resources.ore}       inc={displayIncome?.ore}       incColor="text-orange-300"
                        convertCode="HADSCH_HALLAS_3C_ORE" convertCost={3} />
                      <ResCell icon={knowledgeImg} value={resources.knowledge} inc={displayIncome?.knowledge} incColor="text-blue-300"
                        convertCode="HADSCH_HALLAS_4C_KNOWLEDGE" convertCost={4} />
                      <ResCell icon={qicImg}       value={resources.qic}       inc={displayIncome?.qic}       incColor="text-cyan-300"
                        convertCode="HADSCH_HALLAS_4C_QIC" convertCost={4} />
                      <div className="flex items-center gap-0.5">
                        <img src={powerImg} style={{ width: '1.1vw', height: '1.1vw', flexShrink: 0 }} />
                        <span className="text-purple-300 font-bold" style={{ fontSize: '0.78vw' }}>{displayIncome ? displayIncome.powerCharge : 0}↑</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <img src={powerImg} style={{ width: '1.1vw', height: '1.1vw', flexShrink: 0 }} />
                        <span className="text-pink-300 font-bold" style={{ fontSize: '0.78vw' }}>+{displayIncome ? displayIncome.powerToken : 0}</span>
                      </div>
                    </div>
                    {/* 행2: 건물 재고 쭉 */}
                    {playerState && (
                      <div className="flex gap-x-2">
                        <BldCell img={mineImg}                count={playerState.stockMine} />
                        <BldCell img={tradingStationImg}      count={playerState.stockTradingStation} />
                        <BldCell img={researchLabImg}         count={playerState.stockResearchLab} />
                        <BldCell img={academyImg}             count={playerState.stockAcademy} />
                        <BldCell img={planetaryInstituteImg}  count={playerState.stockPlanetaryInstitute} />
                      </div>
                    )}
                    {/* 행3: 포머 거리 삽 + 지식트랙 */}
                    {playerState && (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-x-2 pl-0.5">
                          <div className="flex items-center gap-0.5">
                            <ColorizedBuilding src={pomerImg} color={planetColor} size="1.1vw" bright />
                            <span className="text-green-300 font-bold" style={{ fontSize: '0.78vw' }}>{resources.stockGaiaformer}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <img src={distanceImg} style={{ width: '1.3vw', height: '1.3vw', flexShrink: 0 }} />
                            <span className="text-sky-300 font-bold" style={{ fontSize: '0.78vw' }}>{resources.navigationRange}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <img src={terraformImg} style={{ width: '1.3vw', height: '1.3vw', flexShrink: 0 }} />
                            <span className="text-amber-300 font-bold" style={{ fontSize: '0.78vw' }}>{resources.terraformCost}</span>
                          </div>
                          {seat.raceCode === 'TINKEROIDS' && tinkeroidsExtraRingPlanet && (
                            <img src={new URL(`../assets/planet/${tinkeroidsExtraRingPlanet}.png`, import.meta.url).href} alt={tinkeroidsExtraRingPlanet} style={{ width: '1.5vw', height: '1.5vw' }} className="object-contain" draggable={false} />
                          )}
                          {seat.raceCode === 'MOWEIDS' && moweidsExtraRingPlanet && (
                            <img src={new URL(`../assets/planet/${moweidsExtraRingPlanet}.png`, import.meta.url).href} alt={moweidsExtraRingPlanet} style={{ width: '1.5vw', height: '1.5vw' }} className="object-contain" draggable={false} />
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 pl-0.5">
                          {['#dc2626','#38bdf8','#22c55e','#a855f7','#ea580c','#3b82f6'].map((c, i) => (
                            <div key={i} className="rounded-full flex items-center justify-center font-bold border"
                              style={{ width: '1.375vw', height: '1.375vw', fontSize: '0.81vw', backgroundColor: '#1a1a2e', borderColor: c, color: c }}>
                              {techTracks[i]}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 팩션 능력 + 정큐 Qic + 라부 능력 — 가로 나열 */}
                    {(() => {
                      if (!playerState || !seat.raceCode || !roomId || gamePhase !== 'PLAYING') return null;
                      const factionCode = seat.raceCode;
                      const hasPi = playerState.stockPlanetaryInstitute === 0;
                      const canUseAbility = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING';
                      const pendingAbilityUsed = turnState.pendingActions.some(a => a.type === 'FACTION_ABILITY');
                      const used = playerState.factionAbilityUsed || pendingAbilityUsed;
                      const hasPendingAction = turnState.pendingActions.length > 0;

                      const callAbility = (abilityCode: string, extra?: { trackCode?: string; hexQ?: number; hexR?: number }) => {
                        if (!canUseAbility || abilityLoading) return;

                        // 모든 메인 액션 종족 능력: pendingAction에 추가 → 확정 시 BE 호출
                        addPendingAction({
                          id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                          payload: {
                            abilityCode,
                            ...(abilityCode === 'SPACE_GIANTS_TERRAFORM_2' ? { terraformDiscount: 2 } : {}),
                            ...(abilityCode === 'GLEENS_JUMP' ? { navBonus: 2 } : {}),
                            ...extra,
                          },
                        });
                      };

                      const AbilityBtn = ({ label, code, disabled, title, extra, conditionUnmet }: {
                        label: React.ReactNode; code: string; disabled: boolean; title: string;
                        extra?: { trackCode?: string; hexQ?: number; hexR?: number };
                        conditionUnmet?: boolean; // 미사용이지만 자원/조건 부족
                      }) => {
                        const isDisabled = !canUseAbility || disabled || abilityLoading || hasPendingAction;
                        const colorClass = used
                          ? 'border-red-500 text-red-400 opacity-60'
                          : 'border-green-500 text-green-300 hover:bg-green-500/20';
                        return (
                          <button
                            onClick={() => !isDisabled && callAbility(code, extra)}
                            disabled={isDisabled}
                            title={title}
                            className={`px-1.5 py-0.5 rounded font-bold border-2 transition-colors whitespace-nowrap ${colorClass}`}
                          >
                            {label}
                          </button>
                        );
                      };

                      const abilities: JSX.Element[] = [];

                      // 기본 능력 (PI 불필요)
                      if (factionCode === 'BAL_TAKS') {
                        // 발타크: 포머→QIC는 파워 교환 팝업에서 처리
                      } else if (factionCode === 'XENOS') {
                        // Xenos 광석→파워3은 이미 Bowl3 클릭으로 처리됨
                      } else if (factionCode === 'BESCODS') {
                        // 매드안드로이드: 버튼 1개 → pending 추가 → TechTracks에서 최저 트랙만 선택
                        const besDisabled = !canUseAbility || used || hasPendingAction;
                        abilities.push(
                          <button key="bes"
                            onClick={() => {
                              if (besDisabled) return;
                              addPendingAction({
                                id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                payload: { abilityCode: 'BESCODS_ADVANCE_LOWEST_TRACK' },
                              } as FactionAbilityAction);
                            }}
                            disabled={besDisabled}
                            title="최저 기술 트랙 1칸 전진 (라운드당 1회, 액션)"
                            className={`px-1.5 py-0.5 rounded font-bold border-2 transition-colors whitespace-nowrap
                              ${used
                                ? 'border-red-500 text-red-400 opacity-60'
                                : 'border-green-500 text-green-300 hover:bg-green-500/20'
                              }`}
                          >능력-트랙↑</button>
                        );
                      } else if (factionCode === 'SPACE_GIANTS') {
                        const sgNoMine = (playerState.stockMine ?? 0) <= 0;
                        const sgNoOre = (playerState.credit ?? 0) < 2 || (playerState.ore ?? 0) < 1;
                        abilities.push(<AbilityBtn key="sg" label={<>능력-<img src={terraformImg} alt="테라포밍" className="inline-block w-3 h-3 align-middle mx-0.5"/>2</>} code="SPACE_GIANTS_TERRAFORM_2"
                          disabled={used} conditionUnmet={!used && (sgNoMine || sgNoOre)} title="2단계 테라포밍 후 광산 건설 (라운드당 1회, 액션)" />);
                      } else if (factionCode === 'GLEENS') {
                        const glNoMine = (playerState.stockMine ?? 0) <= 0;
                        const glNoOre = (playerState.credit ?? 0) < 2 || (playerState.ore ?? 0) < 1;
                        abilities.push(<AbilityBtn key="gl" label={<>능력-<img src={distanceImg} alt="거리" className="inline-block w-3 h-3 align-middle mx-0.5"/>2</>} code="GLEENS_JUMP"
                          disabled={used} conditionUnmet={!used && (glNoMine || glNoOre)} title="2거리 이내 광산 건설 (라운드당 1회, 액션)" />);
                      }

                      // PI 능력
                      if (hasPi) {
                        if (factionCode === 'FIRAKS') {
                          // 파이락 PI: 선언형 - pending 추가 후 맵에서 연구소 선택 → 트랙 선택
                          const firakDisabled = !canUseAbility || used || hasPendingAction;
                          const hasRL = playerState.stockResearchLab < 3; // 연구소 1개 이상 건설됨
                          const firakColorClass = used
                            ? 'border-red-500 text-red-400 opacity-60'
                            : !hasRL
                              ? 'border-yellow-500 text-yellow-400 opacity-70'
                              : 'border-green-500 text-green-300 hover:bg-green-500/20';
                          abilities.push(
                            <button key="firaks"
                              onClick={() => {
                                if (firakDisabled || !hasRL) return;
                                addPendingAction({
                                  id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                  payload: { abilityCode: 'FIRAKS_DOWNGRADE' },
                                } as FactionAbilityAction);
                              }}
                              disabled={firakDisabled || !hasRL}
                              title="연구소→교역소 + 트랙 전진 (라운드당 1회)"
                              className={`px-1.5 py-0.5 rounded font-bold border-2 transition-colors whitespace-nowrap ${firakColorClass}`}
                            >능력-Down</button>
                          );
                        } else if (factionCode === 'AMBAS') {
                          abilities.push(<AbilityBtn key="ambas" label="능력-위치변경" code="AMBAS_SWAP"
                            disabled={used} title="광산과 의회 위치 교환 (라운드당 1회, 액션)" />);
                        } else if (factionCode === 'HADSCH_HALLAS') {
                          // 하쉬할라 PI: 자원 셀 클릭으로 처리 (아래 ResCell에서 직접 처리)
                        } else if (factionCode === 'GLEENS') {
                          // 글린 PI: 연방 토큰은 PI 건설 시 자동 지급 (별도 액션 버튼 없음)
                        } else if (factionCode === 'NEVLAS') {
                          // 네블라 PI: 프리 액션 교환창에서 처리 (별도 버튼 불필요)
                        } else if (factionCode === 'MOWEIDS') {
                          // 모웨이드 PI: 건물 선택 → 링 씌우기 (pendingAction으로 처리)
                          const mowNoPower = (playerState.powerBowl3 ?? 0) < 2;
                          abilities.push(<AbilityBtn key="mow-ring" label="능력-Ring(2pw)" code="MOWEIDS_RING"
                            disabled={used} conditionUnmet={!used && mowNoPower} title="본인 건물 선택하여 링 씌우기 (파워값 +2, 라운드당 1회)" />);
                        } else if (factionCode === 'TINKEROIDS') {
                          // 팅커로이드 PI: 현재 라운드 선택된 액션 사용 버튼
                          const tinkAction = (playerState as any).tinkeroidsCurrentAction as string | null;
                          if (tinkAction) {
                            const tinkIcon = (src: string, alt: string) => <img src={src} alt={alt} className="inline-block w-3 h-3 align-middle mx-0.5" />;
                            const tinkLabels: Record<string, React.ReactNode> = {
                              TINK_TERRAFORM_1: <>능력-{tinkIcon(terraformImg, '테라포밍')}1</>,
                              TINK_POWER_4: <>능력-{tinkIcon(powerImg, '파워')}↑</>,
                              TINK_QIC_1: <>능력-{tinkIcon(qicImg, 'QIC')}1</>,
                              TINK_TERRAFORM_3: <>능력-{tinkIcon(terraformImg, '테라포밍')}3</>,
                              TINK_KNOWLEDGE_3: <>능력-{tinkIcon(knowledgeImg, '지식')}3</>,
                              TINK_QIC_2: <>능력-{tinkIcon(qicImg, 'QIC')}2</>,
                            };
                            const isTerra = tinkAction === 'TINK_TERRAFORM_1' || tinkAction === 'TINK_TERRAFORM_3';
                            const discount = tinkAction === 'TINK_TERRAFORM_1' ? 1 : tinkAction === 'TINK_TERRAFORM_3' ? 3 : 0;
                            const tinkPendingUsed = turnState.pendingActions.some(
                              a => a.type === 'FACTION_ABILITY' && a.payload?.abilityCode === 'TINKEROIDS_USE_ACTION'
                            );
                            const tinkUsed = used || tinkPendingUsed;
                            const tinkDisabled = !canUseAbility || tinkUsed || hasPendingAction;

                            abilities.push(
                              <button key="tink-use"
                                onClick={() => {
                                  if (tinkDisabled) return;
                                  if (isTerra) {
                                    addPendingAction({
                                      id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                      payload: { abilityCode: 'TINKEROIDS_USE_ACTION', tinkAction, terraformDiscount: discount },
                                    } as FactionAbilityAction);
                                  } else {
                                    addPendingAction({
                                      id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                      payload: { abilityCode: 'TINKEROIDS_USE_ACTION', tinkAction },
                                    } as FactionAbilityAction);
                                  }
                                }}
                                disabled={tinkDisabled}
                                className={`px-1.5 py-0.5 rounded font-bold border-2 transition-colors whitespace-nowrap
                                  ${tinkUsed
                                    ? 'border-red-500 text-red-400 opacity-60'
                                    : 'border-green-500 text-green-300 hover:bg-green-500/20'
                                  }`}
                              >{tinkLabels[tinkAction] ?? tinkAction}</button>
                            );
                          }
                        } else if (factionCode === 'ITARS') {
                          // 아이타 PI: 라운드 종료 시 자동 다이얼로그로 처리 (수동 버튼 없음)
                        } else if (factionCode === 'IVITS') {
                          // 하이브: 선언형 - pending 추가 후 맵에서 빈 헥스 선택
                          const ivitsDisabled = !canUseAbility || used || abilityLoading || hasPendingAction;
                          abilities.push(
                            <button
                              key="ivits"
                              onClick={() => {
                                if (ivitsDisabled) return;
                                const action: FactionAbilityAction = {
                                  id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                  payload: { abilityCode: 'IVITS_PLACE_STATION' },
                                };
                                addPendingAction(action);
                              }}
                              disabled={ivitsDisabled}
                              title="빈 헥스에 우주정거장 배치 (라운드당 1회, 액션)"
                              className={`px-1.5 py-0.5 rounded font-bold border-2 transition-colors whitespace-nowrap
                                ${used
                                  ? 'border-red-500 text-red-400 opacity-60'
                                  : 'border-green-500 text-green-300 hover:bg-green-500/20'
                                }`}
                            >능력-우주정거장</button>
                          );
                        }
                      }

                      // abilities에 QIC 아카데미 추가 (프리뷰 상태 반영)
                      const effectiveHasQicAcademy = (isMyOwnSeat && previewPlayerState) ? previewPlayerState.hasQicAcademy : playerState.hasQicAcademy;
                      if (effectiveHasQicAcademy) {
                        const canUseQic = canUseAbility && !playerState.qicAcademyActionUsed && !hasPendingAction;
                        const qicUsed = playerState.qicAcademyActionUsed;
                        abilities.push(
                          <button key="qic-academy"
                            onClick={() => {
                              if (!canUseQic) return;
                              addPendingAction({
                                id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                payload: { abilityCode: 'QIC_ACADEMY_ACTION' },
                              });
                            }}
                            disabled={!canUseQic}
                            title={factionCode === 'BAL_TAKS' ? '아카데미: 크레딧 4 획득 (라운드당 1회)' : 'QIC 아카데미: QIC 1개 획득 (라운드당 1회)'}
                            className={`px-1.5 py-0.5 rounded font-bold border-2 transition-colors whitespace-nowrap
                              ${qicUsed
                                ? 'border-red-500 text-red-400 opacity-60'
                                : 'border-green-500 text-green-300 hover:bg-green-500/20'
                              }`}
                          >{factionCode === 'BAL_TAKS'
                            ? <>아카-<img src={creditImg} className="inline-block w-3 h-3 align-middle" />4</>
                            : <>아카-<img src={qicImg} className="inline-block w-3 h-3 align-middle" /></>
                          }</button>
                        );
                      }

                      // 라운드 부스터 액션: 호버 팝업에서 처리 (여기서는 제거)

                      const validButtons = abilities.filter(Boolean);
                      if (validButtons.length === 0) return null;

                      return (
                        <div className="flex flex-wrap gap-1 items-center" style={{ fontSize: '0.55vw' }}>
                          {validButtons}
                        </div>
                      );
                    })()}

                  </div>
                );
              })()}
            </div>

            {/* 호버 시 오른쪽 확장: 기술타일 / 인공물 / 연방토큰 */}
            {hoveredSeatNo === seat.seatNo && (() => {
              const seatEl = document.querySelector(`[data-seat="${seat.seatNo}"]`);
              const rect = seatEl?.getBoundingClientRect();
              const left = rect ? rect.right + 4 : 0;
              const seatTop = rect ? rect.top : 0;
              const seatBottom = rect ? rect.bottom : 0;
              const seatMid = (seatTop + seatBottom) / 2;
              return createPortal(<div
                ref={(el) => {
                  if (el) {
                    const ph = el.offsetHeight;
                    let t = seatMid - ph / 2;
                    t = Math.max(4, Math.min(t, window.innerHeight - ph - 4));
                    el.style.top = t + 'px';
                    el.style.left = left + 'px';
                  }
                }}
                onMouseEnter={() => setHoveredSeatNo(seat.seatNo)}
                onMouseLeave={() => setHoveredSeatNo(null)}
                className="fixed z-[9999] bg-gray-900/95 border border-gray-600 rounded-lg shadow-xl flex" style={{ top: seatTop, left }}>

            {/* 왼쪽: 라운드 부스터 (클릭으로 부스터 액션 사용) */}
            {(() => {
              const myBooster = boosters.find(b => b.pickedBySeatNo === seat.seatNo);
              const boosterImg = myBooster ? BOOSTER_IMAGE_MAP[myBooster.boosterCode] : null;
              if (!boosterImg) return null;
              const boosterDef = myBooster ? BOOSTER_ACTION_DEFS[myBooster.boosterCode] : null;
              const ps = getPlayerState(seat.seatNo);
              const boosterUsed = ps?.boosterActionUsed ?? false;
              const hasPending = turnState.pendingActions.length > 0;
              const canClick = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && boosterDef && !boosterUsed && !hasPending;
              const handleBoosterClick = canClick ? () => {
                addPendingAction({
                  id: `action-${Date.now()}-${Math.random()}`,
                  type: 'BOOSTER_ACTION',
                  timestamp: Date.now(),
                  payload: {
                    boosterCode: myBooster!.boosterCode,
                    actionType: boosterDef!.actionType,
                    terraformDiscount: boosterDef!.terraformDiscount,
                    navBonus: boosterDef!.navBonus,
                  },
                } as BoosterAction);
                setHoveredSeatNo(null);
              } : undefined;
              return (
                <div className={`relative flex-shrink-0 border-r border-gray-600 p-1 flex items-center ${canClick ? 'cursor-pointer hover:bg-green-900/30' : ''}`}
                  onClick={handleBoosterClick}
                  title={boosterDef ? (canClick ? '클릭하여 부스터 액션 사용' : boosterUsed ? '이미 사용됨' : boosterDef.label) : ''}>
                  <img src={boosterImg} alt={myBooster!.boosterCode} style={{ height: '9vw' }} className="w-auto object-contain" draggable={false} />
                  {boosterUsed && (
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-center bg-black/50 rounded-t transition-opacity hover:opacity-0" style={{ height: '45%' }}>
                      <img src={closeImg} style={{ width: '2.5vw', height: '2.5vw' }} className="object-contain" draggable={false} />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 오른쪽: 기술타일 / 인공물 / 연방토큰 */}
            <div className="p-2 flex flex-col gap-1 min-w-[140px]">

            {/* 기술 타일 */}
            {(() => {
              if (!techTileData) return null;
              const myPid = playerState?.playerId?.toString() ?? '';
              const tentTile = isMyOwnSeat ? useGameStore.getState().tentativeTechTileCode : null;
              const tentCoverTile = isMyOwnSeat ? useGameStore.getState().tentativeCoverTileCode : null;
              const tentIsAdv = tentTile != null && tentTile.startsWith('ADV_');

              // 기본 타일 목록 (덮힌 타일에는 coveredByCode 부착)
              const basicTiles = techTileData.basicTiles
                .filter(t => (t.ownerPlayerIds ?? []).includes(myPid))
                .map(t => {
                  // 확정된 커버: 서버에서 받은 coveredByMap
                  const confirmedCover = (t.coveredByMap ?? {})[myPid] ?? null;
                  // 프리뷰 커버: tentativeCoverTileCode와 매칭
                  const tentativeCover = (tentCoverTile === t.tileCode && tentIsAdv) ? tentTile : null;
                  const coveredByCode = confirmedCover ?? tentativeCover;
                  return { ...t, isAdv: false, isTentative: false, coveredByCode };
                });

              // 기본 타일 위에 겹친 고급 타일 코드 수집
              const coveredAdvCodes = new Set(basicTiles.map(t => t.coveredByCode).filter(Boolean));
              // 고급 타일 중 기본 타일을 덮지 않는 것만 별도 표시
              const standaloneAdvTiles = techTileData.advancedTiles
                .filter(t => t.takenByPlayerId === myPid && !coveredAdvCodes.has(t.tileCode))
                .map(t => ({ ...t, isAdv: true, isTentative: false, coveredByCode: null as string | null }));

              const allTiles = [...basicTiles, ...standaloneAdvTiles];

              // 프리뷰: 선택 중인 기본 타일 (기본 타일이면서 아직 소유 안 한 것)
              if (tentTile && !tentIsAdv && !allTiles.some(t => t.tileCode === tentTile)) {
                const match = techTileData.basicTiles.find(t => t.tileCode === tentTile);
                if (match) allTiles.push({ ...match, isAdv: false, isTentative: true, coveredByCode: null });
              }
              if (allTiles.length === 0) return null;

              const hasPendingAction = turnState.pendingActions.length > 0;

              return (
                <div className="flex flex-wrap gap-1 px-2 pb-1">
                  {allTiles.map((tile) => {
                    const imgSrc = tile.isAdv
                      ? ADV_TECH_TILE_IMAGE_MAP[tile.tileCode]
                      : TECH_TILE_IMAGE_MAP[tile.tileCode];
                    // 고급 타일이 덮고 있으면 고급 타일의 abilityType/actionUsed 사용
                    const coveredByCode = (tile as any).coveredByCode as string | null;
                    const coveringAdvTile = coveredByCode ? techTileData.advancedTiles.find(t => t.tileCode === coveredByCode) : null;
                    const effectiveTile = coveringAdvTile ?? tile;
                    const effectiveTileCode = coveringAdvTile ? coveringAdvTile.tileCode : tile.tileCode;
                    const isActionTile = effectiveTile.abilityType === 'ACTION';
                    // pending에 이 타일 사용 중이면 already used로 취급
                    const isPendingUsed = isMyOwnSeat && turnState.pendingActions.some(
                      a => a.type === 'TECH_TILE_ACTION' && a.payload.tileCode === effectiveTileCode
                    );
                    const myPidStr = seat.playerId?.toString() ?? '';
                    const isMyActionUsed = effectiveTile.actionUsedByPlayerIds?.includes(myPidStr) ?? effectiveTile.isActionUsed;
                    const isUsed = isMyActionUsed || isPendingUsed;
                    const canUse = isActionTile && !isUsed && isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && !hasPendingAction;
                    // 커버 프리뷰: 이 타일이 고급 타일에 의해 덮일 예정인지
                    const isCoverTarget = tentCoverTile === tile.tileCode;
                    // 커버 선택 모드: 고급 타일 선택 상태 + 기본 타일 + 본인 것
                    const tentTileCode = useGameStore.getState().tentativeTechTileCode;
                    const isAdvSelected = tentTileCode != null && tentTileCode.startsWith('ADV_');
                    const canCover = isAdvSelected && !tile.isAdv && isMyOwnSeat && !isCoverTarget && !(tile as any).isTentative;

                    const handleClick = () => {
                      if (canCover) {
                        useGameStore.getState().setTentativeCoverTile(isCoverTarget ? null : tile.tileCode);
                        return;
                      }
                      if (!canUse) return;
                      const action: TechTileActionAction = {
                        id: `action-${Date.now()}`,
                        type: 'TECH_TILE_ACTION',
                        timestamp: Date.now(),
                        payload: { tileCode: effectiveTileCode, description: effectiveTile.description },
                      };
                      addPendingAction(action);
                    };

                    return (
                      <div
                        key={tile.tileCode}
                        onClick={(canCover || canUse) ? handleClick : undefined}
                        className={`relative rounded ${(tile as any).isTentative ? 'ring-2 ring-yellow-400 ring-dashed opacity-70' : ''} ${isCoverTarget ? 'ring-2 ring-red-500 opacity-40' : ''} ${canCover && !isCoverTarget ? 'cursor-pointer ring-2 ring-purple-400 hover:brightness-125' : ''} ${canUse ? 'cursor-pointer ring-2 ring-green-400 hover:brightness-125' : ''}`}
                        title={isCoverTarget ? `[덮힘 예정] ${tile.description}` : canCover ? `클릭하여 덮을 타일 선택` : isActionTile ? `[액션] ${tile.description}${canUse ? ' — 클릭하여 사용' : isUsed ? ' (사용됨)' : ''}` : tile.description}
                      >
                        {imgSrc ? (
                          <img src={imgSrc} alt={tile.tileCode} style={{ height: '3.5vw' }} className="w-auto object-contain" draggable={false} />
                        ) : (
                          <span className="text-[7px] text-gray-300 px-1">{tile.tileCode}</span>
                        )}
                        {/* 고급 타일 겹침 표시 (덮힌 기본 타일 위에, 호버 시 고급 타일 숨김 → 기본 타일 보임) */}
                        {(tile as any).coveredByCode && (() => {
                          const advImg = ADV_TECH_TILE_IMAGE_MAP[(tile as any).coveredByCode];
                          return advImg ? (
                            <div className="absolute inset-0 flex items-center justify-center transition-opacity hover:opacity-0">
                              <img src={advImg} alt={(tile as any).coveredByCode} style={{ height: '3.5vw' }} className="w-auto object-contain" draggable={false} />
                            </div>
                          ) : null;
                        })()}
                        {/* 커버 선택 대기: 보라색 테두리만 (COVER 텍스트 제거) */}
                        {/* 사용된 ACTION 타일: Close 이미지 오버레이 (호버 시 투명하게) */}
                        {isActionTile && isUsed && !isCoverTarget && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded transition-opacity hover:opacity-0">
                            <img src={closeImg} style={{ width: '2vw', height: '2vw' }} className="object-contain" draggable={false} />
                          </div>
                        )}
                        {/* 미사용 ACTION 타일: A 뱃지 */}
                        {isActionTile && !isUsed && !isCoverTarget && (
                          <div className="absolute top-0 right-0 text-[7px] leading-none bg-green-700 text-white rounded-bl px-0.5">A</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* 획득한 인공물 */}
            {(() => {
              const myArtifacts = seat.playerId ? gameArtifacts.filter(a => a.acquiredByPlayerId === seat.playerId) : [];
              if (myArtifacts.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1 px-2 pb-1">
                  {myArtifacts.map((art, idx) => {
                    const imgSrc = ARTIFACT_IMAGE_MAP[art.artifactCode];
                    return (
                      <div key={`art-${idx}`} className="relative" title={art.artifactCode}>
                        {imgSrc ? (
                          <img src={imgSrc} alt={art.artifactCode}
                            style={{ height: '3vw' }} className="w-auto object-contain"
                            draggable={false} />
                        ) : (
                          <span className="text-[7px] text-purple-300 px-1">{art.artifactCode}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* 획득한 연방 토큰 */}
            {(() => {
              const myFedTokens = federationGroups
                .filter(g => g.playerId === seat.playerId)
                .map(g => ({ tileCode: g.tileCode, used: g.used ?? false }));
              // 5단계 진입 프리뷰: 첫 번째 미사용 토큰을 used로 표시
              if (isMyOwnSeat) {
                const TRACK_FIELDS: Record<string, string> = {
                  TERRA_FORMING: 'techTerraforming', NAVIGATION: 'techNavigation', AI: 'techAi',
                  GAIA_FORMING: 'techGaia', ECONOMY: 'techEconomy', SCIENCE: 'techScience',
                };
                // 원본 state 기준으로 4→5 진입 체크
                const origState = playerStates.find(p => p.seatNo === seat.seatNo);
                const has5Advance = turnState.pendingActions.some(a => {
                  if (a.type === 'ADVANCE_TECH') {
                    const field = TRACK_FIELDS[a.payload.trackCode];
                    return field && (origState as any)?.[field] === 4;
                  }
                  return false;
                });
                const tentTrack = useGameStore.getState().tentativeTechTrackCode;
                const hasTentative5 = tentTrack && TRACK_FIELDS[tentTrack] && (origState as any)?.[TRACK_FIELDS[tentTrack]] === 4;
                if (has5Advance || hasTentative5) {
                  const firstUnused = myFedTokens.findIndex(t => !t.used);
                  if (firstUnused >= 0) myFedTokens[firstUnused] = { ...myFedTokens[firstUnused], used: true };
                }
              }
              // 글린 PI 업그레이드 pending 시 가상 토큰 추가 (프리뷰)
              if (isMyOwnSeat && seat.raceCode === 'GLEENS' && turnState.pendingActions.some(
                a => a.type === 'UPGRADE_BUILDING' && (a.payload as any).toType === 'PLANETARY_INSTITUTE'
              )) {
                myFedTokens.push({ tileCode: 'GLEENS_FEDERATION', used: false });
              }
              // 연방 형성 pending 시 가상 토큰 추가
              const fedFormAction = isMyOwnSeat && turnState.pendingActions.find(a => a.type === 'FORM_FEDERATION');
              if (fedFormAction) {
                myFedTokens.push({ tileCode: (fedFormAction.payload as any).tileCode, used: false });
              }
              // 5단계 진입 프리뷰: 꼭대기 연방 토큰 획득 (개인판에 추가)
              if (isMyOwnSeat) {
                const TRACK_FIELDS2: Record<string, string> = {
                  TERRA_FORMING: 'techTerraforming', NAVIGATION: 'techNavigation', AI: 'techAi',
                  GAIA_FORMING: 'techGaia', ECONOMY: 'techEconomy', SCIENCE: 'techScience',
                };
                const origState2 = playerStates.find(p => p.seatNo === seat.seatNo);
                const has5AdvTerra = turnState.pendingActions.some(a => {
                  if (a.type === 'ADVANCE_TECH' && a.payload.trackCode === 'TERRA_FORMING') {
                    return (origState2 as any)?.techTerraforming === 4;
                  }
                  return false;
                });
                const tentTrack2 = useGameStore.getState().tentativeTechTrackCode;
                const hasTent5Terra = tentTrack2 === 'TERRA_FORMING' && (origState2 as any)?.techTerraforming === 4;
                if (has5AdvTerra || hasTent5Terra) {
                  const tfc = useGameStore.getState().terraFedTileCode;
                  if (tfc) myFedTokens.push({ tileCode: tfc, used: false });
                }
              }
              if (myFedTokens.length === 0) return null;
              const selectingFedToken = isMyOwnSeat && fleetShipMode?.needsFederationToken;
              return (
                <div className="flex flex-wrap gap-1 px-2 pb-1">
                  {selectingFedToken && (
                    <div className="w-full text-[8px] text-yellow-300 mb-0.5">연방 토큰을 선택하세요</div>
                  )}
                  {myFedTokens.map((token, idx) => {
                    const imgSrc = FEDERATION_TOKEN_IMAGE_MAP[token.tileCode];
                    const isSpecialMine = token.tileCode === 'FED_EXP_TILE_5' || token.tileCode === 'FED_EXP_TILE_7';
                    const isTechTile = token.tileCode === 'FED_EXP_TILE_1';
                    const canSelect = selectingFedToken;
                    const borderColor = canSelect ? '#eab308' : token.used ? '#ef4444' : '#047857';
                    const filterId = `fed-border-${idx}-${canSelect ? 'y' : token.used ? 'r' : 'g'}`;
                    const handleFedTokenClick = canSelect ? () => {
                      const reward = FEDERATION_TILE_REWARD[token.tileCode] ?? {};
                      // gain 구성: 특수 토큰은 별도 처리
                      const gain = isSpecialMine || isTechTile ? undefined : {
                        ...(reward.credit && { credit: reward.credit }),
                        ...(reward.ore && { ore: reward.ore }),
                        ...(reward.knowledge && { knowledge: reward.knowledge }),
                        ...(reward.qic && { qic: reward.qic }),
                        ...(reward.vp && { vp: reward.vp }),
                        ...(reward.powerToken && { powerToken: reward.powerToken }),
                        ...(reward.powerToBowl3 && { powerToBowl3: reward.powerToBowl3 }),
                      };
                      setTentativeFedTokenCode(token.tileCode);
                      const fsmActionCode = fleetShipMode!.actionCode ?? 'TWILIGHT_FED';
                      addPendingAction({
                        id: `twilight-fed-${Date.now()}`,
                        type: 'FLEET_SHIP_ACTION',
                        timestamp: Date.now(),
                        payload: {
                          fleetName: 'TWILIGHT',
                          actionCode: fsmActionCode,
                          cost: fleetShipMode!.cost,
                          isImmediate: !isSpecialMine,
                          gain,
                          federationTileCode: token.tileCode,
                          ...((fleetShipMode as any)?.artifactCode ? { artifactCode: (fleetShipMode as any).artifactCode } : {}),
                        },
                      });
                      setFleetShipMode(null);
                      // 3삽 광산 / 무한거리 광산: 광산 배치 모드 진입
                      if (isSpecialMine) {
                        setFederationMode({
                          selectedBuildings: [],
                          placedTokens: [],
                          phase: 'PLACE_SPECIAL_MINE',
                          specialTileCode: token.tileCode,
                        });
                      }
                    } : undefined;
                    return (
                      <div key={`fed-${idx}`} className={`relative ${canSelect ? 'cursor-pointer hover:brightness-125' : ''}`}
                        title={canSelect ? `클릭하여 선택: ${token.tileCode}` : token.tileCode}
                        style={{ opacity: token.used && !canSelect ? 0.6 : 1 }}
                        onClick={handleFedTokenClick}>
                        {imgSrc ? (
                          <svg style={{ height: '3.5vw', width: 'auto', display: 'inline-block' }} viewBox="-25 -25 150 170">
                            <defs>
                              <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
                                <feMorphology in="SourceAlpha" operator="dilate" radius="12" result="dilated" />
                                <feFlood floodColor={borderColor} floodOpacity="1" result="colorFlood" />
                                <feComposite in="colorFlood" in2="dilated" operator="in" result="outline" />
                                <feComposite in="SourceGraphic" in2="outline" operator="over" />
                              </filter>
                            </defs>
                            <image href={imgSrc} x="0" y="0" width="100" height="120" filter={`url(#${filterId})`} />
                          </svg>
                        ) : (
                          <span className="text-[7px] text-gray-300 px-1">{token.tileCode}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            </div>{/* 오른쪽 컨텐츠 끝 */}
            </div>, document.body)})()}{/* 호버 패널 끝 */}

          </div>
        );
      })}

      {mySeatNo && (
        <p className="mt-1 text-center text-emerald-400/80 font-medium" style={{ fontSize: '0.6vw' }}>
          {seats.find((s) => s.seatNo === mySeatNo)?.raceNameKo} 플레이
        </p>
      )}
    </div>
  );
}

/** 플레이어별 타이머 (독립 리렌더, 부모 깜빡임 방지) */
const PlayerTimer = memo(function PlayerTimer({ baseSeconds, turnStartedAt, isActive }: {
  baseSeconds: number;
  turnStartedAt: string | null;
  isActive: boolean;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  let liveElapsed = 0;
  if (isActive && turnStartedAt) {
    liveElapsed = Math.max(0, Math.floor((Date.now() - Number(turnStartedAt)) / 1000));
  }
  const total = baseSeconds + liveElapsed;
  const m = Math.floor(total / 60);
  const s = total % 60;

  return (
    <span className={`ml-auto font-mono ${isActive ? 'text-yellow-300' : 'text-gray-500'}`}
      style={{ fontSize: '0.85vw' }}>
      {m}:{s.toString().padStart(2, '0')}
    </span>
  );
});
