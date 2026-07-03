package services

import (
	"fmt"

	"guess-who/server-go/internal/types"
)

var bonusHintThresholds = []int{3, 6, 9}

func pickQuestionHintsWithRng(
	theme types.Theme,
	activeFields []string,
	answer types.CharacterEntry,
	rng *SeededRng,
) (primary string, extra []string) {
	maxExtra := len(bonusHintThresholds)

	switch theme {
	case types.ThemeFootball:
		primaryHint := BuildFootballPrimaryHint(answer, rng, "")
		pool := rng.ShuffleStrings(filterString(primaryHint.Field, GetFootballHintFields()))
		extra = pool
		if len(extra) > maxExtra {
			extra = extra[:maxExtra]
		}
		return primaryHint.Field, extra

	case types.ThemeNBA:
		pool := rng.ShuffleStrings(GetNBAExtraHintFields())
		extra = pool
		if len(extra) > maxExtra {
			extra = extra[:maxExtra]
		}
		return "divisionPosition", extra
	}

	pool := rng.ShuffleStrings(filterHintEligible(theme, activeFields))
	if len(pool) == 0 {
		return "team", nil
	}
	primary = pool[0]
	if len(pool) > 1 {
		extra = pool[1:]
		if len(extra) > maxExtra {
			extra = extra[:maxExtra]
		}
	}
	return primary, extra
}

func filterHintEligible(theme types.Theme, activeFields []string) []string {
	var out []string
	for _, f := range GetHintFields(theme, activeFields) {
		if f == "name" || IsHintFieldExcluded(f) || IsNBAHintFieldExcluded(f) {
			continue
		}
		out = append(out, f)
	}
	return out
}

// ResolveQuestionSetupWithRng 使用确定性 RNG 构建 QuestionSetup。
func ResolveQuestionSetupWithRng(theme types.Theme, answer types.CharacterEntry, rng *SeededRng) (types.QuestionSetup, error) {
	if theme == types.ThemePokemon {
		setup := BuildPokemonQuestion(answer, rng)
		return types.QuestionSetup{
			AnswerID:        answer.ID(),
			HintField:       setup.HintField,
			ExtraHintFields: setup.ExtraHintFields,
			ActiveFields:    setup.ActiveFields,
			CompareMove:     setup.CompareMove,
		}, nil
	}

	activeFields, err := PickActiveFields(theme)
	if err != nil {
		return types.QuestionSetup{}, err
	}
	primary, extra := pickQuestionHintsWithRng(theme, activeFields, answer, rng)
	return types.QuestionSetup{
		AnswerID:        answer.ID(),
		HintField:       primary,
		ExtraHintFields: extra,
		ActiveFields:    activeFields,
		CompareMove:     nil,
	}, nil
}

// GenerateQuestionQueue 从种子字符串生成指定数量的不重复题目。
func GenerateQuestionQueue(theme types.Theme, count int, seedInput string) ([]types.QuestionSetup, error) {
	rng := NewSeededRng(HashStringToSeed(seedInput))
	queue := make([]types.QuestionSetup, 0, count)
	used := []string{}
	for i := 0; i < count; i++ {
		answer, err := PickRandomCharacter(theme, used, rng)
		if err != nil {
			return nil, err
		}
		used = append(used, answer.ID())
		setup, err := ResolveQuestionSetupWithRng(theme, answer, rng)
		if err != nil {
			return nil, err
		}
		queue = append(queue, setup)
	}
	return queue, nil
}

// SetupToCharacter 从题目配置解析答案角色。
func SetupToCharacter(theme types.Theme, setup types.QuestionSetup) (types.CharacterEntry, error) {
	c, ok := FindCharacterById(theme, setup.AnswerID)
	if !ok {
		return nil, fmt.Errorf("setup answer not found: %s", setup.AnswerID)
	}
	return c, nil
}
