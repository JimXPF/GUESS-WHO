package services

import (
	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"
)

// GetLeaderboard 返回某游戏模式的得分排行榜行。
func GetLeaderboard(limit int, gameMode types.GameMode, theme *types.Theme) ([]types.LeaderboardEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	if gameMode == "" {
		gameMode = types.ModeClassicSix
	}

	query := `SELECT id, player_name, theme, game_mode, total_score, correct_count, created_at
		FROM leaderboard WHERE total_score > 0 AND game_mode = ?`
	args := []interface{}{gameMode}
	if theme != nil {
		query += ` AND theme = ?`
		args = append(args, *theme)
	}
	query += ` ORDER BY total_score DESC, correct_count DESC LIMIT ?`
	args = append(args, limit)

	rows, err := db.GetDB().Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []types.LeaderboardEntry
	for rows.Next() {
		var e types.LeaderboardEntry
		var themeStr, modeStr string
		if err := rows.Scan(&e.ID, &e.PlayerName, &themeStr, &modeStr, &e.TotalScore, &e.CorrectCount, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Theme = types.Theme(themeStr)
		e.GameMode = types.GameMode(modeStr)
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []types.LeaderboardEntry{}
	}
	return entries, nil
}

// GetDailyLeaderboard 返回某主题今日的每日排行榜。
func GetDailyLeaderboard(theme types.Theme, limit int, challengeDate string) ([]types.DailyLeaderboardEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	date := challengeDate
	if date == "" {
		date = GetDailyChallengeDate()
	}

	rows, err := db.GetDB().Query(`
		SELECT id, player_name, theme, challenge_date, attempts_used, elapsed_us, completed_at
		FROM daily_leaderboard
		WHERE challenge_date = ? AND theme = ?
		ORDER BY attempts_used ASC, elapsed_us ASC
		LIMIT ?`, date, theme, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []types.DailyLeaderboardEntry
	for rows.Next() {
		var e types.DailyLeaderboardEntry
		var themeStr string
		if err := rows.Scan(&e.ID, &e.PlayerName, &themeStr, &e.ChallengeDate, &e.AttemptsUsed, &e.ElapsedUs, &e.CompletedAt); err != nil {
			return nil, err
		}
		e.Theme = types.Theme(themeStr)
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []types.DailyLeaderboardEntry{}
	}
	return entries, nil
}
