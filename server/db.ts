import initSqlJs, { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import * as fs from 'fs';

let _db: SqlJsDatabase;
// 使用 /tmp 目录存储数据库（平台只读文件系统）
const dbPath = '/tmp/guess-who.db';

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    _db = new SQL.Database(buffer);
  } else {
    _db = new SQL.Database();
  }

  _db.run(`
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
      question_index INTEGER NOT NULL DEFAULT 0,
      extra_hint_fields TEXT NOT NULL DEFAULT '[]',
      used_answer_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'playing',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS guesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      guess_name TEXT NOT NULL,
      guess_id TEXT,
      is_correct INTEGER NOT NULL DEFAULT 0,
      field_results TEXT,
      question_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      theme TEXT NOT NULL,
      total_score INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    _db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(total_score DESC)');
  } catch { /* exists */ }
  try {
    _db.run('CREATE INDEX IF NOT EXISTS idx_guesses_session ON guesses(session_id)');
  } catch { /* exists */ }

  try {
    _db.run('ALTER TABLE sessions ADD COLUMN question_index INTEGER NOT NULL DEFAULT 0');
  } catch { /* exists */ }
  try {
    _db.run('ALTER TABLE guesses ADD COLUMN question_index INTEGER NOT NULL DEFAULT 0');
  } catch { /* exists */ }
  try {
    _db.run("ALTER TABLE sessions ADD COLUMN extra_hint_fields TEXT NOT NULL DEFAULT '[]'");
  } catch { /* exists */ }
  try {
    _db.run("ALTER TABLE sessions ADD COLUMN used_answer_ids TEXT NOT NULL DEFAULT '[]'");
  } catch { /* exists */ }
  try {
    _db.run("ALTER TABLE sessions ADD COLUMN active_fields TEXT NOT NULL DEFAULT '[]'");
  } catch { /* exists */ }
  try {
    _db.run("ALTER TABLE sessions ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'classic-six'");
  } catch { /* exists */ }
  try {
    _db.run('ALTER TABLE sessions ADD COLUMN question_compare_move TEXT');
  } catch { /* exists */ }

  saveDb();
}

// Helper to convert sql.js result to better-sqlite3 compatible format
function queryOne<T>(sql: string, params: SqlValue[] = []): T | undefined {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const result = stmt.getAsObject() as T;
    stmt.free();
    return result;
  }
  stmt.free();
  return undefined;
}

function queryAll<T>(sql: string, params: SqlValue[] = []): T[] {
  const results: T[] = [];
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function execute(sql: string, params: SqlValue[] = []): void {
  _db.run(sql, params);
  saveDb();
}
export function saveDb(): void {
  const data = _db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// Export db-like interface compatible with gameService
export const db = {
  prepare: (sql: string) => ({
    get: <T>(...params: SqlValue[]) => queryOne<T>(sql, params),
    all: <T>(...params: SqlValue[]) => queryAll<T>(sql, params),
    run: (...params: SqlValue[]) => execute(sql, params),
  }),
};
