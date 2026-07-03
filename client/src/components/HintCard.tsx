import { AnimatePresence, motion } from 'framer-motion';
import type { HintInfo } from '../types';

interface Props {
  hints: HintInfo[];
}

function hintTitle(hint: HintInfo, index: number): string {
  if (hint.field === 'confederation' || hint.field === 'clubLeague' || hint.field === 'dexNumber') {
    return index === 0 ? '首条' : '追加';
  }
  if (hint.field === 'moveHint') return '招式';
  if (hint.field === 'weaknessHint') return index === 0 ? '提示' : '追加';
  return index === 0 ? '提示' : '追加';
}

export default function HintCard({ hints }: Props) {
  if (!hints.length) return null;

  const single = hints.length === 1;

  return (
    <div className="w-full">
      <div className="flex gap-2 w-full">
        <AnimatePresence mode="popLayout">
          {hints.map((hint, index) => (
            <motion.div
              key={`${hint.field}-${hint.value}-${index}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              layout
              className={`glass-card px-2 sm:px-3 py-2 text-center min-w-0 ${
                single ? 'flex-1 w-full' : 'flex-1 basis-0'
              }`}
            >
              <p className="text-[10px] text-apple-gray leading-tight mb-0.5">
                {hintTitle(hint, index)}
              </p>
              <p
                className="text-[11px] font-medium text-gray-600 leading-tight truncate"
                title={hint.label}
              >
                {hint.label}
              </p>
              <p
                className={`font-bold text-apple-blue leading-tight mt-0.5 ${
                  hint.field === 'weaknessHint'
                    ? 'text-[10px] sm:text-xs whitespace-pre-line text-left'
                    : `truncate ${single ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'}`
                }`}
                title={String(hint.value ?? '')}
              >
                {hint.value ?? '—'}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
