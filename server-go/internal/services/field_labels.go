package services

import (
	"guess-who/server-go/internal/types"
)

// FieldDef 字段键与展示标签的配对。
type FieldDef struct {
	Field string
	Label string
}

// GetThemeFields 返回带标签的对比字段列表（宝可梦主题保证 type2 紧跟 type1）。
func GetThemeFields(theme types.Theme, activeFields []string) []FieldDef {
	var ordered []string
	if theme == types.ThemePokemon {
		if containsStr(activeFields, "type1") {
			ordered = append(ordered, "type1")
		}
		if containsStr(activeFields, "type2") {
			ordered = append(ordered, "type2")
		}
		for _, f := range activeFields {
			if f != "type1" && f != "type2" {
				ordered = append(ordered, f)
			}
		}
	} else {
		ordered = append([]string(nil), activeFields...)
	}
	out := make([]FieldDef, len(ordered))
	for i, field := range ordered {
		out[i] = FieldDef{Field: field, Label: types.GetFieldLabel(theme, field)}
	}
	return out
}

func containsStr(list []string, target string) bool {
	for _, s := range list {
		if s == target {
			return true
		}
	}
	return false
}
