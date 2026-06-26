import type { GameSession, GameMode, LeaderboardEntry, Theme } from './types';

const API = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let data: { error?: string } | T = {} as T;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? '服务器返回无效数据' : `请求失败 (${res.status})`);
    }
  } else if (!res.ok) {
    throw new Error(`请求失败 (${res.status})，请确认后端服务已启动`);
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || '请求失败');
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
  }>(
    '/game/guess',
    {
      method: 'POST',
      body: JSON.stringify({ sessionId, guessText, characterId }),
    }
  );
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

export function getLeaderboard(limit = 20) {
  return request<LeaderboardEntry[]>(`/leaderboard?limit=${limit}`);
}

export const SESSION_KEY = 'guess-who-session-id';
