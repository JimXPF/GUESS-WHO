import type {
  DailyLeaderboardEntry,
  DailyTodayInfo,
  GameMode,
  GameSession,
  LeaderboardEntry,
  LeaderboardRow,
  ReverseCondition,
  ReverseValuesResponse,
  RoomState,
  Theme,
} from './types';
import { getDeviceId } from './deviceId';

const API = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public sessionId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-User-Id', getDeviceId());

  const res = await fetch(`${API}${url}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let data: { error?: string; code?: string; sessionId?: string } | T = {} as T;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? '服务器返回无效数据' : `请求失败 (${res.status})`);
    }
  } else if (!res.ok) {
    throw new Error(`请求失败 (${res.status})，请确认后端服务已启动`);
  }
  if (!res.ok) {
    const body = data as { error?: string; code?: string; sessionId?: string };
    throw new ApiError(body.error || '请求失败', res.status, body.code, body.sessionId);
  }
  return data as T;
}

export function startGame(playerName: string, theme: Theme, gameMode: GameMode = 'classic-six') {
  return request<GameSession>('/game/start', {
    method: 'POST',
    body: JSON.stringify({ playerName, theme, gameMode }),
  });
}

export function suggestCharacters(theme: Theme, q: string) {
  return request<{ results: Array<{ id: string; label: string; sublabel?: string }> }>(
    `/game/suggest?theme=${encodeURIComponent(theme)}&q=${encodeURIComponent(q)}`
  );
}

export function submitGuess(sessionId: string, guessText: string, characterId?: string) {
  return request<{
    session: GameSession;
    notInBank?: boolean;
    message?: string;
    correctAnswer?: { name: string; imageUrl: string | null };
  }>('/game/guess', {
    method: 'POST',
    body: JSON.stringify({ sessionId, guessText, characterId }),
  });
}

export function nextQuestion(sessionId: string) {
  return request<GameSession>('/game/next', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function quitGame(sessionId: string) {
  return request<GameSession>('/game/quit', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function getSession(sessionId: string) {
  return request<GameSession>(`/game/${sessionId}`);
}

export function getReverseValues(sessionId: string, field: string) {
  return request<ReverseValuesResponse>(
    `/game/reverse-values?sessionId=${encodeURIComponent(sessionId)}&field=${encodeURIComponent(field)}`
  );
}

export function submitReverseQuery(sessionId: string, condition: ReverseCondition) {
  return request<{
    matched: boolean;
    condition: ReverseCondition;
    label: string;
    displayValue: string | number;
    newlyEliminatedIds: string[];
    aliveCount: number;
    session: GameSession;
    autoResolved?: boolean;
    roundScore?: number;
    answer?: { name: string; imageUrl: string | null };
  }>('/game/reverse-query', {
    method: 'POST',
    body: JSON.stringify({ sessionId, condition }),
  });
}

export function getLeaderboard(gameMode: GameMode, theme?: Theme, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit), gameMode });
  if (theme) params.set('theme', theme);
  return request<LeaderboardRow[]>(`/leaderboard?${params}`);
}

export function getDailyToday(theme: Theme) {
  const params = new URLSearchParams({ theme });
  return request<DailyTodayInfo>(`/leaderboard/daily/today?${params}`);
}

export const SESSION_KEY = 'guess-who-session-id';
export const ROOM_KEY = 'guess-who-room-code';
export const PLAYER_NAME_KEY = 'guess-who-player-name';
export const ROOM_INVITE_PARAM = 'code';

export function buildLobbyInviteUrl(roomCode: string): string {
  const url = new URL('/lobby', window.location.origin);
  url.searchParams.set(ROOM_INVITE_PARAM, roomCode.trim().toUpperCase());
  return url.toString();
}

export type { GameSession, RoomState, LeaderboardEntry, DailyLeaderboardEntry };
