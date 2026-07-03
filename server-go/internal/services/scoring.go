package services

import "math"

// ScoreForQuestion 根据已用尝试次数返回完全答对的得分。
func ScoreForQuestion(attemptsUsed int) int {
	var score int
	switch {
	case attemptsUsed <= 1:
		score = 500
	case attemptsUsed == 2:
		score = 420
	case attemptsUsed == 3:
		score = 340
	default:
		score = 340 - (attemptsUsed-3)*55
	}
	if score < FullCorrectMinScore {
		score = FullCorrectMinScore
	}
	return score
}

// ScoreReverseCorrectGuess 是逆向轰炸模式最终猜对的固定得分。
func ScoreReverseCorrectGuess() int {
	return ReverseScoreCorrectGuess
}

// ScoreReverseWrongGuess 根据淘汰进度对错误的最终猜测计分。
func ScoreReverseWrongGuess(aliveCount, totalPool int) int {
	if totalPool <= 0 {
		return 0
	}
	ratio := 1.0 - float64(aliveCount)/float64(totalPool)
	return int(math.Round(100 + ratio*350))
}

// ScoreReverseAutoDeduce 对推断出唯一剩余候选计分。
func ScoreReverseAutoDeduce(attemptsRemaining int) int {
	bonus := attemptsRemaining
	if bonus < 0 {
		bonus = 0
	}
	return ReverseScoreAutoBase + bonus*ReverseScoreAutoRemainingBonus
}

// ComputeRelayFullCorrectBonus 按认领字段数返回接龙全对奖励。
func ComputeRelayFullCorrectBonus(claimedFieldCount int) int {
	n := claimedFieldCount
	if n < 0 {
		n = 0
	}
	if n >= len(RelayFullCorrectByClaimedCount) {
		return RelayFullCorrectMin
	}
	return RelayFullCorrectByClaimedCount[n]
}

// CountUnlockedBonusHints 返回 questionAttempts 时已解锁的额外提示槽位数。
func CountUnlockedBonusHints(questionAttempts int) int {
	count := 0
	for _, t := range BonusHintThresholds {
		if questionAttempts >= t {
			count++
		}
	}
	return count
}
