import { motion } from 'framer-motion';

interface Props {
  lives: number;
  maxLives?: number;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

const SIZE_CLASS = {
  sm: 'text-xl gap-1',
  md: 'text-2xl gap-1.5',
  lg: 'text-4xl gap-2',
} as const;

export default function LivesHearts({
  lives,
  maxLives = 3,
  size = 'md',
  pulse,
  className = '',
}: Props) {
  return (
    <div
      className={`flex items-center justify-center ${SIZE_CLASS[size]} ${className}`}
      role="img"
      aria-label={`剩余生命 ${lives}`}
    >
      {Array.from({ length: maxLives }, (_, i) => {
        const alive = i < lives;
        return (
          <motion.span
            key={i}
            initial={
              pulse && !alive && i === lives
                ? { scale: 1.45, opacity: 0.6 }
                : { scale: 1 }
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className={alive ? 'text-apple-red' : 'text-gray-900'}
            aria-hidden
          >
            ♥
          </motion.span>
        );
      })}
    </div>
  );
}
