package types

// Theme 表示四种支持的游戏主题。
type Theme string

const (
	ThemeCSGO     Theme = "csgo"
	ThemeFootball Theme = "football"
	ThemeNBA      Theme = "nba"
	ThemePokemon  Theme = "pokemon"
)

// GameMode 表示所有支持的游戏模式。
type GameMode string

const (
	ModeClassicSix  GameMode = "classic-six"
	ModeDailyOne    GameMode = "daily-one"
	ModeProgressive GameMode = "progressive-hint"
	ModeReverseBomb GameMode = "reverse-bomb"
	ModeBattle      GameMode = "battle"
	ModeRelayChain  GameMode = "relay-chain"
)

// SessionStatus 表示游戏会话的生命周期状态。
type SessionStatus string

const (
	StatusPlaying      SessionStatus = "playing"
	StatusQuestionDone SessionStatus = "question_done"
	StatusGameOver     SessionStatus = "game_over"
	StatusQuit         SessionStatus = "quit"
	StatusFailed       SessionStatus = "failed"
)

// ReverseOperator 用于逆向轰炸模式的筛选。
type ReverseOperator string

const (
	OpGTE ReverseOperator = ">="
	OpLTE ReverseOperator = "<="
	OpEQ  ReverseOperator = "=="
	OpNE  ReverseOperator = "!="
)

// 游戏常量（与 client/src/types.ts 对齐）。
const (
	ProgressiveLives                = 3
	ReverseQueryAttempts            = 5
	ReverseRoundsPerGame            = 3
	ReverseAccurateHintAfter        = 3
	ReverseQuestionPoolSize         = 100
	ReverseScoreCorrectGuess        = 500
	ReverseScoreAutoBase            = 600
	ReverseScoreAutoRemainingBonus  = 50
)

// CharacterEntry 是从主题 JSON 加载的动态记录。
type CharacterEntry map[string]any

func (c CharacterEntry) ID() string           { return getString(c, "id") }
func (c CharacterEntry) Name() string         { return getString(c, "name") }
func (c CharacterEntry) Get(field string) any { return c[field] }

func getString(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// HintInfo 是展示给玩家的单条提示。
type HintInfo struct {
	Field string      `json:"field"`
	Label string      `json:"label"`
	Value interface{} `json:"value"`
}

// FieldCompare 是猜测与答案之间某一字段的对比结果。
type FieldCompare struct {
	Field       string      `json:"field"`
	Label       string      `json:"label"`
	GuessValue  interface{} `json:"guessValue"`
	AnswerValue interface{} `json:"answerValue"`
	Result      string      `json:"result"`
	ShowAnswer  bool        `json:"showAnswer"`
	Direction   *string     `json:"direction,omitempty"`
	Hint        *string     `json:"hint,omitempty"`
	ClaimedBy   *string     `json:"claimedBy,omitempty"`
}

// GuessRecord 存储一次猜测尝试。
type GuessRecord struct {
	ID            int64           `json:"id"`
	GuessName     string          `json:"guessName"`
	GuessID       *string         `json:"guessId"`
	IsCorrect     bool            `json:"isCorrect"`
	FieldResults  *[]FieldCompare `json:"fieldResults"`
	CreatedAt     string          `json:"createdAt"`
	QuestionIndex int             `json:"questionIndex"`
	ImageURL      *string         `json:"imageUrl,omitempty"`
	ScoreDelta    *int            `json:"scoreDelta,omitempty"`
}

// CorrectAnswerRecord 在题目答对时存储。
type CorrectAnswerRecord struct {
	GuessName     string         `json:"guessName"`
	GuessID       string         `json:"guessId"`
	ImageURL      *string        `json:"imageUrl"`
	QuestionIndex int            `json:"questionIndex"`
	FieldResults  []FieldCompare `json:"fieldResults,omitempty"`
}

// ProgressiveHintCheck 记录逐步提示模式下一次猜测的提示判定。
type ProgressiveHintCheck struct {
	Field       string `json:"field"`
	Label       string `json:"label"`
	FieldLabel  string `json:"fieldLabel"`
	TargetValue string `json:"targetValue"`
	GuessValue  string `json:"guessValue"`
	Hit         bool   `json:"hit"`
}

// ProgressiveGuessEntry 存储逐步提示模式下的一次猜测。
type ProgressiveGuessEntry struct {
	GuessName   string                 `json:"guessName"`
	GuessID     *string                `json:"guessId"`
	ImageURL    *string                `json:"imageUrl,omitempty"`
	HintChecks  []ProgressiveHintCheck `json:"hintChecks"`
	AllHintsHit bool                   `json:"allHintsHit"`
	LivesLost   bool                   `json:"livesLost"`
	IsCorrect   bool                   `json:"isCorrect"`
}

// ProgressiveRound 表示一条已解锁提示及其猜测记录。
type ProgressiveRound struct {
	HintIndex int                     `json:"hintIndex"`
	Hint      HintInfo                `json:"hint"`
	Guesses   []ProgressiveGuessEntry `json:"guesses"`
}

// ProgressiveState 是逐步提示模式的状态机。
type ProgressiveState struct {
	Lives                int                `json:"lives"`
	HintFields           []string           `json:"hintFields"`
	Hints                []HintInfo         `json:"hints"`
	PendingQueue         []string           `json:"pendingQueue"`
	SatisfiedFields      []string           `json:"satisfiedFields,omitempty"`
	QuestionAttempts     int                `json:"questionAttempts"`
	Rounds               []ProgressiveRound `json:"rounds"`
	FootballPrimaryField *string            `json:"footballPrimaryField,omitempty"`
}

// ReverseCondition 是逆向轰炸模式下的单条筛选条件。
type ReverseCondition struct {
	Field    string          `json:"field"`
	Operator ReverseOperator `json:"operator"`
	Value    interface{}     `json:"value"`
}

// ReverseQueryRecord 存储一次逆向筛选查询及其结果。
type ReverseQueryRecord struct {
	Condition    ReverseCondition `json:"condition"`
	Matched      bool             `json:"matched"`
	Label        string           `json:"label"`
	DisplayValue interface{}      `json:"displayValue"`
}

// ReverseFieldMeta 描述可选择的逆向筛选字段。
type ReverseFieldMeta struct {
	Field string `json:"field"`
	Label string `json:"label"`
	Kind  string `json:"kind"` // 取值："enum" | "numeric"
}

// ReverseValuesResponse 是逆向字段可选值的响应载荷。
type ReverseValuesResponse struct {
	Kind   string   `json:"kind"`
	Values []string `json:"values,omitempty"`
	Min    float64  `json:"min,omitempty"`
	Max    float64  `json:"max,omitempty"`
}

// PlayableCardSummary 是逆向轰炸 UI 中展示的轻量卡片。
type PlayableCardSummary struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	ImageURL *string `json:"imageUrl"`
}

// ReverseRoundRecord 汇总逆向轰炸模式下一轮的结局。
type ReverseRoundRecord struct {
	QuestionIndex   int     `json:"questionIndex"`
	AnswerName      string  `json:"answerName"`
	AnswerID        string  `json:"answerId"`
	ImageURL        *string `json:"imageUrl"`
	Success         bool    `json:"success"`
	AutoDeduced     bool    `json:"autoDeduced,omitempty"`
	Score           int     `json:"score"`
	GuessedName     *string `json:"guessedName,omitempty"`
	AliveCountAtEnd int     `json:"aliveCountAtEnd"`
	TotalPool       int     `json:"totalPool"`
}

// ReverseState 是逆向轰炸模式的状态机。
type ReverseState struct {
	Reverse            bool                 `json:"reverse"`
	FinalGuessUsed     bool                 `json:"finalGuessUsed"`
	FieldChoices       []ReverseFieldMeta   `json:"fieldChoices"`
	RoundHistory       []ReverseRoundRecord `json:"roundHistory"`
	Phase              string               `json:"phase"` // 阶段："filtering" | "guessing"
	QuestionPoolIds    []string             `json:"questionPoolIds"`
	RecentChoiceFields []string             `json:"recentChoiceFields,omitempty"`
	AccurateHint       *HintInfo            `json:"accurateHint,omitempty"`
}

// QuestionSetup 描述一道题的提示配置。
type QuestionSetup struct {
	AnswerID        string   `json:"answerId"`
	HintField       string   `json:"hintField"`
	ExtraHintFields []string `json:"extraHintFields"`
	ActiveFields    []string `json:"activeFields"`
	CompareMove     *string  `json:"compareMove"`
}

// RevealedAnswer 在会话结束且未猜对时展示。
type RevealedAnswer struct {
	Name     string  `json:"name"`
	ImageURL *string `json:"imageUrl"`
}

// GuessResponse 是提交猜测后的响应。
type GuessResponse struct {
	Session       GameSession     `json:"session"`
	NotInBank     bool            `json:"notInBank,omitempty"`
	Message       string          `json:"message,omitempty"`
	CorrectAnswer *RevealedAnswer `json:"correctAnswer,omitempty"`
}

// ReverseQueryResponse 是提交逆向筛选查询后的响应。
type ReverseQueryResponse struct {
	Matched            bool                 `json:"matched"`
	Condition          ReverseCondition     `json:"condition"`
	Label              string               `json:"label"`
	DisplayValue       interface{}          `json:"displayValue"`
	NewlyEliminatedIds []string             `json:"newlyEliminatedIds"`
	AliveCount         int                  `json:"aliveCount"`
	Session            GameSession          `json:"session"`
	AutoResolved       bool                 `json:"autoResolved,omitempty"`
	RoundScore         int                  `json:"roundScore,omitempty"`
	Answer             *RevealedAnswer      `json:"answer,omitempty"`
}

// DailyTodayInfo 描述今日每日挑战的状态。
type DailyTodayInfo struct {
	ChallengeDate string        `json:"challengeDate"`
	Theme         Theme         `json:"theme"`
	Completed     bool          `json:"completed"`
	InProgress    bool          `json:"inProgress,omitempty"`
	SessionID     *string       `json:"sessionId,omitempty"`
	Status        SessionStatus `json:"status,omitempty"`
	BestAttempts  *int          `json:"bestAttempts,omitempty"`
	BestElapsedUs *int64        `json:"bestElapsedUs,omitempty"`
}

// DailyAlreadyPlayedError 表示玩家已完成今日该主题的每日挑战。
type DailyAlreadyPlayedError struct {
	SessionID string
	Code      string
}

func (e *DailyAlreadyPlayedError) Error() string { return "今日该主题已完成挑战" }

func NewDailyAlreadyPlayedError(sessionID string) *DailyAlreadyPlayedError {
	return &DailyAlreadyPlayedError{SessionID: sessionID, Code: "DAILY_ALREADY_PLAYED"}
}

// GameSession 是返回给前端的主状态对象。
type GameSession struct {
	SessionID           string                  `json:"sessionId"`
	PlayerName          string                  `json:"playerName"`
	Theme               Theme                   `json:"theme"`
	GameMode            GameMode                `json:"gameMode"`
	ActiveFields        []string                `json:"activeFields"`
	AttemptsLeft        int                     `json:"attemptsLeft"`
	Score               int                     `json:"score"`
	CorrectCount        int                     `json:"correctCount"`
	Status              SessionStatus           `json:"status"`
	Hint                HintInfo                `json:"hint"`
	Hints               []HintInfo              `json:"hints"`
	Guesses             []GuessRecord           `json:"guesses"`
	CorrectAnswers      []CorrectAnswerRecord   `json:"correctAnswers"`
	QuestionAttempts    int                     `json:"questionAttempts"`
	QuestionIndex       int                     `json:"questionIndex"`
	LastGuessCorrect    *bool                   `json:"lastGuessCorrect,omitempty"`
	LastQuestionScore   *int                    `json:"lastQuestionScore,omitempty"`
	GuessPlaceholder    string                  `json:"guessPlaceholder,omitempty"`
	ShowCompareGrid     *bool                   `json:"showCompareGrid,omitempty"`
	ElapsedUs           *int64                  `json:"elapsedUs,omitempty"`
	MaxAttempts         int                     `json:"maxAttempts,omitempty"`
	RoomCode            *string                 `json:"roomCode,omitempty"`
	ProgressiveLives    *int                    `json:"progressiveLives,omitempty"`
	ProgressiveRounds   []ProgressiveRound      `json:"progressiveRounds,omitempty"`
	ReverseQueries      []ReverseQueryRecord    `json:"reverseQueries,omitempty"`
	ReversePlayablePool []PlayableCardSummary   `json:"reversePlayablePool,omitempty"`
	ReverseEliminatedIds []string               `json:"reverseEliminatedIds,omitempty"`
	FinalGuessUsed      *bool                   `json:"finalGuessUsed,omitempty"`
	ReverseFieldChoices []ReverseFieldMeta      `json:"reverseFieldChoices,omitempty"`
	ReverseRoundHistory []ReverseRoundRecord    `json:"reverseRoundHistory,omitempty"`
	ReversePhase        *string                 `json:"reversePhase,omitempty"`
	RevealedAnswer      *RevealedAnswer         `json:"revealedAnswer,omitempty"`
}

// FieldClaim 记录接龙模式下一轮的字段归属与得分。
type FieldClaim struct {
	SessionID  string `json:"sessionId"`
	PlayerName string `json:"playerName"`
	Round      int    `json:"round"`
	Points     int    `json:"points"`
	Field      string `json:"field"`
	FieldLabel string `json:"fieldLabel"`
}

// RoomPlayerState 是多人房间快照中的单个玩家。
type RoomPlayerState struct {
	SessionID      string        `json:"sessionId"`
	PlayerName     string        `json:"playerName"`
	Score          int           `json:"score"`
	CorrectCount   int           `json:"correctCount"`
	AttemptsLeft   int           `json:"attemptsLeft"`
	QuestionIndex  int           `json:"questionIndex"`
	Status         SessionStatus `json:"status"`
	Connected      bool          `json:"connected"`
	ScoreBreakdown []FieldClaim  `json:"scoreBreakdown,omitempty"`
}

// RelayCorrectRecord 是接龙模式下的历史正确答案。
type RelayCorrectRecord struct {
	GuessName     string  `json:"guessName"`
	GuessID       string  `json:"guessId"`
	ImageURL      *string `json:"imageUrl"`
	QuestionIndex int     `json:"questionIndex"`
	SessionID     string  `json:"sessionId"`
	PlayerName    string  `json:"playerName"`
}

// RelayGuessRecord 扩展 GuessRecord，附带接龙 UI 所需的玩家身份。
type RelayGuessRecord struct {
	GuessRecord
	SessionID  string `json:"sessionId"`
	PlayerName string `json:"playerName"`
}

// RelayNotice 在接龙模式下有人出局时通知下一位玩家。
type RelayNotice struct {
	ID                  int    `json:"id"`
	TargetSessionID     string `json:"targetSessionId"`
	ExhaustedPlayerName string `json:"exhaustedPlayerName"`
}

// BattlePartialScore 是对战模式下非获胜者的部分得分。
type BattlePartialScore struct {
	SessionID  string `json:"sessionId"`
	PlayerName string `json:"playerName"`
	HitCount   int    `json:"hitCount"`
	Score      int    `json:"score"`
}

// BattleRoundResult 汇总对战/接龙模式下一轮的结局。
type BattleRoundResult struct {
	Kind             string               `json:"kind"`
	QuestionIndex    int                  `json:"questionIndex"`
	WinnerSessionID  *string              `json:"winnerSessionId"`
	WinnerPlayerName *string              `json:"winnerPlayerName"`
	AnswerName       string               `json:"answerName"`
	AnswerImageURL   *string              `json:"answerImageUrl"`
	WinnerScore      int                  `json:"winnerScore"`
	WinnerAttempts   int                  `json:"winnerAttempts"`
	PartialScores    []BattlePartialScore `json:"partialScores"`
	RoundLabel       string               `json:"roundLabel,omitempty"`
}

// RoomKind 区分普通房间与天梯邀请房间。
type RoomKind string

const (
	RoomKindCustom RoomKind = "custom"
	RoomKindLadder RoomKind = "ladder"
)

// RoomState 是多人房间的广播快照。
type RoomState struct {
	Code                      string               `json:"code"`
	Mode                      string               `json:"mode"`
	RoomKind                  RoomKind             `json:"roomKind,omitempty"`
	Theme                     Theme                `json:"theme"`
	MaxPlayers                int                  `json:"maxPlayers"`
	Status                    string               `json:"status"`
	HostSessionID             string               `json:"hostSessionId,omitempty"`
	CountdownDeadlineAt       *int64               `json:"countdownDeadlineAt,omitempty"`
	LobbyCountdownSeconds     *int                 `json:"lobbyCountdownSeconds,omitempty"`
	Players                   []RoomPlayerState    `json:"players"`
	CurrentTurnSessionID      *string              `json:"currentTurnSessionId,omitempty"`
	CurrentTurnPlayer         *string              `json:"currentTurnPlayer,omitempty"`
	FieldClaims               []FieldClaim         `json:"fieldClaims,omitempty"`
	RelayRound                int                  `json:"relayRound,omitempty"`
	FinishReason              string               `json:"finishReason,omitempty"`
	RelayGuesses              []RelayGuessRecord   `json:"relayGuesses,omitempty"`
	RelayCorrectHistory       []RelayCorrectRecord `json:"relayCorrectHistory,omitempty"`
	TurnDeadlineAt            *int64               `json:"turnDeadlineAt,omitempty"`
	RelayTurnSeconds          *int                 `json:"relayTurnSeconds,omitempty"`
	BattlePhase               string               `json:"battlePhase,omitempty"`
	BattleResult              *BattleRoundResult   `json:"battleResult,omitempty"`
	IntermissionDeadlineAt    *int64               `json:"intermissionDeadlineAt,omitempty"`
	BattleIntermissionSeconds *int                 `json:"battleIntermissionSeconds,omitempty"`
	BattleTotalQuestions      *int                 `json:"battleTotalQuestions,omitempty"`
	RelayPhase                string               `json:"relayPhase,omitempty"`
	RelayRoundResult          *BattleRoundResult   `json:"relayRoundResult,omitempty"`
	CurrentQuestionIndex      *int                 `json:"currentQuestionIndex,omitempty"`
	RelaySharedQuestionAttempts *int               `json:"relaySharedQuestionAttempts,omitempty"`
	RelayHints                []HintInfo           `json:"relayHints,omitempty"`
	RelayNotice               *RelayNotice         `json:"relayNotice,omitempty"`
	RevealedAnswer            *RevealedAnswer      `json:"revealedAnswer,omitempty"`
}

// RoomStartResponse 是 room:start 的 ack 载荷。
type RoomStartResponse struct {
	Room  *RoomState `json:"room,omitempty"`
	Error string     `json:"error,omitempty"`
}

// RoomLadderReinviteResponse 是 room:ladder:reinvite 的 ack 载荷。
type RoomLadderReinviteResponse struct {
	Error string `json:"error,omitempty"`
}

// RoomDismissResponse 是 room:dismiss 的 ack 载荷。
type RoomDismissResponse struct {
	Error string `json:"error,omitempty"`
}

// RoomJoinResponse 是 room:create / join / rejoin 的 ack 载荷。
type RoomJoinResponse struct {
	Room      *RoomState   `json:"room,omitempty"`
	SessionID string       `json:"sessionId,omitempty"`
	Session   *GameSession `json:"session,omitempty"`
	Error     string       `json:"error,omitempty"`
}

// RoomGuessResponse 是 room:guess 的 ack 载荷。
type RoomGuessResponse struct {
	Session        *GameSession `json:"session,omitempty"`
	NotInBank      bool         `json:"notInBank,omitempty"`
	Message        string       `json:"message,omitempty"`
	Error          string       `json:"error,omitempty"`
	ScoreBreakdown []FieldClaim `json:"scoreBreakdown,omitempty"`
	FullCorrect    *bool        `json:"fullCorrect,omitempty"`
}

// RoomLeaveResponse 是 room:leave 的 ack 载荷。
type RoomLeaveResponse struct {
	Room *RoomState `json:"room,omitempty"`
}

// LeaderboardEntry 表示排行榜上的一行。
type LeaderboardEntry struct {
	ID           int64    `json:"id"`
	PlayerName   string   `json:"playerName"`
	Theme        Theme    `json:"theme"`
	GameMode     GameMode `json:"gameMode,omitempty"`
	TotalScore   int      `json:"totalScore"`
	CorrectCount int      `json:"correctCount"`
	CreatedAt    string   `json:"createdAt"`
}

// DailyLeaderboardEntry 表示每日排行榜上的一行。
type DailyLeaderboardEntry struct {
	ID           int64  `json:"id"`
	PlayerName   string `json:"playerName"`
	Theme        Theme  `json:"theme"`
	ChallengeDate string `json:"challengeDate"`
	AttemptsUsed int    `json:"attemptsUsed"`
	ElapsedUs    int64  `json:"elapsedUs"`
	CompletedAt  string `json:"completedAt"`
}

// ThemeFieldDef 是主题下的字段标签对。
type ThemeFieldDef struct {
	Field string
	Label string
}

// ThemeFieldDefs 各主题对比/提示字段定义（与旧 Node THEME_FIELD_DEFS 一致）。
var ThemeFieldDefs = map[Theme][]ThemeFieldDef{
	ThemeCSGO: {
		{Field: "team", Label: "战队"},
		{Field: "nationality", Label: "国籍"},
		{Field: "age", Label: "年龄"},
		{Field: "rating", Label: "近三月Rating"},
		{Field: "top20Count", Label: "TOP 20次数"},
		{Field: "position", Label: "位置"},
	},
	ThemeFootball: {
		{Field: "club", Label: "俱乐部"},
		{Field: "nationalTeam", Label: "国家队"},
		{Field: "age", Label: "年龄"},
		{Field: "marketValue", Label: "身价(万欧元)"},
		{Field: "height", Label: "身高(cm)"},
		{Field: "position", Label: "位置"},
	},
	ThemeNBA: {
		{Field: "team", Label: "球队"},
		{Field: "age", Label: "年龄"},
		{Field: "height", Label: "身高(cm)"},
		{Field: "draft", Label: "选秀"},
		{Field: "playoffCount", Label: "季后赛次数"},
		{Field: "position", Label: "位置"},
	},
	ThemePokemon: {
		{Field: "type1", Label: "属性1"},
		{Field: "type2", Label: "属性2"},
		{Field: "evolutionStage", Label: "进化阶段"},
		{Field: "category", Label: "分类"},
		{Field: "ability", Label: "特性"},
		{Field: "baseStatTotal", Label: "种族值总和"},
		{Field: "hp", Label: "HP"},
		{Field: "attack", Label: "攻击"},
		{Field: "defense", Label: "防御"},
		{Field: "spAttack", Label: "特攻"},
		{Field: "spDefense", Label: "特防"},
		{Field: "speed", Label: "速度"},
		{Field: "eggGroup", Label: "生蛋群"},
		{Field: "learnableMove", Label: "可学习技能"},
	},
}

var extraFieldLabels = map[string]string{
	"weaknessHint":         "属性相克",
	"moveHint":             "可学会招式",
	"pokemonWeakTo":        "弱点",
	"pokemonResistTo":      "抗性",
	"division":             "赛区",
	"clubLeague":           "联赛",
	"confederation":        "洲际赛区",
	"divisionPosition":     "赛区·选秀",
	"firepowerStat":        "火力值",
	"sniperStat":           "狙击值",
	"breakthroughStat":     "突破",
	"tradeStat":            "补枪值",
	"clutchStat":           "残局值",
	"utilityStat":          "道具值",
	"currentSeasonGp":      "本赛季出场",
	"maxCareerGpSince2025": "2025来最高出场",
}

// GetFieldLabel 返回某主题下字段的展示标签。
func GetFieldLabel(theme Theme, field string) string {
	for _, def := range ThemeFieldDefs[theme] {
		if def.Field == field {
			return def.Label
		}
	}
	if l, ok := extraFieldLabels[field]; ok {
		return l
	}
	return field
}
