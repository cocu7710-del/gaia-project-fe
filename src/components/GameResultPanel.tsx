import { useEffect, useState } from 'react';
import { roomApi } from '../api/client';
import type { GameResultResponse } from '../api/client';
import { PLANET_COLORS } from '../constants/colors';

interface Props {
  roomId: string;
  onClose?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  BASE: '기본',
  ROUND_SCORING: '라운드 미션',
  BOOSTER_PASS: '부스터 패스',
  TECH_TILE: '기술타일',
  ADV_TECH_TILE: '고급 기술타일',
  FEDERATION_TOKEN: '연방 토큰',
  FLEET: '함대 액션',
  ARTIFACT: '인공물',
  KNOWLEDGE_TRACK: '지식트랙',
  FINAL_SCORING: '최종 미션',
  REMAINING_RESOURCES: '남은 자원',
  LEECH_COST: '파워 리치',
  FLEET_ENTRY: '우주선 입장',
  BIDDING: '비딩',
  OTHER: '기타',
};

const CATEGORY_ORDER = [
  'BASE', 'ROUND_SCORING', 'BOOSTER_PASS', 'TECH_TILE', 'ADV_TECH_TILE',
  'FEDERATION_TOKEN', 'FLEET', 'ARTIFACT', 'KNOWLEDGE_TRACK',
  'FINAL_SCORING', 'REMAINING_RESOURCES', 'LEECH_COST', 'FLEET_ENTRY', 'BIDDING', 'OTHER',
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
              // 함대 액션: 함대별 분리 표시
              if (cat === 'FLEET') {
                const totalHasAny = sorted.some(p => (p.categoryScores[cat] ?? 0) !== 0);
                if (!totalHasAny) return null;
                const rows = [];
                rows.push(
                  <tr key={cat} className="border-b border-gray-800 hover:bg-gray-800/50 bg-gray-800/30">
                    <td className="text-gray-200 px-2 py-1 sticky left-0 bg-gray-900 z-10 whitespace-nowrap font-bold">{CATEGORY_LABELS[cat]}</td>
                    {sorted.map(p => {
                      const val = p.categoryScores[cat] ?? 0;
                      return <td key={p.playerId} className={`text-center px-2 py-1 font-mono font-bold ${val < 0 ? 'text-red-400' : val > 0 ? 'text-white' : 'text-gray-600'}`}>{val !== 0 ? val : '-'}</td>;
                    })}
                  </tr>
                );
                const fleetNames: [string, string][] = [['FLEET_TF_MARS','T.F Mars'],['FLEET_ECLIPSE','Eclipse'],['FLEET_REBELLION','Rebellion'],['FLEET_TWILIGHT','Twilight']];
                for (const [fKey, fLabel] of fleetNames) {
                  const has = sorted.some(p => ((p as any).roundScores?.[fKey] ?? 0) !== 0);
                  if (!has) continue;
                  rows.push(
                    <tr key={fKey} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="text-gray-500 px-2 py-0.5 pl-5 sticky left-0 bg-gray-900 z-10 whitespace-nowrap text-[10px]">{fLabel}</td>
                      {sorted.map(p => {
                        const val = (p as any).roundScores?.[fKey] ?? 0;
                        return <td key={p.playerId} className={`text-center px-2 py-0.5 font-mono text-[10px] ${val < 0 ? 'text-red-400' : val > 0 ? 'text-gray-300' : 'text-gray-700'}`}>{val !== 0 ? val : '-'}</td>;
                      })}
                    </tr>
                  );
                }
                return rows;
              }
              // 라운드 미션 / 부스터 패스: 라운드별 분리 표시
              if (cat === 'ROUND_SCORING' || cat === 'BOOSTER_PASS') {
                const totalHasAny = sorted.some(p => (p.categoryScores[cat] ?? 0) !== 0);
                if (!totalHasAny) return null;
                const rows = [];
                // 합계 행
                rows.push(
                  <tr key={cat} className="border-b border-gray-800 hover:bg-gray-800/50 bg-gray-800/30">
                    <td className="text-gray-200 px-2 py-1 sticky left-0 bg-gray-900 z-10 whitespace-nowrap font-bold">
                      {CATEGORY_LABELS[cat]}
                    </td>
                    {sorted.map(p => {
                      const val = p.categoryScores[cat] ?? 0;
                      return <td key={p.playerId} className={`text-center px-2 py-1 font-mono font-bold ${val < 0 ? 'text-red-400' : val > 0 ? 'text-white' : 'text-gray-600'}`}>{val !== 0 ? val : '-'}</td>;
                    })}
                  </tr>
                );
                // 라운드별 세부
                for (let r = 1; r <= 6; r++) {
                  const rKey = `${cat}_R${r}`;
                  const hasRound = sorted.some(p => ((p as any).roundScores?.[rKey] ?? 0) !== 0);
                  if (!hasRound) continue;
                  rows.push(
                    <tr key={rKey} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="text-gray-500 px-2 py-0.5 pl-5 sticky left-0 bg-gray-900 z-10 whitespace-nowrap text-[10px]">
                        R{r}
                      </td>
                      {sorted.map(p => {
                        const val = (p as any).roundScores?.[rKey] ?? 0;
                        return <td key={p.playerId} className={`text-center px-2 py-0.5 font-mono text-[10px] ${val < 0 ? 'text-red-400' : val > 0 ? 'text-gray-300' : 'text-gray-700'}`}>{val !== 0 ? val : '-'}</td>;
                      })}
                    </tr>
                  );
                }
                return rows;
              }
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
