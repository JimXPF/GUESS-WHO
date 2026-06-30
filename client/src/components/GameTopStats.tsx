import { AnimatePresence, motion } from 'framer-motion';
import type { CorrectAnswerRecord } from '../types';
import CorrectHistory from './CorrectHistory';
import LivesHearts from './LivesHearts';
import ReverseRoundProgress from './reverse/ReverseRoundProgress';

interface RoundProgressProps {
  totalRounds: number;
  completedRounds: number;
  currentRound: number;
}

interface Props {
  score: number;
  correctCount: number;
  attemptsLeft: number;
  themeLabel: string;
  playerName: string;
  correctAnswers: CorrectAnswerRecord[];
  expanded: boolean;
  onToggle: () => void;
  pulseAttempts?: boolean;
  maxAttempts?: number;
  useLivesHearts?: boolean;
  /** Collapsed bar label for attempts (default 剩余机会) */
  attemptsLabel?: string;
  /** 居中栏显示轮次标签（如「第一轮」），替代答对数 */
  roundLabel?: string;
  /** 逆向轰炸轮次进度条 */
  roundProgress?: RoundProgressProps;
}

export default function GameTopStats({
  score,
  correctCount,
  attemptsLeft,
  themeLabel,
  playerName,
  correctAnswers,
  expanded,
  onToggle,
  pulseAttempts,
  maxAttempts = 10,
  useLivesHearts = false,
  attemptsLabel = '剩余机会',
  roundLabel,
  roundProgress,
}: Props) {
  const showRoundCenter = roundLabel != null;
  return (
    <div className="lg:hidden shrink-0 border-b border-gray-200/60 bg-white/90 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left active:bg-gray-50/80"
        aria-expanded={expanded}
      >
        <div className="flex-1 grid grid-cols-3 gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] text-apple-gray leading-none mb-0.5">总分</p>
            <p className="text-lg font-bold text-apple-blue truncate">{score}</p>
          </div>
          <div className="min-w-0 text-center">
            {showRoundCenter ? (
              <>
                <p className="text-[10px] text-apple-gray leading-none mb-0.5">轮次</p>
                <p className="text-lg font-bold text-gray-800 truncate">{roundLabel}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-apple-gray leading-none mb-0.5">答对</p>
                <p className="text-lg font-bold text-apple-green">{correctCount}</p>
              </>
            )}
          </div>
          <div className="min-w-0 text-right flex flex-col items-end justify-center">
            <p className="text-[10px] text-apple-gray leading-none mb-0.5">{attemptsLabel}</p>
            {useLivesHearts ? (
              <LivesHearts lives={attemptsLeft} maxLives={maxAttempts} size="sm" pulse={pulseAttempts} />
            ) : (
              <motion.p
                key={attemptsLeft}
                initial={{ scale: pulseAttempts ? 1.25 : 1 }}
                animate={{ scale: 1 }}
                className="text-lg font-bold leading-tight"
              >
                {attemptsLeft}
                <span className="text-sm text-apple-gray font-normal">/{maxAttempts}</span>
              </motion.p>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 text-apple-gray transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {roundProgress && (
        <div className="px-4 pb-2.5 -mt-0.5">
          <ReverseRoundProgress
            totalRounds={roundProgress.totalRounds}
            completedRounds={roundProgress.completedRounds}
            currentRound={roundProgress.currentRound}
          />
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-3 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3 pt-3 text-sm">
                <div>
                  <p className="text-xs text-apple-gray">玩家</p>
                  <p className="font-medium truncate">{playerName}</p>
                </div>
                <div>
                  <p className="text-xs text-apple-gray">主题</p>
                  <p className="font-medium">{themeLabel}</p>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white/70 p-3">
                <CorrectHistory answers={correctAnswers} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
