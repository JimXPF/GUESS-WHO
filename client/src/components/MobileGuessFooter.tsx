import { motion } from 'framer-motion';
import GuessInput from './GuessInput';
import type { Theme } from '../types';

interface Props {
  theme: Theme;
  guessText: string;
  placeholder: string;
  attemptsLeft: number;
  questionAttempts: number;
  loading: boolean;
  disabled: boolean;
  pulseAttempts?: boolean;
  questionDone: boolean;
  onChange: (v: string) => void;
  onSubmit: (text: string, characterId?: string) => void;
  onNext: () => void;
}

export default function MobileGuessFooter({
  theme,
  guessText,
  placeholder,
  attemptsLeft,
  questionAttempts,
  loading,
  disabled,
  pulseAttempts,
  questionDone,
  onChange,
  onSubmit,
  onNext,
}: Props) {
  return (
    <div className="lg:hidden shrink-0 border-t border-gray-200/60 bg-white/95 backdrop-blur-xl safe-bottom">
      <div className="px-3 pt-2 pb-1 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-apple-gray leading-none mb-0.5">剩余机会</p>
          <motion.p
            key={attemptsLeft}
            initial={{ scale: pulseAttempts ? 1.2 : 1, color: pulseAttempts ? '#FF3B30' : '#111' }}
            animate={{ scale: 1, color: '#111' }}
            className="text-2xl font-bold leading-none"
          >
            {attemptsLeft}
            <span className="text-base text-apple-gray font-normal">/10</span>
          </motion.p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-apple-gray leading-none mb-0.5">本题已猜</p>
          <p className="text-lg font-semibold leading-none">{questionAttempts} 次</p>
        </div>
      </div>

      {questionDone ? (
        <div className="px-3 pb-3 pt-1">
          <motion.button
            whileTap={{ scale: 0.98 }}
            className="btn-primary w-full py-3.5 text-base"
            onClick={onNext}
            disabled={loading}
          >
            {loading ? '加载中...' : '下一题 →'}
          </motion.button>
        </div>
      ) : (
        <div className="px-3 pb-3 pt-1 flex gap-2 items-stretch">
          <GuessInput
            theme={theme}
            value={guessText}
            placeholder={placeholder}
            onChange={onChange}
            onSubmit={onSubmit}
            disabled={disabled}
            loading={loading}
            suggestionsPlacement="top"
          />
          <button
            className="btn-primary shrink-0 px-5 self-stretch min-h-[48px]"
            onClick={() => onSubmit(guessText)}
            disabled={loading || !guessText.trim() || disabled}
          >
            {loading ? '…' : '猜'}
          </button>
        </div>
      )}
    </div>
  );
}
