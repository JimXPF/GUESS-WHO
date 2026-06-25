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

/** Whether this player may be chosen as a football question answer. */
export function isPlayableFootballAnswer(entry: CharacterEntry): boolean {
  if (allowedClubLeagueLabels.size === 0) return true;
  const league = resolveClubLeague(entry);
  return Boolean(league && allowedClubLeagueLabels.has(league));
}

function preferLeagueHint(answer: CharacterEntry, hasLeague: boolean, hasConf: boolean): boolean {
  if (!hasLeague) return false;
  if (!hasConf) return true;
  let hash = 0;
  const key = String(answer.id || answer.name || '');
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i)) % 100;
  return hash < 55;
}

/** First football hint: confederation OR club league (prefer league when available). */
export function buildFootballPrimaryHint(answer: CharacterEntry): HintInfo {
  const conf = getConfederationHint(answer.nationalTeam);
  const league = getClubLeagueHint(answer.club, answer);

  const hasLeague = Boolean(league);
  const hasConf = Boolean(conf);
  const useLeague = preferLeagueHint(answer, hasLeague, hasConf);

  if (useLeague) {
    return { field: 'clubLeague', label: '所属联赛', value: league! };
  }
  if (hasConf) {
    return { field: 'confederation', label: '所属足联', value: conf! };
  }
  if (hasLeague) {
    return { field: 'clubLeague', label: '所属联赛', value: league! };
  }
  return { field: 'confederation', label: '所属足联', value: '未知足联球员' };
}

export function isFootballHintField(field: string): boolean {
  return field === 'confederation' || field === 'clubLeague';
}

export function isHintFieldExcluded(field: string): boolean {
  return HINT_EXCLUDE.has(field);
}
