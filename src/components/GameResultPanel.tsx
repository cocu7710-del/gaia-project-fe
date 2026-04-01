import { useEffect, useState } from 'react';
import { roomApi } from '../api/client';
import type { GameResultResponse } from '../api/client';
import { PLANET_COLORS } from '../constants/colors';

interface Props {
  roomId: string;
  onClose?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  BOOSTER_PASS: '부스터 패스',
  ROUND_SCORING: '라운드 미션',
  FINAL_SCORING: '최종 미션',
  KNOWLEDGE_TRACK: '지식트랙',
  REMAINING_RESOURCES: '남은 자원',
  FEDERATION_TOKEN: '연방 토큰',
  ARTIFACT: '인공물',
  TECH_TILE: '기술타일',
  ADV_TECH_TILE: '고급 기술타일',
  BIDDING: '비딩',
  FLEET: '함대',
  LEECH_COST: '파워 리치',
  OTHER: '기타',
};

const CATEGORY_ORDER = [
  'ROUND_SCORING', 'BOOSTER_PASS', 'FINAL_SCORING', 'KNOWLEDGE_TRACK',
  'REMAINING_RESOURCES', 'FEDERATION_TOKEN', 'ARTIFACT',
  'TECH_TILE', 'ADV_TECH_TILE', 'FLEET', 'BIDDING', 'LEECH_COST', 'OTHER',
];

const FACTION_PLANET: Record<string, string> = {
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

export default function GameResultPanel({ roomId, onClose }: Props) {
  const [result, setResult] = useState<GameResultResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    roomApi.getGameResult(roomId)
      .then(res => setResult(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId]);

  if (loading) return <div className="text-center text-gray-400 py-8">결과 로딩 중...</div>;
  if (!result || result.players.length === 0) return <div className="text-center text-gray-400 py-8">결과 데이터 없음</div>;

  // 총합 내림차순 정렬
  const sorted = [...result.players].sort((a, b) => b.totalVP - a.totalVP);
  const maxVP = sorted[0]?.totalVP ?? 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-yellow-500/50 rounded-xl p-4 max-w-[90vw] max-h-[80vh] overflow-auto shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <div />
          <h2 className="text-lg font-bold text-yellow-400">게임 결과</h2>
          {onClose ? (
            <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕</button>
          ) : <div />}
        </div>

        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-gray-600">
              <th className="text-left text-gray-400 px-2 py-1 sticky left-0 bg-gray-900 z-10">카테고리</th>
              {sorted.map(p => {
                const color = PLANET_COLORS[FACTION_PLANET[p.factionCode] ?? 'TERRA'] ?? '#fff';
                return (
                  <th key={p.playerId} className="text-center px-2 py-1 min-w-[60px]">
                    <span style={{ color }} className="font-bold">{p.factionNameKo}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map(cat => {
              const hasAny = sorted.some(p => (p.categoryScores[cat] ?? 0) !== 0);
              if (!hasAny) return null;
              return (
                <tr key={cat} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="text-gray-300 px-2 py-1 sticky left-0 bg-gray-900 z-10 whitespace-nowrap">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </td>
                  {sorted.map(p => {
                    const val = p.categoryScores[cat] ?? 0;
                    return (
                      <td key={p.playerId} className={`text-center px-2 py-1 font-mono ${
                        val < 0 ? 'text-red-400' : val > 0 ? 'text-white' : 'text-gray-600'
                      }`}>
                        {val !== 0 ? val : '-'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* 총합 행 */}
            <tr className="border-t-2 border-yellow-500/50">
              <td className="text-yellow-400 font-bold px-2 py-2 sticky left-0 bg-gray-900 z-10">총합</td>
              {sorted.map(p => (
                <td key={p.playerId} className={`text-center px-2 py-2 font-bold font-mono text-lg ${
                  p.totalVP === maxVP ? 'text-yellow-400' : 'text-white'
                }`}>
                  {p.totalVP}
                  {p.totalVP === maxVP && <span className="ml-1 text-[9px]">&#x1F451;</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
