import { db } from '../db';
import { SessionStatus, Theme } from '../types';
import { getDailyChallengeDate } from './dailyChallenge';

export type DailyAttemptStatus = SessionStatus;

export interface DailyPlayerAttemptRow {
  challenge_date: string;
  theme: Theme;
  player_key: string;
  player_name: string;
  session_id: string;
  status: DailyAttemptStatus;
  attempts_used: number | null;
  elapsed_us: number | null;
}

export function getDailyPlayerAttempt(
  challengeDate: string,
  theme: Theme,
  playerKey: string
): DailyPlayerAttemptRow | undefined {
  return db
    .prepare(
      `SELECT challenge_date, theme, player_key, player_name, session_id, status, attempts_used, elapsed_us
       FROM daily_player_attempts
       WHERE challenge_date = ? AND theme = ? AND player_key = ?`
    )
    .get(challengeDate, theme, playerKey) as DailyPlayerAttemptRow | undefined;
}

export function registerDailyPlayerAttempt(
  theme: Theme,
  playerKey: string,
  playerName: string,
  sessionId: string
): void {
  const challengeDate = getDailyChallengeDate();
  db.prepare(
    `INSERT INTO daily_player_attempts (challenge_date, theme, player_key, player_name, session_id, status)
     VALUES (?, ?, ?, ?, ?, 'playing')`
  ).run(challengeDate, theme, playerKey, playerName.trim(), sessionId);
}

export function finishDailyPlayerAttempt(
  sessionId: string,
  status: DailyAttemptStatus,
  attemptsUsed?: number,
  elapsedUs?: number
): void {
  db.prepare(
    `UPDATE daily_player_attempts
     SET status = ?, attempts_used = ?, elapsed_us = ?, completed_at = datetime('now')
     WHERE session_id = ?`
  ).run(status, attemptsUsed ?? null, elapsedUs ?? null, sessionId);
}
