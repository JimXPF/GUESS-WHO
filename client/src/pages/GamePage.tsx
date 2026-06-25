import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import CongratsBanner from '../components/CongratsBanner';
import CorrectHistory from '../components/CorrectHistory';
import StatSidebar, { AttemptsBadge } from '../components/StatSidebar';
import { GameSession, THEME_LABELS, scoreForQuestion } from '../types';

const GUESS_PLACEHOLDER: Record<GameSession['theme'], string> = {
  csgo: '输入选手 ID，如 NiKo、donk...',
  football: '输入人物中文名...',
  nba: '输入人物中文名...',
  anime: '输入人物中文名...',
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
  const [showFailed, setShowFailed] = useState(false);
  const [failedAnswer, setFailedAnswer] = useState<{ name: string; imageUrl: string | null } | null>(null);
  const guessEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevAttempts = useRef<number>(10);

  const loadSession = useCallback(async () => {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      navigate('/');
      return;
    }
    try {
      const s = await getSession(id);
      if (s.status === 'game_over' || s.status === 'quit') {
        navigate('/result');
        return;
      }
      setSession(s);
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
  }, [session?.guesses.length]);

  const handleGuess = async (text?: string, characterId?: string) => {
    const guess = (text ?? guessText).trim();
    if (!session || !guess || loading) return;
    if (session.status === 'question_done') return;

    setLoading(true);
    setError('');
    try {
      const result = await submitGuess(session.sessionId, guess, characterId);
      setSession(result.session);

      if (result.notInBank) {
        setToast(result.message || '题库中没有该角色');
        setTimeout(() => setToast(''), 3000);
      } else {
        setGuessText('');
        if (result.correctAnswer) {
          setFailedAnswer(result.correctAnswer);
          setShowFailed(true);
        } else if (result.session.status === 'game_over') {
          navigate('/result');
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
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
  };

  const handleQuit = async () => {
    if (!session) return;
    try {
      await quitGame(session.sessionId);
      navigate('/result');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-apple-gray">加载游戏中...</p>
      </div>
    );
  }

  const currentGuesses = session.guesses.filter((g) => g.fieldResults !== null);
  const placeholder =
    session.guessPlaceholder ?? GUESS_PLACEHOLDER[session.theme];
  const questionDone = session.status === 'question_done';
  const lastScore =
    session.lastQuestionScore ?? scoreForQuestion(session.questionAttempts);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="shrink-0 z-40 bg-apple-bg/90 backdrop-blur-xl border-b border-gray-200/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-apple-gray">{session.playerName}</span>
          <h1 className="text-lg font-bold tracking-wide">GUESS WHO</h1>
          <button
            className="text-sm text-apple-red hover:underline"
            onClick={() => setShowQuitConfirm(true)}
          >
            退出
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 max-w-[1520px] mx-auto w-full px-4 py-4 grid grid-cols-1 lg:grid-cols-[200px_1fr_220px] gap-4">
        <aside className="hidden lg:flex lg:flex-col gap-4 shrink-0 order-2 lg:order-1 overflow-hidden">
          <StatSidebar
            score={session.score}
            attemptsLeft={session.attemptsLeft}
            correctCount={session.correctCount}
            themeLabel={THEME_LABELS[session.theme]}
            playerName={session.playerName}
            pulseAttempts={pulseAttempts}
          />
        </aside>

        <main className="flex flex-col min-h-0 min-w-0 order-1 lg:order-2">
          <div className="shrink-0 space-y-3 mb-3">
            {questionDone ? (
              <CongratsBanner attempts={session.questionAttempts} score={lastScore} />
            ) : (
              <HintCard hints={session.hints ?? [session.hint]} />
            )}

            {!questionDone && toast && (
              <div className="bg-apple-orange/10 border border-apple-orange/30 text-apple-orange rounded-xl px-4 py-2 text-sm text-center">
                {toast}
              </div>
            )}

            {error && (
              <div className="bg-apple-red/10 border border-apple-red/30 text-apple-red rounded-xl px-4 py-2 text-sm text-center">
                {error}
              </div>
            )}
          </div>

          <div
            ref={scrollAreaRef}
            className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
          >
            {currentGuesses.length === 0 ? (
              <div className="glass-card p-8 text-center text-apple-gray">
                <p>还没有猜测记录</p>
                <p className="text-sm mt-1">{placeholder}</p>
              </div>
            ) : (
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
            )}
            <div ref={guessEndRef} />
          </div>

          {questionDone ? (
            <div className="shrink-0 glass-card p-4 mt-3 text-center">
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
          ) : (
            session.status !== 'game_over' && (
              <div className="shrink-0 glass-card p-3 flex gap-3 mt-3">
                <GuessInput
                  theme={session.theme}
                  value={guessText}
                  placeholder={placeholder}
                  onChange={setGuessText}
                  onSubmit={handleGuess}
                  disabled={session.attemptsLeft <= 0}
                  loading={loading}
                />
                <button
                  className="btn-primary shrink-0"
                  onClick={() => handleGuess()}
                  disabled={loading || !guessText.trim() || session.attemptsLeft <= 0}
                >
                  {loading ? '...' : '猜测'}
                </button>
              </div>
            )
          )}
        </main>

        <aside className="hidden lg:flex lg:flex-col gap-4 shrink-0 order-3 overflow-visible min-h-0">
          <AttemptsBadge attemptsLeft={session.attemptsLeft} pulse={pulseAttempts} />

          <div className="glass-card p-4 shrink-0">
            <p className="text-xs text-apple-gray mb-2">本题猜测</p>
            <p className="text-2xl font-bold">{session.questionAttempts}</p>
            <p className="text-xs text-apple-gray mt-1">次</p>
          </div>

          <CorrectHistory answers={session.correctAnswers ?? []} />
        </aside>
      </div>

      <div className="lg:hidden shrink-0 border-t border-gray-200/50 bg-apple-bg/90 px-4 py-2 flex justify-between text-sm">
        <span>
          分数 <strong className="text-apple-blue">{session.score}</strong>
        </span>
        <span>
          剩余 <strong>{session.attemptsLeft}/10</strong>
        </span>
        <span>
          答对 <strong className="text-apple-green">{session.correctCount}</strong>
        </span>
      </div>

      <AnimatePresence>
        {showFailed && failedAnswer && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card p-6 max-w-sm w-full text-center">
              <p className="text-lg font-medium mb-2">本题未猜中</p>
              <p className="text-sm text-apple-gray mb-4">正确答案是：</p>
              <div className="flex flex-col items-center gap-3 mb-6">
                {failedAnswer.imageUrl ? (
                  <img
                    src={failedAnswer.imageUrl}
                    alt={failedAnswer.name}
                    className="w-20 h-20 rounded-full object-cover ring-2 ring-apple-red/30"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-apple-red/10 text-apple-red flex items-center justify-center text-3xl font-bold">
                    {failedAnswer.name.charAt(0)}
                  </div>
                )}
                <p className="text-2xl font-semibold text-apple-red">{failedAnswer.name}</p>
              </div>
              <button
                className="btn-primary w-full"
                onClick={() => {
                  setShowFailed(false);
                  navigate('/result');
                }}
              >
                查看排行榜
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQuitConfirm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card p-6 max-w-sm w-full text-center">
              <p className="text-lg font-medium mb-4">确定要退出游戏吗？</p>
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
                  退出
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
