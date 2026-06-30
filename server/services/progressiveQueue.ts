import { CharacterEntry, QuestionSetup, Theme } from '../types';
import {
  buildFootballPrimaryHint,
  getFootballHintFields,
} from './footballHints';
import { getNBAExtraHintFields } from './nbaHints';
import { getPokemonBonusHintFields } from './pokemonHints';
import { getHintFields } from './dataLoader';
import { isHintFieldExcluded } from './footballHints';
import { isNBAHintFieldExcluded } from './nbaHints';

function shuffle<T>(arr: T[], rng?: { next(): number }): T[] {
  const copy = [...arr];
  const rand = (n: number) => (rng ? Math.floor(rng.next() * n) : Math.floor(Math.random() * n));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildProgressiveHintQueueFromSetup(
  theme: Theme,
  setup: QuestionSetup,
  answer: CharacterEntry,
  rng?: { next(): number }
): {
  firstField: string;
  pendingQueue: string[];
  footballPrimaryField?: 'confederation' | 'clubLeague';
} {
  if (theme === 'football') {
    const primary = buildFootballPrimaryHint(answer, rng);
    const pool = shuffle(
      getFootballHintFields().filter((f) => f !== primary.field),
      rng
    );
    return {
      firstField: primary.field,
      pendingQueue: pool,
      footballPrimaryField: primary.field as 'confederation' | 'clubLeague',
    };
  }

  if (theme === 'nba') {
    const pool = shuffle(getNBAExtraHintFields(), rng);
    return {
      firstField: 'divisionPosition',
      pendingQueue: pool.filter((f) => f !== 'divisionPosition'),
    };
  }

  if (theme === 'pokemon') {
    const bonus = getPokemonBonusHintFields(setup.activeFields).filter(
      (f) => f !== setup.hintField
    );
    const fromActive = setup.activeFields.filter(
      (f) => f !== setup.hintField && !bonus.includes(f)
    );
    const pool = [...new Set([...fromActive, ...bonus, ...setup.extraHintFields])].filter(
      (f) => f !== setup.hintField
    );
    return {
      firstField: setup.hintField,
      pendingQueue: shuffle(pool, rng),
    };
  }

  if (theme === 'anime') {
    const pool = getHintFields(theme, setup.activeFields).filter(
      (f) => f !== 'name' && f !== 'anime' && f !== 'affiliation' && f !== setup.hintField
    );
    return {
      firstField: setup.hintField,
      pendingQueue: shuffle(pool, rng),
    };
  }

  const pool = getHintFields(theme, setup.activeFields).filter(
    (f) =>
      f !== 'name' &&
      f !== setup.hintField &&
      !isHintFieldExcluded(f) &&
      !isNBAHintFieldExcluded(f)
  );
  return {
    firstField: setup.hintField,
    pendingQueue: shuffle(pool, rng),
  };
}
