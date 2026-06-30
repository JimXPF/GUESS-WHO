import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import {
  CharacterEntry,
  CorrectAnswerRecord,
  DAILY_MAX_ATTEMPTS,
  DailyLeaderboardEntry,
  DailyTodayInfo,
  FieldCompare,
  GameMode,
  GameSession,
  GuessRecord,
  HintInfo,
  LeaderboardEntry,
  MAX_ATTEMPTS,
  PROGRESSIVE_LIVES,
  ProgressiveRound,
  ProgressiveState,
  QuestionSetup,
  SessionStatus,
  REVERSE_QUERY_ATTEMPTS,
  REVERSE_ROUNDS_PER_GAME,
  REVERSE_ACCURATE_HINT_AFTER,
  ReverseCondition,
  ReverseQueryRecord,
  ReverseRoundRecord,
  ReverseState,
  Theme,
  DailyAlreadyPlayedError,
  getFieldLabel,
  getThemeFields,
  scoreForQuestion,
} from '../types';
import {
  findCharacterByGuess,
  findCharacterById,
  getBank,
  getCharacter,
  getDisplayName,
  getCharacterImage,
  getHintFields,
  getGuessPlaceholder,
  getNameFieldValue,
  getCharacterField,
  pickRandomCharacter,
  getNBATeamDisplay,
  getNBAPositionDisplay,
} from './dataLoader';
import { compareField, formatValue, getDraftCompareHint, getDraftYearDirection, getNumericDirection, compareEggGroup } from './compareEngine';
import {
  buildFootballPrimaryHint,
  getFootballHintFields,
  isHintFieldExcluded,
} from './footballHints';
import {
  buildNBAPrimaryHint,
  getNBAExtraHintFields,
  isNBAHintFieldExcluded,
} from './nbaHints';
import { parseActiveFields, pickActiveFields } from './activeFields';
import {
  buildPokemonHint,
  buildPokemonQuestion,
} from './pokemonQuestion';
import {
  buildPokemonMoveHint,
  buildPokemonWeaknessHint,
  guessKnowsMove,
  isPokemonHintFieldExcluded,
  shouldShowWeaknessHint,
} from './pokemonHints';
import {
  dailyRowToSetup,
  getDailyChallengeDate,
  getOrCreateDailyChallenge,
} from './dailyChallenge';
import {
  finishDailyPlayerAttempt,
  getDailyPlayerAttempt,
  registerDailyPlayerAttempt,
} from './dailyPlayerAttempts';
import { buildHint } from './gameServiceHelpers';
import {
  createInitialProgressiveState,
  evaluateAllHintsForGuess,
  parseProgressiveState,
  unlockNextProgressiveHint,
  buildProgressiveHintsFromState,
  updateProgressiveSatisfiedFields,
} from './progressiveHint';
import {
  applyClaimsToFieldResults,
  scoreRelayGuess,
} from './relayScoring';
import type { RelayRoomContext } from '../types';
import {
  buildPlayablePool,
  buildReverseAccurateHint,
  computeEliminatedIds,
  computeNewlyEliminated,
  createInitialReverseState,
  evaluateAnswerCondition,
  formatReverseTag,
  getAlivePool,
  getFieldValues,
  getReverseQueryableFields,
  loadReverseQueries,
  parseReverseState,
  pickReverseFieldChoices,
  resolveQuestionPoolIds,
  scoreReverseAutoDeduce,
  scoreReverseCorrectGuess,
  scoreReverseWrongGuess,
  validateCondition,
  validateFieldInChoices,
} from './reverseBomb';

interface SessionRow {
  id: string;
  player_name: string;
  theme: Theme;
  game_mode: GameMode;
  answer_id: string;
  hint_field: string;
  extra_hint_fields: string;
  active_fields: string;
  question_compare_move: string | null;
  used_answer_ids: string;
  attempts_left: number;
  score: number;
  correct_count: number;
  question_attempts: number;
  question_index: number;
  status: SessionStatus;
  started_at_hrtime: string | null;
  elapsed_us: number | null;
  progressive_state: string;
  room_code: string | null;
}

const BONUS_HINT_THRESHOLDS = [3, 6, 9];

function hrtimeUs(): bigint {
  return process.hrtime.bigint();
}

function shuffleFields(fields: string[]): string[] {
  const copy = [...fields];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickQuestionHints(
  theme: Theme,
  activeFields: string[],
  answer: CharacterEntry
): { primary: string; extra: string[] } {
  if (theme === 'football') {
    const primaryHint = buildFootballPrimaryHint(answer);
    const extra = shuffleFields(
      getFootballHintFields().filter((f) => f !== primaryHint.field)
    );
    return { primary: primaryHint.field, extra: extra.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  if (theme === 'nba') {
    const extra = shuffleFields(getNBAExtraHintFields());
    return { primary: 'divisionPosition', extra: extra.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  const shuffled = shuffleFields(
    getHintFields(theme, activeFields).filter(
      (f) => f !== 'name' && !isHintFieldExcluded(f) && !isNBAHintFieldExcluded(f)
    )
  );
  return {
    primary: shuffled[0],
    extra: shuffled.slice(1, 1 + BONUS_HINT_THRESHOLDS.length),
  };
}

function parseExtraHintFields(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

function parseUsedAnswerIds(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function collectHitFields(guesses: GuessRecord[]): Set<string> {
  const hit = new Set<string>();
  for (const g of guesses) {
    if (!Array.isArray(g.fieldResults)) continue;
    for (const f of g.fieldResults) {
      if (f.result === 'hit') hit.add(f.field);
    }
  }
  return hit;
}

function getMaxAttemptsForMode(mode: GameMode): number {
  if (mode === 'daily-one') return DAILY_MAX_ATTEMPTS;
  if (mode === 'progressive-hint') return PROGRESSIVE_LIVES;
  if (mode === 'reverse-bomb') return REVERSE_QUERY_ATTEMPTS;
  return MAX_ATTEMPTS;
}

function buildSessionHints(
  theme: Theme,
  answer: CharacterEntry,
  hintField: string,
  extraHintFields: string[],
  questionAttempts: number,
  activeFields: string[],
  hitFields: Set<string> = new Set(),
  compareMove: string | null = null,
  progressiveState?: ProgressiveState
): HintInfo[] {
  if (progressiveState) {
    return buildProgressiveHintsFromState(progressiveState);
  }

  const hints =
    theme === 'football'
      ? [buildFootballPrimaryHint(answer)]
      : theme === 'nba'
        ? [buildNBAPrimaryHint(answer)]
        : theme === 'pokemon'
          ? [buildPokemonHint(answer, hintField, compareMove)]
          : [buildHint(theme, answer, hintField, activeFields)];

  const shownFields = new Set(hints.map((h) => h.field));

  for (let i = 0; i < extraHintFields.length; i++) {
    if (questionAttempts < BONUS_HINT_THRESHOLDS[i]) continue;
    const field = extraHintFields[i];
    if (hitFields.has(field) || shownFields.has(field)) continue;

    if (theme === 'pokemon') {
      if (field === 'moveHint') {
        if (activeFields.includes('learnableMove')) hints.push(buildPokemonMoveHint(answer));
      } else if (field === 'weaknessHint') {
        if (shouldShowWeaknessHint(activeFields)) {
          hints.push(buildPokemonWeaknessHint(answer));
        }
      } else if (activeFields.includes(field)) {
        hints.push(buildHint(theme, answer, field, activeFields));
      }
    } else {
      hints.push(buildHint(theme, answer, field, activeFields));
    }
    shownFields.add(field);
  }
  return hints;
}

function compareAllFields(
  theme: Theme,
  guess: CharacterEntry,
  answer: CharacterEntry,
  activeFields: string[],
  compareMove: string | null
): FieldCompare[] {
  const fields = getThemeFields(theme, activeFields);
  return fields.map(({ field, label }) => {
    if (theme === 'pokemon' && field === 'learnableMove') {
      const knows = compareMove ? guessKnowsMove(guess, compareMove) : false;
      const guessValue = formatValue(knows ? '会' : '不会');
      const answerValue = formatValue('会');
      const result = knows ? 'hit' : 'miss';
      return {
        field,
        label: compareMove ? `可学习：${compareMove}` : label,
        guessValue,
        answerValue: result === 'hit' ? answerValue : null,
        result,
        showAnswer: result === 'hit',
        direction: null,
      };
    }

    const guessCompare =
      field === 'name' ? getNameFieldValue(guess, theme) : getCharacterField(guess, field, theme);
    const answerCompare =
      field === 'name' ? getNameFieldValue(answer, theme) : getCharacterField(answer, field, theme);

    let guessDisplay = guessCompare;
    let answerDisplay = answerCompare;

    if (theme === 'nba' && field === 'team') {
      guessDisplay = getNBATeamDisplay(String(guessCompare || ''));
      answerDisplay = getNBATeamDisplay(String(answerCompare || ''));
    }

    if (theme === 'nba' && field === 'position') {
      const gPos = getNBAPositionDisplay(String(guessCompare || ''));
      const aPos = getNBAPositionDisplay(String(answerCompare || ''));
      guessDisplay = gPos.zh;
      answerDisplay = aPos.en;
    }

    const compareGuess =
      theme === 'nba' && field === 'position' ? guessCompare : guessDisplay;
    const compareAnswer =
      theme === 'nba' && field === 'position' ? answerCompare : answerDisplay;

    if (theme === 'pokemon' && field === 'eggGroup') {
      const egg = compareEggGroup(compareGuess, compareAnswer);
      const guessValue = formatValue(guessDisplay, field);
      const answerValue = formatValue(answerDisplay, field);
      return {
        field,
        label,
        guessValue,
        answerValue: egg.result === 'hit' ? answerValue : null,
        result: egg.result,
        showAnswer: egg.result === 'hit',
        direction: null,
        hint: egg.hint ?? null,
      };
    }

    const guessValue = formatValue(guessDisplay, field);
    const answerValue = formatValue(answerDisplay, field);
    const result = compareField(theme, field, compareGuess, compareAnswer);
    const direction =
      result !== 'hit'
        ? theme === 'nba' && field === 'draft'
          ? getDraftYearDirection(compareGuess, compareAnswer)
          : getNumericDirection(theme, field, compareGuess, compareAnswer)
        : null;
    const hint =
      theme === 'nba' && field === 'draft' && result !== 'hit'
        ? getDraftCompareHint(result, compareGuess, compareAnswer)
        : null;
    return {
      field,
      label,
      guessValue,
      answerValue: field === 'position' && result !== 'hit' ? null : answerValue,
      result,
      showAnswer: result === 'hit',
      direction,
      hint,
    };
  });
}

function loadGuesses(sessionId: string, questionIndex?: number): GuessRecord[] {
  const rows = db
    .prepare(
      `SELECT id, guess_name, guess_id, is_correct, field_results, created_at, question_index
       FROM guesses WHERE session_id = ? ORDER BY id ASC`
    )
    .all(sessionId) as Array<{
    id: number;
    guess_name: string;
    guess_id: string | null;
    is_correct: number;
    field_results: string | null;
    created_at: string;
    question_index: number;
  }>;

  return rows
    .filter((r) => questionIndex === undefined || r.question_index === questionIndex)
    .map((r) => {
      let fieldResults: GuessRecord['fieldResults'] = null;
      if (r.field_results) {
        try {
          const parsed = JSON.parse(r.field_results);
          if (Array.isArray(parsed)) {
            fieldResults = parsed;
          }
          // progressive-hint stores { progressive: true, ... } — UI uses progressive_state.rounds
        } catch {
          fieldResults = null;
        }
      }
      return {
        id: r.id,
        guessName: r.guess_name,
        guessId: r.guess_id,
        isCorrect: r.is_correct === 1,
        fieldResults,
        createdAt: r.created_at,
        questionIndex: r.question_index,
        imageUrl: null as string | null,
      };
    });
}

function loadCorrectAnswers(sessionId: string, theme: Theme): CorrectAnswerRecord[] {
  const rows = db
    .prepare(
      `SELECT guess_name, guess_id, question_index, field_results FROM guesses
       WHERE session_id = ? AND is_correct = 1 ORDER BY id ASC`
    )
    .all(sessionId) as Array<{
    guess_name: string;
    guess_id: string;
    question_index: number;
    field_results: string | null;
  }>;

  return rows.map((r) => {
    const char = getCharacter(theme, r.guess_id);
    let fieldResults: FieldCompare[] | undefined;
    if (r.field_results) {
      try {
        const parsed = JSON.parse(r.field_results);
        if (Array.isArray(parsed)) {
          fieldResults = parsed;
        }
      } catch {
        fieldResults = undefined;
      }
    }
    return {
      guessName: r.guess_name,
      guessId: r.guess_id,
      imageUrl: char ? getCharacterImage(char) : null,
      questionIndex: r.question_index,
      fieldResults,
    };
  });
}

function rowToSession(row: SessionRow): Omit<GameSession, 'hint' | 'hints' | 'guesses' | 'correctAnswers'> {
  return {
    sessionId: row.id,
    playerName: row.player_name,
    theme: row.theme,
    gameMode: row.game_mode || 'classic-six',
    activeFields: parseActiveFields(row.active_fields, row.theme),
    attemptsLeft: row.attempts_left,
    score: row.score,
    correctCount: row.correct_count,
    status: row.status,
    questionAttempts: row.question_attempts,
    questionIndex: row.question_index,
    elapsedUs: row.elapsed_us ?? undefined,
    maxAttempts: getMaxAttemptsForMode(row.game_mode || 'classic-six'),
    roomCode: row.room_code,
    showCompareGrid:
      row.game_mode !== 'progressive-hint' && row.game_mode !== 'reverse-bomb',
  };
}

function resolveQuestionSetup(
  theme: Theme,
  answer: CharacterEntry
): QuestionSetup {
  if (theme === 'pokemon') {
    const setup = buildPokemonQuestion(answer);
    return {
      answerId: answer.id,
      hintField: setup.hintField,
      extraHintFields: setup.extraHintFields,
      activeFields: setup.activeFields,
      compareMove: setup.compareMove,
    };
  }
  const activeFields = pickActiveFields(theme);
  const { primary, extra } = pickQuestionHints(theme, activeFields, answer);
  return {
    answerId: answer.id,
    hintField: primary,
    extraHintFields: extra,
    activeFields,
    compareMove: null,
  };
}

function getSessionRow(sessionId: string): SessionRow | undefined {
  return db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined;
}

function isQuestionAnsweredCorrectly(sessionId: string, questionIndex: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM guesses WHERE session_id = ? AND question_index = ? AND is_correct = 1 LIMIT 1`
    )
    .get(sessionId, questionIndex) as { 1: number } | undefined;
  return Boolean(row);
}

function buildRevealedAnswer(row: SessionRow): { name: string; imageUrl: string | null } | undefined {
  if (row.status !== 'game_over' && row.status !== 'failed' && row.status !== 'quit') {
    return undefined;
  }
  if (row.game_mode === 'reverse-bomb') {
    const reverseState = parseReverseState(row.progressive_state);
    if (reverseState.roundHistory.some((r) => r.questionIndex === row.question_index)) {
      return undefined;
    }
  }
  if (isQuestionAnsweredCorrectly(row.id, row.question_index)) {
    return undefined;
  }
  const answer = getCharacter(row.theme, row.answer_id);
  if (!answer) return undefined;
  return {
    name: getDisplayName(answer, row.theme),
    imageUrl: getCharacterImage(answer),
  };
}

function saveToLeaderboard(
  playerName: string,
  theme: Theme,
  gameMode: GameMode,
  totalScore: number,
  correctCount: number
) {
  if (totalScore <= 0) return;
  db.prepare(
    `INSERT INTO leaderboard (player_name, theme, game_mode, total_score, correct_count)
     VALUES (?, ?, ?, ?, ?)`
  ).run(playerName, theme, gameMode, totalScore, correctCount);
}

function saveDailyLeaderboard(
  playerName: string,
  theme: Theme,
  attemptsUsed: number,
  elapsedUs: number
) {
  const challengeDate = getDailyChallengeDate();
  const existing = db
    .prepare(
      `SELECT attempts_used, elapsed_us FROM daily_leaderboard
       WHERE challenge_date = ? AND theme = ? AND player_name = ?`
    )
    .get(challengeDate, theme, playerName) as
    | { attempts_used: number; elapsed_us: number }
    | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO daily_leaderboard (challenge_date, theme, player_name, attempts_used, elapsed_us)
       VALUES (?, ?, ?, ?, ?)`
    ).run(challengeDate, theme, playerName, attemptsUsed, elapsedUs);
    return;
  }

  const better =
    attemptsUsed < existing.attempts_used ||
    (attemptsUsed === existing.attempts_used && elapsedUs < existing.elapsed_us);
  if (better) {
    db.prepare(
      `UPDATE daily_leaderboard SET attempts_used = ?, elapsed_us = ?, completed_at = datetime('now')
       WHERE challenge_date = ? AND theme = ? AND player_name = ?`
    ).run(attemptsUsed, elapsedUs, challengeDate, theme, playerName);
  }
}

function computeElapsedUs(row: SessionRow): number {
  if (row.started_at_hrtime) {
    const start = BigInt(row.started_at_hrtime);
    return Number(hrtimeUs() - start) / 1000;
  }
  return row.elapsed_us ?? 0;
}

function insertSession(
  sessionId: string,
  playerName: string,
  theme: Theme,
  gameMode: GameMode,
  setup: QuestionSetup,
  attempts: number,
  extra: {
    progressiveState?: ProgressiveState;
    reverseStateJson?: string;
    roomCode?: string | null;
    usedAnswerIds?: string[];
  } = {}
) {
  db.prepare(
    `INSERT INTO sessions (id, player_name, theme, game_mode, answer_id, hint_field, extra_hint_fields, active_fields, question_compare_move, used_answer_ids, attempts_left, score, correct_count, question_attempts, question_index, status, started_at_hrtime, progressive_state, room_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'playing', ?, ?, ?)`
  ).run(
    sessionId,
    playerName.trim(),
    theme,
    gameMode,
    setup.answerId,
    setup.hintField,
    JSON.stringify(setup.extraHintFields),
    JSON.stringify(setup.activeFields),
    setup.compareMove,
    JSON.stringify(extra.usedAnswerIds ?? [setup.answerId]),
    attempts,
    String(hrtimeUs()),
    extra.reverseStateJson ?? JSON.stringify(extra.progressiveState ?? {}),
    extra.roomCode ?? null
  );
}

export function applySessionFromSetup(
  sessionId: string,
  setup: QuestionSetup,
  options?: { resetQuestionIndex?: boolean; questionIndex?: number }
) {
  const row = getSessionRow(sessionId);
  if (!row) return;
  const qIndex = options?.questionIndex ?? (options?.resetQuestionIndex ? 0 : row.question_index);
  db.prepare(
    `UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?, question_compare_move = ?, question_attempts = 0, question_index = ?, status = 'playing', progressive_state = '{}', updated_at = datetime('now') WHERE id = ?`
  ).run(
    setup.answerId,
    setup.hintField,
    JSON.stringify(setup.extraHintFields),
    JSON.stringify(setup.activeFields),
    setup.compareMove,
    qIndex,
    sessionId
  );
}

export function createBattleSession(
  playerName: string,
  theme: Theme,
  gameMode: GameMode,
  roomCode: string
): GameSession {
  const sessionId = uuidv4();
  const answer = pickRandomCharacter(theme);
  const setup = resolveQuestionSetup(theme, answer);
  insertSession(sessionId, playerName, theme, gameMode, setup, MAX_ATTEMPTS, {
    roomCode,
  });
  return getGameSession(sessionId)!;
}

export function startGame(
  playerName: string,
  theme: Theme,
  gameMode: GameMode = 'classic-six',
  playerKey?: string
): GameSession {
  if (gameMode === 'daily-one') {
    const key = playerKey?.trim() || 'unknown';
    const challengeDate = getDailyChallengeDate();
    const existing = getDailyPlayerAttempt(challengeDate, theme, key);

    if (existing) {
      const prior = getGameSession(existing.session_id);
      if (existing.status === 'playing' && prior?.status === 'playing') {
        return prior;
      }
      throw new DailyAlreadyPlayedError(existing.session_id);
    }
  }

  const sessionId = uuidv4();
  let setup: QuestionSetup;
  let progressiveState: ProgressiveState | undefined;

  if (gameMode === 'daily-one') {
    const daily = getOrCreateDailyChallenge(theme);
    setup = dailyRowToSetup(daily);
  } else {
    const answer = pickRandomCharacter(theme);
    setup = resolveQuestionSetup(theme, answer);
    if (gameMode === 'progressive-hint') {
      progressiveState = createInitialProgressiveState(theme, setup, answer);
    }
  }

  let reverseStateJson: string | undefined;
  if (gameMode === 'reverse-bomb') {
    const answer = getCharacter(theme, setup.answerId)!;
    setup = {
      answerId: answer.id,
      hintField: '_reverse',
      extraHintFields: [],
      activeFields: getReverseQueryableFields(theme),
      compareMove: null,
    };
    reverseStateJson = JSON.stringify(createInitialReverseState(theme, setup.answerId));
  }

  insertSession(
    sessionId,
    playerName,
    theme,
    gameMode,
    setup,
    getMaxAttemptsForMode(gameMode),
    {
      progressiveState,
      reverseStateJson,
    }
  );

  if (gameMode === 'daily-one' && playerKey?.trim()) {
    registerDailyPlayerAttempt(theme, playerKey.trim(), playerName, sessionId);
  }

  return getGameSession(sessionId)!;
}

export interface GuessResponse {
  session: GameSession;
  notInBank?: boolean;
  message?: string;
  correctAnswer?: { name: string; imageUrl: string | null };
  scoreBreakdown?: import('../types').FieldClaim[];
  fullCorrect?: boolean;
}

function handleGameEndLeaderboard(row: SessionRow, score: number, correctCount: number) {
  if (row.game_mode === 'daily-one' || row.game_mode === 'battle' || row.game_mode === 'relay-chain') {
    return;
  }
  if (row.status === 'failed') return;
  saveToLeaderboard(row.player_name, row.theme, row.game_mode || 'classic-six', score, correctCount);
}

export function submitGuess(
  sessionId: string,
  guessText: string,
  characterId?: string
): GuessResponse {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');
  if (row.room_code) throw new Error('多人模式请通过房间提交猜测');
  if (row.status === 'game_over' || row.status === 'quit' || row.status === 'failed') {
    throw new Error('Game already ended');
  }
  if (row.status === 'question_done' && row.game_mode !== 'daily-one') {
    throw new Error('Answer already found, proceed to next question');
  }

  let character =
    (characterId ? findCharacterById(row.theme, characterId) : null) ||
    findCharacterByGuess(row.theme, guessText);
  if (!character) {
    const session = getGameSession(sessionId)!;
    return {
      session,
      notInBank: true,
      message: '题库中没有该角色，请从联想列表中选择或检查拼写',
    };
  }

  const answer = getCharacter(row.theme, row.answer_id)!;
  const activeFields = parseActiveFields(row.active_fields, row.theme);
  const gameMode = row.game_mode || 'classic-six';

  if (gameMode === 'progressive-hint') {
    return submitProgressiveGuess(row, character, answer, activeFields);
  }

  if (gameMode === 'reverse-bomb') {
    return submitReverseBombGuess(row, character, answer);
  }

  const isCorrect = character.id === answer.id;
  const fieldResults = compareAllFields(
    row.theme,
    character,
    answer,
    activeFields,
    row.question_compare_move
  );

  let attemptsLeft = row.attempts_left - 1;
  let questionAttempts = row.question_attempts + 1;
  let score = row.score;
  let correctCount = row.correct_count;
  let status: SessionStatus = row.status;
  let lastQuestionScore: number | undefined;
  let elapsedUs = row.elapsed_us;

  if (isCorrect) {
    if (gameMode === 'daily-one') {
      elapsedUs = computeElapsedUs(row);
      saveDailyLeaderboard(row.player_name, row.theme, questionAttempts, elapsedUs);
      finishDailyPlayerAttempt(sessionId, 'game_over', questionAttempts, elapsedUs);
      status = 'game_over';
      db.prepare(
        `UPDATE sessions SET elapsed_us = ?, status = 'game_over', question_attempts = ?, attempts_left = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(elapsedUs, questionAttempts, attemptsLeft, sessionId);
    } else {
      lastQuestionScore = scoreForQuestion(questionAttempts);
      score += lastQuestionScore;
      correctCount += 1;
      attemptsLeft = Math.min(MAX_ATTEMPTS, attemptsLeft + 2);
      status = 'question_done';
      db.prepare(
        `UPDATE sessions SET attempts_left = ?, score = ?, correct_count = ?, question_attempts = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(attemptsLeft, score, correctCount, questionAttempts, status, sessionId);
    }
  } else if (attemptsLeft <= 0) {
    if (gameMode === 'daily-one') {
      status = 'failed';
      elapsedUs = computeElapsedUs(row);
      finishDailyPlayerAttempt(sessionId, 'failed', questionAttempts, elapsedUs);
      db.prepare(
        `UPDATE sessions SET attempts_left = ?, question_attempts = ?, status = 'failed', elapsed_us = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(attemptsLeft, questionAttempts, elapsedUs, sessionId);
    } else {
      status = 'game_over';
      db.prepare(
        `UPDATE sessions SET attempts_left = ?, question_attempts = ?, status = 'game_over', updated_at = datetime('now') WHERE id = ?`
      ).run(attemptsLeft, questionAttempts, sessionId);
      handleGameEndLeaderboard({ ...row, status }, score, correctCount);
    }
  } else {
    db.prepare(
      `UPDATE sessions SET attempts_left = ?, question_attempts = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(attemptsLeft, questionAttempts, sessionId);
  }

  db.prepare(
    `INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    getDisplayName(character, row.theme),
    character.id,
    isCorrect ? 1 : 0,
    JSON.stringify(fieldResults),
    row.question_index
  );

  const session = getGameSession(sessionId)!;
  let correctAnswer: { name: string; imageUrl: string | null } | undefined;
  if (!isCorrect && attemptsLeft <= 0) {
    const ans = getCharacter(row.theme, row.answer_id)!;
    correctAnswer = {
      name: getDisplayName(ans, row.theme),
      imageUrl: getCharacterImage(ans),
    };
  }

  return {
    session: { ...session, lastGuessCorrect: isCorrect, lastQuestionScore },
    correctAnswer,
  };
}

function submitReverseBombGuess(
  row: SessionRow,
  character: CharacterEntry,
  answer: CharacterEntry
): GuessResponse {
  const reverseState = parseReverseState(row.progressive_state);
  if (reverseState.finalGuessUsed || row.status === 'question_done') {
    throw new Error('本题已结束');
  }
  if (reverseState.phase !== 'guessing' && row.attempts_left > 0) {
    throw new Error('请先完成筛选或用完筛选次数');
  }

  const queries = loadReverseQueries(row.id, row.question_index);
  const poolIds = reverseState.questionPoolIds;
  const totalPool = resolveQuestionPoolIds(row.theme, poolIds).length;
  const aliveCount = getAlivePool(row.theme, queries, poolIds).length;
  const isCorrect = character.id === answer.id;
  const roundScore = isCorrect
    ? scoreReverseCorrectGuess()
    : scoreReverseWrongGuess(aliveCount, totalPool);

  const session = finishReverseRound(row, answer, {
    success: isCorrect,
    score: roundScore,
    guessedName: getDisplayName(character, row.theme),
    guessedId: character.id,
    aliveCount,
    totalPool,
  });

  let correctAnswer: { name: string; imageUrl: string | null } | undefined;
  if (!isCorrect) {
    correctAnswer = {
      name: getDisplayName(answer, row.theme),
      imageUrl: getCharacterImage(answer),
    };
  }

  return {
    session: { ...session, lastGuessCorrect: isCorrect, lastQuestionScore: roundScore },
    correctAnswer,
  };
}

function finishReverseRound(
  row: SessionRow,
  answer: CharacterEntry,
  opts: {
    success: boolean;
    autoDeduced?: boolean;
    score: number;
    guessedName?: string | null;
    guessedId?: string | null;
    aliveCount: number;
    totalPool: number;
  }
): GameSession {
  const reverseState = parseReverseState(row.progressive_state);
  const roundRecord: ReverseRoundRecord = {
    questionIndex: row.question_index,
    answerName: getDisplayName(answer, row.theme),
    answerId: answer.id,
    imageUrl: getCharacterImage(answer),
    success: opts.success,
    autoDeduced: opts.autoDeduced,
    score: opts.score,
    guessedName: opts.guessedName ?? null,
    aliveCountAtEnd: opts.aliveCount,
    totalPool: opts.totalPool,
  };

  const newState: ReverseState = {
    ...reverseState,
    finalGuessUsed: true,
    phase: 'filtering',
    fieldChoices: [],
    roundHistory: [...reverseState.roundHistory, roundRecord],
  };

  const newScore = row.score + opts.score;
  const newCorrect = row.correct_count + (opts.success ? 1 : 0);
  const isLastRound = row.question_index + 1 >= REVERSE_ROUNDS_PER_GAME;
  const status = isLastRound ? 'game_over' : 'question_done';

  db.prepare(
    `UPDATE sessions SET score = ?, correct_count = ?, status = ?, progressive_state = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(newScore, newCorrect, status, JSON.stringify(newState), row.id);

  if (isLastRound) {
    handleGameEndLeaderboard(row, newScore, newCorrect);
  }

  if (opts.guessedId) {
    db.prepare(
      `INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      row.id,
      opts.guessedName ?? getDisplayName(answer, row.theme),
      opts.guessedId,
      opts.success ? 1 : 0,
      JSON.stringify({ reverseFinal: true, score: opts.score }),
      row.question_index
    );
  }

  return getGameSession(row.id)!;
}

export interface ReverseQueryResponse {
  matched: boolean;
  condition: ReverseCondition;
  label: string;
  displayValue: string | number;
  newlyEliminatedIds: string[];
  aliveCount: number;
  session: GameSession;
  autoResolved?: boolean;
  roundScore?: number;
  answer?: { name: string; imageUrl: string | null };
}

function assertReverseSession(row: SessionRow): void {
  if (row.game_mode !== 'reverse-bomb') throw new Error('非逆向轰炸模式');
  if (row.status === 'game_over' || row.status === 'quit' || row.status === 'failed') {
    throw new Error('游戏已结束');
  }
  if (row.status === 'question_done') {
    throw new Error('已猜中答案');
  }
}

export function getReverseFieldsForSession(sessionId: string) {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');
  assertReverseSession(row);
  const state = parseReverseState(row.progressive_state);
  if (state.fieldChoices.length >= 1) {
    return state.fieldChoices;
  }
  const queries = loadReverseQueries(sessionId, row.question_index);
  const alivePool = getAlivePool(row.theme, queries, state.questionPoolIds);
  return pickReverseFieldChoices(alivePool, row.theme, state.recentChoiceFields ?? []);
}

export function getReverseValuesForSession(sessionId: string, field: string) {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');
  assertReverseSession(row);
  if (!getReverseQueryableFields(row.theme).includes(field)) {
    throw new Error('无效字段');
  }
  const state = parseReverseState(row.progressive_state);
  const queries = loadReverseQueries(sessionId, row.question_index);
  const alivePool = getAlivePool(row.theme, queries, state.questionPoolIds);
  return getFieldValues(alivePool, row.theme, field);
}

export function submitReverseQuery(
  sessionId: string,
  condition: ReverseCondition
): ReverseQueryResponse {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');
  assertReverseSession(row);
  if (row.attempts_left <= 0) {
    throw new Error('筛选次数已用完，请给出终极猜测');
  }

  const reverseState = parseReverseState(row.progressive_state);
  if (reverseState.phase === 'guessing') {
    throw new Error('筛选次数已用完，请给出终极猜测');
  }

  const err =
    validateCondition(row.theme, condition) ??
    validateFieldInChoices(condition.field, reverseState.fieldChoices);
  if (err) throw new Error(err);

  const answer = getCharacter(row.theme, row.answer_id)!;
  const queriesBefore = loadReverseQueries(sessionId, row.question_index);
  const poolIds = reverseState.questionPoolIds;
  const poolBefore = getAlivePool(row.theme, queriesBefore, poolIds);
  const totalPool = resolveQuestionPoolIds(row.theme, poolIds).length;

  const matched = evaluateAnswerCondition(answer, condition, row.theme);
  const label = getFieldLabel(row.theme, condition.field);
  const displayValue =
    typeof condition.value === 'number' ? condition.value : String(condition.value);
  const tagText = formatReverseTag(condition, row.theme, displayValue);

  const queryRecord: ReverseQueryRecord = {
    condition,
    matched,
    label,
    displayValue,
  };
  const queriesAfter = [...queriesBefore, queryRecord];
  const poolAfter = getAlivePool(row.theme, queriesAfter, poolIds);
  const newlyEliminatedIds = computeNewlyEliminated(poolBefore, poolAfter);
  const attemptsLeft = row.attempts_left - 1;
  const filtersUsed = queriesAfter.length;

  db.prepare(
    `INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    tagText,
    null,
    0,
    JSON.stringify({ reverse: true, condition, matched, label, displayValue }),
    row.question_index
  );

  if (poolAfter.length === 1) {
    const score = scoreReverseAutoDeduce(attemptsLeft);
    db.prepare(
      `UPDATE sessions SET attempts_left = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(attemptsLeft, sessionId);
    const session = finishReverseRound(row, answer, {
      success: true,
      autoDeduced: true,
      score,
      aliveCount: 1,
      totalPool,
    });
    return {
      matched,
      condition,
      label,
      displayValue,
      newlyEliminatedIds,
      aliveCount: 1,
      session,
      autoResolved: true,
      roundScore: score,
      answer: {
        name: getDisplayName(answer, row.theme),
        imageUrl: getCharacterImage(answer),
      },
    };
  }

  let nextState: ReverseState;
  if (attemptsLeft <= 0) {
    nextState = {
      ...reverseState,
      phase: 'guessing',
      fieldChoices: [],
    };
  } else {
    const newChoices = pickReverseFieldChoices(
      poolAfter,
      row.theme,
      reverseState.recentChoiceFields ?? []
    );
    const queriedFields = queriesAfter.map((q) => q.condition.field);
    let accurateHint = reverseState.accurateHint;
    if (!accurateHint && queriesAfter.length >= REVERSE_ACCURATE_HINT_AFTER) {
      const excludeForHint = new Set([
        ...newChoices.map((c) => c.field),
        ...reverseState.fieldChoices.map((c) => c.field),
      ]);
      accurateHint =
        buildReverseAccurateHint(
          row.theme,
          answer,
          excludeForHint,
          queriedFields,
          row.question_compare_move
        ) ?? undefined;
    }
    nextState = {
      ...reverseState,
      phase: newChoices.length === 0 ? 'guessing' : 'filtering',
      fieldChoices: newChoices,
      recentChoiceFields: newChoices.map((c) => c.field),
      accurateHint,
    };
  }

  db.prepare(
    `UPDATE sessions SET attempts_left = ?, progressive_state = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(attemptsLeft, JSON.stringify(nextState), sessionId);

  const session = getGameSession(sessionId)!;
  return {
    matched,
    condition,
    label,
    displayValue,
    newlyEliminatedIds,
    aliveCount: poolAfter.length,
    session,
  };
}

function submitProgressiveGuess(
  row: SessionRow,
  character: CharacterEntry,
  answer: CharacterEntry,
  _activeFields: string[]
): GuessResponse {
  let progressiveState = parseProgressiveState(row.progressive_state);
  progressiveState = {
    ...progressiveState,
    questionAttempts: progressiveState.questionAttempts + 1,
  };

  const isCorrect = character.id === answer.id;

  progressiveState = updateProgressiveSatisfiedFields(
    progressiveState,
    row.theme,
    character,
    answer,
    row.question_compare_move
  );

  const { checks, allHintsHit } = evaluateAllHintsForGuess(
    row.theme,
    progressiveState.hintFields,
    character,
    answer,
    row.question_compare_move,
    progressiveState.footballPrimaryField
  );

  let livesLost = false;
  if (!isCorrect && !allHintsHit) {
    progressiveState.lives = Math.max(0, progressiveState.lives - 1);
    livesLost = true;
  }

  const guessEntry = {
    guessName: getDisplayName(character, row.theme),
    guessId: character.id,
    imageUrl: getCharacterImage(character),
    hintChecks: checks,
    allHintsHit,
    livesLost,
    isCorrect,
  };

  const rounds = [...progressiveState.rounds];
  const roundIdx = rounds.length - 1;
  if (roundIdx >= 0) {
    const prevGuesses = Array.isArray(rounds[roundIdx].guesses) ? rounds[roundIdx].guesses : [];
    rounds[roundIdx] = {
      ...rounds[roundIdx],
      guesses: [...prevGuesses, guessEntry],
    };
    progressiveState.rounds = rounds;
  }

  let score = row.score;
  let correctCount = row.correct_count;
  let status: SessionStatus = row.status;
  let lastQuestionScore: number | undefined;
  const attemptsLeft = progressiveState.lives;

  if (isCorrect) {
    lastQuestionScore = scoreForQuestion(progressiveState.questionAttempts);
    score += lastQuestionScore;
    correctCount += 1;
    status = 'question_done';
  } else if (allHintsHit) {
    progressiveState = unlockNextProgressiveHint(
      progressiveState,
      row.theme,
      answer,
      row.question_compare_move
    );
  }

  if (!isCorrect && progressiveState.lives <= 0) {
    status = 'game_over';
  }

  db.prepare(
    `UPDATE sessions SET attempts_left = ?, score = ?, correct_count = ?, question_attempts = ?, status = ?, progressive_state = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    attemptsLeft,
    score,
    correctCount,
    progressiveState.questionAttempts,
    status,
    JSON.stringify(progressiveState),
    row.id
  );

  db.prepare(
    `INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    guessEntry.guessName,
    character.id,
    isCorrect ? 1 : 0,
    JSON.stringify({ progressive: true, ...guessEntry }),
    row.question_index
  );

  if (status === 'game_over') {
    handleGameEndLeaderboard(row, score, correctCount);
  }

  const session = getGameSession(row.id)!;
  let correctAnswer: { name: string; imageUrl: string | null } | undefined;
  if (status === 'game_over' && !isCorrect) {
    correctAnswer = {
      name: getDisplayName(answer, row.theme),
      imageUrl: getCharacterImage(answer),
    };
  }

  return {
    session: { ...session, lastGuessCorrect: isCorrect, lastQuestionScore },
    correctAnswer,
  };
}

export function processRoomGuess(
  sessionId: string,
  guessText: string,
  characterId?: string,
  room?: { questionQueue: QuestionSetup[]; currentQuestionIndex: number; playerOrder: string[] }
): GuessResponse {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');

  let character =
    (characterId ? findCharacterById(row.theme, characterId) : null) ||
    findCharacterByGuess(row.theme, guessText);
  if (!character) {
    return {
      session: getGameSession(sessionId)!,
      notInBank: true,
      message: '题库中没有该角色',
    };
  }

  const answer = getCharacter(row.theme, row.answer_id)!;
  const activeFields = parseActiveFields(row.active_fields, row.theme);
  const isCorrect = character.id === answer.id;
  const fieldResults = compareAllFields(
    row.theme,
    character,
    answer,
    activeFields,
    row.question_compare_move
  );

  let attemptsLeft = row.attempts_left - 1;
  let questionAttempts = row.question_attempts + 1;
  let score = row.score;
  let correctCount = row.correct_count;
  let status: SessionStatus = row.status;
  let lastQuestionScore: number | undefined;

  if (isCorrect) {
    lastQuestionScore = scoreForQuestion(questionAttempts);
    score += lastQuestionScore;
    correctCount += 1;
    attemptsLeft = Math.min(MAX_ATTEMPTS, attemptsLeft + 2);
    status = 'question_done';
  } else if (attemptsLeft <= 0) {
    status = 'game_over';
  }

  db.prepare(
    `UPDATE sessions SET attempts_left = ?, score = ?, correct_count = ?, question_attempts = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(attemptsLeft, score, correctCount, questionAttempts, status, sessionId);

  db.prepare(
    `INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    getDisplayName(character, row.theme),
    character.id,
    isCorrect ? 1 : 0,
    JSON.stringify(fieldResults),
    row.question_index
  );

  if (isCorrect && status === 'question_done') {
    if (room) {
      const nextIndex = row.question_index + 1;
      const nextSetup = room.questionQueue[nextIndex];
      if (nextSetup && row.attempts_left > 0) {
        db.prepare(
          `UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?, question_compare_move = ?, question_attempts = 0, question_index = ?, status = 'playing', updated_at = datetime('now') WHERE id = ?`
        ).run(
          nextSetup.answerId,
          nextSetup.hintField,
          JSON.stringify(nextSetup.extraHintFields),
          JSON.stringify(nextSetup.activeFields),
          nextSetup.compareMove,
          nextIndex,
          sessionId
        );
        room.currentQuestionIndex = Math.max(room.currentQuestionIndex, nextIndex);
      }
    } else {
      advanceBattleQuestion(sessionId, row);
    }
  }

  return {
    session: {
      ...getGameSession(sessionId)!,
      lastGuessCorrect: isCorrect,
      lastQuestionScore,
    },
  };
}

function advanceBattleQuestion(sessionId: string, row: SessionRow) {
  if (row.attempts_left <= 0) return;
  const used = parseUsedAnswerIds(row.used_answer_ids);
  const answer = pickRandomCharacter(row.theme, used);
  const setup = resolveQuestionSetup(row.theme, answer);
  db.prepare(
    `UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?, question_compare_move = ?, used_answer_ids = ?, question_attempts = 0, question_index = question_index + 1, status = 'playing', updated_at = datetime('now') WHERE id = ?`
  ).run(
    setup.answerId,
    setup.hintField,
    JSON.stringify(setup.extraHintFields),
    JSON.stringify(setup.activeFields),
    setup.compareMove,
    JSON.stringify([...used, setup.answerId]),
    sessionId
  );
}

export function processRelayGuess(
  sessionId: string,
  guessText: string,
  characterId: string | undefined,
  room: RelayRoomContext
): GuessResponse {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');

  let character =
    (characterId ? findCharacterById(row.theme, characterId) : null) ||
    findCharacterByGuess(row.theme, guessText);
  if (!character) {
    return {
      session: getGameSession(sessionId)!,
      notInBank: true,
      message: '题库中没有该角色',
    };
  }

  const answer = getCharacter(row.theme, row.answer_id)!;
  const activeFields = parseActiveFields(row.active_fields, row.theme);
  const isCorrect = character.id === answer.id;
  let fieldResults = compareAllFields(
    row.theme,
    character,
    answer,
    activeFields,
    row.question_compare_move
  );

  const relayResult = scoreRelayGuess(
    row.theme,
    fieldResults,
    isCorrect,
    room.relayFieldClaims,
    sessionId,
    row.player_name,
    room.relayRound
  );

  room.relayFieldClaims = relayResult.newClaims;
  fieldResults = applyClaimsToFieldResults(fieldResults, room.relayFieldClaims);

  let attemptsLeft = row.attempts_left - 1;
  let score = row.score + relayResult.scoreDelta;
  let status: SessionStatus = row.status;
  const questionAttempts = row.question_attempts + 1;

  if (relayResult.fullCorrect) {
    status = 'question_done';
    attemptsLeft = Math.min(MAX_ATTEMPTS, attemptsLeft + 2);
  } else if (attemptsLeft <= 0) {
    status = 'game_over';
  }

  if (!relayResult.fullCorrect) {
    const order = room.playerOrder;
    const idx = order.indexOf(sessionId);
    const nextIdx = (idx + 1) % order.length;
    room.relayTurnSessionId = order[nextIdx];
  }

  db.prepare(
    `UPDATE sessions SET attempts_left = ?, score = ?, question_attempts = ?, status = ?, correct_count = correct_count + ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    attemptsLeft,
    score,
    questionAttempts,
    status,
    relayResult.fullCorrect ? 1 : 0,
    sessionId
  );

  db.prepare(
    `INSERT INTO guesses (session_id, guess_name, guess_id, is_correct, field_results, question_index)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    getDisplayName(character, row.theme),
    character.id,
    isCorrect ? 1 : 0,
    JSON.stringify(fieldResults),
    row.question_index
  );

  if (relayResult.fullCorrect) {
    db.prepare(
      `UPDATE sessions SET question_attempts = 0, status = 'playing', updated_at = datetime('now') WHERE id = ?`
    ).run(sessionId);
  }

  return {
    session: {
      ...getGameSession(sessionId)!,
      lastGuessCorrect: isCorrect,
    },
    scoreBreakdown: relayResult.breakdown,
    fullCorrect: relayResult.fullCorrect,
  };
}

export function nextQuestion(sessionId: string): GameSession {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');
  if (row.game_mode === 'daily-one') {
    throw new Error('每日一题没有下一题');
  }
  if (row.status !== 'question_done') {
    throw new Error('Must answer correctly before next question');
  }
  if (row.game_mode !== 'reverse-bomb' && row.attempts_left <= 0) {
    throw new Error('No attempts left');
  }

  const used = parseUsedAnswerIds(row.used_answer_ids);
  const answer = pickRandomCharacter(row.theme, used);
  const setup = resolveQuestionSetup(row.theme, answer);
  let progressiveState: ProgressiveState | undefined;
  let reverseStateJson: string | undefined;
  let attemptsLeft = row.attempts_left;

  if (row.game_mode === 'progressive-hint') {
    const prev = parseProgressiveState(row.progressive_state);
    const carryLives = prev.lives;
    if (carryLives <= 0) {
      throw new Error('No attempts left');
    }
    progressiveState = createInitialProgressiveState(row.theme, setup, answer, undefined, {
      lives: carryLives,
    });
  }

  if (row.game_mode === 'reverse-bomb') {
    if (row.question_index >= REVERSE_ROUNDS_PER_GAME - 1) {
      throw new Error('已完成全部轮次');
    }
    setup.hintField = '_reverse';
    setup.extraHintFields = [];
    setup.activeFields = getReverseQueryableFields(row.theme);
    setup.compareMove = null;
    const prevReverse = parseReverseState(row.progressive_state);
    const freshReverse = createInitialReverseState(row.theme, setup.answerId);
    reverseStateJson = JSON.stringify({
      ...freshReverse,
      roundHistory: prevReverse.roundHistory,
    });
    attemptsLeft = REVERSE_QUERY_ATTEMPTS;
  }

  const progressiveLives =
    row.game_mode === 'progressive-hint' ? progressiveState!.lives : attemptsLeft;

  db.prepare(
    `UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, active_fields = ?, question_compare_move = ?, used_answer_ids = ?, question_attempts = 0, question_index = question_index + 1, status = 'playing', progressive_state = ?, attempts_left = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    setup.answerId,
    setup.hintField,
    JSON.stringify(setup.extraHintFields),
    JSON.stringify(setup.activeFields),
    setup.compareMove,
    JSON.stringify([...used, setup.answerId]),
    reverseStateJson ?? JSON.stringify(progressiveState ?? {}),
    progressiveLives,
    sessionId
  );

  return getGameSession(sessionId)!;
}

export function quitGame(sessionId: string): GameSession {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');

  if (row.status !== 'game_over' && row.status !== 'quit' && row.status !== 'failed') {
    if (row.game_mode !== 'battle' && row.game_mode !== 'relay-chain' && row.game_mode !== 'daily-one') {
      handleGameEndLeaderboard(row, row.score, row.correct_count);
    }
    if (row.game_mode === 'daily-one') {
      const elapsedUs = computeElapsedUs(row);
      finishDailyPlayerAttempt(sessionId, 'quit', row.question_attempts, elapsedUs);
    }
    db.prepare(
      `UPDATE sessions SET status = 'quit', updated_at = datetime('now') WHERE id = ?`
    ).run(sessionId);
  }

  return getGameSession(sessionId)!;
}

function enrichProgressiveRounds(theme: Theme, rounds: ProgressiveRound[]): ProgressiveRound[] {
  return rounds.map((round) => ({
    ...round,
    guesses: (Array.isArray(round.guesses) ? round.guesses : []).map((g) => {
      if (g.imageUrl) return g;
      if (!g.guessId) return { ...g, imageUrl: null };
      const char = getCharacter(theme, g.guessId);
      return { ...g, imageUrl: char ? getCharacterImage(char) : null };
    }),
  }));
}

export function getGameSession(sessionId: string): GameSession | null {
  const row = getSessionRow(sessionId);
  if (!row) return null;

  const answer = getCharacter(row.theme, row.answer_id);
  if (!answer) return null;

  const base = rowToSession(row);
  const activeFields = parseActiveFields(row.active_fields, row.theme);
  const extraHintFields = parseExtraHintFields(row.extra_hint_fields);
  const progressiveState =
    row.game_mode === 'progressive-hint'
      ? parseProgressiveState(row.progressive_state)
      : undefined;
  const reverseState =
    row.game_mode === 'reverse-bomb'
      ? parseReverseState(row.progressive_state)
      : undefined;
  const reverseQueries =
    row.game_mode === 'reverse-bomb' ? loadReverseQueries(sessionId, row.question_index) : undefined;

  const guesses = loadGuesses(sessionId, row.question_index).map((g) => {
    if (g.guessId) {
      const char = getCharacter(row.theme, g.guessId);
      return { ...g, imageUrl: char ? getCharacterImage(char) : null };
    }
    return g;
  });
  const hitFields = collectHitFields(guesses);
  const hints =
    row.game_mode === 'reverse-bomb'
      ? reverseState?.accurateHint
        ? [reverseState.accurateHint]
        : []
      : buildSessionHints(
          row.theme,
          answer,
          row.hint_field,
          extraHintFields,
          row.question_attempts,
          activeFields,
          hitFields,
          row.question_compare_move,
          progressiveState
        );

  return {
    ...base,
    attemptsLeft: progressiveState ? progressiveState.lives : base.attemptsLeft,
    hint: hints[0] ?? { field: '_reverse', label: '逆向轰炸', value: null },
    hints,
    guesses,
    correctAnswers: loadCorrectAnswers(sessionId, row.theme),
    guessPlaceholder: getGuessPlaceholder(row.theme),
    elapsedUs: row.game_mode === 'daily-one' ? computeElapsedUs(row) : row.elapsed_us ?? undefined,
    progressiveRounds: progressiveState
      ? enrichProgressiveRounds(row.theme, progressiveState.rounds)
      : undefined,
    progressiveLives: progressiveState?.lives,
    reverseQueries,
    reversePlayablePool:
      row.game_mode === 'reverse-bomb'
        ? buildPlayablePool(row.theme, reverseState?.questionPoolIds)
        : undefined,
    reverseEliminatedIds:
      row.game_mode === 'reverse-bomb' && reverseQueries
        ? computeEliminatedIds(row.theme, reverseQueries, reverseState?.questionPoolIds)
        : undefined,
    finalGuessUsed: reverseState?.finalGuessUsed,
    reverseFieldChoices: reverseState?.fieldChoices,
    reverseRoundHistory: reverseState?.roundHistory,
    reversePhase: reverseState?.phase,
    revealedAnswer: buildRevealedAnswer(row),
  };
}

export function getLeaderboard(
  limit = 20,
  gameMode: GameMode = 'classic-six',
  theme?: Theme
): LeaderboardEntry[] {
  let sql = `SELECT id, player_name, theme, game_mode, total_score, correct_count, created_at
             FROM leaderboard WHERE total_score > 0 AND game_mode = ?`;
  const params: (string | number)[] = [gameMode];
  if (theme) {
    sql += ' AND theme = ?';
    params.push(theme);
  }
  sql += ' ORDER BY total_score DESC, correct_count DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    player_name: string;
    theme: Theme;
    game_mode: GameMode;
    total_score: number;
    correct_count: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    playerName: r.player_name,
    theme: r.theme,
    gameMode: r.game_mode,
    totalScore: r.total_score,
    correctCount: r.correct_count,
    createdAt: r.created_at,
  }));
}

export function getDailyLeaderboard(
  theme: Theme,
  limit = 20,
  challengeDate?: string
): DailyLeaderboardEntry[] {
  const date = challengeDate ?? getDailyChallengeDate();
  const rows = db
    .prepare(
      `SELECT id, player_name, theme, challenge_date, attempts_used, elapsed_us, completed_at
       FROM daily_leaderboard
       WHERE challenge_date = ? AND theme = ?
       ORDER BY attempts_used ASC, elapsed_us ASC
       LIMIT ?`
    )
    .all(date, theme, limit) as Array<{
    id: number;
    player_name: string;
    theme: Theme;
    challenge_date: string;
    attempts_used: number;
    elapsed_us: number;
    completed_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    playerName: r.player_name,
    theme: r.theme,
    challengeDate: r.challenge_date,
    attemptsUsed: r.attempts_used,
    elapsedUs: r.elapsed_us,
    completedAt: r.completed_at,
  }));
}

export function getDailyTodayInfo(theme: Theme, playerKey: string): DailyTodayInfo {
  const challengeDate = getDailyChallengeDate();
  getOrCreateDailyChallenge(theme);

  const attempt = playerKey.trim()
    ? getDailyPlayerAttempt(challengeDate, theme, playerKey.trim())
    : undefined;

  if (!attempt) {
    return { challengeDate, theme, completed: false };
  }

  const finished = attempt.status !== 'playing';
  return {
    challengeDate,
    theme,
    completed: finished,
    inProgress: attempt.status === 'playing',
    sessionId: attempt.session_id,
    status: attempt.status,
    bestAttempts: attempt.attempts_used ?? undefined,
    bestElapsedUs: attempt.elapsed_us ?? undefined,
  };
}
