import type { BoosterOfferResponse, PlayerStateResponse, SeatView } from '../api/client';
import { BOOSTER_IMAGE_MAP } from '../constants/boosterImage';
import { useGameStore } from '../store/gameStore';
import type { SelectBoosterAction } from '../types/turnActions';
import { PLANET_COLORS } from '../constants/colors';

// 부스터별 액션 타입 (액션 있는 부스터만)
const BOOSTER_ACTION_TYPE: Record<string, string> = {
  BOOSTER_12: 'PLACE_GAIAFORMER',
  BOOSTER_13: 'NAVIGATION_PLUS_3',
  BOOSTER_14: 'TERRAFORM_ONE_STEP',
};

// 부스터 액션 타입별 한글 이름
const BOOSTER_ACTION_LABEL: Record<string, string> = {
  TERRAFORM_ONE_STEP: '테라포밍 1삽',
  PLACE_GAIAFORMER: '포머 배치',
  NAVIGATION_PLUS_3: '항해+3',
};

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
  onSelectBooster,
  selectingPassBooster,
  onPassBoosterSelect,
  onCancelPassBooster,
  boosterActionUsed,
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
      onPassBoosterSelect?.(boosterCode);
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
      <div className="flex justify-between items-center mb-2">
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
            const actionType = BOOSTER_ACTION_TYPE[booster.boosterCode];
            const hasAction = !!actionType;
            const isPlaying = gamePhase === 'PLAYING';
            // 해당 부스터 소유 플레이어의 액션 사용 여부 (전체 playerStates에서 조회)
            const ownerState = playerStates.find(p => p.seatNo === booster.pickedBySeatNo);
            const ownerActionUsed = ownerState?.boosterActionUsed ?? false;
            const canUseAction = isMyBooster && hasAction && isPlaying && isMyTurn && !ownerActionUsed && !selectingPassBooster && turnState.pendingActions.length === 0;

            return (
              <div
                key={booster.id}
                className="flex flex-col items-center flex-1"
                style={{ maxWidth: '14%' }}
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
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-gray-600 bg-gray-700" />
                  )}
                </div>

                {/* 내 부스터 액션 버튼 */}
                {isPicked && hasAction && isPlaying && (
                  <button
                    onClick={() => canUseAction && onUseBoosterAction?.(booster.boosterCode, actionType)}
                    disabled={!canUseAction}
                    className={`mt-1 w-full text-[8px] py-0.5 rounded font-bold transition-colors ${
                      ownerActionUsed
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed line-through'
                        : canUseAction
                          ? 'bg-orange-600 hover:bg-orange-500 text-white cursor-pointer'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                    title={ownerActionUsed ? '이미 사용함' : BOOSTER_ACTION_LABEL[actionType] || actionType}
                  >
                    {ownerActionUsed ? '사용됨' : BOOSTER_ACTION_LABEL[actionType] || actionType}
                  </button>
                )}
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
