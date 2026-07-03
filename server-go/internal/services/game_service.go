package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"

	"github.com/google/uuid"
)

// StartSession 创建新的单人游戏会话。
func StartSession(playerName string, theme types.Theme, mode types.GameMode, playerKey string) (*types.GameSession, error) {
	if mode == types.ModeDailyOne {
		key := strings.TrimSpace(playerKey)
		if key == "" {
			key = "unknown"
		}
		challengeDate := GetDailyChallengeDate()
		resumeID, err := StartDailyAttempt(challengeDate, theme, key, func(sessionID string) (types.SessionStatus, bool) {
			row, err := getSessionRow(sessionID)
			if err != nil || row == nil {
				return "", false
			}
			return row.Status, true
		})
		if err != nil {
			return nil, err
		}
		if resumeID != "" {
			return BuildGameSession(resumeID)
		}
	}

	sessionID := uuid.NewString()
	var setup types.QuestionSetup
	var progressiveState *types.ProgressiveState
	var reverseStateJSON string

	if mode == types.ModeDailyOne {
		daily, err := GetOrCreateDailyChallenge(theme)
		if err != nil {
			return nil, err
		}
		setup = DailyRowToSetup(daily)
	} else {
		rng := NewSeededRng(QuestionSetupSeed(sessionID, theme, 0))
		answer, err := PickRandomCharacter(theme, nil, rng)
		if err != nil {
			return nil, err
		}
		resolved, err := ResolveQuestionSetupWithRng(theme, answer, rng)
		if err != nil {
			return nil, err
		}
		setup = resolved
		if mode == types.ModeProgressive {
			ps := CreateInitialProgressiveState(theme, setup, answer, rng, nil)
			progressiveState = &ps
		}
	}

	if mode == types.ModeReverseBomb {
		answer, ok := GetCharacter(theme, setup.AnswerID)
		if !ok {
			return nil, fmt.Errorf("answer not found")
		}
		setup = types.QuestionSetup{
			AnswerID:        answer.ID(),
			HintField:       "_reverse",
			ExtraHintFields: []string{},
			ActiveFields:    GetReverseQueryableFields(theme),
			CompareMove:     nil,
		}
		reverseState, err := CreateInitialReverseState(theme, setup.AnswerID)
		if err != nil {
			return nil, err
		}
		b, _ := json.Marshal(reverseState)
		reverseStateJSON = string(b)
	}

	if err := insertSession(sessionID, playerName, theme, mode, setup, getMaxAttemptsForMode(mode), insertSessionExtra{
		progressiveState: progressiveState,
		reverseStateJSON: reverseStateJSON,
	}); err != nil {
		return nil, err
	}

	if mode == types.ModeDailyOne && strings.TrimSpace(playerKey) != "" {
		if err := RegisterDailyPlayerAttempt(theme, playerKey, playerName, sessionID); err != nil {
			return nil, err
		}
	}

	return BuildGameSession(sessionID)
}

type insertSessionExtra struct {
	progressiveState *types.ProgressiveState
	reverseStateJSON string
	roomCode         *string
	usedAnswerIDs    []string
}

func insertSession(
	sessionID, playerName string,
	theme types.Theme,
	gameMode types.GameMode,
	setup types.QuestionSetup,
	attempts int,
	extra insertSessionExtra,
) error {
	used := extra.usedAnswerIDs
	if used == nil {
		used = []string{setup.AnswerID}
	}
	extraJSON, _ := json.Marshal(setup.ExtraHintFields)
	activeJSON, _ := json.Marshal(setup.ActiveFields)
	usedJSON, _ := json.Marshal(used)

	stateJSON := extra.reverseStateJSON
	if stateJSON == "" {
		if extra.progressiveState != nil {
			b, _ := json.Marshal(extra.progressiveState)
			stateJSON = string(b)
		} else {
			stateJSON = "{}"
		}
	}

	_, err := db.GetDB().Exec(`
		INSERT INTO sessions (
			id, player_name, theme, game_mode, answer_id, hint_field, extra_hint_fields,
			active_fields, question_compare_move, used_answer_ids, attempts_left, score,
			correct_count, question_attempts, question_index, status, started_at_hrtime,
			progressive_state, room_code
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)`,
		sessionID, strings.TrimSpace(playerName), theme, gameMode, setup.AnswerID, setup.HintField,
		string(extraJSON), string(activeJSON), setup.CompareMove, string(usedJSON), attempts,
		types.StatusPlaying, HrtimeUs(), stateJSON, extra.roomCode,
	)
	return err
}

// SubmitGuess 处理单人模式下的猜测。
func SubmitGuess(sessionID, guessText string, characterID *string) (*types.GuessResponse, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("Session not found")
	}
	if row.RoomCode != nil && *row.RoomCode != "" {
		return nil, errors.New("多人模式请通过房间提交猜测")
	}
	if row.Status == types.StatusGameOver || row.Status == types.StatusQuit || row.Status == types.StatusFailed {
		return nil, errors.New("Game already ended")
	}
	if row.Status == types.StatusQuestionDone && row.GameMode != types.ModeDailyOne {
		return nil, errors.New("Answer already found, proceed to next question")
	}

	var character types.CharacterEntry
	var ok bool
	if characterID != nil && *characterID != "" {
		character, ok = FindCharacterById(row.Theme, *characterID)
	}
	if !ok {
		character, ok = FindCharacterByGuess(row.Theme, guessText)
	}
	if !ok {
		sess, err := BuildGameSession(sessionID)
		if err != nil {
			return nil, err
		}
		return &types.GuessResponse{
			Session:   *sess,
			NotInBank: true,
			Message:   "题库中没有该角色，请从联想列表中选择或检查拼写",
		}, nil
	}

	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil, errors.New("answer not found")
	}

	switch row.GameMode {
	case types.ModeProgressive:
		return submitProgressiveGuess(row, character, answer)
	case types.ModeReverseBomb:
		return submitReverseBombGuess(row, character, answer)
	default:
		return submitClassicGuess(row, character, answer)
	}
}

func submitClassicGuess(row *SessionRow, character, answer types.CharacterEntry) (*types.GuessResponse, error) {
	activeFields := ParseActiveFields(row.ActiveFields, row.Theme)
	gameMode := row.GameMode
	if gameMode == "" {
		gameMode = types.ModeClassicSix
	}

	isCorrect := character.ID() == answer.ID()
	fieldResults := CompareAllFields(row.Theme, character, answer, activeFields, row.QuestionCompareMove)

	attemptsLeft := row.AttemptsLeft - 1
	questionAttempts := row.QuestionAttempts + 1
	score := row.Score
	correctCount := row.CorrectCount
	status := row.Status
	var lastQuestionScore *int
	var elapsedUs *int64

	if isCorrect {
		if gameMode == types.ModeDailyOne {
			elapsed := computeElapsedUs(row)
			elapsedUs = &elapsed
			saveDailyLeaderboard(row.PlayerName, row.Theme, questionAttempts, elapsed)
			attemptsUsed := questionAttempts
			_ = FinishDailyPlayerAttempt(row.ID, types.StatusGameOver, &attemptsUsed, &elapsed)
			status = types.StatusGameOver
			_, err := db.GetDB().Exec(`
				UPDATE sessions SET elapsed_us = ?, status = ?, question_attempts = ?, attempts_left = ?, updated_at = datetime('now')
				WHERE id = ?`, elapsed, status, questionAttempts, attemptsLeft, row.ID)
			if err != nil {
				return nil, err
			}
		} else {
			qs := ScoreForQuestion(questionAttempts)
			lastQuestionScore = &qs
			score += qs
			correctCount++
			attemptsLeft = minInt(MaxAttempts, attemptsLeft+2)
			status = types.StatusQuestionDone
			_, err := db.GetDB().Exec(`
				UPDATE sessions SET attempts_left = ?, score = ?, correct_count = ?, question_attempts = ?, status = ?, updated_at = datetime('now')
				WHERE id = ?`, attemptsLeft, score, correctCount, questionAttempts, status, row.ID)
			if err != nil {
				return nil, err
			}
		}
	} else if attemptsLeft <= 0 {
		if gameMode == types.ModeDailyOne {
			status = types.StatusFailed
			elapsed := computeElapsedUs(row)
			elapsedUs = &elapsed
			attemptsUsed := questionAttempts
			_ = FinishDailyPlayerAttempt(row.ID, types.StatusFailed, &attemptsUsed, &elapsed)
			_, err := db.GetDB().Exec(`
				UPDATE sessions SET attempts_left = ?, question_attempts = ?, status = ?, elapsed_us = ?, updated_at = datetime('now')
				WHERE id = ?`, attemptsLeft, questionAttempts, status, elapsed, row.ID)
			if err != nil {
				return nil, err
			}
		} else {
			status = types.StatusGameOver
			_, err := db.GetDB().Exec(`
				UPDATE sessions SET attempts_left = ?, question_attempts = ?, status = ?, updated_at = datetime('now')
				WHERE id = ?`, attemptsLeft, questionAttempts, status, row.ID)
			if err != nil {
				return nil, err
			}
			endRow := *row
			endRow.Status = status
			handleGameEndLeaderboard(&endRow, score, correctCount)
		}
	} else {
		_, err := db.GetDB().Exec(`
			UPDATE sessions SET attempts_left = ?, question_attempts = ?, updated_at = datetime('now') WHERE id = ?`,
			attemptsLeft, questionAttempts, row.ID)
		if err != nil {
			return nil, err
		}
	}
	_ = elapsedUs

	fieldJSON, _ := json.Marshal(fieldResults)
	_, err := db.GetDB().Exec(`
		INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
		VALUES (?, ?, ?, ?, ?, ?)`,
		row.ID, GetDisplayName(character, row.Theme), character.ID(), boolToInt(isCorrect),
		string(fieldJSON), row.QuestionIndex)
	if err != nil {
		return nil, err
	}

	sess, err := BuildGameSession(row.ID)
	if err != nil {
		return nil, err
	}
	sess.LastGuessCorrect = &isCorrect
	sess.LastQuestionScore = lastQuestionScore

	resp := &types.GuessResponse{Session: *sess}
	if !isCorrect && attemptsLeft <= 0 {
		resp.CorrectAnswer = &types.RevealedAnswer{
			Name:     GetDisplayName(answer, row.Theme),
			ImageURL: GetCharacterImage(answer),
		}
	}
	return resp, nil
}

func submitProgressiveGuess(row *SessionRow, character, answer types.CharacterEntry) (*types.GuessResponse, error) {
	state := ParseProgressiveState(row.ProgressiveState)
	outcome := EvaluateProgressiveGuess(state, row.Theme, character, answer, row.QuestionCompareMove)

	isCorrect := outcome.GuessEntry.IsCorrect
	score := row.Score
	correctCount := row.CorrectCount
	status := row.Status
	var lastQuestionScore *int
	attemptsLeft := outcome.State.Lives

	if isCorrect {
		qs := ScoreForQuestion(outcome.State.QuestionAttempts)
		lastQuestionScore = &qs
		score += qs
		correctCount++
		status = types.StatusQuestionDone
	}

	if !isCorrect && outcome.State.Lives <= 0 {
		status = types.StatusGameOver
	}

	stateJSON, _ := json.Marshal(outcome.State)
	_, err := db.GetDB().Exec(`
		UPDATE sessions SET attempts_left = ?, score = ?, correct_count = ?, question_attempts = ?, status = ?, progressive_state = ?, updated_at = datetime('now')
		WHERE id = ?`,
		attemptsLeft, score, correctCount, outcome.State.QuestionAttempts, status, string(stateJSON), row.ID)
	if err != nil {
		return nil, err
	}

	var guessPayload map[string]interface{}
	raw, _ := json.Marshal(outcome.GuessEntry)
	_ = json.Unmarshal(raw, &guessPayload)
	guessPayload["progressive"] = true
	payloadJSON, _ := json.Marshal(guessPayload)

	_, err = db.GetDB().Exec(`
		INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
		VALUES (?, ?, ?, ?, ?, ?)`,
		row.ID, outcome.GuessEntry.GuessName, character.ID(), boolToInt(isCorrect), string(payloadJSON), row.QuestionIndex)
	if err != nil {
		return nil, err
	}

	if status == types.StatusGameOver {
		handleGameEndLeaderboard(row, score, correctCount)
	}

	sess, err := BuildGameSession(row.ID)
	if err != nil {
		return nil, err
	}
	sess.LastGuessCorrect = &isCorrect
	sess.LastQuestionScore = lastQuestionScore

	resp := &types.GuessResponse{Session: *sess}
	if status == types.StatusGameOver {
		resp.CorrectAnswer = &types.RevealedAnswer{
			Name:     GetDisplayName(answer, row.Theme),
			ImageURL: GetCharacterImage(answer),
		}
	}
	return resp, nil
}

func submitReverseBombGuess(row *SessionRow, character, answer types.CharacterEntry) (*types.GuessResponse, error) {
	reverseState, err := getReverseStateWithPool(row)
	if err != nil {
		return nil, err
	}
	if reverseState.FinalGuessUsed || row.Status == types.StatusQuestionDone {
		return nil, errors.New("本题已结束")
	}
	if reverseState.Phase != "guessing" && row.AttemptsLeft > 0 {
		return nil, errors.New("请先完成筛选或用完筛选次数")
	}

	qIdx := row.QuestionIndex
	queries, err := LoadReverseQueries(row.ID, &qIdx)
	if err != nil {
		return nil, err
	}
	poolIDs := reverseState.QuestionPoolIds
	totalPoolIDs, err := ResolveQuestionPoolIds(row.Theme, poolIDs, row.AnswerID)
	if err != nil {
		return nil, err
	}
	totalPool := len(totalPoolIDs)
	alivePool, err := GetAlivePool(row.Theme, queries, poolIDs, row.AnswerID)
	if err != nil {
		return nil, err
	}
	aliveCount := len(alivePool)
	isCorrect := character.ID() == answer.ID()
	roundScore := ScoreReverseBombGuess(isCorrect, aliveCount, totalPool)

	guessedName := GetDisplayName(character, row.Theme)
	guessedID := character.ID()
	sess, err := finishReverseRound(row, answer, finishReverseOpts{
		success:     isCorrect,
		score:       roundScore,
		guessedName: &guessedName,
		guessedID:   &guessedID,
		aliveCount:  aliveCount,
		totalPool:   totalPool,
	})
	if err != nil {
		return nil, err
	}
	sess.LastGuessCorrect = &isCorrect
	sess.LastQuestionScore = &roundScore

	resp := &types.GuessResponse{Session: *sess}
	if !isCorrect {
		resp.CorrectAnswer = &types.RevealedAnswer{
			Name:     GetDisplayName(answer, row.Theme),
			ImageURL: GetCharacterImage(answer),
		}
	}
	return resp, nil
}

type finishReverseOpts struct {
	success     bool
	autoDeduced bool
	score       int
	guessedName *string
	guessedID   *string
	aliveCount  int
	totalPool   int
}

func finishReverseRound(row *SessionRow, answer types.CharacterEntry, opts finishReverseOpts) (*types.GameSession, error) {
	reverseState := ParseReverseState(row.ProgressiveState)
	newState := FinishReverseRoundState(
		reverseState, row.Theme, row.QuestionIndex, answer,
		opts.success, opts.autoDeduced, opts.score, opts.guessedName, opts.aliveCount, opts.totalPool,
	)

	newScore := row.Score + opts.score
	newCorrect := row.CorrectCount
	if opts.success {
		newCorrect++
	}
	isLastRound := row.QuestionIndex+1 >= ReverseRoundsPerGame
	status := types.StatusQuestionDone
	if isLastRound {
		status = types.StatusGameOver
	}

	stateJSON, _ := json.Marshal(newState)
	_, err := db.GetDB().Exec(`
		UPDATE sessions SET score = ?, correct_count = ?, status = ?, progressive_state = ?, updated_at = datetime('now')
		WHERE id = ?`, newScore, newCorrect, status, string(stateJSON), row.ID)
	if err != nil {
		return nil, err
	}

	if isLastRound {
		endRow := *row
		endRow.Status = status
		handleGameEndLeaderboard(&endRow, newScore, newCorrect)
	}

	if opts.guessedID != nil {
		payload, _ := json.Marshal(map[string]interface{}{"reverseFinal": true, "score": opts.score})
		name := opts.guessedName
		if name == nil {
			n := GetDisplayName(answer, row.Theme)
			name = &n
		}
		_, err = db.GetDB().Exec(`
			INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
			VALUES (?, ?, ?, ?, ?, ?)`,
			row.ID, *name, *opts.guessedID, boolToInt(opts.success), string(payload), row.QuestionIndex)
		if err != nil {
			return nil, err
		}
	}

	return BuildGameSession(row.ID)
}

// NextQuestion 在答对后进入下一题。
func NextQuestion(sessionID string) (*types.GameSession, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("Session not found")
	}
	if row.GameMode == types.ModeDailyOne {
		return nil, errors.New("每日一题没有下一题")
	}
	if row.Status != types.StatusQuestionDone {
		return nil, errors.New("Must answer correctly before next question")
	}
	if row.GameMode != types.ModeReverseBomb && row.AttemptsLeft <= 0 {
		return nil, errors.New("No attempts left")
	}

	used := parseUsedAnswerIds(row.UsedAnswerIDs)
	rng := NewSeededRng(QuestionSetupSeed(sessionID, row.Theme, row.QuestionIndex+1))
	answer, err := PickRandomCharacter(row.Theme, used, rng)
	if err != nil {
		return nil, err
	}
	setup, err := ResolveQuestionSetupWithRng(row.Theme, answer, rng)
	if err != nil {
		return nil, err
	}

	var progressiveState *types.ProgressiveState
	var reverseStateJSON string
	attemptsLeft := row.AttemptsLeft

	if row.GameMode == types.ModeProgressive {
		prev := ParseProgressiveState(row.ProgressiveState)
		carryLives := prev.Lives
		if carryLives <= 0 {
			return nil, errors.New("No attempts left")
		}
		ps := CreateInitialProgressiveState(row.Theme, setup, answer, rng, &carryLives)
		progressiveState = &ps
	}

	if row.GameMode == types.ModeReverseBomb {
		if row.QuestionIndex >= ReverseRoundsPerGame-1 {
			return nil, errors.New("已完成全部轮次")
		}
		setup.HintField = "_reverse"
		setup.ExtraHintFields = []string{}
		setup.ActiveFields = GetReverseQueryableFields(row.Theme)
		setup.CompareMove = nil
		prevReverse := ParseReverseState(row.ProgressiveState)
		freshReverse, err := CreateInitialReverseState(row.Theme, setup.AnswerID)
		if err != nil {
			return nil, err
		}
		freshReverse.RoundHistory = prevReverse.RoundHistory
		b, _ := json.Marshal(freshReverse)
		reverseStateJSON = string(b)
		attemptsLeft = ReverseQueryAttempts
	}

	progressiveLives := attemptsLeft
	if row.GameMode == types.ModeProgressive && progressiveState != nil {
		progressiveLives = progressiveState.Lives
	}

	stateJSON := reverseStateJSON
	if stateJSON == "" {
		if progressiveState != nil {
			b, _ := json.Marshal(progressiveState)
			stateJSON = string(b)
		} else {
			stateJSON = "{}"
		}
	}

	used = append(used, setup.AnswerID)
	usedJSON, _ := json.Marshal(used)
	extraJSON, _ := json.Marshal(setup.ExtraHintFields)
	activeJSON, _ := json.Marshal(setup.ActiveFields)

	_, err = db.GetDB().Exec(`
		UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?,
			question_compare_move = ?, used_answer_ids = ?, question_attempts = 0,
			question_index = question_index + 1, status = ?, progressive_state = ?, attempts_left = ?,
			updated_at = datetime('now') WHERE id = ?`,
		setup.AnswerID, setup.HintField, string(extraJSON), string(activeJSON),
		setup.CompareMove, string(usedJSON), types.StatusPlaying, stateJSON, progressiveLives, sessionID)
	if err != nil {
		return nil, err
	}

	return BuildGameSession(sessionID)
}

// QuitGame 结束会话，并在适当时写入排行榜记录。
func QuitGame(sessionID string) (*types.GameSession, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("Session not found")
	}

	if row.Status != types.StatusGameOver && row.Status != types.StatusQuit && row.Status != types.StatusFailed {
		if row.GameMode != types.ModeBattle && row.GameMode != types.ModeRelayChain && row.GameMode != types.ModeDailyOne {
			handleGameEndLeaderboard(row, row.Score, row.CorrectCount)
		}
		if row.GameMode == types.ModeDailyOne {
			elapsed := computeElapsedUs(row)
			attemptsUsed := row.QuestionAttempts
			_ = FinishDailyPlayerAttempt(sessionID, types.StatusQuit, &attemptsUsed, &elapsed)
		}
		_, err = db.GetDB().Exec(
			`UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`,
			types.StatusQuit, sessionID)
		if err != nil {
			return nil, err
		}
	}

	return BuildGameSession(sessionID)
}

func handleGameEndLeaderboard(row *SessionRow, score, correctCount int) {
	if row.GameMode == types.ModeDailyOne || row.GameMode == types.ModeBattle || row.GameMode == types.ModeRelayChain {
		return
	}
	if row.Status == types.StatusFailed {
		return
	}
	saveToLeaderboard(row.PlayerName, row.Theme, row.GameMode, score, correctCount)
}

func saveToLeaderboard(playerName string, theme types.Theme, gameMode types.GameMode, totalScore, correctCount int) {
	if totalScore <= 0 {
		return
	}
	if gameMode == "" {
		gameMode = types.ModeClassicSix
	}
	_, _ = db.GetDB().Exec(`
		INSERT INTO leaderboard (player_name, theme, game_mode, total_score, correct_count)
		VALUES (?, ?, ?, ?, ?)`, playerName, theme, gameMode, totalScore, correctCount)
}

func saveDailyLeaderboard(playerName string, theme types.Theme, attemptsUsed int, elapsedUs int64) {
	challengeDate := GetDailyChallengeDate()
	database := db.GetDB()

	var existingAttempts, existingElapsed int64
	err := database.QueryRow(`
		SELECT attempts_used, elapsed_us FROM daily_leaderboard
		WHERE challenge_date = ? AND theme = ? AND player_name = ?`,
		challengeDate, theme, playerName).Scan(&existingAttempts, &existingElapsed)

	if err != nil {
		_, _ = database.Exec(`
			INSERT INTO daily_leaderboard (challenge_date, theme, player_name, attempts_used, elapsed_us)
			VALUES (?, ?, ?, ?, ?)`, challengeDate, theme, playerName, attemptsUsed, elapsedUs)
		return
	}

	better := attemptsUsed < int(existingAttempts) ||
		(attemptsUsed == int(existingAttempts) && elapsedUs < existingElapsed)
	if better {
		_, _ = database.Exec(`
			UPDATE daily_leaderboard SET attempts_used = ?, elapsed_us = ?, completed_at = datetime('now')
			WHERE challenge_date = ? AND theme = ? AND player_name = ?`,
			attemptsUsed, elapsedUs, challengeDate, theme, playerName)
	}
}

// GetReverseFieldsForSession 返回可选择的逆向筛选字段。
func GetReverseFieldsForSession(sessionID string) ([]types.ReverseFieldMeta, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("Session not found")
	}
	if err := assertReverseSession(row); err != nil {
		return nil, err
	}
	state, err := getReverseStateWithPool(row)
	if err != nil {
		return nil, err
	}
	if len(state.FieldChoices) >= 1 {
		return state.FieldChoices, nil
	}
	qIdx := row.QuestionIndex
	queries, err := LoadReverseQueries(sessionID, &qIdx)
	if err != nil {
		return nil, err
	}
	alivePool, err := GetAlivePool(row.Theme, queries, state.QuestionPoolIds, row.AnswerID)
	if err != nil {
		return nil, err
	}
	return PickReverseFieldChoices(alivePool, row.Theme, state.RecentChoiceFields), nil
}

// GetReverseValuesForSession 返回逆向筛选字段的可选值。
func GetReverseValuesForSession(sessionID, field string) (types.ReverseValuesResponse, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return types.ReverseValuesResponse{}, err
	}
	if row == nil {
		return types.ReverseValuesResponse{}, errors.New("Session not found")
	}
	if err := assertReverseSession(row); err != nil {
		return types.ReverseValuesResponse{}, err
	}
	allowed := GetReverseQueryableFields(row.Theme)
	found := false
	for _, f := range allowed {
		if f == field {
			found = true
			break
		}
	}
	if !found {
		return types.ReverseValuesResponse{}, errors.New("无效字段")
	}
	state, err := getReverseStateWithPool(row)
	if err != nil {
		return types.ReverseValuesResponse{}, err
	}
	qIdx := row.QuestionIndex
	queries, err := LoadReverseQueries(sessionID, &qIdx)
	if err != nil {
		return types.ReverseValuesResponse{}, err
	}
	alivePool, err := GetAlivePool(row.Theme, queries, state.QuestionPoolIds, row.AnswerID)
	if err != nil {
		return types.ReverseValuesResponse{}, err
	}
	return GetReverseValues(alivePool, row.Theme, field), nil
}

// SubmitReverseQuerySession 应用一次逆向筛选查询。
func SubmitReverseQuerySession(sessionID string, condition types.ReverseCondition) (*types.ReverseQueryResponse, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("Session not found")
	}
	if err := assertReverseSession(row); err != nil {
		return nil, err
	}
	if row.AttemptsLeft <= 0 {
		return nil, errors.New("筛选次数已用完，请给出终极猜测")
	}

	reverseState, err := getReverseStateWithPool(row)
	if err != nil {
		return nil, err
	}
	if reverseState.Phase == "guessing" {
		return nil, errors.New("筛选次数已用完，请给出终极猜测")
	}

	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil, errors.New("answer not found")
	}

	qIdx := row.QuestionIndex
	queriesBefore, err := LoadReverseQueries(sessionID, &qIdx)
	if err != nil {
		return nil, err
	}

	outcome, err := SubmitReverseQuery(
		reverseState, row.Theme, answer, condition, queriesBefore, row.AttemptsLeft, row.QuestionCompareMove,
	)
	if err != nil {
		return nil, err
	}

	displayValue := outcome.DisplayValue
	tagText := FormatReverseTag(condition, row.Theme, displayValue)
	queryPayload, _ := json.Marshal(map[string]interface{}{
		"reverse": true, "condition": condition, "matched": outcome.Matched,
		"label": outcome.Label, "displayValue": displayValue,
	})
	_, err = db.GetDB().Exec(`
		INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
		VALUES (?, ?, NULL, 0, ?, ?)`,
		sessionID, tagText, string(queryPayload), row.QuestionIndex)
	if err != nil {
		return nil, err
	}

	if outcome.AutoResolved {
		newAttempts := row.AttemptsLeft - 1
		_, err = db.GetDB().Exec(
			`UPDATE sessions SET attempts_left = ?, updated_at = datetime('now') WHERE id = ?`,
			newAttempts, sessionID)
		if err != nil {
			return nil, err
		}
		totalPoolIDs, err := ResolveQuestionPoolIds(row.Theme, outcome.State.QuestionPoolIds, row.AnswerID)
		if err != nil {
			return nil, err
		}
		sess, err := finishReverseRound(row, answer, finishReverseOpts{
			success: true, autoDeduced: true, score: outcome.RoundScore,
			aliveCount: 1, totalPool: len(totalPoolIDs),
		})
		if err != nil {
			return nil, err
		}
		return &types.ReverseQueryResponse{
			Matched: outcome.Matched, Condition: condition, Label: outcome.Label,
			DisplayValue: displayValue, NewlyEliminatedIds: outcome.NewlyEliminatedIds,
			AliveCount: 1, Session: *sess, AutoResolved: true, RoundScore: outcome.RoundScore,
			Answer: &types.RevealedAnswer{Name: outcome.AnswerName, ImageURL: outcome.AnswerImageURL},
		}, nil
	}

	newAttempts := row.AttemptsLeft - 1
	stateJSON, _ := json.Marshal(outcome.State)
	_, err = db.GetDB().Exec(`
		UPDATE sessions SET attempts_left = ?, progressive_state = ?, updated_at = datetime('now') WHERE id = ?`,
		newAttempts, string(stateJSON), sessionID)
	if err != nil {
		return nil, err
	}

	sess, err := BuildGameSession(sessionID)
	if err != nil {
		return nil, err
	}
	return &types.ReverseQueryResponse{
		Matched: outcome.Matched, Condition: condition, Label: outcome.Label,
		DisplayValue: displayValue, NewlyEliminatedIds: outcome.NewlyEliminatedIds,
		AliveCount: outcome.AliveCount, Session: *sess,
	}, nil
}

func assertReverseSession(row *SessionRow) error {
	if row.GameMode != types.ModeReverseBomb {
		return errors.New("非逆向轰炸模式")
	}
	if row.Status == types.StatusGameOver || row.Status == types.StatusQuit || row.Status == types.StatusFailed {
		return errors.New("游戏已结束")
	}
	if row.Status == types.StatusQuestionDone {
		return errors.New("已猜中答案")
	}
	return nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
