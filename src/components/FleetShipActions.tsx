import { useGameStore } from '../store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { ResourceCalculator } from '../utils/resourceCalculator';
import type { FleetShipAction } from '../types/turnActions';
import { FLEET_SHIP_ACTION_DEFS, FLEET_ORDER, FLEET_LABELS, FLEET_COLORS } from '../actions/actionRegistry';

interface FleetShipActionsProps {
  isMyTurn: boolean;
  mySeatNo: number | null;
  playerStates: { seatNo: number; [key: string]: any }[];
  playerId: string | null;
}

/** 함대 액션별 즉시 보상 (프리뷰용) */
function getFleetActionGain(actionCode: string, playerId: string | null): Record<string, number> | undefined {
  const state = useGameStore.getState();
  switch (actionCode) {
    case 'REBELLION_CONVERT': return { qic: 1, credit: 2 };
    case 'TF_MARS_VP': {
      // VP = 보유 기술 타일 수 + 2
      const td = state.techTileData;
      const pid = playerId ?? '';
      const basicCount = td?.basicTiles.filter(t => t.ownerPlayerIds?.includes(pid)).length ?? 0;
      return { vp: basicCount + 2 };
    }
    case 'ECLIPSE_VP': {
      // VP = 식민화한 고유 행성 타입 수 + 2
      const pid = playerId ?? '';
      const myBuildings = state.buildings.filter((b: any) => b.playerId === pid
        && b.buildingType !== 'GAIAFORMER' && b.buildingType !== 'SPACE_STATION' && !b.isLantidsMine);
      const planetTypes = new Set<string>();
      for (const b of myBuildings) {
        const hex = state.hexes.find((h: any) => h.hexQ === b.hexQ && h.hexR === b.hexR);
        if (hex && hex.planetType !== 'EMPTY' && hex.planetType !== 'TRANSDIM') {
          planetTypes.add(hex.planetType);
        }
      }
      return { vp: planetTypes.size + 2 };
    }
    default: return undefined;
  }
}

export default function FleetShipActions({ isMyTurn, mySeatNo, playerStates, playerId }: FleetShipActionsProps) {
  const { fleetProbes, turnState, gamePhase, fleetShipMode, setFleetShipMode, addPendingAction, clearPendingActions, usedPowerActionCodes } = useGameStore(useShallow(s => ({
    fleetProbes: s.fleetProbes, turnState: s.turnState, gamePhase: s.gamePhase, fleetShipMode: s.fleetShipMode,
    setFleetShipMode: s.setFleetShipMode, addPendingAction: s.addPendingAction, clearPendingActions: s.clearPendingActions,
    usedPowerActionCodes: s.usedPowerActionCodes,
  })));

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
    if (!isMyTurn || hasPendingAction || inFleetShipMode || usedPowerActionCodes.includes(actionCode)) return;

    const def = FLEET_SHIP_ACTION_DEFS[actionCode];
    if (!def) return;

    if (currentState && !ResourceCalculator.canAfford(currentState as any, def.cost)) return;

    // 가이아포머 필요 액션: 재고 체크
    if (def.requiresGaiaformer && (!currentState || (currentState as any).stockGaiaformer <= 0)) return;

    if (def.needsTrack) {
      // trackCode 없이 pending 추가 → TechTracks에서 트랙 선택
      const action: FleetShipAction = {
        id: `fsa-${Date.now()}-${Math.random()}`,
        type: 'FLEET_SHIP_ACTION',
        timestamp: Date.now(),
        payload: { fleetName: def.fleetName, actionCode: def.actionCode, cost: def.cost, isImmediate: true },
      };
      addPendingAction(action);
      return;
    }

    if (def.needsTile) {
      const action: FleetShipAction = {
        id: `fsa-${Date.now()}-${Math.random()}`,
        type: 'FLEET_SHIP_ACTION',
        timestamp: Date.now(),
        payload: { fleetName: def.fleetName, actionCode: def.actionCode, cost: def.cost, isImmediate: true },
      };
      addPendingAction(action);
      return;
    }

    if (def.actionCode === 'TWILIGHT_FED') {
      // 연방 토큰 선택 모드 진입 (SeatSelector에서 토큰 클릭 시 pending 추가)
      setFleetShipMode({
        actionCode: def.actionCode,
        fleetName: def.fleetName,
        cost: def.cost,
        needsFederationToken: true,
      });
      return;
    }

    if (def.hexSelectType) {
      // pending action 먼저 추가 → 자원 감소 프리뷰 즉시 표시
      const action: FleetShipAction = {
        id: `fsa-${Date.now()}-${Math.random()}`,
        type: 'FLEET_SHIP_ACTION',
        timestamp: Date.now(),
        payload: { fleetName: def.fleetName, actionCode: def.actionCode, cost: def.cost, isImmediate: true },
      };
      addPendingAction(action);
      // hex 선택 모드 진입
      setFleetShipMode({
        actionCode: def.actionCode,
        fleetName: def.fleetName,
        cost: def.cost,
        needsGaiaformHex: def.hexSelectType === 'GAIAFORM',
        needsAsteroidHex: def.hexSelectType === 'ASTEROID_MINE',
        needsUpgradeMineToTs: def.hexSelectType === 'UPGRADE_MINE_TO_TS',
        needsTsToRl: def.hexSelectType === 'UPGRADE_TS_TO_RL',
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
        gain: getFleetActionGain(actionCode, playerId),
      },
    };
    addPendingAction(action);
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
                const hasGaiaformer = !def.requiresGaiaformer || (currentState && (currentState as any).stockGaiaformer > 0);
                const alreadyUsed = usedPowerActionCodes.includes(code);
                const canClick = isMyTurn && !hasPendingAction && !inFleetShipMode && canAfford && hasGaiaformer && !alreadyUsed;
                const isSelectedMode = fleetShipMode?.actionCode === code;

                return (
                  <button
                    key={code}
                    onClick={() => handleActionClick(code)}
                    disabled={!canClick}
                    title={def.description}
                    className={`text-[8px] px-1 py-0.5 rounded border transition ${
                      isSelectedMode
                        ? 'bg-yellow-500 text-black border-yellow-400'
                        : !canAfford && isMyTurn
                          ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                          : canClick
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600 cursor-pointer'
                            : 'bg-gray-800 text-gray-600 border-gray-700 cursor-default'
                    }`}
                  >
                    {def.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {inFleetShipMode && (
        <div className="mt-1 flex justify-end">
          <button
            onClick={() => { clearPendingActions(); setFleetShipMode(null); }}
            className="text-[8px] text-gray-400 hover:text-white"
          >
            [취소]
          </button>
        </div>
      )}
    </div>
  );
}
