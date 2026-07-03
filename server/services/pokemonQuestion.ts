import { CharacterEntry, HintInfo } from '../types';
import { getFieldLabel } from '../types';
import {
  buildPokemonMoveHint,
  buildPokemonWeaknessHint,
  getPokemonBonusHintFields,
  guessKnowsMove,
  pickCompareMove,
  shouldShowWeaknessHint,
} from './pokemonHints';
import { SeededRng, createSeededRng } from './seededRng';

const STAT_FIELDS = [
  'baseStatTotal',
  'hp',
  'attack',
  'defense',
  'spAttack',
  'spDefense',
  'speed',
] as const;

const OPTIONAL_FIELDS = [
  'type2',
  'evolutionStage',
  'category',
  'ability',
  'eggGroup',
] as const;

const PRIMARY_HINT_POOL = ['category', 'ability', 'eggGroup', 'moveHint', 'weaknessHint'] as const;

export type PokemonPrimaryHint = (typeof PRIMARY_HINT_POOL)[number];

export interface PokemonQuestionSetup {
  hintField: string;
  extraHintFields: string[];
  activeFields: string[];
  compareMove: string | null;
}

function defaultRng(): SeededRng {
  return createSeededRng(Math.floor(Math.random() * 0xffffffff));
}

/** 属性2 紧跟属性1，其余保持相对顺序 */
export function orderPokemonActiveFields(fields: string[]): string[] {
  const others = fields.filter((f) => f !== 'type1' && f !== 'type2');
  const ordered: string[] = [];
  if (fields.includes('type1')) ordered.push('type1');
  if (fields.includes('type2')) ordered.push('type2');
  for (const f of fields) {
    if (f !== 'type1' && f !== 'type2') ordered.push(f);
  }
  return ordered.length ? ordered : others;
}

function pickCompareFields(primaryHint: PokemonPrimaryHint, rng: SeededRng): string[] {
  const statField = rng.pickOne(STAT_FIELDS);
  const optionalPool = rng.shuffle([...OPTIONAL_FIELDS]);

  if (primaryHint === 'moveHint') {
    const others = optionalPool.slice(0, 3);
    return orderPokemonActiveFields(['type1', statField, 'learnableMove', ...others]);
  }

  const others = optionalPool.slice(0, 4);
  let fields = orderPokemonActiveFields(['type1', statField, ...others]);
  if (!fields.includes(primaryHint)) {
    fields = orderPokemonActiveFields([...fields, primaryHint]);
  }
  return fields;
}

export function buildPokemonQuestion(
  answer: CharacterEntry,
  rng: SeededRng = defaultRng()
): PokemonQuestionSetup {
  const primaryHint = rng.pickOne(PRIMARY_HINT_POOL);
  const activeFields = pickCompareFields(primaryHint, rng);
  const compareMove =
    primaryHint === 'moveHint' ? pickCompareMove(answer, rng) : null;

  const extraHintFields = rng
    .shuffle(getPokemonBonusHintFields(activeFields).filter((f) => f !== primaryHint))
    .slice(0, 3);

  return {
    hintField: primaryHint,
    extraHintFields,
    activeFields,
    compareMove,
  };
}

export function buildPokemonHint(
  answer: CharacterEntry,
  hintField: string,
  compareMove: string | null
): HintInfo {
  if (hintField === 'moveHint') {
    const move = compareMove ?? pickCompareMove(answer);
    return {
      field: 'moveHint',
      label: '可学会招式',
      value: move,
    };
  }
  if (hintField === 'weaknessHint') {
    return buildPokemonWeaknessHint(answer);
  }
  const value = answer[hintField];
  return {
    field: hintField,
    label: getFieldLabel('pokemon', hintField),
    value:
      value === null || value === undefined || value === ''
        ? null
        : typeof value === 'number'
          ? value
          : String(value),
  };
}

export { guessKnowsMove, pickCompareMove, shouldShowWeaknessHint, buildPokemonMoveHint, buildPokemonWeaknessHint };
