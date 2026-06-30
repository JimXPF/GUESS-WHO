import { db } from '../db';
import {
  CharacterEntry,
  getFieldLabel,
  HintInfo,
  PlayableCardSummary,
  ReverseCondition,
  ReverseFieldMeta,
  ReverseOperator,
  ReverseQueryRecord,
  ReverseState,
  ReverseValuesResponse,
  REVERSE_ACCURATE_HINT_AFTER,
  REVERSE_QUERY_ATTEMPTS,
  REVERSE_QUESTION_POOL_SIZE,
  REVERSE_SCORE_AUTO_BASE,
  REVERSE_SCORE_AUTO_REMAINING_BONUS,
  REVERSE_SCORE_CORRECT_GUESS,
  THEME_FIELD_DEFS,
  Theme,
} from '../types';
import {
  getBank,
  getCharacterField,
  getCharacterImage,
  getDisplayName,
} from './dataLoader';
import { getConfederationHint, resolveClubLeague } from './footballHints';
import { getDivisionHint } from './nbaHints';
import { buildProgressiveHintInfo } from './progressiveHint';

const EXCLUDED_FIELDS = new Set(['learnableMove']);

/** 逆向模式额外字段（不在经典六段对比中，但可用于轰炸） */
const EXTRA_REVERSE_FIELD_DEFS: Record<Theme, { field: string; label: string }[]> = {
  csgo: [
    { field: 'firepowerStat', label: '火力值' },
    { field: 'sniperStat', label: '狙击值' },
    { field: 'breakthroughStat', label: '突破' },
    { field: 'tradeStat', label: '补枪值' },
    { field: 'clutchStat', label: '残局值' },
    { field: 'utilityStat', label: '道具值' },
  ],
  football: [],
  nba: [
    { field: 'currentSeasonGp', label: '本赛季出场' },
    { field: 'maxCareerGpSince2025', label: '2025来最高出场' },
  ],
  anime: [],
  pokemon: [],
};

/** 逆向模式额外可查询字段（合成/派生，不在 JSON 条目上） */
const SYNTHETIC_REVERSE_FIELDS: Record<Theme, string[]> = {
  csgo: [],
  football: ['clubLeague', 'confederation'],
  nba: ['division'],
  anime: [],
  pokemon: [],
};
const NULLABLE_FIELDS = new Set(['type2', 'club', 'school']);

const NUMERIC_FIELDS: Record<Theme, Set<string>> = {
  csgo: new Set([
    'age',
    'rating',
    'top20Count',
    'firepowerStat',
    'sniperStat',
    'breakthroughStat',
    'tradeStat',
    'clutchStat',
    'utilityStat',
  ]),
  football: new Set(['age', 'marketValue', 'height']),
  nba: new Set(['age', 'height', 'playoffCount', 'currentSeasonGp', 'maxCareerGpSince2025']),
  anime: new Set(['age', 'powerLevel', 'height']),
  pokemon: new Set([
    'baseStatTotal',
    'hp',
    'attack',
    'defense',
    'spAttack',
    'spDefense',
    'speed',
  ]),
};

function operatorDisplayLabel(op: ReverseOperator): string {
  switch (op) {
    case '==':
      return '是';
    case '!=':
      return '不是';
    case '>=':
      return '大于等于';
    case '<=':
      return '小于等于';
    default:
      return op;
  }
}

function normalizeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function normalizeEnumValue(val: unknown, field: string): string {
  const s = normalizeStr(val);
  if (!s && NULLABLE_FIELDS.has(field)) return '无';
  return s;
}

function parseEggGroups(val: unknown): string[] {
  return String(val ?? '')
    .split('、')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getReverseQueryableFields(theme: Theme): string[] {
  const base = (THEME_FIELD_DEFS[theme] ?? [])
    .map((f) => f.field)
    .filter((f) => !EXCLUDED_FIELDS.has(f));
  const extra = (EXTRA_REVERSE_FIELD_DEFS[theme] ?? []).map((f) => f.field);
  const synthetic = SYNTHETIC_REVERSE_FIELDS[theme] ?? [];
  return [...new Set([...base, ...extra, ...synthetic])];
}

export function getExtraReverseFieldLabel(theme: Theme, field: string): string | undefined {
  return EXTRA_REVERSE_FIELD_DEFS[theme]?.find((f) => f.field === field)?.label;
}

export function isNumericReverseField(theme: Theme, field: string): boolean {
  return NUMERIC_FIELDS[theme]?.has(field) ?? false;
}

export function getAllowedOperators(theme: Theme, field: string): ReverseOperator[] {
  if (isNumericReverseField(theme, field)) return ['>=', '<='];
  return ['==', '!='];
}

function getRawFieldValue(entry: CharacterEntry, field: string, theme: Theme): unknown {
  if (theme === 'nba' && field === 'division') {
    const div = getDivisionHint(entry.team);
    return div ? div.replace(/球员$/, '') : '未知赛区';
  }
  if (theme === 'football' && field === 'clubLeague') {
    return resolveClubLeague(entry) ?? '未知联赛';
  }
  if (theme === 'football' && field === 'confederation') {
    return getConfederationHint(entry.nationalTeam) ?? '未知洲际';
  }
  if (field === 'eggGroup') {
    return getCharacterField(entry, field, theme);
  }
  return getCharacterField(entry, field, theme);
}

function cardSatisfiesOperator(
  cardValue: unknown,
  operator: ReverseOperator,
  conditionValue: string | number,
  field: string,
  theme: Theme
): boolean {
  if (field === 'eggGroup') {
    const groups = parseEggGroups(cardValue);
    const target = normalizeStr(conditionValue);
    if (operator === '==') return groups.includes(target);
    if (operator === '!=') return !groups.includes(target);
    return false;
  }

  if (isNumericReverseField(theme, field)) {
    const num = Number(cardValue);
    const threshold = Number(conditionValue);
    if (isNaN(num) || isNaN(threshold)) return false;
    if (operator === '>=') return num >= threshold;
    if (operator === '<=') return num <= threshold;
    return false;
  }

  const cardNorm = normalizeEnumValue(cardValue, field).toLowerCase();
  const valNorm = normalizeEnumValue(conditionValue, field).toLowerCase();
  if (operator === '==') return cardNorm === valNorm;
  if (operator === '!=') return cardNorm !== valNorm;
  return false;
}

/** Whether a card would remain alive given knowledge that answer matched/not matched a condition. */
export function cardCompatibleWithTag(
  card: CharacterEntry,
  query: ReverseQueryRecord,
  theme: Theme
): boolean {
  const { condition, matched } = query;
  const raw = getRawFieldValue(card, condition.field, theme);
  const satisfies = cardSatisfiesOperator(
    raw,
    condition.operator,
    condition.value,
    condition.field,
    theme
  );
  return matched ? satisfies : !satisfies;
}

export function cardMatchesCondition(
  card: CharacterEntry,
  condition: ReverseCondition,
  theme: Theme
): boolean {
  const raw = getRawFieldValue(card, condition.field, theme);
  return cardSatisfiesOperator(raw, condition.operator, condition.value, condition.field, theme);
}

export function evaluateAnswerCondition(
  answer: CharacterEntry,
  condition: ReverseCondition,
  theme: Theme
): boolean {
  return cardMatchesCondition(answer, condition, theme);
}

export function loadReverseQueries(
  sessionId: string,
  questionIndex?: number
): ReverseQueryRecord[] {
  const rows = db
    .prepare(
      `SELECT field_results, question_index FROM guesses WHERE session_id = ? ORDER BY id ASC`
    )
    .all(sessionId) as Array<{ field_results: string | null; question_index: number }>;

  const queries: ReverseQueryRecord[] = [];
  for (const row of rows) {
    if (questionIndex !== undefined && row.question_index !== questionIndex) continue;
    if (!row.field_results) continue;
    try {
      const parsed = JSON.parse(row.field_results);
      if (parsed?.reverse === true && parsed.condition) {
        queries.push({
          condition: parsed.condition,
          matched: Boolean(parsed.matched),
          label: parsed.label ?? getFieldLabel('csgo', parsed.condition.field),
          displayValue: parsed.displayValue ?? parsed.condition.value,
        });
      }
    } catch {
      /* skip */
    }
  }
  return queries;
}

export function getAlivePool(
  theme: Theme,
  queries: ReverseQueryRecord[],
  questionPoolIds?: string[]
): CharacterEntry[] {
  const bank = resolveQuestionPoolEntries(theme, questionPoolIds);
  if (queries.length === 0) return bank;
  return bank.filter((card) =>
    queries.every((q) => cardCompatibleWithTag(card, q, theme))
  );
}

export function resolveQuestionPoolIds(
  theme: Theme,
  questionPoolIds: string[] | undefined
): string[] {
  if (questionPoolIds && questionPoolIds.length > 0) return questionPoolIds;
  return getBank(theme).map((c) => c.id);
}

export function getQuestionPoolEntries(
  theme: Theme,
  questionPoolIds: string[]
): CharacterEntry[] {
  if (questionPoolIds.length === 0) return getBank(theme);
  const idSet = new Set(questionPoolIds);
  return getBank(theme).filter((c) => idSet.has(c.id));
}

function resolveQuestionPoolEntries(
  theme: Theme,
  questionPoolIds?: string[]
): CharacterEntry[] {
  return getQuestionPoolEntries(theme, resolveQuestionPoolIds(theme, questionPoolIds));
}

export function pickReverseQuestionPoolIds(theme: Theme, answerId: string): string[] {
  const bank = getBank(theme);
  if (bank.length <= REVERSE_QUESTION_POOL_SIZE) {
    return bank.map((c) => c.id);
  }
  const others = bank.filter((c) => c.id !== answerId);
  const shuffled = [...others];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const ids = shuffled.slice(0, REVERSE_QUESTION_POOL_SIZE - 1).map((c) => c.id);
  ids.push(answerId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function countFieldDiscrimination(
  alivePool: CharacterEntry[],
  field: string,
  theme: Theme
): number {
  if (isNumericReverseField(theme, field)) {
    const nums: number[] = [];
    for (const card of alivePool) {
      const v = Number(getRawFieldValue(card, field, theme));
      if (!isNaN(v)) nums.push(v);
    }
    if (nums.length < 2) return 0;
    return new Set(nums).size;
  }

  const unique = new Set<string>();
  for (const card of alivePool) {
    if (field === 'eggGroup') {
      for (const g of parseEggGroups(getRawFieldValue(card, field, theme))) {
        unique.add(g);
      }
    } else {
      unique.add(normalizeEnumValue(getRawFieldValue(card, field, theme), field));
    }
  }
  return unique.size;
}

/** 可用于第 4 次筛选准确提示的字段（含合成提示键） */
export function getReverseAccurateHintCandidates(theme: Theme): string[] {
  const base = getReverseQueryableFields(theme);
  const extras: string[] = [];
  if (theme === 'nba') extras.push('divisionPosition');
  if (theme === 'pokemon') extras.push('weaknessHint');
  return [...new Set([...base, ...extras])];
}

/**
 * 生成一条关于隐藏答案的准确提示，排除 fieldChoices 等字段。
 * 优先选用尚未在本题筛选中使用过的字段。
 */
export function buildReverseAccurateHint(
  theme: Theme,
  answer: CharacterEntry,
  excludeFields: Iterable<string>,
  queriedFields: Iterable<string> = [],
  compareMove: string | null = null
): HintInfo | null {
  const exclude = new Set(excludeFields);
  const queried = new Set(queriedFields);
  const candidates = getReverseAccurateHintCandidates(theme).filter((f) => !exclude.has(f));
  if (candidates.length === 0) return null;

  const preferUnused = candidates.filter((f) => !queried.has(f));
  const pool = preferUnused.length > 0 ? preferUnused : candidates;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (const field of shuffled) {
    try {
      const hint = buildProgressiveHintInfo(theme, answer, field, compareMove);
      if (hint.value !== null && hint.value !== undefined && hint.value !== '') {
        return hint;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export { REVERSE_ACCURATE_HINT_AFTER };

function fieldHasDiscrimination(
  alivePool: CharacterEntry[],
  field: string,
  theme: Theme
): boolean {
  if (isNumericReverseField(theme, field)) {
    const nums: number[] = [];
    for (const card of alivePool) {
      const v = Number(getRawFieldValue(card, field, theme));
      if (!isNaN(v)) nums.push(v);
    }
    if (nums.length < 2) return false;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min !== max;
  }

  const unique = new Set<string>();
  for (const card of alivePool) {
    if (field === 'eggGroup') {
      for (const g of parseEggGroups(getRawFieldValue(card, field, theme))) {
        unique.add(g);
      }
    } else {
      unique.add(normalizeEnumValue(getRawFieldValue(card, field, theme), field));
    }
  }
  return unique.size >= 2;
}

export function getAvailableFields(
  alivePool: CharacterEntry[],
  theme: Theme
): ReverseFieldMeta[] {
  const fields: ReverseFieldMeta[] = [];
  for (const field of getReverseQueryableFields(theme)) {
    if (!fieldHasDiscrimination(alivePool, field, theme)) continue;
    fields.push({
      field,
      label: getExtraReverseFieldLabel(theme, field) ?? getFieldLabel(theme, field),
      kind: isNumericReverseField(theme, field) ? 'numeric' : 'enum',
    });
  }
  return fields;
}

export function getFieldValues(
  alivePool: CharacterEntry[],
  theme: Theme,
  field: string
): ReverseValuesResponse {
  if (isNumericReverseField(theme, field)) {
    const nums: number[] = [];
    for (const card of alivePool) {
      const v = Number(getRawFieldValue(card, field, theme));
      if (!isNaN(v)) nums.push(v);
    }
    nums.sort((a, b) => a - b);
    const min = nums[0] ?? 0;
    const max = nums[nums.length - 1] ?? 0;
    return { kind: 'numeric', min, max };
  }

  const values = new Set<string>();
  for (const card of alivePool) {
    if (field === 'eggGroup') {
      for (const g of parseEggGroups(getRawFieldValue(card, field, theme))) {
        values.add(g);
      }
    } else {
      values.add(normalizeEnumValue(getRawFieldValue(card, field, theme), field));
    }
  }
  return { kind: 'enum', values: [...values].sort((a, b) => a.localeCompare(b, 'zh')) };
}

export function computeNewlyEliminated(
  beforePool: CharacterEntry[],
  afterPool: CharacterEntry[]
): string[] {
  const afterIds = new Set(afterPool.map((c) => c.id));
  return beforePool.filter((c) => !afterIds.has(c.id)).map((c) => c.id);
}

export function formatReverseTag(
  condition: ReverseCondition,
  theme: Theme,
  displayValue?: string | number
): string {
  const label = getFieldLabel(theme, condition.field);
  const val = displayValue ?? condition.value;
  return `${label} ${operatorDisplayLabel(condition.operator)} ${val}`;
}

const playablePoolCache = new Map<Theme, PlayableCardSummary[]>();

export function buildPlayablePool(theme: Theme, questionPoolIds?: string[]): PlayableCardSummary[] {
  const entries = questionPoolIds?.length
    ? getQuestionPoolEntries(theme, questionPoolIds)
    : (() => {
        const cached = playablePoolCache.get(theme);
        if (cached) return null;
        return getBank(theme);
      })();

  if (entries === null) {
    return playablePoolCache.get(theme)!;
  }

  const pool = entries.map((entry) => ({
    id: entry.id,
    name: getDisplayName(entry, theme),
    imageUrl: getCharacterImage(entry),
  }));

  if (!questionPoolIds?.length) {
    playablePoolCache.set(theme, pool);
  }
  return pool;
}

/** Single-pass eliminated id list from query tags (avoids getAlivePool + full bank rescan). */
export function computeEliminatedIds(
  theme: Theme,
  queries: ReverseQueryRecord[],
  questionPoolIds?: string[]
): string[] {
  if (queries.length === 0) return [];
  const bank = resolveQuestionPoolEntries(theme, questionPoolIds);
  const eliminated: string[] = [];
  for (const card of bank) {
    const alive = queries.every((q) => cardCompatibleWithTag(card, q, theme));
    if (!alive) eliminated.push(card.id);
  }
  return eliminated;
}

/**
 * 从存活池挑选 2 个有区分度的字段供二选一。
 * 优先按区分度（不同有效值数量）排序，并排除上一轮 presented 的字段；
 * 若排除后不足 2 个则从全量有区分度字段中回填。
 */
export function pickReverseFieldChoices(
  alivePool: CharacterEntry[],
  theme: Theme,
  excludeFields: string[] = []
): ReverseFieldMeta[] {
  const available = getAvailableFields(alivePool, theme);
  if (available.length === 0) return [];
  if (available.length === 1) return available;

  const excludeSet = new Set(excludeFields);
  const scored = available
    .map((meta) => ({
      ...meta,
      score: countFieldDiscrimination(alivePool, meta.field, theme),
    }))
    .sort((a, b) => b.score - a.score);

  let candidates = scored.filter((f) => !excludeSet.has(f.field));
  if (candidates.length < 2) {
    candidates = scored;
  }

  const topPool = candidates.slice(0, Math.min(4, candidates.length));
  const shuffled = [...topPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 2).map(({ field, label, kind }) => ({ field, label, kind }));
}

export function createInitialReverseState(theme: Theme, answerId: string): ReverseState {
  const questionPoolIds = pickReverseQuestionPoolIds(theme, answerId);
  const pool = getQuestionPoolEntries(theme, questionPoolIds);
  const fieldChoices = pickReverseFieldChoices(pool, theme, []);
  return {
    reverse: true,
    finalGuessUsed: false,
    fieldChoices,
    roundHistory: [],
    phase: 'filtering',
    questionPoolIds,
    recentChoiceFields: fieldChoices.map((c) => c.field),
  };
}

/** 终极猜测猜对：筛选用尽后固定分（无剩余次数加成） */
export function scoreReverseCorrectGuess(): number {
  return REVERSE_SCORE_CORRECT_GUESS;
}

export function scoreReverseWrongGuess(aliveCount: number, totalPool: number): number {
  if (totalPool <= 0) return 0;
  const ratio = 1 - aliveCount / totalPool;
  return Math.round(100 + ratio * 350);
}

/** 筛至唯一：固定底座 + 本题剩余筛选次数奖励（0 次仍高于猜对固定分） */
export function scoreReverseAutoDeduce(attemptsRemaining: number): number {
  return (
    REVERSE_SCORE_AUTO_BASE +
    Math.max(0, attemptsRemaining) * REVERSE_SCORE_AUTO_REMAINING_BONUS
  );
}

export function parseReverseState(raw: string | null | undefined): ReverseState {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (parsed?.reverse === true) {
      const fieldChoices = Array.isArray(parsed.fieldChoices) ? parsed.fieldChoices : [];
      return {
        reverse: true,
        finalGuessUsed: Boolean(parsed.finalGuessUsed),
        fieldChoices,
        roundHistory: Array.isArray(parsed.roundHistory) ? parsed.roundHistory : [],
        phase: parsed.phase === 'guessing' ? 'guessing' : 'filtering',
        questionPoolIds: Array.isArray(parsed.questionPoolIds)
          ? parsed.questionPoolIds.filter((id: unknown) => typeof id === 'string')
          : [],
        recentChoiceFields: Array.isArray(parsed.recentChoiceFields)
          ? parsed.recentChoiceFields.filter((f: unknown) => typeof f === 'string')
          : fieldChoices.map((c: ReverseFieldMeta) => c.field),
        accurateHint:
          parsed.accurateHint &&
          typeof parsed.accurateHint.field === 'string' &&
          typeof parsed.accurateHint.label === 'string'
            ? (parsed.accurateHint as HintInfo)
            : undefined,
      };
    }
  } catch {
    /* fallback */
  }
  return {
    reverse: true,
    finalGuessUsed: false,
    fieldChoices: [],
    roundHistory: [],
    phase: 'filtering',
    questionPoolIds: [],
    recentChoiceFields: [],
  };
}

export function validateCondition(
  theme: Theme,
  condition: ReverseCondition
): string | null {
  const { field, operator, value } = condition;
  if (!getReverseQueryableFields(theme).includes(field)) {
    return '无效字段';
  }
  const allowed = getAllowedOperators(theme, field);
  if (!allowed.includes(operator)) {
    return '无效运算符';
  }
  if (isNumericReverseField(theme, field)) {
    if (typeof value !== 'number' && isNaN(Number(value))) {
      return '数值字段需要数字';
    }
  } else if (value === '' || value === null || value === undefined) {
    return '请选择有效值';
  }
  return null;
}

export function validateFieldInChoices(
  field: string,
  choices: ReverseFieldMeta[]
): string | null {
  if (!choices.some((c) => c.field === field)) {
    return '请从本轮可选字段中挑选';
  }
  return null;
}
