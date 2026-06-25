export type Theme = 'csgo' | 'football' | 'nba' | 'anime';
export type CompareResult = 'hit' | 'close' | 'miss';
export type SessionStatus = 'playing' | 'question_done' | 'game_over' | 'quit';

export interface CharacterEntry {
  id: string;
  name: string; // 中文名（界面主显示）
  englishName?: string; // 英文/罗马音名，用于检索（不作为主显示）
  displayName?: string;
  aliases?: string[];
  [field: string]: string | number | null | string[] | undefined;
}

export interface FieldCompare {
  field: string;
  label: string;
  guessValue: string | number | null;
  answerValue: string | number | null;
  result: CompareResult;
  showAnswer: boolean;
  direction?: 'higher' | 'lower' | null;
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
}

export interface CorrectAnswerRecord {
  guessName: string;
  guessId: string;
  imageUrl: string | null;
  questionIndex: number;
  fieldResults?: FieldCompare[]; // 用于 hover 显示完整字段
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
}

export interface LeaderboardEntry {
  id: number;
  playerName: string;
  theme: Theme;
  totalScore: number;
  correctCount: number;
  createdAt: string;
}

export const THEME_LABELS: Record<Theme, string> = {
  csgo: 'CS 选手',
  football: '足球运动员',
  nba: 'NBA 球员',
  anime: '动漫角色',
};

export const THEME_FIELDS: Record<Theme, { field: string; label: string }[]> = {
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
    { field: 'school', label: '学校' },
    { field: 'draft', label: '选秀' },
    { field: 'playoffCount', label: '季后赛次数' },
    { field: 'position', label: '位置' },
  ],
  anime: [
    { field: 'anime', label: '作品' },
    { field: 'affiliation', label: '组织' },
    { field: 'race', label: '种族' },
    { field: 'occupation', label: '职业' },
    { field: 'age', label: '年龄' },
    { field: 'height', label: '身高(cm)' },
    { field: 'powerLevel', label: '战斗力' },
  ],
};

export const MAX_ATTEMPTS = 10;

export function scoreForQuestion(attemptsUsed: number): number {
  if (attemptsUsed <= 1) return 500;
  if (attemptsUsed === 2) return 420;
  if (attemptsUsed === 3) return 340;
  return Math.max(100, 340 - (attemptsUsed - 3) * 55);
}
