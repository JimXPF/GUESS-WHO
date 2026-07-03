package services

import (
	"encoding/json"
	"fmt"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"
)

func enrichProgressiveRounds(theme types.Theme, rounds []types.ProgressiveRound) []types.ProgressiveRound {
	out := make([]types.ProgressiveRound, len(rounds))
	for i, round := range rounds {
		out[i] = round
		guesses := round.Guesses
		if guesses == nil {
			guesses = []types.ProgressiveGuessEntry{}
		}
		enriched := make([]types.ProgressiveGuessEntry, len(guesses))
		for j, g := range guesses {
			enriched[j] = g
			if g.ImageURL != nil {
				continue
			}
			if g.GuessID == nil || *g.GuessID == "" {
				continue
			}
			if char, ok := GetCharacter(theme, *g.GuessID); ok {
				enriched[j].ImageURL = GetCharacterImage(char)
			}
		}
		out[i].Guesses = enriched
	}
	return out
}

func buildRevealedAnswer(row *SessionRow) *types.RevealedAnswer {
	if row.Status != types.StatusGameOver && row.Status != types.StatusFailed && row.Status != types.StatusQuit {
		return nil
	}

	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil
	}
	revealed := &types.RevealedAnswer{
		Name:     GetDisplayName(answer, row.Theme),
		ImageURL: GetCharacterImage(answer),
	}

	if row.Status == types.StatusQuit {
		return revealed
	}
	if row.GameMode == types.ModeDailyOne {
		return revealed
	}

	if row.GameMode == types.ModeReverseBomb {
		reverseState := ParseReverseState(row.ProgressiveState)
		for _, r := range reverseState.RoundHistory {
			if r.QuestionIndex == row.QuestionIndex {
				return nil
			}
		}
	}

	if isQuestionAnsweredCorrectly(row.ID, row.QuestionIndex) {
		return nil
	}
	return revealed
}

func getReverseStateWithPool(row *SessionRow) (types.ReverseState, error) {
	state := ParseReverseState(row.ProgressiveState)
	if len(state.QuestionPoolIds) > 0 {
		return state, nil
	}
	repaired, err := EnsureReverseQuestionPoolIds(state, row.Theme, row.AnswerID)
	if err != nil {
		return state, err
	}
	raw, err := json.Marshal(repaired)
	if err != nil {
		return repaired, err
	}
	if _, err := db.GetDB().Exec(
		`UPDATE sessions SET progressive_state = ?, updated_at = datetime('now') WHERE id = ?`,
		string(raw), row.ID,
	); err != nil {
		return repaired, err
	}
	row.ProgressiveState = string(raw)
	return repaired, nil
}

// BuildGameSession 组装返回给前端的完整会话载荷。
func BuildGameSession(sessionID string) (*types.GameSession, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, nil
	}

	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil, nil
	}

	base := rowToSession(row)
	activeFields := ParseActiveFields(row.ActiveFields, row.Theme)
	extraHintFields := parseExtraHintFields(row.ExtraHintFields)

	var progressiveState *types.ProgressiveState
	if row.GameMode == types.ModeProgressive {
		ps := ParseProgressiveState(row.ProgressiveState)
		progressiveState = &ps
	}

	var reverseState types.ReverseState
	if row.GameMode == types.ModeReverseBomb {
		rs, err := getReverseStateWithPool(row)
		if err != nil {
			return nil, err
		}
		reverseState = rs
	}

	qIdx := row.QuestionIndex
	guesses, err := loadGuesses(sessionID, &qIdx)
	if err != nil {
		return nil, err
	}
	guesses = enrichGuessImages(row.Theme, guesses)

	questionAttemptsForHints := row.QuestionAttempts
	hitFields := CollectHitFields(guesses)

	var reverseQueries []types.ReverseQueryRecord
	if row.GameMode == types.ModeReverseBomb {
		reverseQueries, err = LoadReverseQueries(sessionID, &qIdx)
		if err != nil {
			return nil, err
		}
	}

	var hints []types.HintInfo
	if row.GameMode == types.ModeReverseBomb {
		if reverseState.AccurateHint != nil {
			hints = []types.HintInfo{*reverseState.AccurateHint}
		} else {
			hints = []types.HintInfo{}
		}
	} else {
		hints = BuildSessionHints(
			row.Theme, answer, row.HintField, extraHintFields,
			questionAttemptsForHints, activeFields, hitFields,
			row.QuestionCompareMove, progressiveState,
		)
	}

	correctAnswers, err := loadCorrectAnswers(sessionID, row.Theme)
	if err != nil {
		return nil, err
	}

	sess := base
	if progressiveState != nil {
		sess.AttemptsLeft = progressiveState.Lives
	}
	if len(hints) > 0 {
		sess.Hint = hints[0]
	} else {
		sess.Hint = types.HintInfo{Field: "_reverse", Label: "逆向轰炸", Value: nil}
	}
	sess.Hints = hints
	sess.Guesses = guesses
	sess.CorrectAnswers = correctAnswers

	if row.GameMode == types.ModeDailyOne {
		elapsed := computeElapsedUs(row)
		sess.ElapsedUs = &elapsed
	}

	if progressiveState != nil {
		rounds := enrichProgressiveRounds(row.Theme, progressiveState.Rounds)
		sess.ProgressiveRounds = rounds
		lives := progressiveState.Lives
		sess.ProgressiveLives = &lives
	}

	if row.GameMode == types.ModeReverseBomb {
		sess.ReverseQueries = reverseQueries
		pool, err := BuildPlayablePool(row.Theme, reverseState.QuestionPoolIds, row.AnswerID)
		if err != nil {
			return nil, err
		}
		sess.ReversePlayablePool = pool
		if reverseQueries != nil {
			eliminated, err := ComputeEliminatedIds(row.Theme, reverseQueries, reverseState.QuestionPoolIds, row.AnswerID)
			if err != nil {
				return nil, err
			}
			sess.ReverseEliminatedIds = eliminated
		}
		finalUsed := reverseState.FinalGuessUsed
		sess.FinalGuessUsed = &finalUsed
		if len(reverseState.FieldChoices) > 0 {
			sess.ReverseFieldChoices = reverseState.FieldChoices
		}
		if len(reverseState.RoundHistory) > 0 {
			sess.ReverseRoundHistory = reverseState.RoundHistory
		}
		phase := reverseState.Phase
		sess.ReversePhase = &phase
	}

	sess.RevealedAnswer = buildRevealedAnswer(row)
	return &sess, nil
}

// GetSession 为前端加载完整会话。
func GetSession(sessionID string) (*types.GameSession, error) {
	sess, err := BuildGameSession(sessionID)
	if err != nil {
		return nil, err
	}
	if sess == nil {
		return nil, fmt.Errorf("session not found")
	}
	return sess, nil
}
