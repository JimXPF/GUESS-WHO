export type Theme = 'csgo' | 'football' | 'nba' | 'anime' | 'pokemon';
export type GameMode = 'classic-six';
export type CompareResult = 'hit' | 'close' | 'miss';
export type SessionStatus = 'playing' | 'question_done' | 'game_over' | 'quit';

export interface FieldCompare {
  field: string;
  label: string;
  guessValue: string | number | null;
  answerValue: string | number | null;
  result: CompareResult;
  showAnswer: boolean;
  direction?: 'higher' | 'lower' | 'later' | 'earlier' | null;
  hint?: string | null;
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
}

export interface LeaderboardEntry {
  id: number;
  playerName: string;
  theme: Theme;
  totalScore: number;
  correctCount: number;
  createdAt: string;
}

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  'classic-six': '经典：六项提示',
};

export const THEME_LABELS: Record<Theme, string> = {
  csgo: 'CS 选手',
  football: '2026世界杯',
  nba: 'NBA',
  anime: '动漫人物',
  pokemon: '宝可梦',
};

export const THEME_ICONS: Record<Theme, string> = {
  csgo: '🎯',
  football: '⚽',
  nba: '🏀',
  anime: '🎌',
  pokemon: '⚡',
};

export const MAX_ATTEMPTS = 10;

export function scoreForQuestion(attemptsUsed: number): number {
  if (attemptsUsed <= 1) return 500;
  if (attemptsUsed === 2) return 420;
  if (attemptsUsed === 3) return 340;
  return Math.max(100, 340 - (attemptsUsed - 3) * 55);
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
