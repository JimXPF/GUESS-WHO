package services

import (
	"encoding/json"
	"fmt"
	"strings"

	"guess-who/server-go/internal/types"
)

// ProgressiveGuessOutcome 是评估一次逐步猜测的结果。
type ProgressiveGuessOutcome struct {
	LivesLost        bool
	ShouldUnlockNext bool
	NewHint          *types.HintInfo
	GuessEntry       types.ProgressiveGuessEntry
	State            types.ProgressiveState
}

func normalizeHintCheck(raw map[string]interface{}) types.ProgressiveHintCheck {
	field, _ := raw["field"].(string)
	fieldLabel, _ := raw["fieldLabel"].(string)
	if fieldLabel == "" {
		fieldLabel = field
	}
	hit, _ := raw["hit"].(bool)
	targetValue := fmt.Sprintf("%v", raw["targetValue"])
	guessValue := fmt.Sprintf("%v", raw["guessValue"])
	label := fmt.Sprintf("%v", raw["label"])
	if targetValue == "<nil>" || targetValue == "" {
		if hit {
			targetValue = label
		} else {
			targetValue = "—"
		}
	}
	if guessValue == "<nil>" || guessValue == "" {
		if !hit {
			guessValue = label
		} else {
			guessValue = "—"
		}
	}
	if label == "<nil>" || label == "" {
		if hit {
			label = targetValue
		} else {
			label = guessValue
		}
	}
	return types.ProgressiveHintCheck{
		Field: field, Label: label, FieldLabel: fieldLabel,
		TargetValue: targetValue, GuessValue: guessValue, Hit: hit,
	}
}

// ParseProgressiveState 从 JSON 反序列化逐步提示状态。
func ParseProgressiveState(raw string) types.ProgressiveState {
	fallback := types.ProgressiveState{
		Lives: types.ProgressiveLives, HintFields: []string{}, Hints: []types.HintInfo{},
		PendingQueue: []string{}, SatisfiedFields: []string{}, Rounds: []types.ProgressiveRound{},
	}
	if raw == "" {
		return fallback
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return fallback
	}

	state := fallback
	if v, ok := parsed["lives"].(float64); ok {
		state.Lives = int(v)
	}
	state.HintFields = stringSlice(parsed["hintFields"])
	state.Hints = parseHintInfos(parsed["hints"])
	state.PendingQueue = stringSlice(parsed["pendingQueue"])
	state.SatisfiedFields = stringSlice(parsed["satisfiedFields"])
	if v, ok := parsed["questionAttempts"].(float64); ok {
		state.QuestionAttempts = int(v)
	}
	if fp, ok := parsed["footballPrimaryField"].(string); ok && fp != "" {
		state.FootballPrimaryField = &fp
	}
	if rounds, ok := parsed["rounds"].([]interface{}); ok {
		for i, r := range rounds {
			rm, _ := r.(map[string]interface{})
			round := types.ProgressiveRound{HintIndex: i, Guesses: []types.ProgressiveGuessEntry{}}
			if idx, ok := rm["hintIndex"].(float64); ok {
				round.HintIndex = int(idx)
			}
			if hintRaw, ok := rm["hint"].(map[string]interface{}); ok {
				round.Hint = parseHintInfo(hintRaw)
			}
			if guesses, ok := rm["guesses"].([]interface{}); ok {
				for _, g := range guesses {
					gm, _ := g.(map[string]interface{})
					entry := types.ProgressiveGuessEntry{
						GuessName:   fmt.Sprintf("%v", gm["guessName"]),
						AllHintsHit: gm["allHintsHit"] == true,
						LivesLost:   gm["livesLost"] == true,
						IsCorrect:   gm["isCorrect"] == true,
					}
					if id, ok := gm["guessId"].(string); ok {
						entry.GuessID = &id
					}
					if url, ok := gm["imageUrl"].(string); ok {
						entry.ImageURL = &url
					}
					if checks, ok := gm["hintChecks"].([]interface{}); ok {
						for _, c := range checks {
							cm, _ := c.(map[string]interface{})
							entry.HintChecks = append(entry.HintChecks, normalizeHintCheck(cm))
						}
					}
					round.Guesses = append(round.Guesses, entry)
				}
			}
			state.Rounds = append(state.Rounds, round)
		}
	}
	return state
}

func parseHintInfos(raw interface{}) []types.HintInfo {
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]types.HintInfo, 0, len(arr))
	for _, item := range arr {
		if m, ok := item.(map[string]interface{}); ok {
			out = append(out, parseHintInfo(m))
		}
	}
	return out
}

func parseHintInfo(m map[string]interface{}) types.HintInfo {
	field, _ := m["field"].(string)
	label, _ := m["label"].(string)
	return types.HintInfo{Field: field, Label: label, Value: m["value"]}
}

func stringSlice(raw interface{}) []string {
	arr, ok := raw.([]interface{})
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// CreateInitialProgressiveState 为题目构建全新的逐步提示状态。
func CreateInitialProgressiveState(
	theme types.Theme,
	setup types.QuestionSetup,
	answer types.CharacterEntry,
	rng *SeededRng,
	lives *int,
) types.ProgressiveState {
	firstField, pendingQueue, footballPrimary := BuildProgressiveHintQueueFromSetup(theme, setup, answer, rng)
	firstHint := BuildProgressiveHintInfo(theme, answer, firstField, setup.CompareMove, footballPrimary)

	l := types.ProgressiveLives
	if lives != nil {
		l = maxInt(0, *lives)
	}

	return types.ProgressiveState{
		Lives: l, HintFields: []string{firstField}, Hints: []types.HintInfo{firstHint},
		PendingQueue: pendingQueue, SatisfiedFields: []string{},
		QuestionAttempts: 0,
		Rounds:           []types.ProgressiveRound{{HintIndex: 0, Hint: firstHint, Guesses: []types.ProgressiveGuessEntry{}}},
		FootballPrimaryField: footballPrimary,
	}
}

// BuildProgressiveHintInfo 为逐步字段构建展示提示。
func BuildProgressiveHintInfo(
	theme types.Theme,
	answer types.CharacterEntry,
	field string,
	compareMove *string,
	footballPrimaryField *string,
) types.HintInfo {
	if theme == types.ThemeFootball && IsFootballHintField(field) {
		if footballPrimaryField != nil && field == *footballPrimaryField {
			return BuildFootballSyntheticHint(answer, field)
		}
		return BuildFootballPrimaryHint(answer, nil, field)
	}
	if theme == types.ThemeNBA && field == "divisionPosition" {
		return BuildNBAPrimaryHint(answer)
	}
	if theme == types.ThemePokemon {
		return BuildPokemonHint(answer, field, compareMove)
	}
	if theme == types.ThemeNBA && field == "team" {
		hint := buildThemeHint(theme, answer, field)
		hint.Value = GetNBATeamDisplay(fmt.Sprintf("%v", answer["team"]))
		return hint
	}
	return buildThemeHint(theme, answer, field)
}

func buildThemeHint(theme types.Theme, answer types.CharacterEntry, field string) types.HintInfo {
	return buildHintInfo(theme, field, answer)
}

func hintLabelForField(theme types.Theme, field string, answer types.CharacterEntry) string {
	switch field {
	case "divisionPosition":
		return "赛区·选秀轮次"
	case "clubLeague":
		return "联赛"
	case "confederation":
		return "足联"
	case "team":
		if theme == types.ThemeNBA {
			return "球队"
		}
	case "position":
		return "位置"
	}
	return BuildProgressiveHintInfo(theme, answer, field, nil, nil).Label
}

// ProgressiveFieldDisplayValue 返回角色某字段的展示字符串。
func ProgressiveFieldDisplayValue(
	theme types.Theme,
	field string,
	character types.CharacterEntry,
	compareMove *string,
	footballPrimaryField *string,
) string {
	if field == "divisionPosition" {
		return fmt.Sprintf("%v", BuildNBAPrimaryHint(character).Value)
	}
	if field == "clubLeague" || field == "confederation" {
		info := BuildProgressiveHintInfo(theme, character, field, compareMove, footballPrimaryField)
		return fmt.Sprintf("%v", info.Value)
	}
	if field == "team" && theme == types.ThemeNBA {
		return GetNBATeamDisplay(fmt.Sprintf("%v", character["team"]))
	}
	if field == "position" {
		return GetNBAPositionLabel(character)
	}
	info := BuildProgressiveHintInfo(theme, character, field, compareMove, footballPrimaryField)
	if info.Value != nil {
		return fmt.Sprintf("%v", info.Value)
	}
	if info.Label != "" {
		return info.Label
	}
	return "—"
}

// EvaluateHintHit 判断猜测是否满足一条逐步提示字段。
func EvaluateHintHit(
	theme types.Theme,
	hintField string,
	guess, answer types.CharacterEntry,
	compareMove *string,
	footballPrimaryField *string,
) bool {
	if theme == types.ThemePokemon {
		if hintField == "moveHint" {
			if compareMove != nil && *compareMove != "" {
				return GuessKnowsMove(guess, *compareMove)
			}
			return false
		}
		if hintField == "weaknessHint" {
			typesList, chart, err := getPokemonTypeChartData()
			if err != nil {
				return false
			}
			listed := GetPokemonMatchupHintTypes(answer, chart, typesList)
			gTypes := []string{}
			for _, k := range []string{"type1", "type2"} {
				if v := strings.TrimSpace(fmt.Sprintf("%v", guess[k])); v != "" && v != "<nil>" {
					gTypes = append(gTypes, v)
				}
			}
			for _, t := range gTypes {
				for _, l := range listed {
					if t == l {
						return true
					}
				}
			}
			return false
		}
	}

	if theme == types.ThemeFootball {
		if hintField == "clubLeague" {
			g := GetClubLeagueHintForEntry(guess)
			a := GetClubLeagueHintForEntry(answer)
			return g != "" && a != "" && g == a
		}
		if hintField == "confederation" {
			g := GetConfederationHintForEntry(guess)
			a := GetConfederationHintForEntry(answer)
			return g != "" && a != "" && g == a
		}
	}

	if theme == types.ThemeNBA && hintField == "divisionPosition" {
		divisions, _, _, _ := loadNBAConfig()
		gDiv := GetDivisionHint(fmt.Sprintf("%v", guess["team"]), divisions)
		aDiv := GetDivisionHint(fmt.Sprintf("%v", answer["team"]), divisions)
		divHit := gDiv != "" && aDiv != "" && gDiv == aDiv
		gRound := GetDraftRoundHint(fmt.Sprintf("%v", guess["draft"]))
		aRound := GetDraftRoundHint(fmt.Sprintf("%v", answer["draft"]))
		roundHit := gRound != "" && aRound != "" && gRound == aRound
		return divHit && roundHit
	}

	guessVal := GetCharacterField(guess, hintField, theme)
	answerVal := GetCharacterField(answer, hintField, theme)
	if hintField == "name" {
		guessVal = GetNameFieldValue(guess, theme)
		answerVal = GetNameFieldValue(answer, theme)
	}
	return CompareField(theme, hintField, guessVal, answerVal) == Hit
}

// UpdateProgressiveSatisfiedFields 在猜测后更新已满足的字段。
func UpdateProgressiveSatisfiedFields(
	state types.ProgressiveState,
	theme types.Theme,
	guess, answer types.CharacterEntry,
	compareMove *string,
) types.ProgressiveState {
	candidates := uniqueStrings(append(append([]string{}, state.HintFields...), state.PendingQueue...))
	satisfied := make(map[string]bool)
	for _, f := range state.SatisfiedFields {
		satisfied[f] = true
	}
	for _, field := range candidates {
		if EvaluateHintHit(theme, field, guess, answer, compareMove, state.FootballPrimaryField) {
			satisfied[field] = true
		}
	}
	state.SatisfiedFields = mapKeys(satisfied)
	return state
}

// EvaluateAllHintsForGuess 评估一次猜测的全部已解锁提示。
func EvaluateAllHintsForGuess(
	theme types.Theme,
	hintFields []string,
	guess, answer types.CharacterEntry,
	compareMove *string,
	footballPrimaryField *string,
) ([]types.ProgressiveHintCheck, bool) {
	checks := make([]types.ProgressiveHintCheck, 0, len(hintFields))
	allHit := true
	for _, field := range hintFields {
		hit := EvaluateHintHit(theme, field, guess, answer, compareMove, footballPrimaryField)
		fieldLabel := hintLabelForField(theme, field, answer)
		targetValue := ProgressiveFieldDisplayValue(theme, field, answer, compareMove, footballPrimaryField)
		guessValue := ProgressiveFieldDisplayValue(theme, field, guess, compareMove, footballPrimaryField)
		label := guessValue
		if hit {
			label = targetValue
		}
		checks = append(checks, types.ProgressiveHintCheck{
			Field: field, Label: label, FieldLabel: fieldLabel,
			TargetValue: targetValue, GuessValue: guessValue, Hit: hit,
		})
		if !hit {
			allHit = false
		}
	}
	return checks, allHit
}

// UnlockNextProgressiveHint 从待解锁队列解锁下一条提示。
func UnlockNextProgressiveHint(
	state types.ProgressiveState,
	theme types.Theme,
	answer types.CharacterEntry,
	compareMove *string,
) types.ProgressiveState {
	if len(state.PendingQueue) == 0 {
		return state
	}

	usedValues := make(map[string]bool)
	for _, h := range state.Hints {
		usedValues[fmt.Sprintf("%s:%v", h.Field, h.Value)] = true
	}

	var nextField string
	var rest []string
	hintFieldSet := make(map[string]bool)
	for _, f := range state.HintFields {
		hintFieldSet[f] = true
	}

	for _, field := range state.PendingQueue {
		if nextField != "" {
			rest = append(rest, field)
			continue
		}
		if theme == types.ThemePokemon && field == "weaknessHint" &&
			!ShouldShowWeaknessHint(CollectProgressivePokemonTypeHits(state.SatisfiedFields)) {
			continue
		}
		info := BuildProgressiveHintInfo(theme, answer, field, compareMove, state.FootballPrimaryField)
		key := fmt.Sprintf("%s:%v", info.Field, info.Value)
		if !usedValues[key] && !hintFieldSet[field] {
			nextField = field
		} else {
			rest = append(rest, field)
		}
	}

	if nextField == "" {
		state.PendingQueue = rest
		return state
	}

	nextHint := BuildProgressiveHintInfo(theme, answer, nextField, compareMove, state.FootballPrimaryField)
	state.HintFields = append(state.HintFields, nextField)
	state.Hints = append(state.Hints, nextHint)
	state.PendingQueue = rest
	state.Rounds = append(state.Rounds, types.ProgressiveRound{
		HintIndex: len(state.Rounds),
		Hint:      nextHint,
		Guesses:   []types.ProgressiveGuessEntry{},
	})
	return state
}

// BuildProgressiveHintsFromState 返回客户端可见的提示。
func BuildProgressiveHintsFromState(state types.ProgressiveState, theme types.Theme) []types.HintInfo {
	if theme == types.ThemePokemon &&
		!ShouldShowWeaknessHint(CollectProgressivePokemonTypeHits(state.SatisfiedFields)) {
		filtered := make([]types.HintInfo, 0, len(state.Hints))
		for _, h := range state.Hints {
			if h.Field != "weaknessHint" {
				filtered = append(filtered, h)
			}
		}
		return filtered
	}
	return state.Hints
}

// EvaluateProgressiveGuess 将 submitProgressiveGuess 核心规则应用到状态。
func EvaluateProgressiveGuess(
	state types.ProgressiveState,
	theme types.Theme,
	guess, answer types.CharacterEntry,
	compareMove *string,
) ProgressiveGuessOutcome {
	state.QuestionAttempts++

	isCorrect := guess.ID() == answer.ID()
	state = UpdateProgressiveSatisfiedFields(state, theme, guess, answer, compareMove)

	checks, allHintsHit := EvaluateAllHintsForGuess(
		theme, state.HintFields, guess, answer, compareMove, state.FootballPrimaryField,
	)

	livesLost := false
	if !isCorrect && !allHintsHit {
		state.Lives = maxInt(0, state.Lives-1)
		livesLost = true
	}

	guessID := guess.ID()
	entry := types.ProgressiveGuessEntry{
		GuessName: GetDisplayName(guess, theme), GuessID: &guessID,
		ImageURL: GetCharacterImage(guess), HintChecks: checks,
		AllHintsHit: allHintsHit, LivesLost: livesLost, IsCorrect: isCorrect,
	}

	if len(state.Rounds) > 0 {
		idx := len(state.Rounds) - 1
		state.Rounds[idx].Guesses = append(state.Rounds[idx].Guesses, entry)
	}

	shouldUnlock := false
	var newHint *types.HintInfo
	if !isCorrect && allHintsHit {
		state = UnlockNextProgressiveHint(state, theme, answer, compareMove)
		shouldUnlock = true
		if len(state.Hints) > 0 {
			last := state.Hints[len(state.Hints)-1]
			newHint = &last
		}
	}

	return ProgressiveGuessOutcome{
		LivesLost: livesLost, ShouldUnlockNext: shouldUnlock,
		NewHint: newHint, GuessEntry: entry, State: state,
	}
}

func mapKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
