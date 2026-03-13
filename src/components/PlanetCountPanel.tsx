import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { PLANET_COLORS } from '../constants/colors';
import type { SeatView } from '../api/client';

interface Props {
  seats: SeatView[];
}

const PLANET_TYPES = ['TERRA', 'VOLCANIC', 'OXIDE', 'DESERT', 'SWAMP', 'TITANIUM', 'ICE', 'GAIA'] as const;

export default function PlanetCountPanel({ seats }: Props) {
  const buildings = useGameStore(s => s.buildings);
  const hexes = useGameStore(s => s.hexes);

  // hexCoord → planetType 맵
  const planetByCoord = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of hexes) {
      if (h.planetType) map.set(`${h.hexQ},${h.hexR}`, h.planetType);
    }
    return map;
  }, [hexes]);

  // playerId → seatNo 맵
  const seatByPlayerId = useMemo(() => {
    const map = new Map<string, SeatView>();
    for (const s of seats) {
      if (s.playerId) map.set(s.playerId, s);
    }
    return map;
  }, [seats]);

  // { seatNo → { planetType → count } } 계산
  const countMap = useMemo(() => {
    const result = new Map<number, Map<string, number>>();
    for (const b of buildings) {
      const planetType = planetByCoord.get(`${b.hexQ},${b.hexR}`);
      if (!planetType || planetType === 'TRANSDIM' || planetType === 'ASTEROIDS' || planetType === 'LOST_PLANET') continue;
      const seat = seatByPlayerId.get(b.playerId);
      if (!seat) continue;
      if (!result.has(seat.seatNo)) result.set(seat.seatNo, new Map());
      const inner = result.get(seat.seatNo)!;
      inner.set(planetType, (inner.get(planetType) ?? 0) + 1);
    }
    return result;
  }, [buildings, planetByCoord, seatByPlayerId]);

  const activeSeatNos = Array.from(countMap.keys()).sort();
  if (activeSeatNos.length === 0) return null;

  return (
    <div className="bg-gray-800 p-2 rounded-lg">
      <h4 className="text-xs font-semibold mb-2 text-gray-400">행성 점령 현황</h4>
      <div className="flex gap-2">
        {PLANET_TYPES.map((type) => {
          const color = PLANET_COLORS[type];
          const playerCounts = activeSeatNos
            .map(seatNo => {
              const seat = seats.find(s => s.seatNo === seatNo);
              const count = countMap.get(seatNo)?.get(type) ?? 0;
              return { seat, count };
            })
            .filter(({ count }) => count > 0);

          return (
            <div key={type} className="flex flex-col items-center gap-0.5">
              {/* 행성 색 원 */}
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: color,
                  border: color === '#b8d4e3' || color === '#000000' ? '1px solid #666' : undefined,
                }}
                title={type}
              />
              {/* 플레이어별 카운트 */}
              {playerCounts.length > 0 ? (
                playerCounts.map(({ seat, count }) => {
                  if (!seat) return null;
                  const playerColor = PLANET_COLORS[seat.homePlanetType] || '#aaa';
                  return (
                    <span
                      key={seat.seatNo}
                      className="text-[9px] font-bold leading-none"
                      style={{ color: playerColor === '#b8d4e3' ? '#cde' : playerColor }}
                    >
                      {count}
                    </span>
                  );
                })
              ) : (
                <span className="text-[9px] text-gray-600">-</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
