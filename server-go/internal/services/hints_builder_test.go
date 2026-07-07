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

func TestBackfillBonusHintsSkipsHitAndPrefersNotHit(t *testing.T) {
	queue := []string{"evolutionStage", "eggGroup", "ability", "type2"}
	currentHits := map[string]bool{
		"evolutionStage": true,
		"eggGroup":       true,
		"ability":        true,
	}
	ctx := bonusHintBuildContext{
		theme:     types.ThemePokemon,
		answer:    types.CharacterEntry{"id": "x", "evolutionStage": "1阶进化", "eggGroup": "矿物", "ability": "坚硬脑袋", "type2": "岩石"},
		hintField: "category",
		activeFields: []string{
			"type1", "type2", "evolutionStage", "eggGroup", "ability",
		},
	}
	primary := types.HintInfo{Field: "category", Label: "分类", Value: "宝可梦"}

	hints := backfillBonusHints(primary, []string{"evolutionStage", "eggGroup"}, 2, queue, currentHits, ctx)
	if len(hints) != 3 {
		t.Fatalf("expected primary + 2 bonus, got %d hints: %+v", len(hints), hints)
	}
	if hints[0].Field != "category" {
		t.Fatalf("primary should stay first, got %v", hints[0].Field)
	}
	if hints[1].Field != "type2" {
		t.Fatalf("expected backfill type2 first, got %v", hints[1].Field)
	}
	if hints[1].Field == "eggGroup" || hints[1].Field == "ability" {
		t.Fatalf("should not prioritize already-hit queue fields, got %v", hints[1].Field)
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
