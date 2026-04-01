import { useGameStore } from '../store/gameStore';

export default function GameInfo() {
  const { status, currentRound, gamePhase, economyTrackOption, gameCreatedAt, nextSetupSeatNo, currentTurnSeatNo, seats,
    itarsGaiaChoice, tinkeroidsActionChoice, leechBatch } = useGameStore();

  const getStatusText = () => {
    switch (status) {
      case 'READY': return '대기 중';
      case 'IN_PROGRESS': return '게임 진행 중';
      case 'FINISHED': return '게임 종료';
      default: return status;
    }
  };

  const getPhaseText = () => {
    switch (gamePhase) {
      case 'SETUP_MINE_FIRST': return '초기 광산 배치 (1차)';
      case 'SETUP_MINE_SECOND': return '초기 광산 배치 (2차)';
      case 'SETUP_MINE_XENOS': return '제노스 추가 광산 배치';
      case 'BOOSTER_SELECTION': return '부스터 선택';
      case 'PLAYING': return `${currentRound ?? '?'}라운드 진행`;
      case 'POWER_INCOME_PHASE': return '파워 수입 선택';
      case 'ITARS_GAIA_PHASE': return '아이타 의회 능력 선택';
      case 'TINKEROIDS_ACTION_PHASE': return '팅커로이드 액션 선택';
      default: return gamePhase || '-';
    }
  };

  const getCurrentTurnPlayerName = () => {
    // 특수 페이즈: playerId로 좌석 찾기
    if (gamePhase === 'ITARS_GAIA_PHASE' || gamePhase === 'TINKEROIDS_ACTION_PHASE') {
      const specialPlayerId = itarsGaiaChoice?.itarsPlayerId ?? tinkeroidsActionChoice?.tinkeroidsPlayerId;
      if (!specialPlayerId) return null;
      return seats.find((s) => s.playerId === specialPlayerId)?.raceNameKo ?? null;
    }
    const seatNo = gamePhase === 'PLAYING' ? currentTurnSeatNo : nextSetupSeatNo;
    if (!seatNo) return null;
    return seats.find((s) => s.seatNo === seatNo)?.raceNameKo ?? null;
  };

  const currentTurnPlayer = getCurrentTurnPlayerName();

  return (
    <div className="game-panel !py-2 !px-4 flex items-center gap-5 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 text-[10px] uppercase tracking-wider">상태</span>
        <span className="font-medium text-gray-200">{getStatusText()}</span>
      </div>

      {currentRound && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">라운드</span>
          <span className="font-semibold text-blue-300">{currentRound}</span>
        </div>
      )}

      {gamePhase && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">페이즈</span>
          <span className="font-medium text-gray-200">{getPhaseText()}</span>
        </div>
      )}

      {leechBatch ? (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">현재 턴</span>
          <span className="font-semibold text-purple-400">파워 리치 진행 중</span>
        </div>
      ) : currentTurnPlayer ? (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">현재 턴</span>
          <span className={`font-semibold ${
            gamePhase === 'ITARS_GAIA_PHASE' || gamePhase === 'TINKEROIDS_ACTION_PHASE'
              ? 'text-blue-400' : 'text-amber-400'
          }`}>{currentTurnPlayer}</span>
        </div>
      ) : null}

      {economyTrackOption && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider">경제</span>
          <span className="font-medium text-gray-200">{economyTrackOption}</span>
        </div>
      )}

      {gameCreatedAt && (
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-gray-500 text-[10px]">
            {new Date(gameCreatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  );
}
