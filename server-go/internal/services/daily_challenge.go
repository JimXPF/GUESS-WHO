package services

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"
)

// DailyChallengeRow 对应 daily_challenges 表行。
type DailyChallengeRow struct {
	ChallengeDate       string
	Theme               types.Theme
	AnswerID            string
	HintField           string
	ExtraHintFields     string
	ActiveFields        string
	QuestionCompareMove *string
}

// GetDailyChallengeDate 返回今日 UTC+8 日期字符串。
func GetDailyChallengeDate() string {
	return GetUtc8DateString()
}

// GetOrCreateDailyChallenge 加载或创建某主题今日的每日挑战。
func GetOrCreateDailyChallenge(theme types.Theme) (*DailyChallengeRow, error) {
	challengeDate := GetDailyChallengeDate()
	database := db.GetDB()

	row := database.QueryRow(`
		SELECT challenge_date, theme, answer_id, hint_field, extra_hint_fields, active_fields, question_compare_move
		FROM daily_challenges WHERE challenge_date = ? AND theme = ?`, challengeDate, theme)

	var existing DailyChallengeRow
	var themeStr string
	var compareMove sql.NullString
	err := row.Scan(
		&existing.ChallengeDate, &themeStr, &existing.AnswerID, &existing.HintField,
		&existing.ExtraHintFields, &existing.ActiveFields, &compareMove,
	)
	if err == nil {
		existing.Theme = types.Theme(themeStr)
		if compareMove.Valid {
			s := compareMove.String
			existing.QuestionCompareMove = &s
		}
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	seed := HashStringToSeed(fmt.Sprintf("%s:%s", challengeDate, theme))
	rng := NewSeededRng(seed)
	answer, err := PickRandomCharacter(theme, nil, rng)
	if err != nil {
		return nil, err
	}
	setup, err := ResolveQuestionSetupWithRng(theme, answer, rng)
	if err != nil {
		return nil, err
	}

	extraJSON, _ := json.Marshal(setup.ExtraHintFields)
	activeJSON, _ := json.Marshal(setup.ActiveFields)

	_, err = database.Exec(`
		INSERT INTO daily_challenges (challenge_date, theme, answer_id, hint_field, extra_hint_fields, active_fields, question_compare_move)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		challengeDate, theme, setup.AnswerID, setup.HintField,
		string(extraJSON), string(activeJSON), setup.CompareMove,
	)
	if err != nil {
		return nil, fmt.Errorf("insert daily challenge: %w", err)
	}

	return &DailyChallengeRow{
		ChallengeDate:       challengeDate,
		Theme:               theme,
		AnswerID:            setup.AnswerID,
		HintField:           setup.HintField,
		ExtraHintFields:     string(extraJSON),
		ActiveFields:        string(activeJSON),
		QuestionCompareMove: setup.CompareMove,
	}, nil
}

// DailyRowToSetup 将数据库行转换为 QuestionSetup。
func DailyRowToSetup(row *DailyChallengeRow) types.QuestionSetup {
	setup := types.QuestionSetup{
		AnswerID:    row.AnswerID,
		HintField:   row.HintField,
		CompareMove: row.QuestionCompareMove,
	}
	_ = json.Unmarshal([]byte(row.ExtraHintFields), &setup.ExtraHintFields)
	if setup.ExtraHintFields == nil {
		setup.ExtraHintFields = []string{}
	}
	_ = json.Unmarshal([]byte(row.ActiveFields), &setup.ActiveFields)
	if setup.ActiveFields == nil {
		setup.ActiveFields = []string{}
	}
	return setup
}
