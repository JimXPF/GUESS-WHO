package services

import (
	"fmt"

	"guess-who/server-go/internal/types"
)

// BuildHint 为标准对比字段构建可展示的提示。
func BuildHint(theme types.Theme, answer types.CharacterEntry, hintField string, _ []string) (types.HintInfo, error) {
	if theme == types.ThemePokemon && IsPokemonHintFieldExcluded(hintField) {
		return types.HintInfo{}, fmt.Errorf(`field "%s" cannot be used as a hint`, hintField)
	}
	if IsHintFieldExcluded(hintField) {
		return types.HintInfo{}, fmt.Errorf(`field "%s" cannot be used as a hint`, hintField)
	}
	if IsNBAHintFieldExcluded(hintField) {
		return types.HintInfo{}, fmt.Errorf(`field "%s" cannot be used as a hint`, hintField)
	}

	value := GetCharacterField(answer, hintField, theme)
	if theme == types.ThemeNBA && hintField == "team" {
		value = GetNBATeamDisplay(fmt.Sprintf("%v", value))
	}
	return types.HintInfo{
		Field: hintField,
		Label: types.GetFieldLabel(theme, hintField),
		Value: FormatValue(value, hintField),
	}, nil
}
