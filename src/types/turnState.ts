import type { GameAction } from './turnActions';
import type { PlayerStateResponse, GameBuilding } from '../api/client';

export interface TurnState {
  originalPlayerState: PlayerStateResponse | null;
  pendingActions: GameAction[];
  previewPlayerState: PlayerStateResponse | null;
  tentativeBuildings: GameBuilding[];
  tentativeBooster: string | null;  // 선택한 부스터 코드
  burnPowerCount: number;           // 이번 턴에 소각한 횟수 (자유 행동)
  freeConvertActions: { code: string; afterMain: boolean }[];  // 프리 액션 (메인 액션 전/후 구분)
  isConfirming: boolean;
  confirmError: string | null;
}
