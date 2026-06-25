import fs from 'fs';
import path from 'path';
import { CharacterEntry, THEME_FIELDS, Theme } from '../types';
import { computeAgeFromBirthDate, computeAgeFromReferenceYear, normalizeBirthDate } from './ageUtils';
import { isPlayableFootballAnswer } from './footballHints';

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
  anime: [],
};

function loadBank(theme: Theme): CharacterEntry[] {
  const file = readThemeFile(theme);
  banks[theme] = file.players;
  return file.players;
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
    const keys: Array<{ key: string; label: string; sublabel?: string }> = [];

    if (theme === 'csgo') {
      const displayLabel = String(entry.name || entry.id);
      keys.push({ key: normalizeText(entry.id), label: displayLabel });
      if (entry.name && normalizeText(entry.name) !== normalizeText(entry.id)) {
        keys.push({ key: normalizeText(entry.name), label: displayLabel });
      }
      for (const a of entry.aliases || []) {
        keys.push({ key: normalizeText(a), label: displayLabel });
      }
    } else {
      keys.push({ key: normalizeText(entry.name), label: entry.name });
      if (entry.englishName) {
        keys.push({
          key: normalizeText(entry.englishName),
          label: entry.name,
          sublabel: entry.englishName,
        });
      }
      for (const a of entry.aliases || []) {
        keys.push({
          key: normalizeText(a),
          label: entry.name,
          sublabel: a !== entry.name ? String(a) : undefined,
        });
      }
      // 仅匹配名字，不再匹配 anime / team 等字段，避免输入“咒术”“湖人”等泄露大量角色
    }

    for (const { key, label, sublabel } of keys) {
      if (!key) continue;
      let score = -1;
      if (key === normalized) score = 100;
      else if (key.startsWith(normalized)) score = 90 - (key.length - normalized.length);
      else if (isCharSubsequence(key, normalized)) {
        // 逐字顺序包含输入字符（中文逐字分词友好）
        score = 85 - (key.length - normalized.length) * 2;
      } else if (key.includes(normalized)) score = 70 - (key.length - normalized.length);
      else if (normalized.includes(key) && key.length >= 2) score = 45;

      if (score >= 0) {
        let fallbackSublabel = sublabel;
        if (!fallbackSublabel) {
          if (theme === 'csgo') {
            fallbackSublabel = String(entry.team || '');
          } else if (theme === 'nba' && entry.team) {
            fallbackSublabel = getNBATeamDisplay(String(entry.team));
          } else {
            fallbackSublabel = String(entry.anime || entry.team || '');
          }
        }
        scored.push({
          id: entry.id,
          label,
          sublabel: theme === 'csgo' ? String(entry.team || '') : fallbackSublabel,
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
  excludeIds: string[] = []
): CharacterEntry {
  let bank = getBank(theme).filter((c) => !excludeIds.includes(c.id));
  if (theme === 'football') {
    bank = bank.filter(isPlayableFootballAnswer);
  }
  if (bank.length === 0) {
    throw new Error('No characters available');
  }
  return bank[Math.floor(Math.random() * bank.length)];
}

export function getHintFields(theme: Theme): string[] {
  const exclude = new Set([
    'name',
    'id',
    'aliases',
    'displayName',
    'imageUrl',
    'englishName',
    'xhsPlayerId',
  ]);
  const fromTheme = THEME_FIELDS[theme]?.map((f) => f.field) ?? [];
  if (fromTheme.length) {
    return fromTheme.filter((k) => !exclude.has(k));
  }
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
  return theme === 'csgo' ? '输入选手 ID，如 NiKo、donk...' : '输入人物中文名...';
}
