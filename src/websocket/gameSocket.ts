import { Client, type IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:9000') + '/ws';

export type EventType =
  | 'PLAYER_JOINED'
  | 'SEAT_CLAIMED'
  | 'BOOSTER_SELECTED'
  | 'GAME_STARTED'
  | 'MINE_PLACED'
  | 'TURN_CHANGED'
  | 'PLAYER_PASSED'
  | 'ROUND_STARTED'
  | 'ROUND_CHANGED'
  | 'LEECH_OFFERED'
  | 'LEECH_DECIDED'
  | 'DEFERRED_ACTION_REQUIRED'
  | 'STATE_UPDATED';

export interface GameEvent {
  roomId: string;
  eventType: EventType;
  playerId: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type GameEventHandler = (event: GameEvent) => void;

class GameSocketClient {
  private client: Client | null = null;
  private roomId: string | null = null;
  private handlers: GameEventHandler[] = [];
  private connected: boolean = false;

  /**
   * WebSocket 연결 및 방 구독
   */
  connect(roomId: string, onConnected?: () => void): void {
    if (this.client && this.connected && this.roomId === roomId) {
      console.log('[WS] Already connected to room:', roomId);
      onConnected?.();
      return;
    }

    // 기존 연결이 있으면 끊기
    if (this.client) {
      this.disconnect();
    }

    this.roomId = roomId;

    this.client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: (str) => {
        console.log('[WS Debug]', str);
      },
      onConnect: () => {
        console.log('[WS] Connected to room:', roomId);
        this.connected = true;
        this.subscribeToRoom(roomId);
        onConnected?.();
      },
      onDisconnect: () => {
        console.log('[WS] Disconnected');
        this.connected = false;
      },
      onStompError: (frame) => {
        console.error('[WS] STOMP Error:', frame.headers['message']);
      },
    });

    this.client.activate();
  }

  /**
   * 방 이벤트 구독
   */
  private subscribeToRoom(roomId: string): void {
    if (!this.client || !this.connected) return;

    const destination = `/topic/room/${roomId}`;
    console.log('[WS] Subscribing to:', destination);

    this.client.subscribe(destination, (message: IMessage) => {
      try {
        const event: GameEvent = JSON.parse(message.body);
        console.log('[WS] Received event:', event.eventType, event);
        this.notifyHandlers(event);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    });
  }

  /**
   * 이벤트 핸들러 등록
   */
  addHandler(handler: GameEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * 모든 핸들러에 이벤트 전달
   */
  private notifyHandlers(event: GameEvent): void {
    this.handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        console.error('[WS] Handler error:', err);
      }
    });
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
      this.connected = false;
      this.roomId = null;
      console.log('[WS] Disconnected and cleaned up');
    }
  }

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 현재 연결된 방 ID
   */
  getCurrentRoomId(): string | null {
    return this.roomId;
  }
}

// 싱글톤 인스턴스
export const gameSocket = new GameSocketClient();
