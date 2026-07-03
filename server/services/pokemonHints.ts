import { CharacterEntry, HintInfo, ReverseOperator } from '../types';
import { getPokemonTypeChart } from './themeConfig';

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

/** 逆向轰炸：弱点 / 抗性筛选（选属性，不看倍率） */
export const POKEMON_REVERSE_WEAK_FIELD = 'pokemonWeakTo';
export const POKEMON_REVERSE_RESIST_FIELD = 'pokemonResistTo';

type Chart = Record<string, Record<string, number>>;

export interface PokemonTypeMatchupEntry {
  type: string;
  mult: number;
  kind: 'weakness' | 'resistance';
}

const MULT_SNAP = [0, 0.25, 0.5, 1, 2, 4] as const;

function snapMultiplier(mult: number): number {
  for (const s of MULT_SNAP) {
    if (Math.abs(mult - s) < 1e-5) return s;
  }
  return mult;
}

function getTypeChartData(): { chart: Chart; allTypes: string[] } {
  const { types, chart } = getPokemonTypeChart();
  return { chart, allTypes: types };
}

export function getDefensiveMultiplier(defenderTypes: string[], attackType: string): number {
  const { chart } = getTypeChartData();
  let mult = 1;
  for (const def of defenderTypes) {
    const row = chart[def];
    const m = row?.[attackType];
    mult *= m !== undefined ? m : 1;
  }
  return snapMultiplier(mult);
}

function defenderTypes(entry: CharacterEntry): string[] {
  return [entry.type1, entry.type2].filter(Boolean).map(String);
}

/** 防御方相对各攻击属性的倍率（≠1 的才返回） */
export function getPokemonTypeMatchups(entry: CharacterEntry): PokemonTypeMatchupEntry[] {
  const types = defenderTypes(entry);
  if (types.length === 0) return [];

  const { allTypes } = getTypeChartData();
  const entries: PokemonTypeMatchupEntry[] = [];
  for (const atk of allTypes) {
    const mult = getDefensiveMultiplier(types, atk);
    if (mult === 1) continue;
    entries.push({
      type: atk,
      mult,
      kind: mult > 1 ? 'weakness' : 'resistance',
    });
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'weakness' ? -1 : 1;
    if (a.kind === 'weakness') return b.mult - a.mult;
    return a.mult - b.mult;
  });
  return entries;
}

function formatResistanceMultiplier(mult: number): string {
  if (mult === 0) return '无效';
  if (mult === 0.5) return '1/2';
  if (mult === 0.25) return '1/4';
  if (mult > 0 && mult < 1) {
    for (const n of [2, 3, 4, 8]) {
      if (Math.abs(mult - 1 / n) < 1e-5) return `1/${n}`;
    }
  }
  return String(mult);
}

function formatMatchupLine(entry: PokemonTypeMatchupEntry): string {
  if (entry.kind === 'weakness') {
    return `弱点：${entry.type}属性 ×${entry.mult}`;
  }
  const multLabel = formatResistanceMultiplier(entry.mult);
  return `抗性：${entry.type}属性 ${multLabel}`;
}

export function formatPokemonTypeMatchupHintValue(entry: CharacterEntry): string | null {
  const lines = getPokemonTypeMatchups(entry).map(formatMatchupLine);
  return lines.length ? lines.join('\n') : null;
}

export function isPokemonReverseMatchupField(field: string): boolean {
  return field === POKEMON_REVERSE_WEAK_FIELD || field === POKEMON_REVERSE_RESIST_FIELD;
}

export function pokemonEntryMatchupFlags(
  entry: CharacterEntry,
  attackType: string
): { weak: boolean; resist: boolean } {
  const mult = getDefensiveMultiplier(defenderTypes(entry), attackType);
  return { weak: mult > 1, resist: mult < 1 };
}

export function pokemonCardSatisfiesMatchupCondition(
  entry: CharacterEntry,
  field: string,
  operator: ReverseOperator,
  attackType: string
): boolean {
  const type = String(attackType ?? '').trim();
  if (!type) return false;
  const { weak, resist } = pokemonEntryMatchupFlags(entry, type);
  const truth = field === POKEMON_REVERSE_WEAK_FIELD ? weak : resist;
  if (operator === '==') return truth;
  if (operator === '!=') return !truth;
  return false;
}

export function pokemonMatchupFieldHasDiscrimination(
  pool: CharacterEntry[],
  kind: 'weak' | 'resist'
): boolean {
  const { allTypes } = getTypeChartData();
  for (const atk of allTypes) {
    let hasYes = false;
    let hasNo = false;
    for (const card of pool) {
      const flags = pokemonEntryMatchupFlags(card, atk);
      const matches = kind === 'weak' ? flags.weak : flags.resist;
      if (matches) hasYes = true;
      else hasNo = true;
      if (hasYes && hasNo) return true;
    }
  }
  return false;
}

export function getPokemonReverseMatchupValues(
  alivePool: CharacterEntry[],
  kind: 'weak' | 'resist'
): string[] {
  const { allTypes } = getTypeChartData();
  const values: string[] = [];
  for (const atk of allTypes) {
    let hasYes = false;
    let hasNo = false;
    for (const card of alivePool) {
      const flags = pokemonEntryMatchupFlags(card, atk);
      const matches = kind === 'weak' ? flags.weak : flags.resist;
      if (matches) hasYes = true;
      else hasNo = true;
    }
    if (hasYes && hasNo) values.push(atk);
  }
  return values.sort((a, b) => a.localeCompare(b, 'zh'));
}

/** @deprecated 使用 getPokemonTypeMatchups */
export function getPokemonWeaknesses(entry: CharacterEntry): string[] {
  return getPokemonTypeMatchups(entry)
    .filter((e) => e.kind === 'weakness')
    .map((e) => e.type);
}

export function getPokemonMatchupHintTypes(entry: CharacterEntry): string[] {
  return getPokemonTypeMatchups(entry).map((e) => e.type);
}

export function isPokemonHintFieldExcluded(field: string): boolean {
  return HINT_EXCLUDE.has(field);
}

/** 对比格 type1/type2 已 hit 后不再展示 weaknessHint */
export function shouldShowWeaknessHint(hitFields: Set<string>): boolean {
  return !hitFields.has('type1') && !hitFields.has('type2');
}

export function collectProgressivePokemonTypeHits(satisfiedFields: string[] | undefined): Set<string> {
  const hit = new Set<string>();
  for (const f of satisfiedFields ?? []) {
    if (f === 'type1' || f === 'type2') hit.add(f);
  }
  return hit;
}

/** 首提示池 + 额外提示池均含 weaknessHint（随机抽取，不优先）；不进对比格 */
export function getPokemonBonusHintFields(activeFields: string[]): string[] {
  const fromActive = activeFields.filter(
    (f) => !isPokemonHintFieldExcluded(f) && f !== 'learnableMove'
  );
  const pool: string[] = [...fromActive];
  if (activeFields.includes('learnableMove')) {
    pool.push('moveHint');
  }
  pool.push('weaknessHint');
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
  return {
    field: 'weaknessHint',
    label: '属性相克',
    value: formatPokemonTypeMatchupHintValue(answer),
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
