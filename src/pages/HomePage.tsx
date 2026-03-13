import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomApi } from '../api/client';
import { useGameStore } from '../store/gameStore';

export default function HomePage() {
  const navigate = useNavigate();
  const { setRoomInfo, setPlayerInfo } = useGameStore();

  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [title, setTitle] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // localStorage 키 생성 (방ID + 닉네임 조합)
  const getRejoinTokenKey = (roomId: string, nick: string) =>
    `gaia_rejoin_${roomId}_${nick}`;

  // 방 생성
  const handleCreateRoom = async () => {
    if (!title.trim()) {
      setError('방 제목을 입력해주세요.');
      return;
    }
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. 방 생성
      const createRes = await roomApi.createRoom(title);
      const { roomId, roomCode: code } = createRes.data;

      // 2. 방 입장
      const enterRes = await roomApi.enterRoom(roomId, nickname);
      const { playerId, rejoinToken, success, message } = enterRes.data;

      if (!success || !playerId) {
        setError(message || '방 입장에 실패했습니다.');
        return;
      }

      // 3. rejoinToken을 localStorage에 저장
      if (rejoinToken) {
        localStorage.setItem(getRejoinTokenKey(roomId, nickname), rejoinToken);
      }

      // 4. 상태 저장
      setRoomInfo(roomId, code);
      setPlayerInfo(playerId, nickname);

      // 5. 로비로 이동 (playerId를 URL 쿼리 파라미터로 전달)
      navigate(`/lobby/${roomId}?playerId=${playerId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || '방 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 방 입장 (코드로)
  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setError('방 코드를 입력해주세요.');
      return;
    }
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. 방 코드로 roomId 조회
      const lookupRes = await roomApi.getRoomByCode(roomCode);
      if (!lookupRes.data.found || !lookupRes.data.roomId) {
        setError(lookupRes.data.message || '방을 찾을 수 없습니다.');
        return;
      }
      const roomId = lookupRes.data.roomId;

      // 2. localStorage에서 rejoinToken 조회 (재입장 시도)
      const savedRejoinToken = localStorage.getItem(getRejoinTokenKey(roomId, nickname));

      // 3. 방 입장
      const enterRes = await roomApi.enterRoom(roomId, nickname, savedRejoinToken || undefined);
      const { playerId, rejoinToken, success, message } = enterRes.data;

      if (!success || !playerId) {
        setError(message || '방 입장에 실패했습니다.');
        return;
      }

      // 4. rejoinToken을 localStorage에 저장 (첫 입장 또는 갱신)
      if (rejoinToken) {
        localStorage.setItem(getRejoinTokenKey(roomId, nickname), rejoinToken);
      }

      setRoomInfo(roomId, roomCode);
      setPlayerInfo(playerId, nickname);

      // 5. playerId를 URL 쿼리 파라미터로 전달
      navigate(`/lobby/${roomId}?playerId=${playerId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || '방 입장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-2 text-blue-400 tracking-tight">Gaia Project</h1>
      <p className="text-gray-500 text-sm mb-8">보드게임 온라인</p>

      {mode === 'select' && (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => setMode('create')}
            className="bg-blue-600/80 hover:bg-blue-500/80 text-white py-3 px-6 rounded-xl text-lg transition font-medium"
          >
            방 만들기
          </button>
          <button
            onClick={() => setMode('join')}
            className="bg-emerald-600/80 hover:bg-emerald-500/80 text-white py-3 px-6 rounded-xl text-lg transition font-medium"
          >
            방 참가하기
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="game-panel flex flex-col gap-3 w-full max-w-xs">
          <h2 className="text-lg font-semibold text-center text-gray-200">방 만들기</h2>
          <input
            type="text"
            placeholder="방 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-gray-800/80 text-white px-4 py-2.5 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder-gray-500"
          />
          <input
            type="text"
            placeholder="닉네임"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="bg-gray-800/80 text-white px-4 py-2.5 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder-gray-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/60 disabled:text-gray-500 text-white py-2.5 px-6 rounded-xl transition font-medium"
          >
            {loading ? '생성 중...' : '생성'}
          </button>
          <button
            onClick={() => setMode('select')}
            className="text-gray-500 hover:text-gray-300 transition text-sm"
          >
            뒤로
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="game-panel flex flex-col gap-3 w-full max-w-xs">
          <h2 className="text-lg font-semibold text-center text-gray-200">방 참가하기</h2>
          <input
            type="text"
            placeholder="방 코드 또는 ID"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            className="bg-gray-800/80 text-white px-4 py-2.5 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 placeholder-gray-500"
          />
          <input
            type="text"
            placeholder="닉네임"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="bg-gray-800/80 text-white px-4 py-2.5 rounded-lg border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 placeholder-gray-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleJoinRoom}
            disabled={loading}
            className="bg-emerald-600/80 hover:bg-emerald-500/80 disabled:bg-gray-700/60 disabled:text-gray-500 text-white py-2.5 px-6 rounded-xl transition font-medium"
          >
            {loading ? '입장 중...' : '입장'}
          </button>
          <button
            onClick={() => setMode('select')}
            className="text-gray-500 hover:text-gray-300 transition text-sm"
          >
            뒤로
          </button>
        </div>
      )}
    </div>
  );
}
