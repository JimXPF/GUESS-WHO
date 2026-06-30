import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
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

export function useGameRoom() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('room:state', (state: RoomState) => setRoom(state));
    socket.on('game:start', (state: RoomState) => setRoom(state));
    socket.on('game:finished', (state: RoomState) => {
      setRoom(state);
      sessionStorage.setItem('guess-who-last-room', JSON.stringify(state));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback(
    (
      playerName: string,
      theme: RoomState['theme'],
      mode: RoomState['mode'],
      maxPlayers: number
    ) =>
      new Promise<RoomCreateResult>((resolve) => {
        socketRef.current?.emit(
          'room:create',
          { playerName, theme, mode, maxPlayers },
          (result: RoomCreateResult) => resolve(result)
        );
      }),
    []
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) =>
      new Promise<RoomJoinResult>((resolve) => {
        socketRef.current?.emit(
          'room:join',
          { roomCode, playerName },
          (result: RoomJoinResult) => resolve(result)
        );
      }),
    []
  );

  const submitRoomGuess = useCallback(
    (roomCode: string, sessionId: string, guessText: string, characterId?: string) =>
      new Promise<RoomGuessResult>((resolve) => {
        socketRef.current?.emit(
          'room:guess',
          { roomCode, sessionId, guessText, characterId },
          (result: RoomGuessResult) => resolve(result)
        );
      }),
    []
  );

  const leaveRoom = useCallback((sessionId: string) => {
    socketRef.current?.emit('room:leave', { sessionId });
  }, []);

  return {
    connected,
    room,
    setRoom,
    createRoom,
    joinRoom,
    submitRoomGuess,
    leaveRoom,
  };
}
