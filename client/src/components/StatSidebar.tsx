import { motion, AnimatePresence } from 'framer-motion';
import LivesHearts from './LivesHearts';

interface Props {
  score: number;
  correctCount: number;
  themeLabel: string;
  playerName: string;
}

export default function StatSidebar({
  score,
  correctCount,
  themeLabel,
  playerName,
}: Props) {
  return (
    <>
      <div className="glass-card p-4 space-y-4">
        <div>
          <p className="text-xs text-apple-gray">玩家</p>
          <p className="font-semibold truncate">{playerName}</p>
        </div>
        <div>
          <p className="text-xs text-apple-gray">主题</p>
          <p className="font-medium">{themeLabel}</p>
        </div>
        <div>
          <p className="text-xs text-apple-gray">总分</p>
          <motion.p
            key={score}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className="text-2xl font-bold text-apple-blue"
          >
            {score}
          </motion.p>
        </div>
        <div>
          <p className="text-xs text-apple-gray">答对</p>
          <p className="text-xl font-bold text-apple-green">{correctCount}</p>
        </div>
      </div>
    </>
  );
}

export function AttemptsBadge({
  attemptsLeft,
  maxAttempts = 10,
  pulse,
  variant = 'attempts',
}: {
  attemptsLeft: number;
  maxAttempts?: number;
  pulse?: boolean;
  variant?: 'attempts' | 'lives';
}) {
  if (variant === 'lives') {
    return (
      <div className="glass-card p-4 text-center hidden lg:block">
        <LivesHearts lives={attemptsLeft} maxLives={maxAttempts} size="lg" pulse={pulse} />
      </div>
    );
  }

  return (
    <div className="glass-card p-4 text-center hidden lg:block">
      <p className="text-xs text-apple-gray mb-1">剩余机会</p>
      <AnimatePresence mode="wait">
        <motion.p
          key={attemptsLeft}
          initial={{ scale: pulse ? 1.5 : 1, color: pulse ? '#FF3B30' : '#111' }}
          animate={{ scale: 1, color: '#111' }}
          transition={{ type: 'spring' }}
          className="text-4xl font-bold"
        >
          {attemptsLeft}
          <span className="text-xl text-apple-gray font-normal">/{maxAttempts}</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
