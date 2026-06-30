import {
  CharacterEntry,
  HintInfo,
  PROGRESSIVE_LIVES,
  ProgressiveGuessEntry,
  ProgressiveRound,
  ProgressiveState,
  QuestionSetup,
  Theme,
} from '../types';
import { compareField } from './compareEngine';
import {
  getCharacterField,
  getNameFieldValue,
  getNBATeamDisplay,
} from './dataLoader';
import {
  buildFootballPrimaryHint,
  buildFootballSyntheticHint,
  getConfederationHint,
  getFootballHintFields,
  getClubLeagueHint,
  isFootballHintField,
} from './footballHints';
import {
  buildNBAPrimaryHint,
  getDivisionHint,
  getDraftRoundHint,
  getNBAExtraHintFields,
  getNBAPositionLabel,
  isNBAHintField,
} from './nbaHints';
import { buildPokemonHint } from './pokemonQuestion';
import { getPokemonWeaknesses, guessKnowsMove } from './pokemonHints';
import { buildHint as buildThemeHint } from './gameServiceHelpers';
import { getPokemonBonusHintFields } from './pokemonHints';
import { buildProgressiveHintQueueFromSetup } from './progressiveQueue';

function normalizeHintCheck(
  raw: Partial<ProgressiveGuessEntry['hintChecks'][number]>
): ProgressiveGuessEntry['hintChecks'][number] {
  const fieldLabel = raw.fieldLabel ?? raw.field ?? '';
  const targetValue = raw.targetValue ?? (raw.hit ? raw.label : undefined) ?? raw.label ?? '—';
  const guessValue = raw.guessValue ?? (!raw.hit ? raw.label : undefined) ?? raw.label ?? '—';
  return {
    field: raw.field ?? '',
    label: raw.hit ? targetValue : guessValue,
    fieldLabel,
    targetValue,
    guessValue,
    hit: Boolean(raw.hit),
  };
}

export function parseProgressiveState(raw: string | undefined): ProgressiveState {
  try {
    const parsed = JSON.parse(raw || '{}');
    const rounds: ProgressiveRound[] = Array.isArray(parsed.rounds)
      ? parsed.rounds.map((round: unknown, hintIndex: number) => {
          const r = round as Partial<ProgressiveRound>;
          return {
            hintIndex: typeof r.hintIndex === 'number' ? r.hintIndex : hintIndex,
            hint: r.hint ?? { field: '', label: '', value: null },
            guesses: Array.isArray(r.guesses)
              ? r.guesses.map((g) => ({
                  guessName: String((g as ProgressiveGuessEntry).guessName ?? ''),
                  guessId: (g as ProgressiveGuessEntry).guessId ?? null,
                  imageUrl: (g as ProgressiveGuessEntry).imageUrl ?? null,
                  hintChecks: Array.isArray((g as ProgressiveGuessEntry).hintChecks)
                    ? (g as ProgressiveGuessEntry).hintChecks.map((c) => normalizeHintCheck(c))
                    : [],
                  allHintsHit: Boolean((g as ProgressiveGuessEntry).allHintsHit),
                  livesLost: Boolean((g as ProgressiveGuessEntry).livesLost),
                  isCorrect: Boolean((g as ProgressiveGuessEntry).isCorrect),
                }))
              : [],
          };
        })
      : [];

    return {
      lives: typeof parsed.lives === 'number' ? parsed.lives : PROGRESSIVE_LIVES,
      hintFields: Array.isArray(parsed.hintFields) ? parsed.hintFields : [],
      hints: Array.isArray(parsed.hints) ? parsed.hints : [],
      pendingQueue: Array.isArray(parsed.pendingQueue) ? parsed.pendingQueue : [],
      satisfiedFields: Array.isArray(parsed.satisfiedFields)
        ? parsed.satisfiedFields.filter((f: unknown) => typeof f === 'string')
        : [],
      questionAttempts: typeof parsed.questionAttempts === 'number' ? parsed.questionAttempts : 0,
      rounds,
      footballPrimaryField: parsed.footballPrimaryField,
    };
  } catch {
    return {
      lives: PROGRESSIVE_LIVES,
      hintFields: [],
      hints: [],
      pendingQueue: [],
      satisfiedFields: [],
      questionAttempts: 0,
      rounds: [],
    };
  }
}

export function createInitialProgressiveState(
  theme: Theme,
  setup: QuestionSetup,
  answer: CharacterEntry,
  rng?: { next(): number },
  options?: { lives?: number }
): ProgressiveState {
  const { firstField, pendingQueue, footballPrimaryField } = buildProgressiveHintQueueFromSetup(
    theme,
    setup,
    answer,
    rng
  );
  const firstHint = buildProgressiveHintInfo(
    theme,
    answer,
    firstField,
    setup.compareMove,
    footballPrimaryField
  );

  const lives =
    typeof options?.lives === 'number'
      ? Math.max(0, options.lives)
      : PROGRESSIVE_LIVES;

  return {
    lives,
    hintFields: [firstField],
    hints: [firstHint],
    pendingQueue,
    satisfiedFields: [],
    questionAttempts: 0,
    rounds: [{ hintIndex: 0, hint: firstHint, guesses: [] }],
    footballPrimaryField,
  };
}

export function buildProgressiveHintInfo(
  theme: Theme,
  answer: CharacterEntry,
  field: string,
  compareMove: string | null,
  footballPrimaryField?: 'confederation' | 'clubLeague'
): HintInfo {
  if (theme === 'football' && isFootballHintField(field)) {
    if (footballPrimaryField && field === footballPrimaryField) {
      return buildFootballSyntheticHint(answer, footballPrimaryField);
    }
    return buildFootballPrimaryHint(answer, undefined, field as 'confederation' | 'clubLeague');
  }
  if (theme === 'nba' && field === 'divisionPosition') {
    return buildNBAPrimaryHint(answer);
  }
  if (theme === 'pokemon') {
    return buildPokemonHint(answer, field, compareMove);
  }
  if (theme === 'nba' && field === 'team') {
    const hint = buildThemeHint(theme, answer, field, []);
    hint.value = getNBATeamDisplay(String(answer.team || ''));
    return hint;
  }
  return buildThemeHint(theme, answer, field, []);
}

function hintLabelForField(theme: Theme, field: string, _answer: CharacterEntry): string {
  if (field === 'divisionPosition') return '赛区·选秀轮次';
  if (field === 'clubLeague') return '联赛';
  if (field === 'confederation') return '足联';
  if (field === 'team' && theme === 'nba') return '球队';
  if (field === 'position') return '位置';
  const info = buildProgressiveHintInfo(theme, _answer, field, null);
  return info.label;
}

export function progressiveFieldDisplayValue(
  theme: Theme,
  field: string,
  character: CharacterEntry,
  compareMove: string | null,
  footballPrimaryField?: 'confederation' | 'clubLeague'
): string {
  if (field === 'divisionPosition') {
    return String(buildNBAPrimaryHint(character).value ?? '—');
  }
  if (field === 'clubLeague' || field === 'confederation') {
    const info = buildProgressiveHintInfo(
      theme,
      character,
      field,
      compareMove,
      footballPrimaryField
    );
    return String(info.value ?? '—');
  }
  if (field === 'team' && theme === 'nba') {
    return getNBATeamDisplay(String(character.team || ''));
  }
  if (field === 'position') {
    return getNBAPositionLabel(character);
  }
  const info = buildProgressiveHintInfo(
    theme,
    character,
    field,
    compareMove,
    footballPrimaryField
  );
  return String(info.value ?? info.label ?? '—');
}

export function evaluateHintHit(
  theme: Theme,
  hintField: string,
  guess: CharacterEntry,
  answer: CharacterEntry,
  compareMove: string | null,
  footballPrimaryField?: 'confederation' | 'clubLeague'
): boolean {
  if (theme === 'pokemon') {
    if (hintField === 'moveHint') {
      return compareMove ? guessKnowsMove(guess, compareMove) : false;
    }
    if (hintField === 'weaknessHint') {
      const weak = getPokemonWeaknesses(answer);
      const gTypes = [guess.type1, guess.type2].filter(Boolean).map(String);
      return gTypes.some((t) => weak.includes(t));
    }
  }

  if (theme === 'football') {
    if (hintField === 'clubLeague') {
      const g = getClubLeagueHint(guess.club, guess);
      const a = getClubLeagueHint(answer.club, answer);
      return Boolean(g && a && g === a);
    }
    if (hintField === 'confederation') {
      const g = getConfederationHint(guess.nationalTeam);
      const a = getConfederationHint(answer.nationalTeam);
      return Boolean(g && a && g === a);
    }
  }

  if (theme === 'nba' && hintField === 'divisionPosition') {
    const gDiv = getDivisionHint(guess.team);
    const aDiv = getDivisionHint(answer.team);
    const divHit = Boolean(gDiv && aDiv && gDiv === aDiv);
    const gRound = getDraftRoundHint(guess.draft);
    const aRound = getDraftRoundHint(answer.draft);
    const roundHit = Boolean(gRound && aRound && gRound === aRound);
    return divHit && roundHit;
  }

  const guessVal =
    hintField === 'name' ? getNameFieldValue(guess, theme) : getCharacterField(guess, hintField, theme);
  const answerVal =
    hintField === 'name' ? getNameFieldValue(answer, theme) : getCharacterField(answer, hintField, theme);

  if (theme === 'nba' && hintField === 'team') {
    return compareField(theme, hintField, guessVal, answerVal) === 'hit';
  }

  return compareField(theme, hintField, guessVal, answerVal) === 'hit';
}

/** 本次猜测已命中的提示字段（含尚未解锁的队列字段） */
export function updateProgressiveSatisfiedFields(
  state: ProgressiveState,
  theme: Theme,
  guess: CharacterEntry,
  answer: CharacterEntry,
  compareMove: string | null
): ProgressiveState {
  const candidates = [...new Set([...state.hintFields, ...state.pendingQueue])];
  const satisfied = new Set(state.satisfiedFields ?? []);
  for (const field of candidates) {
    if (
      evaluateHintHit(
        theme,
        field,
        guess,
        answer,
        compareMove,
        state.footballPrimaryField
      )
    ) {
      satisfied.add(field);
    }
  }
  const satisfiedFields = [...satisfied];
  return {
    ...state,
    satisfiedFields,
  };
}

export function evaluateAllHintsForGuess(
  theme: Theme,
  hintFields: string[],
  guess: CharacterEntry,
  answer: CharacterEntry,
  compareMove: string | null,
  footballPrimaryField?: 'confederation' | 'clubLeague'
): { checks: ProgressiveGuessEntry['hintChecks']; allHintsHit: boolean } {
  const checks = hintFields.map((field) => {
    const hit = evaluateHintHit(
      theme,
      field,
      guess,
      answer,
      compareMove,
      footballPrimaryField
    );
    const fieldLabel = hintLabelForField(theme, field, answer);
    const targetValue = progressiveFieldDisplayValue(
      theme,
      field,
      answer,
      compareMove,
      footballPrimaryField
    );
    const guessValue = progressiveFieldDisplayValue(
      theme,
      field,
      guess,
      compareMove,
      footballPrimaryField
    );
    return {
      field,
      fieldLabel,
      targetValue,
      guessValue,
      label: hit ? targetValue : guessValue,
      hit,
    };
  });
  return { checks, allHintsHit: checks.every((c) => c.hit) };
}

export function unlockNextProgressiveHint(
  state: ProgressiveState,
  theme: Theme,
  answer: CharacterEntry,
  compareMove: string | null
): ProgressiveState {
  if (state.pendingQueue.length === 0) return state;

  const usedValues = new Set(state.hints.map((h) => `${h.field}:${h.value}`));
  let nextField: string | undefined;
  const rest: string[] = [];

  for (const field of state.pendingQueue) {
    if (nextField) {
      rest.push(field);
      continue;
    }
    const info = buildProgressiveHintInfo(
      theme,
      answer,
      field,
      compareMove,
      state.footballPrimaryField
    );
    const key = `${info.field}:${info.value}`;
    if (!usedValues.has(key) && !state.hintFields.includes(field)) {
      nextField = field;
    } else {
      rest.push(field);
    }
  }

  if (!nextField) return { ...state, pendingQueue: rest };

  const nextHint = buildProgressiveHintInfo(
    theme,
    answer,
    nextField,
    compareMove,
    state.footballPrimaryField
  );

  return {
    ...state,
    hintFields: [...state.hintFields, nextField],
    hints: [...state.hints, nextHint],
    pendingQueue: rest,
    rounds: [
      ...state.rounds,
      { hintIndex: state.rounds.length, hint: nextHint, guesses: [] },
    ],
  };
}

export function buildProgressiveHintsFromState(
  state: ProgressiveState
): HintInfo[] {
  return state.hints;
}

export { buildProgressiveHintQueueFromSetup };
