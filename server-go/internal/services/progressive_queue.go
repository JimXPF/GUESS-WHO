package services

import (
	"guess-who/server-go/internal/types"
)

// BuildProgressiveHintQueueFromSetup 从题目配置构建首条提示字段与待解锁队列。
func BuildProgressiveHintQueueFromSetup(
	theme types.Theme,
	setup types.QuestionSetup,
	answer types.CharacterEntry,
	rng *SeededRng,
) (firstField string, pendingQueue []string, footballPrimaryField *string) {
	switch theme {
	case types.ThemeFootball:
		primary := BuildFootballPrimaryHint(answer, rng, "")
		pool := rngShuffleStrings(
			filterStrings(GetFootballHintFields(), func(f string) bool { return f != primary.Field }),
			rng,
		)
		fp := primary.Field
		return primary.Field, pool, &fp

	case types.ThemeNBA:
		pool := rngShuffleStrings(GetNBAExtraHintFields(), rng)
		filtered := filterStrings(pool, func(f string) bool { return f != "divisionPosition" })
		return "divisionPosition", filtered, nil

	case types.ThemePokemon:
		bonus := filterStrings(GetPokemonBonusHintFields(setup.ActiveFields), func(f string) bool {
			return f != setup.HintField
		})
		var fromActive []string
		for _, f := range setup.ActiveFields {
			if f != setup.HintField && !containsString(bonus, f) {
				fromActive = append(fromActive, f)
			}
		}
		poolSet := uniqueStrings(append(append(fromActive, bonus...), setup.ExtraHintFields...))
		pool := filterStrings(poolSet, func(f string) bool { return f != setup.HintField })
		return setup.HintField, rngShuffleStrings(pool, rng), nil

	default:
		pool := filterStrings(GetHintFields(theme, setup.ActiveFields), func(f string) bool {
			return f != "name" && f != setup.HintField && !IsHintFieldExcluded(f) && !IsNBAHintFieldExcluded(f)
		})
		return setup.HintField, rngShuffleStrings(pool, rng), nil
	}
}

func rngShuffleStrings(arr []string, rng *SeededRng) []string {
	if rng == nil {
		rng = NewSeededRng(1)
	}
	return rng.ShuffleStrings(arr)
}

func filterStrings(arr []string, keep func(string) bool) []string {
	out := make([]string, 0, len(arr))
	for _, s := range arr {
		if keep(s) {
			out = append(out, s)
		}
	}
	return out
}

func uniqueStrings(arr []string) []string {
	seen := make(map[string]bool)
	var out []string
	for _, s := range arr {
		if seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

func containsString(arr []string, s string) bool {
	for _, v := range arr {
		if v == s {
			return true
		}
	}
	return false
}
