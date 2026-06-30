import geoData from '../data/geo/nationality-regions.json';
import positionGroups from '../data/position-groups.json';
import { CompareResult, Theme } from '../types';

type CountryInfo = { continent: string; groups: string[] };

const countries = geoData.countries as Record<string, CountryInfo>;
const proximityGroups = geoData.proximityGroups as string[][];

function normalizeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toLowerCase();
}

function compareExact(a: unknown, b: unknown): CompareResult {
  if (normalizeStr(a) === normalizeStr(b)) return 'hit';
  return 'miss';
}

function compareNumber(
  guess: unknown,
  answer: unknown,
  closeThreshold: number,
  absoluteClose?: number
): CompareResult {
  const g = Number(guess);
  const a = Number(answer);
  if (isNaN(g) || isNaN(a)) return 'miss';
  if (g === a) return 'hit';
  if (absoluteClose !== undefined && Math.abs(g - a) <= absoluteClose) {
    return 'close';
  }
  if (a !== 0 && Math.abs(g - a) / Math.abs(a) <= closeThreshold) {
    return 'close';
  }
  if (a === 0 && Math.abs(g) <= (absoluteClose ?? 1)) return 'close';
  return 'miss';
}

function positionTokens(position: string): string[] {
  const raw = String(position ?? '').trim();
  if (!raw) return [];
  if (raw.includes('/')) {
    return raw
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [raw];
}

function getPositionGroup(theme: Theme, position: string): string | null {
  const groups = positionGroups[theme as keyof typeof positionGroups] as Record<
    string,
    string[]
  >;
  if (!groups) return null;
  const norm = normalizeStr(position);
  for (const [group, members] of Object.entries(groups)) {
    if (members.some((m) => normalizeStr(m) === norm)) return group;
  }
  for (const token of positionTokens(position)) {
    const tokenNorm = normalizeStr(token);
    for (const [group, members] of Object.entries(groups)) {
      if (members.some((m) => normalizeStr(m) === tokenNorm)) return group;
    }
  }
  return null;
}

function comparePosition(theme: Theme, guess: unknown, answer: unknown): CompareResult {
  const gFull = normalizeStr(String(guess ?? ''));
  const aFull = normalizeStr(String(answer ?? ''));
  if (gFull === aFull) return 'hit';

  const gTokens = positionTokens(String(guess ?? '')).map(normalizeStr);
  const aTokens = positionTokens(String(answer ?? '')).map(normalizeStr);
  if (gTokens.some((gt) => aTokens.includes(gt))) return 'hit';

  const gGroup = getPositionGroup(theme, String(guess ?? ''));
  const aGroup = getPositionGroup(theme, String(answer ?? ''));
  if (gGroup && aGroup && gGroup === aGroup) return 'close';
  return 'miss';
}

function compareNationality(guess: unknown, answer: unknown): CompareResult {
  const g = String(guess ?? '').trim();
  const a = String(answer ?? '').trim();
  if (g === a) return 'hit';

  const gInfo = countries[g];
  const aInfo = countries[a];
  if (!gInfo || !aInfo) return 'miss';

  // 仅按更细的 groups（北欧、西欧、东欧、独联体、中东、东南亚等）判断接近，不再使用大洲级别匹配
  for (const group of proximityGroups) {
    if (group.includes(g) && group.includes(a)) return 'close';
  }

  const gGroups = new Set(gInfo.groups);
  for (const grp of aInfo.groups) {
    if (gGroups.has(grp)) return 'close';
  }

  return 'miss';
}

function compareNullable(guess: unknown, answer: unknown): CompareResult {
  const gNull = guess === null || guess === undefined || guess === '';
  const aNull = answer === null || answer === undefined || answer === '';
  if (gNull && aNull) return 'hit';
  if (gNull || aNull) return 'miss';
  return compareExact(guess, answer);
}

export function parseDraftYear(draft: unknown): number | null {
  const m = String(draft ?? '').match(/(\d{4})年/);
  return m ? Number(m[1]) : null;
}

function parseDraftRound(draft: unknown): number | null {
  const m = String(draft ?? '').match(/(\d{4})年第(\d+)轮/);
  return m ? Number(m[2]) : null;
}

function isUndrafted(draft: unknown): boolean {
  return /落选秀|undrafted/i.test(String(draft ?? ''));
}

function compareDraft(guess: unknown, answer: unknown): CompareResult {
  const g = String(guess ?? '');
  const a = String(answer ?? '');
  if (g === a) return 'hit';

  const gUndrafted = isUndrafted(g);
  const aUndrafted = isUndrafted(a);
  if (gUndrafted && aUndrafted) return 'hit';
  if (gUndrafted || aUndrafted) return 'miss';

  const gy = parseDraftYear(g);
  const ay = parseDraftYear(a);
  if (gy == null || ay == null) return compareExact(guess, answer);
  if (gy === ay) {
    const gr = parseDraftRound(g);
    const ar = parseDraftRound(a);
    if (gr != null && ar != null && gr === ar) return 'hit';
    return 'close';
  }
  return 'miss';
}

/** Answer draft year vs guess: later = answer drafted after guess year */
export function getDraftYearDirection(
  guess: unknown,
  answer: unknown
): 'later' | 'earlier' | null {
  if (isUndrafted(guess) || isUndrafted(answer)) return null;
  const gy = parseDraftYear(guess);
  const ay = parseDraftYear(answer);
  if (gy == null || ay == null || gy === ay) return null;
  return ay > gy ? 'later' : 'earlier';
}

/** UI hint text for NBA draft field comparisons */
export function getDraftCompareHint(
  result: CompareResult,
  guess: unknown,
  answer: unknown
): string | null {
  if (result === 'hit') return null;
  if (result === 'close') return '轮次不对';
  const dir = getDraftYearDirection(guess, answer);
  const year = parseDraftYear(guess);
  if (!dir || year == null) return null;
  return dir === 'later' ? `晚于${year}` : `早于${year}`;
}

const NUMERIC_RULES: Record<
  Theme,
  Record<string, { threshold?: number; absolute?: number }>
> = {
  csgo: {
    age: { absolute: 2 },
    rating: { absolute: 0.08 },
    top20Count: { absolute: 1 },
  },
  football: {
    age: { absolute: 2 },
    marketValue: { threshold: 0.2 },
    height: { absolute: 3 },
  },
  nba: {
    age: { absolute: 2 },
    height: { absolute: 3 },
    playoffCount: { absolute: 1 },
  },
  anime: {
    age: { absolute: 5 },
    height: { absolute: 10 },
    powerLevel: { absolute: 8 },
  },
  pokemon: {
    baseStatTotal: { absolute: 30 },
    hp: { absolute: 15 },
    attack: { absolute: 15 },
    defense: { absolute: 15 },
    spAttack: { absolute: 15 },
    spDefense: { absolute: 15 },
    speed: { absolute: 15 },
  },
};

const POSITION_FIELDS = new Set(['position']);
const NATIONALITY_FIELDS = new Set(['nationality', 'nationalTeam']);
const NULLABLE_FIELDS = new Set(['club', 'school', 'type2']);

const POKEMON_STAT_FIELDS = new Set([
  'baseStatTotal',
  'hp',
  'attack',
  'defense',
  'spAttack',
  'spDefense',
  'speed',
]);

function parseEggGroups(val: unknown): string[] {
  return String(val ?? '')
    .split('、')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Single vs dual egg group: shared group but different count → close with answer hint. */
export function compareEggGroup(
  guessValue: unknown,
  answerValue: unknown
): { result: CompareResult; hint?: string } {
  const g = parseEggGroups(guessValue);
  const a = parseEggGroups(answerValue);
  if (g.length === 0 || a.length === 0) return { result: 'miss' };

  const gKey = [...g].sort().join('|');
  const aKey = [...a].sort().join('|');
  if (gKey === aKey) return { result: 'hit' };

  const shared = g.filter((x) => a.includes(x));
  if (shared.length > 0 && g.length !== a.length) {
    return {
      result: 'close',
      hint: `答案为${a.length >= 2 ? '双蛋群' : '单蛋群'}`,
    };
  }
  return { result: 'miss' };
}

export function compareField(
  theme: Theme,
  field: string,
  guessValue: unknown,
  answerValue: unknown
): CompareResult {
  if (field === 'name') {
    return compareExact(guessValue, answerValue);
  }

  if (NULLABLE_FIELDS.has(field)) {
    return compareNullable(guessValue, answerValue);
  }

  if (NATIONALITY_FIELDS.has(field)) {
    return compareNationality(guessValue, answerValue);
  }

  if (POSITION_FIELDS.has(field)) {
    return comparePosition(theme, guessValue, answerValue);
  }

  if (theme === 'nba' && field === 'draft') {
    return compareDraft(guessValue, answerValue);
  }

  if (theme === 'pokemon' && field === 'eggGroup') {
    return compareEggGroup(guessValue, answerValue).result;
  }

  const rule = NUMERIC_RULES[theme]?.[field];
  if (rule) {
    // Handle string ages like "千年" for anime
    if (typeof guessValue === 'string' || typeof answerValue === 'string') {
      return compareExact(guessValue, answerValue);
    }
    return compareNumber(
      guessValue,
      answerValue,
      rule.threshold ?? 0,
      rule.absolute
    );
  }

  // string enum fields: team, anime, genre, race, occupation
  const exact = compareExact(guessValue, answerValue);
  if (exact === 'hit') return 'hit';

  // race/occupation same category close for anime
  if (theme === 'anime' && ['race', 'occupation'].includes(field)) {
    const gGroup = getPositionGroup('anime', String(guessValue));
    const aGroup = getPositionGroup('anime', String(answerValue));
    if (gGroup && aGroup && gGroup === aGroup) return 'close';
  }

  // team close: same first word or substring (weaker)
  if (field === 'team' || field === 'anime' || field === 'club') {
    const g = normalizeStr(guessValue);
    const a = normalizeStr(answerValue);
    if (g.includes(a) || a.includes(g)) return 'close';
  }

  return 'miss';
}

/** When numeric guess misses, indicate higher or lower than answer */
export function getNumericDirection(
  theme: Theme,
  field: string,
  guessValue: unknown,
  answerValue: unknown
): 'higher' | 'lower' | null {
  const rule = NUMERIC_RULES[theme]?.[field];
  if (!rule) return null;
  if (typeof guessValue === 'string' || typeof answerValue === 'string') return null;

  const g = Number(guessValue);
  const a = Number(answerValue);
  if (isNaN(g) || isNaN(a) || g === a) return null;
  return g > a ? 'higher' : 'lower';
}

export function formatValue(val: unknown, field?: string): string | number | null {
  const empty =
    val === null || val === undefined || (typeof val === 'string' && val.trim() === '');
  if (field === 'club' && empty) return '无';
  if (field === 'school' && empty) return '无';
  if (field === 'type2' && empty) return '无';
  if (empty) return null;
  if (typeof val === 'boolean') return val ? '会' : '不会';
  if (typeof val === 'number') return val;
  return String(val);
}

export function isPokemonStatField(field: string): boolean {
  return POKEMON_STAT_FIELDS.has(field);
}
