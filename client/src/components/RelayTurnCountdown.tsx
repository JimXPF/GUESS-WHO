import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  deadlineAt?: number | null;
  turnSeconds?: number;
  currentTurnPlayer?: string | null;
  isMyTurn?: boolean;
}

export default function RelayTurnCountdown({
  deadlineAt,
  turnSeconds = 30,
  currentTurnPlayer,
  isMyTurn,
}: Props) {
  const [remaining, setRemaining] = useState(turnSeconds);

  useEffect(() => {
    if (!deadlineAt) {
      setRemaining(turnSeconds);
      return;
    }

    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadlineAt, turnSeconds]);

  const urgent = remaining <= 10;
  const pct = Math.max(0, Math.min(100, (remaining / turnSeconds) * 100));

  return (
    <div
      className={`glass-card p-4 text-center ${
        urgent ? 'ring-2 ring-apple-red/30' : ''
      }`}
    >
      <p className="text-xs text-apple-gray mb-1">作答倒计时</p>
      <motion.p
        key={remaining}
        initial={{ scale: urgent ? 1.08 : 1 }}
        animate={{ scale: 1 }}
        className={`text-4xl font-bold tabular-nums ${
          urgent ? 'text-apple-red' : 'text-apple-blue'
        }`}
      >
        {remaining}
        <span className="text-lg text-apple-gray font-normal">s</span>
      </motion.p>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            urgent ? 'bg-apple-red' : 'bg-apple-blue'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {currentTurnPlayer && (
        <p className="text-xs text-apple-gray mt-2">
          {isMyTurn ? '轮到你作答' : `${currentTurnPlayer} 作答中`}
        </p>
      )}
    </div>
  );
}
