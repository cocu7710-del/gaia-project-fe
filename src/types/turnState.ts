import type { GameAction } from './turnActions';
import type { PlayerStateResponse, GameBuilding } from '../api/client';

export interface TurnState {
  originalPlayerState: PlayerStateResponse | null;
  pendingActions: GameAction[];
  previewPlayerState: PlayerStateResponse | null;
  tentativeBuildings: GameBuilding[];
  tentativeBooster: string | null;  // 선택한 부스터 코드
  burnPowerCount: number;           // 이번 턴에 소각한 횟수 (자유 행동)
  freeConvertActions: string[];     // 프리 액션 변환 코드 목록 (턴 확정 시 일괄 처리)
  isConfirming: boolean;
  confirmError: string | null;
}
