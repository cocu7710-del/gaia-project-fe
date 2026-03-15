import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import freePowerImg from '../assets/resource/FreePower.png';

interface Props {
  ore: number;
  qic: number;
  powerBowl3: number;
  knowledge: number;
  interactive?: boolean;
}

const BUTTONS: {
  code: string; label: string;
  left: number; top: number; w: number; h: number;
  costPower?: number; costOre?: number; costKnowledge?: number; costQic?: number;
}[] = [
  // 행1 왼쪽: 4파워 → QIC
  { code: 'POWER_TO_QIC',        label: '4파워 → QIC',    left: 2, top: 14.5, w: 58, h: 10.8, costPower: 4 },
  // 행1 오른쪽: 1QIC → 1광석
  { code: 'QIC_TO_ORE',          label: '1QIC → 1광석',   left: 62, top: 14.5, w: 36, h: 10.8, costQic: 1 },
  // 행2: 3파워 → 광석
  { code: 'POWER_TO_ORE',        label: '3파워 → 광석',   left: 2, top: 28.75, w: 96, h: 10.8, costPower: 3 },
  // 행3 왼쪽: 4파워 → 지식
  { code: 'POWER_TO_KNOWLEDGE',  label: '4파워 → 지식',   left: 2, top: 43, w: 58, h: 10.8, costPower: 4 },
  // 행3 오른쪽: 1지식 → 1돈
  { code: 'KNOWLEDGE_TO_CREDIT', label: '1지식 → 1돈',    left: 62, top: 43, w: 36, h: 10.8, costKnowledge: 1 },
  // 행4: 1파워 → 1돈
  { code: 'POWER_TO_CREDIT',     label: '1파워 → 1돈',    left: 2, top: 57.25, w: 96, h: 10.8, costPower: 1 },
  // 행5: 1광석 → 1돈
  { code: 'ORE_TO_CREDIT',       label: '1광석 → 1돈',    left: 2, top: 71.5, w: 96, h: 10.8, costOre: 1 },
  // 행6: 1광석 → 1토큰
  { code: 'ORE_TO_TOKEN',        label: '1광석 → 1토큰',  left: 2, top: 85.75, w: 96, h: 10.8, costOre: 1 },
];

export default function FreePowerImage({ ore, qic, powerBowl3, knowledge, interactive = true }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const addFreeConvert = useGameStore(s => s.addFreeConvert);

  const isDisabled = (btn: typeof BUTTONS[0]) => {
    if (btn.costPower && powerBowl3 < btn.costPower) return true;
    if (btn.costOre && ore < btn.costOre) return true;
    if (btn.costKnowledge && knowledge < btn.costKnowledge) return true;
    if (btn.costQic && qic < btn.costQic) return true;
    return false;
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        src={freePowerImg}
        alt="free power"
        style={{ display: 'block', width: '100%', opacity: 0.85 }}
      />
      {interactive && BUTTONS.map((btn, idx) => {
        const disabled = isDisabled(btn);
        const key = `${btn.code}-${idx}`;
        return (
          <button
            key={key}
            onClick={() => !disabled && addFreeConvert(btn.code)}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
            title={btn.label}
            style={{
              position: 'absolute',
              left: `${btn.left}%`,
              top: `${btn.top}%`,
              width: `${btn.w}%`,
              height: `${btn.h}%`,
              background: hovered === key && !disabled ? 'rgba(255,255,255,0.2)' : 'transparent',
              border: 'none',
              borderRadius: '3px',
              cursor: disabled ? 'default' : 'pointer',
              boxSizing: 'border-box',
              outline: hovered === key && !disabled ? '2px solid rgba(255,255,255,0.4)' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
