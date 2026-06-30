import typeChart from '../data/pokemon-type-chart.json';
import { CharacterEntry, HintInfo } from '../types';

const HINT_EXCLUDE = new Set([
  'dexNumber',
  'hiddenAbility',
  'color',
  'captureTier',
  'gen3LevelMoves',
  'learnableMove',
  'imageUrl',
  'englishName',
  'aliases',
]);

const TYPE_FIELDS = new Set(['type1', 'type2']);

type Chart = Record<string, Record<string, number>>;

const chart = typeChart.chart as Chart;
const allTypes = typeChart.types as string[];

function getDefensiveMultiplier(defenderTypes: string[], attackType: string): number {
  let mult = 1;
  for (const def of defenderTypes) {
    const row = chart[def];
    const m = row?.[attackType];
    mult *= m !== undefined ? m : 1;
  }
  return mult;
}

export function getPokemonWeaknesses(entry: CharacterEntry): string[] {
  const types = [entry.type1, entry.type2].filter(Boolean).map(String);
  if (types.length === 0) return [];

  const weak: string[] = [];
  for (const atk of allTypes) {
    const mult = getDefensiveMultiplier(types, atk);
    if (mult >= 2 && mult > 0) weak.push(atk);
  }
  return weak;
}

export function isPokemonHintFieldExcluded(field: string): boolean {
  return HINT_EXCLUDE.has(field);
}

export function shouldShowWeaknessHint(activeFields: string[]): boolean {
  return !activeFields.some((f) => TYPE_FIELDS.has(f));
}

/** Bonus hints must appear in compare grid, except synthetic weaknessHint / moveHint when learnableMove is active */
export function getPokemonBonusHintFields(activeFields: string[]): string[] {
  const fromActive = activeFields.filter(
    (f) => !isPokemonHintFieldExcluded(f) && f !== 'learnableMove'
  );
  const pool: string[] = [...fromActive];
  if (activeFields.includes('learnableMove')) {
    pool.push('moveHint');
  }
  if (shouldShowWeaknessHint(activeFields)) {
    pool.push('weaknessHint');
  }
  return pool;
}

export function buildPokemonMoveHint(answer: CharacterEntry): HintInfo {
  const moves = (answer.gen3LevelMoves as string[] | undefined) ?? [];
  const move = moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)] : null;
  return {
    field: 'moveHint',
    label: '可学会招式',
    value: move,
  };
}

export function buildPokemonWeaknessHint(answer: CharacterEntry): HintInfo {
  const weak = getPokemonWeaknesses(answer);
  return {
    field: 'weaknessHint',
    label: '属性弱点',
    value: weak.length ? weak.join('、') : null,
  };
}

export function pickCompareMove(answer: CharacterEntry, rng?: { next(): number }): string | null {
  const moves = (answer.gen3LevelMoves as string[] | undefined) ?? [];
  if (moves.length === 0) return null;
  const r = rng?.next() ?? Math.random();
  return moves[Math.floor(r * moves.length)];
}

export function guessKnowsMove(entry: CharacterEntry, move: string): boolean {
  const moves = (entry.gen3LevelMoves as string[] | undefined) ?? [];
  return moves.includes(move);
}
