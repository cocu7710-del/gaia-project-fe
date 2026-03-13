import { useState } from 'react';
import { roomApi } from '../api/client';

interface PlayerSnapshot {
  ore: number;
  powerBowl3: number;
}

interface Props {
  roomId: string;
  playerId: string;
  playerState: PlayerSnapshot;
  onDone?: () => void;
}

export default function FreeConvertPanel({ roomId, playerId, playerState, onDone }: Props) {
  const [loading, setLoading] = useState(false);

  const call = async (convertCode: string) => {
    setLoading(true);
    try {
      const res = await roomApi.freeConvert(roomId, playerId, convertCode);
      if (!res.data.success) { alert(res.data.message ?? '변환 실패'); return; }
      onDone?.();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '오류 발생');
    } finally {
      setLoading(false);
    }
  };

  const { ore, powerBowl3 } = playerState;

  const btn = (label: string, code: string, disabled: boolean) => (
    <button
      key={code}
      onClick={() => call(code)}
      disabled={disabled || loading}
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors
        ${disabled || loading
          ? 'border-gray-600 text-gray-600 cursor-not-allowed'
          : 'border-cyan-400 text-cyan-300 hover:bg-cyan-400/20 cursor-pointer'
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-1 p-1.5 bg-gray-900/90 rounded border border-gray-700">
      {/* 파워 → 자원 */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[8px] text-blue-400 font-bold">파워→</span>
        {btn(`1파→1c (${powerBowl3})`, 'POWER_TO_CREDIT', powerBowl3 < 1)}
        {btn(`3파→광석 (${powerBowl3})`, 'POWER_TO_ORE', powerBowl3 < 3)}
        {btn(`4파→지식 (${powerBowl3})`, 'POWER_TO_KNOWLEDGE', powerBowl3 < 4)}
        {btn(`4파→QIC (${powerBowl3})`, 'POWER_TO_QIC', powerBowl3 < 4)}
      </div>
      {/* 광석 → 자원 */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[8px] text-orange-400 font-bold">광석→</span>
        {btn(`광석→돈 (${ore})`, 'ORE_TO_CREDIT', ore < 1)}
        {btn(`광석→토큰 (${ore})`, 'ORE_TO_TOKEN', ore < 1)}
      </div>
    </div>
  );
}
