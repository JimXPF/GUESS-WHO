import { motion, AnimatePresence } from 'framer-motion';

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
  pulse,
}: {
  attemptsLeft: number;
  pulse?: boolean;
}) {
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
          <span className="text-xl text-apple-gray font-normal">/10</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
