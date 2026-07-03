package services

import (
	"database/sql"
	"encoding/json"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"
)

func showCompareGrid(mode types.GameMode) *bool {
	if mode == types.ModeProgressive || mode == types.ModeReverseBomb {
		v := false
		return &v
	}
	v := true
	return &v
}

func loadGuesses(sessionID string, questionIndex *int) ([]types.GuessRecord, error) {
	database := db.GetDB()
	rows, err := database.Query(`
		SELECT id, guess_name, guess_id, is_correct, field_results, question_index, score_delta, created_at
		FROM guesses WHERE session_id = ? ORDER BY id ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	guesses := []types.GuessRecord{}
	for rows.Next() {
		var g types.GuessRecord
		var guessID sql.NullString
		var fieldJSON sql.NullString
		var scoreDelta sql.NullInt64
		if err := rows.Scan(&g.ID, &g.GuessName, &guessID, &g.IsCorrect, &fieldJSON, &g.QuestionIndex, &scoreDelta, &g.CreatedAt); err != nil {
			return nil, err
		}
		if questionIndex != nil && g.QuestionIndex != *questionIndex {
			continue
		}
		if guessID.Valid {
			s := guessID.String
			g.GuessID = &s
		}
		if scoreDelta.Valid {
			d := int(scoreDelta.Int64)
			g.ScoreDelta = &d
		}
		if fieldJSON.Valid && fieldJSON.String != "" {
			var parsed interface{}
			if err := json.Unmarshal([]byte(fieldJSON.String), &parsed); err == nil {
				if arr, ok := parsed.([]interface{}); ok {
					fieldResults := make([]types.FieldCompare, 0, len(arr))
					raw, _ := json.Marshal(arr)
					_ = json.Unmarshal(raw, &fieldResults)
					g.FieldResults = &fieldResults
				}
			}
		}
		guesses = append(guesses, g)
	}
	return guesses, nil
}

func enrichGuessImages(theme types.Theme, guesses []types.GuessRecord) []types.GuessRecord {
	out := make([]types.GuessRecord, len(guesses))
	for i, g := range guesses {
		out[i] = g
		if g.GuessID != nil && *g.GuessID != "" {
			if char, ok := GetCharacter(theme, *g.GuessID); ok {
				out[i].ImageURL = GetCharacterImage(char)
			}
		}
	}
	return out
}

func loadCorrectAnswers(sessionID string, theme types.Theme) ([]types.CorrectAnswerRecord, error) {
	database := db.GetDB()
	rows, err := database.Query(`
		SELECT guess_name, guess_id, question_index, field_results FROM guesses
		WHERE session_id = ? AND is_correct = 1 ORDER BY id ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []types.CorrectAnswerRecord
	for rows.Next() {
		var r types.CorrectAnswerRecord
		var fieldJSON sql.NullString
		if err := rows.Scan(&r.GuessName, &r.GuessID, &r.QuestionIndex, &fieldJSON); err != nil {
			return nil, err
		}
		if char, ok := GetCharacter(theme, r.GuessID); ok {
			r.ImageURL = GetCharacterImage(char)
		}
		if fieldJSON.Valid && fieldJSON.String != "" {
			var parsed interface{}
			if err := json.Unmarshal([]byte(fieldJSON.String), &parsed); err == nil {
				if arr, ok := parsed.([]interface{}); ok {
					fieldResults := make([]types.FieldCompare, 0, len(arr))
					raw, _ := json.Marshal(arr)
					_ = json.Unmarshal(raw, &fieldResults)
					r.FieldResults = fieldResults
				}
			}
		}
		out = append(out, r)
	}
	if out == nil {
		out = []types.CorrectAnswerRecord{}
	}
	return out, nil
}

func parseStringSlice(raw sql.NullString) []string {
	if !raw.Valid || raw.String == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw.String), &out); err != nil {
		return []string{}
	}
	if out == nil {
		return []string{}
	}
	return out
}
