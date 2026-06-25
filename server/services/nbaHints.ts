import fs from 'fs';
import path from 'path';
import { CharacterEntry, HintInfo, THEME_FIELDS } from '../types';

const divisions = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'nba.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return {};
    return (parsed.meta?.divisions as Record<string, string>) ?? {};
  } catch {
    return {};
  }
})();

const HINT_EXCLUDE = new Set([
  'name',
  'id',
  'aliases',
  'displayName',
  'imageUrl',
  'englishName',
]);

export function getDivisionHint(team: unknown): string | null {
  const code = String(team || '').trim();
  if (!code) return null;
  return divisions[code] || null;
}

/** Extra NBA hints use normal compare fields (not division). */
export function getNBAHintFields(): string[] {
  return (
    THEME_FIELDS.nba?.map((f) => f.field).filter((k) => !HINT_EXCLUDE.has(k)) ?? []
  );
}

/** First NBA hint: division based on team (Hupu 西南/太平洋/西北/大西洋/东南/中部). */
export function buildNBAPrimaryHint(answer: CharacterEntry): HintInfo {
  const division = getDivisionHint(answer.team);
  return {
    field: 'division',
    label: '所属赛区',
    value: division || '未知赛区球员',
  };
}

export function isNBAHintField(field: string): boolean {
  return field === 'division';
}

export function isNBAHintFieldExcluded(field: string): boolean {
  return HINT_EXCLUDE.has(field) || field === 'division';
}
