import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ROOM_KEY, SESSION_KEY } from '../api';
import { getGameSocket } from '../gameSocket';
import type { GameSession, LadderInviteInfo, RoomKind, RoomState } from '../types';

interface RoomCreateResult {
  room?: RoomState;
  sessionId?: string;
  session?: GameSession;
  error?: string;
}

interface RoomJoinResult extends RoomCreateResult {}

interface RoomGuessResult {
  session?: GameSession;
  notInBank?: boolean;
  message?: string;
  error?: string;
  scoreBreakdown?: GameSession['scoreBreakdown'];
  fullCorrect?: boolean;
}

interface RoomLeaveResult {
  room?: RoomState;
}

interface RoomStartResult {
  room?: RoomState;
  error?: string;
}

interface RoomLadderReinviteResult {
  error?: string;
}

interface RoomDismissResult {
  error?: string;
}

interface GameRoomContextValue {
  connected: boolean;
  room: RoomState | null;
  setRoom: (room: RoomState | null) => void;
  createRoom: (
    playerName: string,
    theme: RoomState['theme'],
    mode: RoomState['mode'],
    roomKind?: RoomKind
  ) => Promise<RoomCreateResult>;
  joinRoom: (roomCode: string, playerName: string) => Promise<RoomJoinResult>;
  startRoom: (roomCode: string, sessionId: string) => Promise<RoomStartResult>;
  resendLadderInvite: (roomCode: string, sessionId: string) => Promise<RoomLadderReinviteResult>;
  dismissRoom: (roomCode: string, sessionId: string) => Promise<RoomDismissResult>;
  submitRoomGuess: (
    roomCode: string,
    sessionId: string,
    guessText: string,
    characterId?: string
  ) => Promise<RoomGuessResult>;
  leaveRoom: (sessionId: string) => Promise<RoomLeaveResult>;
  rejoinRoom: (roomCode: string, sessionId: string) => Promise<RoomJoinResult>;
}

const GameRoomContext = createContext<GameRoomContextValue | null>(null);

const EMIT_TIMEOUT_MS = 15000;

function persistRoomSession(roomCode: string, sessionId: string) {
  localStorage.setItem(SESSION_KEY, sessionId);
  localStorage.setItem(ROOM_KEY, roomCode);
}

function emitWithAck<T>(
  event: string,
  payload: unknown,
  timeoutMs = EMIT_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve) => {
    const socket = getGameSocket();
    let settled = false;

    const finish = (result: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ error: '连接超时，请检查网络或刷新重试' } as T);
    }, timeoutMs);

    if (!socket.connected) {
      const onConnect = () => {
        socket.off('connect', onConnect);
        socket.emit(event, payload, (result: T) => finish(result));
      };
      socket.on('connect', onConnect);
      socket.connect();
      return;
    }

    socket.emit(event, payload, (result: T) => finish(result));
  });
}

export function GameRoomProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(() => getGameSocket().connected);
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    const socket = getGameSocket();

    const onConnect = () => {
      setConnected(true);
      const sessionId = localStorage.getItem(SESSION_KEY);
      const roomCode = localStorage.getItem(ROOM_KEY);
      if (sessionId && roomCode) {
        socket.emit(
          'room:rejoin',
          { roomCode, sessionId },
          (result: RoomJoinResult) => {
            if (result.room && result.sessionId) {
              setRoom(result.room);
              persistRoomSession(result.room.code, result.sessionId);
              return;
            }
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(ROOM_KEY);
          }
        );
      }
    };

    const onDisconnect = () => setConnected(false);
    const onRoomState = (state: RoomState) => setRoom(state);
    const onGameStart = (state: RoomState) => setRoom(state);
    const onGameFinished = (state: RoomState) => {
      setRoom(state);
      sessionStorage.setItem('guess-who-last-room', JSON.stringify(state));
    };
    const onLadderInvite = (invite: LadderInviteInfo) => {
      window.dispatchEvent(new CustomEvent('guess-who:ladder-invite', { detail: invite }));
    };
    const onLadderInviteWithdraw = (payload: { roomCode?: string }) => {
      window.dispatchEvent(
        new CustomEvent('guess-who:ladder-invite-withdraw', { detail: payload })
      );
    };
    const clearLocalRoom = () => {
      setRoom(null);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ROOM_KEY);
    };
    const onRoomDismissed = () => {
      clearLocalRoom();
      window.dispatchEvent(new CustomEvent('guess-who:room-dismissed'));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('game:start', onGameStart);
    socket.on('game:finished', onGameFinished);
    socket.on('ladder:invite', onLadderInvite);
    socket.on('ladder:invite:withdraw', onLadderInviteWithdraw);
    socket.on('room:dismissed', onRoomDismissed);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('game:start', onGameStart);
      socket.off('game:finished', onGameFinished);
      socket.off('ladder:invite', onLadderInvite);
      socket.off('ladder:invite:withdraw', onLadderInviteWithdraw);
      socket.off('room:dismissed', onRoomDismissed);
    };
  }, []);

  const createRoom = useCallback(
    (
      playerName: string,
      theme: RoomState['theme'],
      mode: RoomState['mode'],
      roomKind: RoomKind = 'custom'
    ) =>
      emitWithAck<RoomCreateResult>('room:create', {
        playerName,
        theme,
        mode,
        roomKind,
      }).then((result) => {
        if (result.room && result.sessionId) {
          setRoom(result.room);
          persistRoomSession(result.room.code, result.sessionId);
        }
        return result;
      }),
    []
  );

  const startRoom = useCallback(
    (roomCode: string, sessionId: string) =>
      emitWithAck<RoomStartResult>('room:start', { roomCode, sessionId }).then(
        (result) => {
          if (result.room) setRoom(result.room);
          return result;
        }
      ),
    []
  );

  const resendLadderInvite = useCallback(
    (roomCode: string, sessionId: string) =>
      emitWithAck<RoomLadderReinviteResult>('room:ladder:reinvite', {
        roomCode,
        sessionId,
      }),
    []
  );

  const dismissRoom = useCallback(
    (roomCode: string, sessionId: string) =>
      emitWithAck<RoomDismissResult>('room:dismiss', { roomCode, sessionId }).finally(() => {
        setRoom(null);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(ROOM_KEY);
      }),
    []
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) =>
      emitWithAck<RoomJoinResult>('room:join', { roomCode, playerName }).then(
        (result) => {
          if (result.room && result.sessionId) {
            setRoom(result.room);
            persistRoomSession(result.room.code, result.sessionId);
          }
          return result;
        }
      ),
    []
  );

  const rejoinRoom = useCallback(
    (roomCode: string, sessionId: string) =>
      emitWithAck<RoomJoinResult>('room:rejoin', { roomCode, sessionId }).then(
        (result) => {
          if (result.room && result.sessionId) {
            setRoom(result.room);
            persistRoomSession(result.room.code, result.sessionId);
          }
          return result;
        }
      ),
    []
  );

  const submitRoomGuess = useCallback(
    (roomCode: string, sessionId: string, guessText: string, characterId?: string) =>
      emitWithAck<RoomGuessResult>('room:guess', {
        roomCode,
        sessionId,
        guessText,
        characterId,
      }),
    []
  );

  const leaveRoom = useCallback(
    (sessionId: string) =>
      emitWithAck<RoomLeaveResult>('room:leave', { sessionId }).finally(() => {
        setRoom(null);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(ROOM_KEY);
      }),
    []
  );

  const value = useMemo(
    () => ({
      connected,
      room,
      setRoom,
      createRoom,
      joinRoom,
      startRoom,
      resendLadderInvite,
      dismissRoom,
      submitRoomGuess,
      leaveRoom,
      rejoinRoom,
    }),
    [connected, room, createRoom, joinRoom, startRoom, resendLadderInvite, dismissRoom, submitRoomGuess, leaveRoom, rejoinRoom]
  );

  return <GameRoomContext.Provider value={value}>{children}</GameRoomContext.Provider>;
}

export function useGameRoom(): GameRoomContextValue {
  const ctx = useContext(GameRoomContext);
  if (!ctx) {
    throw new Error('useGameRoom must be used within GameRoomProvider');
  }
  return ctx;
}
