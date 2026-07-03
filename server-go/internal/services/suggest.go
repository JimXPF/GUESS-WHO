package services

import "guess-who/server-go/internal/types"

// SuggestResult 联想搜索下拉项。
type SuggestResult struct {
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	Sublabel *string `json:"sublabel,omitempty"`
}

// SuggestCharacters 返回猜题输入框的联想结果（委托完整搜索逻辑）。
func SuggestCharacters(theme types.Theme, q string) []SuggestResult {
	results, err := SearchCharacters(theme, q, 8)
	if err != nil || len(results) == 0 {
		return []SuggestResult{}
	}
	out := make([]SuggestResult, len(results))
	for i, r := range results {
		out[i] = SuggestResult{ID: r.ID, Label: r.Label, Sublabel: r.Sublabel}
	}
	return out
}
