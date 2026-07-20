import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  deadlineAt?: number | null;
  seconds?: number;
  /** 倒计时归零后仍停在题间时回调（用于拉同步，防服务端广播丢失） */
  onExpired?: () => void;
}

export default function BattleNextCountdown({
  deadlineAt,
  seconds = 5,
  onExpired,
}: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const expiredFired = useRef(false);

  useEffect(() => {
    expiredFired.current = false;
  }, [deadlineAt]);

  useEffect(() => {
    if (!deadlineAt) {
      setRemaining(seconds);
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !expiredFired.current) {
        expiredFired.current = true;
        onExpired?.();
      }
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadlineAt, seconds, onExpired]);

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
