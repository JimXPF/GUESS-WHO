import { AnimatePresence, motion } from 'framer-motion';
import AnswerRevealPanel from './AnswerRevealPanel';

interface Props {
  open: boolean;
  variant: 'success' | 'failure';
  answerName: string;
  answerImageUrl?: string | null;
  onContinue: () => void;
  continueLabel?: string;
}

export default function AnswerRevealModal({
  open,
  variant,
  answerName,
  answerImageUrl,
  onContinue,
  continueLabel = '查看结算',
}: Props) {
  const isSuccess = variant === 'success';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm safe-bottom">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="glass-card p-6 max-w-sm w-full text-center"
          >
            <p className="text-lg font-medium mb-2">
              {isSuccess ? '恭喜答对！' : '本题未猜中'}
            </p>
            <p className="text-sm text-apple-gray mb-4">正确答案是：</p>
            <AnswerRevealPanel
              name={answerName}
              imageUrl={answerImageUrl}
              subtitle={isSuccess ? '本题答案' : '正确答案'}
            />
            <button type="button" className="btn-primary w-full mt-5" onClick={onContinue}>
              {continueLabel}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
