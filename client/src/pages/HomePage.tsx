import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ApiError, getDailyToday, startGame, SESSION_KEY } from '../api';
import {
  GAME_MODE_LABELS,
  GameMode,
  MODE_ICONS,
  THEME_ICONS,
  THEME_LABELS,
  Theme,
} from '../types';

const SINGLE_PLAYER_MODES: GameMode[] = [
  'classic-six',
  'daily-one',
  'progressive-hint',
  'reverse-bomb',
];
const MULTI_MODES: GameMode[] = ['battle', 'relay-chain'];
const MODES: GameMode[] = [...SINGLE_PLAYER_MODES, ...MULTI_MODES];
const THEMES: Theme[] = ['csgo', 'football', 'nba', 'pokemon'];

function optionClass(selected: boolean, compact = false) {
  return `${
    compact ? 'min-h-[52px] px-3' : 'w-full min-h-[52px] px-4'
  } py-3 rounded-xl border-2 text-left transition-all duration-200 flex items-center gap-2.5 min-w-0 ${
    selected
      ? 'border-apple-blue bg-apple-blue/5 shadow-soft'
      : 'border-gray-100 bg-white active:bg-gray-50 sm:hover:border-gray-200'
  }`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('classic-six');
  const [theme, setTheme] = useState<Theme>('csgo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dailyCompleted, setDailyCompleted] = useState(false);
  const [dailyInProgress, setDailyInProgress] = useState(false);

  const isMulti = MULTI_MODES.includes(gameMode);
  const isDaily = gameMode === 'daily-one';

  useEffect(() => {
    if (!isDaily) {
      setDailyCompleted(false);
      setDailyInProgress(false);
      return;
    }
    let cancelled = false;
    getDailyToday(theme)
      .then((info) => {
        if (cancelled) return;
        setDailyCompleted(info.completed);
        setDailyInProgress(Boolean(info.inProgress && info.sessionId));
      })
      .catch(() => {
        if (!cancelled) {
          setDailyCompleted(false);
          setDailyInProgress(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isDaily, theme]);

  const goToDailyResult = (sessionId: string) => {
    localStorage.setItem(SESSION_KEY, sessionId);
    navigate('/result');
  };

  const handleStart = async () => {
    if (!name.trim()) {
      setError('请输入昵称');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isMulti) {
        localStorage.setItem('guess-who-player-name', name.trim());
        localStorage.setItem('guess-who-lobby-theme', theme);
        localStorage.setItem('guess-who-lobby-mode', gameMode);
        navigate('/lobby');
        return;
      }

      if (isDaily) {
        const info = await getDailyToday(theme);
        if (info.completed && info.sessionId) {
          goToDailyResult(info.sessionId);
          return;
        }
        if (info.inProgress && info.sessionId) {
          localStorage.setItem(SESSION_KEY, info.sessionId);
          navigate('/game');
          return;
        }
      }

      const session = await startGame(name.trim(), theme, gameMode);
      localStorage.setItem(SESSION_KEY, session.sessionId);
      navigate('/game');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DAILY_ALREADY_PLAYED' && e.sessionId) {
        goToDailyResult(e.sessionId);
        return;
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const startLabel = loading
    ? '准备中...'
    : isMulti
      ? '进入房间'
      : isDaily && dailyCompleted
        ? '查看今日成绩'
        : isDaily && dailyInProgress
          ? '继续今日挑战'
          : '开始游戏';

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-6 safe-top safe-bottom sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-6 sm:mb-10">
          <motion.h1
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-2"
          >
            Guess Who
          </motion.h1>
          <p className="text-apple-gray text-base sm:text-lg">猜人物 · 比线索 · 争高分</p>
        </div>

        <div className="glass-card p-5 sm:p-8 space-y-5 sm:space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">你的昵称</label>
            <input
              className="input-field"
              placeholder="输入昵称开始游戏"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              maxLength={20}
              autoComplete="nickname"
              enterKeyHint="go"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">玩法</label>
            <div className="flex flex-col gap-2">
              {MODES.map((m) => (
                <motion.button
                  key={m}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setGameMode(m)}
                  className={optionClass(gameMode === m)}
                >
                  <span className="text-xl leading-none shrink-0">{MODE_ICONS[m]}</span>
                  <span className="font-medium text-sm sm:text-base">{GAME_MODE_LABELS[m]}</span>
                </motion.button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">主题</label>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <motion.button
                  key={t}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setTheme(t)}
                  className={optionClass(theme === t, true)}
                >
                  <span className="text-xl leading-none shrink-0">{THEME_ICONS[t]}</span>
                  <span className="font-medium text-sm truncate min-w-0">{THEME_LABELS[t]}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {isDaily && dailyCompleted && (
            <p className="text-sm text-apple-gray text-center">
              今日该主题已完成挑战，每人每主题每日仅一次机会
            </p>
          )}

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-apple-red text-sm text-center">
              {error}
            </motion.p>
          )}

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            className="btn-primary w-full text-base sm:text-lg"
            onClick={handleStart}
            disabled={loading}
          >
            {startLabel}
          </motion.button>

          <button
            type="button"
            className="btn-pill-outline w-full min-h-[44px] text-sm"
            onClick={() => navigate('/leaderboard')}
          >
            查看排行榜
          </button>
        </div>
      </motion.div>
    </div>
  );
}
