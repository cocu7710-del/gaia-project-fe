import type { SeatView, PlayerStateResponse, BoosterOfferResponse } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { TECH_TILE_IMAGE_MAP } from '../constants/techTileImage.ts';
import { ADV_TECH_TILE_IMAGE_MAP } from '../constants/advTechTileImage.ts';
import type { TechTileActionAction } from '../types/turnActions';
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

const FACTION_RESOURCES: Record<string, { credit: number; ore: number; knowledge: number; qic: number; power1: number; power2: number; power3: number }> = {
  TERRANS: { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  LANTIDS: { credit: 13, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  HADSCH_HALLAS: { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  IVITS: { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  TAKLONS: { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  AMBAS: { credit: 15, ore: 4, knowledge: 3, qic: 2, power1: 4, power2: 4, power3: 0 },
  GEODENS: { credit: 15, ore: 6, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  BAL_TAKS: { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  GLEENS: { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  XENOS: { credit: 15, ore: 4, knowledge: 3, qic: 2, power1: 4, power2: 4, power3: 0 },
  FIRAKS: { credit: 15, ore: 4, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  BESCODS: { credit: 15, ore: 4, knowledge: 1, qic: 1, power1: 4, power2: 4, power3: 0 },
  ITARS: { credit: 15, ore: 5, knowledge: 3, qic: 1, power1: 4, power2: 4, power3: 0 },
  NEVLAS: { credit: 15, ore: 4, knowledge: 2, qic: 1, power1: 4, power2: 4, power3: 0 },
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
  playerStates?: PlayerStateResponse[];
  boosters?: BoosterOfferResponse[];
  onClaimSeat: (seatNo: number) => void;
  isMyTurn?: boolean;
  gamePhase?: string | null;
  onBurnPower?: () => void;
}

export default function SeatSelector({ seats, mySeatNo, playerId, currentTurnSeatNo, playerStates = [], boosters = [], onClaimSeat, isMyTurn = false, gamePhase, onBurnPower }: Props) {
  const { turnState, tinkeroidsExtraRingPlanet, moweidsExtraRingPlanet, economyTrackOption, addFreeConvert, techTileData, addPendingAction, leechBatch } = useGameStore();
  const { previewPlayerState } = turnState;

  const getPlayerState = (seatNo: number): PlayerStateResponse | undefined => {
    const playerState = playerStates.find((p) => p.seatNo === seatNo);
    // Use preview state if it's the current player's turn
    const isMyOwnSeat = seatNo === mySeatNo;
    return isMyOwnSeat && previewPlayerState ? previewPlayerState : playerState;
  };

  return (
    <div className="flex flex-col gap-1">
      {seats.map((seat) => {
        const isMyOwnSeat = seat.playerId === playerId;
        const isTaken = seat.playerId !== null;
        const canSelect = !isTaken && !mySeatNo;
        const isCurrentTurn = currentTurnSeatNo === seat.seatNo;
        const isLeechDecider = leechBatch?.currentDeciderId != null && seat.playerId === leechBatch.currentDeciderId;
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
          vp: playerState.victoryPoints,
          // 지식 트랙 (API에서 가져와야 함)
          techTerraforming: playerState.techTerraforming || 0,
          techNavigation: playerState.techNavigation || 0,
          techAi: playerState.techAi || 0,
          techGaia: playerState.techGaia || 0,
          techEconomy: playerState.techEconomy || 0,
          techScience: playerState.techScience || 0,
          // 거리, 테라포밍 비용 (기술 트랙에서 계산)
          navigationRange: navLevelToRange(playerState.techNavigation),
          terraformCost: getOrePerStep(playerState.techTerraforming),
          stockGaiaformer: playerState.stockGaiaformer || 0,
        } : {
          ...fallback,
          gaia: 0,
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
              isLeechDecider ? 'ring-2 ring-purple-400/70 !border-purple-500/30' : ''
            }`}
          >
            {/* 메인 영역 */}
            <div className="flex items-center p-1.5">
              {/* 중앙: 원형 초상화 + 파워볼 구역 */}
              <div className="relative">
                <svg viewBox="0 0 100 100" className="w-24 h-24">
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
                    {/* 좌석 번호 */}
                    <text x="50" y="56" textAnchor="middle" fill={canSelect ? '#facc15' : 'white'} fontSize="18" fontWeight="bold">
                      {seat.seatNo}
                    </text>
                  </g>
                </svg>
              </div>

              {/* 오른쪽: 이름 + 자원/건물 통합 그리드 */}
              {(() => {
                const income = playerState
                  ? calcIncome(playerState, seat.raceCode ?? null, boosterCode, economyTrackOption ?? null)
                  : null;
                const showIncome = gamePhase === 'PLAYING' && !!income;

                // 자원 셀: [아이콘][값] + [(+수입)]
                const ResCell = ({ icon, value, inc, incColor }: { icon: string; value: number; inc?: number; incColor: string }) => (
                  <div className="flex items-center gap-0.5">
                    <img src={icon} className="w-3 h-3 flex-shrink-0" />
                    <span className="text-white font-bold text-[10px]">{value}</span>
                    {showIncome && inc !== undefined && (
                      <span className={`text-[8px] opacity-70 ${incColor}`}>+{inc}</span>
                    )}
                  </div>
                );

                // 건물 셀: [컬러 아이콘][재고수]
                const BldCell = ({ img, count }: { img: string; count: number }) => (
                  <div className={`flex items-center gap-0.5 ${count === 0 ? 'opacity-25' : ''}`}>
                    <ColorizedBuilding src={img} color={planetColor} size={16} />
                    <span className="text-white font-bold text-[10px]">{count}</span>
                  </div>
                );

                return (
                  <div className="flex flex-col ml-1 flex-1 min-w-0">
                    {/* 이름 */}
                    <div className="text-[9px] mb-0.5 truncate">
                      <span style={{ color: planetColor }}>{seat.raceNameKo}</span>
                      {seat.nickname && <span className="text-gray-300"> {seat.nickname}</span>}
                      {isMyOwnSeat && <span className="text-yellow-400"> (나)</span>}
                    </div>

                    {/* 3행 × 4열 그리드 */}
                    <div className="grid gap-x-1.5 gap-y-0.5" style={{ gridTemplateColumns: 'repeat(4, auto)' }}>
                      {/* 행1: 돈 / 광 / 광산 / 교역소 */}
                      <ResCell icon={creditImg}    value={resources.credit}    inc={income?.credit}    incColor="text-yellow-300" />
                      <ResCell icon={oreImg}       value={resources.ore}       inc={income?.ore}       incColor="text-orange-300" />
                      {playerState
                        ? <BldCell img={mineImg}           count={playerState.stockMine} />
                        : <div />}
                      {playerState
                        ? <BldCell img={tradingStationImg} count={playerState.stockTradingStation} />
                        : <div />}

                      {/* 행2: 지식 / QIC / 연구소 / 아카데미 */}
                      <ResCell icon={knowledgeImg} value={resources.knowledge} inc={income?.knowledge} incColor="text-blue-300" />
                      <ResCell icon={qicImg}       value={resources.qic}       inc={income?.qic}       incColor="text-cyan-300" />
                      {playerState
                        ? <BldCell img={researchLabImg}    count={playerState.stockResearchLab} />
                        : <div />}
                      {playerState
                        ? <BldCell img={academyImg}        count={playerState.stockAcademy} />
                        : <div />}

                      {/* 행3: 파워순환 / 파워획득 / 의회 / (빈칸) */}
                      <div className="flex items-center gap-0.5">
                        <img src={powerImg} className="w-3 h-3 flex-shrink-0" />
                        <span className="text-purple-300 font-bold text-[10px]">{income ? income.powerCharge : 0}↑</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <img src={powerImg} className="w-3 h-3 flex-shrink-0" />
                        <span className="text-pink-300 font-bold text-[10px]">+{income ? income.powerToken : 0}</span>
                      </div>
                      {playerState
                        ? <BldCell img={planetaryInstituteImg} count={playerState.stockPlanetaryInstitute} />
                        : <div />}
                      <div />
                    </div>

                    {/* 포머 + 거리 + 테라포밍 */}
                    <div className="flex items-center gap-1 mt-0.5 text-[9px] text-gray-300">
                      <span className="flex items-center gap-0.5">
                        <img src={pomerImg} className="w-3 h-3" />
                        <span className="text-white font-bold">{resources.stockGaiaformer}</span>
                      </span>
                      <span>거리:{resources.navigationRange}</span>
                      <span>T:{resources.terraformCost}</span>
                      {seat.raceCode === 'TINKEROIDS' && tinkeroidsExtraRingPlanet && (
                        <span className="text-pink-400">+3삽:{tinkeroidsExtraRingPlanet}</span>
                      )}
                      {seat.raceCode === 'MOWEIDS' && moweidsExtraRingPlanet && (
                        <span className="text-cyan-400">+3삽:{moweidsExtraRingPlanet}</span>
                      )}
                    </div>
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
                          <img src={imgSrc} alt={tile.tileCode} className="h-8 w-auto object-contain" draggable={false} />
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

            {/* 하단: 지식트랙 6개 */}
            <div className="flex justify-center gap-1 pb-1.5 px-2">
              {techTracks.map((level, idx) => {
                const trackColors = ['#ea580c', '#3b82f6', '#ec4899', '#22c55e', '#eab308', '#8b5cf6'];
                return (
                  <div
                    key={idx}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border-2"
                    style={{
                      backgroundColor: '#1a1a2e',
                      borderColor: trackColors[idx],
                      color: trackColors[idx],
                    }}
                  >
                    {level}
                  </div>
                );
              })}
            </div>
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
