package services

import (
	"strings"
	"testing"
	"unicode"

	"guess-who/server-go/internal/types"
)

func labelsOf(results []SearchResult) []string {
	out := make([]string, len(results))
	for i, r := range results {
		out[i] = r.Label
	}
	return out
}

func startsWithHanPrefix(label, prefix string) bool {
	return strings.HasPrefix(label, prefix)
}

func TestSearchCharactersPriorityChineseOverAlias(t *testing.T) {
	results, err := SearchCharacters(types.ThemePokemon, "阿", 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) == 0 {
		t.Fatal("expected results for 阿")
	}
	// 中文正式名以「阿」开头的应全部排在「仅别称含阿」的条目之前
	sawNonPrefix := false
	for _, r := range results {
		if startsWithHanPrefix(r.Label, "阿") {
			if sawNonPrefix {
				t.Fatalf("chinese 阿* should rank before alias-only hits, got %v", labelsOf(results))
			}
			continue
		}
		sawNonPrefix = true
	}
	if !startsWithHanPrefix(results[0].Label, "阿") {
		t.Fatalf("want chinese 阿* first, got %v", labelsOf(results))
	}
}

func TestSearchCharactersPriorityPinyinOverEnglish(t *testing.T) {
	results, err := SearchCharacters(types.ThemePokemon, "a", 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) == 0 {
		t.Fatal("expected results for a")
	}
	// 正式名拼音前缀 a（傲/安/爱/阿…）应优先于纯英文 Aron/Abra
	full, _ := toPinyinForms(results[0].Label)
	if full == "" || full[0] != 'a' {
		t.Fatalf("want official-name pinyin starting with a first, got %v (pinyin=%q)", labelsOf(results), full)
	}
	aronIdx, absolLike := -1, -1
	for i, r := range results {
		if r.Label == "可可多拉" {
			aronIdx = i
		}
		if strings.HasPrefix(r.Label, "阿") {
			if absolLike < 0 {
				absolLike = i
			}
		}
	}
	if aronIdx >= 0 && absolLike >= 0 && aronIdx < absolLike {
		t.Fatalf("英文 Aron 不应排在拼音 阿* 之前: %v", labelsOf(results))
	}
}

func TestSearchCharactersCSGOEnglishIDStillWorks(t *testing.T) {
	results, err := SearchCharacters(types.ThemeCSGO, "apex", 5)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, r := range results {
		if strings.EqualFold(r.ID, "apex") || strings.Contains(strings.ToLower(r.Label), "apex") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("CSGO english id search should still find apEX, got %v", labelsOf(results))
	}
}

func TestSearchCharactersCSGOSingleLetter(t *testing.T) {
	results, err := SearchCharacters(types.ThemeCSGO, "a", 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) == 0 {
		t.Fatal("CSGO single-letter english prefix should still return players")
	}
	for _, r := range results {
		label := strings.ToLower(r.Label)
		id := strings.ToLower(r.ID)
		if !strings.HasPrefix(label, "a") && !strings.HasPrefix(id, "a") {
			// 允许展示名大小写差异，但 id/label 归一后应以 a 开头
			ok := false
			for _, ch := range label {
				if unicode.IsLetter(ch) {
					ok = ch == 'a'
					break
				}
			}
			if !ok {
				t.Fatalf("unexpected CSGO hit for query a: id=%s label=%s all=%v", r.ID, r.Label, labelsOf(results))
			}
		}
	}
}

func TestIsCharSubsequenceUTF8(t *testing.T) {
	if !isCharSubsequence("阿勃梭鲁", "阿勃") {
		t.Fatal("expected UTF-8 subsequence match")
	}
	if isCharSubsequence("肯泰罗", "阿") {
		t.Fatal("肯泰罗 should not subsequence-match 阿")
	}
}
