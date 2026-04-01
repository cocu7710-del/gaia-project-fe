import { useEffect, useState } from 'react';
import { roomApi } from '../api/client';
import type { FederationTileInfo } from '../api/client';
import { FEDERATION_TOKEN_IMAGE_MAP } from '../constants/federationTokenImage';
import { useGameStore } from '../store/gameStore';

interface Props {
  roomId: string;
  playerId: string | null;
  isMyTurn: boolean;
  refreshKey?: number;
}

export default function FederationSupply({ roomId, playerId, isMyTurn, refreshKey = 0 }: Props) {
  const [tiles, setTiles] = useState<FederationTileInfo[]>([]);
  const [fleetTiles, setFleetTiles] = useState<FederationTileInfo[]>([]);
  const [minTokens, setMinTokens] = useState(0);
  const { federationMode, setFederationMode, setFederationPhase, turnState, gamePhase, seats, fleetProbes } = useGameStore();

  const mySeat = seats.find(s => s.playerId === playerId);
  const isIvits = mySeat?.raceCode === 'IVITS';

  // 내가 입장한 우주선 목록
  const myFleets = playerId ? Object.entries(fleetProbes)
    .filter(([, ids]) => ids.includes(playerId))
    .map(([fleet]) => fleet) : [];

  useEffect(() => {
    roomApi.getFederationTiles(roomId).then(res => {
      setTiles(res.data.generalSupply ?? []);
      setFleetTiles(res.data.forgottenFleet ?? []);
    }).catch(() => { setTiles([]); setFleetTiles([]); });
  }, [roomId, refreshKey]);

  const isPlaying = gamePhase === 'PLAYING';
  const hasPendingAction = turnState.pendingActions.length > 0;
  const canDeclare = isMyTurn && isPlaying && !hasPendingAction && !federationMode;
  const isSelectingTile = federationMode?.phase === 'SELECT_TILE';
  const isPlacingTokens = federationMode?.phase === 'PLACE_TOKENS';

  const handleDeclare = () => {
    if (!canDeclare) return;
    setFederationMode({ selectedBuildings: [], placedTokens: [], phase: 'SELECT_BUILDINGS' });
  };

  const handleCancel = () => {
    setFederationMode(null);
  };

  const handleConfirmPlacement = async () => {
    if (!federationMode || !playerId) return;
    try {
      const res = await roomApi.validateFederation(roomId, playerId, federationMode.placedTokens, federationMode.selectedBuildings);
      if (!res.data.success) {
        alert(res.data.message ?? '연방 조건 미충족');
        return;
      }
      // 조건 통과 → 타일 선택 단계
      setFederationPhase('SELECT_TILE');
    } catch (e: any) {
      alert(e?.response?.data?.message ?? '연방 검증 오류');
    }
  };

  const handleSelectTile = (tileCode: string) => {
    if (!federationMode || !playerId) return;
    const { addPendingAction, turnState: ts } = useGameStore.getState();
    // 중복 클릭 방지
    if (ts.pendingActions.some(a => a.type === 'FORM_FEDERATION')) return;
    addPendingAction({
      id: `action-${Date.now()}-${Math.random()}`,
      type: 'FORM_FEDERATION',
      timestamp: Date.now(),
      payload: {
        tileCode,
        placedTokens: federationMode.placedTokens,
        selectedBuildings: federationMode.selectedBuildings,
      },
    });
    // 3삽 광산 / 무한거리 광산: 광산 배치 phase로 전환 (프리뷰 유지)
    if (tileCode === 'FED_EXP_TILE_5' || tileCode === 'FED_EXP_TILE_7') {
      useGameStore.setState((s) => ({
        federationMode: s.federationMode ? { ...s.federationMode, phase: 'PLACE_SPECIAL_MINE' as const, specialTileCode: tileCode } : null,
      }));
    }
  };

  if (tiles.length === 0) return null;

  return (
    <div className="game-panel">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[10px] font-bold text-gray-400">연방 타일</h4>
      </div>

      {/* 건물 선택/토큰 배치/타일 선택 안내는 맵 중앙 배너에서 처리 */}

      {/* 타일 목록 */}
      <div className="flex flex-wrap gap-1 justify-center">
        {tiles.map((tile) => {
          const imgSrc = FEDERATION_TOKEN_IMAGE_MAP[tile.tileCode];
          const isEmpty = tile.quantity <= 0;
          const fedPending = turnState.pendingActions.find(a => a.type === 'FORM_FEDERATION');
          const alreadySelected = !!fedPending;
          const isThisSelected = fedPending && (fedPending.payload as any)?.tileCode === tile.tileCode;
          const canSelect = isSelectingTile && !isEmpty && !alreadySelected;
          return (
            <div
              key={tile.tileCode}
              onClick={canSelect ? () => handleSelectTile(tile.tileCode) : undefined}
              className={`relative ${isEmpty ? 'opacity-30' : ''} ${
                isThisSelected ? 'ring-2 ring-green-400 opacity-60' : ''
              } ${
                canSelect ? 'cursor-pointer ring-2 ring-orange-400 hover:brightness-125' : ''
              }`}
              title={`${tile.description} (${tile.quantity}개)`}
            >
              {imgSrc ? (
                <img src={imgSrc} alt={tile.tileCode} className="h-[60px] w-auto object-contain" draggable={false} />
              ) : (
                <div className="h-[72px] w-24 bg-gray-700 rounded flex items-center justify-center">
                  <span className="text-[8px] text-gray-400">{tile.tileCode.replace('FED_', '')}</span>
                </div>
              )}
              <span className="absolute -top-2 -right-2 bg-gray-900 text-white text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-gray-600">
                {tile.quantity}
              </span>
            </div>
          );
        })}
      </div>

      {/* 우주선 연방 타일은 우주선 보드(FederationTiles)에서 클릭하여 선택 */}
      {isSelectingTile && (
        <div className="mt-1 text-[8px] text-gray-400">입장한 우주선의 연방 타일도 클릭하여 선택 가능</div>
      )}

      {/* 배치 상태 */}
      {federationMode && (
        <div className="mt-1 text-[8px] text-gray-400">
          건물: {federationMode.selectedBuildings?.length ?? 0}개 | {isIvits ? 'QIC' : '토큰'}: {federationMode.placedTokens.length}개
        </div>
      )}
    </div>
  );
}
