import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  exhaustedPlayerName: string;
  onClose: () => void;
}

export default function RelayOpponentExhaustedModal({
  open,
  exhaustedPlayerName,
  onClose,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-sm glass-card p-6 text-center"
          >
            <p className="text-lg font-bold text-apple-blue mb-2">对方次数耗尽，你将连续作答</p>
            <p className="text-sm text-apple-gray mb-5">
              {exhaustedPlayerName} 的机会已用完
            </p>
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              知道了
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
