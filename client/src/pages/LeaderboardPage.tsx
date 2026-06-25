import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getLeaderboard } from '../api';
import { LeaderboardEntry, THEME_LABELS } from '../types';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard(20)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">排行榜</h1>
          <Link to="/" className="btn-secondary text-sm py-2 px-4">
            返回首页
          </Link>
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
                  <th className="py-4 px-4 text-left font-medium">主题</th>
                  <th className="py-4 px-4 text-right font-medium">分数</th>
                  <th className="py-4 px-4 text-right font-medium">答对</th>
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
                    <td className="py-4 px-4 font-medium text-apple-gray">
                      {i + 1}
                    </td>
                    <td className="py-4 px-4 font-medium">{entry.playerName}</td>
                    <td className="py-4 px-4 text-sm text-apple-gray">
                      {THEME_LABELS[entry.theme]}
                    </td>
                    <td className="py-4 px-4 text-right font-bold text-apple-blue">
                      {entry.totalScore}
                    </td>
                    <td className="py-4 px-4 text-right">{entry.correctCount}</td>
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
