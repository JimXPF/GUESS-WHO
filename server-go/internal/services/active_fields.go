package services

import (
	"encoding/json"
	"errors"

	"guess-who/server-go/internal/types"
)

// PickActiveFields 返回非宝可梦主题的固定六个对比字段。
func PickActiveFields(theme types.Theme) ([]string, error) {
	pools := map[types.Theme][]string{
		types.ThemeCSGO:     {"team", "nationality", "age", "rating", "top20Count", "position"},
		types.ThemeFootball: {"club", "nationalTeam", "age", "marketValue", "height", "position"},
		types.ThemeNBA:      {"team", "age", "height", "draft", "playoffCount", "position"},
	}
	if theme == types.ThemePokemon {
		return nil, errors.New("Use buildPokemonQuestion() for pokemon theme")
	}
	fields, ok := pools[theme]
	if !ok {
		return nil, errors.New("unknown theme")
	}
	out := make([]string, len(fields))
	copy(out, fields)
	return out, nil
}

// ParseActiveFields 解析存储的 active_fields JSON，或返回默认值。
func ParseActiveFields(raw string, theme types.Theme) []string {
	var parsed []string
	if raw != "" {
		if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
			if len(parsed) > 0 && allStrings(parsed) {
				if theme == types.ThemePokemon {
					return filterPokemonCompareFields(parsed)
				}
				return parsed
			}
		}
	}
	if theme == types.ThemePokemon {
		return []string{"type1", "category", "ability", "baseStatTotal", "evolutionStage", "type2"}
	}
	fields, err := PickActiveFields(theme)
	if err != nil {
		return []string{}
	}
	return fields
}

// filterPokemonCompareFields 移除仅作提示、不参与对比的字段。
func filterPokemonCompareFields(fields []string) []string {
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if f == "weaknessHint" || f == "moveHint" {
			continue
		}
		out = append(out, f)
	}
	return out
}

func allStrings(arr []string) bool {
	for _, s := range arr {
		if s == "" {
			return false
		}
	}
	return true
}
