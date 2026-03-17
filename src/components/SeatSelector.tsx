import { useState } from 'react';
import type { SeatView, PlayerStateResponse, BoosterOfferResponse } from '../api/client';
import { roomApi } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage.ts';
import { ADV_TECH_TILE_IMAGE_MAP } from '../constants/advTechTileImage.ts';
import { FEDERATION_TOKEN_IMAGE_MAP } from '../constants/federationTokenImage';
import { ARTIFACT_IMAGE_MAP } from '../constants/artifactImage';
import type { TechTileActionAction, FactionAbilityAction } from '../types/turnActions';
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
function ColorizedBuilding({ src, color, size = 24 }: { src: string; color: string; size?: number }) {
  const hex = color.replace('#', '');
  const cr = parseInt(hex.slice(0, 2), 16) / 255;
  const cg = parseInt(hex.slice(2, 4), 16) / 255;
  const cb = parseInt(hex.slice(4, 6), 16) / 255;
  const filterId = `bfi-${hex}`;
  const m = (c: number) => `${0.299*c*2.5} ${0.587*c*2.5} ${0.114*c*2.5} 0 0`;
  const matrix = `${m(cr)}  ${m(cg)}  ${m(cb)}  0 0 0 1 0`;
  return (
    <svg width={size} height={size} style={{ display: 'inline-block', flexShrink: 0 }}>
      <defs>
        <filter id={filterId}>
          <feColorMatrix type="saturate" values="0" in="SourceGraphic" result="gray" />
          <feComponentTransfer in="gray" result="boosted">
            <feFuncR type="gamma" amplitude="1" exponent="2.0" offset="0" />
            <feFuncG type="gamma" amplitude="1" exponent="2.0" offset="0" />
            <feFuncB type="gamma" amplitude="1" exponent="2.0" offset="0" />
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
  const { turnState, tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet, economyTrackOption, addFreeConvert, techTileData, addPendingAction, leechBatch, federationGroups, gameArtifacts, passedSeatNos } = useGameStore();
  const [abilityLoading, setAbilityLoading] = useState(false);
  const { previewPlayerState } = turnState;

  const getPlayerState = (seatNo: number): PlayerStateResponse | undefined => {
    const playerState = playerStates.find((p) => p.seatNo === seatNo);
    // Use preview state if it's the current player's turn
    const isMyOwnSeat = seatNo === mySeatNo;
    return isMyOwnSeat && previewPlayerState ? previewPlayerState : playerState;
  };

  // 라운드 첫 번째 플레이어 기준으로 좌석 정렬 (라운드 내 고정)
  const { roundFirstSeatNo } = useGameStore();
  const sortedSeats = (() => {
    const firstSeat = roundFirstSeatNo ?? currentTurnSeatNo;
    if (!firstSeat || seats.length === 0) return seats;
    const idx = seats.findIndex(s => s.seatNo === firstSeat);
    if (idx <= 0) return seats;
    return [...seats.slice(idx), ...seats.slice(0, idx)];
  })();

  return (
    <div className="flex flex-col gap-1">
      {sortedSeats.map((seat) => {
        const isMyOwnSeat = seat.playerId === playerId;
        const isTaken = seat.playerId !== null;
        const canSelect = !isTaken && !mySeatNo;
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
            + (techTileData?.basicTiles.some(t => t.tileCode === 'BASIC_EXP_TILE_1' && t.takenByPlayerId === seat.playerId) ? 1 : 0),
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
            className={`relative game-panel ${
              isCurrentTurn ? 'ring-2 ring-emerald-400/70 !border-emerald-500/30' : ''
            } ${
              isSpecialPhaseTurn ? 'ring-2 ring-blue-400/70 !border-blue-500/30' : ''
            } ${
              isLeechDecider ? 'ring-2 ring-purple-400/70 !border-purple-500/30' : ''
            }`}
          >
            {/* 메인 영역 */}
            <div className="flex items-center p-1.5">
              {/* 중앙: 원형 초상화 + 파워볼 구역 */}
              <div className="relative">
                <svg viewBox="0 0 100 100" className="w-[4.8vw] h-[4.8vw] min-w-[58px] min-h-[58px] max-w-[96px] max-h-[96px]">
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
                    const canBurn = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && resources.power2 >= 2;
                    return (
                      <g onClick={() => canBurn && onBurnPower?.()} style={{ cursor: canBurn ? 'pointer' : 'default' }}>
                        <path d={describeArc(50, 50, 38, 300, 390)} fill="none" stroke="#7c3aed" strokeWidth="14" />
                        <text x="40" y="18" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
                          {resources.power2}
                        </text>
                      </g>
                    );
                  })()}

                  {/* Bowl 3: 1시(30도) ~ 4시(110도) - 밝은 핑크 */}
                  {(() => {
                    const canOre3 = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && seat.raceCode === 'XENOS' && resources.ore >= 1;
                    return (
                      <g onClick={() => canOre3 && addFreeConvert('ORE_TO_POWER3')} style={{ cursor: canOre3 ? 'pointer' : 'default' }}>
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
                    // 브레인스톤이 위치한 볼 옆에 골든 마커 표시
                    const pos = resources.brainstoneBowl === 1
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
                      {playerState ? `${playerState.victoryPoints}vp` : seat.seatNo}
                    </text>
                  </g>
                </svg>
              </div>

              {/* 오른쪽: 이름 + 자원/건물 통합 그리드 */}
              {(() => {
                // 보유 기술 타일 코드 (덮이지 않은 것만)
                const ownedTiles = techTileData
                  ? [...techTileData.basicTiles, ...techTileData.advancedTiles]
                      .filter(t => t.takenByPlayerId === seat.playerId)
                      .map(t => t.tileCode)
                  : [];
                const myArtifactCodes = gameArtifacts
                  .filter(a => a.acquiredByPlayerId === seat.playerId)
                  .map(a => a.artifactCode);
                const income = playerState
                  ? calcIncome(playerState, seat.raceCode ?? null, boosterCode, economyTrackOption ?? null, ownedTiles, myArtifactCodes)
                  : null;
                const showIncome = gamePhase === 'PLAYING' && !!income;

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
                      <img src={icon} className="w-3 h-3 flex-shrink-0" />
                      <span className="text-white font-bold text-[10px]">{value}</span>
                      {showIncome && inc !== undefined && (
                        <span className={`text-[8px] opacity-70 ${incColor}`}>+{inc}</span>
                      )}
                    </div>
                  );
                };

                // 건물 셀: [컬러 아이콘][재고수]
                const BldCell = ({ img, count }: { img: string; count: number }) => (
                  <div className={`flex items-center gap-0 ${count === 0 ? 'opacity-25' : ''}`}>
                    <ColorizedBuilding src={img} color={planetColor} size={20} />
                    <span className="text-white font-bold text-[9px]">{count}</span>
                  </div>
                );

                return (
                  <div className="flex flex-col ml-1 flex-1 min-w-0">
                    {/* 이름 */}
                    <div className="text-[9px] mb-0.5 truncate">
                      <span style={{ color: planetColor }}>{seat.raceNameKo}</span>
                      {seat.nickname && <span className="text-gray-300"> {seat.nickname}</span>}
                      {isMyOwnSeat && <span className="text-yellow-400"> (나)</span>}
                      {(() => {
                        const passIdx = passedSeatNos.indexOf(seat.seatNo);
                        return passIdx >= 0 ? (
                          <span className="text-red-400 font-bold"> Pass({passIdx + 1})</span>
                        ) : null;
                      })()}
                    </div>

                    {/* 행1: 돈 광 지식 QIC 파순 토추 */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0">
                      <ResCell icon={creditImg}    value={resources.credit}    inc={income?.credit}    incColor="text-yellow-300" />
                      <ResCell icon={oreImg}       value={resources.ore}       inc={income?.ore}       incColor="text-orange-300"
                        convertCode="HADSCH_HALLAS_3C_ORE" convertCost={3} />
                      <ResCell icon={knowledgeImg} value={resources.knowledge} inc={income?.knowledge} incColor="text-blue-300"
                        convertCode="HADSCH_HALLAS_4C_KNOWLEDGE" convertCost={4} />
                      <ResCell icon={qicImg}       value={resources.qic}       inc={income?.qic}       incColor="text-cyan-300"
                        convertCode="HADSCH_HALLAS_4C_QIC" convertCost={4} />
                      <div className="flex items-center gap-0.5">
                        <img src={powerImg} className="w-3 h-3 flex-shrink-0" />
                        <span className="text-purple-300 font-bold text-[10px]">{income ? income.powerCharge : 0}↑</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <img src={powerImg} className="w-3 h-3 flex-shrink-0" />
                        <span className="text-pink-300 font-bold text-[10px]">+{income ? income.powerToken : 0}</span>
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
                    {/* 행3: 포머 거리 삽 + 지식트랙 6개 */}
                    {playerState && (
                      <div className="flex items-center gap-x-2">
                        <div className="flex items-center gap-0.5">
                          <img src={pomerImg} className="w-4 h-4 flex-shrink-0" />
                          <span className="text-green-300 font-bold text-[10px]">{resources.stockGaiaformer}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <img src={distanceImg} className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sky-300 font-bold text-[10px]">{resources.navigationRange}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <img src={terraformImg} className="w-4 h-4 flex-shrink-0" />
                          <span className="text-amber-300 font-bold text-[10px]">{resources.terraformCost}</span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-8">
                          {['#dc2626','#38bdf8','#22c55e','#a855f7','#ea580c','#3b82f6'].map((c, i) => (
                            <div key={i} className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold border"
                              style={{ backgroundColor: '#1a1a2e', borderColor: c, color: c }}>
                              {techTracks[i]}
                            </div>
                          ))}
                        </div>
                        {seat.raceCode === 'TINKEROIDS' && tinkeroidsExtraRingPlanet && (
                          <span className="text-pink-400 text-[9px]">+3삽:{tinkeroidsExtraRingPlanet}</span>
                        )}
                        {seat.raceCode === 'MOWEIDS' && moweidsExtraRingPlanet && (
                          <span className="text-cyan-400 text-[9px]">+3삽:{moweidsExtraRingPlanet}</span>
                        )}
                      </div>
                    )}

                    {/* 팩션 능력 버튼 (아카데미 아래) */}
                    {(() => {
                      if (!playerState || !seat.raceCode || !roomId) return null;
                      const factionCode = seat.raceCode;
                      const hasPi = playerState.stockPlanetaryInstitute === 0;
                      const canUseAbility = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING';
                      const used = playerState.factionAbilityUsed;
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

                      const AbilityBtn = ({ label, code, disabled, title, extra }: {
                        label: string; code: string; disabled: boolean; title: string;
                        extra?: { trackCode?: string; hexQ?: number; hexR?: number };
                      }) => {
                        const isDisabled = !canUseAbility || disabled || abilityLoading || hasPendingAction;
                        return (
                          <button
                            onClick={() => !isDisabled && callAbility(code, extra)}
                            disabled={isDisabled}
                            title={title}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                              ${isDisabled
                                ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                                : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20 cursor-pointer'
                              }`}
                          >
                            {label}
                          </button>
                        );
                      };

                      const abilities: JSX.Element[] = [];

                      // 기본 능력 (PI 불필요)
                      if (factionCode === 'BAL_TAKS') {
                        // 발타크: FE 프리뷰만, 확정 시 BE 호출
                        const balDisabled = !canUseAbility || (playerState.stockGaiaformer ?? 0) <= 0;
                        abilities.push(
                          <button key="bal"
                            onClick={() => !balDisabled && addFreeConvert('BAL_TAKS_CONVERT_GAIAFORMER')}
                            disabled={balDisabled}
                            title="가이아포머 1 → QIC 1 (프리 액션)"
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                              ${balDisabled ? 'border-gray-600 text-gray-600 cursor-not-allowed' : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20 cursor-pointer'}`}
                          >포머→QIC</button>
                        );
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
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                              ${besDisabled ? 'border-gray-600 text-gray-600 cursor-not-allowed' : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20 cursor-pointer'}`}
                          >최저트랙+1</button>
                        );
                      } else if (factionCode === 'SPACE_GIANTS') {
                        abilities.push(<AbilityBtn key="sg" label="2삽 테라포밍" code="SPACE_GIANTS_TERRAFORM_2"
                          disabled={used} title="2단계 테라포밍 후 광산 건설 (라운드당 1회, 액션)" />);
                      } else if (factionCode === 'GLEENS') {
                        abilities.push(<AbilityBtn key="gl" label="2거리 점프" code="GLEENS_JUMP"
                          disabled={used} title="2거리 이내 광산 건설 (라운드당 1회, 액션)" />);
                      }

                      // PI 능력
                      if (hasPi) {
                        if (factionCode === 'FIRAKS') {
                          // 파이락 PI: 선언형 - pending 추가 후 맵에서 연구소 선택 → 트랙 선택
                          const firakDisabled = !canUseAbility || used || hasPendingAction;
                          const hasRL = playerState.stockResearchLab < 3; // 연구소 1개 이상 건설됨
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
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                                ${(firakDisabled || !hasRL)
                                  ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                                  : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20 cursor-pointer'
                                }`}
                            >RL→TS</button>
                          );
                        } else if (factionCode === 'AMBAS') {
                          abilities.push(<AbilityBtn key="ambas" label="광산↔의회" code="AMBAS_SWAP"
                            disabled={used} title="광산과 의회 위치 교환 (라운드당 1회, 액션)" />);
                        } else if (factionCode === 'HADSCH_HALLAS') {
                          // 하쉬할라 PI: 자원 셀 클릭으로 처리 (아래 ResCell에서 직접 처리)
                        } else if (factionCode === 'GLEENS') {
                          // 글린 PI: 연방 토큰은 PI 건설 시 자동 지급 (별도 액션 버튼 없음)
                        } else if (factionCode === 'NEVLAS') {
                          // 네블라 PI: 3구역 파워 2배 사용 (프리 액션)
                          const canNevlas = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && (playerState.powerBowl3 ?? 0) >= 2;
                          abilities.push(
                            <button key="nev1" onClick={() => canNevlas && addFreeConvert('NEVLAS_4P_ORE_CREDIT')}
                              disabled={!canNevlas}
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                                ${!canNevlas ? 'border-gray-600 text-gray-600 cursor-not-allowed' : 'border-purple-500 text-purple-300 hover:bg-purple-500/20 cursor-pointer'}`}
                            >4p→1o1c</button>
                          );
                          abilities.push(
                            <button key="nev2" onClick={() => canNevlas && addFreeConvert('NEVLAS_4P_ORE2')}
                              disabled={!canNevlas}
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                                ${!canNevlas ? 'border-gray-600 text-gray-600 cursor-not-allowed' : 'border-purple-500 text-purple-300 hover:bg-purple-500/20 cursor-pointer'}`}
                            >4p→2o</button>
                          );
                        } else if (factionCode === 'MOWEIDS') {
                          // 모웨이드 PI: 건물 선택 → 링 씌우기 (pendingAction으로 처리)
                          abilities.push(<AbilityBtn key="mow-ring" label="링 씌우기" code="MOWEIDS_RING"
                            disabled={used} title="본인 건물 선택하여 링 씌우기 (파워값 +2, 라운드당 1회)" />);
                        } else if (factionCode === 'TINKEROIDS') {
                          // 팅커로이드 PI: 현재 라운드 선택된 액션 사용 버튼
                          const tinkAction = (playerState as any).tinkeroidsCurrentAction as string | null;
                          if (tinkAction) {
                            const tinkLabels: Record<string, string> = {
                              TINK_TERRAFORM_1: '1삽', TINK_POWER_4: '4파워', TINK_QIC_1: '1QIC',
                              TINK_TERRAFORM_3: '3삽', TINK_KNOWLEDGE_3: '3지식', TINK_QIC_2: '2QIC',
                            };
                            const isTerra = tinkAction === 'TINK_TERRAFORM_1' || tinkAction === 'TINK_TERRAFORM_3';
                            const discount = tinkAction === 'TINK_TERRAFORM_1' ? 1 : tinkAction === 'TINK_TERRAFORM_3' ? 3 : 0;
                            const tinkDisabled = !canUseAbility || hasPendingAction;

                            abilities.push(
                              <button key="tink-use"
                                onClick={() => {
                                  if (tinkDisabled) return;
                                  if (isTerra) {
                                    // 테라포밍: 선언형 pending
                                    addPendingAction({
                                      id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                      payload: { abilityCode: tinkAction, terraformDiscount: discount },
                                    } as FactionAbilityAction);
                                  } else {
                                    // 즉시 효과: pending 추가 → 확정 시 BE 호출
                                    addPendingAction({
                                      id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                      payload: { abilityCode: 'TINKEROIDS_USE_ACTION', tinkAction },
                                    } as FactionAbilityAction);
                                  }
                                }}
                                disabled={tinkDisabled}
                                title={`팅커로이드 액션: ${tinkLabels[tinkAction] ?? tinkAction}`}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                                  ${tinkDisabled
                                    ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                                    : 'border-pink-500 text-pink-300 hover:bg-pink-500/20 cursor-pointer'
                                  }`}
                              >{tinkLabels[tinkAction] ?? tinkAction} 사용</button>
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
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                                ${ivitsDisabled
                                  ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                                  : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20 cursor-pointer'
                                }`}
                            >우주정거장</button>
                          );
                        }
                      }

                      if (abilities.length === 0) return null;

                      return (
                        <div className="flex flex-wrap gap-0.5 mt-0.5 items-center">
                          {used && <span className="text-[7px] text-red-400 font-bold mr-0.5" title="이번 라운드 사용됨">✕</span>}
                          {abilities}
                        </div>
                      );
                    })()}

                    {/* QIC 아카데미 액션 버튼 (종족 무관, QIC 아카데미 보유 시 표시) */}
                    {(() => {
                      if (!playerState || !playerState.hasQicAcademy || !roomId) return null;
                      const canUse = isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING';
                      const isUsed = playerState.qicAcademyActionUsed;
                      const hasPending = turnState.pendingActions.length > 0;
                      const isDisabled = !canUse || isUsed || hasPending;
                      return (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {isUsed && <span className="text-[7px] text-red-400 font-bold" title="이번 라운드 사용됨">✕</span>}
                          <button
                            onClick={() => {
                              if (isDisabled) return;
                              addPendingAction({
                                id: `fa-${Date.now()}`, type: 'FACTION_ABILITY', timestamp: Date.now(),
                                payload: { abilityCode: 'QIC_ACADEMY_ACTION' },
                              });
                            }}
                            disabled={isDisabled}
                            title="QIC 아카데미: QIC 1개 획득 (라운드당 1회, 프리 액션)"
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors whitespace-nowrap
                              ${isDisabled
                                ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                                : 'border-cyan-500 text-cyan-300 hover:bg-cyan-500/20 cursor-pointer'
                              }`}
                          >QIC학원 +1QIC</button>
                        </div>
                      );
                    })()}

                  </div>
                );
              })()}
            </div>

            {/* 하단: 획득한 기술 타일 (2열 랩) */}
            {(() => {
              if (!techTileData) return null;
              const allTiles = [
                ...techTileData.basicTiles.map(t => ({ ...t, isAdv: false })),
                ...techTileData.advancedTiles.map(t => ({ ...t, isAdv: true })),
              ].filter(t => t.takenByPlayerId === playerState?.playerId);
              if (allTiles.length === 0) return null;

              const hasPendingAction = turnState.pendingActions.length > 0;

              return (
                <div className="flex flex-wrap gap-1 px-2 pb-1">
                  {allTiles.map((tile) => {
                    const imgSrc = tile.isAdv
                      ? ADV_TECH_TILE_IMAGE_MAP[tile.tileCode]
                      : TECH_TILE_IMAGE_MAP[tile.tileCode];
                    const isActionTile = tile.abilityType === 'ACTION';
                    // pending에 이 타일 사용 중이면 already used로 취급
                    const isPendingUsed = turnState.pendingActions.some(
                      a => a.type === 'TECH_TILE_ACTION' && a.payload.tileCode === tile.tileCode
                    );
                    const isUsed = tile.isActionUsed || isPendingUsed;
                    const canUse = isActionTile && !isUsed && isMyOwnSeat && isMyTurn && gamePhase === 'PLAYING' && !hasPendingAction;

                    const handleActionClick = () => {
                      if (!canUse) return;
                      const action: TechTileActionAction = {
                        id: `action-${Date.now()}`,
                        type: 'TECH_TILE_ACTION',
                        timestamp: Date.now(),
                        payload: { tileCode: tile.tileCode, description: tile.description },
                      };
                      addPendingAction(action);
                    };

                    return (
                      <div
                        key={tile.tileCode}
                        onClick={canUse ? handleActionClick : undefined}
                        className={`relative rounded ${canUse ? 'cursor-pointer ring-2 ring-green-400 hover:brightness-125' : ''}`}
                        title={isActionTile ? `[액션] ${tile.description}${canUse ? ' — 클릭하여 사용' : isUsed ? ' (사용됨)' : ''}` : tile.description}
                      >
                        {imgSrc ? (
                          <img src={imgSrc} alt={tile.tileCode} className="h-7 w-auto object-contain" draggable={false} />
                        ) : (
                          <span className="text-[7px] text-gray-300 px-1">{tile.tileCode}</span>
                        )}
                        {/* 사용된 ACTION 타일: Close 이미지 오버레이 */}
                        {isActionTile && isUsed && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                            <img src={closeImg} className="w-6 h-6 object-contain" draggable={false} />
                          </div>
                        )}
                        {/* 미사용 ACTION 타일: A 뱃지 */}
                        {isActionTile && !isUsed && (
                          <div className="absolute top-0 right-0 text-[7px] leading-none bg-green-700 text-white rounded-bl px-0.5">A</div>
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
              if (myFedTokens.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1 px-2 pb-1">
                  {myFedTokens.map((token, idx) => {
                    const imgSrc = FEDERATION_TOKEN_IMAGE_MAP[token.tileCode];
                    return (
                      <div key={`fed-${idx}`} className="relative" title={token.tileCode}>
                        {imgSrc ? (
                          <img src={imgSrc} alt={token.tileCode}
                            className={`h-6 w-auto object-contain ${token.used ? 'grayscale opacity-50' : ''}`}
                            draggable={false} />
                        ) : (
                          <span className="text-[7px] text-gray-300 px-1">{token.tileCode}</span>
                        )}
                        {token.used && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <img src={closeImg} className="w-5 h-5 object-contain" draggable={false} />
                          </div>
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
                            className="h-6 w-auto object-contain"
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

          </div>
        );
      })}

      {mySeatNo && (
        <p className="mt-1 text-center text-emerald-400/80 text-[9px] font-medium">
          {seats.find((s) => s.seatNo === mySeatNo)?.raceNameKo} 플레이
        </p>
      )}
    </div>
  );
}
