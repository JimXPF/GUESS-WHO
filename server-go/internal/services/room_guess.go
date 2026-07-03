package services

import (
	"encoding/json"
	"errors"
	"sort"
	"strconv"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"

	"github.com/google/uuid"
)

const roomGuessModeBattle = "battle"

// RelayRoomContext 是处理猜测所需的最小接龙房间状态。
type RelayRoomContext struct {
	RelayFieldClaims   RelayFieldClaims
	RelayRound         int
	PlayerOrder        []string
	RelayTurnSessionID *string
}

// RoomGuessContext 是对战房间处理共享题目的上下文。
type RoomGuessContext struct {
	QuestionQueue        []types.QuestionSetup
	CurrentQuestionIndex *int
	PlayerOrder          []string
	Mode                 string
}

// BattleRoomInfo 用于对战回合结算。
type BattleRoomInfo struct {
	CurrentQuestionIndex int
	PlayerOrder          []string
	Players              map[string]*BattleRoomPlayer
	Theme                types.Theme
}

// BattleRoomPlayer 保存结算所需的玩家名。
type BattleRoomPlayer struct {
	PlayerName string
}

// CreateBattleSession 创建与房间码绑定的多人会话。
func CreateBattleSession(playerName string, theme types.Theme, gameMode types.GameMode, roomCode string) (*types.GameSession, error) {
	sessionID := uuid.NewString()
	rng := NewSeededRng(QuestionSetupSeed(sessionID, theme, 0))
	answer, err := PickRandomCharacter(theme, nil, rng)
	if err != nil {
		return nil, err
	}
	setup, err := ResolveQuestionSetupWithRng(theme, answer, rng)
	if err != nil {
		return nil, err
	}
	code := roomCode
	if err := insertSession(sessionID, playerName, theme, gameMode, setup, MaxAttempts, insertSessionExtra{
		roomCode: &code,
	}); err != nil {
		return nil, err
	}
	return BuildGameSession(sessionID)
}

// ApplySessionFromSetup 将会话重置为新的题目配置。
func ApplySessionFromSetup(sessionID string, setup types.QuestionSetup, opts *ApplySessionOptions) error {
	row, err := getSessionRow(sessionID)
	if err != nil || row == nil {
		return nil
	}

	qIndex := row.QuestionIndex
	if opts != nil {
		if opts.QuestionIndex != nil {
			qIndex = *opts.QuestionIndex
		} else if opts.ResetQuestionIndex {
			qIndex = 0
		}
	}

	extraJSON, _ := json.Marshal(setup.ExtraHintFields)
	activeJSON, _ := json.Marshal(setup.ActiveFields)

	if opts != nil && opts.ResetAttempts {
		_, err = db.GetDB().Exec(`
			UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?,
				question_compare_move = ?, question_attempts = 0, question_index = ?, attempts_left = ?,
				status = ?, progressive_state = '{}', updated_at = datetime('now') WHERE id = ?`,
			setup.AnswerID, setup.HintField, string(extraJSON), string(activeJSON),
			setup.CompareMove, qIndex, MaxAttempts, types.StatusPlaying, sessionID,
		)
		return err
	}

	_, err = db.GetDB().Exec(`
		UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?,
			question_compare_move = ?, question_attempts = 0, question_index = ?, status = ?,
			progressive_state = '{}', updated_at = datetime('now') WHERE id = ?`,
		setup.AnswerID, setup.HintField, string(extraJSON), string(activeJSON),
		setup.CompareMove, qIndex, types.StatusPlaying, sessionID,
	)
	return err
}

// ApplySessionOptions 控制 applySessionFromSetup 的行为。
type ApplySessionOptions struct {
	ResetQuestionIndex bool
	QuestionIndex      *int
	ResetAttempts      bool
}

// GetBestHitCountForQuestion 返回某题的最佳命中数。
func GetBestHitCountForQuestion(sessionID string, questionIndex int) (int, error) {
	qIdx := questionIndex
	guesses, err := loadGuesses(sessionID, &qIdx)
	if err != nil {
		return 0, err
	}
	maxHits := 0
	for _, g := range guesses {
		if g.FieldResults == nil {
			continue
		}
		hits := 0
		for _, fr := range *g.FieldResults {
			if fr.Result == "hit" {
				hits++
			}
		}
		if hits > maxHits {
			maxHits = hits
		}
	}
	return maxHits, nil
}

// ComputeBattlePartialScore 将命中数转换为对战部分得分。
func ComputeBattlePartialScore(hitCount int) int {
	if hitCount <= 0 {
		return 0
	}
	return hitCount * BattlePartialPointsPerHit
}

func applyBattlePartialScores(partialScores []types.BattlePartialScore) error {
	for _, p := range partialScores {
		if p.Score <= 0 {
			continue
		}
		if _, err := db.GetDB().Exec(
			`UPDATE sessions SET score = score + ?, updated_at = datetime('now') WHERE id = ?`,
			p.Score, p.SessionID,
		); err != nil {
			return err
		}
	}
	return nil
}

// SettleBattleRound 结算有获胜者的对战回合。
func SettleBattleRound(room *BattleRoomInfo, winnerSessionID string, winnerResult *types.RoomGuessResponse) (*types.BattleRoundResult, error) {
	winnerEntry, ok := room.Players[winnerSessionID]
	if !ok || winnerEntry == nil {
		return nil, errors.New("Winner not found")
	}
	row, err := getSessionRow(winnerSessionID)
	if err != nil || row == nil {
		return nil, errors.New("Winner session not found")
	}
	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil, errors.New("answer not found")
	}

	partialScores := []types.BattlePartialScore{}
	for _, sid := range room.PlayerOrder {
		if sid == winnerSessionID {
			continue
		}
		entry, ok := room.Players[sid]
		if !ok || entry == nil {
			continue
		}
		hitCount, err := GetBestHitCountForQuestion(sid, room.CurrentQuestionIndex)
		if err != nil {
			return nil, err
		}
		partialScores = append(partialScores, types.BattlePartialScore{
			SessionID:  sid,
			PlayerName: entry.PlayerName,
			HitCount:   hitCount,
			Score:      ComputeBattlePartialScore(hitCount),
		})
	}
	if err := applyBattlePartialScores(partialScores); err != nil {
		return nil, err
	}

	winnerScore := 0
	if winnerResult != nil && winnerResult.Session != nil && winnerResult.Session.LastQuestionScore != nil {
		winnerScore = *winnerResult.Session.LastQuestionScore
	}
	winnerAttempts := 0
	if winnerResult != nil && winnerResult.Session != nil {
		winnerAttempts = winnerResult.Session.QuestionAttempts
	}
	winnerID := winnerSessionID
	winnerName := winnerEntry.PlayerName
	return &types.BattleRoundResult{
		Kind:             "winner",
		QuestionIndex:    room.CurrentQuestionIndex,
		WinnerSessionID:  &winnerID,
		WinnerPlayerName: &winnerName,
		AnswerName:       GetDisplayName(answer, row.Theme),
		AnswerImageURL:   GetCharacterImage(answer),
		WinnerScore:      winnerScore,
		WinnerAttempts:   winnerAttempts,
		PartialScores:    partialScores,
	}, nil
}

// SettleBattleDrawRound 结算无获胜者的对战回合。
func SettleBattleDrawRound(room *BattleRoomInfo) (*types.BattleRoundResult, error) {
	if len(room.PlayerOrder) == 0 {
		return nil, errors.New("Room session not found")
	}
	anchorID := room.PlayerOrder[0]
	row, err := getSessionRow(anchorID)
	if err != nil || row == nil {
		return nil, errors.New("Room session not found")
	}
	answer, ok := GetCharacter(room.Theme, row.AnswerID)
	if !ok {
		return nil, errors.New("answer not found")
	}

	partialScores := []types.BattlePartialScore{}
	for _, sid := range room.PlayerOrder {
		entry, ok := room.Players[sid]
		if !ok || entry == nil {
			continue
		}
		hitCount, err := GetBestHitCountForQuestion(sid, room.CurrentQuestionIndex)
		if err != nil {
			return nil, err
		}
		partialScores = append(partialScores, types.BattlePartialScore{
			SessionID:  sid,
			PlayerName: entry.PlayerName,
			HitCount:   hitCount,
			Score:      ComputeBattlePartialScore(hitCount),
		})
	}
	if err := applyBattlePartialScores(partialScores); err != nil {
		return nil, err
	}

	return &types.BattleRoundResult{
		Kind:             "draw",
		QuestionIndex:    room.CurrentQuestionIndex,
		WinnerSessionID:  nil,
		WinnerPlayerName: nil,
		AnswerName:       GetDisplayName(answer, room.Theme),
		AnswerImageURL:   GetCharacterImage(answer),
		WinnerScore:      0,
		WinnerAttempts:   0,
		PartialScores:    partialScores,
	}, nil
}

// BuildRelayRoundResult 为回合获胜者构建接龙间歇期结果。
func BuildRelayRoundResult(
	questionIndex, relayRound int,
	players map[string]*BattleRoomPlayer,
	winnerSessionID string,
	scoreBreakdown []types.FieldClaim,
) (*types.BattleRoundResult, error) {
	winnerEntry, ok := players[winnerSessionID]
	if !ok || winnerEntry == nil {
		return nil, errors.New("Winner not found")
	}
	row, err := getSessionRow(winnerSessionID)
	if err != nil || row == nil {
		return nil, errors.New("Winner not found")
	}
	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil, errors.New("answer not found")
	}

	winnerScore := 0
	for _, item := range scoreBreakdown {
		winnerScore += item.Points
	}
	winnerID := winnerSessionID
	winnerName := winnerEntry.PlayerName
	roundLabel := "第 " + strconv.Itoa(relayRound) + " 轮"
	return &types.BattleRoundResult{
		Kind:             "winner",
		QuestionIndex:    questionIndex,
		WinnerSessionID:  &winnerID,
		WinnerPlayerName: &winnerName,
		AnswerName:       GetDisplayName(answer, row.Theme),
		AnswerImageURL:   GetCharacterImage(answer),
		WinnerScore:      winnerScore,
		WinnerAttempts:   row.QuestionAttempts,
		PartialScores:    []types.BattlePartialScore{},
		RoundLabel:       roundLabel,
	}, nil
}

// IsBattleQuestionExhausted 判断是否所有玩家都已用尽尝试次数。
func IsBattleQuestionExhausted(playerOrder []string) bool {
	for _, sid := range playerOrder {
		row, err := getSessionRow(sid)
		if err != nil || row == nil || row.AttemptsLeft <= 0 {
			continue
		}
		return false
	}
	return true
}

// IsBattleQuestionWon 判断是否有玩家已完成当前题目。
func IsBattleQuestionWon(playerOrder []string) bool {
	for _, sid := range playerOrder {
		row, err := getSessionRow(sid)
		if err == nil && row != nil && row.Status == types.StatusQuestionDone {
			return true
		}
	}
	return false
}

// ProcessRoomGuess 处理对战模式的房间猜测。
func ProcessRoomGuess(sessionID, guessText string, characterID *string, room *RoomGuessContext) (*types.RoomGuessResponse, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("Session not found")
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
		return &types.RoomGuessResponse{
			Session:   sess,
			NotInBank: true,
			Message:   "题库中没有该角色",
		}, nil
	}

	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil, errors.New("answer not found")
	}

	activeFields := ParseActiveFields(row.ActiveFields, row.Theme)
	isCorrect := character.ID() == answer.ID()
	fieldResults := CompareAllFields(row.Theme, character, answer, activeFields, row.QuestionCompareMove)

	attemptsLeft := row.AttemptsLeft - 1
	questionAttempts := row.QuestionAttempts + 1
	score := row.Score
	correctCount := row.CorrectCount
	status := row.Status
	var lastQuestionScore *int

	if isCorrect {
		qs := ScoreForQuestion(questionAttempts)
		lastQuestionScore = &qs
		score += qs
		correctCount++
		if room == nil || room.Mode != roomGuessModeBattle {
			attemptsLeft = minInt(MaxAttempts, attemptsLeft+2)
		}
		status = types.StatusQuestionDone
	} else if attemptsLeft <= 0 && (room == nil || room.Mode != roomGuessModeBattle) {
		status = types.StatusGameOver
	}

	if _, err := db.GetDB().Exec(`
		UPDATE sessions SET attempts_left = ?, score = ?, correct_count = ?, question_attempts = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
		attemptsLeft, score, correctCount, questionAttempts, status, sessionID,
	); err != nil {
		return nil, err
	}

	fieldJSON, _ := json.Marshal(fieldResults)
	if _, err := db.GetDB().Exec(`
		INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
		VALUES (?, ?, ?, ?, ?, ?)`,
		sessionID, GetDisplayName(character, row.Theme), character.ID(), boolToInt(isCorrect),
		string(fieldJSON), row.QuestionIndex,
	); err != nil {
		return nil, err
	}

	if isCorrect && status == types.StatusQuestionDone && (room == nil || room.Mode != roomGuessModeBattle) {
		if room != nil && room.CurrentQuestionIndex != nil {
			nextIndex := row.QuestionIndex + 1
			if nextIndex < len(room.QuestionQueue) && row.AttemptsLeft > 0 {
				nextSetup := room.QuestionQueue[nextIndex]
				extraJSON, _ := json.Marshal(nextSetup.ExtraHintFields)
				activeJSON, _ := json.Marshal(nextSetup.ActiveFields)
				if _, err := db.GetDB().Exec(`
					UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?,
						question_compare_move = ?, question_attempts = 0, question_index = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
					nextSetup.AnswerID, nextSetup.HintField, string(extraJSON), string(activeJSON),
					nextSetup.CompareMove, nextIndex, types.StatusPlaying, sessionID,
				); err != nil {
					return nil, err
				}
				if nextIndex > *room.CurrentQuestionIndex {
					*room.CurrentQuestionIndex = nextIndex
				}
			}
		} else {
			if err := advanceBattleQuestion(sessionID, row); err != nil {
				return nil, err
			}
		}
	}

	sess, err := BuildGameSession(sessionID)
	if err != nil {
		return nil, err
	}
	sess.LastGuessCorrect = &isCorrect
	sess.LastQuestionScore = lastQuestionScore
	return &types.RoomGuessResponse{Session: sess}, nil
}

func advanceBattleQuestion(sessionID string, row *SessionRow) error {
	if row.AttemptsLeft <= 0 {
		return nil
	}
	used := parseUsedAnswerIds(row.UsedAnswerIDs)
	rng := NewSeededRng(QuestionSetupSeed(sessionID, row.Theme, row.QuestionIndex+1))
	answer, err := PickRandomCharacter(row.Theme, used, rng)
	if err != nil {
		return err
	}
	setup, err := ResolveQuestionSetupWithRng(row.Theme, answer, rng)
	if err != nil {
		return err
	}
	used = append(used, setup.AnswerID)
	usedJSON, _ := json.Marshal(used)
	extraJSON, _ := json.Marshal(setup.ExtraHintFields)
	activeJSON, _ := json.Marshal(setup.ActiveFields)
	_, err = db.GetDB().Exec(`
		UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?,
			question_compare_move = ?, used_answer_ids = ?, question_attempts = 0,
			question_index = question_index + 1, status = ?, updated_at = datetime('now') WHERE id = ?`,
		setup.AnswerID, setup.HintField, string(extraJSON), string(activeJSON),
		setup.CompareMove, string(usedJSON), types.StatusPlaying, sessionID,
	)
	return err
}

// ProcessRelayGuess 处理接龙模式的房间猜测。
func ProcessRelayGuess(sessionID, guessText string, characterID *string, room *RelayRoomContext) (*types.RoomGuessResponse, error) {
	row, err := getSessionRow(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("Session not found")
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
		return &types.RoomGuessResponse{
			Session:   sess,
			NotInBank: true,
			Message:   "题库中没有该角色",
		}, nil
	}

	answer, ok := GetCharacter(row.Theme, row.AnswerID)
	if !ok {
		return nil, errors.New("answer not found")
	}

	activeFields := ParseActiveFields(row.ActiveFields, row.Theme)
	isCorrect := character.ID() == answer.ID()
	fieldResults := CompareAllFields(row.Theme, character, answer, activeFields, row.QuestionCompareMove)

	relayResult := ScoreRelayGuess(
		row.Theme, fieldResults, isCorrect, room.RelayFieldClaims,
		sessionID, row.PlayerName, room.RelayRound,
	)
	room.RelayFieldClaims = relayResult.NewClaims
	fieldResults = ApplyClaimsToFieldResults(fieldResults, room.RelayFieldClaims)

	attemptsLeft := row.AttemptsLeft - 1
	score := row.Score + relayResult.ScoreDelta
	status := row.Status
	questionAttempts := row.QuestionAttempts + 1
	correctDelta := 0

	if relayResult.FullCorrect {
		status = types.StatusQuestionDone
		attemptsLeft = minInt(MaxAttempts, attemptsLeft+2)
		correctDelta = 1
	} else if attemptsLeft <= 0 {
		status = types.StatusGameOver
	}

	if _, err := db.GetDB().Exec(`
		UPDATE sessions SET attempts_left = ?, score = ?, question_attempts = ?, status = ?,
			correct_count = correct_count + ?, updated_at = datetime('now') WHERE id = ?`,
		attemptsLeft, score, questionAttempts, status, correctDelta, sessionID,
	); err != nil {
		return nil, err
	}

	fieldJSON, _ := json.Marshal(fieldResults)
	if _, err := db.GetDB().Exec(`
		INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index, score_delta)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		sessionID, GetDisplayName(character, row.Theme), character.ID(), boolToInt(isCorrect),
		string(fieldJSON), row.QuestionIndex, relayResult.ScoreDelta,
	); err != nil {
		return nil, err
	}

	if relayResult.FullCorrect {
		if _, err := db.GetDB().Exec(`
			UPDATE sessions SET question_attempts = 0, status = ?, updated_at = datetime('now') WHERE id = ?`,
			types.StatusPlaying, sessionID,
		); err != nil {
			return nil, err
		}
	}

	sess, err := BuildGameSession(sessionID)
	if err != nil {
		return nil, err
	}
	sess.LastGuessCorrect = &isCorrect
	fc := relayResult.FullCorrect
	return &types.RoomGuessResponse{
		Session:        sess,
		ScoreBreakdown: relayResult.Breakdown,
		FullCorrect:    &fc,
	}, nil
}

// ProcessRelayTurnTimeout 对接龙回合超时施加惩罚。
func ProcessRelayTurnTimeout(sessionID string, room *RelayRoomContext) ([]types.FieldClaim, error) {
	row, err := getSessionRow(sessionID)
	if err != nil || row == nil {
		return nil, nil
	}

	penalty := RelayTimeoutPenalty
	attemptsLeft := row.AttemptsLeft - 1
	score := row.Score - penalty
	status := row.Status
	if attemptsLeft <= 0 {
		status = types.StatusGameOver
	}

	breakdown := []types.FieldClaim{{
		SessionID:  sessionID,
		PlayerName: row.PlayerName,
		Round:      room.RelayRound,
		Points:     -penalty,
		Field:      "__timeout__",
		FieldLabel: "超时未答",
	}}

	if _, err := db.GetDB().Exec(`
		UPDATE sessions SET attempts_left = ?, score = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
		attemptsLeft, score, status, sessionID,
	); err != nil {
		return nil, err
	}
	return breakdown, nil
}

// GetRelayGuessesForRoom 返回当前题目的接龙猜测记录。
func GetRelayGuessesForRoom(playerOrder []string, playerNames map[string]string, theme types.Theme, questionIndex int) ([]types.RelayGuessRecord, error) {
	result := []types.RelayGuessRecord{}
	qIdx := questionIndex
	for _, sid := range playerOrder {
		playerName, ok := playerNames[sid]
		if !ok {
			continue
		}
		guesses, err := loadGuesses(sid, &qIdx)
		if err != nil {
			return nil, err
		}
		for _, g := range guesses {
			if g.FieldResults == nil {
				continue
			}
			rec := types.RelayGuessRecord{
				GuessRecord: g,
				SessionID:   sid,
				PlayerName:  playerName,
			}
			if g.GuessID != nil && *g.GuessID != "" {
				if char, ok := GetCharacter(theme, *g.GuessID); ok {
					rec.ImageURL = GetCharacterImage(char)
				}
			}
			result = append(result, rec)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result, nil
}

// GetRelayCorrectHistory 返回所有接龙玩家的历史正确答案。
func GetRelayCorrectHistory(playerOrder []string, playerNames map[string]string, theme types.Theme) ([]types.RelayCorrectRecord, error) {
	result := []types.RelayCorrectRecord{}
	for _, sid := range playerOrder {
		playerName, ok := playerNames[sid]
		if !ok {
			continue
		}
		answers, err := loadCorrectAnswers(sid, theme)
		if err != nil {
			return nil, err
		}
		for _, answer := range answers {
			result = append(result, types.RelayCorrectRecord{
				GuessName:     answer.GuessName,
				GuessID:       answer.GuessID,
				ImageURL:      answer.ImageURL,
				QuestionIndex: answer.QuestionIndex,
				SessionID:     sid,
				PlayerName:    playerName,
			})
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].QuestionIndex != result[j].QuestionIndex {
			return result[i].QuestionIndex < result[j].QuestionIndex
		}
		return result[i].SessionID < result[j].SessionID
	})
	return result, nil
}

// CountRelayQuestionAttempts 统计当前接龙题目的共享尝试次数。
func CountRelayQuestionAttempts(playerOrder []string, questionIndex int) (int, error) {
	total := 0
	qIdx := questionIndex
	for _, sid := range playerOrder {
		guesses, err := loadGuesses(sid, &qIdx)
		if err != nil {
			return 0, err
		}
		for _, g := range guesses {
			if g.FieldResults != nil {
				total++
			}
		}
	}
	return total, nil
}

func collectRelayHitFields(playerOrder []string, questionIndex int) (map[string]bool, error) {
	allGuesses := []types.GuessRecord{}
	qIdx := questionIndex
	for _, sid := range playerOrder {
		guesses, err := loadGuesses(sid, &qIdx)
		if err != nil {
			return nil, err
		}
		allGuesses = append(allGuesses, guesses...)
	}
	return CollectHitFields(allGuesses), nil
}

// BuildRelayHintsForRoom 为接龙模式构建共享提示。
func BuildRelayHintsForRoom(playerOrder []string, theme types.Theme, questionIndex int) ([]types.HintInfo, error) {
	if len(playerOrder) == 0 {
		return []types.HintInfo{}, nil
	}
	anchorID := playerOrder[0]
	row, err := getSessionRow(anchorID)
	if err != nil || row == nil {
		return []types.HintInfo{}, nil
	}
	answer, ok := GetCharacter(theme, row.AnswerID)
	if !ok {
		return []types.HintInfo{}, nil
	}

	activeFields := ParseActiveFields(row.ActiveFields, theme)
	extraHintFields := parseExtraHintFields(row.ExtraHintFields)
	sharedAttempts, err := CountRelayQuestionAttempts(playerOrder, questionIndex)
	if err != nil {
		return nil, err
	}
	hitFields, err := collectRelayHitFields(playerOrder, questionIndex)
	if err != nil {
		return nil, err
	}

	return BuildSessionHints(
		theme, answer, row.HintField, extraHintFields,
		sharedAttempts, activeFields, hitFields,
		row.QuestionCompareMove, nil,
	), nil
}

// GetSharedRoomAnswerId 从首位玩家返回共享答案 id。
func GetSharedRoomAnswerId(playerOrder []string) *string {
	if len(playerOrder) == 0 {
		return nil
	}
	row, err := getSessionRow(playerOrder[0])
	if err != nil || row == nil {
		return nil
	}
	id := row.AnswerID
	return &id
}

// BuildRoomRevealedAnswer 为房间提前结束构建揭晓答案信息。
func BuildRoomRevealedAnswer(theme types.Theme, answerID string) types.RevealedAnswer {
	answer, ok := GetCharacter(theme, answerID)
	if !ok {
		return types.RevealedAnswer{Name: "—", ImageURL: nil}
	}
	return types.RevealedAnswer{
		Name:     GetDisplayName(answer, theme),
		ImageURL: GetCharacterImage(answer),
	}
}
