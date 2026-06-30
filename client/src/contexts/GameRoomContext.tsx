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
import type { GameSession, RoomState } from '../types';

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

interface GameRoomContextValue {
  connected: boolean;
  room: RoomState | null;
  setRoom: (room: RoomState | null) => void;
  createRoom: (
    playerName: string,
    theme: RoomState['theme'],
    mode: RoomState['mode'],
    maxPlayers: number
  ) => Promise<RoomCreateResult>;
  joinRoom: (roomCode: string, playerName: string) => Promise<RoomJoinResult>;
  submitRoomGuess: (
    roomCode: string,
    sessionId: string,
    guessText: string,
    characterId?: string
  ) => Promise<RoomGuessResult>;
  leaveRoom: (sessionId: string) => void;
  rejoinRoom: (roomCode: string, sessionId: string) => Promise<RoomJoinResult>;
}

const GameRoomContext = createContext<GameRoomContextValue | null>(null);

const EMIT_TIMEOUT_MS = 15000;

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
            if (result.room) setRoom(result.room);
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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('game:start', onGameStart);
    socket.on('game:finished', onGameFinished);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('game:start', onGameStart);
      socket.off('game:finished', onGameFinished);
    };
  }, []);

  const createRoom = useCallback(
    (
      playerName: string,
      theme: RoomState['theme'],
      mode: RoomState['mode'],
      maxPlayers: number
    ) =>
      emitWithAck<RoomCreateResult>('room:create', {
        playerName,
        theme,
        mode,
        maxPlayers,
      }).then((result) => {
        if (result.room) setRoom(result.room);
        return result;
      }),
    []
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) =>
      emitWithAck<RoomJoinResult>('room:join', { roomCode, playerName }).then(
        (result) => {
          if (result.room) setRoom(result.room);
          return result;
        }
      ),
    []
  );

  const rejoinRoom = useCallback(
    (roomCode: string, sessionId: string) =>
      emitWithAck<RoomJoinResult>('room:rejoin', { roomCode, sessionId }).then(
        (result) => {
          if (result.room) setRoom(result.room);
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

  const leaveRoom = useCallback((sessionId: string) => {
    getGameSocket().emit('room:leave', { sessionId });
    setRoom(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ROOM_KEY);
  }, []);

  const value = useMemo(
    () => ({
      connected,
      room,
      setRoom,
      createRoom,
      joinRoom,
      submitRoomGuess,
      leaveRoom,
      rejoinRoom,
    }),
    [connected, room, createRoom, joinRoom, submitRoomGuess, leaveRoom, rejoinRoom]
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
