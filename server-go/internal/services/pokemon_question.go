package services

import (
	"guess-who/server-go/internal/types"
)

var pokemonQuestionStatFields = []string{
	"baseStatTotal", "hp", "attack", "defense", "spAttack", "spDefense", "speed",
}

var pokemonOptionalFields = []string{"type2", "evolutionStage", "category", "ability", "eggGroup"}

var pokemonPrimaryHintPool = []string{"category", "ability", "eggGroup", "moveHint", "weaknessHint"}

// PokemonQuestionSetup 是宝可梦专用的题目配置。
type PokemonQuestionSetup struct {
	HintField       string
	ExtraHintFields []string
	ActiveFields    []string
	CompareMove     *string
}

// OrderPokemonActiveFields 将 type2 紧接在 type1 之后。
func OrderPokemonActiveFields(fields []string) []string {
	hasType1, hasType2 := false, false
	for _, f := range fields {
		if f == "type1" {
			hasType1 = true
		}
		if f == "type2" {
			hasType2 = true
		}
	}
	var ordered []string
	if hasType1 {
		ordered = append(ordered, "type1")
	}
	if hasType2 {
		ordered = append(ordered, "type2")
	}
	for _, f := range fields {
		if f != "type1" && f != "type2" {
			ordered = append(ordered, f)
		}
	}
	if len(ordered) == 0 {
		return append([]string{}, fields...)
	}
	return ordered
}

func pickCompareFields(primaryHint string, rng *SeededRng) []string {
	statField := rng.PickOneString(pokemonQuestionStatFields)
	optionalPool := rng.ShuffleStrings(append([]string{}, pokemonOptionalFields...))

	if primaryHint == "moveHint" {
		others := optionalPool
		if len(others) > 3 {
			others = others[:3]
		}
		return OrderPokemonActiveFields(append([]string{"type1", statField, "learnableMove"}, others...))
	}

	if primaryHint == "weaknessHint" {
		others := optionalPool
		if len(others) > 4 {
			others = others[:4]
		}
		return OrderPokemonActiveFields(append([]string{"type1", statField}, others...))
	}

	others := optionalPool
	if len(others) > 4 {
		others = others[:4]
	}
	fields := OrderPokemonActiveFields(append([]string{"type1", statField}, others...))
	found := false
	for _, f := range fields {
		if f == primaryHint {
			found = true
			break
		}
	}
	if !found {
		fields = OrderPokemonActiveFields(append(fields, primaryHint))
	}
	return fields
}

// BuildPokemonQuestion 组装宝可梦对比字段与提示队列。
func BuildPokemonQuestion(answer types.CharacterEntry, rng *SeededRng) PokemonQuestionSetup {
	if rng == nil {
		rng = NewSeededRng(1)
	}
	primaryHint := rng.PickOneString(pokemonPrimaryHintPool)
	activeFields := pickCompareFields(primaryHint, rng)

	var compareMove *string
	if primaryHint == "moveHint" {
		compareMove = PickCompareMove(answer, rng)
	}

	bonusPool := rng.ShuffleStrings(filterString(primaryHint, GetPokemonBonusHintFields(activeFields)))
	extra := bonusPool
	if len(extra) > 3 {
		extra = extra[:3]
	}

	return PokemonQuestionSetup{
		HintField:       primaryHint,
		ExtraHintFields: extra,
		ActiveFields:    activeFields,
		CompareMove:     compareMove,
	}
}

func filterString(exclude string, fields []string) []string {
	var out []string
	for _, f := range fields {
		if f != exclude {
			out = append(out, f)
		}
	}
	return out
}
