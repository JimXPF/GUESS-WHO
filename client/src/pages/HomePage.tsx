import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { startGame, SESSION_KEY } from '../api';
import { GAME_MODE_LABELS, GameMode, THEME_LABELS, Theme } from '../types';

const MODES: GameMode[] = ['classic-six'];
const THEMES: Theme[] = ['csgo', 'football', 'nba', 'pokemon', 'anime'];

export default function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('classic-six');
  const [theme, setTheme] = useState<Theme>('csgo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    if (!name.trim()) {
      setError('请输入昵称');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await startGame(name.trim(), theme, gameMode);
      localStorage.setItem(SESSION_KEY, session.sessionId);
      navigate('/game');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
            <label className="block text-sm font-medium text-gray-600 mb-2">
              你的昵称
            </label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="game-mode" className="block text-sm font-medium text-gray-600 mb-2">
                玩法
              </label>
              <select
                id="game-mode"
                className="input-field"
                value={gameMode}
                onChange={(e) => setGameMode(e.target.value as GameMode)}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {GAME_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="theme" className="block text-sm font-medium text-gray-600 mb-2">
                主题
              </label>
              <select
                id="theme"
                className="input-field"
                value={theme}
                onChange={(e) => setTheme(e.target.value as Theme)}
              >
                {THEMES.map((t) => (
                  <option key={t} value={t}>
                    {THEME_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-apple-red text-sm text-center"
            >
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
            {loading ? '准备中...' : '开始游戏'}
          </motion.button>

          <button
            type="button"
            className="w-full min-h-[44px] text-apple-blue text-sm active:opacity-70 sm:hover:underline"
            onClick={() => navigate('/leaderboard')}
          >
            查看排行榜 →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
