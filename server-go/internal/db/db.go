package db

import (
	"database/sql"
	_ "modernc.org/sqlite"
	"log"
	"path/filepath"
	"sync"
)

var (
	db   *sql.DB
	once sync.Once
)

// Init 打开（或创建）SQLite 数据库并确保 schema 存在。
func Init(dbPath string) (*sql.DB, error) {
	var err error
	once.Do(func() {
		if dbPath == "" {
			dbPath = filepath.Join(".", "guess-who.db")
		}
		db, err = sql.Open("sqlite", dbPath)
		if err != nil {
			return
		}
		if err = createSchema(db); err != nil {
			log.Printf("schema creation failed: %v", err)
		}
	})
	return db, err
}

func createSchema(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			player_name TEXT,
			theme TEXT,
			game_mode TEXT,
			answer_id TEXT,
			hint_field TEXT,
			extra_hint_fields TEXT,
			active_fields TEXT,
			used_answer_ids TEXT,
			progressive_state TEXT,
			question_compare_move TEXT,
			attempts_left INTEGER,
			score INTEGER,
			correct_count INTEGER,
			question_attempts INTEGER,
			question_index INTEGER,
			status TEXT,
			started_at_hrtime TEXT,
			elapsed_us INTEGER,
			room_code TEXT,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS guesses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT,
			guess_name TEXT,
			guess_id TEXT,
			is_correct INTEGER,
			field_results TEXT,
			question_index INTEGER,
			score_delta INTEGER,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS leaderboard (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			player_name TEXT,
			theme TEXT,
			game_mode TEXT,
			total_score INTEGER,
			correct_count INTEGER,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS daily_challenges (
			challenge_date TEXT,
			theme TEXT,
			answer_id TEXT,
			hint_field TEXT,
			extra_hint_fields TEXT,
			active_fields TEXT,
			question_compare_move TEXT,
			UNIQUE(challenge_date, theme)
		)`,
		`CREATE TABLE IF NOT EXISTS daily_leaderboard (
			challenge_date TEXT,
			theme TEXT,
			player_name TEXT,
			attempts_used INTEGER,
			elapsed_us INTEGER,
			completed_at TEXT,
			UNIQUE(challenge_date, theme, player_name)
		)`,
		`CREATE TABLE IF NOT EXISTS daily_player_attempts (
			challenge_date TEXT,
			theme TEXT,
			player_key TEXT,
			player_name TEXT,
			session_id TEXT,
			status TEXT,
			attempts_used INTEGER,
			elapsed_us INTEGER,
			UNIQUE(challenge_date, theme, player_key)
		)`,
	}
	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

// GetDB 返回单例数据库连接。
func GetDB() *sql.DB {
	return db
}

// Close 关闭数据库连接。
func Close() error {
	if db != nil {
		return db.Close()
	}
	return nil
}
