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
    const { addPendingAction } = useGameStore.getState();
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
    // federationMode는 유지 (확정/초기화 시 정리)
  };

  if (tiles.length === 0) return null;

  return (
    <div className="game-panel">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[10px] font-bold text-gray-400">연방 타일</h4>
        {!federationMode && (
          <button
            onClick={handleDeclare}
            disabled={!canDeclare}
            className={`text-[8px] px-1.5 py-0.5 rounded border font-bold transition
              ${canDeclare
                ? 'border-orange-500 text-orange-300 hover:bg-orange-500/20 cursor-pointer'
                : 'border-gray-600 text-gray-600 cursor-not-allowed'
              }`}
          >
            연방 선언
          </button>
        )}
        {federationMode && (
          <button
            onClick={handleCancel}
            className="text-[8px] px-1.5 py-0.5 rounded border border-red-500 text-red-300 hover:bg-red-500/20 cursor-pointer font-bold"
          >
            취소
          </button>
        )}
      </div>

      {/* 건물 선택 단계 */}
      {federationMode?.phase === 'SELECT_BUILDINGS' && (
        <div className="mb-1 p-1 bg-orange-900/50 border border-orange-600/30 rounded text-[8px] text-orange-200">
          맵에서 연방에 포함할 <b>내 건물</b>을 클릭하세요.
          <span className="ml-1 text-yellow-300">선택: {federationMode.selectedBuildings?.length ?? 0}개</span>
          <br/>
          <button onClick={async () => {
            if (!federationMode || !playerId) return;
            try {
              const res = await roomApi.validateFederationBuildings(roomId, playerId, federationMode.selectedBuildings);
              if (!res.data.success) {
                alert(res.data.message ?? '건물 선택 조건 미충족');
                return;
              }
              setMinTokens(res.data.minTokens ?? 0);
              setFederationPhase('PLACE_TOKENS');
            } catch (e: any) {
              alert(e?.response?.data?.message ?? '검증 오류');
            }
          }}
            className="mt-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[8px] font-bold cursor-pointer">
            토큰 배치로 →
          </button>
        </div>
      )}

      {/* 토큰 배치 단계 */}
      {isPlacingTokens && (() => {
        const preview = turnState.previewPlayerState;
        const remaining = isIvits
          ? (preview?.qic ?? 0)
          : ((preview?.powerBowl1 ?? 0) + (preview?.powerBowl2 ?? 0) + (preview?.powerBowl3 ?? 0));
        return (
          <div className="mb-1 p-1 bg-blue-900/50 border border-blue-600/30 rounded text-[8px] text-blue-200">
            빈 헥스를 클릭하여 {isIvits ? 'QIC' : '파워 토큰'}으로 건물을 연결하세요.
            <span className="ml-1 text-yellow-300">최단거리: {minTokens}</span>
            <span className="ml-1 text-gray-400">남은 {isIvits ? 'QIC' : '토큰'}: {remaining}</span>
            <br/>
            <button onClick={handleConfirmPlacement}
              className="mt-1 px-2 py-0.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-[8px] font-bold cursor-pointer">
              배치 완료
            </button>
          </div>
        );
      })()}

      {/* 타일 선택 단계 */}
      {isSelectingTile && (
        <div className="mb-1 p-1 bg-orange-900/50 border border-orange-600/30 rounded text-[8px] text-orange-200">
          연방 타일을 선택하세요.
        </div>
      )}

      {/* 타일 목록 */}
      <div className="flex flex-wrap gap-1">
        {tiles.map((tile) => {
          const imgSrc = FEDERATION_TOKEN_IMAGE_MAP[tile.tileCode];
          const isEmpty = tile.quantity <= 0;
          const canSelect = isSelectingTile && !isEmpty;
          return (
            <div
              key={tile.tileCode}
              onClick={canSelect ? () => handleSelectTile(tile.tileCode) : undefined}
              className={`relative ${isEmpty ? 'opacity-30' : ''} ${
                canSelect ? 'cursor-pointer ring-2 ring-orange-400 hover:brightness-125' : ''
              }`}
              title={`${tile.description} (${tile.quantity}개)`}
            >
              {imgSrc ? (
                <img src={imgSrc} alt={tile.tileCode} className="h-8 w-auto object-contain" draggable={false} />
              ) : (
                <div className="h-12 w-16 bg-gray-700 rounded flex items-center justify-center">
                  <span className="text-[8px] text-gray-400">{tile.tileCode.replace('FED_', '')}</span>
                </div>
              )}
              <span className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-gray-600">
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
