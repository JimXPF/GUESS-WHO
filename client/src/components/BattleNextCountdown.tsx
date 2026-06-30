import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  deadlineAt?: number | null;
  seconds?: number;
}

export default function BattleNextCountdown({ deadlineAt, seconds = 5 }: Props) {
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
    <div className="shrink-0 mt-2 rounded-xl border border-gray-200/80 bg-white/90 px-4 py-5 text-center shadow-soft">
      <p className="text-sm font-medium text-apple-gray mb-2">等待下一题</p>
      <motion.p
        key={remaining}
        initial={{ scale: 1.15 }}
        animate={{ scale: 1 }}
        className="text-5xl font-bold tabular-nums text-apple-blue"
      >
        {remaining}
      </motion.p>
    </div>
  );
}
