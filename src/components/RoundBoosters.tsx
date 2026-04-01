import type { BoosterOfferResponse, PlayerStateResponse, SeatView } from '../api/client';
import { BOOSTER_IMAGE_MAP } from '../constants/boosterImage';
import { useGameStore } from '../store/gameStore';
import type { SelectBoosterAction } from '../types/turnActions';
import { PLANET_COLORS } from '../constants/colors';

import { BOOSTER_ACTION_DEFS } from '../actions/actionRegistry';

interface RoundBoostersProps {
  boosters: BoosterOfferResponse[];
  mySeatNo: number | null;
  boosterPickSeatNo: number;
  gamePhase: string | null;
  seats: SeatView[];
  onSelectBooster: (boosterCode: string) => void;
  selectingPassBooster?: boolean;
  onPassBoosterSelect?: (boosterCode: string) => void;
  onCancelPassBooster?: () => void;
  boosterActionUsed?: boolean;
  onUseBoosterAction?: (boosterCode: string, actionType: string) => void;
  isMyTurn?: boolean;
  playerStates?: PlayerStateResponse[];
}

export default function RoundBoosters({
  boosters,
  mySeatNo,
  boosterPickSeatNo,
  gamePhase,
  seats,
  onSelectBooster: _onSelectBooster,
  selectingPassBooster,
  onPassBoosterSelect,
  onCancelPassBooster,
  boosterActionUsed: _boosterActionUsed,
  onUseBoosterAction,
  isMyTurn,
  playerStates = [],
}: RoundBoostersProps) {
  const { turnState, addPendingAction, setTentativeBooster } = useGameStore();

  // 좌석 번호로 색상 찾기
  const getSeatColor = (seatNo: number | null): string | null => {
    if (seatNo === null) return null;
    const seat = seats.find((s) => s.seatNo === seatNo);
    return seat ? PLANET_COLORS[seat.homePlanetType] || '#666' : null;
  };

  const isBoosterPhase = gamePhase === 'BOOSTER_SELECTION';

  // 부스터 클릭 핸들러
  const handleBoosterClick = (boosterCode: string) => {
    if (selectingPassBooster) {
      // 패스 부스터도 임시 선택 → 확정 시 전송
      if (turnState.tentativeBooster) {
        alert('이미 부스터를 선택했습니다. 확정하거나 초기화하세요.');
        return;
      }
      setTentativeBooster(boosterCode);
      return;
    }

    if (turnState.tentativeBooster) {
      alert('이미 부스터를 선택했습니다. 확정하거나 초기화하세요.');
      return;
    }

    const action: SelectBoosterAction = {
      id: `action-${Date.now()}-${Math.random()}`,
      type: 'SELECT_BOOSTER',
      timestamp: Date.now(),
      payload: { boosterCode },
    };

    addPendingAction(action);
    setTentativeBooster(boosterCode);
  };

  return (
    <div className={`game-panel ${selectingPassBooster ? 'ring-2 ring-amber-500/70 !border-amber-500/30' : ''}`}>
      <div className="flex justify-between items-center mb-1">
        <h4 className="panel-title !mb-0">라운드 부스터</h4>
        {selectingPassBooster && (
          <button
            onClick={onCancelPassBooster}
            className="text-[9px] text-gray-400 hover:text-white"
          >
            취소
          </button>
        )}
      </div>

      {boosters.length > 0 ? (
        <div className="flex gap-0.5 justify-center">
          {boosters.map((booster) => {
            const isPicked = booster.pickedBySeatNo !== null;
            const isTentativelySelected = turnState.tentativeBooster === booster.boosterCode;
            const canSelectForBoosterPhase = isBoosterPhase && !isPicked && mySeatNo === boosterPickSeatNo && !turnState.tentativeBooster;
            const canSelectForPass = !!selectingPassBooster && !isPicked;
            const canSelect = canSelectForBoosterPhase || canSelectForPass;
            const imgSrc = BOOSTER_IMAGE_MAP[booster.boosterCode];

            // 내 부스터 액션 버튼 표시 여부
            const isMyBooster = booster.pickedBySeatNo === mySeatNo;
            const boosterDef = BOOSTER_ACTION_DEFS[booster.boosterCode];
            const actionType = boosterDef?.actionType;
            const hasAction = !!actionType;
            const isPlaying = gamePhase === 'PLAYING';
            // 해당 부스터 소유 플레이어의 액션 사용 여부 (전체 playerStates에서 조회)
            const ownerState = playerStates.find(p => p.seatNo === booster.pickedBySeatNo);
            const ownerActionUsed = ownerState?.boosterActionUsed ?? false;
            // 포머 배치 액션: 가이아포머 재고 필요
            const noGaiaformer = boosterDef?.requiresGaiaformer && (ownerState?.stockGaiaformer ?? 0) <= 0;
            const canUseAction = isMyBooster && hasAction && isPlaying && isMyTurn && !ownerActionUsed && !selectingPassBooster && turnState.pendingActions.length === 0 && !noGaiaformer;

            return (
              <div
                key={booster.id}
                className="flex flex-col items-center flex-1"
                style={{ maxWidth: '11.7%' }}
              >
                {/* 부스터 이미지 */}
                <button
                  onClick={() => canSelect && handleBoosterClick(booster.boosterCode)}
                  disabled={!canSelect}
                  className={`relative rounded overflow-hidden transition-all w-full ${
                    canSelect
                      ? 'hover:scale-105 hover:ring-2 hover:ring-yellow-400 cursor-pointer'
                      : 'cursor-default'
                  } ${isTentativelySelected ? 'ring-2 ring-yellow-400 opacity-60' : ''} ${
                    canSelectForPass ? 'ring-1 ring-yellow-500' : ''
                  }`}
                  title={booster.boosterCode}
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={booster.boosterCode}
                      className="w-full h-auto"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full aspect-[1/2] bg-purple-700 flex items-center justify-center">
                      <span className="text-[8px] text-white">
                        {booster.boosterCode.replace('BOOSTER_', '')}
                      </span>
                    </div>
                  )}

                  {/* 선택 가능 표시 */}
                  {canSelect && (
                    <div className="absolute inset-0 bg-yellow-400/20" />
                  )}

                  {/* 임시 선택 표시 */}
                  {isTentativelySelected && (
                    <div className="absolute inset-0 bg-yellow-400/40 border-2 border-yellow-400 border-dashed" />
                  )}
                </button>

                {/* 선택한 플레이어 색상 동그라미 */}
                <div className="mt-1 h-4 flex justify-center">
                  {isPicked ? (
                    <div
                      className="w-4 h-4 rounded-full border-2 border-white"
                      style={{ backgroundColor: getSeatColor(booster.pickedBySeatNo) || '#666' }}
                      title={`${booster.pickedBySeatNo}번 좌석`}
                    />
                  ) : isTentativelySelected && mySeatNo ? (
                    <div
                      className="w-4 h-4 rounded-full border-2 border-yellow-400 border-dashed opacity-70"
                      style={{ backgroundColor: getSeatColor(mySeatNo) || '#666' }}
                      title="선택 예정"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-gray-600 bg-gray-700" />
                  )}
                </div>

                {/* 부스터 액션은 개인판(SeatSelector)에서 사용 */}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center">부스터 대기 중</p>
      )}
    </div>
  );
}
