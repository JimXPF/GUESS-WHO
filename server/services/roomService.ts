import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';
import {
  FieldClaim,
  GameMode,
  GameSession,
  QuestionSetup,
  RoomPlayerState,
  RoomState,
  Theme,
} from '../types';
import {
  applySessionFromSetup,
  createBattleSession,
  getGameSession,
  processRelayGuess,
  processRoomGuess,
} from './gameService';
import { generateQuestionQueue } from './dailyChallenge';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QUESTION_QUEUE_SIZE = 30;

export interface Room {
  code: string;
  mode: 'battle' | 'relay-chain';
  theme: Theme;
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  hostSessionId: string;
  questionQueue: QuestionSetup[];
  currentQuestionIndex: number;
  players: Map<string, RoomPlayerEntry>;
  relayTurnSessionId: string | null;
  relayFieldClaims: Record<string, FieldClaim>;
  relayRound: number;
  finishReason?: string;
  playerOrder: string[];
}

interface RoomPlayerEntry {
  sessionId: string;
  playerName: string;
  socketId: string | null;
  scoreBreakdown: FieldClaim[];
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function roomToState(room: Room): RoomState {
  const players: RoomPlayerState[] = room.playerOrder.map((sid) => {
    const entry = room.players.get(sid)!;
    const session = getGameSession(sid);
    return {
      sessionId: sid,
      playerName: entry.playerName,
      score: session?.score ?? 0,
      correctCount: session?.correctCount ?? 0,
      attemptsLeft: session?.attemptsLeft ?? 0,
      questionIndex: session?.questionIndex ?? 0,
      status: session?.status ?? 'playing',
      connected: entry.socketId !== null,
      scoreBreakdown: entry.scoreBreakdown,
    };
  });

  const turnEntry = room.relayTurnSessionId
    ? room.players.get(room.relayTurnSessionId)
    : null;

  return {
    code: room.code,
    mode: room.mode,
    theme: room.theme,
    maxPlayers: room.maxPlayers,
    status: room.status,
    players,
    currentTurnSessionId: room.relayTurnSessionId,
    currentTurnPlayer: turnEntry?.playerName ?? null,
    fieldClaims: Object.values(room.relayFieldClaims),
    relayRound: room.relayRound,
    finishReason: room.finishReason,
  };
}

function broadcastRoom(io: Server, room: Room) {
  io.to(room.code).emit('room:state', roomToState(room));
}

function startRoomGame(room: Room) {
  room.status = 'playing';
  room.questionQueue = generateQuestionQueue(
    room.theme,
    QUESTION_QUEUE_SIZE,
    `room:${room.code}`
  );
  room.currentQuestionIndex = 0;
  room.relayRound = 1;

  const firstSessionId = room.playerOrder[0];
  room.relayTurnSessionId = firstSessionId;

  for (const sessionId of room.playerOrder) {
    applySessionFromSetup(sessionId, room.questionQueue[0], { resetQuestionIndex: true });
  }
}

function endRoom(room: Room, reason: string) {
  room.status = 'finished';
  room.finishReason = reason;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function registerRoomHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    socket.on('room:create', (payload, ack) => {
      try {
        const {
          playerName,
          theme,
          mode,
          maxPlayers,
        } = payload as {
          playerName?: string;
          theme?: Theme;
          mode?: 'battle' | 'relay-chain';
          maxPlayers?: number;
        };

        if (!playerName?.trim() || !theme || !mode) {
          ack?.({ error: '缺少参数' });
          return;
        }
        const cap = Math.min(5, Math.max(2, maxPlayers ?? 2));
        const code = generateRoomCode();
        const gameMode: GameMode = mode;
        const session = createBattleSession(playerName.trim(), theme, gameMode, code);
        const sessionId = session.sessionId;

        const room: Room = {
          code,
          mode,
          theme,
          maxPlayers: cap,
          status: 'waiting',
          hostSessionId: sessionId,
          questionQueue: [],
          currentQuestionIndex: 0,
          players: new Map([[sessionId, {
            sessionId,
            playerName: playerName.trim(),
            socketId: socket.id,
            scoreBreakdown: [],
          }]]),
          relayTurnSessionId: null,
          relayFieldClaims: {},
          relayRound: 1,
          playerOrder: [sessionId],
        };

        rooms.set(code, room);
        socketToRoom.set(socket.id, code);
        socket.join(code);

        ack?.({ room: roomToState(room), sessionId, session });
        broadcastRoom(io, room);
      } catch (e) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('room:join', (payload, ack) => {
      try {
        const { roomCode, playerName } = payload as {
          roomCode?: string;
          playerName?: string;
        };
        if (!roomCode?.trim() || !playerName?.trim()) {
          ack?.({ error: '缺少参数' });
          return;
        }

        const code = roomCode.trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          ack?.({ error: '房间不存在' });
          return;
        }
        if (room.status !== 'waiting') {
          ack?.({ error: '游戏已开始或已结束' });
          return;
        }
        if (room.players.size >= room.maxPlayers) {
          ack?.({ error: '房间已满' });
          return;
        }

        const session = createBattleSession(
          playerName.trim(),
          room.theme,
          room.mode,
          code
        );
        const sessionId = session.sessionId;

        room.players.set(sessionId, {
          sessionId,
          playerName: playerName.trim(),
          socketId: socket.id,
          scoreBreakdown: [],
        });
        room.playerOrder.push(sessionId);

        socketToRoom.set(socket.id, code);
        socket.join(code);

        if (room.players.size >= room.maxPlayers) {
          startRoomGame(room);
          io.to(code).emit('game:start', roomToState(room));
        }

        ack?.({ room: roomToState(room), sessionId, session });
        broadcastRoom(io, room);
      } catch (e) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('room:guess', (payload, ack) => {
      try {
        const { roomCode, sessionId, guessText, characterId } = payload as {
          roomCode?: string;
          sessionId?: string;
          guessText?: string;
          characterId?: string;
        };
        const code = roomCode?.trim().toUpperCase();
        const room = code ? rooms.get(code) : undefined;
        if (!room || !sessionId || !guessText?.trim()) {
          ack?.({ error: '缺少参数' });
          return;
        }
        if (room.status !== 'playing') {
          ack?.({ error: '游戏未进行中' });
          return;
        }

        let result;
        if (room.mode === 'relay-chain') {
          if (room.relayTurnSessionId !== sessionId) {
            ack?.({ error: '还没轮到你作答' });
            return;
          }
          result = processRelayGuess(
            sessionId,
            guessText,
            characterId,
            room
          );
          const entry = room.players.get(sessionId);
          if (entry && result.scoreBreakdown) {
            entry.scoreBreakdown.push(...result.scoreBreakdown);
          }
          if (result.fullCorrect) {
            room.currentQuestionIndex++;
            room.relayFieldClaims = {};
            room.relayRound++;
            room.relayTurnSessionId = sessionId;
            const nextSetup = room.questionQueue[room.currentQuestionIndex];
            if (nextSetup) {
              for (const sid of room.playerOrder) {
                applySessionFromSetup(sid, nextSetup, { questionIndex: room.currentQuestionIndex });
              }
            }
          }
        } else {
          result = processRoomGuess(sessionId, guessText, characterId, room);
        }

        const finished = finishRoomIfNeeded(room);
        if (finished) {
          io.to(room.code).emit('game:finished', roomToState(room));
        }
        broadcastRoom(io, room);
        ack?.(result);
      } catch (e) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('room:next', (payload, ack) => {
      try {
        const { roomCode, sessionId } = payload as {
          roomCode?: string;
          sessionId?: string;
        };
        const room = roomCode ? rooms.get(roomCode.toUpperCase()) : undefined;
        if (!room || room.mode !== 'relay-chain' || !sessionId) {
          ack?.({ error: '无效请求' });
          return;
        }
        if (room.relayTurnSessionId !== sessionId) {
          ack?.({ error: '还没轮到你' });
          return;
        }
        ack?.({ session: getGameSession(sessionId) });
        broadcastRoom(io, room);
      } catch (e) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('room:leave', (payload) => {
      handleDisconnect(socket, io, payload?.sessionId as string | undefined);
    });

    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
}

function handleDisconnect(socket: Socket, io: Server, sessionId?: string) {
  const code = socketToRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  let leftSessionId = sessionId;
  if (!leftSessionId) {
    for (const [sid, entry] of room.players) {
      if (entry.socketId === socket.id) {
        leftSessionId = sid;
        entry.socketId = null;
        break;
      }
    }
  } else {
    const entry = room.players.get(leftSessionId);
    if (entry) entry.socketId = null;
  }

  socketToRoom.delete(socket.id);
  socket.leave(code);

  if (room.status === 'playing' && leftSessionId) {
    endRoom(room, `${room.players.get(leftSessionId)?.playerName ?? '玩家'} 已退出`);
    io.to(code).emit('game:finished', roomToState(room));
  } else if (room.status === 'waiting' && leftSessionId === room.hostSessionId) {
    endRoom(room, '房主已离开');
    rooms.delete(code);
  }

  broadcastRoom(io, room);
}

export function finishRoomIfNeeded(room: Room): boolean {
  if (room.status !== 'playing') return false;

  const allOut = room.playerOrder.every((sid) => {
    const s = getGameSession(sid);
    return !s || s.attemptsLeft <= 0 || s.status === 'game_over';
  });

  if (allOut) {
    endRoom(room, '所有玩家机会已用尽');
    return true;
  }

  if (
    room.mode === 'battle' &&
    room.currentQuestionIndex >= room.questionQueue.length - 1
  ) {
    const allDone = room.playerOrder.every((sid) => {
      const s = getGameSession(sid);
      return !s || s.attemptsLeft <= 0;
    });
    if (allDone) {
      endRoom(room, '题目已完成');
      return true;
    }
  }
  return false;
}

export { roomToState, broadcastRoom };
