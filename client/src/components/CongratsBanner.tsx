import { motion } from 'framer-motion';

export function getCongratsCopy(attempts: number): { headline: string; golden: boolean } {
  if (attempts === 1) return { headline: '一发命中！懂王！', golden: true };
  if (attempts <= 3) return { headline: `仅用${attempts}次！快！`, golden: true };
  return { headline: '恭喜答对！', golden: false };
}

interface Props {
  attempts: number;
  score: number;
}

export default function CongratsBanner({ attempts, score }: Props) {
  const { headline, golden } = getCongratsCopy(attempts);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="glass-card p-6 text-center"
    >
      <motion.span
        animate={{ rotate: [0, -8, 8, -6, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 0.55 }}
        className="text-5xl block mb-3"
      >
        🎉
      </motion.span>
      <p
        className={
          golden
            ? 'congrats-gold text-3xl sm:text-4xl tracking-wide mb-2'
            : 'text-2xl sm:text-3xl font-bold text-apple-green mb-2'
        }
      >
        {headline}
      </p>
      <motion.p
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: 'spring' }}
        className={`text-xl font-semibold ${golden ? 'text-amber-600' : 'text-apple-green'}`}
      >
        +{score} 分
      </motion.p>
    </motion.div>
  );
}
