package services

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"guess-who/server-go/internal/types"
)

// CompareResult 对应 TS 类型：hit | close | miss
type CompareResult string

const (
	Hit   CompareResult = "hit"
	Close CompareResult = "close"
	Miss  CompareResult = "miss"
)

type numericRule struct {
	threshold *float64
	absolute  *float64
}

var numericRules = map[types.Theme]map[string]numericRule{
	types.ThemeCSGO: {
		"age":        {absolute: ptrFloat(2)},
		"rating":     {absolute: ptrFloat(0.08)},
		"top20Count": {absolute: ptrFloat(1)},
	},
	types.ThemeFootball: {
		"age":         {absolute: ptrFloat(2)},
		"marketValue": {threshold: ptrFloat(0.2)},
		"height":      {absolute: ptrFloat(3)},
	},
	types.ThemeNBA: {
		"age":          {absolute: ptrFloat(2)},
		"height":       {absolute: ptrFloat(3)},
		"playoffCount": {absolute: ptrFloat(1)},
	},
	types.ThemePokemon: {
		"baseStatTotal": {absolute: ptrFloat(30)},
		"hp":            {absolute: ptrFloat(15)},
		"attack":        {absolute: ptrFloat(15)},
		"defense":       {absolute: ptrFloat(15)},
		"spAttack":      {absolute: ptrFloat(15)},
		"spDefense":     {absolute: ptrFloat(15)},
		"speed":         {absolute: ptrFloat(15)},
	},
}

var (
	nullableFields    = map[string]bool{"club": true, "school": true, "type2": true}
	nationalityFields = map[string]bool{"nationality": true, "nationalTeam": true}
	positionFields    = map[string]bool{"position": true}
	pokemonStatFields = map[string]bool{
		"baseStatTotal": true, "hp": true, "attack": true, "defense": true,
		"spAttack": true, "spDefense": true, "speed": true,
	}
)

var (
	draftYearRe  = regexp.MustCompile(`(\d{4})年`)
	draftRoundRe = regexp.MustCompile(`(\d{4})年第(\d+)轮`)
)

func ptrFloat(f float64) *float64 { return &f }

func normalizeStr(v any) string {
	if v == nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", v)))
}

func toFloat64(v any) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	case string:
		var f float64
		if _, err := fmt.Sscanf(strings.TrimSpace(val), "%f", &f); err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func toFloat(v any) float64 {
	f, _ := toFloat64(v)
	return f
}

func compareExact(a, b any) CompareResult {
	if normalizeStr(a) == normalizeStr(b) {
		return Hit
	}
	return Miss
}

func compareNumber(guess, answer any, closeThreshold float64, absoluteClose *float64) CompareResult {
	g, gOk := toFloat64(guess)
	a, aOk := toFloat64(answer)
	if !gOk || !aOk {
		return Miss
	}
	if g == a {
		return Hit
	}
	if absoluteClose != nil && absFloat(g-a) <= *absoluteClose {
		return Close
	}
	if a != 0 && absFloat(g-a)/absFloat(a) <= closeThreshold {
		return Close
	}
	absFallback := 1.0
	if absoluteClose != nil {
		absFallback = *absoluteClose
	}
	if a == 0 && absFloat(g) <= absFallback {
		return Close
	}
	return Miss
}

func absFloat(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func positionTokens(pos string) []string {
	raw := strings.TrimSpace(pos)
	if raw == "" {
		return nil
	}
	if strings.Contains(raw, "/") {
		parts := strings.Split(raw, "/")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		return out
	}
	return []string{raw}
}

func getPositionGroup(theme types.Theme, position string) *string {
	groups := GetPositionGroups(theme)
	if len(groups) == 0 {
		return nil
	}
	norm := normalizeStr(position)
	for group, members := range groups {
		for _, m := range members {
			if normalizeStr(m) == norm {
				g := group
				return &g
			}
		}
	}
	for _, token := range positionTokens(position) {
		tokenNorm := normalizeStr(token)
		for group, members := range groups {
			for _, m := range members {
				if normalizeStr(m) == tokenNorm {
					g := group
					return &g
				}
			}
		}
	}
	return nil
}

func comparePosition(theme types.Theme, guess, answer any) CompareResult {
	gFull := normalizeStr(fmt.Sprintf("%v", guess))
	aFull := normalizeStr(fmt.Sprintf("%v", answer))
	if gFull == aFull {
		return Hit
	}
	gTokens := make([]string, 0)
	for _, t := range positionTokens(fmt.Sprintf("%v", guess)) {
		gTokens = append(gTokens, normalizeStr(t))
	}
	aTokens := make([]string, 0)
	for _, t := range positionTokens(fmt.Sprintf("%v", answer)) {
		aTokens = append(aTokens, normalizeStr(t))
	}
	for _, gt := range gTokens {
		for _, at := range aTokens {
			if gt == at {
				return Hit
			}
		}
	}
	gGroup := getPositionGroup(theme, fmt.Sprintf("%v", guess))
	aGroup := getPositionGroup(theme, fmt.Sprintf("%v", answer))
	if gGroup != nil && aGroup != nil && *gGroup == *aGroup {
		return Close
	}
	return Miss
}

func compareNullable(guess, answer any) CompareResult {
	gNull := isEmptyValue(guess)
	aNull := isEmptyValue(answer)
	if gNull && aNull {
		return Hit
	}
	if gNull || aNull {
		return Miss
	}
	return compareExact(guess, answer)
}

func isEmptyValue(v any) bool {
	if v == nil {
		return true
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s) == ""
	}
	return false
}

// ParseDraftYear 从 NBA 选秀字符串提取选秀年份。
func ParseDraftYear(draft any) *int {
	s := fmt.Sprintf("%v", draft)
	m := draftYearRe.FindStringSubmatch(s)
	if len(m) == 2 {
		y := 0
		fmt.Sscanf(m[1], "%d", &y)
		return &y
	}
	return nil
}

func parseDraftRound(draft any) *int {
	s := fmt.Sprintf("%v", draft)
	m := draftRoundRe.FindStringSubmatch(s)
	if len(m) == 3 {
		r := 0
		fmt.Sscanf(m[2], "%d", &r)
		return &r
	}
	return nil
}

func isUndrafted(draft any) bool {
	s := strings.ToLower(fmt.Sprintf("%v", draft))
	return strings.Contains(s, "落选秀") || strings.Contains(s, "undrafted")
}

func compareDraft(guess, answer any) CompareResult {
	g := fmt.Sprintf("%v", guess)
	a := fmt.Sprintf("%v", answer)
	if g == a {
		return Hit
	}
	gu := isUndrafted(g)
	au := isUndrafted(a)
	if gu && au {
		return Hit
	}
	if gu || au {
		return Miss
	}
	gy := ParseDraftYear(g)
	ay := ParseDraftYear(a)
	if gy == nil || ay == nil {
		return compareExact(guess, answer)
	}
	if *gy == *ay {
		gr := parseDraftRound(g)
		ar := parseDraftRound(a)
		if gr != nil && ar != nil && *gr == *ar {
			return Hit
		}
		return Close
	}
	return Miss
}

// GetDraftYearDirection 当答案与猜测的选秀年份不同时返回 later/earlier。
func GetDraftYearDirection(guess, answer any) *string {
	if isUndrafted(guess) || isUndrafted(answer) {
		return nil
	}
	gy := ParseDraftYear(guess)
	ay := ParseDraftYear(answer)
	if gy == nil || ay == nil || *gy == *ay {
		return nil
	}
	if *ay > *gy {
		s := "later"
		return &s
	}
	s := "earlier"
	return &s
}

// GetDraftCompareHint 返回 NBA 选秀对比的 UI 提示文本。
func GetDraftCompareHint(result CompareResult, guess, answer any) *string {
	if result == Hit {
		return nil
	}
	if result == Close {
		s := "轮次不对"
		return &s
	}
	dir := GetDraftYearDirection(guess, answer)
	year := ParseDraftYear(guess)
	if dir == nil || year == nil {
		return nil
	}
	var s string
	if *dir == "later" {
		s = fmt.Sprintf("晚于%d", *year)
	} else {
		s = fmt.Sprintf("早于%d", *year)
	}
	return &s
}

func parseEggGroups(val any) []string {
	parts := strings.Split(fmt.Sprintf("%v", val), "、")
	out := make([]string, 0, len(parts))
	for _, s := range parts {
		s = strings.TrimSpace(s)
		if s != "" && s != "<nil>" {
			out = append(out, s)
		}
	}
	return out
}

// EggGroupCompare 保存生蛋群对比结果及可选提示。
type EggGroupCompare struct {
	Result CompareResult
	Hint   *string
}

// CompareEggGroup 比较宝可梦生蛋群，接近未命中时给出单/双生蛋群提示。
func CompareEggGroup(guessValue, answerValue any) EggGroupCompare {
	g := parseEggGroups(guessValue)
	a := parseEggGroups(answerValue)
	if len(g) == 0 || len(a) == 0 {
		return EggGroupCompare{Result: Miss}
	}
	gKey := strings.Join(sortedCopy(g), "|")
	aKey := strings.Join(sortedCopy(a), "|")
	if gKey == aKey {
		return EggGroupCompare{Result: Hit}
	}
	shared := 0
	for _, x := range g {
		for _, y := range a {
			if x == y {
				shared++
				break
			}
		}
	}
	if shared > 0 && len(g) != len(a) {
		hint := "答案为单蛋群"
		if len(a) >= 2 {
			hint = "答案为双蛋群"
		}
		return EggGroupCompare{Result: Close, Hint: &hint}
	}
	return EggGroupCompare{Result: Miss}
}

func sortedCopy(s []string) []string {
	out := append([]string(nil), s...)
	sort.Strings(out)
	return out
}

// CompareField 比较猜测与答案在某一字段上的值。
func CompareField(theme types.Theme, field string, guessValue, answerValue any) CompareResult {
	if field == "name" {
		return compareExact(guessValue, answerValue)
	}
	if nullableFields[field] {
		return compareNullable(guessValue, answerValue)
	}
	if nationalityFields[field] {
		return CompareNationality(guessValue, answerValue)
	}
	if positionFields[field] {
		return comparePosition(theme, guessValue, answerValue)
	}
	if theme == types.ThemeNBA && field == "draft" {
		return compareDraft(guessValue, answerValue)
	}
	if theme == types.ThemePokemon && field == "eggGroup" {
		return CompareEggGroup(guessValue, answerValue).Result
	}

	if rule, ok := numericRules[theme][field]; ok {
		if _, isStr := guessValue.(string); isStr {
			return compareExact(guessValue, answerValue)
		}
		if _, isStr := answerValue.(string); isStr {
			return compareExact(guessValue, answerValue)
		}
		threshold := 0.0
		if rule.threshold != nil {
			threshold = *rule.threshold
		}
		return compareNumber(guessValue, answerValue, threshold, rule.absolute)
	}

	exact := compareExact(guessValue, answerValue)
	if exact == Hit {
		return Hit
	}
	if field == "team" || field == "club" {
		g := normalizeStr(guessValue)
		a := normalizeStr(answerValue)
		if strings.Contains(g, a) || strings.Contains(a, g) {
			return Close
		}
	}
	return Miss
}

// GetNumericDirection 数值猜测未命中时返回 higher/lower。
func GetNumericDirection(theme types.Theme, field string, guessValue, answerValue any) *string {
	rule, ok := numericRules[theme][field]
	if !ok {
		return nil
	}
	_ = rule
	if _, isStr := guessValue.(string); isStr {
		return nil
	}
	if _, isStr := answerValue.(string); isStr {
		return nil
	}
	g, gOk := toFloat64(guessValue)
	a, aOk := toFloat64(answerValue)
	if !gOk || !aOk || g == a {
		return nil
	}
	var s string
	if g > a {
		s = "higher"
	} else {
		s = "lower"
	}
	return &s
}

// FormatValue 格式化字段值以供展示。
func FormatValue(val any, field ...string) any {
	f := ""
	if len(field) > 0 {
		f = field[0]
	}
	empty := val == nil
	if s, ok := val.(string); ok {
		empty = strings.TrimSpace(s) == ""
	}
	if f == "club" && empty {
		return "无"
	}
	if f == "school" && empty {
		return "无"
	}
	if f == "type2" && empty {
		return "无"
	}
	if empty {
		return nil
	}
	if b, ok := val.(bool); ok {
		if b {
			return "会"
		}
		return "不会"
	}
	switch v := val.(type) {
	case float64:
		if v == float64(int64(v)) {
			return int(v)
		}
		return v
	case int, int64:
		return v
	default:
		return fmt.Sprintf("%v", val)
	}
}

// IsPokemonStatField 判断字段是否为宝可梦种族值字段。
func IsPokemonStatField(field string) bool {
	return pokemonStatFields[field]
}

func guessKnowsMove(entry types.CharacterEntry, move string) bool {
	raw, ok := entry["gen3LevelMoves"]
	if !ok {
		return false
	}
	switch moves := raw.(type) {
	case []string:
		for _, m := range moves {
			if m == move {
				return true
			}
		}
	case []interface{}:
		for _, item := range moves {
			if s, ok := item.(string); ok && s == move {
				return true
			}
		}
	}
	return false
}

// CompareAllFields 比较猜测与答案的全部活跃字段。
func CompareAllFields(
	theme types.Theme,
	guess types.CharacterEntry,
	answer types.CharacterEntry,
	activeFields []string,
	compareMove *string,
) []types.FieldCompare {
	fields := GetThemeFields(theme, activeFields)
	out := make([]types.FieldCompare, 0, len(fields))

	for _, fd := range fields {
		field := fd.Field
		label := fd.Label

		if theme == types.ThemePokemon && field == "learnableMove" {
			knows := false
			if compareMove != nil && *compareMove != "" {
				knows = guessKnowsMove(guess, *compareMove)
			}
			var guessVal any
			if knows {
				guessVal = FormatValue("会")
			} else {
				guessVal = FormatValue("不会")
			}
			answerVal := FormatValue("会")
			result := Miss
			if knows {
				result = Hit
			}
			moveLabel := label
			if compareMove != nil && *compareMove != "" {
				moveLabel = "可学习：" + *compareMove
			}
			var ansOut any
			showAnswer := result == Hit
			if showAnswer {
				ansOut = answerVal
			}
			out = append(out, types.FieldCompare{
				Field: field, Label: moveLabel,
				GuessValue: guessVal, AnswerValue: ansOut,
				Result: string(result), ShowAnswer: showAnswer,
			})
			continue
		}

		var guessCompare, answerCompare any
		if field == "name" {
			guessCompare = GetNameFieldValue(guess, theme)
			answerCompare = GetNameFieldValue(answer, theme)
		} else {
			guessCompare = GetCharacterField(guess, field, theme)
			answerCompare = GetCharacterField(answer, field, theme)
		}

		guessDisplay := guessCompare
		answerDisplay := answerCompare

		if theme == types.ThemeNBA && field == "team" {
			guessDisplay = GetNBATeamDisplay(fmt.Sprintf("%v", guessCompare))
			answerDisplay = GetNBATeamDisplay(fmt.Sprintf("%v", answerCompare))
		}
		if theme == types.ThemeNBA && field == "position" {
			gPos := GetNBAPositionDisplay(fmt.Sprintf("%v", guessCompare))
			aPos := GetNBAPositionDisplay(fmt.Sprintf("%v", answerCompare))
			guessDisplay = gPos.Zh
			answerDisplay = aPos.En
		}

		compareGuess := guessDisplay
		compareAnswer := answerDisplay
		if theme == types.ThemeNBA && field == "position" {
			compareGuess = guessCompare
			compareAnswer = answerCompare
		}

		if theme == types.ThemePokemon && field == "eggGroup" {
			egg := CompareEggGroup(compareGuess, compareAnswer)
			gv := FormatValue(guessDisplay, field)
			av := FormatValue(answerDisplay, field)
			var ansOut any
			if egg.Result == Hit {
				ansOut = av
			}
			out = append(out, types.FieldCompare{
				Field: field, Label: label,
				GuessValue: gv, AnswerValue: ansOut,
				Result: string(egg.Result), ShowAnswer: egg.Result == Hit,
				Hint: egg.Hint,
			})
			continue
		}

		gv := FormatValue(guessDisplay, field)
		av := FormatValue(answerDisplay, field)
		result := CompareField(theme, field, compareGuess, compareAnswer)

		var direction *string
		if result != Hit {
			if theme == types.ThemeNBA && field == "draft" {
				direction = GetDraftYearDirection(compareGuess, compareAnswer)
			} else {
				direction = GetNumericDirection(theme, field, compareGuess, compareAnswer)
			}
		}

		var hint *string
		if theme == types.ThemeNBA && field == "draft" && result != Hit {
			hint = GetDraftCompareHint(result, compareGuess, compareAnswer)
		}

		var ansOut any = av
		if field == "position" && result != Hit {
			ansOut = nil
		}

		out = append(out, types.FieldCompare{
			Field: field, Label: label,
			GuessValue: gv, AnswerValue: ansOut,
			Result: string(result), ShowAnswer: result == Hit,
			Direction: direction, Hint: hint,
		})
	}
	return out
}
