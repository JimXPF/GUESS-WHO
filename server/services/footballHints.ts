import { CharacterEntry, HintInfo } from '../types';
import { getThemeConfig } from './themeConfig';

type AllowedClubLeague = { id: string; label: string; name: string };

const footballConfig = getThemeConfig('football');
const allowedClubLeagues =
  (footballConfig.allowedClubLeagues as AllowedClubLeague[] | undefined) ?? [];
const confederations = (footballConfig.confederations as Record<string, string>) ?? {};
const clubLeagues = (footballConfig.clubLeagues as Record<string, string>) ?? {};
const allowedClubLeagueLabels = new Set(allowedClubLeagues.map((l) => l.label));

const HINT_EXCLUDE = new Set([
  'name',
  'id',
  'aliases',
  'displayName',
  'imageUrl',
  'englishName',
  'xhsPlayerId',
  'clubLeague',
]);

export function getFootballHintFields(): string[] {
  return ['club', 'nationalTeam', 'age', 'marketValue', 'height', 'position'];
}

export function getConfederationHint(nationalTeam: unknown): string | null {
  const team = String(nationalTeam || '').trim();
  if (!team) return null;
  return confederations[team] || null;
}

export function resolveClubLeague(entry: CharacterEntry): string | null {
  if (entry.clubLeague && typeof entry.clubLeague === 'string') {
    return entry.clubLeague;
  }
  const club = String(entry.club || '').trim();
  if (!club || club === '无') return null;
  return clubLeagues[club] || null;
}

export function getClubLeagueHint(club: unknown, entry?: CharacterEntry): string | null {
  if (entry) return resolveClubLeague(entry);
  const name = String(club || '').trim();
  if (!name || name === '无') return null;
  return clubLeagues[name] || null;
}

export function isAllowedClubLeague(league: string | null | undefined): boolean {
  if (!league) return false;
  if (allowedClubLeagueLabels.size === 0) return true;
  return allowedClubLeagueLabels.has(league);
}

export function hasValidFootballPrimaryHint(entry: CharacterEntry): boolean {
  return isPlayableFootballAnswer(entry);
}

/**
 * 足球答案池（`filterAtQuestionTime`）：仅 config.allowedClubLeagues 内联赛球员。
 * 与首提示无关——首提示在已选答案上另随机联赛或足联（见 buildFootballPrimaryHint）。
 */
export function isPlayableFootballAnswer(entry: CharacterEntry): boolean {
  return isAllowedClubLeague(resolveClubLeague(entry));
}

function pickRandomIndex(length: number, rng?: { next(): number }): number {
  const r = rng?.next() ?? Math.random();
  return Math.floor(r * length);
}

/** 首提示：在已选答案上，联赛与足联等概率二选一（两者皆有则 50/50）。 */
export function buildFootballPrimaryHint(
  answer: CharacterEntry,
  rng?: { next(): number },
  forcedField?: 'confederation' | 'clubLeague'
): HintInfo {
  const conf = getConfederationHint(answer.nationalTeam);
  const league = getClubLeagueHint(answer.club, answer);

  const options: HintInfo[] = [];
  if (league && isAllowedClubLeague(league)) {
    options.push({ field: 'clubLeague', label: '所属联赛', value: league });
  }
  if (conf) {
    options.push({ field: 'confederation', label: '所属足联', value: conf });
  }

  if (forcedField) {
    const found = options.find((o) => o.field === forcedField);
    if (found) return found;
  }

  if (options.length === 0) {
    return { field: 'confederation', label: '所属足联', value: '未知足联球员' };
  }
  if (options.length === 1) return options[0];
  return options[pickRandomIndex(options.length, rng)];
}

export function buildFootballSyntheticHint(
  answer: CharacterEntry,
  field: 'confederation' | 'clubLeague'
): HintInfo {
  return buildFootballPrimaryHint(answer, undefined, field);
}

export function isFootballHintField(field: string): boolean {
  return field === 'confederation' || field === 'clubLeague';
}

export function isHintFieldExcluded(field: string): boolean {
  return HINT_EXCLUDE.has(field);
}
