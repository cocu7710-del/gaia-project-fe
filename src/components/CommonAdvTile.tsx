import { useGameStore } from '../store/gameStore';
import { ADV_TECH_TILE_IMAGE_MAP } from '../constants/advTechTileImage';
import type { AdvancedTechTileInfo, PlayerStateResponse } from '../api/client';

interface CommonAdvTileProps {
  roomId: string;
  playerStates: PlayerStateResponse[];
  isMyTurn: boolean;
  mySeatNo: number | null;
}

/**
 * COMMON 고급 기술 타일 표시 컴포넌트
 * - 확정 버튼 아래에 배치
 * - 조건 타입 (VP 25 / 함대 3) 및 충족 여부 표시
 * - 기술 타일 선택 모드에서 클릭 가능
 */
export default function CommonAdvTile({ playerStates, isMyTurn, mySeatNo }: CommonAdvTileProps) {
  const techTileData = useGameStore(s => s.techTileData);
  const commonAdvTileCondition = useGameStore(s => s.commonAdvTileCondition);
  const tentativeTechTileCode = useGameStore(s => s.tentativeTechTileCode);
  const setTentativeTechTile = useGameStore(s => s.setTentativeTechTile);
  const turnState = useGameStore(s => s.turnState);
  const gamePhase = useGameStore(s => s.gamePhase);
  const fleetShipMode = useGameStore(s => s.fleetShipMode);
  const fleetProbes = useGameStore(s => s.fleetProbes);
  const myPlayerId = useGameStore(s => s.playerId);
  const federationGroups = useGameStore(s => s.federationGroups);
  const itarsGaiaChoice = useGameStore(s => s.itarsGaiaChoice);

  if (!techTileData || !commonAdvTileCondition) return null;

  // COMMON 고급 타일 찾기
  const commonAdvTile = techTileData.advancedTiles.find(t => t.trackCode === 'COMMON');
  if (!commonAdvTile || commonAdvTile.isTaken) return null;

  const imgSrc = ADV_TECH_TILE_IMAGE_MAP[commonAdvTile.tileCode];
  if (!imgSrc) return null;

  // 내 플레이어 상태
  const myState = playerStates.find(p => p.seatNo === mySeatNo);
  const previewState = turnState.previewPlayerState;
  const effectiveState = previewState && mySeatNo != null ? previewState : myState;

  // 조건 충족 여부
  const conditionMet = checkCondition(commonAdvTileCondition, effectiveState, fleetProbes, myPlayerId);

  // 클릭 가능 여부 (기술 타일 선택 모드)
  const hasFleetTechPending = turnState.pendingActions.some(
    a => a.type === 'FLEET_SHIP_ACTION' && ['REBELLION_TECH', 'TWILIGHT_UPGRADE', 'ECLIPSE_TECH'].includes((a.payload as any).actionCode)
  );
  const isItarsTilePicking = itarsGaiaChoice?.tilePicking === true && itarsGaiaChoice.itarsPlayerId === myPlayerId;
  const hasPendingTechPickBase = isMyTurn && (!fleetShipMode || hasFleetTechPending) && turnState.pendingActions.some(
    a => (a.type === 'UPGRADE_BUILDING' &&
      (a.payload.toType === 'RESEARCH_LAB' || a.payload.toType === 'ACADEMY'
        || (a.payload.toType === 'PLANETARY_INSTITUTE' && a.payload.factionCode === 'SPACE_GIANTS')))
    || (a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'REBELLION_TECH' && !(a.payload as any).trackCode)
    || (a.type === 'FLEET_SHIP_ACTION' && (a.payload as any).actionCode === 'TWILIGHT_UPGRADE' && (a.payload as any).hexQ != null)
    || (a.type === 'FORM_FEDERATION' && a.payload.tileCode === 'FED_EXP_TILE_1')
  );
  const hasPendingTechPick = hasPendingTechPickBase || isItarsTilePicking;
  const hasUsableFedToken = federationGroups.some(g => g.playerId === myPlayerId && !g.used);
  const hasUncoveredBasicTile = techTileData.basicTiles.some(t => (t.ownerPlayerIds ?? []).includes(myPlayerId ?? ''));
  const canClick = hasPendingTechPick && !tentativeTechTileCode && conditionMet && hasUsableFedToken && hasUncoveredBasicTile;

  // 조건 텍스트
  const conditionLabel = commonAdvTileCondition === 'VP_25' ? 'VP25' : '3함대';

  return (
    <div className={`game-panel !border-amber-500/30 ${canClick ? 'cursor-pointer' : ''}`}
      style={{ marginTop: '0.2vw', padding: '0.2vw' }}
      onClick={canClick ? () => {
        setTentativeTechTile(commonAdvTile.tileCode, null);
      } : undefined}
    >
      <div className={`font-bold text-center ${conditionMet ? 'text-green-400' : 'text-red-400'}`}
        style={{ fontSize: '0.55vw', lineHeight: 1.2 }}>
        {conditionLabel}
      </div>
      <img src={imgSrc} alt={commonAdvTile.tileCode} style={{ width: '5.5vw', margin: '0 auto', display: 'block' }} className="object-contain rounded" draggable={false} />
    </div>
  );
}

function checkCondition(
  condition: string,
  playerState: PlayerStateResponse | null | undefined,
  fleetProbes: Record<string, string[]>,
  myPlayerId: string | null,
): boolean {
  if (!playerState) return false;
  if (condition === 'VP_25') {
    return playerState.victoryPoints >= 25;
  }
  if (condition === 'FLEET_3') {
    return countFleetProbes(fleetProbes, myPlayerId) >= 3;
  }
  return false;
}

function countFleetProbes(fleetProbes: Record<string, string[]>, myPlayerId: string | null): number {
  if (!myPlayerId) return 0;
  let count = 0;
  for (const probes of Object.values(fleetProbes)) {
    if (probes.includes(myPlayerId)) count++;
  }
  return count;
}
