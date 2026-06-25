import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'guess-who.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    player_name TEXT NOT NULL,
    theme TEXT NOT NULL,
    answer_id TEXT NOT NULL,
    hint_field TEXT NOT NULL,
    attempts_left INTEGER NOT NULL DEFAULT 10,
    score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    question_attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'playing',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS guesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    guess_name TEXT NOT NULL,
    guess_id TEXT,
    is_correct INTEGER NOT NULL DEFAULT 0,
    field_results TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    theme TEXT NOT NULL,
    total_score INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(total_score DESC);
  CREATE INDEX IF NOT EXISTS idx_guesses_session ON guesses(session_id);
`);

try {
  db.exec(`ALTER TABLE sessions ADD COLUMN question_index INTEGER NOT NULL DEFAULT 0`);
} catch {
  /* column exists */
}
try {
  db.exec(`ALTER TABLE guesses ADD COLUMN question_index INTEGER NOT NULL DEFAULT 0`);
} catch {
  /* column exists */
}
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN extra_hint_fields TEXT NOT NULL DEFAULT '[]'`);
} catch {
  /* column exists */
}
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN used_answer_ids TEXT NOT NULL DEFAULT '[]'`);
} catch {
  /* column exists */
}
