import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  buildLobbyInviteUrl,
  PLAYER_NAME_KEY,
  ROOM_INVITE_PARAM,
  SESSION_KEY,
  ROOM_KEY,
} from '../api';
import CharacterAvatar from '../components/CharacterAvatar';
import LobbyCountdown from '../components/LobbyCountdown';
import { useGameRoom } from '../hooks/useGameRoom';
import { GAME_MODE_LABELS, GameMode, RoomKind, RoomPlayerState, THEME_LABELS, Theme } from '../types';

const LOBBY_SLOT_COUNT = 5;

const ROOM_CREATE_OPTIONS: {
  kind: RoomKind;
  title: string;
  description: string;
}[] = [
  {
    kind: 'custom',
    title: '新建房间',
    description: '创建普通房间，通过房间号或链接邀请好友加入',
  },
  {
    kind: 'ladder',
    title: '邀请天梯同房间好友',
    description: '向天梯同房间好友发布邀请，对方将在平台界面收到弹窗',
  },
];

function LobbyPlayerSlot({
  player,
  isHost,
}: {
  player: RoomPlayerState | null;
  isHost: boolean;
}) {
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-1.5 min-w-0">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center text-xs text-apple-gray">
          空位
        </div>
        <span className="text-[11px] text-apple-gray">等待加入</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <div className="relative">
        <CharacterAvatar name={player.playerName} size="md" />
        {isHost && (
          <span className="absolute -top-1 -right-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-amber-400 text-white font-medium">
            房主
          </span>
        )}
      </div>
      <span className="text-xs font-medium truncate max-w-[4.5rem]" title={player.playerName}>
        {player.playerName}
      </span>
      <span className={`text-[10px] ${player.connected ? 'text-emerald-600' : 'text-apple-gray'}`}>
        {player.connected ? '在线' : '离线'}
      </span>
    </div>
  );
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteCode = (searchParams.get(ROOM_INVITE_PARAM) || '').trim().toUpperCase();
  const { connected, room, createRoom, joinRoom, startRoom, resendLadderInvite, dismissRoom, leaveRoom, rejoinRoom } =
    useGameRoom();
  const [playerName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) || '');
  const [theme] = useState<Theme>(
    () => (localStorage.getItem('guess-who-lobby-theme') as Theme) || 'csgo'
  );
  const [mode] = useState<GameMode>(
    () => (localStorage.getItem('guess-who-lobby-mode') as GameMode) || 'battle'
  );
  const [joinCode, setJoinCode] = useState(() => inviteCode);
  const [roomCreateKind, setRoomCreateKind] = useState<RoomKind>('custom');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [inviteResent, setInviteResent] = useState(false);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState('');
  const autoJoinAttempted = useRef(false);
  const rejoinAttempted = useRef(false);

  const activeRoomCode = room?.code ?? roomCode;
  const activeSessionId = sessionId || localStorage.getItem(SESSION_KEY);
  const inRoom = Boolean(
    activeRoomCode &&
      activeSessionId &&
      room?.players.some((p) => p.sessionId === activeSessionId)
  );

  const clearInviteFromUrl = useCallback(() => {
    autoJoinAttempted.current = false;
    rejoinAttempted.current = false;
    navigate('/lobby', { replace: true });
  }, [navigate]);

  const connectedCount = useMemo(
    () => room?.players.filter((p) => p.connected).length ?? 0,
    [room?.players]
  );

  const isHost = Boolean(sessionId && room?.hostSessionId === sessionId);
  const slotCount = room?.maxPlayers ?? LOBBY_SLOT_COUNT;
  const slots = useMemo(() => {
    const players = room?.players ?? [];
    return Array.from({ length: slotCount }, (_, i) => players[i] ?? null);
  }, [room?.players, slotCount]);

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
    const sid = localStorage.getItem(SESSION_KEY);
    const code = localStorage.getItem(ROOM_KEY);
    if (sid) setSessionId(sid);
    if (code) setRoomCode(code);
  }, []);

  useEffect(() => {
    if (room?.code) {
      setRoomCode(room.code);
    }
    const sid = sessionId || localStorage.getItem(SESSION_KEY);
    if (sid && room?.players.some((p) => p.sessionId === sid)) {
      setSessionId(sid);
    }
  }, [room, sessionId]);

  useEffect(() => {
    if (!connected || loading || rejoinAttempted.current) return;
    const sid = sessionId || localStorage.getItem(SESSION_KEY);
    const code = (inviteCode || roomCode || localStorage.getItem(ROOM_KEY) || '').trim().toUpperCase();
    if (!sid || !code) return;
    if (room?.players.some((p) => p.sessionId === sid)) return;

    rejoinAttempted.current = true;
    rejoinRoom(code, sid).then((result) => {
      if (result.error || !result.room?.players.length) {
        rejoinAttempted.current = false;
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(ROOM_KEY);
        setRoomCode(null);
        setSessionId(null);
        if (result.error) setError(result.error);
        if (inviteCode) clearInviteFromUrl();
        return;
      }
      setRoomCode(result.room.code);
      setSessionId(result.sessionId ?? sid);
    });
  }, [connected, loading, sessionId, roomCode, inviteCode, room, rejoinRoom, clearInviteFromUrl]);

  useEffect(() => {
    const onRoomDismissed = () => {
      setRoomCode(null);
      setSessionId(null);
      navigate('/', { replace: true });
    };
    window.addEventListener('guess-who:room-dismissed', onRoomDismissed);
    return () => window.removeEventListener('guess-who:room-dismissed', onRoomDismissed);
  }, [navigate]);

  useEffect(() => {
    if (room?.status === 'playing' && sessionId && room.code) {
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
      const result = await createRoom(
        playerName,
        theme,
        mode as 'battle' | 'relay-chain',
        roomCreateKind
      );
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

  const handleStart = async () => {
    if (!activeRoomCode || !sessionId) return;
    setStarting(true);
    setError('');
    try {
      const result = await startRoom(activeRoomCode, sessionId);
      if (result.error) {
        setError(result.error);
      }
    } finally {
      setStarting(false);
    }
  };

  const handleResendLadderInvite = async () => {
    if (!activeRoomCode || !sessionId) return;
    setResendingInvite(true);
    setError('');
    setInviteResent(false);
    try {
      const result = await resendLadderInvite(activeRoomCode, sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setInviteResent(true);
    } finally {
      setResendingInvite(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!sessionId) {
      navigate('/');
      return;
    }
    setLeaving(true);
    setError('');
    try {
      await leaveRoom(sessionId);
      setRoomCode(null);
      setSessionId(null);
      navigate('/', { replace: true });
    } finally {
      setLeaving(false);
    }
  };

  const handleDismissRoom = async () => {
    if (!activeRoomCode || !sessionId) return;
    setDismissing(true);
    setError('');
    try {
      const result = await dismissRoom(activeRoomCode, sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRoomCode(null);
      setSessionId(null);
      navigate('/', { replace: true });
    } finally {
      setDismissing(false);
      setShowDismissConfirm(false);
    }
  };

  const inviteUrl = activeRoomCode ? buildLobbyInviteUrl(activeRoomCode) : '';
  const showCountdown = room?.status === 'countdown';
  const isLadderRoom = room?.roomKind === 'ladder';

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-6">
      <AnimatePresence>
        {showDismissConfirm && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card p-6 max-w-sm w-full space-y-4"
            >
              <h2 className="text-lg font-semibold text-center">解散房间？</h2>
              <p className="text-sm text-apple-gray text-center">
                解散后所有玩家将退出房间并返回模式选择页面，此操作不可撤销。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setShowDismissConfirm(false)}
                  disabled={dismissing}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-apple-red text-white font-medium py-3 active:opacity-90 disabled:opacity-50"
                  onClick={handleDismissRoom}
                  disabled={dismissing}
                >
                  {dismissing ? '解散中...' : '确认解散'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showCountdown && (
        <LobbyCountdown
          deadlineAt={room?.countdownDeadlineAt}
          seconds={room?.lobbyCountdownSeconds ?? 3}
        />
      )}

      <div className="w-full max-w-md glass-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{GAME_MODE_LABELS[mode]}</h1>
          {inRoom ? (
            isHost ? (
              <button
                type="button"
                className="text-sm text-apple-red font-medium"
                onClick={() => setShowDismissConfirm(true)}
                disabled={dismissing}
              >
                解散房间
              </button>
            ) : (
              <button
                type="button"
                className="text-sm text-apple-blue"
                onClick={handleLeaveRoom}
                disabled={leaving}
              >
                {leaving ? '退出中...' : '返回'}
              </button>
            )
          ) : (
            <Link to="/" className="text-sm text-apple-blue">
              返回
            </Link>
          )}
        </div>
        <p className="text-sm text-apple-gray">
          主题：{THEME_LABELS[theme]} · {connected ? '已连接' : '连接中...'}
        </p>

        {!inRoom ? (
          <>
            {inviteCode && loading && (
              <p className="text-sm text-center text-apple-blue bg-apple-blue/5 rounded-lg py-2">
                正在加入房间 {inviteCode}…
              </p>
            )}

            {inviteCode && !loading && (
              <button
                type="button"
                className="text-xs text-apple-blue w-full text-center"
                onClick={clearInviteFromUrl}
              >
                取消加入，创建新房间
              </button>
            )}

            <div className="space-y-3">
              <label className="block text-sm font-medium">加入房间</label>
              <input
                className="input-field uppercase"
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

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium">创建房间</p>
              <p className="text-sm text-apple-gray">
                选择创建方式，房间最多 5 人，至少 2 人由房主开始游戏
              </p>
              <div className="grid grid-cols-1 gap-2">
                {ROOM_CREATE_OPTIONS.map((option) => {
                  const selected = roomCreateKind === option.kind;
                  return (
                    <button
                      key={option.kind}
                      type="button"
                      className={`text-left rounded-xl border px-3 py-3 transition-colors ${
                        selected
                          ? 'border-apple-blue bg-apple-blue/5 ring-1 ring-apple-blue/30'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setRoomCreateKind(option.kind)}
                    >
                      <p className="text-sm font-semibold">{option.title}</p>
                      <p className="text-xs text-apple-gray mt-1">{option.description}</p>
                    </button>
                  );
                })}
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="btn-primary w-full"
                onClick={handleCreate}
                disabled={loading || !connected}
              >
                {roomCreateKind === 'ladder' ? '邀请天梯同房间好友' : '创建房间'}
              </motion.button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {isLadderRoom && room?.status === 'waiting' && (
              <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2.5 text-center space-y-2">
                <p className="text-xs font-semibold text-violet-700">邀请天梯同房间好友</p>
                <p className="text-xs text-violet-600/90">
                  邀请已发布至平台，同房间好友将在平台界面看到加入弹窗
                </p>
                {isHost && (
                  <button
                    type="button"
                    className="btn-secondary w-full text-sm py-2"
                    onClick={handleResendLadderInvite}
                    disabled={resendingInvite || !connected}
                  >
                    {resendingInvite ? '发送中...' : '再次发起邀请'}
                  </button>
                )}
                {inviteResent && (
                  <p className="text-xs text-emerald-600">邀请已重新发送至平台</p>
                )}
              </div>
            )}
            <div className="text-center">
              <p className="text-sm text-apple-gray">
                {isLadderRoom ? '房间号（也可手动分享）' : '房间号（分享给好友）'}
              </p>
              <p className="text-4xl font-bold tracking-widest text-apple-blue mt-1">{activeRoomCode}</p>
              <p className="text-xs text-apple-gray break-all mt-2">邀请链接：{inviteUrl}</p>
            </div>

            <div>
              <p className="text-sm text-apple-gray text-center mb-3">
                玩家 {connectedCount}/{slotCount}（至少 2 人可开始）
              </p>
              <div className="grid grid-cols-5 gap-2">
                {slots.map((player, index) => (
                  <LobbyPlayerSlot
                    key={player?.sessionId ?? `empty-${index}`}
                    player={player}
                    isHost={Boolean(player && room?.hostSessionId === player.sessionId)}
                  />
                ))}
              </div>
            </div>

            {isHost && room?.status === 'waiting' && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="btn-primary w-full"
                onClick={handleStart}
                disabled={starting || connectedCount < 2 || !connected}
              >
                {starting
                  ? '开始中...'
                  : connectedCount < 2
                    ? '等待更多玩家（至少 2 人）'
                    : '开始游戏'}
              </motion.button>
            )}

            {!isHost && room?.status === 'waiting' && (
              <p className="text-sm text-center text-apple-gray">
                {isLadderRoom ? '等待同房间好友从天梯弹窗或房间号加入…' : '等待房主开始游戏…'}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-apple-red text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
