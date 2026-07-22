package services

import (
	"fmt"
	"math"

	"guess-who/server-go/internal/types"
)

// 宝可梦属性克制与弱/抗逻辑（移植自 pokemonHints.ts）
// 逆向轰炸的 pokemonWeakTo / pokemonResistTo 与 weaknessHint 依赖此逻辑。

var multSnap = []float64{0, 0.25, 0.5, 1, 2, 4}

func snapMultiplier(mult float64) float64 {
	for _, s := range multSnap {
		if math.Abs(mult-s) < 1e-5 {
			return s
		}
	}
	return mult
}

// GetDefensiveMultiplier 计算属性克制倍率的乘积。
// defenderTypes 例如 ["草", "钢"]，attackType 例如 "火"
func GetDefensiveMultiplier(defenderTypes []string, attackType string, typeChart map[string]map[string]float64) float64 {
	mult := 1.0
	for _, def := range defenderTypes {
		if row, ok := typeChart[def]; ok {
			if m, ok := row[attackType]; ok {
				mult *= m
			}
		}
	}
	return snapMultiplier(mult)
}

type PokemonTypeMatchup struct {
	Type string
	Mult float64
	Kind string // 种类："weakness" | "resistance"
}

func GetPokemonTypeMatchups(entry types.CharacterEntry, typeChart map[string]map[string]float64, allTypes []string) []PokemonTypeMatchup {
	t1 := fmt.Sprintf("%v", entry["type1"])
	t2 := fmt.Sprintf("%v", entry["type2"])
	defs := []string{}
	if t1 != "" {
		defs = append(defs, t1)
	}
	if t2 != "" {
		defs = append(defs, t2)
	}
	if len(defs) == 0 {
		return nil
	}

	var res []PokemonTypeMatchup
	for _, atk := range allTypes {
		m := GetDefensiveMultiplier(defs, atk, typeChart)
		if m == 1 {
			continue
		}
		kind := "resistance"
		if m > 1 {
			kind = "weakness"
		}
		res = append(res, PokemonTypeMatchup{Type: atk, Mult: m, Kind: kind})
	}
	return res
}

func PokemonEntryMatchupFlags(entry types.CharacterEntry, attackType string, typeChart map[string]map[string]float64) (weak, resist bool) {
	t1 := fmt.Sprintf("%v", entry["type1"])
	t2 := fmt.Sprintf("%v", entry["type2"])
	defs := []string{}
	if t1 != "" {
		defs = append(defs, t1)
	}
	if t2 != "" {
		defs = append(defs, t2)
	}
	m := GetDefensiveMultiplier(defs, attackType, typeChart)
	return m > 1, m < 1
}

// 供逆向轰炸 pokemonWeakTo / pokemonResistTo 使用
func PokemonCardSatisfiesMatchupCondition(entry types.CharacterEntry, field string, operator string, attackType string, typeChart map[string]map[string]float64) bool {
	weak, resist := PokemonEntryMatchupFlags(entry, attackType, typeChart)
	truth := false
	if field == "pokemonWeakTo" {
		truth = weak
	} else if field == "pokemonResistTo" {
		truth = resist
	}
	if operator == "==" {
		return truth
	}
	if operator == "!=" {
		return !truth
	}
	return false
}

func FormatResistanceMultiplier(mult float64) string {
	if mult == 0 {
		return "无效"
	}
	if mult == 0.5 {
		return "1/2"
	}
	if mult == 0.25 {
		return "1/4"
	}
	if mult > 0 && mult < 1 {
		for _, n := range []int{2, 3, 4, 8} {
			if math.Abs(mult-1/float64(n)) < 1e-5 {
				return fmt.Sprintf("1/%d", n)
			}
		}
	}
	return fmt.Sprintf("%.2f", mult)
}

const (
	PokemonReverseWeakField   = "pokemonWeakTo"
	PokemonReverseResistField = "pokemonResistTo"
)

func GetPokemonMatchupHintTypes(entry types.CharacterEntry, typeChart map[string]map[string]float64, allTypes []string) []string {
	matchups := GetPokemonTypeMatchups(entry, typeChart, allTypes)
	out := make([]string, 0, len(matchups))
	for _, m := range matchups {
		out = append(out, m.Type)
	}
	return out
}

func ShouldShowWeaknessHint(hitFields map[string]bool) bool {
	return !hitFields["type1"] && !hitFields["type2"]
}

func CollectProgressivePokemonTypeHits(satisfiedFields []string) map[string]bool {
	hit := make(map[string]bool)
	for _, f := range satisfiedFields {
		if f == "type1" || f == "type2" {
			hit[f] = true
		}
	}
	return hit
}

func GetPokemonBonusHintFields(activeFields []string) []string {
	excluded := map[string]bool{
		"name": true, "id": true, "aliases": true, "displayName": true,
		"imageUrl": true, "englishName": true, "xhsPlayerId": true,
		"dexNumber": true, "hiddenAbility": true, "gen3LevelMoves": true,
	}
	var pool []string
	for _, f := range activeFields {
		if !excluded[f] && f != "learnableMove" {
			pool = append(pool, f)
		}
	}
	for _, f := range activeFields {
		if f == "learnableMove" {
			pool = append(pool, "moveHint")
			break
		}
	}
	pool = append(pool, "weaknessHint")
	return pool
}

func GuessKnowsMove(entry types.CharacterEntry, move string) bool {
	raw, ok := entry["gen3LevelMoves"].([]interface{})
	if !ok {
		return false
	}
	for _, m := range raw {
		if fmt.Sprintf("%v", m) == move {
			return true
		}
	}
	return false
}

func BuildPokemonHint(answer types.CharacterEntry, hintField string, compareMove *string) types.HintInfo {
	if hintField == "moveHint" {
		move := compareMove
		if move == nil || *move == "" {
			if picked := pickCompareMove(answer, nil); picked != "" {
				move = &picked
			}
		}
		var val interface{}
		if move != nil {
			val = *move
		}
		return types.HintInfo{Field: "moveHint", Label: "可学会招式", Value: val}
	}
	if hintField == "weaknessHint" {
		typesList, chart, err := getPokemonTypeChartData()
		val := interface{}(nil)
		if err == nil {
			if v := FormatPokemonTypeMatchupHintValue(answer, chart, typesList); v != "" {
				val = v
			}
		}
		return types.HintInfo{Field: "weaknessHint", Label: "属性相克", Value: val}
	}
	val := answer[hintField]
	if val == nil || val == "" {
		val = nil
	}
	return types.HintInfo{
		Field: hintField,
		Label: types.GetFieldLabel(types.ThemePokemon, hintField),
		Value: val,
	}
}

func pickCompareMove(answer types.CharacterEntry, rng *SeededRng) string {
	raw, ok := answer["gen3LevelMoves"].([]interface{})
	if !ok || len(raw) == 0 {
		return ""
	}
	idx := 0
	if rng != nil {
		idx = rng.NextInt(len(raw))
	}
	return fmt.Sprintf("%v", raw[idx])
}

func IsPokemonReverseMatchupField(field string) bool {
	return field == PokemonReverseWeakField || field == PokemonReverseResistField
}

func PokemonMatchupFieldHasDiscrimination(pool []types.CharacterEntry, kind string, typeChart map[string]map[string]float64, allTypes []string) bool {
	for _, atk := range allTypes {
		hasYes, hasNo := false, false
		for _, card := range pool {
			weak, resist := PokemonEntryMatchupFlags(card, atk, typeChart)
			matches := kind == "weak" && weak
			if kind == "resist" {
				matches = resist
			}
			if matches {
				hasYes = true
			} else {
				hasNo = true
			}
			if hasYes && hasNo {
				return true
			}
		}
	}
	return false
}

func GetPokemonReverseMatchupValues(alivePool []types.CharacterEntry, kind string, typeChart map[string]map[string]float64, allTypes []string) []string {
	var values []string
	for _, atk := range allTypes {
		hasYes, hasNo := false, false
		for _, card := range alivePool {
			weak, resist := PokemonEntryMatchupFlags(card, atk, typeChart)
			matches := kind == "weak" && weak
			if kind == "resist" {
				matches = resist
			}
			if matches {
				hasYes = true
			} else {
				hasNo = true
			}
		}
		if hasYes && hasNo {
			values = append(values, atk)
		}
	}
	return values
}

// formatMatchupMultiplier 统一倍率展示：*2 / *4 / *1/2 / *1/4 / 无效
func formatMatchupMultiplier(mult float64) string {
	if mult == 0 {
		return "无效"
	}
	if mult > 1 {
		if mult == float64(int(mult)) {
			return fmt.Sprintf("*%d", int(mult))
		}
		return fmt.Sprintf("*%v", mult)
	}
	return "*" + FormatResistanceMultiplier(mult)
}

func formatMatchupLine(m PokemonTypeMatchup) string {
	// 语义：该属性攻击打中本题宝可梦时的倍率
	return fmt.Sprintf("受到%s属性攻击 %s", m.Type, formatMatchupMultiplier(m.Mult))
}

// FormatPokemonTypeMatchupHintValue 从该宝可梦的全部弱/抗中随机抽取一条展示（同题稳定）。
func FormatPokemonTypeMatchupHintValue(entry types.CharacterEntry, typeChart map[string]map[string]float64, allTypes []string) string {
	matchups := GetPokemonTypeMatchups(entry, typeChart, allTypes)
	if len(matchups) == 0 {
		return ""
	}
	rng := NewSeededRng(HashStringToSeed(entry.ID() + ":weaknessHint"))
	pick := matchups[rng.NextInt(len(matchups))]
	return formatMatchupLine(pick)
}

func IsPokemonHintFieldExcluded(field string) bool {
	excluded := map[string]bool{
		"dexNumber": true, "hiddenAbility": true, "color": true, "captureTier": true,
		"gen3LevelMoves": true, "learnableMove": true, "imageUrl": true,
		"englishName": true, "aliases": true,
	}
	return excluded[field]
}

func BuildPokemonMoveHint(answer types.CharacterEntry) types.HintInfo {
	raw, ok := answer["gen3LevelMoves"].([]interface{})
	var move interface{}
	if ok && len(raw) > 0 {
		idx := NewSeededRng(HashStringToSeed(answer.ID())).NextInt(len(raw))
		move = fmt.Sprintf("%v", raw[idx])
	}
	return types.HintInfo{Field: "moveHint", Label: "可学会招式", Value: move}
}

func BuildPokemonWeaknessHint(answer types.CharacterEntry) types.HintInfo {
	typesList, chart, err := getPokemonTypeChartData()
	value := interface{}(nil)
	if err == nil {
		if v := FormatPokemonTypeMatchupHintValue(answer, chart, typesList); v != "" {
			value = v
		}
	}
	return types.HintInfo{Field: "weaknessHint", Label: "属性相克", Value: value}
}

func PickCompareMove(answer types.CharacterEntry, rng *SeededRng) *string {
	picked := pickCompareMove(answer, rng)
	if picked == "" {
		return nil
	}
	return &picked
}
