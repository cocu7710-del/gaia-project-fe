import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { ResourceCalculator } from '../utils/resourceCalculator';
import { roomApi } from '../api/client';
import type { FleetShipAction, ResourceCost } from '../types/turnActions';
import type { TechTileInfo } from '../api/client';

interface FleetShipActionsProps {
  isMyTurn: boolean;
  mySeatNo: number | null;
  playerStates: { seatNo: number; [key: string]: any }[];
  playerId: string | null;
}

/** actionCode → { fleetName, label, cost, isImmediate, needsHex flags, description } */
const FLEET_SHIP_ACTION_DEFS: Record<string, {
  fleetName: string;
  label: string;
  cost: ResourceCost;
  isImmediate: boolean;
  terraformDiscount?: number;
  navBonus?: number;
  needsGaiaformHex?: boolean;
  needsAsteroidHex?: boolean;
  needsUpgradeMineToTs?: boolean;
  needsTsToRl?: boolean;
  needsTrack?: boolean;
  needsTile?: boolean;
  description: string;
}> = {
  // TF_MARS
  TF_MARS_VP:        { fleetName: 'TF_MARS',    label: 'QIC2→VP(타일+2)', cost: { qic: 2 }, isImmediate: true, description: 'QIC 2 소모 → 보유 기술 타일 수+2만큼 VP 획득' },
  TF_MARS_GAIAFORM:  { fleetName: 'TF_MARS',    label: '파워2→즉시가이아', cost: { power: 2 }, isImmediate: true, needsGaiaformHex: true, description: '파워 2 소모 → 차원변형 행성에 즉시 광산 건설' },
  TF_MARS_TERRAFORM: { fleetName: 'TF_MARS',    label: '크레딧3→테라1단계', cost: { credit: 3 }, isImmediate: false, terraformDiscount: 1, description: '크레딧 3 소모 → 다음 광산 건설 시 테라포밍 1단계 무료' },
  // ECLIPSE
  ECLIPSE_VP:        { fleetName: 'ECLIPSE',    label: 'QIC2→VP(행성+2)', cost: { qic: 2 }, isImmediate: true, description: 'QIC 2 소모 → 식민화한 행성 종류 수+2만큼 VP 획득' },
  ECLIPSE_TECH:      { fleetName: 'ECLIPSE',    label: '파워2+지식2→트랙+1', cost: { power: 2, knowledge: 2 }, isImmediate: true, needsTrack: true, description: '파워 2 + 지식 2 → 기술 트랙 1단계 전진' },
  ECLIPSE_MINE:      { fleetName: 'ECLIPSE',    label: '크레딧6→소행성광산', cost: { credit: 6 }, isImmediate: true, needsAsteroidHex: true, description: '크레딧 6 → 소행성 행성에 무료 광산 건설' },
  // REBELLION
  REBELLION_TECH:    { fleetName: 'REBELLION',  label: 'QIC3→기술타일', cost: { qic: 3 }, isImmediate: true, needsTile: true, description: 'QIC 3 → 기본 기술 타일 1장 획득' },
  REBELLION_UPGRADE: { fleetName: 'REBELLION',  label: '파워3+광석1→광산↑교역소', cost: { power: 3, ore: 1 }, isImmediate: true, needsUpgradeMineToTs: true, description: '파워 3 + 광석 1 → 내 광산을 교역소로 업그레이드' },
  REBELLION_CONVERT: { fleetName: 'REBELLION',  label: '지식2→QIC1+크레딧2', cost: { knowledge: 2 }, isImmediate: true, description: '지식 2 → QIC 1 + 크레딧 2 획득' },
  // TWILIGHT
  TWILIGHT_FED:      { fleetName: 'TWILIGHT',   label: 'QIC3→연방수입', cost: { qic: 3 }, isImmediate: true, description: 'QIC 3 → 연방 수입 (QIC+1 광석+1 VP+2)' },
  TWILIGHT_UPGRADE:  { fleetName: 'TWILIGHT',   label: '파워3+광석2→교역소↑연구소', cost: { power: 3, ore: 2 }, isImmediate: true, needsTsToRl: true, description: '파워 3 + 광석 2 → 내 교역소를 연구소로 업그레이드' },
  TWILIGHT_NAV:      { fleetName: 'TWILIGHT',   label: '지식1→항법+3', cost: { knowledge: 1 }, isImmediate: false, navBonus: 3, description: '지식 1 소모 → 다음 광산 건설 시 항법 거리 +3' },
  TWILIGHT_ARTIFACT: { fleetName: 'TWILIGHT',   label: '파워6→인공물', cost: { power: 6 }, isImmediate: true, description: '파워 6 → 인공물 획득 (VP+4, QIC+1)' },
};

const FLEET_ORDER = ['TF_MARS', 'ECLIPSE', 'REBELLION', 'TWILIGHT'] as const;
const FLEET_LABELS: Record<string, string> = {
  TF_MARS: 'TF 마스',
  ECLIPSE: '이클립스',
  REBELLION: '반란군',
  TWILIGHT: '트와일라잇',
};
const FLEET_COLORS: Record<string, string> = {
  TF_MARS: 'border-red-600',
  ECLIPSE: 'border-blue-500',
  REBELLION: 'border-yellow-500',
  TWILIGHT: 'border-purple-500',
};

const TECH_TRACKS = [
  { code: 'TERRA_FORMING', label: '테라포밍' },
  { code: 'NAVIGATION',    label: '항법' },
  { code: 'AI',            label: 'AI' },
  { code: 'GAIA_FORMING',  label: '가이아포밍' },
  { code: 'ECONOMY',       label: '경제' },
  { code: 'SCIENCE',       label: '과학' },
];

export default function FleetShipActions({ isMyTurn, mySeatNo, playerStates, playerId }: FleetShipActionsProps) {
  const { fleetProbes, turnState, gamePhase, fleetShipMode, setFleetShipMode, addPendingAction, roomId } = useGameStore();
  const [trackPickingFor, setTrackPickingFor] = useState<string | null>(null); // actionCode
  const [tilePickingFor, setTilePickingFor] = useState<string | null>(null); // actionCode
  const [availableTiles, setAvailableTiles] = useState<TechTileInfo[]>([]);

  useEffect(() => {
    if (tilePickingFor && roomId) {
      roomApi.getTechTracks(roomId).then(res => {
        setAvailableTiles(res.data.basicTiles.filter(t => !t.isTaken));
      }).catch(() => setAvailableTiles([]));
    }
  }, [tilePickingFor, roomId]);

  if (gamePhase !== 'PLAYING') return null;

  const currentState = turnState.previewPlayerState || playerStates.find(p => p.seatNo === mySeatNo);
  const hasPendingAction = turnState.pendingActions.length > 0;
  const inFleetShipMode = fleetShipMode !== null;

  // 현재 플레이어가 입장한 함대 목록
  const myFleets = FLEET_ORDER.filter(fleet =>
    playerId && (fleetProbes[fleet] ?? []).includes(playerId)
  );

  if (myFleets.length === 0) return null;

  const handleActionClick = (actionCode: string) => {
    if (!isMyTurn || hasPendingAction || inFleetShipMode) return;

    const def = FLEET_SHIP_ACTION_DEFS[actionCode];
    if (!def) return;

    if (currentState && !ResourceCalculator.canAfford(currentState as any, def.cost)) return;

    if (def.needsTrack) {
      setTrackPickingFor(actionCode);
      return;
    }

    if (def.needsTile) {
      setTilePickingFor(actionCode);
      return;
    }

    if (def.needsGaiaformHex || def.needsAsteroidHex || def.needsUpgradeMineToTs || def.needsTsToRl) {
      // hex 선택 모드 진입 (HexMap이 이 모드를 감지해서 적절한 헥스를 클릭 가능하게 함)
      setFleetShipMode({
        actionCode,
        fleetName: def.fleetName,
        cost: def.cost,
        needsGaiaformHex: def.needsGaiaformHex,
        needsAsteroidHex: def.needsAsteroidHex,
        needsUpgradeMineToTs: def.needsUpgradeMineToTs,
        needsTsToRl: def.needsTsToRl,
      });
      return;
    }

    // 즉시 또는 split(TF_MARS_TERRAFORM, TWILIGHT_NAV) → pending에 바로 추가
    const action: FleetShipAction = {
      id: `fsa-${Date.now()}-${Math.random()}`,
      type: 'FLEET_SHIP_ACTION',
      timestamp: Date.now(),
      payload: {
        fleetName: def.fleetName,
        actionCode,
        cost: def.cost,
        isImmediate: def.isImmediate,
        terraformDiscount: def.terraformDiscount,
        navBonus: def.navBonus,
      },
    };
    addPendingAction(action);
  };

  const handleTileSelect = (actionCode: string, tileCode: string) => {
    const def = FLEET_SHIP_ACTION_DEFS[actionCode];
    if (!def) return;

    const action: FleetShipAction = {
      id: `fsa-${Date.now()}-${Math.random()}`,
      type: 'FLEET_SHIP_ACTION',
      timestamp: Date.now(),
      payload: {
        fleetName: def.fleetName,
        actionCode,
        cost: def.cost,
        isImmediate: true,
        trackCode: tileCode, // tileCode is passed via trackCode field
      },
    };
    addPendingAction(action);
    setTilePickingFor(null);
    setAvailableTiles([]);
  };

  const handleTrackSelect = (actionCode: string, trackCode: string) => {
    const def = FLEET_SHIP_ACTION_DEFS[actionCode];
    if (!def) return;

    const action: FleetShipAction = {
      id: `fsa-${Date.now()}-${Math.random()}`,
      type: 'FLEET_SHIP_ACTION',
      timestamp: Date.now(),
      payload: {
        fleetName: def.fleetName,
        actionCode,
        cost: def.cost,
        isImmediate: true,
        trackCode,
      },
    };
    addPendingAction(action);
    setTrackPickingFor(null);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-2">
      <h4 className="text-xs font-semibold text-gray-400 mb-1">함대 선박 액션</h4>
      {myFleets.map(fleet => {
        const fleetActionCodes = Object.keys(FLEET_SHIP_ACTION_DEFS).filter(
          code => FLEET_SHIP_ACTION_DEFS[code].fleetName === fleet
        );
        return (
          <div key={fleet} className={`mb-1 border-l-2 pl-1.5 ${FLEET_COLORS[fleet]}`}>
            <div className="text-[9px] text-gray-400 font-semibold mb-0.5">{FLEET_LABELS[fleet]}</div>
            <div className="flex flex-wrap gap-1">
              {fleetActionCodes.map(code => {
                const def = FLEET_SHIP_ACTION_DEFS[code];
                const canAfford = !currentState || ResourceCalculator.canAfford(currentState as any, def.cost);
                const canClick = isMyTurn && !hasPendingAction && !inFleetShipMode && canAfford;
                const isSelectedMode = fleetShipMode?.actionCode === code;
                const isPickingTrack = trackPickingFor === code;
                const isPickingTile = tilePickingFor === code;

                return (
                  <div key={code}>
                    <button
                      onClick={() => handleActionClick(code)}
                      disabled={!canClick && !isPickingTrack && !isPickingTile}
                      title={def.description}
                      className={`text-[8px] px-1 py-0.5 rounded border transition ${
                        isSelectedMode
                          ? 'bg-yellow-500 text-black border-yellow-400'
                          : isPickingTrack || isPickingTile
                            ? 'bg-blue-600 text-white border-blue-400'
                            : !canAfford && isMyTurn
                              ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                              : canClick
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600 cursor-pointer'
                                : 'bg-gray-800 text-gray-600 border-gray-700 cursor-default'
                      }`}
                    >
                      {def.label}
                    </button>
                    {isPickingTrack && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {TECH_TRACKS.map(t => (
                          <button
                            key={t.code}
                            onClick={() => handleTrackSelect(code, t.code)}
                            className="text-[8px] px-1 py-0.5 bg-blue-700 hover:bg-blue-600 text-white rounded cursor-pointer"
                          >
                            {t.label}
                          </button>
                        ))}
                        <button
                          onClick={() => setTrackPickingFor(null)}
                          className="text-[8px] px-1 py-0.5 bg-gray-600 hover:bg-gray-500 text-white rounded cursor-pointer"
                        >
                          취소
                        </button>
                      </div>
                    )}
                    {isPickingTile && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5 max-w-[200px]">
                        {availableTiles.length === 0 ? (
                          <span className="text-[8px] text-gray-400">가져갈 수 있는 타일 없음</span>
                        ) : availableTiles.map(t => (
                          <button
                            key={t.tileCode}
                            onClick={() => handleTileSelect(code, t.tileCode)}
                            title={t.description}
                            className="text-[8px] px-1 py-0.5 bg-green-700 hover:bg-green-600 text-white rounded cursor-pointer"
                          >
                            {t.tileCode.replace('BASIC_', '')}
                          </button>
                        ))}
                        <button
                          onClick={() => { setTilePickingFor(null); setAvailableTiles([]); }}
                          className="text-[8px] px-1 py-0.5 bg-gray-600 hover:bg-gray-500 text-white rounded cursor-pointer"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {inFleetShipMode && (
        <div className="mt-1 text-[8px] text-yellow-400">
          헥스를 선택하세요 ({fleetShipMode!.actionCode})
          <button
            onClick={() => setFleetShipMode(null)}
            className="ml-1 text-gray-400 hover:text-white"
          >
            [취소]
          </button>
        </div>
      )}
    </div>
  );
}
