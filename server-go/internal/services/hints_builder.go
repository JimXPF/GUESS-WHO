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
	return CollectHitFieldsUpToAttempts(guesses, 0)
}

// CollectHitFieldsUpToAttempts 汇总前 maxAttempts 次猜测的 hit 字段；maxAttempts<=0 表示全部。
func CollectHitFieldsUpToAttempts(guesses []types.GuessRecord, maxAttempts int) map[string]bool {
	hit := map[string]bool{}
	for i, g := range guesses {
		if maxAttempts > 0 && i >= maxAttempts {
			break
		}
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

type bonusHintBuildContext struct {
	theme        types.Theme
	answer       types.CharacterEntry
	hintField    string
	activeFields []string
	compareMove  *string
}

func (ctx bonusHintBuildContext) tryBuild(field string, hitFields map[string]bool) *types.HintInfo {
	return buildExtraHintForField(ctx.theme, ctx.answer, field, ctx.activeFields, ctx.compareMove, hitFields)
}

// pickBuildableQueueField 按队列顺序选取下一条可构建的提示字段。
func pickBuildableQueueField(
	queue []string,
	used map[string]bool,
	skipHit map[string]bool,
	allowHit bool,
	ctx bonusHintBuildContext,
	hitFields map[string]bool,
) string {
	for _, field := range queue {
		if used[field] {
			continue
		}
		if skipHit[field] && !allowHit {
			continue
		}
		if ctx.tryBuild(field, hitFields) == nil {
			continue
		}
		return field
	}
	return ""
}

// computeStableBonusFields 按 3/6/9 次阈值依次解锁，各槽位在对应阈值时点的 hit 状态下选取（顺序稳定）。
func computeStableBonusFields(
	extraHintFields []string,
	primaryField string,
	maxBonus int,
	guesses []types.GuessRecord,
	ctx bonusHintBuildContext,
) []string {
	if maxBonus <= 0 {
		return nil
	}
	used := map[string]bool{primaryField: true}
	var picked []string

	for slot := 0; slot < maxBonus && slot < len(bonusHintThresholds); slot++ {
		hitsAtThreshold := CollectHitFieldsUpToAttempts(guesses, bonusHintThresholds[slot])

		field := pickBuildableQueueField(extraHintFields, used, hitsAtThreshold, false, ctx, hitsAtThreshold)
		if field == "" {
			field = pickBuildableQueueField(extraHintFields, used, hitsAtThreshold, true, ctx, hitsAtThreshold)
		}
		if field == "" {
			break
		}
		picked = append(picked, field)
		used[field] = true
	}
	return picked
}

// backfillBonusHints 已 hit 的追加提示不占槽，从队列递补未 hit 项（用尽后再展示已 hit）。
func backfillBonusHints(
	primary types.HintInfo,
	bonusFields []string,
	maxBonus int,
	extraHintFields []string,
	currentHits map[string]bool,
	ctx bonusHintBuildContext,
) []types.HintInfo {
	used := map[string]bool{primary.Field: true}
	var bonus []types.HintInfo

	for _, field := range bonusFields {
		if currentHits[field] {
			continue
		}
		hint := ctx.tryBuild(field, currentHits)
		if hint == nil {
			continue
		}
		bonus = append(bonus, *hint)
		used[field] = true
	}

	for len(bonus) < maxBonus {
		field := pickBuildableQueueField(extraHintFields, used, currentHits, false, ctx, currentHits)
		if field == "" {
			field = pickBuildableQueueField(extraHintFields, used, currentHits, true, ctx, currentHits)
		}
		if field == "" {
			break
		}
		hint := ctx.tryBuild(field, currentHits)
		if hint == nil {
			used[field] = true
			continue
		}
		bonus = append(bonus, *hint)
		used[field] = true
	}

	out := make([]types.HintInfo, 0, 1+len(bonus))
	out = append(out, primary)
	out = append(out, bonus...)
	return out
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
	guesses []types.GuessRecord,
) []types.HintInfo {
	primaryList := buildPrimaryHintList(theme, answer, hintField, activeFields, compareMove)
	if len(primaryList) == 0 {
		return nil
	}
	primary := primaryList[0]

	maxBonus := countUnlockedBonusHints(questionAttempts)
	ctx := bonusHintBuildContext{theme, answer, hintField, activeFields, compareMove}

	if maxBonus == 0 {
		return FilterPokemonWeaknessHints(primaryList, theme, hitFields)
	}

	bonusFields := computeStableBonusFields(extraHintFields, hintField, maxBonus, guesses, ctx)
	hints := backfillBonusHints(primary, bonusFields, maxBonus, extraHintFields, hitFields, ctx)
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
	guesses []types.GuessRecord,
	compareMove *string,
	progressiveState *types.ProgressiveState,
) []types.HintInfo {
	if progressiveState != nil {
		return BuildProgressiveHintsFromState(*progressiveState, theme)
	}
	hitFields := CollectHitFields(guesses)
	return BuildQueuedBonusSessionHints(
		theme, answer, hintField, extraHintFields, questionAttempts,
		activeFields, hitFields, compareMove, guesses,
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
