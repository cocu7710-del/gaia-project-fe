import { useEffect, useState } from 'react';
import { roomApi } from '../api/client';
import type { ScoringTilesResponse, SeatView } from '../api/client';
import { useGameStore } from '../store/gameStore';
import { ROUND_SCORING_IMAGE_MAP } from '../constants/roundScoringImage';
import { FINAL_SCORING_IMAGE_MAP } from '../constants/finalScoringImage';
import { PLANET_COLORS } from '../constants/colors';

interface ScoringTracksProps {
  roomId: string;
  seats: SeatView[];
  refreshKey?: number;
}

export default function ScoringTracks({ roomId, seats, refreshKey = 0 }: ScoringTracksProps) {
  const [scoringData, setScoringData] = useState<ScoringTilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentRound } = useGameStore();

  useEffect(() => {
    const loadScoringData = async () => {
      try {
        setLoading(true);
        const res = await roomApi.getScoringTiles(roomId);
        setScoringData(res.data);
      } catch {
        // 에러 무시
      } finally {
        setLoading(false);
      }
    };
    loadScoringData();
  }, [roomId, refreshKey]);

  if (loading || !scoringData) {
    return <div className="game-panel text-xs text-gray-400">로딩...</div>;
  }

  const { roundScorings, finalScorings } = scoringData;

  // 부채꼴 설정 (1.3배)
  const svgWidth = 163;
  const svgHeight = 92;
  const cx = svgWidth / 2;
  const cy = svgHeight + 12; // 중심은 아래쪽 바깥
  const radius = 104;
  const innerRadius = 35;
  const totalAngle = 150; // 부채꼴 각도
  const startAngle = -165; // 시작 각도 (왼쪽 위)
  const anglePerSlot = totalAngle / 6;

  // 극좌표 → 직교좌표
  const polarToCart = (r: number, angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad),
    };
  };

  // 부채꼴 슬롯 경로
  const describeSlot = (index: number) => {
    const angle1 = startAngle + index * anglePerSlot;
    const angle2 = startAngle + (index + 1) * anglePerSlot;
    const outer1 = polarToCart(radius, angle1);
    const outer2 = polarToCart(radius, angle2);
    const inner1 = polarToCart(innerRadius, angle1);
    const inner2 = polarToCart(innerRadius, angle2);

    return `
      M ${inner1.x} ${inner1.y}
      L ${outer1.x} ${outer1.y}
      A ${radius} ${radius} 0 0 1 ${outer2.x} ${outer2.y}
      L ${inner2.x} ${inner2.y}
      A ${innerRadius} ${innerRadius} 0 0 0 ${inner1.x} ${inner1.y}
      Z
    `;
  };

  // 슬롯 중심 위치 및 각도 (이미지 배치용)
  const getSlotInfo = (index: number) => {
    const midAngle = startAngle + (index + 0.5) * anglePerSlot;
    const midRadius = (radius + innerRadius) / 2;
    const pos = polarToCart(midRadius, midAngle);
    // 이미지 회전 각도: 슬롯 각도 + 90도 (이미지가 슬롯 방향을 향하도록)
    const rotation = midAngle + 90;
    return { ...pos, rotation };
  };

  return (
    <div className="game-panel">
      <h4 className="panel-title">라운드 / 최종 점수</h4>

      {/* 부채꼴 라운드 점수 (6슬롯) */}
      <div className="flex justify-center w-[95%] mx-auto">
        <svg
          width="100%"
          height="auto"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="overflow-visible"
          style={{ maxHeight: '156px' }}
        >

          {roundScorings.map((rs, idx) => {
            const isCurrentRound = currentRound === rs.roundNumber;
            const slotInfo = getSlotInfo(idx);
            const imgSrc = ROUND_SCORING_IMAGE_MAP[rs.tileCode];

            return (
              <g key={rs.roundNumber}>
                {/* 슬롯 배경 */}
                <path
                  d={describeSlot(idx)}
                  fill={isCurrentRound ? '#1e40af' : '#2d2d4a'}
                  stroke={isCurrentRound ? '#fbbf24' : '#555'}
                  strokeWidth={isCurrentRound ? 1.5 : 0.5}
                />

                {/* 이미지 (회전) */}
                {imgSrc ? (
                  <image
                    href={imgSrc}
                    x={slotInfo.x - 29}
                    y={slotInfo.y - 39}
                    width="57"
                    height="78"
                    preserveAspectRatio="xMidYMid meet"
                    transform={`rotate(${slotInfo.rotation}, ${slotInfo.x}, ${slotInfo.y})`}
                  />
                ) : (
                  <text
                    x={slotInfo.x}
                    y={slotInfo.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#9ca3af"
                    fontSize="6"
                  >
                    R{rs.roundNumber}
                  </text>
                )}

              </g>
            );
          })}
        </svg>
      </div>

      {/* 최종 점수 타일 (가로 2슬롯) + 플레이어별 개수 */}
      <div className="flex gap-2 justify-center mt-2 mx-auto" style={{ width: 'min(95%, 286px)' }}>
        {finalScorings.map((fs) => {
          const imgSrc = FINAL_SCORING_IMAGE_MAP[fs.tileCode];
          // TODO: API에서 플레이어별 개수 데이터 연결
          // 현재는 placeholder로 0 표시
          return (
            <div key={fs.position} className="flex-1 flex flex-col items-start">
              {/* 최종 타일 이미지 */}
              <div
                className="relative w-full aspect-[2/1] rounded border border-gray-600 overflow-hidden bg-gray-700"
                title={fs.description}
              >
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={fs.tileCode}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[8px] text-gray-400">최종 #{fs.position}</span>
                  </div>
                )}
              </div>

              {/* 플레이어별 개수 (세로 배치) */}
              <div className="flex flex-col gap-0.5 mt-1">
                {seats.filter(s => s.playerId).map((seat) => {
                  const color = PLANET_COLORS[seat.homePlanetType] || '#666';
                  const count = fs.playerProgress?.[seat.playerId!] ?? 0;
                  return (
                    <div
                      key={seat.seatNo}
                      className="flex items-center gap-1"
                    >
                      <div
                        className="w-3 h-3 rounded-full border border-white/50"
                        style={{ backgroundColor: color }}
                        title={seat.nickname || `좌석 ${seat.seatNo}`}
                      />
                      <span className="text-[8px] text-white font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
