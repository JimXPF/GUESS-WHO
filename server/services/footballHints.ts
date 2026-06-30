import fs from 'fs';
import path from 'path';
import { CharacterEntry, HintInfo } from '../types';

type AllowedClubLeague = { id: string; label: string; name: string };

const { confederations, clubLeagues, allowedClubLeagueLabels } = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'football.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { confederations: {}, clubLeagues: {}, allowedClubLeagueLabels: new Set<string>() };
    }
    const allowed = (parsed.meta?.allowedClubLeagues as AllowedClubLeague[] | undefined) ?? [];
    return {
      confederations: (parsed.meta?.confederations as Record<string, string>) ?? {},
      clubLeagues: (parsed.meta?.clubLeagues as Record<string, string>) ?? {},
      allowedClubLeagueLabels: new Set(allowed.map((l) => l.label)),
    };
  } catch {
    return { confederations: {}, clubLeagues: {}, allowedClubLeagueLabels: new Set<string>() };
  }
})();

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

export function hasValidFootballPrimaryHint(entry: CharacterEntry): boolean {
  return Boolean(getConfederationHint(entry.nationalTeam) || resolveClubLeague(entry));
}

/** Whether this player may be chosen as a football question answer. */
export function isPlayableFootballAnswer(entry: CharacterEntry): boolean {
  const conf = getConfederationHint(entry.nationalTeam);
  const league = resolveClubLeague(entry);
  if (!conf && !league) return false;
  if (league && allowedClubLeagueLabels.size > 0 && !allowedClubLeagueLabels.has(league)) {
    return Boolean(conf);
  }
  return true;
}

function pickRandomIndex(length: number, rng?: { next(): number }): number {
  const r = rng?.next() ?? Math.random();
  return Math.floor(r * length);
}

/** First football hint: confederation OR club league with equal priority when both exist. */
export function buildFootballPrimaryHint(
  answer: CharacterEntry,
  rng?: { next(): number },
  forcedField?: 'confederation' | 'clubLeague'
): HintInfo {
  const conf = getConfederationHint(answer.nationalTeam);
  const league = getClubLeagueHint(answer.club, answer);

  const options: HintInfo[] = [];
  if (league) {
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
