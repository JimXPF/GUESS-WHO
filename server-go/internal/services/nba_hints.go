package services

import (
	"fmt"
	"regexp"
	"strings"

	"guess-who/server-go/internal/types"
)

var draftRoundLabels = map[int]string{
	1: "首轮秀",
	2: "次轮秀",
}

var nbaDraftRoundRe = regexp.MustCompile(`第(\d+)轮`)

func loadNBAConfig() (divisions, positions, teams map[string]string, minGp int) {
	doc, err := LoadTheme(types.ThemeNBA)
	if err != nil {
		return nil, nil, nil, 0
	}
	divisions = mapFromConfig(doc.Config, "divisions")
	positions = mapFromConfig(doc.Config, "positions")
	teams = mapFromConfig(doc.Config, "teams")
	if v, ok := doc.Config["playableMinTotalGpSince2025"].(float64); ok && v >= 0 {
		minGp = int(v)
	}
	return divisions, positions, teams, minGp
}

func GetDivisionHint(team string, divisions map[string]string) string {
	code := strings.TrimSpace(team)
	if code == "" || divisions == nil {
		return ""
	}
	if v, ok := divisions[code]; ok {
		return v
	}
	return ""
}

func GetDraftRoundHint(draft string) string {
	s := strings.TrimSpace(draft)
	if s == "" {
		return ""
	}
	if s == "落选秀" {
		return "落选秀"
	}
	m := nbaDraftRoundRe.FindStringSubmatch(s)
	if len(m) == 2 {
		round := 0
		fmt.Sscanf(m[1], "%d", &round)
		if label, ok := draftRoundLabels[round]; ok {
			return label
		}
		return fmt.Sprintf("第%d轮", round)
	}
	return ""
}

func GetNBAExtraHintFields() []string {
	excluded := map[string]bool{
		"name": true, "id": true, "aliases": true, "displayName": true,
		"imageUrl": true, "englishName": true, "division": true, "divisionPosition": true,
	}
	var out []string
	for _, def := range types.ThemeFieldDefs[types.ThemeNBA] {
		if !excluded[def.Field] {
			out = append(out, def.Field)
		}
	}
	return out
}

func BuildNBAPrimaryHint(answer types.CharacterEntry) types.HintInfo {
	divisions, _, _, _ := loadNBAConfig()
	division := GetDivisionHint(fmt.Sprintf("%v", answer["team"]), divisions)
	divLabel := "未知赛区"
	if division != "" {
		divLabel = strings.ReplaceAll(division, "球员", "")
	}
	roundLabel := GetDraftRoundHint(fmt.Sprintf("%v", answer["draft"]))
	if roundLabel == "" {
		roundLabel = "未知轮次"
	}
	return types.HintInfo{
		Field: "divisionPosition",
		Label: "赛区·选秀轮次",
		Value: fmt.Sprintf("%s · %s", divLabel, roundLabel),
	}
}

func IsNBAHintField(field string) bool {
	return field == "division" || field == "divisionPosition"
}

func IsNBAHintFieldExcluded(field string) bool {
	excluded := map[string]bool{
		"name": true, "id": true, "aliases": true, "displayName": true,
		"imageUrl": true, "englishName": true, "division": true,
		"divisionPosition": true, "position": true,
	}
	return excluded[field]
}

func GetNBAPositionLabel(entry types.CharacterEntry) string {
	_, positions, _, _ := loadNBAConfig()
	code := strings.TrimSpace(fmt.Sprintf("%v", entry["position"]))
	if code == "" {
		return "未知位置"
	}
	if positions != nil {
		if p, ok := positions[code]; ok {
			return p
		}
	}
	return code
}

func GetDivisionPosition(team, position string, divisions, positions map[string]string) string {
	div := GetDivisionHint(team, divisions)
	pos := position
	if positions != nil {
		if p, ok := positions[position]; ok {
			pos = p
		}
	}
	if div != "" && pos != "" {
		return fmt.Sprintf("%s-%s", div, pos)
	}
	return ""
}

func IsPlayableNBA(entry types.CharacterEntry, minGp int) bool {
	if entry.Get("hasCareerSince2025") != true {
		return false
	}
	_, _, _, cfgMin := loadNBAConfig()
	if minGp <= 0 {
		minGp = cfgMin
	}
	if minGp <= 0 {
		return true
	}
	total, _ := entry["totalGpSince2025"].(float64)
	best, _ := entry["bestGpSince2025"].(float64)
	gp := total
	if best > gp {
		gp = best
	}
	return gp >= float64(minGp)
}
