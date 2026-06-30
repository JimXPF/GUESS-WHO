import fs from 'fs';
import path from 'path';
import { CharacterEntry, HintInfo, THEME_FIELDS } from '../types';

const { divisions, positions } = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'nba.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { divisions: {}, positions: {} };
    return {
      divisions: (parsed.meta?.divisions as Record<string, string>) ?? {},
      positions: (parsed.meta?.positions as Record<string, string>) ?? {},
    };
  } catch {
    return { divisions: {}, positions: {} };
  }
})();

const playableMinTotalGpSince2025 = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'nba.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const v = parsed.meta?.playableMinTotalGpSince2025;
    return typeof v === 'number' && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
})();

export function getPlayableMinTotalGpSince2025(): number {
  return playableMinTotalGpSince2025;
}

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

function getPositionZh(pos: unknown): string {
  const code = String(pos || '').trim();
  if (!code) return '未知位置';
  return positions[code] || code;
}

const DRAFT_ROUND_LABELS: Record<number, string> = {
  1: '首轮秀',
  2: '次轮秀',
};

/** 选秀字符串中仅保留轮次展示（不含年份），如「2024年第2轮」→「次轮秀」 */
export function getDraftRoundHint(draft: unknown): string | null {
  const s = String(draft || '').trim();
  if (!s) return null;
  if (s === '落选秀') return '落选秀';
  const m = s.match(/第(\d+)轮/);
  if (m) {
    const round = parseInt(m[1], 10);
    return DRAFT_ROUND_LABELS[round] ?? `第${round}轮`;
  }
  const stripped = s.replace(/^\d{4}年/, '').trim();
  return stripped || null;
}

/** Compare fields usable as extra hints (excludes division composite field key). */
export function getNBAExtraHintFields(): string[] {
  return (
    THEME_FIELDS.nba?.map((f) => f.field).filter(
      (k) => !HINT_EXCLUDE.has(k) && k !== 'division' && k !== 'divisionPosition'
    ) ?? []
  );
}

/** First NBA hint: division + draft round (year omitted). */
export function buildNBAPrimaryHint(answer: CharacterEntry): HintInfo {
  const division = getDivisionHint(answer.team);
  const divLabel = division ? division.replace(/球员$/, '') : '未知赛区';
  const roundLabel = getDraftRoundHint(answer.draft) ?? '未知轮次';
  return {
    field: 'divisionPosition',
    label: '赛区·选秀轮次',
    value: `${divLabel} · ${roundLabel}`,
  };
}

export function isNBAHintField(field: string): boolean {
  return field === 'division' || field === 'divisionPosition';
}

export function isNBAHintFieldExcluded(field: string): boolean {
  return (
    HINT_EXCLUDE.has(field) ||
    field === 'division' ||
    field === 'divisionPosition' ||
    field === 'position'
  );
}

/** Hupu 2025+ career data + min games since 2025 (meta.playableMinTotalGpSince2025). */
export function isPlayableNBAAnswer(entry: CharacterEntry): boolean {
  if (entry.hasCareerSince2025 !== true) return false;
  const minGp = playableMinTotalGpSince2025;
  if (minGp <= 0) return true;
  const total = entry.totalGpSince2025;
  const best = entry.bestGpSince2025;
  const gp =
    typeof total === 'number' && typeof best === 'number'
      ? Math.max(total, best)
      : typeof best === 'number'
        ? best
        : total;
  if (gp == null || typeof gp !== 'number') return false;
  return gp >= minGp;
}

export function getNBAPositionLabel(entry: CharacterEntry): string {
  return getPositionZh(entry.position);
}
