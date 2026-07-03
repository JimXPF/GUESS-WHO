package services

const (
	MaxAttempts      = 10
	DailyMaxAttempts = 20
	ProgressiveLives = 3

	ReverseQueryAttempts        = 5
	ReverseRoundsPerGame        = 3
	ReverseAccurateHintAfter    = 3
	ReverseQuestionPoolSize     = 100
	ReverseScoreCorrectGuess    = 500
	ReverseScoreAutoBase        = 600
	ReverseScoreAutoRemainingBonus = 50

	RelayFieldPoints          = 80
	RelayWrongClaimPenalty    = 25
	RelayFullCorrectMin       = 80
	RelayTurnSeconds          = 30
	RelayTimeoutPenalty       = 50

	BattleQuestionCount         = 10
	BattleIntermissionSeconds   = 5
	BattlePartialPointsPerHit   = 40

	FullCorrectMinScore = 300
)

// BonusHintThresholds — 经典/每日：在第 3、6、9 次尝试时解锁额外提示槽位。
var BonusHintThresholds = []int{3, 6, 9}

// RelayFullCorrectByClaimedCount — 按认领字段数（0→4）的全对奖励。
var RelayFullCorrectByClaimedCount = []int{300, 270, 230, 180, 120}
