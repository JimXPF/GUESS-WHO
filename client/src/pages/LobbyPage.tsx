import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  buildLobbyInviteUrl,
  PLAYER_NAME_KEY,
  ROOM_INVITE_PARAM,
  SESSION_KEY,
  ROOM_KEY,
} from '../api';
import { useGameRoom } from '../hooks/useGameRoom';
import { GAME_MODE_LABELS, GameMode, THEME_LABELS, Theme } from '../types';

export default function LobbyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteCode = (searchParams.get(ROOM_INVITE_PARAM) || '').trim().toUpperCase();
  const { connected, room, createRoom, joinRoom } = useGameRoom();
  const [playerName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) || '');
  const [theme] = useState<Theme>(
    () => (localStorage.getItem('guess-who-lobby-theme') as Theme) || 'csgo'
  );
  const [mode] = useState<GameMode>(
    () => (localStorage.getItem('guess-who-lobby-mode') as GameMode) || 'battle'
  );
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [joinCode, setJoinCode] = useState(() => inviteCode);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const autoJoinAttempted = useRef(false);

  useEffect(() => {
    if (!playerName) {
      navigate(inviteCode ? `/?${ROOM_INVITE_PARAM}=${inviteCode}` : '/');
    }
  }, [playerName, navigate, inviteCode]);

  useEffect(() => {
    if (inviteCode && !roomCode) {
      setJoinCode(inviteCode);
    }
  }, [inviteCode, roomCode]);

  useEffect(() => {
    if (room?.status === 'playing' && sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
      localStorage.setItem(ROOM_KEY, room.code);
      navigate('/multiplayer');
    }
  }, [room?.status, sessionId, navigate, room?.code]);

  const handleJoin = useCallback(
    async (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        setError('请输入房间号');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const result = await joinRoom(trimmed, playerName);
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
    },
    [joinRoom, playerName, navigate]
  );

  useEffect(() => {
    if (
      !inviteCode ||
      roomCode ||
      loading ||
      !connected ||
      !playerName ||
      autoJoinAttempted.current
    ) {
      return;
    }
    autoJoinAttempted.current = true;
    handleJoin(inviteCode);
  }, [inviteCode, roomCode, loading, connected, playerName, handleJoin]);

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
        navigate(`/lobby?${ROOM_INVITE_PARAM}=${result.room.code}`, { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const inviteUrl = roomCode ? buildLobbyInviteUrl(roomCode) : '';

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-md glass-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{GAME_MODE_LABELS[mode]}</h1>
          <Link to="/" className="text-sm text-apple-blue">
            返回
          </Link>
        </div>
        <p className="text-sm text-apple-gray">
          主题：{THEME_LABELS[theme]} · {connected ? '已连接' : '连接中...'}
        </p>

        {!roomCode ? (
          <>
            {inviteCode && (
              <p className="text-sm text-center text-apple-blue bg-apple-blue/5 rounded-lg py-2">
                正在加入房间 {inviteCode}…
              </p>
            )}

            {!inviteCode && (
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
            )}

            <div className={`${inviteCode ? '' : 'border-t border-gray-100 pt-4'}`}>
              <label className="block text-sm font-medium mb-2">加入房间</label>
              <input
                className="input-field mb-2 uppercase"
                placeholder="输入 6 位房间号"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button
                className="btn-secondary w-full"
                onClick={() => handleJoin(joinCode)}
                disabled={loading || !connected}
              >
                {loading && inviteCode ? '加入中...' : '加入'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm text-apple-gray">房间号（分享给好友）</p>
            <p className="text-4xl font-bold tracking-widest text-apple-blue">{roomCode}</p>
            <p className="text-xs text-apple-gray break-all">邀请链接：{inviteUrl}</p>
            <p className="text-sm text-apple-gray">
              等待玩家 {room?.players.filter((p) => p.connected).length ?? 1}/
              {room?.maxPlayers ?? maxPlayers}
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
