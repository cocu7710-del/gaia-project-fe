import { useState } from 'react';
import { roomApi } from '../api/client';
import { useGameStore } from '../store/gameStore';

interface Props {
  roomId: string;
  myPlayerId: string;
}

export function TerransGaiaDialog({ roomId, myPlayerId }: Props) {
  const terransGaia = useGameStore(s => s.terransGaiaChoice);
  const setTerransGaiaChoice = useGameStore(s => s.setTerransGaiaChoice);

  const [credits, setCredits] = useState(0);
  const [ores, setOres] = useState(0);
  const [qics, setQics] = useState(0);
  const [knowledges, setKnowledges] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (!terransGaia || terransGaia.terransPlayerId !== myPlayerId) return null;

  const totalGaia = terransGaia.gaiaPower;
  const used = credits * 1 + ores * 3 + qics * 4 + knowledges * 4;
  const remaining = totalGaia - used;

  const [error, setError] = useState<string | null>(null);
  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await roomApi.terransGaiaConvert(roomId, myPlayerId, credits, ores, qics, knowledges);
      if (res.data.success) {
        setTerransGaiaChoice(null);
      } else {
        setError(res.data.message || '변환 실패');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '변환 중 오류 발생');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCredits(0); setOres(0); setQics(0); setKnowledges(0);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-gray-800 border border-blue-500/50 rounded-xl p-4 max-w-sm w-full">
        <h3 className="text-sm font-bold text-blue-300 mb-2">테란 PI: 가이아 토큰 → 자원 변환</h3>
        <p className="text-xs text-gray-400 mb-3">
          가이아 토큰 <span className="text-white font-bold">{totalGaia}개</span> (남은: <span className="text-yellow-300 font-bold">{remaining}</span>)
        </p>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        <div className="flex flex-col gap-2">
          <Row label="크레딧 (1t=1c)" color="text-yellow-300" value={credits} setValue={setCredits} cost={1} remaining={remaining} />
          <Row label="광석 (3t=1o)" color="text-orange-300" value={ores} setValue={setOres} cost={3} remaining={remaining} />
          <Row label="QIC (4t=1q)" color="text-cyan-300" value={qics} setValue={setQics} cost={4} remaining={remaining} />
          <Row label="지식 (4t=1k)" color="text-blue-300" value={knowledges} setValue={setKnowledges} cost={4} remaining={remaining} />
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={handleReset}
            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-1.5 rounded text-xs font-bold">
            초기화
          </button>
          <button onClick={handleConfirm} disabled={submitting}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white py-1.5 rounded text-xs font-bold">
            {submitting ? '처리중...' : '확정'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, color, value, setValue, cost, remaining }: {
  label: string; color: string; value: number;
  setValue: (v: number) => void; cost: number; remaining: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${color}`}>{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => setValue(Math.max(0, value - 1))} disabled={value === 0}
          className="w-6 h-6 rounded bg-gray-600 text-white text-xs disabled:opacity-30">-</button>
        <span className="text-white font-bold w-4 text-center">{value}</span>
        <button onClick={() => remaining >= cost && setValue(value + 1)} disabled={remaining < cost}
          className="w-6 h-6 rounded bg-gray-600 text-white text-xs disabled:opacity-30">+</button>
      </div>
    </div>
  );
}
