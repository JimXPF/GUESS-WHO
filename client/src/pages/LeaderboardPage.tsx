import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getLeaderboard } from '../api';
import {
  formatElapsedUs,
  GAME_MODE_LABELS,
  GameMode,
  isDailyEntry,
  LEADERBOARD_MODES,
  LeaderboardRow,
  THEME_LABELS,
  Theme,
} from '../types';

const THEMES: Theme[] = ['csgo', 'football', 'nba', 'pokemon'];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>('classic-six');
  const [theme, setTheme] = useState<Theme>('csgo');

  useEffect(() => {
    setLoading(true);
    getLeaderboard(gameMode, theme, 20)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [gameMode, theme]);

  const isDaily = gameMode === 'daily-one';
  const isReverseLb = gameMode === 'reverse-bomb';
  const isProgressiveLb = gameMode === 'progressive-hint';

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">排行榜</h1>
          <Link to="/" className="btn-secondary text-sm py-2 px-4">
            返回首页
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <select
            className="input-field py-2 w-auto min-w-[140px]"
            value={gameMode}
            onChange={(e) => setGameMode(e.target.value as GameMode)}
          >
            {LEADERBOARD_MODES.map((m) => (
              <option key={m} value={m}>
                {GAME_MODE_LABELS[m]}
              </option>
            ))}
          </select>
          <select
            className="input-field py-2 w-auto min-w-[140px]"
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

        <div className="glass-card overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-apple-gray">加载中...</p>
          ) : entries.length === 0 ? (
            <p className="p-8 text-center text-apple-gray">暂无记录，快来挑战吧！</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-sm text-apple-gray">
                  <th className="py-4 px-4 text-left font-medium">#</th>
                  <th className="py-4 px-4 text-left font-medium">玩家</th>
                  {isDaily ? (
                    <>
                      <th className="py-4 px-4 text-right font-medium">轮次</th>
                      <th className="py-4 px-4 text-right font-medium">耗时</th>
                    </>
                  ) : (
                    <>
                      <th className="py-4 px-4 text-right font-medium">分数</th>
                      <th className="py-4 px-4 text-right font-medium">
                        {isReverseLb ? '猜对轮' : isProgressiveLb ? '答对' : '答对'}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <motion.tr
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-gray-50 hover:bg-gray-50/50"
                  >
                    <td className="py-4 px-4 font-medium text-apple-gray">{i + 1}</td>
                    <td className="py-4 px-4 font-medium">{entry.playerName}</td>
                    {isDaily && isDailyEntry(entry) ? (
                      <>
                        <td className="py-4 px-4 text-right font-bold">{entry.attemptsUsed}</td>
                        <td className="py-4 px-4 text-right text-sm text-apple-gray">
                          {formatElapsedUs(entry.elapsedUs)}
                        </td>
                      </>
                    ) : !isDaily ? (
                      <>
                        <td className="py-4 px-4 text-right font-bold text-apple-blue">
                          {'totalScore' in entry ? entry.totalScore : '-'}
                        </td>
                        <td className="py-4 px-4 text-right text-apple-gray">
                          {'correctCount' in entry ? entry.correctCount : '-'}
                        </td>
                      </>
                    ) : null}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
