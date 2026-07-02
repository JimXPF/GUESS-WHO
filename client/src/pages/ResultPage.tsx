import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSession, getLeaderboard, SESSION_KEY } from '../api';
import AnswerRevealPanel from '../components/AnswerRevealPanel';
import {
  GameMode,
  GameSession,
  THEME_LABELS,
  formatElapsedUs,
  isDailyEntry,
  LeaderboardRow,
  reverseRoundLabel,
} from '../types';

function leaderboardModeFor(session: GameSession): GameMode {
  if (session.gameMode === 'daily-one') return 'daily-one';
  if (session.gameMode === 'progressive-hint') return 'progressive-hint';
  if (session.gameMode === 'reverse-bomb') return 'reverse-bomb';
  return 'classic-six';
}

function leaderboardTitleFor(session: GameSession): string {
  if (session.gameMode === 'reverse-bomb') return '逆向轰炸排行榜';
  if (session.gameMode === 'progressive-hint') return '逐步提示排行榜';
  if (session.gameMode === 'daily-one') return '今日挑战排行榜';
  return '经典模式排行榜';
}

export default function ResultPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<GameSession | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      navigate('/');
      return;
    }
    Promise.all([getSession(id).catch(() => null)])
      .then(async ([s]) => {
        if (!s) {
          navigate('/');
          return;
        }
        setSession(s);
        const lbMode = leaderboardModeFor(s);
        try {
          const lb = await getLeaderboard(lbMode, s.theme, 15);
          setLeaderboard(lb);
        } catch {
          /* 排行榜加载失败仍展示结算页 */
        }
      })
      .catch(() => navigate('/'));
  }, [navigate]);

  if (!session) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center safe-top safe-bottom">
        <p className="text-apple-gray">加载中...</p>
      </div>
    );
  }

  const isDaily = session.gameMode === 'daily-one';
  const isReverse = session.gameMode === 'reverse-bomb';
  const reverseRounds = session.reverseRoundHistory ?? [];
  const revealed = session.revealedAnswer;

  return (
    <div className="min-h-[100dvh] overflow-y-auto px-4 py-6 safe-top safe-bottom sm:p-6">
      <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 sm:min-h-[calc(100dvh-3rem)] sm:flex sm:flex-col sm:justify-center">
        {/* Session Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 sm:p-8 text-center shrink-0"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="text-5xl sm:text-6xl mb-3 sm:mb-4"
          >
            {session.status === 'game_over' ? '🏁' : '👋'}
          </motion.div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            {session.status === 'failed'
              ? '挑战失败'
              : session.status === 'game_over'
                ? isDaily
                  ? '今日挑战完成'
                  : isReverse
                    ? '三轮挑战完成'
                    : '游戏结束'
                : '已退出游戏'}
          </h1>
          <p className="text-apple-gray text-sm sm:text-base mb-5 sm:mb-6">
            {session.playerName}，{isReverse ? '三轮总分' : '本轮成绩'}
          </p>

          {revealed && (
            <div className="mb-5 sm:mb-6">
              <AnswerRevealPanel
                name={revealed.name}
                imageUrl={revealed.imageUrl}
                subtitle={
                  isDaily
                    ? '今日答案'
                    : session.status === 'failed' || session.status === 'quit'
                      ? '正确答案'
                      : '本局最后一题答案'
                }
              />
            </div>
          )}

          {isDaily ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-6">
              <div className="bg-apple-bg rounded-xl p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-apple-gray mb-1">使用轮次</p>
                <p className="text-3xl sm:text-4xl font-bold text-apple-blue">{session.questionAttempts}</p>
              </div>
              <div className="bg-apple-bg rounded-xl p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-apple-gray mb-1">耗时</p>
                <p className="text-xl sm:text-2xl font-bold text-apple-green">
                  {session.elapsedUs != null ? formatElapsedUs(session.elapsedUs) : '--'}
                </p>
              </div>
            </div>
          ) : isReverse ? (
            <>
              <div className="bg-apple-bg rounded-xl p-4 sm:p-5 mb-4">
                <p className="text-xs sm:text-sm text-apple-gray mb-1">三轮总分</p>
                <p className="text-3xl sm:text-4xl font-bold text-apple-blue">{session.score}</p>
              </div>
              {reverseRounds.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5 sm:mb-6 text-left">
                  {reverseRounds.map((r, i) => (
                    <div key={`${r.questionIndex}-${r.answerId}`} className="bg-apple-bg rounded-xl p-3 sm:p-4">
                      <p className="text-[10px] sm:text-xs text-apple-gray mb-1">{reverseRoundLabel(i)}</p>
                      <p className="text-lg sm:text-xl font-bold text-apple-blue">+{r.score}</p>
                      <p className="text-[10px] text-apple-gray truncate mt-0.5">{r.answerName}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-6">
              <div className="bg-apple-bg rounded-xl p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-apple-gray mb-1">总分</p>
                <p className="text-3xl sm:text-4xl font-bold text-apple-blue">{session.score}</p>
              </div>
              <div className="bg-apple-bg rounded-xl p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-apple-gray mb-1">答对题数</p>
                <p className="text-3xl sm:text-4xl font-bold text-apple-green">{session.correctCount}</p>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn-primary w-full sm:max-w-xs sm:mx-auto"
            onClick={() => {
              localStorage.removeItem(SESSION_KEY);
              navigate('/');
            }}
          >
            回到首页
          </button>
        </motion.div>

        {/* Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 sm:p-6 shrink-0"
        >
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <p className="text-base sm:text-lg font-semibold">
              {leaderboardTitleFor(session)}
            </p>
            <span className="text-xs text-apple-gray">Top {leaderboard.length}</span>
          </div>

          {leaderboard.length === 0 ? (
            <p className="text-center text-apple-gray py-8">暂无排行数据</p>
          ) : (
            <div className="space-y-1">
              {leaderboard.map((entry, index) => {
                const isSelf = entry.playerName === session.playerName;
                return (
                  <div
                    key={index}
                    className={`flex items-start sm:items-center justify-between gap-2 px-3 sm:px-4 py-3 rounded-xl text-sm ${
                      isSelf
                        ? 'bg-apple-blue/10 ring-1 ring-apple-blue/30'
                        : index % 2 === 0
                          ? 'bg-white/50'
                          : 'bg-white/30'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <span className="text-apple-gray w-5 sm:w-6 text-right font-mono shrink-0 pt-0.5 sm:pt-0">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{entry.playerName}</p>
                        <p className="text-[10px] text-apple-gray sm:hidden mt-0.5">
                          {THEME_LABELS[entry.theme]}
                        </p>
                      </div>
                      <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/60 text-apple-gray shrink-0">
                        {THEME_LABELS[entry.theme]}
                      </span>
                    </div>
                    <div className="flex flex-col items-end sm:flex-row sm:items-center gap-0.5 sm:gap-4 shrink-0">
                      {isDaily && isDailyEntry(entry) ? (
                        <>
                          <span className="font-semibold text-apple-blue">{entry.attemptsUsed} 轮</span>
                          <span className="text-apple-green text-xs sm:text-right">
                            {formatElapsedUs(entry.elapsedUs)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-apple-blue">
                            {'totalScore' in entry ? entry.totalScore : '-'}
                          </span>
                          <span className="text-apple-green text-xs sm:w-12 sm:text-right">
                            {'correctCount' in entry
                              ? isReverse
                                ? `${entry.correctCount} 轮`
                                : `${entry.correctCount} 题`
                              : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
