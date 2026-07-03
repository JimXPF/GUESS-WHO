package services

import (
	"guess-who/server-go/internal/types"
)

func countUnlockedBonusHints(questionAttempts int) int {
	n := 0
	for _, t := range bonusHintThresholds {
		if questionAttempts >= t {
			n++
		}
	}
	return n
}

// CollectHitFields 汇总猜测记录中命中的字段名。
func CollectHitFields(guesses []types.GuessRecord) map[string]bool {
	hit := map[string]bool{}
	for _, g := range guesses {
		if g.FieldResults == nil {
			continue
		}
		for _, f := range *g.FieldResults {
			if f.Result == "hit" {
				hit[f.Field] = true
			}
		}
	}
	return hit
}

func buildPrimaryHintList(
	theme types.Theme,
	answer types.CharacterEntry,
	hintField string,
	activeFields []string,
	compareMove *string,
) []types.HintInfo {
	switch theme {
	case types.ThemeFootball:
		return []types.HintInfo{BuildFootballPrimaryHint(answer, nil, "")}
	case types.ThemeNBA:
		return []types.HintInfo{BuildNBAPrimaryHint(answer)}
	case types.ThemePokemon:
		return []types.HintInfo{BuildPokemonHint(answer, hintField, compareMove)}
	default:
		h, err := BuildHint(theme, answer, hintField, activeFields)
		if err != nil {
			return []types.HintInfo{{Field: hintField, Label: types.GetFieldLabel(theme, hintField)}}
		}
		return []types.HintInfo{h}
	}
}

func buildExtraHintForField(
	theme types.Theme,
	answer types.CharacterEntry,
	field string,
	activeFields []string,
	compareMove *string,
	hitFields map[string]bool,
) *types.HintInfo {
	if theme == types.ThemePokemon {
		if field == "moveHint" {
			if !hintFieldInList(activeFields, "learnableMove") {
				return nil
			}
			h := BuildPokemonMoveHint(answer)
			return &h
		}
		if field == "weaknessHint" {
			if !ShouldShowWeaknessHint(hitFields) {
				return nil
			}
			h := BuildPokemonWeaknessHint(answer)
			return &h
		}
		if !hintFieldInList(activeFields, field) {
			return nil
		}
		h, err := BuildHint(theme, answer, field, activeFields)
		if err != nil {
			return nil
		}
		return &h
	}
	h, err := BuildHint(theme, answer, field, activeFields)
	if err != nil {
		return nil
	}
	return &h
}

// FilterPokemonWeaknessHints 当属性字段命中时移除弱点提示。
func FilterPokemonWeaknessHints(hints []types.HintInfo, theme types.Theme, hitFields map[string]bool) []types.HintInfo {
	if theme == types.ThemePokemon && !ShouldShowWeaknessHint(hitFields) {
		var out []types.HintInfo
		for _, h := range hints {
			if h.Field != "weaknessHint" {
				out = append(out, h)
			}
		}
		return out
	}
	return hints
}

// BuildQueuedBonusSessionHints 在第 3/6/9 次尝试时解锁额外提示。
func BuildQueuedBonusSessionHints(
	theme types.Theme,
	answer types.CharacterEntry,
	hintField string,
	extraHintFields []string,
	questionAttempts int,
	activeFields []string,
	hitFields map[string]bool,
	compareMove *string,
) []types.HintInfo {
	hints := buildPrimaryHintList(theme, answer, hintField, activeFields, compareMove)
	shown := map[string]bool{}
	for _, h := range hints {
		shown[h.Field] = true
	}

	maxBonus := countUnlockedBonusHints(questionAttempts)
	if maxBonus == 0 {
		return FilterPokemonWeaknessHints(hints, theme, hitFields)
	}

	var queue []string
	for _, f := range extraHintFields {
		if !shown[f] {
			queue = append(queue, f)
		}
	}
	var notHit, alreadyHit []string
	for _, f := range queue {
		if hitFields[f] {
			alreadyHit = append(alreadyHit, f)
		} else {
			notHit = append(notHit, f)
		}
	}
	ordered := append(notHit, alreadyHit...)

	bonusAdded := 0
	for _, field := range ordered {
		if bonusAdded >= maxBonus {
			break
		}
		hint := buildExtraHintForField(theme, answer, field, activeFields, compareMove, hitFields)
		if hint == nil {
			continue
		}
		hints = append(hints, *hint)
		shown[field] = true
		bonusAdded++
	}

	return FilterPokemonWeaknessHints(hints, theme, hitFields)
}

// BuildSessionHints 组装当前题目对会话可见的全部提示。
func BuildSessionHints(
	theme types.Theme,
	answer types.CharacterEntry,
	hintField string,
	extraHintFields []string,
	questionAttempts int,
	activeFields []string,
	hitFields map[string]bool,
	compareMove *string,
	progressiveState *types.ProgressiveState,
) []types.HintInfo {
	if progressiveState != nil {
		return BuildProgressiveHintsFromState(*progressiveState, theme)
	}
	if hitFields == nil {
		hitFields = map[string]bool{}
	}
	return BuildQueuedBonusSessionHints(
		theme, answer, hintField, extraHintFields, questionAttempts,
		activeFields, hitFields, compareMove,
	)
}

func hintFieldInList(list []string, target string) bool {
	for _, s := range list {
		if s == target {
			return true
		}
	}
	return false
}

// --- game_service.go 使用的兼容辅助函数 ---

func buildHintInfo(theme types.Theme, field string, answer types.CharacterEntry) types.HintInfo {
	if theme == types.ThemePokemon && (field == "moveHint" || field == "weaknessHint") {
		return BuildPokemonHint(answer, field, nil)
	}
	if theme == types.ThemeFootball && (field == "clubLeague" || field == "confederation") {
		return BuildFootballPrimaryHint(answer, nil, field)
	}
	if theme == types.ThemeNBA && field == "divisionPosition" {
		return BuildNBAPrimaryHint(answer)
	}
	h, err := BuildHint(theme, answer, field, nil)
	if err != nil {
		return types.HintInfo{Field: field, Label: types.GetFieldLabel(theme, field)}
	}
	return h
}

func pickPrimaryHint(theme types.Theme, answer types.CharacterEntry, activeFields []string, rng *SeededRng) types.HintInfo {
	switch theme {
	case types.ThemePokemon:
		pool := []string{"category", "ability", "eggGroup", "moveHint", "weaknessHint"}
		field := pool[rng.NextInt(len(pool))]
		return BuildPokemonHint(answer, field, nil)
	case types.ThemeFootball:
		return BuildFootballPrimaryHint(answer, rng, "")
	case types.ThemeNBA:
		return BuildNBAPrimaryHint(answer)
	default:
		if len(activeFields) == 0 {
			return buildHintInfo(theme, "team", answer)
		}
		shuffled := rng.ShuffleStrings(append([]string{}, activeFields...))
		return buildHintInfo(theme, shuffled[0], answer)
	}
}

func pickExtraHintFields(theme types.Theme, primaryField string, activeFields []string, rng *SeededRng) []string {
	pool := append([]string{}, activeFields...)
	if theme == types.ThemePokemon {
		pool = append(pool, "moveHint", "weaknessHint")
	}
	seen := map[string]bool{primaryField: true}
	var unique []string
	for _, f := range pool {
		if seen[f] {
			continue
		}
		seen[f] = true
		unique = append(unique, f)
	}
	shuffled := rng.ShuffleStrings(unique)
	n := 3
	if len(shuffled) < n {
		n = len(shuffled)
	}
	return shuffled[:n]
}

func sessionHintsForMode(mode types.GameMode, hint types.HintInfo, ps *types.ProgressiveState) []types.HintInfo {
	switch mode {
	case types.ModeReverseBomb:
		return []types.HintInfo{}
	case types.ModeProgressive:
		if ps != nil && len(ps.Hints) > 0 {
			return ps.Hints
		}
		return []types.HintInfo{hint}
	default:
		return []types.HintInfo{hint}
	}
}
