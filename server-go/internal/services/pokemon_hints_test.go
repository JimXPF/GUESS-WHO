package services

import (
	"testing"

	"guess-who/server-go/internal/types"
)

func TestFightingNotWeakToPoison(t *testing.T) {
	typesList, chart, err := GetPokemonTypeChartFromConfig()
	if err != nil {
		t.Fatal(err)
	}
	entry := types.CharacterEntry{"id": "primeape", "type1": "格斗", "type2": nil}
	m := GetDefensiveMultiplier([]string{"格斗"}, "毒", chart)
	if m != 1 {
		t.Fatalf("毒打格斗应为 ×1，得到 ×%v", m)
	}
	for _, mu := range GetPokemonTypeMatchups(entry, chart, typesList) {
		if mu.Type == "毒" {
			t.Fatalf("格斗不应出现毒属性弱/抗条目: %+v", mu)
		}
	}
	// 火暴猴真实弱点
	wantWeak := map[string]float64{"飞行": 2, "超能力": 2, "妖精": 2}
	for atk, want := range wantWeak {
		got := GetDefensiveMultiplier([]string{"格斗"}, atk, chart)
		if got != want {
			t.Fatalf("%s打格斗应为 ×%v，得到 ×%v", atk, want, got)
		}
	}
}

func TestFireResistsGrass(t *testing.T) {
	_, chart, err := GetPokemonTypeChartFromConfig()
	if err != nil {
		t.Fatal(err)
	}
	m := GetDefensiveMultiplier([]string{"火"}, "草", chart)
	if m != 0.5 {
		t.Fatalf("草打火应为 ×0.5，得到 ×%v", m)
	}
}

func TestMatchupHintWordingIsDefensive(t *testing.T) {
	cases := []struct {
		m    PokemonTypeMatchup
		want string
	}{
		{PokemonTypeMatchup{Type: "毒", Mult: 2, Kind: "weakness"}, "受到毒属性攻击 *2"},
		{PokemonTypeMatchup{Type: "火", Mult: 4, Kind: "weakness"}, "受到火属性攻击 *4"},
		{PokemonTypeMatchup{Type: "草", Mult: 0.5, Kind: "resistance"}, "受到草属性攻击 *1/2"},
		{PokemonTypeMatchup{Type: "钢", Mult: 0.25, Kind: "resistance"}, "受到钢属性攻击 *1/4"},
		{PokemonTypeMatchup{Type: "一般", Mult: 0, Kind: "resistance"}, "受到一般属性攻击 无效"},
	}
	for _, c := range cases {
		if got := formatMatchupLine(c.m); got != c.want {
			t.Fatalf("got %q want %q", got, c.want)
		}
	}
}
