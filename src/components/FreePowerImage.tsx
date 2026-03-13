import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import freePowerImg from '../assets/resource/FreePower.png';

interface Props {
  ore: number;
  powerBowl3: number;
  interactive?: boolean;
}

const ROWS: { top: number; h: number; code: string; label: string; costOre?: number; costPower?: number }[] = [
  { top: 16, h: 12, code: 'POWER_TO_QIC',       label: '4파워 → QIC',   costPower: 4 },
  { top: 28, h: 12, code: 'POWER_TO_ORE',       label: '3파워 → 광석',  costPower: 3 },
  { top: 41, h: 12, code: 'POWER_TO_KNOWLEDGE', label: '4파워 → 지식',  costPower: 4 },
  { top: 57, h: 12, code: 'POWER_TO_CREDIT',    label: '1파워 → 1돈',   costPower: 1 },
  { top: 70, h: 12, code: 'ORE_TO_CREDIT',      label: '광석 → 크레딧', costOre: 1 },
  { top: 83, h: 12, code: 'ORE_TO_TOKEN',       label: '광석 → +1토큰', costOre: 1 },
];

export default function FreePowerImage({ ore, powerBowl3, interactive = true }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const addFreeConvert = useGameStore(s => s.addFreeConvert);

  const isDisabled = (row: typeof ROWS[0]) => {
    if (row.costPower && powerBowl3 < row.costPower) return true;
    if (row.costOre && ore < row.costOre) return true;
    return false;
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        src={freePowerImg}
        alt="free power"
        style={{ display: 'block', width: '100%', opacity: 0.85 }}
      />
      {interactive && ROWS.map((row) => {
        const disabled = isDisabled(row);
        return (
          <button
            key={row.code}
            onClick={() => !disabled && addFreeConvert(row.code)}
            onMouseEnter={() => setHovered(row.code)}
            onMouseLeave={() => setHovered(null)}
            title={row.label}
            style={{
              position: 'absolute',
              top: `${row.top}%`,
              left: 0,
              width: '100%',
              height: `${row.h}%`,
              background: hovered === row.code && !disabled ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              boxSizing: 'border-box',
              outline: hovered === row.code && !disabled ? '1px solid rgba(255,255,255,0.3)' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
