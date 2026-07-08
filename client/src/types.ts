export type Theme = 'csgo' | 'football' | 'nba' | 'pokemon';
export type GameMode =
  | 'classic-six'
  | 'daily-one'
  | 'progressive-hint'
  | 'reverse-bomb'
  | 'battle'
  | 'relay-chain';

export type ReverseOperator = '>=' | '<=' | '==' | '!=';

export interface ReverseCondition {
  field: string;
  operator: ReverseOperator;
  value: string | number;
}

export interface ReverseQueryRecord {
  condition: ReverseCondition;
  matched: boolean;
  label: string;
  displayValue: string | number;
}

export interface ReverseFieldMeta {
  field: string;
  label: string;
  kind: 'numeric' | 'enum';
}

export type ReverseValuesResponse =
  | { kind: 'enum'; values: string[] }
  | { kind: 'numeric'; min: number; max: number };

export interface PlayableCardSummary {
  id: string;
  name: string;
  imageUrl: string | null;
}
export type CompareResult = 'hit' | 'close' | 'miss';
export type SessionStatus = 'playing' | 'question_done' | 'game_over' | 'quit' | 'failed';

export interface FieldCompare {
  field: string;
  label: string;
  guessValue: string | number | null;
  answerValue: string | number | null;
  result: CompareResult;
  showAnswer: boolean;
  direction?: 'higher' | 'lower' | 'later' | 'earlier' | null;
  hint?: string | null;
  claimedBy?: string | null;
}

export interface GuessRecord {
  id: number;
  guessName: string;
  guessId: string | null;
  isCorrect: boolean;
  fieldResults: FieldCompare[] | null;
  createdAt: string;
  questionIndex?: number;
  imageUrl?: string | null;
  scoreDelta?: number;
}

export interface RelayCorrectRecord {
  guessName: string;
  guessId: string;
  imageUrl: string | null;
  questionIndex: number;
  sessionId: string;
  playerName: string;
}

export interface RelayGuessRecord extends GuessRecord {
  sessionId: string;
  playerName: string;
}

export const RELAY_FIELD_POINTS = 80;
export const RELAY_WRONG_CLAIM_PENALTY = 25;
export const RELAY_FULL_CORRECT_BY_CLAIMED_COUNT = [300, 270, 230, 180, 120] as const;
export const RELAY_FULL_CORRECT_MIN = 80;
export const RELAY_TURN_SECONDS = 30;
export const RELAY_TIMEOUT_PENALTY = 50;

export function computeRelayFullCorrectBonus(claimedFieldCount: number): number {
  const n = Math.max(0, Math.floor(claimedFieldCount));
  if (n >= RELAY_FULL_CORRECT_BY_CLAIMED_COUNT.length) return RELAY_FULL_CORRECT_MIN;
  return RELAY_FULL_CORRECT_BY_CLAIMED_COUNT[n];
}

export const BATTLE_QUESTION_COUNT = 10;
export const BATTLE_INTERMISSION_SECONDS = 5;
export const BATTLE_PARTIAL_POINTS_PER_HIT = 40;

export interface BattlePartialScore {
  sessionId: string;
  playerName: string;
  hitCount: number;
  score: number;
}

export interface BattleRoundResult {
  kind: 'winner' | 'draw';
  questionIndex: number;
  winnerSessionId: string | null;
  winnerPlayerName: string | null;
  answerName: string;
  answerImageUrl: string | null;
  winnerScore: number;
  winnerAttempts: number;
  partialScores: BattlePartialScore[];
  roundLabel?: string;
}

export interface CorrectAnswerRecord {
  guessName: string;
  guessId: string;
  imageUrl: string | null;
  questionIndex: number;
  fieldResults?: FieldCompare[];
}

export interface HintInfo {
  field: string;
  label: string;
  value: string | number | null;
}

export interface ProgressiveHintCheck {
  field: string;
  /** @deprecated use fieldLabel + targetValue/guessValue */
  label: string;
  fieldLabel: string;
  targetValue: string;
  guessValue: string;
  hit: boolean;
}

export interface ProgressiveGuessEntry {
  guessName: string;
  guessId: string | null;
  imageUrl?: string | null;
  hintChecks: ProgressiveHintCheck[];
  allHintsHit: boolean;
  livesLost: boolean;
  isCorrect: boolean;
}

export interface ProgressiveRound {
  hintIndex: number;
  hint: HintInfo;
  guesses: ProgressiveGuessEntry[];
}

export interface FieldClaim {
  sessionId: string;
  playerName: string;
  round: number;
  points: number;
  field: string;
  fieldLabel: string;
}

export interface GameSession {
  sessionId: string;
  playerName: string;
  theme: Theme;
  gameMode: GameMode;
  activeFields: string[];
  attemptsLeft: number;
  score: number;
  correctCount: number;
  status: SessionStatus;
  hint: HintInfo;
  hints: HintInfo[];
  guesses: GuessRecord[];
  correctAnswers: CorrectAnswerRecord[];
  questionAttempts: number;
  questionIndex?: number;
  lastGuessCorrect?: boolean;
  lastQuestionScore?: number;
  guessPlaceholder?: string;
  showCompareGrid?: boolean;
  elapsedUs?: number;
  maxAttempts?: number;
  roomCode?: string | null;
  isMyTurn?: boolean;
  currentTurnPlayer?: string | null;
  fieldClaims?: FieldClaim[];
  scoreBreakdown?: FieldClaim[];
  progressiveRounds?: ProgressiveRound[];
  progressiveLives?: number;
  reverseQueries?: ReverseQueryRecord[];
  reversePlayablePool?: PlayableCardSummary[];
  reverseEliminatedIds?: string[];
  finalGuessUsed?: boolean;
  reverseFieldChoices?: ReverseFieldMeta[];
  reverseRoundHistory?: ReverseRoundRecord[];
  reversePhase?: 'filtering' | 'guessing';
  revealedAnswer?: { name: string; imageUrl: string | null };
}

export interface ReverseRoundRecord {
  questionIndex: number;
  answerName: string;
  answerId: string;
  imageUrl: string | null;
  success: boolean;
  autoDeduced?: boolean;
  score: number;
  guessedName?: string | null;
  aliveCountAtEnd: number;
  totalPool: number;
}

export interface LeaderboardEntry {
  id: number;
  playerName: string;
  theme: Theme;
  gameMode?: GameMode;
  totalScore: number;
  correctCount: number;
  createdAt: string;
}

export interface DailyLeaderboardEntry {
  id: number;
  playerName: string;
  theme: Theme;
  challengeDate: string;
  attemptsUsed: number;
  elapsedUs: number;
  completedAt: string;
}

export interface DailyTodayInfo {
  challengeDate: string;
  theme: Theme;
  completed: boolean;
  inProgress?: boolean;
  sessionId?: string;
  status?: SessionStatus;
  bestAttempts?: number;
  bestElapsedUs?: number;
}

export interface RoomPlayerState {
  sessionId: string;
  playerName: string;
  score: number;
  correctCount: number;
  attemptsLeft: number;
  questionIndex: number;
  status: SessionStatus;
  connected: boolean;
  scoreBreakdown?: FieldClaim[];
}

export type RoomKind = 'custom' | 'ladder';

export interface LadderInviteInfo {
  roomCode: string;
  theme: Theme;
  mode: 'battle' | 'relay-chain';
  hostName: string;
  hostSessionId: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
}

export interface RoomState {
  code: string;
  mode: 'battle' | 'relay-chain';
  roomKind?: RoomKind;
  theme: Theme;
  maxPlayers: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  hostSessionId?: string;
  countdownDeadlineAt?: number | null;
  lobbyCountdownSeconds?: number;
  players: RoomPlayerState[];
  currentTurnSessionId?: string | null;
  currentTurnPlayer?: string | null;
  fieldClaims?: FieldClaim[];
  relayRound?: number;
  finishReason?: string;
  relayGuesses?: RelayGuessRecord[];
  relayCorrectHistory?: RelayCorrectRecord[];
  turnDeadlineAt?: number | null;
  relayTurnSeconds?: number;
  battlePhase?: 'playing' | 'intermission';
  battleResult?: BattleRoundResult | null;
  intermissionDeadlineAt?: number | null;
  battleIntermissionSeconds?: number;
  relayPhase?: 'playing' | 'intermission';
  relayRoundResult?: BattleRoundResult | null;
  battleTotalQuestions?: number;
  currentQuestionIndex?: number;
  relaySharedQuestionAttempts?: number;
  relayHints?: HintInfo[];
  relayNotice?: RelayNotice | null;
  revealedAnswer?: RevealedAnswerInfo;
}

export interface RelayNotice {
  id: number;
  targetSessionId: string;
  exhaustedPlayerName: string;
}

export interface RevealedAnswerInfo {
  name: string;
  imageUrl: string | null;
}

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  'classic-six': '经典：六项提示',
  'daily-one': '每日一题',
  'progressive-hint': '逐步提示',
  'reverse-bomb': '逆向轰炸',
  battle: '对战模式',
  'relay-chain': '接龙模式',
};

export const LEADERBOARD_MODES: GameMode[] = [
  'classic-six',
  'daily-one',
  'progressive-hint',
  'reverse-bomb',
];

export const THEME_LABELS: Record<Theme, string> = {
  csgo: 'CS 选手',
  football: '2026世界杯',
  nba: 'NBA',
  pokemon: '宝可梦',
};

export const THEME_ICONS: Record<Theme, string> = {
  csgo: '🎯',
  football: '⚽',
  nba: '🏀',
  pokemon: '⚡',
};

export const MODE_ICONS: Record<GameMode, string> = {
  'classic-six': '🎯',
  'daily-one': '📅',
  'progressive-hint': '🔍',
  'reverse-bomb': '💣',
  battle: '⚔️',
  'relay-chain': '🔗',
};

export const PROGRESSIVE_LIVES = 3;
export const REVERSE_QUERY_ATTEMPTS = 5;
export const REVERSE_ROUNDS_PER_GAME = 3;

const REVERSE_ROUND_CN = ['第一轮', '第二轮', '第三轮'] as const;

export function reverseRoundLabel(roundIndex: number): string {
  return REVERSE_ROUND_CN[roundIndex] ?? `第${roundIndex + 1}轮`;
}

/** 经典 / 对战完全猜对时的最低本题得分（须高于字段部分分累计） */
export const FULL_CORRECT_MIN_SCORE = 300;

export function scoreForQuestion(attemptsUsed: number): number {
  let score: number;
  if (attemptsUsed <= 1) score = 500;
  else if (attemptsUsed === 2) score = 420;
  else if (attemptsUsed === 3) score = 340;
  else score = 340 - (attemptsUsed - 3) * 55;
  return Math.max(FULL_CORRECT_MIN_SCORE, score);
}

export function formatElapsedUs(us: number): string {
  const totalMs = Math.floor(us / 1000);
  const ms = Math.floor((us % 1_000_000) / 1000);
  const sec = Math.floor(totalMs / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export const RESULT_COLORS: Record<CompareResult, string> = {
  hit: 'bg-apple-green/20 text-apple-green border-apple-green/35',
  close: 'bg-apple-orange/20 text-apple-orange border-apple-orange/35',
  miss: 'bg-apple-red/15 text-apple-red border-apple-red/25',
};

export const RESULT_LABELS: Record<CompareResult, string> = {
  hit: '命中',
  close: '接近',
  miss: '未命中',
};

export type LeaderboardRow = LeaderboardEntry | DailyLeaderboardEntry;

export function isDailyEntry(entry: LeaderboardRow): entry is DailyLeaderboardEntry {
  return 'attemptsUsed' in entry;
}
