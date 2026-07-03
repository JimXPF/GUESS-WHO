package services

import (
	"strconv"

	"guess-who/server-go/internal/types"
)

// RelayFieldClaims 将字段名映射到认领该字段的玩家。
type RelayFieldClaims map[string]types.FieldClaim

// RelayScoreResult 是一次接龙猜测计分的结果。
type RelayScoreResult struct {
	ScoreDelta  int
	NewClaims   RelayFieldClaims
	Breakdown   []types.FieldClaim
	FullCorrect bool
}

// InitRelayClaims 返回空的接龙认领映射。
func InitRelayClaims() RelayFieldClaims {
	return RelayFieldClaims{}
}

// ParseRelayClaims 解析认领映射，nil 时返回空映射。
func ParseRelayClaims(raw RelayFieldClaims) RelayFieldClaims {
	if raw == nil {
		return InitRelayClaims()
	}
	return raw
}

// ScoreRelayGuess 根据已有字段认领对接龙猜测计分。
func ScoreRelayGuess(
	theme types.Theme,
	fieldResults []types.FieldCompare,
	isCorrect bool,
	claims RelayFieldClaims,
	sessionID, playerName string,
	roundNumber int,
) RelayScoreResult {
	scoreDelta := 0
	breakdown := []types.FieldClaim{}
	newClaims := RelayFieldClaims{}
	for k, v := range claims {
		newClaims[k] = v
	}

	if isCorrect {
		claimedCount := len(claims)
		fullBonus := ComputeRelayFullCorrectBonus(claimedCount)
		scoreDelta += fullBonus
		label := "完全猜对"
		if claimedCount > 0 {
			label = "完全猜对（已认领 " + strconv.Itoa(claimedCount) + " 字段）"
		}
		breakdown = append(breakdown, types.FieldClaim{
			SessionID:  sessionID,
			PlayerName: playerName,
			Round:      roundNumber,
			Points:     fullBonus,
			Field:      "__full__",
			FieldLabel: label,
		})
		return RelayScoreResult{
			ScoreDelta:  scoreDelta,
			NewClaims:   newClaims,
			Breakdown:   breakdown,
			FullCorrect: true,
		}
	}

	for _, fr := range fieldResults {
		fieldLabel := fr.Label
		if fieldLabel == "" {
			fieldLabel = types.GetFieldLabel(theme, fr.Field)
		}
		wasClaimed := claims[fr.Field].SessionID != ""

		if fr.Result == "hit" {
			if _, ok := claims[fr.Field]; !ok {
				scoreDelta += RelayFieldPoints
				claim := types.FieldClaim{
					SessionID:  sessionID,
					PlayerName: playerName,
					Round:      roundNumber,
					Points:     RelayFieldPoints,
					Field:      fr.Field,
					FieldLabel: fieldLabel,
				}
				newClaims[fr.Field] = claim
				breakdown = append(breakdown, claim)
			}
		} else if wasClaimed {
			scoreDelta -= RelayWrongClaimPenalty
			breakdown = append(breakdown, types.FieldClaim{
				SessionID:  sessionID,
				PlayerName: playerName,
				Round:      roundNumber,
				Points:     -RelayWrongClaimPenalty,
				Field:      fr.Field,
				FieldLabel: fieldLabel + "（已认领·答错）",
			})
		}
	}

	return RelayScoreResult{
		ScoreDelta:  scoreDelta,
		NewClaims:   newClaims,
		Breakdown:   breakdown,
		FullCorrect: false,
	}
}

// ApplyClaimsToFieldResults 为字段对比结果标注认领归属。
func ApplyClaimsToFieldResults(fieldResults []types.FieldCompare, claims RelayFieldClaims) []types.FieldCompare {
	out := make([]types.FieldCompare, len(fieldResults))
	for i, fr := range fieldResults {
		out[i] = fr
		if claim, ok := claims[fr.Field]; ok {
			name := claim.PlayerName
			out[i].ClaimedBy = &name
		}
	}
	return out
}

// ClaimsToList 将所有认领转为切片返回。
func ClaimsToList(claims RelayFieldClaims) []types.FieldClaim {
	out := make([]types.FieldClaim, 0, len(claims))
	for _, c := range claims {
		out = append(out, c)
	}
	return out
}
