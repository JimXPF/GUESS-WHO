package services

import (
	"fmt"
	"strings"

	"guess-who/server-go/internal/types"
)

func loadFootballConfig() (confederations, clubLeagues map[string]string, allowedLabels map[string]bool) {
	doc, err := LoadTheme(types.ThemeFootball)
	if err != nil {
		return nil, nil, nil
	}
	confederations = mapFromConfig(doc.Config, "confederations")
	clubLeagues = mapFromConfig(doc.Config, "clubLeagues")
	allowedLabels = make(map[string]bool)
	if raw, ok := doc.Config["allowedClubLeagues"].([]interface{}); ok {
		for _, item := range raw {
			if m, ok := item.(map[string]interface{}); ok {
				if label, ok := m["label"].(string); ok {
					allowedLabels[label] = true
				}
			}
		}
	}
	return confederations, clubLeagues, allowedLabels
}

func mapFromConfig(cfg map[string]interface{}, key string) map[string]string {
	raw, _ := cfg[key].(map[string]interface{})
	out := make(map[string]string, len(raw))
	for k, v := range raw {
		out[k] = fmt.Sprintf("%v", v)
	}
	return out
}

func GetFootballHintFields() []string {
	return []string{"club", "nationalTeam", "age", "marketValue", "height", "position"}
}

func GetConfederationHintForEntry(entry types.CharacterEntry) string {
	_, confederations, _ := loadFootballConfig()
	return GetConfederationHint(fmt.Sprintf("%v", entry["nationalTeam"]), confederations)
}

func ResolveClubLeagueEntry(entry types.CharacterEntry) string {
	_, clubLeagues, _ := loadFootballConfig()
	if v, ok := entry["clubLeague"].(string); ok && strings.TrimSpace(v) != "" {
		return v
	}
	club := strings.TrimSpace(fmt.Sprintf("%v", entry["club"]))
	if club == "" || club == "无" {
		return ""
	}
	return ResolveClubLeague(club, clubLeagues)
}

func GetClubLeagueHintForEntry(entry types.CharacterEntry) string {
	return ResolveClubLeagueEntry(entry)
}

func IsAllowedClubLeagueLabel(league string) bool {
	_, _, allowed := loadFootballConfig()
	if len(allowed) == 0 {
		return league != ""
	}
	return allowed[league]
}

func IsPlayableFootballAnswer(entry types.CharacterEntry) bool {
	league := ResolveClubLeagueEntry(entry)
	return IsAllowedClubLeagueLabel(league)
}

func IsFootballHintField(field string) bool {
	return field == "confederation" || field == "clubLeague"
}

func IsHintFieldExcluded(field string) bool {
	excluded := map[string]bool{
		"name": true, "id": true, "aliases": true, "displayName": true,
		"imageUrl": true, "englishName": true, "xhsPlayerId": true, "clubLeague": true,
	}
	return excluded[field]
}

func BuildFootballPrimaryHint(answer types.CharacterEntry, rng *SeededRng, forcedField string) types.HintInfo {
	confederations, _, _ := loadFootballConfig()
	conf := GetConfederationHint(fmt.Sprintf("%v", answer["nationalTeam"]), confederations)
	league := GetClubLeagueHintForEntry(answer)

	var options []types.HintInfo
	if league != "" && IsAllowedClubLeagueLabel(league) {
		options = append(options, types.HintInfo{Field: "clubLeague", Label: "所属联赛", Value: league})
	}
	if conf != "" {
		options = append(options, types.HintInfo{Field: "confederation", Label: "所属足联", Value: conf})
	}

	if forcedField != "" {
		for _, o := range options {
			if o.Field == forcedField {
				return o
			}
		}
	}

	if len(options) == 0 {
		return types.HintInfo{Field: "confederation", Label: "所属足联", Value: "未知足联球员"}
	}
	if len(options) == 1 {
		return options[0]
	}
	idx := 0
	if rng != nil {
		idx = rng.NextInt(len(options))
	}
	return options[idx]
}

func BuildFootballSyntheticHint(answer types.CharacterEntry, field string) types.HintInfo {
	return BuildFootballPrimaryHint(answer, nil, field)
}

// GetConfederationHint 返回国家队对应的洲际赛区。
func GetConfederationHint(nationalTeam string, confederations map[string]string) string {
	team := strings.TrimSpace(nationalTeam)
	if team == "" || confederations == nil {
		return ""
	}
	if v, ok := confederations[team]; ok {
		return v
	}
	return ""
}

// ResolveClubLeague 从配置查找俱乐部对应的联赛。
func ResolveClubLeague(club string, clubLeagues map[string]string) string {
	c := strings.TrimSpace(club)
	if c == "" || clubLeagues == nil {
		return ""
	}
	if league, ok := clubLeagues[c]; ok {
		return league
	}
	return ""
}

func IsAllowedClubLeague(league string, allowed map[string]bool) bool {
	if allowed == nil || len(allowed) == 0 {
		return true
	}
	return allowed[league]
}
