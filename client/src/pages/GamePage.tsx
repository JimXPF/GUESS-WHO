import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  getSession,
  nextQuestion,
  quitGame,
  SESSION_KEY,
  submitGuess,
} from '../api';
import GuessRow from '../components/GuessRow';
import GuessInput from '../components/GuessInput';
import HintCard from '../components/HintCard';
import ProgressivePanel from '../components/ProgressivePanel';
import ReverseTagBar from '../components/reverse/ReverseTagBar';
import ReverseDualFieldPicker from '../components/reverse/ReverseDualFieldPicker';
import ReverseCardGrid from '../components/reverse/ReverseCardGrid';
import ReverseIntroBanner from '../components/reverse/ReverseIntroBanner';
import ReverseRoundHistory from '../components/reverse/ReverseRoundHistory';
import ReverseRoundProgress from '../components/reverse/ReverseRoundProgress';
import {
  ELIM_MOVE_MS,
  ELIM_RESIZE_MS,
  eliminationWaveConfig,
  sleep,
  type ReverseGridPhase,
} from '../components/reverse/reverseGridPhases';
import CongratsBanner from '../components/CongratsBanner';
import CorrectHistory from '../components/CorrectHistory';
import StatSidebar, { AttemptsBadge } from '../components/StatSidebar';
import GameTopStats from '../components/GameTopStats';
import MobileGuessFooter from '../components/MobileGuessFooter';
import AnswerRevealModal from '../components/AnswerRevealModal';
import CharacterAvatar from '../components/CharacterAvatar';
import { GameSession, THEME_LABELS, scoreForQuestion, formatElapsedUs, PROGRESSIVE_LIVES, REVERSE_QUERY_ATTEMPTS, REVERSE_ROUNDS_PER_GAME, reverseRoundLabel, PlayableCardSummary } from '../types';

const GUESS_PLACEHOLDER: Record<GameSession['theme'], string> = {
  csgo: '输入选手 ID，如 NiKo、donk...',
  football: '输入人物中文名...',
  nba: '输入人物中文名...',
  pokemon: '输入宝可梦中文名，如 皮卡丘...',
};

export default function GamePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<GameSession | null>(null);
  const [guessText, setGuessText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [pulseAttempts, setPulseAttempts] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showAnswerReveal, setShowAnswerReveal] = useState(false);
  const [answerReveal, setAnswerReveal] = useState<{
    answer: { name: string; imageUrl: string | null };
    variant: 'success' | 'failure';
  } | null>(null);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [elapsedDisplay, setElapsedDisplay] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevAttempts = useRef<number>(10);
  const [eliminatedIds, setEliminatedIds] = useState<Set<string>>(new Set());
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | undefined>();
  const [queryFeedback, setQueryFeedback] = useState<string | null>(null);
  const [roundModal, setRoundModal] = useState<{
    answer: { name: string; imageUrl: string | null };
    score: number;
    success: boolean;
    autoDeduced?: boolean;
  } | null>(null);
  const [showSurvivorsOnly, setShowSurvivorsOnly] = useState(true);
  const [gridPhase, setGridPhase] = useState<ReverseGridPhase>('idle');
  const [doomedIds, setDoomedIds] = useState<Set<string>>(new Set());
  const [bombProgress, setBombProgress] = useState<{ done: number; total: number } | null>(null);
  const [bombWaveToken, setBombWaveToken] = useState(0);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const elimAbortRef = useRef<AbortController | null>(null);

  const loadSession = useCallback(async () => {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      navigate('/');
      return;
    }
    try {
      const s = await getSession(id);
      if (s.status === 'game_over' || s.status === 'quit' || s.status === 'failed') {
        navigate('/result');
        return;
      }
      setSession(s);
      if (s.gameMode === 'reverse-bomb' && s.reverseEliminatedIds) {
        setEliminatedIds(new Set(s.reverseEliminatedIds));
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (session && session.attemptsLeft < prevAttempts.current) {
      setPulseAttempts(true);
      const t = setTimeout(() => setPulseAttempts(false), 600);
      prevAttempts.current = session.attemptsLeft;
      return () => clearTimeout(t);
    }
    if (session) prevAttempts.current = session.attemptsLeft;
  }, [session?.attemptsLeft]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [session?.guesses.length, session?.progressiveRounds]);

  useEffect(() => {
    if (session?.gameMode !== 'daily-one') return;
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return;
    const poll = async () => {
      try {
        const s = await getSession(id);
        if (s.elapsedUs != null) setElapsedDisplay(formatElapsedUs(s.elapsedUs));
      } catch {
        /* ignore */
      }
    };
    poll();
    const timer = setInterval(poll, 200);
    return () => clearInterval(timer);
  }, [session?.gameMode]);

  const handleGuess = useCallback(
    async (text?: string, characterId?: string) => {
      const guess = (text ?? guessText).trim();
      if (!session || !guess || loading) return;
      if (session.status === 'question_done') return;

      setLoading(true);
      setError('');
      try {
        const id = characterId ?? selectedCharacterId;
        const result = await submitGuess(session.sessionId, guess, id);
        setSession(result.session);

        if (result.notInBank) {
          setToast(result.message || '题库中没有该角色');
          setTimeout(() => setToast(''), 3000);
        } else {
          setGuessText('');
          setSelectedCharacterId(undefined);
          if (result.correctAnswer) {
            if (result.session.gameMode === 'reverse-bomb') {
              const last = result.session.reverseRoundHistory?.slice(-1)[0];
              setRoundModal({
                answer: result.correctAnswer,
                score: last?.score ?? result.session.lastQuestionScore ?? 0,
                success: Boolean(result.session.lastGuessCorrect),
              });
            } else {
              setAnswerReveal({
                answer: result.correctAnswer,
                variant: result.session.lastGuessCorrect ? 'success' : 'failure',
              });
              setShowAnswerReveal(true);
            }
          } else if (
            result.session.gameMode === 'reverse-bomb' &&
            (result.session.status === 'question_done' || result.session.status === 'game_over')
          ) {
            const last = result.session.reverseRoundHistory?.slice(-1)[0];
            if (last) {
              setRoundModal({
                answer: {
                  name: last.answerName,
                  imageUrl: last.imageUrl,
                },
                score: last.score,
                success: true,
              });
            }
          } else if (
            result.session.gameMode !== 'reverse-bomb' &&
            (result.session.status === 'game_over' || result.session.status === 'failed')
          ) {
            navigate('/result');
          }
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [session, guessText, loading, selectedCharacterId, navigate]
  );

  const handleNext = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const s = await nextQuestion(session.sessionId);
      setSession(s);
      setGuessText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  const handleQuit = useCallback(async () => {
    if (!session) return;
    try {
      await quitGame(session.sessionId);
      navigate('/result');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [session, navigate]);

  const runEliminationSequence = useCallback(
    async (ids: string[], finalEliminated: string[], signal: AbortSignal) => {
      const { waveSize, bombMs, gapMs } = eliminationWaveConfig(ids.length);

      setGridPhase('bomb');
      setDoomedIds(new Set());
      setAnimatingIds(new Set());
      setBombProgress({ done: 0, total: ids.length });

      for (let i = 0; i < ids.length; i += waveSize) {
        const wave = ids.slice(i, i + waveSize);
        setBombWaveToken((n) => n + 1);
        setAnimatingIds(new Set(wave));
        await sleep(bombMs, signal);
        setAnimatingIds(new Set());
        setDoomedIds((prev) => {
          const next = new Set(prev);
          for (const id of wave) next.add(id);
          return next;
        });
        setBombProgress({
          done: Math.min(i + wave.length, ids.length),
          total: ids.length,
        });
        if (i + waveSize < ids.length) {
          await sleep(gapMs, signal);
        }
      }

      await sleep(100, signal);
      setBombProgress(null);

      flushSync(() => {
        setGridPhase('move');
        setDoomedIds(new Set());
        setAnimatingIds(new Set());
        setEliminatedIds(new Set(finalEliminated));
        setLayoutEpoch((n) => n + 1);
      });
      await sleep(ELIM_MOVE_MS, signal);

      flushSync(() => {
        setGridPhase('resize');
      });
      await sleep(ELIM_RESIZE_MS, signal);
      setGridPhase('idle');
    },
    []
  );

  const handleReverseQuerySuccess = useCallback(
    (result: {
      newlyEliminatedIds: string[];
      session: GameSession;
      matched: boolean;
      autoResolved?: boolean;
      roundScore?: number;
      answer?: { name: string; imageUrl: string | null };
    }) => {
      setSession(result.session);
      setQueryFeedback(result.matched ? '条件符合答案 ✓' : '条件不符合答案 ✗');
      window.setTimeout(() => setQueryFeedback(null), 2800);

      elimAbortRef.current?.abort();
      const ac = new AbortController();
      elimAbortRef.current = ac;

      const finalEliminated = result.session.reverseEliminatedIds ?? [];

      if (result.newlyEliminatedIds.length > 0) {
        void runEliminationSequence(result.newlyEliminatedIds, finalEliminated, ac.signal).catch(
          (err) => {
            if ((err as Error).name === 'AbortError') return;
            setAnimatingIds(new Set());
            setDoomedIds(new Set());
            setBombProgress(null);
            setGridPhase('idle');
            setEliminatedIds(new Set(finalEliminated));
            setLayoutEpoch((n) => n + 1);
          }
        );
      } else if (finalEliminated.length > 0) {
        setEliminatedIds(new Set(finalEliminated));
      }

      if (result.autoResolved && result.answer && result.roundScore != null) {
        setRoundModal({
          answer: result.answer,
          score: result.roundScore,
          success: true,
          autoDeduced: true,
        });
      }
    },
    [runEliminationSequence]
  );

  const handleReverseNext = useCallback(async () => {
    elimAbortRef.current?.abort();
    setRoundModal(null);
    setEliminatedIds(new Set());
    setAnimatingIds(new Set());
    setDoomedIds(new Set());
    setBombProgress(null);
    setGridPhase('idle');
    setLayoutEpoch((n) => n + 1);
    setShowSurvivorsOnly(true);
    setGuessText('');
    setSelectedCharacterId(undefined);
    if (!session) return;

    let fresh = session;
    try {
      fresh = await getSession(session.sessionId);
      setSession(fresh);
    } catch {
      /* use cached session */
    }

    if (fresh.status === 'game_over') {
      navigate('/result');
      return;
    }
    await handleNext();
  }, [handleNext, session, navigate]);

  useEffect(() => () => elimAbortRef.current?.abort(), []);

  const handleReverseGuessInputChange = useCallback((v: string) => {
    setGuessText(v);
    setSelectedCharacterId(undefined);
  }, []);

  const isReverseBombMode = session?.gameMode === 'reverse-bomb';
  const reversePool = useMemo(
    () => (isReverseBombMode ? session!.reversePlayablePool ?? [] : []),
    [isReverseBombMode, session?.reversePlayablePool]
  );
  const reverseQueries = useMemo(
    () => (isReverseBombMode ? session!.reverseQueries ?? [] : []),
    [isReverseBombMode, session?.reverseQueries]
  );
  const reverseChoices = useMemo(
    () => (isReverseBombMode ? session!.reverseFieldChoices ?? [] : []),
    [isReverseBombMode, session?.reverseFieldChoices]
  );
  const reversePhase = useMemo(() => {
    if (!isReverseBombMode || !session) return 'filtering' as const;
    return session.status === 'question_done'
      ? ('done' as const)
      : session.reversePhase ?? 'filtering';
  }, [isReverseBombMode, session?.status, session?.reversePhase]);

  const handleReverseCardClick = useCallback(
    (card: PlayableCardSummary) => {
      if (session?.reversePhase !== 'guessing') return;
      setGuessText(card.name);
      setSelectedCharacterId(card.id);
    },
    [session?.reversePhase]
  );

  if (!session) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <p className="text-apple-gray">加载游戏中...</p>
      </div>
    );
  }

  const currentGuesses = session.guesses.filter(
    (g) => session.showCompareGrid !== false ? g.fieldResults !== null : true
  );
  const showGrid = session.showCompareGrid !== false;
  const isDaily = session.gameMode === 'daily-one';
  const isProgressive = session.gameMode === 'progressive-hint';
  const isReverseBomb = session.gameMode === 'reverse-bomb';
  const maxAttempts = session.maxAttempts ?? (isProgressive ? PROGRESSIVE_LIVES : isReverseBomb ? REVERSE_QUERY_ATTEMPTS : 10);
  const placeholder =
    session.guessPlaceholder ?? GUESS_PLACEHOLDER[session.theme];
  const questionDone = session.status === 'question_done';
  const lastScore =
    session.lastQuestionScore ?? scoreForQuestion(session.questionAttempts);
  const inputDisabled = isReverseBomb
    ? Boolean(session.finalGuessUsed)
    : session.attemptsLeft <= 0;

  if (isReverseBomb) {
    const showGuessInput =
      session.status === 'playing' &&
      (reversePhase === 'guessing' || session.attemptsLeft <= 0);
    const showFieldPicker =
      session.status === 'playing' && reversePhase === 'filtering' && session.attemptsLeft > 0;

    const reverseCompletedRounds = session.reverseRoundHistory?.length ?? 0;
    const reverseCurrentRound =
      session.status === 'playing'
        ? (session.questionIndex ?? 0) + 1
        : Math.min(reverseCompletedRounds + 1, REVERSE_ROUNDS_PER_GAME);
    const reverseRoundProgress = {
      totalRounds: REVERSE_ROUNDS_PER_GAME,
      completedRounds: reverseCompletedRounds,
      currentRound: reverseCurrentRound,
    };
    const reverseRoundName = reverseRoundLabel(session.questionIndex ?? 0);

    const bottomBar =
      questionDone ? (
        <motion.button
          whileTap={{ scale: 0.97 }}
          className="btn-primary w-full text-base py-3"
          onClick={handleReverseNext}
          disabled={loading}
        >
          {loading ? '加载中...' : '下一题 →'}
        </motion.button>
      ) : showFieldPicker ? (
        <ReverseDualFieldPicker
          session={session}
          choices={reverseChoices}
          onQuerySuccess={handleReverseQuerySuccess}
          disabled={loading}
        />
      ) : showGuessInput ? (
        <div className="flex gap-2">
          <GuessInput
            theme={session.theme}
            value={guessText}
            placeholder="筛选已用尽，输入终极猜测"
            onChange={handleReverseGuessInputChange}
            onSubmit={handleGuess}
            disabled={loading}
            loading={loading}
            suggestionsPlacement="top"
          />
          <button
            className="btn-primary shrink-0 px-4 text-sm"
            onClick={() => handleGuess(undefined, selectedCharacterId)}
            disabled={loading || !guessText.trim()}
          >
            {loading ? '...' : '终极猜测'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-center text-apple-gray py-1">
          {reverseChoices.length === 1 ? '请配置剩余条件' : '本轮条件二选一'}
        </p>
      );

    const centralPanel = (
      <div className="shrink-0 w-full space-y-1.5">
        <ReverseTagBar queries={reverseQueries} />
        <div className="glass-card p-2 sm:p-3">{bottomBar}</div>
      </div>
    );

    return (
      <div className="h-[100dvh] flex flex-col overflow-hidden">
        <header className="shrink-0 z-40 bg-apple-bg/90 backdrop-blur-xl border-b border-gray-200/50 safe-top">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-apple-gray truncate max-w-[28%] sm:max-w-none">
              {session.playerName}
            </span>
            <h1 className="text-base sm:text-lg font-bold tracking-wide shrink-0">
              逆向轰炸 · {THEME_LABELS[session.theme]}
            </h1>
            <button
              type="button"
              className="btn-pill-danger shrink-0"
              onClick={() => setShowQuitConfirm(true)}
            >
              结束本局
            </button>
          </div>
        </header>

        <ReverseIntroBanner />

        {isReverseBomb && (session.hints?.length ?? 0) > 0 && (
          <div className="shrink-0 mx-3 mt-2">
            <HintCard hints={session.hints ?? []} />
          </div>
        )}

        {queryFeedback && (
          <div
            className={`shrink-0 mx-3 mt-2 rounded-lg px-3 py-2 text-sm text-center font-medium ${
              queryFeedback.includes('✓')
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {queryFeedback}
          </div>
        )}

        {error && (
          <div className="shrink-0 mx-3 mt-2 bg-apple-red/10 border border-apple-red/30 text-apple-red rounded-lg px-3 py-1.5 text-xs text-center">
            {error}
          </div>
        )}

        <GameTopStats
          score={session.score}
          correctCount={session.correctCount}
          attemptsLeft={session.attemptsLeft}
          themeLabel={THEME_LABELS[session.theme]}
          playerName={session.playerName}
          correctAnswers={session.correctAnswers ?? []}
          expanded={statsExpanded}
          onToggle={() => setStatsExpanded((v) => !v)}
          pulseAttempts={pulseAttempts}
          maxAttempts={maxAttempts}
          attemptsLabel="剩余筛选"
          roundLabel={reverseRoundName}
          roundProgress={reverseRoundProgress}
        />

        <div className="flex-1 min-h-0 max-w-[1520px] mx-auto w-full px-3 sm:px-4 py-2 sm:py-3 grid grid-cols-1 lg:grid-cols-[200px_1fr_220px] gap-3 lg:gap-4 overflow-hidden">
          <aside className="hidden lg:flex lg:flex-col gap-4 shrink-0 overflow-hidden">
            <StatSidebar
              score={session.score}
              correctCount={session.correctCount}
              themeLabel={THEME_LABELS[session.theme]}
              playerName={session.playerName}
            />
          </aside>

          <main className="flex flex-col min-h-0 min-w-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="w-full h-full min-h-0 flex flex-col rounded-2xl border border-gray-200/80 bg-gradient-to-b from-white/90 to-gray-50/80 shadow-soft">
                <div className="flex-1 min-h-0 overflow-y-scroll overscroll-contain p-3 sm:p-4 [scrollbar-gutter:stable]">
                  <ReverseCardGrid
                    pool={reversePool}
                    eliminatedIds={eliminatedIds}
                    animatingIds={animatingIds}
                    doomedIds={doomedIds}
                    bombProgress={bombProgress}
                    bombWaveToken={bombWaveToken}
                    gridPhase={gridPhase}
                    layoutEpoch={layoutEpoch}
                    showSurvivorsOnly={showSurvivorsOnly}
                    onShowSurvivorsOnlyChange={setShowSurvivorsOnly}
                    onCardClick={handleReverseCardClick}
                  />
                </div>
              </div>
            </div>
            <div className="hidden lg:block mt-2">{centralPanel}</div>
          </main>

          <aside className="hidden lg:flex lg:flex-col gap-4 shrink-0 min-h-0 overflow-hidden">
            <div className="glass-card p-4 shrink-0">
              <p className="text-xs text-apple-gray mb-1">剩余筛选</p>
              <motion.p
                key={session.attemptsLeft}
                initial={{ scale: pulseAttempts ? 1.2 : 1 }}
                animate={{ scale: 1 }}
                className="text-2xl font-bold leading-tight"
              >
                {session.attemptsLeft}
                <span className="text-sm text-apple-gray font-normal">/{maxAttempts}</span>
              </motion.p>
            </div>
            <div className="glass-card p-4 shrink-0">
              <p className="text-xs text-apple-gray mb-1">轮次</p>
              <p className="text-2xl font-bold text-gray-800 mb-2">{reverseRoundName}</p>
              <ReverseRoundProgress {...reverseRoundProgress} />
            </div>
            <ReverseRoundHistory rounds={session.reverseRoundHistory ?? []} />
          </aside>
        </div>

        <div className="lg:hidden shrink-0 px-3 pb-3 safe-bottom">{centralPanel}</div>

        <AnimatePresence>
          {showQuitConfirm && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="glass-card p-6 max-w-sm w-full text-center">
                <p className="text-lg font-medium mb-4">确定要结束本局吗？</p>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setShowQuitConfirm(false)}>
                    继续
                  </button>
                  <button
                    className="btn-primary flex-1 !bg-apple-red hover:!bg-red-600"
                    onClick={handleQuit}
                  >
                    结束本局
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {roundModal && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 safe-bottom">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card p-6 max-w-sm w-full text-center"
              >
                <p className="text-lg font-medium mb-1">
                  {reverseRoundLabel(
                    Math.max(0, (session.reverseRoundHistory?.length ?? 1) - 1)
                  )}{' '}
                  结算
                </p>
                <p className="text-sm text-apple-gray mb-1">
                  {roundModal.autoDeduced
                    ? '筛选至唯一答案！'
                    : roundModal.success
                      ? '猜对了！'
                      : '未猜中'}
                </p>
                <p className="text-sm text-apple-gray mb-4">
                  答案：{roundModal.answer.name}
                </p>
                <div className="flex flex-col items-center gap-3 mb-4">
                  <CharacterAvatar
                    name={roundModal.answer.name}
                    imageUrl={roundModal.answer.imageUrl}
                    size="lg"
                  />
                  <p className="text-3xl font-bold text-apple-blue">+{roundModal.score}</p>
                </div>
                <button className="btn-primary w-full" onClick={handleReverseNext}>
                  {session.status === 'game_over'
                    ? '查看总成绩'
                    : `进入${reverseRoundLabel((session.questionIndex ?? 0) + 1)} →`}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const guessPanel =
    questionDone && !isDaily ? (
      isProgressive ? (
        <div className="shrink-0 glass-card p-4 text-center">
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn-primary w-full text-lg py-3.5"
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? '加载中...' : '下一题 →'}
          </motion.button>
        </div>
      ) : (
        <div className="shrink-0 glass-card p-4 text-center">
          <p className="text-xs text-apple-gray mb-3">
            已补充 2 次猜测机会（不超过上限 10 次）
          </p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn-primary w-full text-lg py-3.5"
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? '加载中...' : '下一题 →'}
          </motion.button>
        </div>
      )
    ) : (
      session.status !== 'game_over' && (
        <div className="shrink-0 glass-card p-3 flex gap-3">
          <GuessInput
            theme={session.theme}
            value={guessText}
            placeholder={placeholder}
            onChange={setGuessText}
            onSubmit={handleGuess}
            disabled={inputDisabled}
            loading={loading}
            suggestionsPlacement="top"
          />
          <button
            className="btn-primary shrink-0 px-6"
            onClick={() => handleGuess()}
            disabled={loading || !guessText.trim() || inputDisabled}
          >
            {loading ? '...' : '猜测'}
          </button>
        </div>
      )
    );

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <header className="shrink-0 z-40 bg-apple-bg/90 backdrop-blur-xl border-b border-gray-200/50 safe-top">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-apple-gray truncate max-w-[28%] sm:max-w-none">
            {session.playerName}
          </span>
          <h1 className="text-base sm:text-lg font-bold tracking-wide shrink-0">
            GUESS WHO
            {isDaily && elapsedDisplay && (
              <span className="block text-xs font-normal text-apple-gray">{elapsedDisplay}</span>
            )}
          </h1>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              className="btn-pill-danger shrink-0"
              onClick={() => setShowQuitConfirm(true)}
            >
              结束本局
            </button>
          </div>
        </div>
      </header>

      <GameTopStats
        score={session.score}
        correctCount={session.correctCount}
        attemptsLeft={session.attemptsLeft}
        themeLabel={THEME_LABELS[session.theme]}
        playerName={session.playerName}
        correctAnswers={session.correctAnswers ?? []}
        expanded={statsExpanded}
        onToggle={() => setStatsExpanded((v) => !v)}
        pulseAttempts={pulseAttempts}
        maxAttempts={maxAttempts}
        useLivesHearts={isProgressive}
      />

      <div className="flex-1 min-h-0 max-w-[1520px] mx-auto w-full px-3 sm:px-4 py-2 sm:py-3 grid grid-cols-1 lg:grid-cols-[200px_1fr_220px] gap-3 lg:gap-4 overflow-hidden">
        <aside className="hidden lg:flex lg:flex-col gap-4 shrink-0 order-2 lg:order-1 overflow-hidden">
          <StatSidebar
            score={session.score}
            correctCount={session.correctCount}
            themeLabel={THEME_LABELS[session.theme]}
            playerName={session.playerName}
          />
        </aside>

        <main className="flex flex-col min-h-0 min-w-0 order-1 lg:order-2 overflow-hidden">
          <div className="shrink-0 mb-2">
            {questionDone ? (
              <CongratsBanner attempts={session.questionAttempts} score={lastScore} />
            ) : !isProgressive ? (
              <HintCard hints={session.hints ?? [session.hint]} />
            ) : null}

            {!questionDone && toast && (
              <div className="bg-apple-orange/10 border border-apple-orange/30 text-apple-orange rounded-lg px-3 py-1.5 text-xs text-center mt-2">
                {toast}
              </div>
            )}

            {error && (
              <div className="bg-apple-red/10 border border-apple-red/30 text-apple-red rounded-lg px-3 py-1.5 text-xs text-center mt-2">
                {error}
              </div>
            )}
          </div>

          <div
            ref={scrollAreaRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-2 overscroll-contain"
          >
            {isProgressive ? (
              <ProgressivePanel session={session} />
            ) : currentGuesses.length === 0 ? (
              <div className="glass-card p-6 sm:p-8 text-center text-apple-gray">
                <p className="font-medium">还没有猜测记录</p>
                <p className="text-sm mt-1">{placeholder}</p>
              </div>
            ) : showGrid ? (
              currentGuesses.map((guess, i) => (
                <GuessRow
                  key={guess.id}
                  guessName={guess.guessName}
                  imageUrl={guess.imageUrl}
                  fieldResults={guess.fieldResults!}
                  isCorrect={guess.isCorrect}
                  index={i}
                />
              ))
            ) : (
              currentGuesses.map((guess, i) => (
                <div key={guess.id} className="glass-card px-4 py-3 flex items-center gap-3 min-h-[48px]">
                  <span className="text-apple-gray text-sm w-6 shrink-0">{i + 1}</span>
                  <CharacterAvatar name={guess.guessName} imageUrl={guess.imageUrl} size="xs" />
                  <span className="font-medium truncate flex-1 min-w-0">{guess.guessName}</span>
                  {guess.isCorrect && (
                    <span className="text-xs text-apple-green ml-auto shrink-0">正确</span>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="hidden lg:block mt-3">{guessPanel}</div>
        </main>

        <aside className="hidden lg:flex lg:flex-col gap-4 shrink-0 order-3 overflow-visible min-h-0">
          <AttemptsBadge
            attemptsLeft={session.attemptsLeft}
            maxAttempts={maxAttempts}
            pulse={pulseAttempts}
            variant={isProgressive ? 'lives' : 'attempts'}
          />

          <div className="glass-card p-4 shrink-0">
            <p className="text-xs text-apple-gray mb-2">本题猜测</p>
            <p className="text-2xl font-bold">{session.questionAttempts}</p>
            <p className="text-xs text-apple-gray mt-1">
              次{isProgressive ? ' · 全部提示命中可解锁下一提示' : ''}
            </p>
          </div>

          <div className="glass-card p-4 flex flex-col min-h-0 flex-1 overflow-visible">
            <CorrectHistory answers={session.correctAnswers ?? []} />
          </div>
        </aside>
      </div>

      <MobileGuessFooter
        theme={session.theme}
        guessText={guessText}
        placeholder={placeholder}
        attemptsLeft={session.attemptsLeft}
        maxAttempts={maxAttempts}
        questionAttempts={session.questionAttempts}
        loading={loading}
        disabled={inputDisabled}
        pulseAttempts={pulseAttempts}
        useLivesHearts={isProgressive}
        questionDone={questionDone}
        onChange={setGuessText}
        onSubmit={handleGuess}
        onNext={handleNext}
      />

      <AnswerRevealModal
        open={showAnswerReveal}
        variant={answerReveal?.variant ?? 'failure'}
        answerName={answerReveal?.answer.name ?? '—'}
        answerImageUrl={answerReveal?.answer.imageUrl}
        continueLabel={
          session.status === 'game_over' || session.status === 'failed'
            ? '查看结算'
            : '查看排行榜'
        }
        onContinue={() => {
          setShowAnswerReveal(false);
          setAnswerReveal(null);
          navigate('/result');
        }}
      />

      <AnimatePresence>
        {showQuitConfirm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card p-6 max-w-sm w-full text-center">
              <p className="text-lg font-medium mb-4">确定要结束本局吗？</p>
              <p className="text-sm text-apple-gray mb-6">
                当前成绩将被保存到排行榜
              </p>
              <div className="flex gap-3">
                <button
                  className="btn-secondary flex-1"
                  onClick={() => setShowQuitConfirm(false)}
                >
                  继续
                </button>
                <button
                  className="btn-primary flex-1 !bg-apple-red hover:!bg-red-600"
                  onClick={handleQuit}
                >
                  结束本局
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
