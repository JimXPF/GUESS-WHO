package services

import (
	"database/sql"
	"strings"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"
)

// DailyPlayerAttemptRow 对应 daily_player_attempts 表行。
type DailyPlayerAttemptRow struct {
	ChallengeDate string
	Theme         types.Theme
	PlayerKey     string
	PlayerName    string
	SessionID     string
	Status        types.SessionStatus
	AttemptsUsed  *int
	ElapsedUs     *int64
}

// GetDailyPlayerAttempt 加载某玩家的每日尝试记录。
func GetDailyPlayerAttempt(challengeDate string, theme types.Theme, playerKey string) (*DailyPlayerAttemptRow, error) {
	database := db.GetDB()
	row := database.QueryRow(`
		SELECT challenge_date, theme, player_key, player_name, session_id, status, attempts_used, elapsed_us
		FROM daily_player_attempts
		WHERE challenge_date = ? AND theme = ? AND player_key = ?`, challengeDate, theme, playerKey)

	var out DailyPlayerAttemptRow
	var themeStr, statusStr string
	var attempts sql.NullInt64
	var elapsed sql.NullInt64
	err := row.Scan(
		&out.ChallengeDate, &themeStr, &out.PlayerKey, &out.PlayerName, &out.SessionID,
		&statusStr, &attempts, &elapsed,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	out.Theme = types.Theme(themeStr)
	out.Status = types.SessionStatus(statusStr)
	if attempts.Valid {
		v := int(attempts.Int64)
		out.AttemptsUsed = &v
	}
	if elapsed.Valid {
		v := elapsed.Int64
		out.ElapsedUs = &v
	}
	return &out, nil
}

// StartDailyAttempt 检查玩家是否可以开始今日每日挑战。
// 若有进行中的会话应恢复，则返回 resumeSessionID。
func StartDailyAttempt(
	challengeDate string,
	theme types.Theme,
	playerKey string,
	priorSessionStatus func(sessionID string) (types.SessionStatus, bool),
) (resumeSessionID string, err error) {
	key := strings.TrimSpace(playerKey)
	if key == "" {
		return "", nil
	}
	existing, err := GetDailyPlayerAttempt(challengeDate, theme, key)
	if err != nil {
		return "", err
	}
	if existing == nil {
		return "", nil
	}
	if existing.Status == types.StatusPlaying {
		if priorSessionStatus != nil {
			if status, ok := priorSessionStatus(existing.SessionID); ok && status == types.StatusPlaying {
				return existing.SessionID, nil
			}
		}
	}
	return "", types.NewDailyAlreadyPlayedError(existing.SessionID)
}

// RegisterDailyPlayerAttempt 在会话开始时记录新的每日尝试。
func RegisterDailyPlayerAttempt(theme types.Theme, playerKey, playerName, sessionID string) error {
	challengeDate := GetDailyChallengeDate()
	_, err := db.GetDB().Exec(`
		INSERT INTO daily_player_attempts (challenge_date, theme, player_key, player_name, session_id, status)
		VALUES (?, ?, ?, ?, ?, ?)`,
		challengeDate, theme, strings.TrimSpace(playerKey), strings.TrimSpace(playerName), sessionID, types.StatusPlaying,
	)
	return err
}

// FinishDailyPlayerAttempt 在每日会话结束时更新尝试状态。
func FinishDailyPlayerAttempt(sessionID string, status types.SessionStatus, attemptsUsed *int, elapsedUs *int64) error {
	_, err := db.GetDB().Exec(`
		UPDATE daily_player_attempts
		SET status = ?, attempts_used = ?, elapsed_us = ?, completed_at = datetime('now')
		WHERE session_id = ?`, status, attemptsUsed, elapsedUs, sessionID)
	return err
}

// GetDailyTodayInfo 返回玩家今日的每日挑战状态。
func GetDailyTodayInfo(theme types.Theme, playerKey string) (*types.DailyTodayInfo, error) {
	challengeDate := GetDailyChallengeDate()
	if _, err := GetOrCreateDailyChallenge(theme); err != nil {
		return nil, err
	}

	info := &types.DailyTodayInfo{
		ChallengeDate: challengeDate,
		Theme:         theme,
		Completed:     false,
	}

	key := strings.TrimSpace(playerKey)
	if key == "" {
		return info, nil
	}

	attempt, err := GetDailyPlayerAttempt(challengeDate, theme, key)
	if err != nil {
		return nil, err
	}
	if attempt == nil {
		return info, nil
	}

	finished := attempt.Status != types.StatusPlaying
	info.Completed = finished
	sid := attempt.SessionID
	info.SessionID = &sid
	info.Status = attempt.Status
	info.BestAttempts = attempt.AttemptsUsed
	info.BestElapsedUs = attempt.ElapsedUs
	if attempt.Status == types.StatusPlaying {
		info.InProgress = true
	}
	return info, nil
}
