import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SESSION_KEY, ROOM_KEY } from '../api';
import { useGameRoom } from '../hooks/useGameRoom';
import { GAME_MODE_LABELS, GameMode, THEME_LABELS, Theme } from '../types';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { connected, room, createRoom, joinRoom } = useGameRoom();
  const [playerName] = useState(() => localStorage.getItem('guess-who-player-name') || '');
  const [theme] = useState<Theme>(
    () => (localStorage.getItem('guess-who-lobby-theme') as Theme) || 'csgo'
  );
  const [mode] = useState<GameMode>(
    () => (localStorage.getItem('guess-who-lobby-mode') as GameMode) || 'battle'
  );
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!playerName) navigate('/');
  }, [playerName, navigate]);

  useEffect(() => {
    if (room?.status === 'playing' && sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
      localStorage.setItem(ROOM_KEY, room.code);
      navigate('/multiplayer');
    }
  }, [room?.status, sessionId, navigate, room?.code]);

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await createRoom(playerName, theme, mode as 'battle' | 'relay-chain', maxPlayers);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.room && result.sessionId) {
        setRoomCode(result.room.code);
        setSessionId(result.sessionId);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('请输入房间号');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await joinRoom(joinCode.trim(), playerName);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.room && result.sessionId) {
        setRoomCode(result.room.code);
        setSessionId(result.sessionId);
        if (result.room.status === 'playing') {
          localStorage.setItem(SESSION_KEY, result.sessionId);
          localStorage.setItem(ROOM_KEY, result.room.code);
          navigate('/multiplayer');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-md glass-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{GAME_MODE_LABELS[mode]}</h1>
          <Link to="/" className="text-sm text-apple-blue">返回</Link>
        </div>
        <p className="text-sm text-apple-gray">
          主题：{THEME_LABELS[theme]} · {connected ? '已连接' : '连接中...'}
        </p>

        {!roomCode ? (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">创建房间 · 人数</label>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxPlayers(n)}
                    className={`flex-1 py-2 rounded-lg border-2 ${
                      maxPlayers === n ? 'border-apple-blue bg-apple-blue/5' : 'border-gray-100'
                    }`}
                  >
                    {n}人
                  </button>
                ))}
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="btn-primary w-full mt-3"
                onClick={handleCreate}
                disabled={loading || !connected}
              >
                创建房间
              </motion.button>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium mb-2">加入房间</label>
              <input
                className="input-field mb-2 uppercase"
                placeholder="输入 6 位房间号"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button className="btn-secondary w-full" onClick={handleJoin} disabled={loading || !connected}>
                加入
              </button>
            </div>
          </>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm text-apple-gray">房间号（分享给好友）</p>
            <p className="text-4xl font-bold tracking-widest text-apple-blue">{roomCode}</p>
            <p className="text-sm text-apple-gray">
              等待玩家 {room?.players.length ?? 1}/{room?.maxPlayers ?? maxPlayers}
            </p>
            <ul className="text-left text-sm space-y-1">
              {room?.players.map((p) => (
                <li key={p.sessionId} className="flex justify-between">
                  <span>{p.playerName}</span>
                  <span className="text-apple-gray">{p.connected ? '在线' : '离线'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-apple-red text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
