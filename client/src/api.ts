import type { GameSession, GameMode, LeaderboardEntry, Theme } from './types';

const API = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
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
