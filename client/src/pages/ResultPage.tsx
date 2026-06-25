import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSession, getLeaderboard, SESSION_KEY } from '../api';
import { GameSession, LeaderboardEntry, THEME_LABELS } from '../types';

export default function ResultPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<GameSession | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      navigate('/');
      return;
    }
    Promise.all([
      getSession(id).catch(() => null),
      getLeaderboard(15)
    ])
      .then(([s, lb]) => {
        if (!s) {
          navigate('/');
          return;
        }
        setSession(s);
        setLeaderboard(lb);
      })
      .catch(() => navigate('/'));
  }, [navigate]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-apple-gray">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        {/* Session Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="text-6xl mb-4"
          >
            {session.status === 'game_over' ? '🏁' : '👋'}
          </motion.div>

          <h1 className="text-3xl font-bold mb-2">
            {session.status === 'game_over' ? '游戏结束' : '已退出游戏'}
          </h1>
          <p className="text-apple-gray mb-6">
            {session.playerName}，本轮成绩
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-apple-bg rounded-xl p-5">
              <p className="text-sm text-apple-gray mb-1">总分</p>
              <p className="text-4xl font-bold text-apple-blue">{session.score}</p>
            </div>
            <div className="bg-apple-bg rounded-xl p-5">
              <p className="text-sm text-apple-gray mb-1">答对题数</p>
              <p className="text-4xl font-bold text-apple-green">{session.correctCount}</p>
            </div>
          </div>

          <button
            className="btn-secondary w-full max-w-xs mx-auto"
            onClick={() => {
              localStorage.removeItem(SESSION_KEY);
              navigate('/');
            }}
          >
            再玩一次
          </button>
        </motion.div>

        {/* Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-lg font-semibold">当前排行榜</p>
            <span className="text-xs text-apple-gray">Top {leaderboard.length}</span>
          </div>

          {leaderboard.length === 0 ? (
            <p className="text-center text-apple-gray py-8">暂无排行数据</p>
          ) : (
            <div className="space-y-1">
              {leaderboard.map((entry, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm ${
                    entry.playerName === session.playerName
                      ? 'bg-apple-blue/10 ring-1 ring-apple-blue/30'
                      : index % 2 === 0
                      ? 'bg-white/50'
                      : 'bg-white/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-apple-gray w-6 text-right font-mono">{index + 1}</span>
                    <span className="font-medium truncate">{entry.playerName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 text-apple-gray shrink-0">
                      {THEME_LABELS[entry.theme]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <span className="font-semibold text-apple-blue">{entry.totalScore}</span>
                    <span className="text-apple-green text-xs w-12 text-right">
                      {entry.correctCount} 题
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
