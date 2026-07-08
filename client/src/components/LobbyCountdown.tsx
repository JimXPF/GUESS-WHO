import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  deadlineAt?: number | null;
  seconds?: number;
  label?: string;
}

export default function LobbyCountdown({
  deadlineAt,
  seconds = 3,
  label = '游戏即将开始',
}: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!deadlineAt) {
      setRemaining(seconds);
      return;
    }

    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadlineAt, seconds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card px-8 py-10 text-center max-w-xs w-full shadow-soft"
      >
        <p className="text-sm font-medium text-apple-gray mb-3">{label}</p>
        <motion.p
          key={remaining}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          className="text-6xl font-bold tabular-nums text-apple-blue"
        >
          {remaining}
        </motion.p>
      </motion.div>
    </div>
  );
}
