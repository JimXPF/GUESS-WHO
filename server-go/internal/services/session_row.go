package services

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"time"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"
)

// SessionRow 对应 sessions 表的全部列。
type SessionRow struct {
	ID                  string
	PlayerName          string
	Theme               types.Theme
	GameMode            types.GameMode
	AnswerID            string
	HintField           string
	ExtraHintFields     string
	ActiveFields        string
	QuestionCompareMove *string
	UsedAnswerIDs       string
	AttemptsLeft        int
	Score               int
	CorrectCount        int
	QuestionAttempts    int
	QuestionIndex       int
	Status              types.SessionStatus
	StartedAtHrtime     *string
	ElapsedUs           *int64
	ProgressiveState    string
	RoomCode            *string
}

func hrtimeNs() int64 {
	return time.Now().UnixNano()
}

// HrtimeUs 将当前高精度时间存为字符串（纳秒）。
func HrtimeUs() string {
	return strconv.FormatInt(hrtimeNs(), 10)
}

func getSessionRow(sessionID string) (*SessionRow, error) {
	database := db.GetDB()
	row := database.QueryRow(`
		SELECT id, player_name, theme, game_mode, answer_id, hint_field, extra_hint_fields,
		       active_fields, question_compare_move, used_answer_ids, attempts_left, score,
		       correct_count, question_attempts, question_index, status, started_at_hrtime,
		       elapsed_us, progressive_state, room_code
		FROM sessions WHERE id = ?`, sessionID)

	var out SessionRow
	var themeStr, modeStr, statusStr string
	var compareMove, startedAt, roomCode sql.NullString
	var elapsed sql.NullInt64
	var extraHint, activeFields, usedIDs, progressive sql.NullString

	err := row.Scan(
		&out.ID, &out.PlayerName, &themeStr, &modeStr, &out.AnswerID, &out.HintField,
		&extraHint, &activeFields, &compareMove, &usedIDs, &out.AttemptsLeft, &out.Score,
		&out.CorrectCount, &out.QuestionAttempts, &out.QuestionIndex, &statusStr,
		&startedAt, &elapsed, &progressive, &roomCode,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	out.Theme = types.Theme(themeStr)
	out.GameMode = types.GameMode(modeStr)
	if out.GameMode == "" {
		out.GameMode = types.ModeClassicSix
	}
	out.Status = types.SessionStatus(statusStr)
	if extraHint.Valid {
		out.ExtraHintFields = extraHint.String
	}
	if activeFields.Valid {
		out.ActiveFields = activeFields.String
	}
	if usedIDs.Valid {
		out.UsedAnswerIDs = usedIDs.String
	}
	if compareMove.Valid {
		s := compareMove.String
		out.QuestionCompareMove = &s
	}
	if startedAt.Valid {
		s := startedAt.String
		out.StartedAtHrtime = &s
	}
	if elapsed.Valid {
		v := elapsed.Int64
		out.ElapsedUs = &v
	}
	if progressive.Valid {
		out.ProgressiveState = progressive.String
	}
	if roomCode.Valid {
		s := roomCode.String
		out.RoomCode = &s
	}
	return &out, nil
}

func parseExtraHintFields(raw string) []string {
	var parsed []string
	if err := json.Unmarshal([]byte(rawOrEmpty(raw)), &parsed); err != nil {
		return []string{}
	}
	out := make([]string, 0, len(parsed))
	for _, f := range parsed {
		if f != "" {
			out = append(out, f)
		}
	}
	return out
}

func parseUsedAnswerIds(raw string) []string {
	var parsed []string
	if err := json.Unmarshal([]byte(rawOrEmpty(raw)), &parsed); err != nil {
		return []string{}
	}
	out := make([]string, 0, len(parsed))
	for _, id := range parsed {
		if id != "" {
			out = append(out, id)
		}
	}
	return out
}

func rawOrEmpty(s string) string {
	if s == "" {
		return "[]"
	}
	return s
}

func computeElapsedUs(row *SessionRow) int64 {
	if row.StartedAtHrtime != nil && *row.StartedAtHrtime != "" {
		start, err := strconv.ParseInt(*row.StartedAtHrtime, 10, 64)
		if err == nil {
			return (hrtimeNs() - start) / 1000
		}
	}
	if row.ElapsedUs != nil {
		return *row.ElapsedUs
	}
	return 0
}

func getMaxAttemptsForMode(mode types.GameMode) int {
	switch mode {
	case types.ModeDailyOne:
		return DailyMaxAttempts
	case types.ModeProgressive:
		return ProgressiveLives
	case types.ModeReverseBomb:
		return ReverseQueryAttempts
	default:
		return MaxAttempts
	}
}

func rowToSession(row *SessionRow) types.GameSession {
	showGrid := row.GameMode != types.ModeProgressive && row.GameMode != types.ModeReverseBomb
	return types.GameSession{
		SessionID:        row.ID,
		PlayerName:       row.PlayerName,
		Theme:            row.Theme,
		GameMode:         row.GameMode,
		ActiveFields:     ParseActiveFields(row.ActiveFields, row.Theme),
		AttemptsLeft:     row.AttemptsLeft,
		Score:            row.Score,
		CorrectCount:     row.CorrectCount,
		Status:           row.Status,
		QuestionAttempts: row.QuestionAttempts,
		QuestionIndex:    row.QuestionIndex,
		ElapsedUs:        row.ElapsedUs,
		MaxAttempts:      getMaxAttemptsForMode(row.GameMode),
		RoomCode:         row.RoomCode,
		ShowCompareGrid:  &showGrid,
	}
}

func isQuestionAnsweredCorrectly(sessionID string, questionIndex int) bool {
	database := db.GetDB()
	var n int
	err := database.QueryRow(`
		SELECT 1 FROM guesses
		WHERE session_id = ? AND question_index = ? AND is_correct = 1 LIMIT 1`,
		sessionID, questionIndex,
	).Scan(&n)
	return err == nil
}
