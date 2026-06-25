import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import {
  CharacterEntry,
  CorrectAnswerRecord,
  FieldCompare,
  GameSession,
  GuessRecord,
  HintInfo,
  MAX_ATTEMPTS,
  SessionStatus,
  THEME_FIELDS,
  Theme,
  scoreForQuestion,
} from '../types';
import {
  findCharacterByGuess,
  findCharacterById,
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
import { compareField, formatValue, getNumericDirection } from './compareEngine';
import {
  buildFootballPrimaryHint,
  getFootballHintFields,
  isHintFieldExcluded,
} from './footballHints';
import {
  buildNBAPrimaryHint,
  getNBAHintFields,
  isNBAHintFieldExcluded,
} from './nbaHints';

interface SessionRow {
  id: string;
  player_name: string;
  theme: Theme;
  answer_id: string;
  hint_field: string;
  extra_hint_fields: string;
  used_answer_ids: string;
  attempts_left: number;
  score: number;
  correct_count: number;
  question_attempts: number;
  question_index: number;
  status: SessionStatus;
}

const BONUS_HINT_THRESHOLDS = [3, 6, 9];

function shuffleFields(fields: string[]): string[] {
  const copy = [...fields];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickQuestionHints(theme: Theme): { primary: string; extra: string[] } {
  if (theme === 'anime') {
    const rest = shuffleFields(
      getHintFields(theme).filter((f) => f !== 'name' && f !== 'anime' && f !== 'affiliation')
    );
    return { primary: 'anime', extra: rest.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  if (theme === 'football') {
    const extra = shuffleFields(getFootballHintFields());
    return { primary: 'confederation', extra: extra.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  if (theme === 'nba') {
    const extra = shuffleFields(getNBAHintFields());
    return { primary: 'division', extra: extra.slice(0, BONUS_HINT_THRESHOLDS.length) };
  }
  const shuffled = shuffleFields(
    getHintFields(theme).filter((f) => f !== 'name' && !isHintFieldExcluded(f) && !isNBAHintFieldExcluded(f))
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
    for (const f of g.fieldResults ?? []) {
      if (f.result === 'hit') hit.add(f.field);
    }
  }
  return hit;
}

function buildSessionHints(
  theme: Theme,
  answer: CharacterEntry,
  hintField: string,
  extraHintFields: string[],
  questionAttempts: number,
  hitFields: Set<string> = new Set()
): HintInfo[] {
  const hints =
    theme === 'football'
      ? [buildFootballPrimaryHint(answer)]
      : theme === 'nba'
        ? [buildNBAPrimaryHint(answer)]
        : [buildHint(theme, answer, hintField)];

  const shownFields = new Set(hints.map((h) => h.field));

  for (let i = 0; i < extraHintFields.length; i++) {
    if (questionAttempts < BONUS_HINT_THRESHOLDS[i]) continue;
    const field = extraHintFields[i];
    if (hitFields.has(field) || shownFields.has(field)) continue;
    hints.push(buildHint(theme, answer, field));
    shownFields.add(field);
  }
  return hints;
}

function buildHint(theme: Theme, answer: CharacterEntry, hintField: string): HintInfo {
  if (isHintFieldExcluded(hintField)) {
    throw new Error(`Field "${hintField}" cannot be used as a hint`);
  }
  const fieldDef = THEME_FIELDS[theme].find((f) => f.field === hintField);
  let value = getCharacterField(answer, hintField, theme);
  if (theme === 'nba' && hintField === 'team') {
    value = getNBATeamDisplay(String(value || ''));
  }
  return {
    field: hintField,
    label: fieldDef?.label ?? hintField,
    value: formatValue(value, hintField),
  };
}

function compareAllFields(
  theme: Theme,
  guess: CharacterEntry,
  answer: CharacterEntry
): FieldCompare[] {
  const fields = THEME_FIELDS[theme];
  return fields.map(({ field, label }) => {
    const guessCompare =
      field === 'name' ? getNameFieldValue(guess, theme) : getCharacterField(guess, field, theme);
    const answerCompare =
      field === 'name' ? getNameFieldValue(answer, theme) : getCharacterField(answer, field, theme);

    let guessDisplay = guessCompare;
    let answerDisplay = answerCompare;

    // For NBA team field, show Chinese team name instead of English code
    if (theme === 'nba' && field === 'team') {
      guessDisplay = getNBATeamDisplay(String(guessCompare || ''));
      answerDisplay = getNBATeamDisplay(String(answerCompare || ''));
    }

    // NBA position: compare raw codes (G-F); display Chinese + English subtitle separately
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

    const guessValue = formatValue(guessDisplay, field);
    const answerValue = formatValue(answerDisplay, field);
    const result = compareField(theme, field, compareGuess, compareAnswer);
    const direction =
      result !== 'hit'
        ? getNumericDirection(theme, field, compareGuess, compareAnswer)
        : null;
    return {
      field,
      label,
      guessValue,
      answerValue: field === 'position' && result !== 'hit' ? null : answerValue,
      result,
      showAnswer: result === 'hit',
      direction,
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
    .map((r) => ({
      id: r.id,
      guessName: r.guess_name,
      guessId: r.guess_id,
      isCorrect: r.is_correct === 1,
      fieldResults: r.field_results ? JSON.parse(r.field_results) : null,
      createdAt: r.created_at,
      questionIndex: r.question_index,
      imageUrl: null as string | null,
    }));
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
        fieldResults = JSON.parse(r.field_results);
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
    attemptsLeft: row.attempts_left,
    score: row.score,
    correctCount: row.correct_count,
    status: row.status,
    questionAttempts: row.question_attempts,
    questionIndex: row.question_index,
  };
}

function getSessionRow(sessionId: string): SessionRow | undefined {
  return db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined;
}

function saveToLeaderboard(
  playerName: string,
  theme: Theme,
  totalScore: number,
  correctCount: number
) {
  db.prepare(
    `INSERT INTO leaderboard (player_name, theme, total_score, correct_count)
     VALUES (?, ?, ?, ?)`
  ).run(playerName, theme, totalScore, correctCount);
}

export function startGame(playerName: string, theme: Theme): GameSession {
  const answer = pickRandomCharacter(theme);
  const { primary: hintField, extra: extraHintFields } = pickQuestionHints(theme);
  const sessionId = uuidv4();

  db.prepare(
    `INSERT INTO sessions (id, player_name, theme, answer_id, hint_field, extra_hint_fields, used_answer_ids, attempts_left, score, correct_count, question_attempts, question_index, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'playing')`
  ).run(
    sessionId,
    playerName.trim(),
    theme,
    answer.id,
    hintField,
    JSON.stringify(extraHintFields),
    JSON.stringify([answer.id]),
    MAX_ATTEMPTS
  );

  const hints = buildSessionHints(theme, answer, hintField, extraHintFields, 0);

  return {
    sessionId,
    playerName: playerName.trim(),
    theme,
    attemptsLeft: MAX_ATTEMPTS,
    score: 0,
    correctCount: 0,
    status: 'playing',
    hint: hints[0],
    hints,
    guesses: [],
    correctAnswers: [],
    questionAttempts: 0,
    questionIndex: 0,
    guessPlaceholder: getGuessPlaceholder(theme),
  };
}

export interface GuessResponse {
  session: GameSession;
  notInBank?: boolean;
  message?: string;
  correctAnswer?: { name: string; imageUrl: string | null };
}

export function submitGuess(
  sessionId: string,
  guessText: string,
  characterId?: string
): GuessResponse {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');
  if (row.status === 'game_over' || row.status === 'quit') {
    throw new Error('Game already ended');
  }
  if (row.status === 'question_done') {
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
  const isCorrect = character.id === answer.id;
  const fieldResults = compareAllFields(row.theme, character, answer);

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
    saveToLeaderboard(row.player_name, row.theme, score, correctCount);
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
    session: {
      ...session,
      lastGuessCorrect: isCorrect,
      lastQuestionScore,
    },
    correctAnswer,
  };
}

export function nextQuestion(sessionId: string): GameSession {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');
  if (row.status !== 'question_done') {
    throw new Error('Must answer correctly before next question');
  }
  if (row.attempts_left <= 0) {
    throw new Error('No attempts left');
  }

  const used = parseUsedAnswerIds(row.used_answer_ids);
  const answer = pickRandomCharacter(row.theme, used);
  const { primary: hintField, extra: extraHintFields } = pickQuestionHints(row.theme);

  db.prepare(
    `UPDATE sessions SET answer_id = ?, hint_field = ?, extra_hint_fields = ?, used_answer_ids = ?, question_attempts = 0, question_index = question_index + 1, status = 'playing', updated_at = datetime('now') WHERE id = ?`
  ).run(
    answer.id,
    hintField,
    JSON.stringify(extraHintFields),
    JSON.stringify([...used, answer.id]),
    sessionId
  );

  return getGameSession(sessionId)!;
}

export function quitGame(sessionId: string): GameSession {
  const row = getSessionRow(sessionId);
  if (!row) throw new Error('Session not found');

  if (row.status !== 'game_over' && row.status !== 'quit') {
    saveToLeaderboard(row.player_name, row.theme, row.score, row.correct_count);
    db.prepare(
      `UPDATE sessions SET status = 'quit', updated_at = datetime('now') WHERE id = ?`
    ).run(sessionId);
  }

  return getGameSession(sessionId)!;
}

export function getGameSession(sessionId: string): GameSession | null {
  const row = getSessionRow(sessionId);
  if (!row) return null;

  const answer = getCharacter(row.theme, row.answer_id)!;
  const base = rowToSession(row);
  const extraHintFields = parseExtraHintFields(row.extra_hint_fields);
  const guesses = loadGuesses(sessionId, row.question_index).map((g) => {
    if (g.guessId) {
      const char = getCharacter(row.theme, g.guessId);
      return { ...g, imageUrl: char ? getCharacterImage(char) : null };
    }
    return g;
  });
  const hitFields = collectHitFields(guesses);
  const hints = buildSessionHints(
    row.theme,
    answer,
    row.hint_field,
    extraHintFields,
    row.question_attempts,
    hitFields
  );

  return {
    ...base,
    hint: hints[0],
    hints,
    guesses,
    correctAnswers: loadCorrectAnswers(sessionId, row.theme),
    guessPlaceholder: getGuessPlaceholder(row.theme),
  };
}

export function getLeaderboard(limit = 20) {
  const rows = db
    .prepare(
      `SELECT id, player_name, theme, total_score, correct_count, created_at
       FROM leaderboard ORDER BY total_score DESC, correct_count DESC LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    player_name: string;
    theme: Theme;
    total_score: number;
    correct_count: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    playerName: r.player_name,
    theme: r.theme,
    totalScore: r.total_score,
    correctCount: r.correct_count,
    createdAt: r.created_at,
  }));
}
