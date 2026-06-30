/**
 * sql.js 持久化层（扣子 / 无原生模块环境）
 *
 * 官方说明：https://sql.js.org/
 * - 数据库在内存中，需手动 export + 写盘
 * - 不支持多连接并发写；单进程内内存读写同步完成，落盘 debounce + 串行
 *
 * 扣子编程内置 PostgreSQL（https://docs.coze.cn/guides/integrate_database），
 * 流量增大时可迁移；当前方案适合单实例 + 小库。
 */
import initSqlJs, { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let _db: SqlJsDatabase;

const SAVE_DEBOUNCE_MS = Number(process.env.DB_SAVE_DEBOUNCE_MS) || 400;

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const projectPath = path.join(__dirname, '..', 'guess-who.db');
  try {
    fs.accessSync(path.dirname(projectPath), fs.constants.W_OK);
    return projectPath;
  } catch {
    return path.join(os.tmpdir(), 'guess-who.db');
  }
}

const dbPath = resolveDbPath();

function wasmLocateFile(file: string): string {
  try {
    const distDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
    return path.join(distDir, file);
  } catch {
    return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<void> = Promise.resolve();
let dirty = false;

function flushDbSync(): void {
  if (!_db) return;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${dbPath}.${process.pid}.tmp`;
  const data = _db.export();
  fs.writeFileSync(tmpPath, Buffer.from(data));
  fs.renameSync(tmpPath, dbPath);
  dirty = false;
}

function schedulePersist(): void {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveChain = saveChain
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            setImmediate(() => {
              try {
                if (dirty) flushDbSync();
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          })
      )
      .catch((err) => {
        console.error('[db] persist failed:', err);
      });
  }, SAVE_DEBOUNCE_MS);
}

/** 立即落盘（进程退出前调用） */
export async function flushDb(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await saveChain;
  if (dirty) flushDbSync();
}

export function getDbPath(): string {
  return dbPath;
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: wasmLocateFile,
  });

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
  try {
    _db.run("ALTER TABLE leaderboard ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'classic-six'");
  } catch { /* exists */ }
  try {
    _db.run('ALTER TABLE sessions ADD COLUMN started_at_hrtime TEXT');
  } catch { /* exists */ }
  try {
    _db.run('ALTER TABLE sessions ADD COLUMN elapsed_us INTEGER');
  } catch { /* exists */ }
  try {
    _db.run("ALTER TABLE sessions ADD COLUMN progressive_state TEXT NOT NULL DEFAULT '{}'");
  } catch { /* exists */ }
  try {
    _db.run('ALTER TABLE sessions ADD COLUMN room_code TEXT');
  } catch { /* exists */ }
  try {
    _db.run('ALTER TABLE guesses ADD COLUMN score_delta INTEGER');
  } catch { /* exists */ }

  _db.run(`
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_date TEXT NOT NULL,
      theme TEXT NOT NULL,
      answer_id TEXT NOT NULL,
      hint_field TEXT NOT NULL,
      extra_hint_fields TEXT NOT NULL DEFAULT '[]',
      active_fields TEXT NOT NULL DEFAULT '[]',
      question_compare_move TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(challenge_date, theme)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS daily_leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_date TEXT NOT NULL,
      theme TEXT NOT NULL,
      player_name TEXT NOT NULL,
      attempts_used INTEGER NOT NULL,
      elapsed_us INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(challenge_date, theme, player_name)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS daily_player_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_date TEXT NOT NULL,
      theme TEXT NOT NULL,
      player_key TEXT NOT NULL,
      player_name TEXT NOT NULL,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'playing',
      attempts_used INTEGER,
      elapsed_us INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(challenge_date, theme, player_key)
    )
  `);

  try {
    _db.run('CREATE INDEX IF NOT EXISTS idx_daily_attempts_session ON daily_player_attempts(session_id)');
  } catch { /* exists */ }
  try {
    _db.run('CREATE INDEX IF NOT EXISTS idx_daily_lb ON daily_leaderboard(challenge_date, theme, attempts_used, elapsed_us)');
  } catch { /* exists */ }
  try {
    _db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_mode ON leaderboard(game_mode, theme, total_score DESC)');
  } catch { /* exists */ }

  flushDbSync();
  console.log(`[db] sql.js ready, path=${dbPath}, debounce=${SAVE_DEBOUNCE_MS}ms`);
}

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

export const db = {
  prepare: (sql: string) => ({
    get: <T>(...params: SqlValue[]) => queryOne<T>(sql, params),
    all: <T>(...params: SqlValue[]) => queryAll<T>(sql, params),
    run: (...params: SqlValue[]) => {
      _db.run(sql, params);
      schedulePersist();
    },
  }),
};

export function registerDbShutdownHooks(): void {
  const shutdown = () => {
    try {
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty) flushDbSync();
    } catch (err) {
      console.error('[db] shutdown flush failed:', err);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
