import React from 'react';
import type { PlayerStateResponse } from '../api/client';

const FACTION_NAME_KO: Record<string, string> = {
  TERRANS: '테란', LANTIDS: '란티드', HADSCH_HALLAS: '하드쉬할라', IVITS: '하이브',
  TAKLONS: '타클론', AMBAS: '엠바스', GEODENS: '기오덴', BAL_TAKS: '발타크',
  GLEENS: '글린', XENOS: '제노스', FIRAKS: '파이락', BESCODS: '매드안드로이드',
  ITARS: '아이타', NEVLAS: '네블라', MOWEIDS: '모웨이드', SPACE_GIANTS: '스페이스자이언트',
  TINKEROIDS: '팅커로이드', DAKANIANS: '다카니안',
};

interface Props {
  playerStates: PlayerStateResponse[];
}

export default function BiddingOverlay({ playerStates }: Props) {
  const hasBidding = playerStates.some(ps => ps.bidPenalty > 0);
  if (!hasBidding) return null;

  const sorted = [...playerStates].sort((a, b) => b.bidPenalty - a.bidPenalty);

  return (
    <div className="absolute z-10" style={{ top: '0.65cqw', left: '0.65cqw', backgroundColor: 'rgba(31,41,55,0.9)', padding: '0.46cqw', borderRadius: '0.39cqw' }}>
      <div style={{ fontSize: '1.3cqw', fontWeight: 'bold', color: '#fbbf24', marginBottom: '0.3cqw' }}>
        비딩
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: '0.8cqw', rowGap: '0.1cqw', fontSize: '1.1cqw' }}>
        {sorted.map(ps => {
          const name = FACTION_NAME_KO[ps.factionCode ?? ''] || ps.factionCode;
          const adjusted = (ps.victoryPoints ?? 10) - ps.bidPenalty;
          return (
            <React.Fragment key={ps.playerId}>
              <span style={{ color: '#d1d5db', whiteSpace: 'nowrap' }}>{name}</span>
              <span style={{ fontWeight: 'bold', textAlign: 'left', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#d1d5db' }}>{adjusted}</span>
                <span style={{ color: '#f87171' }}>[-{ps.bidPenalty}]</span>
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
