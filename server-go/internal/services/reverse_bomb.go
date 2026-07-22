package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"

	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/types"
)

var reverseExcludedFields = map[string]bool{"learnableMove": true}

var extraReverseFieldDefs = map[types.Theme][]types.ThemeFieldDef{
	types.ThemeCSGO: {
		{Field: "firepowerStat", Label: "火力值"},
		{Field: "sniperStat", Label: "狙击值"},
		{Field: "breakthroughStat", Label: "突破"},
		{Field: "tradeStat", Label: "补枪值"},
		{Field: "clutchStat", Label: "残局值"},
		{Field: "utilityStat", Label: "道具值"},
	},
}

var syntheticReverseFields = map[types.Theme][]string{
	types.ThemeFootball: {"clubLeague", "confederation"},
	types.ThemeNBA:      {"division"},
	types.ThemePokemon:  {PokemonReverseWeakField, PokemonReverseResistField},
}

var nullableReverseFields = map[string]bool{"type2": true, "club": true, "school": true}

var numericReverseFields = map[types.Theme]map[string]bool{
	types.ThemeCSGO: {
		"age": true, "rating": true, "top20Count": true,
		"firepowerStat": true, "sniperStat": true, "breakthroughStat": true,
		"tradeStat": true, "clutchStat": true, "utilityStat": true,
	},
	types.ThemeFootball: {"age": true, "marketValue": true, "height": true},
	types.ThemeNBA: {
		"age": true, "height": true, "playoffCount": true,
		"currentSeasonGp": true, "maxCareerGpSince2025": true,
	},
	types.ThemePokemon: {
		"baseStatTotal": true, "hp": true, "attack": true, "defense": true,
		"spAttack": true, "spDefense": true, "speed": true,
	},
}

func operatorDisplayLabel(op types.ReverseOperator) string {
	switch op {
	case types.OpEQ:
		return "是"
	case types.OpNE:
		return "不是"
	case types.OpGTE:
		return "大于等于"
	case types.OpLTE:
		return "小于等于"
	default:
		return string(op)
	}
}

func normalizeReverseStr(val interface{}) string {
	if val == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", val))
}

func reverseToFloat(v interface{}) float64 {
	f, ok := toFloat64(v)
	if !ok {
		return math.NaN()
	}
	return f
}

func normalizeEnumValue(val interface{}, field string) string {
	s := normalizeReverseStr(val)
	if s == "" && nullableReverseFields[field] {
		return "无"
	}
	return s
}

func reverseParseEggGroups(val interface{}) []string {
	parts := strings.Split(fmt.Sprintf("%v", val), "、")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && p != "<nil>" {
			out = append(out, p)
		}
	}
	return out
}

// GetReverseQueryableFields 返回逆向轰炸查询可用的全部字段。
func GetReverseQueryableFields(theme types.Theme) []string {
	seen := make(map[string]bool)
	var out []string
	for _, def := range themeFieldDefsList(theme) {
		if reverseExcludedFields[def.Field] {
			continue
		}
		if !seen[def.Field] {
			seen[def.Field] = true
			out = append(out, def.Field)
		}
	}
	for _, def := range extraReverseFieldDefs[theme] {
		if !seen[def.Field] {
			seen[def.Field] = true
			out = append(out, def.Field)
		}
	}
	for _, f := range syntheticReverseFields[theme] {
		if !seen[f] {
			seen[f] = true
			out = append(out, f)
		}
	}
	return out
}

func themeFieldDefsList(theme types.Theme) []FieldDef {
	defs := types.ThemeFieldDefs[theme]
	out := make([]FieldDef, len(defs))
	for i, d := range defs {
		out[i] = FieldDef{Field: d.Field, Label: d.Label}
	}
	return out
}

func getExtraReverseFieldLabel(theme types.Theme, field string) string {
	for _, def := range extraReverseFieldDefs[theme] {
		if def.Field == field {
			return def.Label
		}
	}
	return ""
}

// IsNumericReverseField 判断字段是否使用数值运算符。
func IsNumericReverseField(theme types.Theme, field string) bool {
	if m, ok := numericReverseFields[theme]; ok {
		return m[field]
	}
	return false
}

// GetAllowedOperators 返回逆向字段的有效运算符。
func GetAllowedOperators(theme types.Theme, field string) []types.ReverseOperator {
	if IsNumericReverseField(theme, field) {
		return []types.ReverseOperator{types.OpGTE, types.OpLTE}
	}
	return []types.ReverseOperator{types.OpEQ, types.OpNE}
}

func getRawFieldValue(entry types.CharacterEntry, field string, theme types.Theme) interface{} {
	if theme == types.ThemeNBA && field == "division" {
		divisions, _, _, _ := loadNBAConfig()
		div := GetDivisionHint(fmt.Sprintf("%v", entry["team"]), divisions)
		if div != "" {
			return strings.ReplaceAll(div, "球员", "")
		}
		return "未知赛区"
	}
	if theme == types.ThemeFootball && field == "clubLeague" {
		if v := ResolveClubLeagueEntry(entry); v != "" {
			return v
		}
		return "未知联赛"
	}
	if theme == types.ThemeFootball && field == "confederation" {
		if v := GetConfederationHintForEntry(entry); v != "" {
			return v
		}
		return "未知洲际"
	}
	return GetCharacterField(entry, field, theme)
}

func cardSatisfiesOperator(
	cardValue interface{},
	operator types.ReverseOperator,
	conditionValue interface{},
	field string,
	theme types.Theme,
	card types.CharacterEntry,
) bool {
	if theme == types.ThemePokemon && card != nil && IsPokemonReverseMatchupField(field) {
		allTypes, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return false
		}
		_ = allTypes
		return PokemonCardSatisfiesMatchupCondition(card, field, string(operator), fmt.Sprintf("%v", conditionValue), typeChart)
	}

	if field == "eggGroup" {
		groups := reverseParseEggGroups(cardValue)
		target := normalizeReverseStr(conditionValue)
		if operator == types.OpEQ {
			for _, g := range groups {
				if g == target {
					return true
				}
			}
			return false
		}
		if operator == types.OpNE {
			for _, g := range groups {
				if g == target {
					return false
				}
			}
			return true
		}
		return false
	}

	if IsNumericReverseField(theme, field) {
		num := reverseToFloat(cardValue)
		threshold := reverseToFloat(conditionValue)
		if num == 0 && threshold == 0 && normalizeReverseStr(cardValue) == "" {
			return false
		}
		if operator == types.OpGTE {
			return num >= threshold
		}
		if operator == types.OpLTE {
			return num <= threshold
		}
		return false
	}

	cardNorm := strings.ToLower(normalizeEnumValue(cardValue, field))
	valNorm := strings.ToLower(normalizeEnumValue(conditionValue, field))
	if operator == types.OpEQ {
		return cardNorm == valNorm
	}
	if operator == types.OpNE {
		return cardNorm != valNorm
	}
	return false
}

// CardCompatibleWithTag 根据查询标签判断卡片是否仍存活。
func CardCompatibleWithTag(card types.CharacterEntry, query types.ReverseQueryRecord, theme types.Theme) bool {
	raw := getRawFieldValue(card, query.Condition.Field, theme)
	satisfies := cardSatisfiesOperator(raw, query.Condition.Operator, query.Condition.Value, query.Condition.Field, theme, card)
	if query.Matched {
		return satisfies
	}
	return !satisfies
}

// CardMatchesCondition 判断卡片是否满足逆向条件。
func CardMatchesCondition(card types.CharacterEntry, condition types.ReverseCondition, theme types.Theme) bool {
	if theme == types.ThemePokemon && IsPokemonReverseMatchupField(condition.Field) {
		_, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return false
		}
		return PokemonCardSatisfiesMatchupCondition(card, condition.Field, string(condition.Operator), fmt.Sprintf("%v", condition.Value), typeChart)
	}
	raw := getRawFieldValue(card, condition.Field, theme)
	return cardSatisfiesOperator(raw, condition.Operator, condition.Value, condition.Field, theme, card)
}

// EvaluateAnswerCondition 判断隐藏答案是否匹配条件。
func EvaluateAnswerCondition(answer types.CharacterEntry, condition types.ReverseCondition, theme types.Theme) bool {
	return CardMatchesCondition(answer, condition, theme)
}

// GetReverseQuestionBank 返回逆向模式的可玩角色库。
func GetReverseQuestionBank(theme types.Theme) ([]types.CharacterEntry, error) {
	return GetBank(theme)
}

// PickReverseQuestionPoolIds 随机选取包含答案在内的池 id。
func PickReverseQuestionPoolIds(theme types.Theme, answerID string) ([]string, error) {
	bank, err := GetReverseQuestionBank(theme)
	if err != nil {
		return nil, err
	}
	if len(bank) <= types.ReverseQuestionPoolSize {
		out := make([]string, len(bank))
		for i, c := range bank {
			out[i] = c.ID()
		}
		return shuffleStringIDs(out), nil
	}
	var others []string
	for _, c := range bank {
		if c.ID() != answerID {
			others = append(others, c.ID())
		}
	}
	rng := NewSeededRng(uint32(len(answerID)*31 + len(others)))
	shuffled := rng.ShuffleStrings(others)
	n := types.ReverseQuestionPoolSize - 1
	if n > len(shuffled) {
		n = len(shuffled)
	}
	ids := append(shuffled[:n], answerID)
	return shuffleStringIDs(ids), nil
}

func shuffleStringIDs(ids []string) []string {
	rng := NewSeededRng(uint32(len(ids) * 17))
	return rng.ShuffleStrings(ids)
}

// ResolveQuestionPoolIds 从状态或答案解析池 id。
func ResolveQuestionPoolIds(theme types.Theme, questionPoolIds []string, answerID string) ([]string, error) {
	if len(questionPoolIds) > 0 {
		return questionPoolIds, nil
	}
	if answerID != "" {
		return PickReverseQuestionPoolIds(theme, answerID)
	}
	bank, err := GetReverseQuestionBank(theme)
	if err != nil {
		return nil, err
	}
	out := make([]string, len(bank))
	for i, c := range bank {
		out[i] = c.ID()
	}
	return out, nil
}

// GetQuestionPoolEntries 返回池 id 对应的条目。
func GetQuestionPoolEntries(theme types.Theme, questionPoolIds []string) ([]types.CharacterEntry, error) {
	if len(questionPoolIds) == 0 {
		return nil, nil
	}
	bank, err := GetBank(theme)
	if err != nil {
		return nil, err
	}
	idSet := make(map[string]bool, len(questionPoolIds))
	for _, id := range questionPoolIds {
		idSet[id] = true
	}
	var out []types.CharacterEntry
	for _, c := range bank {
		if idSet[c.ID()] {
			out = append(out, c)
		}
	}
	return out, nil
}

func resolveQuestionPoolEntries(theme types.Theme, questionPoolIds []string, answerID string) ([]types.CharacterEntry, error) {
	ids, err := ResolveQuestionPoolIds(theme, questionPoolIds, answerID)
	if err != nil {
		return nil, err
	}
	return GetQuestionPoolEntries(theme, ids)
}

// GetAlivePool 返回仍与全部查询标签兼容的卡片。
func GetAlivePool(theme types.Theme, queries []types.ReverseQueryRecord, questionPoolIds []string, answerID string) ([]types.CharacterEntry, error) {
	bank, err := resolveQuestionPoolEntries(theme, questionPoolIds, answerID)
	if err != nil {
		return nil, err
	}
	if len(queries) == 0 {
		return bank, nil
	}
	var alive []types.CharacterEntry
	for _, card := range bank {
		ok := true
		for _, q := range queries {
			if !CardCompatibleWithTag(card, q, theme) {
				ok = false
				break
			}
		}
		if ok {
			alive = append(alive, card)
		}
	}
	return alive, nil
}

func countFieldDiscrimination(alivePool []types.CharacterEntry, field string, theme types.Theme) int {
	if theme == types.ThemePokemon && field == PokemonReverseWeakField {
		allTypes, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return 0
		}
		return len(GetPokemonReverseMatchupValues(alivePool, "weak", typeChart, allTypes))
	}
	if theme == types.ThemePokemon && field == PokemonReverseResistField {
		allTypes, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return 0
		}
		return len(GetPokemonReverseMatchupValues(alivePool, "resist", typeChart, allTypes))
	}

	if IsNumericReverseField(theme, field) {
		seen := make(map[string]bool)
		for _, card := range alivePool {
			v := reverseToFloat(getRawFieldValue(card, field, theme))
			if !math.IsNaN(v) {
				seen[fmt.Sprintf("%v", v)] = true
			}
		}
		return len(seen)
	}

	unique := make(map[string]bool)
	for _, card := range alivePool {
		if field == "eggGroup" {
			for _, g := range reverseParseEggGroups(getRawFieldValue(card, field, theme)) {
				unique[g] = true
			}
		} else {
			unique[normalizeEnumValue(getRawFieldValue(card, field, theme), field)] = true
		}
	}
	return len(unique)
}

func fieldHasDiscrimination(alivePool []types.CharacterEntry, field string, theme types.Theme) bool {
	if theme == types.ThemePokemon && field == PokemonReverseWeakField {
		allTypes, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return false
		}
		return PokemonMatchupFieldHasDiscrimination(alivePool, "weak", typeChart, allTypes)
	}
	if theme == types.ThemePokemon && field == PokemonReverseResistField {
		allTypes, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return false
		}
		return PokemonMatchupFieldHasDiscrimination(alivePool, "resist", typeChart, allTypes)
	}

	if IsNumericReverseField(theme, field) {
		var nums []float64
		for _, card := range alivePool {
			v := reverseToFloat(getRawFieldValue(card, field, theme))
			if !math.IsNaN(v) {
				nums = append(nums, v)
			}
		}
		if len(nums) < 2 {
			return false
		}
		min, max := nums[0], nums[0]
		for _, n := range nums[1:] {
			if n < min {
				min = n
			}
			if n > max {
				max = n
			}
		}
		return min != max
	}

	unique := make(map[string]bool)
	for _, card := range alivePool {
		if field == "eggGroup" {
			for _, g := range reverseParseEggGroups(getRawFieldValue(card, field, theme)) {
				unique[g] = true
			}
		} else {
			unique[normalizeEnumValue(getRawFieldValue(card, field, theme), field)] = true
		}
	}
	return len(unique) >= 2
}

// GetReverseFields 返回存活池中有区分度的字段。
func GetReverseFields(alivePool []types.CharacterEntry, theme types.Theme) []types.ReverseFieldMeta {
	var fields []types.ReverseFieldMeta
	for _, field := range GetReverseQueryableFields(theme) {
		if !fieldHasDiscrimination(alivePool, field, theme) {
			continue
		}
		label := getExtraReverseFieldLabel(theme, field)
		if label == "" {
			label = types.GetFieldLabel(theme, field)
		}
		kind := "enum"
		if IsNumericReverseField(theme, field) {
			kind = "numeric"
		}
		fields = append(fields, types.ReverseFieldMeta{Field: field, Label: label, Kind: kind})
	}
	return fields
}

// GetReverseValues 返回存活池中逆向字段的有效取值。
func GetReverseValues(alivePool []types.CharacterEntry, theme types.Theme, field string) types.ReverseValuesResponse {
	if theme == types.ThemePokemon && field == PokemonReverseWeakField {
		allTypes, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return types.ReverseValuesResponse{Kind: "enum", Values: []string{}}
		}
		return types.ReverseValuesResponse{Kind: "enum", Values: GetPokemonReverseMatchupValues(alivePool, "weak", typeChart, allTypes)}
	}
	if theme == types.ThemePokemon && field == PokemonReverseResistField {
		allTypes, typeChart, err := getPokemonTypeChartData()
		if err != nil {
			return types.ReverseValuesResponse{Kind: "enum", Values: []string{}}
		}
		return types.ReverseValuesResponse{Kind: "enum", Values: GetPokemonReverseMatchupValues(alivePool, "resist", typeChart, allTypes)}
	}

	if IsNumericReverseField(theme, field) {
		var nums []float64
		for _, card := range alivePool {
			v := reverseToFloat(getRawFieldValue(card, field, theme))
			if !math.IsNaN(v) {
				nums = append(nums, v)
			}
		}
		sort.Float64s(nums)
		min, max := 0.0, 0.0
		if len(nums) > 0 {
			min, max = nums[0], nums[len(nums)-1]
		}
		return types.ReverseValuesResponse{Kind: "numeric", Min: min, Max: max}
	}

	values := make(map[string]bool)
	for _, card := range alivePool {
		if field == "eggGroup" {
			for _, g := range reverseParseEggGroups(getRawFieldValue(card, field, theme)) {
				values[g] = true
			}
		} else {
			values[normalizeEnumValue(getRawFieldValue(card, field, theme), field)] = true
		}
	}
	list := make([]string, 0, len(values))
	for v := range values {
		list = append(list, v)
	}
	sort.Slice(list, func(i, j int) bool { return list[i] < list[j] })
	return types.ReverseValuesResponse{Kind: "enum", Values: list}
}

// ComputeNewlyEliminated 返回两个池之间新淘汰的 id。
func ComputeNewlyEliminated(beforePool, afterPool []types.CharacterEntry) []string {
	afterIDs := make(map[string]bool, len(afterPool))
	for _, c := range afterPool {
		afterIDs[c.ID()] = true
	}
	var out []string
	for _, c := range beforePool {
		if !afterIDs[c.ID()] {
			out = append(out, c.ID())
		}
	}
	return out
}

// FormatReverseTag 格式化逆向查询标签以供展示。
func FormatReverseTag(condition types.ReverseCondition, theme types.Theme, displayValue interface{}) string {
	label := types.GetFieldLabel(theme, condition.Field)
	val := displayValue
	if val == nil {
		val = condition.Value
	}
	return fmt.Sprintf("%s %s %v", label, operatorDisplayLabel(condition.Operator), val)
}

// BuildPlayablePool 为逆向 UI 构建卡片摘要。
func BuildPlayablePool(theme types.Theme, questionPoolIds []string, answerID string) ([]types.PlayableCardSummary, error) {
	ids, err := ResolveQuestionPoolIds(theme, questionPoolIds, answerID)
	if err != nil {
		return nil, err
	}
	entries, err := GetQuestionPoolEntries(theme, ids)
	if err != nil {
		return nil, err
	}
	out := make([]types.PlayableCardSummary, len(entries))
	for i, entry := range entries {
		out[i] = types.PlayableCardSummary{
			ID: entry.ID(), Name: GetDisplayName(entry, theme), ImageURL: GetCharacterImage(entry),
		}
	}
	return out, nil
}

// ComputeEliminatedIds 一次遍历从查询标签返回已淘汰 id。
func ComputeEliminatedIds(theme types.Theme, queries []types.ReverseQueryRecord, questionPoolIds []string, answerID string) ([]string, error) {
	if len(queries) == 0 {
		return nil, nil
	}
	bank, err := resolveQuestionPoolEntries(theme, questionPoolIds, answerID)
	if err != nil {
		return nil, err
	}
	var eliminated []string
	for _, card := range bank {
		alive := true
		for _, q := range queries {
			if !CardCompatibleWithTag(card, q, theme) {
				alive = false
				break
			}
		}
		if !alive {
			eliminated = append(eliminated, card.ID())
		}
	}
	return eliminated, nil
}

type scoredReverseField struct {
	types.ReverseFieldMeta
	score int
}

// PickReverseFieldChoices 为下一轮选取两个有区分度的字段。
func PickReverseFieldChoices(alivePool []types.CharacterEntry, theme types.Theme, excludeFields []string) []types.ReverseFieldMeta {
	available := GetReverseFields(alivePool, theme)
	if len(available) == 0 {
		return nil
	}
	if len(available) == 1 {
		return available
	}

	excludeSet := make(map[string]bool)
	for _, f := range excludeFields {
		excludeSet[f] = true
	}

	scored := make([]scoredReverseField, len(available))
	for i, meta := range available {
		scored[i] = scoredReverseField{
			ReverseFieldMeta: meta,
			score:            countFieldDiscrimination(alivePool, meta.Field, theme),
		}
	}
	sort.Slice(scored, func(i, j int) bool { return scored[i].score > scored[j].score })

	candidates := scored
	filtered := make([]scoredReverseField, 0, len(scored))
	for _, s := range scored {
		if !excludeSet[s.Field] {
			filtered = append(filtered, s)
		}
	}
	if len(filtered) >= 2 {
		candidates = filtered
	}

	topN := len(candidates)
	if topN > 4 {
		topN = 4
	}
	topPool := candidates[:topN]
	rng := NewSeededRng(uint32(len(alivePool)*13 + topN))
	shuffled := make([]scoredReverseField, len(topPool))
	copy(shuffled, topPool)
	for i := len(shuffled) - 1; i > 0; i-- {
		j := rng.NextInt(i + 1)
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	}
	n := 2
	if len(shuffled) < n {
		n = len(shuffled)
	}
	out := make([]types.ReverseFieldMeta, n)
	for i := 0; i < n; i++ {
		out[i] = shuffled[i].ReverseFieldMeta
	}
	return out
}

// CreateInitialReverseState 构建全新的逆向轰炸状态。
func CreateInitialReverseState(theme types.Theme, answerID string) (types.ReverseState, error) {
	poolIDs, err := PickReverseQuestionPoolIds(theme, answerID)
	if err != nil {
		return types.ReverseState{}, err
	}
	pool, err := GetQuestionPoolEntries(theme, poolIDs)
	if err != nil {
		return types.ReverseState{}, err
	}
	choices := PickReverseFieldChoices(pool, theme, nil)
	recent := make([]string, len(choices))
	for i, c := range choices {
		recent[i] = c.Field
	}
	return types.ReverseState{
		Reverse: true, FinalGuessUsed: false, FieldChoices: choices,
		RoundHistory: []types.ReverseRoundRecord{}, Phase: "filtering",
		QuestionPoolIds: poolIDs, RecentChoiceFields: recent,
	}, nil
}

// EnsureReverseQuestionPoolIds 补全缺失的池 id。
func EnsureReverseQuestionPoolIds(state types.ReverseState, theme types.Theme, answerID string) (types.ReverseState, error) {
	if len(state.QuestionPoolIds) > 0 {
		return state, nil
	}
	ids, err := PickReverseQuestionPoolIds(theme, answerID)
	if err != nil {
		return state, err
	}
	state.QuestionPoolIds = ids
	return state, nil
}

// ParseReverseState 从 JSON 反序列化逆向状态。
func ParseReverseState(raw string) types.ReverseState {
	fallback := types.ReverseState{
		Reverse: true, FinalGuessUsed: false, FieldChoices: []types.ReverseFieldMeta{},
		RoundHistory: []types.ReverseRoundRecord{}, Phase: "filtering",
		QuestionPoolIds: []string{}, RecentChoiceFields: []string{},
	}
	if raw == "" {
		return fallback
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil || parsed["reverse"] != true {
		return fallback
	}

	state := fallback
	state.FinalGuessUsed = parsed["finalGuessUsed"] == true
	if phase, ok := parsed["phase"].(string); ok && phase == "guessing" {
		state.Phase = "guessing"
	}
	state.QuestionPoolIds = stringSlice(parsed["questionPoolIds"])
	state.RecentChoiceFields = stringSlice(parsed["recentChoiceFields"])

	if choices, ok := parsed["fieldChoices"].([]interface{}); ok {
		for _, c := range choices {
			cm, _ := c.(map[string]interface{})
			state.FieldChoices = append(state.FieldChoices, types.ReverseFieldMeta{
				Field: fmt.Sprintf("%v", cm["field"]),
				Label: fmt.Sprintf("%v", cm["label"]),
				Kind:  fmt.Sprintf("%v", cm["kind"]),
			})
		}
	}
	if len(state.RecentChoiceFields) == 0 {
		for _, c := range state.FieldChoices {
			state.RecentChoiceFields = append(state.RecentChoiceFields, c.Field)
		}
	}
	if hintRaw, ok := parsed["accurateHint"].(map[string]interface{}); ok {
		if field, ok := hintRaw["field"].(string); ok {
			label, _ := hintRaw["label"].(string)
			state.AccurateHint = &types.HintInfo{Field: field, Label: label, Value: hintRaw["value"]}
		}
	}
	return state
}

// ValidateCondition 校验逆向查询条件。
func ValidateCondition(theme types.Theme, condition types.ReverseCondition) string {
	queryable := make(map[string]bool)
	for _, f := range GetReverseQueryableFields(theme) {
		queryable[f] = true
	}
	if !queryable[condition.Field] {
		return "无效字段"
	}
	allowed := GetAllowedOperators(theme, condition.Field)
	okOp := false
	for _, op := range allowed {
		if op == condition.Operator {
			okOp = true
			break
		}
	}
	if !okOp {
		return "无效运算符"
	}
	if IsNumericReverseField(theme, condition.Field) {
		if _, ok := condition.Value.(float64); !ok {
			if _, ok := condition.Value.(int); !ok {
				if reverseToFloat(condition.Value) == 0 && normalizeReverseStr(condition.Value) == "" {
					return "数值字段需要数字"
				}
			}
		}
	} else if normalizeReverseStr(condition.Value) == "" {
		return "请选择有效值"
	}
	return ""
}

// ValidateFieldInChoices 确保字段在当前选项中。
func ValidateFieldInChoices(field string, choices []types.ReverseFieldMeta) string {
	for _, c := range choices {
		if c.Field == field {
			return ""
		}
	}
	return "请从本轮可选字段中挑选"
}

// ReverseQueryOutcome 是提交逆向查询的结果。
type ReverseQueryOutcome struct {
	Matched            bool
	Condition          types.ReverseCondition
	Label              string
	DisplayValue       interface{}
	NewlyEliminatedIds []string
	AliveCount         int
	State              types.ReverseState
	AutoResolved       bool
	RoundScore         int
	AnswerName         string
	AnswerImageURL     *string
}

// SubmitReverseQuery 应用一次逆向筛选查询（核心逻辑来自 gameService.ts）。
func SubmitReverseQuery(
	state types.ReverseState,
	theme types.Theme,
	answer types.CharacterEntry,
	condition types.ReverseCondition,
	queriesBefore []types.ReverseQueryRecord,
	attemptsLeft int,
	compareMove *string,
) (ReverseQueryOutcome, error) {
	if errMsg := ValidateCondition(theme, condition); errMsg != "" {
		return ReverseQueryOutcome{}, fmt.Errorf("%s", errMsg)
	}
	if errMsg := ValidateFieldInChoices(condition.Field, state.FieldChoices); errMsg != "" {
		return ReverseQueryOutcome{}, fmt.Errorf("%s", errMsg)
	}

	poolBefore, err := GetAlivePool(theme, queriesBefore, state.QuestionPoolIds, answer.ID())
	if err != nil {
		return ReverseQueryOutcome{}, err
	}
	poolIDs, err := ResolveQuestionPoolIds(theme, state.QuestionPoolIds, answer.ID())
	if err != nil {
		return ReverseQueryOutcome{}, err
	}
	totalPool := len(poolIDs)

	matched := EvaluateAnswerCondition(answer, condition, theme)
	label := types.GetFieldLabel(theme, condition.Field)
	displayValue := condition.Value
	if f, ok := condition.Value.(float64); ok {
		displayValue = f
	}

	queryRecord := types.ReverseQueryRecord{
		Condition: condition, Matched: matched, Label: label, DisplayValue: displayValue,
	}
	queriesAfter := append(append([]types.ReverseQueryRecord{}, queriesBefore...), queryRecord)
	poolAfter, err := GetAlivePool(theme, queriesAfter, state.QuestionPoolIds, answer.ID())
	if err != nil {
		return ReverseQueryOutcome{}, err
	}
	newlyEliminated := ComputeNewlyEliminated(poolBefore, poolAfter)
	newAttempts := attemptsLeft - 1

	outcome := ReverseQueryOutcome{
		Matched: matched, Condition: condition, Label: label, DisplayValue: displayValue,
		NewlyEliminatedIds: newlyEliminated, AliveCount: len(poolAfter), State: state,
	}

	if len(poolAfter) == 1 {
		score := ScoreReverseAutoDeduce(newAttempts)
		outcome.AutoResolved = true
		outcome.RoundScore = score
		outcome.AliveCount = 1
		outcome.AnswerName = GetDisplayName(answer, theme)
		outcome.AnswerImageURL = GetCharacterImage(answer)
		return outcome, nil
	}

	if newAttempts <= 0 {
		state.Phase = "guessing"
		state.FieldChoices = nil
	} else {
		newChoices := PickReverseFieldChoices(poolAfter, theme, state.RecentChoiceFields)
		queriedFields := make([]string, len(queriesAfter))
		for i, q := range queriesAfter {
			queriedFields[i] = q.Condition.Field
		}
		accurateHint := state.AccurateHint
		if accurateHint == nil && len(queriesAfter) >= types.ReverseAccurateHintAfter {
			exclude := make(map[string]bool)
			for _, c := range newChoices {
				exclude[c.Field] = true
			}
			for _, c := range state.FieldChoices {
				exclude[c.Field] = true
			}
			if hint := BuildReverseAccurateHint(theme, answer, exclude, queriedFields, compareMove); hint != nil {
				accurateHint = hint
			}
		}
		state.Phase = "filtering"
		if len(newChoices) == 0 {
			state.Phase = "guessing"
		}
		state.FieldChoices = newChoices
		state.RecentChoiceFields = make([]string, len(newChoices))
		for i, c := range newChoices {
			state.RecentChoiceFields[i] = c.Field
		}
		state.AccurateHint = accurateHint
	}
	outcome.State = state
	_ = totalPool
	return outcome, nil
}

// GetReverseAccurateHintCandidates 返回可用于精准提示的字段。
func GetReverseAccurateHintCandidates(theme types.Theme) []string {
	base := GetReverseQueryableFields(theme)
	extras := []string{}
	if theme == types.ThemeNBA {
		extras = append(extras, "divisionPosition")
	}
	if theme == types.ThemePokemon {
		extras = append(extras, "weaknessHint")
	}
	return uniqueStrings(append(base, extras...))
}

// BuildReverseAccurateHint 构建一条关于隐藏答案的精准提示。
func BuildReverseAccurateHint(
	theme types.Theme,
	answer types.CharacterEntry,
	excludeFields map[string]bool,
	queriedFields []string,
	compareMove *string,
) *types.HintInfo {
	candidates := []string{}
	for _, f := range GetReverseAccurateHintCandidates(theme) {
		if !excludeFields[f] {
			candidates = append(candidates, f)
		}
	}
	if len(candidates) == 0 {
		return nil
	}
	preferred := []string{}
	for _, f := range candidates {
		queried := false
		for _, q := range queriedFields {
			if q == f {
				queried = true
				break
			}
		}
		if !queried {
			preferred = append(preferred, f)
		}
	}
	pool := candidates
	if len(preferred) > 0 {
		pool = preferred
	}
	shuffled := rngShuffleStrings(pool, NewSeededRng(uint32(len(pool)+17)))
	for _, field := range shuffled {
		hint := BuildProgressiveHintInfo(theme, answer, field, compareMove, nil)
		if hint.Value != nil && fmt.Sprintf("%v", hint.Value) != "" {
			return &hint
		}
	}
	return nil
}

// FinishReverseRoundState 在一轮结束后更新逆向状态。
func FinishReverseRoundState(
	state types.ReverseState,
	theme types.Theme,
	rowQuestionIndex int,
	answer types.CharacterEntry,
	success bool,
	autoDeduced bool,
	score int,
	guessedName *string,
	aliveCount, totalPool int,
) types.ReverseState {
	record := types.ReverseRoundRecord{
		QuestionIndex: rowQuestionIndex, AnswerName: GetDisplayName(answer, theme),
		AnswerID: answer.ID(), ImageURL: GetCharacterImage(answer),
		Success: success, AutoDeduced: autoDeduced, Score: score,
		GuessedName: guessedName, AliveCountAtEnd: aliveCount, TotalPool: totalPool,
	}
	state.FinalGuessUsed = true
	state.Phase = "filtering"
	state.FieldChoices = nil
	state.RoundHistory = append(state.RoundHistory, record)
	return state
}

// ScoreReverseBombGuess 计算逆向最终猜测的回合得分。
func ScoreReverseBombGuess(isCorrect bool, aliveCount, totalPool int) int {
	if isCorrect {
		return ScoreReverseCorrectGuess()
	}
	return ScoreReverseWrongGuess(aliveCount, totalPool)
}

// LoadReverseQueries 从猜测记录读取逆向筛选查询。
func LoadReverseQueries(sessionID string, questionIndex *int) ([]types.ReverseQueryRecord, error) {
	database := db.GetDB()
	rows, err := database.Query(`
		SELECT field_results, question_index FROM guesses
		WHERE session_id = ? ORDER BY id ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var queries []types.ReverseQueryRecord
	for rows.Next() {
		var fieldJSON sql.NullString
		var qIndex int
		if err := rows.Scan(&fieldJSON, &qIndex); err != nil {
			return nil, err
		}
		if questionIndex != nil && qIndex != *questionIndex {
			continue
		}
		if !fieldJSON.Valid || fieldJSON.String == "" {
			continue
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(fieldJSON.String), &parsed); err != nil {
			continue
		}
		if reverse, _ := parsed["reverse"].(bool); !reverse {
			continue
		}
		condRaw, ok := parsed["condition"].(map[string]interface{})
		if !ok {
			continue
		}
		field, _ := condRaw["field"].(string)
		op, _ := condRaw["operator"].(string)
		condition := types.ReverseCondition{
			Field:    field,
			Operator: types.ReverseOperator(op),
			Value:    condRaw["value"],
		}
		matched, _ := parsed["matched"].(bool)
		label, _ := parsed["label"].(string)
		if label == "" {
			label = types.GetFieldLabel(types.ThemeCSGO, field)
		}
		displayValue := parsed["displayValue"]
		if displayValue == nil {
			displayValue = condition.Value
		}
		queries = append(queries, types.ReverseQueryRecord{
			Condition:    condition,
			Matched:      matched,
			Label:        label,
			DisplayValue: displayValue,
		})
	}
	if queries == nil {
		queries = []types.ReverseQueryRecord{}
	}
	return queries, nil
}
