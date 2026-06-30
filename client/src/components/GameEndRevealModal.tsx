import { motion, AnimatePresence } from 'framer-motion';
import AnswerRevealPanel from './AnswerRevealPanel';

interface Props {
  open: boolean;
  answerName: string;
  answerImageUrl?: string | null;
  finishReason?: string;
  onContinue: () => void;
}

export default function GameEndRevealModal({
  open,
  answerName,
  answerImageUrl,
  finishReason,
  onContinue,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="w-full max-w-md glass-card p-6"
          >
            <h2 className="text-xl font-bold text-center mb-1">本局结束</h2>
            {finishReason && (
              <p className="text-sm text-apple-gray text-center mb-4">{finishReason}</p>
            )}
            <AnswerRevealPanel
              name={answerName}
              imageUrl={answerImageUrl}
              subtitle="本题答案"
            />
            <button type="button" className="btn-primary w-full mt-5" onClick={onContinue}>
              查看结算排行
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
