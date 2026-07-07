package services

import (
	"testing"

	"guess-who/server-go/internal/types"
)

func hitGuess(fields ...string) types.GuessRecord {
	results := make([]types.FieldCompare, len(fields))
	for i, f := range fields {
		results[i] = types.FieldCompare{Field: f, Result: "hit"}
	}
	return types.GuessRecord{FieldResults: &results}
}

func missGuess() types.GuessRecord {
	results := []types.FieldCompare{{Field: "type1", Result: "miss"}}
	return types.GuessRecord{FieldResults: &results}
}

func TestComputeStableBonusFieldsPreservesUnlockOrder(t *testing.T) {
	queue := []string{"evolutionStage", "eggGroup", "ability"}
	guesses := []types.GuessRecord{
		missGuess(), missGuess(), missGuess(),
		missGuess(), hitGuess("evolutionStage"), missGuess(),
	}

	ctx := bonusHintBuildContext{
		theme:     types.ThemePokemon,
		answer:    types.CharacterEntry{"id": "x", "evolutionStage": "1阶进化", "eggGroup": "矿物", "ability": "坚硬脑袋"},
		hintField: "category",
		activeFields: []string{
			"type1", "evolutionStage", "eggGroup", "ability", "baseStatTotal",
		},
	}

	picked := computeStableBonusFields(queue, "category", 2, guesses, ctx)
	if len(picked) != 2 {
		t.Fatalf("expected 2 bonus fields, got %v", picked)
	}
	if picked[0] != "evolutionStage" {
		t.Fatalf("slot 0 should stay evolutionStage, got %v", picked)
	}
	if picked[1] != "eggGroup" {
		t.Fatalf("slot 1 should be eggGroup, got %v", picked)
	}
}

func TestAssembleUnlockedHintsKeepsHitBonus(t *testing.T) {
	currentHits := map[string]bool{"evolutionStage": true}
	ctx := bonusHintBuildContext{
		theme:     types.ThemePokemon,
		answer:    types.CharacterEntry{"id": "x", "evolutionStage": "1阶进化", "eggGroup": "怪兽"},
		hintField: "eggGroup",
		activeFields: []string{
			"type1", "evolutionStage", "eggGroup", "ability",
		},
	}
	primary := types.HintInfo{Field: "eggGroup", Label: "生蛋群", Value: "怪兽、陆上"}

	hints := assembleUnlockedHints(primary, []string{"evolutionStage"}, ctx, currentHits)
	if len(hints) != 2 {
		t.Fatalf("expected primary + hit bonus kept, got %d: %+v", len(hints), hints)
	}
	if hints[0].Field != "eggGroup" || hints[1].Field != "evolutionStage" {
		t.Fatalf("unexpected order/fields: %+v", hints)
	}
}

func TestCollectHitFieldsUpToAttempts(t *testing.T) {
	guesses := []types.GuessRecord{
		missGuess(),
		hitGuess("eggGroup"),
		hitGuess("evolutionStage"),
	}
	h3 := CollectHitFieldsUpToAttempts(guesses, 3)
	if h3["eggGroup"] != true || h3["evolutionStage"] != true {
		t.Fatalf("expected hits in first 3 attempts, got %v", h3)
	}
	h1 := CollectHitFieldsUpToAttempts(guesses, 1)
	if h1["eggGroup"] || h1["evolutionStage"] {
		t.Fatalf("expected no hits in first attempt only, got %v", h1)
	}
}
