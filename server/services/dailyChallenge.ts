import { db } from '../db';
import { CharacterEntry, QuestionSetup, Theme } from '../types';
import { findCharacterById, getBank, pickRandomCharacter } from './dataLoader';
import { pickActiveFields } from './activeFields';
import { buildPokemonQuestion } from './pokemonQuestion';
import {
  createSeededRng,
  getUtc8DateString,
  hashStringToSeed,
  SeededRng,
} from './seededRng';
import {
  buildFootballPrimaryHint,
  getFootballHintFields,
  isHintFieldExcluded,
} from './footballHints';
import {
  getNBAExtraHintFields,
  isNBAHintFieldExcluded,
} from './nbaHints';
import { getHintFields } from './dataLoader';

const BONUS_HINT_THRESHOLDS = [3, 6, 9];

export interface DailyChallengeRow {
  challenge_date: string;
  theme: Theme;
  answer_id: string;
  hint_field: string;
  extra_hint_fields: string;
  active_fields: string;
  question_compare_move: string | null;
}

function pickQuestionHintsWithRng(
  theme: Theme,
  activeFields: string[],
  answer: CharacterEntry,
  rng: SeededRng
): { primary: string; extra: string[] } {
  if (theme === 'anime') {
    const rest = rng.shuffle(
      getHintFields(theme, activeFields).filter(
        (f) => f !== 'name' && f !== 'anime' && f !== 'affiliation'
      )
    );
    return { primary: 'anime', extra: rest.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  if (theme === 'football') {
    const primaryHint = buildFootballPrimaryHint(answer, rng);
    const extra = rng.shuffle(
      getFootballHintFields().filter((f) => f !== primaryHint.field)
    );
    return { primary: primaryHint.field, extra: extra.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  if (theme === 'nba') {
    const extra = rng.shuffle(getNBAExtraHintFields());
    return { primary: 'divisionPosition', extra: extra.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  const shuffled = rng.shuffle(
    getHintFields(theme, activeFields).filter(
      (f) => f !== 'name' && !isHintFieldExcluded(f) && !isNBAHintFieldExcluded(f)
    )
  );
  return {
    primary: shuffled[0],
    extra: shuffled.slice(1, 1 + BONUS_HINT_THRESHOLDS.length),
  };
}

export function resolveQuestionSetupWithRng(
  theme: Theme,
  answer: CharacterEntry,
  rng: SeededRng
): QuestionSetup {
  if (theme === 'pokemon') {
    const setup = buildPokemonQuestion(answer, rng);
    return {
      answerId: answer.id,
      hintField: setup.hintField,
      extraHintFields: setup.extraHintFields,
      activeFields: setup.activeFields,
      compareMove: setup.compareMove,
    };
  }
  const activeFields = pickActiveFields(theme);
  const { primary, extra } = pickQuestionHintsWithRng(theme, activeFields, answer, rng);
  return {
    answerId: answer.id,
    hintField: primary,
    extraHintFields: extra,
    activeFields,
    compareMove: null,
  };
}

export function getDailyChallengeDate(): string {
  return getUtc8DateString();
}

export function getOrCreateDailyChallenge(theme: Theme): DailyChallengeRow {
  const challengeDate = getDailyChallengeDate();
  const existing = db
    .prepare(
      `SELECT challenge_date, theme, answer_id, hint_field, extra_hint_fields, active_fields, question_compare_move
       FROM daily_challenges WHERE challenge_date = ? AND theme = ?`
    )
    .get(challengeDate, theme) as DailyChallengeRow | undefined;

  if (existing) return existing;

  const seed = hashStringToSeed(`${challengeDate}:${theme}`);
  const rng = createSeededRng(seed);
  const answer = pickRandomCharacter(theme, [], rng);
  const setup = resolveQuestionSetupWithRng(theme, answer, rng);

  db.prepare(
    `INSERT INTO daily_challenges (challenge_date, theme, answer_id, hint_field, extra_hint_fields, active_fields, question_compare_move)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    challengeDate,
    theme,
    setup.answerId,
    setup.hintField,
    JSON.stringify(setup.extraHintFields),
    JSON.stringify(setup.activeFields),
    setup.compareMove
  );

  return {
    challenge_date: challengeDate,
    theme,
    answer_id: setup.answerId,
    hint_field: setup.hintField,
    extra_hint_fields: JSON.stringify(setup.extraHintFields),
    active_fields: JSON.stringify(setup.activeFields),
    question_compare_move: setup.compareMove,
  };
}

export function dailyRowToSetup(row: DailyChallengeRow): QuestionSetup {
  return {
    answerId: row.answer_id,
    hintField: row.hint_field,
    extraHintFields: JSON.parse(row.extra_hint_fields || '[]'),
    activeFields: JSON.parse(row.active_fields || '[]'),
    compareMove: row.question_compare_move,
  };
}

export function generateQuestionQueue(
  theme: Theme,
  count: number,
  seedInput: string
): QuestionSetup[] {
  const rng = createSeededRng(hashStringToSeed(seedInput));
  const queue: QuestionSetup[] = [];
  const used: string[] = [];
  for (let i = 0; i < count; i++) {
    const answer = pickRandomCharacter(theme, used, rng);
    used.push(answer.id);
    queue.push(resolveQuestionSetupWithRng(theme, answer, rng));
  }
  return queue;
}

export function setupToCharacter(theme: Theme, setup: QuestionSetup): CharacterEntry {
  return findCharacterById(theme, setup.answerId)!;
}
