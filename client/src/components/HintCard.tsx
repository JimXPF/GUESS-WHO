import { AnimatePresence, motion } from 'framer-motion';
import type { HintInfo } from '../types';

interface Props {
  hints: HintInfo[];
}

export default function HintCard({ hints }: Props) {
  if (!hints.length) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {hints.map((hint, index) => (
          <motion.div
            key={`${hint.field}-${hint.value}-${index}`}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            className="glass-card p-5 text-center"
          >
            <p className="text-sm text-apple-gray mb-2">
              {hint.field === 'confederation' || hint.field === 'clubLeague'
                ? '💡 首条提示'
                : index === 0
                  ? '💡 提示'
                  : `💡 追加提示（本题第 ${[3, 6, 9][index - 1]} 次未中）`}
            </p>
            <p className="text-lg font-medium text-gray-700 mb-1">{hint.label}</p>
            <motion.p
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="text-3xl font-bold text-apple-blue"
            >
              {hint.value ?? '未知'}
            </motion.p>
            {index === 0 && hints.length === 1 && (
              <p className="text-xs text-apple-gray mt-3">
                根据提示猜测人物名字；连续 3 / 6 / 9 次未中将解锁更多提示
              </p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
