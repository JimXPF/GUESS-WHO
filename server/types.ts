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

export interface ReverseState {
  reverse: true;
  finalGuessUsed: boolean;
  fieldChoices: ReverseFieldMeta[];
  roundHistory: ReverseRoundRecord[];
  phase: 'filtering' | 'guessing';
  /** 本题随机候选 id（含答案），最多 REVERSE_QUESTION_POOL_SIZE 个 */
  questionPoolIds: string[];
  /** 上一轮二选一 presented 的字段，用于避免连续重复 */
  recentChoiceFields?: string[];
  /** 第 4 次筛选起展示的准确提示（字段不在 fieldChoices 中） */
  accurateHint?: HintInfo;
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
export type CompareResult = 'hit' | 'close' | 'miss';
export type SessionStatus = 'playing' | 'question_done' | 'game_over' | 'quit' | 'failed';

export interface CharacterEntry {
  id: string;
  name: string;
  englishName?: string;
  displayName?: string;
  aliases?: string[];
  [field: string]: string | number | boolean | null | string[] | undefined;
}

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
  questionIndex: number;
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

export interface ProgressiveState {
  lives: number;
  hintFields: string[];
  hints: HintInfo[];
  pendingQueue: string[];
  /** 已被某次猜测命中的提示字段（含未解锁队列字段）；仅记录，不阻止后续正式解锁 */
  satisfiedFields?: string[];
  questionAttempts: number;
  rounds: ProgressiveRound[];
  footballPrimaryField?: 'confederation' | 'clubLeague';
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
  questionIndex: number;
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
  /** 本局结束时当前题未答对时揭晓的答案（结算页展示） */
  revealedAnswer?: { name: string; imageUrl: string | null };
}

export interface LeaderboardEntry {
  id: number;
  playerName: string;
  theme: Theme;
  gameMode: GameMode;
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

export class DailyAlreadyPlayedError extends Error {
  readonly code = 'DAILY_ALREADY_PLAYED' as const;

  constructor(public sessionId: string) {
    super('今日该主题已完成挑战');
    this.name = 'DailyAlreadyPlayedError';
  }
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
  playerRank?: number;
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

export interface RoomState {
  code: string;
  mode: 'battle' | 'relay-chain';
  theme: Theme;
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
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

export const LEADERBOARD_MODES: GameMode[] = ['classic-six', 'daily-one'];

export const THEME_LABELS: Record<Theme, string> = {
  csgo: 'CS 选手',
  football: '2026世界杯',
  nba: 'NBA',
  pokemon: '宝可梦',
};

/** 各主题全部字段定义（含仅入库字段） */
export const THEME_FIELD_DEFS: Record<Theme, { field: string; label: string }[]> = {
  csgo: [
    { field: 'team', label: '战队' },
    { field: 'nationality', label: '国籍' },
    { field: 'age', label: '年龄' },
    { field: 'rating', label: '近三月Rating' },
    { field: 'top20Count', label: 'TOP 20次数' },
    { field: 'position', label: '位置' },
  ],
  football: [
    { field: 'club', label: '俱乐部' },
    { field: 'nationalTeam', label: '国家队' },
    { field: 'age', label: '年龄' },
    { field: 'marketValue', label: '身价(万欧元)' },
    { field: 'height', label: '身高(cm)' },
    { field: 'position', label: '位置' },
  ],
  nba: [
    { field: 'team', label: '球队' },
    { field: 'age', label: '年龄' },
    { field: 'height', label: '身高(cm)' },
    { field: 'draft', label: '选秀' },
    { field: 'playoffCount', label: '季后赛次数' },
    { field: 'position', label: '位置' },
  ],
  pokemon: [
    { field: 'type1', label: '属性1' },
    { field: 'type2', label: '属性2' },
    { field: 'evolutionStage', label: '进化阶段' },
    { field: 'category', label: '分类' },
    { field: 'ability', label: '特性' },
    { field: 'baseStatTotal', label: '种族值总和' },
    { field: 'hp', label: 'HP' },
    { field: 'attack', label: '攻击' },
    { field: 'defense', label: '防御' },
    { field: 'spAttack', label: '特攻' },
    { field: 'spDefense', label: '特防' },
    { field: 'speed', label: '速度' },
    { field: 'eggGroup', label: '生蛋群' },
    { field: 'learnableMove', label: '可学习技能' },
  ],
};

export const THEME_FIELDS = THEME_FIELD_DEFS;

const STAT_FIELD_LABELS: Record<string, string> = {
  baseStatTotal: '种族值总和',
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  spAttack: '特攻',
  spDefense: '特防',
  speed: '速度',
};

export function getFieldLabel(theme: Theme, field: string): string {
  const def = THEME_FIELD_DEFS[theme]?.find((f) => f.field === field);
  if (def) return def.label;
  if (STAT_FIELD_LABELS[field]) return STAT_FIELD_LABELS[field];
  if (field === 'weaknessHint') return '属性弱点';
  if (field === 'moveHint') return '可学会招式';
  if (field === 'division') return '赛区';
  if (field === 'clubLeague') return '联赛';
  if (field === 'confederation') return '洲际赛区';
  if (field === 'firepowerStat') return '火力值';
  if (field === 'gameBreakerStat') return '破局值';
  if (field === 'sniperStat') return '狙击值';
  if (field === 'breakthroughStat') return '突破';
  if (field === 'tradeStat') return '补枪值';
  if (field === 'clutchStat') return '残局值';
  if (field === 'utilityStat') return '道具值';
  if (field === 'currentSeasonGp') return '本赛季出场';
  if (field === 'maxCareerGpSince2025') return '2025来最高出场';
  return field;
}

export function getThemeFields(
  theme: Theme,
  activeFields: string[]
): { field: string; label: string }[] {
  const ordered =
    theme === 'pokemon'
      ? (() => {
          const o: string[] = [];
          if (activeFields.includes('type1')) o.push('type1');
          if (activeFields.includes('type2')) o.push('type2');
          for (const f of activeFields) {
            if (f !== 'type1' && f !== 'type2') o.push(f);
          }
          return o;
        })()
      : activeFields;
  return ordered.map((field) => ({
    field,
    label: getFieldLabel(theme, field),
  }));
}

export const MAX_ATTEMPTS = 10;
export const DAILY_MAX_ATTEMPTS = 20;
export const PROGRESSIVE_LIVES = 3;
export const REVERSE_QUERY_ATTEMPTS = 5;
/** 逆向轰炸每局固定轮数，三轮总分计入排行榜 */
export const REVERSE_ROUNDS_PER_GAME = 3;
/** 完成该次数筛选后解锁准确提示（即第 4 次筛选时可见） */
export const REVERSE_ACCURATE_HINT_AFTER = 3;
/** 逆向轰炸每题随机展示的候选数量（含隐藏答案） */
export const REVERSE_QUESTION_POOL_SIZE = 100;
/** 终极猜测（筛选用尽后）固定分 */
export const REVERSE_SCORE_CORRECT_GUESS = 500;
/** 筛至唯一：固定底座 + 剩余筛选次数奖励 */
export const REVERSE_SCORE_AUTO_BASE = 600;
export const REVERSE_SCORE_AUTO_REMAINING_BONUS = 50;

export const RELAY_FIELD_POINTS = 60;
export const RELAY_WRONG_CLAIM_PENALTY = 50;
export const RELAY_FULL_CORRECT_BONUS = 300;
export const RELAY_TURN_SECONDS = 30;
export const RELAY_TIMEOUT_PENALTY = 50;

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

export interface QuestionSetup {
  answerId: string;
  hintField: string;
  extraHintFields: string[];
  activeFields: string[];
  compareMove: string | null;
}

/** Minimal room context for relay scoring (avoids circular imports) */
export interface RelayRoomContext {
  relayFieldClaims: Record<string, FieldClaim>;
  relayRound: number;
  playerOrder: string[];
  relayTurnSessionId: string | null;
}
