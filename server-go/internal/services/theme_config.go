package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"guess-who/server-go/internal/types"
)

// ThemeDocument 对应主题 JSON 信封结构 {version, config, players}。
type ThemeDocument struct {
	Version   int                    `json:"version"`
	UpdatedAt string                 `json:"updatedAt"`
	Config    map[string]interface{} `json:"config"`
	Players   []types.CharacterEntry `json:"players"`
}

var (
	themeDocCache = make(map[types.Theme]*ThemeDocument)
	themeDocMu    sync.RWMutex
)

// ReadThemeDocument 读取并缓存主题 JSON；将旧版根级元数据合并进 config。
func ReadThemeDocument(theme types.Theme) (*ThemeDocument, error) {
	themeDocMu.RLock()
	if doc, ok := themeDocCache[theme]; ok {
		themeDocMu.RUnlock()
		return doc, nil
	}
	themeDocMu.RUnlock()

	path := filepath.Join(DataDir, string(theme)+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read theme %s: %w", theme, err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		// 旧格式：纯 players 数组
		var players []types.CharacterEntry
		if err2 := json.Unmarshal(data, &players); err2 != nil {
			return nil, fmt.Errorf("parse theme %s: %w", theme, err)
		}
		doc := &ThemeDocument{Players: players, Config: map[string]interface{}{}}
		themeDocMu.Lock()
		themeDocCache[theme] = doc
		themeDocMu.Unlock()
		return doc, nil
	}

	doc := &ThemeDocument{Config: map[string]interface{}{}}

	if v, ok := raw["version"]; ok {
		_ = json.Unmarshal(v, &doc.Version)
	}
	if v, ok := raw["updatedAt"]; ok {
		_ = json.Unmarshal(v, &doc.UpdatedAt)
	}
	if v, ok := raw["config"]; ok {
		var cfg map[string]interface{}
		if err := json.Unmarshal(v, &cfg); err == nil {
			doc.Config = cfg
		}
	}
	if doc.Config == nil {
		doc.Config = map[string]interface{}{}
	}
	if v, ok := raw["meta"]; ok {
		var meta map[string]interface{}
		if err := json.Unmarshal(v, &meta); err == nil {
			for key, value := range meta {
				if _, exists := doc.Config[key]; !exists {
					doc.Config[key] = value
				}
			}
		}
	}
	if v, ok := raw["players"]; ok {
		_ = json.Unmarshal(v, &doc.Players)
	}

	themeDocMu.Lock()
	themeDocCache[theme] = doc
	themeDocMu.Unlock()
	return doc, nil
}

// GetThemeConfig 返回某主题的 config 对象。
func GetThemeConfig(theme types.Theme) (map[string]interface{}, error) {
	doc, err := ReadThemeDocument(theme)
	if err != nil {
		return nil, err
	}
	return doc.Config, nil
}

// GetPositionGroups 从主题 config 返回 positionGroups。
func GetPositionGroups(theme types.Theme) map[string][]string {
	cfg, err := GetThemeConfig(theme)
	if err != nil {
		return map[string][]string{}
	}
	raw, ok := cfg["positionGroups"].(map[string]interface{})
	if !ok || len(raw) == 0 {
		return map[string][]string{}
	}
	out := make(map[string][]string, len(raw))
	for group, membersAny := range raw {
		switch members := membersAny.(type) {
		case []interface{}:
			for _, m := range members {
				if s, ok := m.(string); ok {
					out[group] = append(out[group], s)
				}
			}
		case []string:
			out[group] = append(out[group], members...)
		}
	}
	return out
}

// GetPokemonTypeChartFromConfig 从宝可梦 config 返回 types 与 chart。
func GetPokemonTypeChartFromConfig() ([]string, map[string]map[string]float64, error) {
	cfg, err := GetThemeConfig(types.ThemePokemon)
	if err != nil {
		return nil, nil, err
	}
	tc, ok := cfg["typeChart"].(map[string]interface{})
	if !ok {
		return nil, nil, fmt.Errorf("typeChart missing")
	}
	var typeList []string
	if typesRaw, ok := tc["types"].([]interface{}); ok {
		for _, t := range typesRaw {
			typeList = append(typeList, fmt.Sprintf("%v", t))
		}
	}
	chart := map[string]map[string]float64{}
	if chartRaw, ok := tc["chart"].(map[string]interface{}); ok {
		for def, rowAny := range chartRaw {
			rowMap, _ := rowAny.(map[string]interface{})
			inner := make(map[string]float64)
			for atk, multAny := range rowMap {
				switch v := multAny.(type) {
				case float64:
					inner[atk] = v
				case int:
					inner[atk] = float64(v)
				}
			}
			chart[def] = inner
		}
	}
	return typeList, chart, nil
}

// getPokemonTypeChartData 是 GetPokemonTypeChartFromConfig 的内部别名。
func getPokemonTypeChartData() ([]string, map[string]map[string]float64, error) {
	return GetPokemonTypeChartFromConfig()
}

func bytesTrimSpace(b []byte) []byte {
	start, end := 0, len(b)
	for start < end && (b[start] == ' ' || b[start] == '\t' || b[start] == '\n' || b[start] == '\r') {
		start++
	}
	for end > start && (b[end-1] == ' ' || b[end-1] == '\t' || b[end-1] == '\n' || b[end-1] == '\r') {
		end--
	}
	return b[start:end]
}

// ClearThemeConfigCache 清除缓存的主题文档。
func ClearThemeConfigCache(theme *types.Theme) {
	themeDocMu.Lock()
	defer themeDocMu.Unlock()
	if theme == nil {
		themeDocCache = make(map[types.Theme]*ThemeDocument)
		return
	}
	delete(themeDocCache, *theme)
}
