import { useState } from 'react';
import { roomApi } from '../api/client';

interface PlayerSnapshot {
  factionAbilityUsed: boolean;
  stockGaiaformer: number;
  baltaksConvertedGaiaformers: number;
  ore: number;
  credit: number;
  knowledge: number;
  gaiaPower?: number;
  stockPlanetaryInstitute: number; // 0 = PI 건설됨
}

interface Props {
  roomId: string;
  playerId: string;
  factionCode: string;
  playerState: PlayerSnapshot;
  onDone?: () => void;
}

export default function FactionAbilityPanel({ roomId, playerId, factionCode, playerState, onDone }: Props) {
  const [loading, setLoading] = useState(false);

  const call = async (abilityCode: string, extraParams?: { trackCode?: string; hexQ?: number; hexR?: number }) => {
    setLoading(true);
    try {
      const res = await roomApi.useFactionAbility(roomId, playerId, abilityCode,
        extraParams?.trackCode, extraParams?.hexQ, extraParams?.hexR);
      if (!res.data.success) { alert(res.data.message ?? '능력 사용 실패'); return; }
      onDone?.();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '오류 발생');
    } finally {
      setLoading(false);
    }
  };

  const hasPi = playerState.stockPlanetaryInstitute === 0;
  const { factionAbilityUsed, stockGaiaformer, ore, credit, knowledge, gaiaPower = 0 } = playerState;

  const btn = (label: string, abilityCode: string, disabled: boolean, desc: string,
               extra?: { trackCode?: string; hexQ?: number; hexR?: number }) => (
    <button
      key={abilityCode + (extra?.trackCode ?? '')}
      onClick={() => call(abilityCode, extra)}
      disabled={disabled || loading}
      title={desc}
      className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors
        ${disabled || loading
          ? 'border-gray-600 text-gray-600 cursor-not-allowed'
          : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20 cursor-pointer'
        }`}
    >
      {label}
    </button>
  );

  const piBtn = (label: string, abilityCode: string, disabled: boolean, desc: string,
                 extra?: { trackCode?: string }) => {
    if (!hasPi) return null;
    return btn(`[PI] ${label}`, abilityCode, disabled, desc, extra);
  };

  const TRACK_LABELS: Record<string, string> = {
    TERRA_FORMING: '테라', NAVIGATION: '항법', AI: 'AI',
    GAIA_FORMING: '가이아', ECONOMY: '경제', SCIENCE: '과학',
  };

  const buttons: (JSX.Element | null)[] = [];

  switch (factionCode) {

    case 'BAL_TAKS':
      buttons.push(btn(`포머→QIC (${stockGaiaformer})`, 'BAL_TAKS_CONVERT_GAIAFORMER',
        stockGaiaformer <= 0, '가이아포머 1 → QIC 1 (프리 액션)'));
      break;

    case 'XENOS':
      buttons.push(btn(`광석→파워3 (ore${ore})`, 'XENOS_ORE_TO_POWER',
        ore <= 0, '광석 1 → bowl3 파워 1 (프리 액션)'));
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 연방 파워 제한 6 (패시브)</span>);
      }
      break;

    case 'BESCODS':
      buttons.push(btn('최저트랙+1', 'BESCODS_ADVANCE_LOWEST_TRACK',
        factionAbilityUsed, '최저 기술 트랙 1칸 전진 (라운드당 1회, 액션)'));
      if (hasPi) {
        // 매드안드로이드 PI: 본인 행성 건물 파워 +1 (패시브, 버튼 없음 - 표시만)
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 본인 행성 건물 파워+1 (패시브)</span>);
      }
      break;

    case 'SPACE_GIANTS':
      buttons.push(btn('2삽 테라포밍', 'SPACE_GIANTS_TERRAFORM_2',
        factionAbilityUsed, '2단계 테라포밍 후 광산 건설 (라운드당 1회, 액션)'));
      if (hasPi) {
        buttons.push(<span key="pi-info" className="text-[9px] text-green-400">[PI] 의회 건설 시 기본 기술타일 획득</span>);
      }
      break;

    case 'GLEENS':
      buttons.push(btn('2거리 점프', 'GLEENS_JUMP',
        factionAbilityUsed, '2거리 이내 광산 건설 (라운드당 1회, 액션)'));
      if (hasPi) {
        buttons.push(piBtn('연방토큰 (2c+1o+1k)', 'GLEENS_FEDERATION_TOKEN',
          factionAbilityUsed || credit < 2 || ore < 1 || knowledge < 1,
          '2크레딧+1광석+1지식 → 연방 토큰 획득 (액션)') ?? null);
      }
      break;

    case 'FIRAKS':
      // 파이락 PI: RL→TS + 트랙 선택 (간단 구현: 첫 RL 자동 선택, 트랙 선택 UI는 prompt)
      if (hasPi) {
        const tracks = ['TERRA_FORMING', 'NAVIGATION', 'AI', 'GAIA_FORMING', 'ECONOMY', 'SCIENCE'];
        buttons.push(
          <div key="firaks-pi" className="flex flex-wrap gap-1">
            <span className="text-[9px] text-yellow-400">[PI] RL→TS+트랙:</span>
            {tracks.map(t => (
              <button
                key={t}
                disabled={factionAbilityUsed || loading}
                onClick={async () => {
                  const hexQ = prompt('다운그레이드할 연구소 Q 좌표:');
                  const hexR = prompt('다운그레이드할 연구소 R 좌표:');
                  if (hexQ == null || hexR == null) return;
                  await call('FIRAKS_DOWNGRADE', { trackCode: t, hexQ: parseInt(hexQ), hexR: parseInt(hexR) });
                }}
                className={`px-1.5 py-0.5 rounded text-[9px] border
                  ${factionAbilityUsed || loading ? 'border-gray-600 text-gray-600' : 'border-orange-400 text-orange-300 hover:bg-orange-400/20'}`}
              >{TRACK_LABELS[t]}</button>
            ))}
          </div>
        );
      }
      break;

    case 'AMBAS':
      if (hasPi) {
        buttons.push(
          <button
            key="ambas-swap"
            disabled={factionAbilityUsed || loading}
            onClick={async () => {
              const hexQ = prompt('교환할 광산 Q 좌표:');
              const hexR = prompt('교환할 광산 R 좌표:');
              if (hexQ == null || hexR == null) return;
              await call('AMBAS_SWAP', { hexQ: parseInt(hexQ), hexR: parseInt(hexR) });
            }}
            className={`px-2 py-1 rounded text-[10px] font-bold border
              ${factionAbilityUsed || loading ? 'border-gray-600 text-gray-600' : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20'}`}
          >[PI] 광산↔의회 교환</button>
        );
      }
      break;

    case 'HADSCH_HALLAS':
      if (hasPi) {
        buttons.push(
          <div key="hadsch-pi" className="flex gap-1 flex-wrap">
            <span className="text-[9px] text-yellow-400">[PI] 크레딧변환:</span>
            {piBtn(`4c→광석`, 'HADSCH_HALLAS_CREDIT_CONVERT', credit < 4, '4크레딧 → 1광석 (프리 액션)', { trackCode: 'ORE' })}
            {piBtn(`2c→지식`, 'HADSCH_HALLAS_CREDIT_CONVERT', credit < 2, '2크레딧 → 1지식 (프리 액션)', { trackCode: 'KNOWLEDGE' })}
            {piBtn(`3c→QIC`, 'HADSCH_HALLAS_CREDIT_CONVERT', credit < 3, '3크레딧 → 1QIC (프리 액션)', { trackCode: 'QIC' })}
          </div>
        );
      }
      break;

    case 'ITARS':
      if (hasPi) {
        buttons.push(piBtn(`4가이아→기술타일 (가이아:${gaiaPower})`, 'ITARS_GAIA_TO_TECH_TILE',
          gaiaPower < 4, '가이아 구역 파워 4개 영구 제거 → 기본 기술 타일 획득') ?? null);
      }
      break;

    case 'TAKLONS':
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 파워 리치 수령 시 +1 파워토큰 (패시브)</span>);
      }
      break;

    case 'TERRANS':
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 라운드 시작 시 가이아 토큰 → 자원 (패시브)</span>);
      }
      break;

    case 'LANTIDS':
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 기생 광산 건설 시 +2 지식 (패시브)</span>);
      }
      break;

    case 'GEODENS':
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 새 행성 개척 시 +3 지식 (패시브)</span>);
      }
      break;

    case 'DAKANIANS':
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 새 섹터 광산 건설 시 +2c+1k (패시브)</span>);
      }
      break;

    case 'NEVLAS':
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 3구역 파워 2배 사용 (패시브)</span>);
      }
      break;

    case 'IVITS':
      if (hasPi) {
        buttons.push(<span key="pi-todo" className="text-[9px] text-gray-500">[PI] 우주정거장 (미구현)</span>);
      }
      break;

    case 'MOWEIDS':
      if (hasPi) {
        buttons.push(<span key="pi-todo" className="text-[9px] text-gray-500">[PI] 건물 링 (+2파워) (미구현)</span>);
      }
      break;

    case 'TINKEROIDS':
      if (hasPi) {
        buttons.push(<span key="pi-todo" className="text-[9px] text-gray-500">[PI] 개인 액션 타일 (미구현)</span>);
      }
      break;
  }

  const validButtons = buttons.filter(Boolean);
  if (validButtons.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded p-1.5 flex flex-wrap gap-1 items-center">
      <span className="text-[9px] text-gray-400 mr-1">종족능력:</span>
      {validButtons}
    </div>
  );
}
