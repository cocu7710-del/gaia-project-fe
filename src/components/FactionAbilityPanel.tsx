import { useGameStore } from '../store/gameStore';

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

export default function FactionAbilityPanel({ roomId: _roomId, playerId: _playerId, factionCode, playerState, onDone: _onDone }: Props) {
  const { addFreeConvert, addPendingAction, turnState } = useGameStore();

  const hasPendingMain = turnState.pendingActions.length > 0;

  const hasPi = playerState.stockPlanetaryInstitute === 0;
  const { factionAbilityUsed, stockGaiaformer, ore, credit, knowledge, gaiaPower = 0 } = playerState;

  // 자유 액션 버튼 (프리 액션: 턴 소모 없음, freeConvert 시스템 사용)
  const freeBtn = (label: string, convertCode: string, disabled: boolean, desc: string) => (
    <button
      key={convertCode}
      onClick={() => addFreeConvert(convertCode)}
      disabled={disabled}
      title={desc}
      className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors
        ${disabled
          ? 'border-gray-600 text-gray-600 cursor-not-allowed'
          : 'border-cyan-500 text-cyan-300 hover:bg-cyan-500/20 cursor-pointer'
        }`}
    >
      {label}
    </button>
  );

  // 메인 액션 버튼 (턴 소모, pendingAction 시스템 사용)
  const mainBtn = (label: string, abilityCode: string, disabled: boolean, desc: string,
                   extraPayload?: Record<string, any>) => (
    <button
      key={abilityCode + (extraPayload?.trackCode ?? '')}
      onClick={() => {
        addPendingAction({
          id: `action-${Date.now()}-${Math.random()}`,
          type: 'FACTION_ABILITY',
          timestamp: Date.now(),
          payload: { abilityCode, ...extraPayload },
        });
      }}
      disabled={disabled || hasPendingMain}
      title={desc}
      className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors
        ${disabled || hasPendingMain
          ? 'border-gray-600 text-gray-600 cursor-not-allowed'
          : 'border-yellow-500 text-yellow-300 hover:bg-yellow-500/20 cursor-pointer'
        }`}
    >
      {label}
    </button>
  );

  const TRACK_LABELS: Record<string, string> = {
    TERRA_FORMING: '테라', NAVIGATION: '항법', AI: 'AI',
    GAIA_FORMING: '가이아', ECONOMY: '경제', SCIENCE: '과학',
  };

  const buttons: (JSX.Element | null)[] = [];

  switch (factionCode) {

    case 'BAL_TAKS':
      buttons.push(freeBtn(`포머→QIC (${stockGaiaformer})`, 'BAL_TAKS_CONVERT_GAIAFORMER',
        stockGaiaformer <= 0, '가이아포머 1 → QIC 1 (프리 액션)'));
      break;

    case 'XENOS':
      buttons.push(freeBtn(`광석→파워3 (ore${ore})`, 'ORE_TO_POWER3',
        ore <= 0, '광석 1 → bowl3 파워 1 (프리 액션)'));
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 연방 파워 제한 6 (패시브)</span>);
      }
      break;

    case 'BESCODS':
      buttons.push(mainBtn('최저트랙+1', 'BESCODS_ADVANCE_LOWEST_TRACK',
        factionAbilityUsed, '최저 기술 트랙 1칸 전진 (라운드당 1회, 액션)'));
      if (hasPi) {
        buttons.push(<span key="pi-passive" className="text-[9px] text-green-400">[PI] 본인 행성 건물 파워+1 (패시브)</span>);
      }
      break;

    case 'SPACE_GIANTS':
      buttons.push(mainBtn('2삽 테라포밍', 'SPACE_GIANTS_TERRAFORM_2',
        factionAbilityUsed, '2단계 테라포밍 후 광산 건설 (라운드당 1회, 액션)',
        { terraformDiscount: 2 }));
      if (hasPi) {
        buttons.push(<span key="pi-info" className="text-[9px] text-green-400">[PI] 의회 건설 시 기본 기술타일 획득</span>);
      }
      break;

    case 'GLEENS':
      buttons.push(mainBtn('2거리 점프', 'GLEENS_JUMP',
        factionAbilityUsed, '2거리 이내 광산 건설 (라운드당 1회, 액션)',
        { navBonus: 2 }));
      if (hasPi) {
        buttons.push(
          mainBtn('[PI] 연방토큰 (2c+1o+1k)', 'GLEENS_FEDERATION_TOKEN',
            factionAbilityUsed || credit < 2 || ore < 1 || knowledge < 1,
            '2크레딧+1광석+1지식 → 연방 토큰 획득 (액션)') ?? null
        );
      }
      break;

    case 'FIRAKS':
      if (hasPi) {
        const tracks = ['TERRA_FORMING', 'NAVIGATION', 'AI', 'GAIA_FORMING', 'ECONOMY', 'SCIENCE'];
        buttons.push(
          <div key="firaks-pi" className="flex flex-wrap gap-1">
            <span className="text-[9px] text-yellow-400">[PI] RL→TS+트랙:</span>
            {tracks.map(t => (
              <button
                key={t}
                disabled={factionAbilityUsed || hasPendingMain}
                onClick={() => {
                  const hexQ = prompt('다운그레이드할 연구소 Q 좌표:');
                  const hexR = prompt('다운그레이드할 연구소 R 좌표:');
                  if (hexQ == null || hexR == null) return;
                  addPendingAction({
                    id: `action-${Date.now()}-${Math.random()}`,
                    type: 'FACTION_ABILITY',
                    timestamp: Date.now(),
                    payload: { abilityCode: 'FIRAKS_DOWNGRADE', trackCode: t, hexQ: parseInt(hexQ), hexR: parseInt(hexR) },
                  });
                }}
                className={`px-1.5 py-0.5 rounded text-[9px] border
                  ${factionAbilityUsed || hasPendingMain ? 'border-gray-600 text-gray-600' : 'border-orange-400 text-orange-300 hover:bg-orange-400/20'}`}
              >{TRACK_LABELS[t]}</button>
            ))}
          </div>
        );
      }
      break;

    case 'AMBAS':
      if (hasPi) {
        buttons.push(
          mainBtn('[PI] 광산↔의회 교환', 'AMBAS_SWAP',
            factionAbilityUsed, '맵에서 교환할 광산을 클릭하세요 (액션)')
        );
      }
      break;

    case 'HADSCH_HALLAS':
      if (hasPi) {
        buttons.push(
          <div key="hadsch-pi" className="flex gap-1 flex-wrap">
            <span className="text-[9px] text-yellow-400">[PI] 크레딧변환:</span>
            {freeBtn('[PI] 3c→광석', 'HADSCH_HALLAS_3C_ORE', credit < 3, '3크레딧 → 1광석 (프리 액션)')}
            {freeBtn('[PI] 4c→지식', 'HADSCH_HALLAS_4C_KNOWLEDGE', credit < 4, '4크레딧 → 1지식 (프리 액션)')}
            {freeBtn('[PI] 4c→QIC', 'HADSCH_HALLAS_4C_QIC', credit < 4, '4크레딧 → 1QIC (프리 액션)')}
          </div>
        );
      }
      break;

    case 'ITARS':
      if (hasPi) {
        buttons.push(
          mainBtn(`[PI] 4가이아→기술타일 (가이아:${gaiaPower})`, 'ITARS_GAIA_TO_TECH_TILE',
            gaiaPower < 4, '가이아 구역 파워 4개 영구 제거 → 기본 기술 타일 획득') ?? null
        );
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
        const preview = turnState.previewPlayerState;
        const bowl3 = preview?.powerBowl3 ?? 0;
        buttons.push(
          <div key="nevlas-convert" className="flex gap-1">
            {freeBtn('4p→1o+1c', 'NEVLAS_4P_ORE_CREDIT', bowl3 < 2, '3구역 파워 2개(=4파워) → 1광석+1크레딧')}
            {freeBtn('6p→2o', 'NEVLAS_6P_ORE2', bowl3 < 3, '3구역 파워 3개(=6파워) → 2광석')}
          </div>
        );
      }
      break;

    case 'IVITS':
      if (hasPi) {
        buttons.push(<span key="pi-info" className="text-[9px] text-green-400">[PI] 우주정거장 배치 (맵에서 클릭)</span>);
      }
      break;

    case 'MOWEIDS':
      if (hasPi) {
        buttons.push(<span key="pi-todo" className="text-[9px] text-gray-500">[PI] 건물 링 (+2파워) (미구현)</span>);
      }
      break;

    case 'TINKEROIDS':
      if (hasPi) {
        buttons.push(<span key="pi-info" className="text-[9px] text-green-400">[PI] 개인 액션 타일 (라운드 시작 시 선택)</span>);
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
