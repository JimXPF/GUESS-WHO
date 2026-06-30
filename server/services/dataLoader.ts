import fs from 'fs';
import path from 'path';
import { CharacterEntry, THEME_FIELDS, Theme } from '../types';
import { computeAgeFromBirthDate, computeAgeFromReferenceYear, normalizeBirthDate } from './ageUtils';
import { isPlayableFootballAnswer } from './footballHints';
import { getDivisionHint, isPlayableNBAAnswer } from './nbaHints';

interface ThemeFile {
  version?: number;
  updatedAt?: string;
  players: CharacterEntry[];
  meta?: Record<string, unknown>;
}

function readThemeFile(theme: Theme): ThemeFile {
  const filePath = path.join(__dirname, '..', 'data', `${theme}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (Array.isArray(raw)) {
    return { players: raw, meta: {} };
  }
  return {
    version: raw.version,
    updatedAt: raw.updatedAt,
    players: raw.players ?? [],
    meta: raw.meta ?? {},
  };
}

const nbaMeta = readThemeFile('nba').meta ?? {};
const nbaTeamMap: Record<string, string> = (nbaMeta.teams as Record<string, string>) ?? {};
const nbaPositionMap: Record<string, string> = (nbaMeta.positions as Record<string, string>) ?? {};

export function getNBATeamDisplay(team: string): string {
  return nbaTeamMap[team] || team;
}

export function getNBAPositionDisplay(pos: string): { zh: string; en: string } {
  const zh = nbaPositionMap[pos] || pos;
  return { zh, en: pos };
}

/** Resolve field for compare/hints; age is computed dynamically when possible. */
export function getCharacterField(
  entry: CharacterEntry,
  field: string,
  theme: Theme
): unknown {
  if (field === 'age') {
    if (theme === 'football') {
      const age = computeAgeFromReferenceYear(entry.age);
      if (age != null) return age;
    } else {
      const bd = normalizeBirthDate(entry.birthDate);
      if (bd) {
        const age = computeAgeFromBirthDate(bd);
        if (age != null) return age;
      }
    }
  }
  return entry[field];
}

const banks: Record<Theme, CharacterEntry[]> = {
  csgo: [],
  football: [],
  nba: [],
  pokemon: [],
};

function loadBank(theme: Theme): CharacterEntry[] {
  const file = readThemeFile(theme);
  let players = file.players;
  if (theme === 'nba') {
    players = players.filter(isPlayableNBAAnswer);
  }
  banks[theme] = players;
  return players;
}

export function getBank(theme: Theme): CharacterEntry[] {
  if (banks[theme].length === 0) {
    return loadBank(theme);
  }
  return banks[theme];
}

export function getCharacter(theme: Theme, id: string): CharacterEntry | undefined {
  return getBank(theme).find((c) => c.id === id);
}

export function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·・\-—－–]/g, '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );
}

/** 检查 key 是否按顺序包含 query 的每个字符（支持中文逐字输入匹配） */
function isCharSubsequence(key: string, query: string): boolean {
  let i = 0;
  for (const ch of key) {
    if (ch === query[i]) i++;
    if (i === query.length) return true;
  }
  return false;
}

const NAME_SEGMENT_SPLIT = /[·・\-—－–]/;

function scoreNameKey(key: string, normalized: string): number {
  if (!key) return -1;
  if (key === normalized) return 100;
  if (key.startsWith(normalized)) return 90 - (key.length - normalized.length);
  if (isCharSubsequence(key, normalized)) {
    return 85 - (key.length - normalized.length) * 2;
  }
  if (key.includes(normalized)) return 70 - (key.length - normalized.length);
  if (normalized.includes(key) && key.length >= 2) return 45;
  return -1;
}

/** Score a display name and its ·/- segments (suffix queries like 阿伦 → 贾勒特·阿伦). */
function scoreNameMatch(raw: string, normalized: string): number {
  let best = scoreNameKey(normalizeText(raw), normalized);
  for (const seg of raw.split(NAME_SEGMENT_SPLIT)) {
    const segScore = scoreNameKey(normalizeText(seg), normalized);
    if (segScore >= 0) {
      // Exact segment match ranks above full-name subsequence but below full-name exact match.
      const boosted = segScore === 100 ? 96 : segScore;
      if (boosted > best) best = boosted;
    }
  }
  return best;
}

export function getDisplayName(entry: CharacterEntry, theme: Theme): string {
  if (theme === 'csgo') {
    return String(entry.name || entry.id);
  }
  return entry.name;
}

/** Value used for name-field comparison */
export function getNameFieldValue(entry: CharacterEntry, theme: Theme): string {
  if (theme === 'csgo') {
    return entry.id;
  }
  return getDisplayName(entry, theme);
}

/** Standardized search dropdown sublabel per theme (never alias/englishName). */
export function getSearchSublabel(entry: CharacterEntry, theme: Theme): string | undefined {
  switch (theme) {
    case 'csgo':
      return String(entry.team || '') || undefined;
    case 'football': {
      const national = String(entry.nationalTeam || '');
      const club = String(entry.club || '');
      if (national && club) return `${national}/${club}`;
      return national || club || undefined;
    }
    case 'nba': {
      const team = String(entry.team || '');
      if (!team) return undefined;
      const teamDisplay = getNBATeamDisplay(team);
      const division = getDivisionHint(entry.team);
      if (division) {
        const divisionLabel = division.replace(/球员$/, '');
        return `${divisionLabel}-${teamDisplay}`;
      }
      return teamDisplay;
    }
    case 'pokemon': {
      const t1 = entry.type1 ? String(entry.type1) : '';
      const t2 = entry.type2 ? String(entry.type2) : '';
      if (t1 && t2) return `${t1}/${t2}`;
      return t1 || undefined;
    }
    default:
      return undefined;
  }
}

export function searchCharacters(
  theme: Theme,
  query: string,
  limit = 8
): Array<{ id: string; label: string; sublabel?: string }> {
  const normalized = normalizeText(query);
  if (!normalized || normalized.length < 1) return [];

  const bank = getBank(theme);
  const scored: Array<{ id: string; label: string; sublabel?: string; score: number }> = [];

  for (const entry of bank) {
    const keys: Array<{ key: string; label: string; raw?: string }> = [];

    if (theme === 'csgo') {
      const displayLabel = String(entry.name || entry.id);
      keys.push({ key: normalizeText(entry.id), label: displayLabel });
      if (entry.name && normalizeText(entry.name) !== normalizeText(entry.id)) {
        keys.push({ key: normalizeText(entry.name), label: displayLabel, raw: String(entry.name) });
      }
      for (const a of entry.aliases || []) {
        keys.push({ key: normalizeText(a), label: displayLabel, raw: String(a) });
      }
    } else {
      keys.push({ key: normalizeText(entry.name), label: entry.name, raw: entry.name });
      if (entry.englishName) {
        keys.push({
          key: normalizeText(entry.englishName),
          label: entry.name,
          raw: String(entry.englishName),
        });
      }
      for (const a of entry.aliases || []) {
        keys.push({ key: normalizeText(a), label: entry.name, raw: String(a) });
      }
      // 仅匹配名字，不再匹配 team 等字段，避免输入“湖人”等泄露大量角色
    }

    const sublabel = getSearchSublabel(entry, theme);

    for (const { key, label, raw } of keys) {
      const score = raw ? scoreNameMatch(raw, normalized) : scoreNameKey(key, normalized);

      if (score >= 0) {
        scored.push({
          id: entry.id,
          label,
          sublabel,
          score,
        });
        break;
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: Array<{ id: string; label: string; sublabel?: string }> = [];
  for (const item of scored) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({ id: item.id, label: item.label, sublabel: item.sublabel });
    if (out.length >= limit) break;
  }
  return out;
}

export function findCharacterByGuess(
  theme: Theme,
  guessText: string
): CharacterEntry | null {
  const normalized = normalizeText(guessText);
  if (!normalized) return null;

  const bank = getBank(theme);

  // Exact match only — prevents fuzzy misidentification (e.g. 克里斯保罗 → 希罗)
  for (const entry of bank) {
    if (theme === 'csgo') {
      if (normalizeText(entry.id) === normalized) return entry;
      if (normalizeText(entry.name) === normalized) return entry;
      for (const a of entry.aliases || []) {
        if (normalizeText(a) === normalized) return entry;
      }
    } else {
      if (normalizeText(entry.name) === normalized) return entry;
      if (entry.englishName && normalizeText(entry.englishName) === normalized) return entry;
      for (const a of entry.aliases || []) {
        if (normalizeText(a) === normalized) return entry;
      }
    }
  }

  return null;
}

export function findCharacterById(theme: Theme, id: string): CharacterEntry | null {
  return getBank(theme).find((c) => c.id === id) ?? null;
}

export function pickRandomCharacter(
  theme: Theme,
  excludeIds: string[] = [],
  rng?: { next(): number }
): CharacterEntry {
  let bank = getBank(theme).filter((c) => !excludeIds.includes(c.id));
  if (theme === 'football') {
    bank = bank.filter(isPlayableFootballAnswer);
  }
  if (theme === 'nba') {
    bank = bank.filter(isPlayableNBAAnswer);
  }
  if (bank.length === 0) {
    throw new Error('No characters available');
  }
  const r = rng?.next() ?? Math.random();
  return bank[Math.floor(r * bank.length)];
}

export function getHintFields(theme: Theme, activeFields?: string[]): string[] {
  const exclude = new Set([
    'name',
    'id',
    'aliases',
    'displayName',
    'imageUrl',
    'englishName',
    'xhsPlayerId',
    'dexNumber',
    'hiddenAbility',
    'gen3LevelMoves',
    'learnableMove',
  ]);
  const fromTheme = (activeFields ?? THEME_FIELDS[theme]?.map((f) => f.field) ?? []).filter(
    (k) => !exclude.has(k)
  );
  if (fromTheme.length) return fromTheme;
  const sample = getBank(theme)[0];
  if (!sample) return [];
  return Object.keys(sample).filter((k) => !exclude.has(k));
}

export function getCharacterImage(entry: CharacterEntry): string | null {
  const url = entry.imageUrl;
  if (typeof url === 'string' && url.startsWith('http')) return url;
  return null;
}

export function getGuessPlaceholder(theme: Theme): string {
  if (theme === 'csgo') return '输入选手 ID，如 NiKo、donk...';
  if (theme === 'pokemon') return '输入宝可梦中文名，如 皮卡丘...';
  return '输入人物中文名...';
}
