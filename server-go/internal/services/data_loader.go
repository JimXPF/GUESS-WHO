package services

import (
	"errors"
	"fmt"
	"math/rand"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"guess-who/server-go/internal/types"
)

// LoadTheme 加载主题 JSON 文档（ReadThemeDocument 的别名）。
func LoadTheme(theme types.Theme) (*ThemeDocument, error) {
	return ReadThemeDocument(theme)
}

var (
	bankCache   = make(map[types.Theme][]types.CharacterEntry)
	bankCacheMu sync.RWMutex

	nbaConfigOnce sync.Once
	nbaTeamMap    map[string]string
	nbaPositionMap map[string]string
)

func initNBAConfig() {
	nbaConfigOnce.Do(func() {
		cfg, err := GetThemeConfig(types.ThemeNBA)
		if err != nil {
			nbaTeamMap = map[string]string{}
			nbaPositionMap = map[string]string{}
			return
		}
		nbaTeamMap = stringMapFromConfig(cfg, "teams")
		nbaPositionMap = stringMapFromConfig(cfg, "positions")
	})
}

func stringMapFromConfig(cfg map[string]interface{}, key string) map[string]string {
	raw, ok := cfg[key].(map[string]interface{})
	if !ok {
		return map[string]string{}
	}
	result := make(map[string]string, len(raw))
	for k, v := range raw {
		result[k] = fmt.Sprintf("%v", v)
	}
	return result
}

// NBAPositionDisplay 保存中英文位置标签。
type NBAPositionDisplay struct {
	Zh string
	En string
}

// GetNBATeamDisplay 返回本地化的 NBA 球队名。
func GetNBATeamDisplay(team string) string {
	initNBAConfig()
	if v, ok := nbaTeamMap[team]; ok && v != "" {
		return v
	}
	return team
}

// GetNBAPositionDisplay 返回中英文位置展示文本。
func GetNBAPositionDisplay(pos string) NBAPositionDisplay {
	initNBAConfig()
	zh := pos
	if v, ok := nbaPositionMap[pos]; ok && v != "" {
		zh = v
	}
	return NBAPositionDisplay{Zh: zh, En: pos}
}

// GetCharacterField 解析用于对比/提示的字段；年龄尽可能动态计算。
func GetCharacterField(entry types.CharacterEntry, field string, theme types.Theme) any {
	if field == "age" {
		now := time.Now()
		if theme == types.ThemeFootball {
			if age := ComputeAgeFromReferenceYear(entry["age"], FootballAgeReferenceYear, now); age != nil {
				return *age
			}
		} else {
			if bd := NormalizeBirthDate(entry["birthDate"]); bd != nil {
				if age := ComputeAgeFromBirthDate(*bd, now); age != nil {
					return *age
				}
			}
		}
	}
	return entry[field]
}

// GetBank 返回某主题的全部可玩角色（带缓存与过滤）。
func GetBank(theme types.Theme) ([]types.CharacterEntry, error) {
	bankCacheMu.RLock()
	if bank, ok := bankCache[theme]; ok && len(bank) > 0 {
		bankCacheMu.RUnlock()
		return bank, nil
	}
	bankCacheMu.RUnlock()

	doc, err := ReadThemeDocument(theme)
	if err != nil {
		return nil, err
	}
	players := append([]types.CharacterEntry(nil), doc.Players...)
	if theme == types.ThemeNBA {
		players = filterSlice(players, func(e types.CharacterEntry) bool { return IsPlayableNBA(e, 0) })
	}

	bankCacheMu.Lock()
	bankCache[theme] = players
	bankCacheMu.Unlock()
	return players, nil
}

func filterSlice(in []types.CharacterEntry, fn func(types.CharacterEntry) bool) []types.CharacterEntry {
	out := make([]types.CharacterEntry, 0, len(in))
	for _, e := range in {
		if fn(e) {
			out = append(out, e)
		}
	}
	return out
}

// GetCharacter 按 id 返回角色。
func GetCharacter(theme types.Theme, id string) (types.CharacterEntry, bool) {
	bank, err := GetBank(theme)
	if err != nil {
		return nil, false
	}
	for _, c := range bank {
		if c.ID() == id {
			return c, true
		}
	}
	return nil, false
}

var nameSegmentSplit = regexp.MustCompile(`[·・\-—－–]`)

// NormalizeText 转小写并去除空格/标点，用于名称匹配。
func NormalizeText(text string) string {
	text = strings.TrimSpace(text)
	var b strings.Builder
	for _, ch := range text {
		if ch >= 0xFF01 && ch <= 0xFF5E {
			b.WriteRune(ch - 0xFEE0)
		} else {
			b.WriteRune(ch)
		}
	}
	text = b.String()
	text = strings.ToLower(text)
	text = strings.ReplaceAll(text, " ", "")
	for _, sep := range []string{"·", "・", "-", "—", "－", "–"} {
		text = strings.ReplaceAll(text, sep, "")
	}
	return text
}

func isCharSubsequence(key, query string) bool {
	i := 0
	for _, ch := range key {
		if i < len(query) && ch == rune(query[i]) {
			i++
		}
		if i == len(query) {
			return true
		}
	}
	return false
}

func scoreNameKey(key, normalized string) int {
	if key == "" {
		return -1
	}
	if key == normalized {
		return 100
	}
	if strings.HasPrefix(key, normalized) {
		return 90 - (len(key) - len(normalized))
	}
	if isCharSubsequence(key, normalized) {
		return 85 - (len(key)-len(normalized))*2
	}
	if strings.Contains(key, normalized) {
		return 70 - (len(key) - len(normalized))
	}
	if strings.Contains(normalized, key) && len(key) >= 2 {
		return 45
	}
	return -1
}

func scoreNameMatch(raw, normalized string) int {
	best := scoreNameKey(NormalizeText(raw), normalized)
	for _, seg := range nameSegmentSplit.Split(raw, -1) {
		segScore := scoreNameKey(NormalizeText(seg), normalized)
		if segScore >= 0 {
			boosted := segScore
			if segScore == 100 {
				boosted = 96
			}
			if boosted > best {
				best = boosted
			}
		}
	}
	return best
}

// GetDisplayName 返回条目的展示名称。
func GetDisplayName(entry types.CharacterEntry, theme types.Theme) string {
	if theme == types.ThemeCSGO {
		if name := entry.Name(); name != "" {
			return name
		}
		return entry.ID()
	}
	return entry.Name()
}

// GetNameFieldValue 返回用于名称字段对比的值。
func GetNameFieldValue(entry types.CharacterEntry, theme types.Theme) string {
	if theme == types.ThemeCSGO {
		return entry.ID()
	}
	return GetDisplayName(entry, theme)
}

func getSearchSublabel(entry types.CharacterEntry, theme types.Theme) *string {
	switch theme {
	case types.ThemeCSGO:
		if team := strings.TrimSpace(fmt.Sprintf("%v", entry["team"])); team != "" && team != "<nil>" {
			return &team
		}
	case types.ThemeFootball:
		national := strings.TrimSpace(fmt.Sprintf("%v", entry["nationalTeam"]))
		club := strings.TrimSpace(fmt.Sprintf("%v", entry["club"]))
		if national == "<nil>" {
			national = ""
		}
		if club == "<nil>" {
			club = ""
		}
		if national != "" && club != "" {
			s := national + "/" + club
			return &s
		}
		if national != "" {
			return &national
		}
		if club != "" {
			return &club
		}
	case types.ThemeNBA:
		team := strings.TrimSpace(fmt.Sprintf("%v", entry["team"]))
		if team == "" || team == "<nil>" {
			return nil
		}
		teamDisplay := GetNBATeamDisplay(team)
		cfg, _ := GetThemeConfig(types.ThemeNBA)
		divisions := stringMapFromConfig(cfg, "divisions")
		division := divisions[team]
		if division != "" {
			divisionLabel := strings.ReplaceAll(division, "球员", "")
			s := divisionLabel + "-" + teamDisplay
			return &s
		}
		return &teamDisplay
	case types.ThemePokemon:
		t1 := strings.TrimSpace(fmt.Sprintf("%v", entry["type1"]))
		t2 := strings.TrimSpace(fmt.Sprintf("%v", entry["type2"]))
		if t1 == "<nil>" {
			t1 = ""
		}
		if t2 == "<nil>" {
			t2 = ""
		}
		if t1 != "" && t2 != "" {
			s := t1 + "/" + t2
			return &s
		}
		if t1 != "" {
			return &t1
		}
	}
	return nil
}

// SearchResult 是联想搜索的一行结果。
type SearchResult struct {
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	Sublabel *string `json:"sublabel,omitempty"`
	Score    int     `json:"-"`
}

// SearchCharacters 返回带评分的名称搜索结果。
func SearchCharacters(theme types.Theme, query string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = 8
	}
	normalized := NormalizeText(query)
	if normalized == "" {
		return []SearchResult{}, nil
	}
	bank, err := GetBank(theme)
	if err != nil {
		return nil, err
	}

	type keyEntry struct {
		key   string
		label string
		raw   string
		hasRaw bool
	}

	var scored []SearchResult
	for _, entry := range bank {
		var keys []keyEntry
		if theme == types.ThemeCSGO {
			displayLabel := GetDisplayName(entry, theme)
			keys = append(keys, keyEntry{key: NormalizeText(entry.ID()), label: displayLabel})
			if name := entry.Name(); name != "" && NormalizeText(name) != NormalizeText(entry.ID()) {
				keys = append(keys, keyEntry{key: NormalizeText(name), label: displayLabel, raw: name, hasRaw: true})
			}
			for _, a := range stringSliceField(entry, "aliases") {
				keys = append(keys, keyEntry{key: NormalizeText(a), label: displayLabel, raw: a, hasRaw: true})
			}
		} else {
			name := entry.Name()
			keys = append(keys, keyEntry{key: NormalizeText(name), label: name, raw: name, hasRaw: true})
			if en, ok := entry["englishName"].(string); ok && en != "" {
				keys = append(keys, keyEntry{key: NormalizeText(en), label: name, raw: en, hasRaw: true})
			}
			for _, a := range stringSliceField(entry, "aliases") {
				keys = append(keys, keyEntry{key: NormalizeText(a), label: name, raw: a, hasRaw: true})
			}
		}
		sublabel := getSearchSublabel(entry, theme)
		for _, k := range keys {
			score := -1
			if k.hasRaw {
				score = scoreNameMatch(k.raw, normalized)
			} else {
				score = scoreNameKey(k.key, normalized)
			}
			if score >= 0 {
				scored = append(scored, SearchResult{
					ID: entry.ID(), Label: k.label, Sublabel: sublabel, Score: score,
				})
				break
			}
		}
	}

	sort.Slice(scored, func(i, j int) bool { return scored[i].Score > scored[j].Score })
	seen := map[string]bool{}
	out := make([]SearchResult, 0, limit)
	for _, item := range scored {
		if seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		out = append(out, SearchResult{ID: item.ID, Label: item.Label, Sublabel: item.Sublabel})
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func stringSliceField(entry types.CharacterEntry, key string) []string {
	raw, ok := entry[key]
	if !ok {
		return nil
	}
	switch v := raw.(type) {
	case []string:
		return v
	case []interface{}:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

// FindCharacterByGuess 查找规范化名称的精确匹配。
func FindCharacterByGuess(theme types.Theme, guessText string) (types.CharacterEntry, bool) {
	normalized := NormalizeText(guessText)
	if normalized == "" {
		return nil, false
	}
	bank, err := GetBank(theme)
	if err != nil {
		return nil, false
	}
	for _, entry := range bank {
		if theme == types.ThemeCSGO {
			if NormalizeText(entry.ID()) == normalized {
				return entry, true
			}
			if NormalizeText(entry.Name()) == normalized {
				return entry, true
			}
			for _, a := range stringSliceField(entry, "aliases") {
				if NormalizeText(a) == normalized {
					return entry, true
				}
			}
		} else {
			if NormalizeText(entry.Name()) == normalized {
				return entry, true
			}
			if en, ok := entry["englishName"].(string); ok && NormalizeText(en) == normalized {
				return entry, true
			}
			for _, a := range stringSliceField(entry, "aliases") {
				if NormalizeText(a) == normalized {
					return entry, true
				}
			}
		}
	}
	return nil, false
}

// FindCharacterById 按 id 查找角色。
func FindCharacterById(theme types.Theme, id string) (types.CharacterEntry, bool) {
	return GetCharacter(theme, id)
}

// RandomSource 兼容种子随机或 math 随机。
type RandomSource interface {
	Next() float64
}

// PickRandomCharacter 随机选取可玩角色，可选排除指定 id。
func PickRandomCharacter(theme types.Theme, excludeIds []string, rng RandomSource) (types.CharacterEntry, error) {
	bank, err := GetBank(theme)
	if err != nil {
		return nil, err
	}
	exclude := make(map[string]bool, len(excludeIds))
	for _, id := range excludeIds {
		exclude[id] = true
	}
	filtered := make([]types.CharacterEntry, 0, len(bank))
	for _, c := range bank {
		if exclude[c.ID()] {
			continue
		}
		filtered = append(filtered, c)
	}
	if theme == types.ThemeFootball {
		filtered = filterSlice(filtered, IsPlayableFootballAnswer)
	}
	if theme == types.ThemeNBA {
		filtered = filterSlice(filtered, func(e types.CharacterEntry) bool { return IsPlayableNBA(e, 0) })
	}
	if len(filtered) == 0 {
		return nil, errors.New("No characters available")
	}
	r := rand.Float64()
	if rng != nil {
		r = rng.Next()
	}
	idx := int(r * float64(len(filtered)))
	if idx >= len(filtered) {
		idx = len(filtered) - 1
	}
	return filtered[idx], nil
}

// GetCharacterImage 存在时返回 http 图片 URL。
func GetCharacterImage(entry types.CharacterEntry) *string {
	url, ok := entry["imageUrl"].(string)
	if ok && strings.HasPrefix(url, "http") {
		return &url
	}
	return nil
}

// GetHintFields 返回某主题可用于提示的字段。
func GetHintFields(theme types.Theme, activeFields []string) []string {
	exclude := map[string]bool{
		"name": true, "id": true, "aliases": true, "displayName": true,
		"imageUrl": true, "englishName": true, "xhsPlayerId": true,
		"dexNumber": true, "hiddenAbility": true, "gen3LevelMoves": true, "learnableMove": true,
	}
	source := activeFields
	if len(source) == 0 {
		for _, def := range types.ThemeFieldDefs[theme] {
			source = append(source, def.Field)
		}
	}
	out := make([]string, 0, len(source))
	for _, k := range source {
		if !exclude[k] {
			out = append(out, k)
		}
	}
	if len(out) > 0 {
		return out
	}
	bank, err := GetBank(theme)
	if err != nil || len(bank) == 0 {
		return []string{}
	}
	sample := bank[0]
	for k := range sample {
		if !exclude[k] && isHintFieldName(k) {
			out = append(out, k)
		}
	}
	return out
}

func isHintFieldName(k string) bool {
	for _, r := range k {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return false
		}
	}
	return k != ""
}

// GetPokemonTypeChart 从宝可梦 config 返回属性克制表。
func GetPokemonTypeChart() (map[string]interface{}, error) {
	cfg, err := GetThemeConfig(types.ThemePokemon)
	if err != nil {
		return nil, err
	}
	if chart, ok := cfg["typeChart"].(map[string]interface{}); ok {
		return chart, nil
	}
	return nil, fmt.Errorf("typeChart not found in pokemon config")
}

// ClearBankCache 清除缓存的角色库。
func ClearBankCache(theme *types.Theme) {
	bankCacheMu.Lock()
	defer bankCacheMu.Unlock()
	if theme == nil {
		bankCache = make(map[types.Theme][]types.CharacterEntry)
		return
	}
	delete(bankCache, *theme)
}
