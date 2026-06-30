import { motion } from 'framer-motion';
import type { RelayCorrectRecord } from '../types';
import CharacterAvatar from './CharacterAvatar';

interface Props {
  records: RelayCorrectRecord[];
}

export default function RelayCorrectHistory({ records }: Props) {
  return (
    <div className="flex flex-col min-h-0">
      <p className="text-xs text-apple-gray mb-2 shrink-0">答对记录</p>
      {records.length === 0 ? (
        <p className="text-sm text-apple-gray text-center py-4">暂无</p>
      ) : (
        <ul className="space-y-2 pr-1 overflow-y-auto min-h-0">
          {records.map((a, i) => (
            <motion.li
              key={`${a.guessId}-${a.questionIndex}-${a.sessionId}`}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-2 text-sm"
            >
              <span className="text-apple-gray text-xs w-4 shrink-0">{i + 1}</span>
              <CharacterAvatar name={a.guessName} imageUrl={a.imageUrl} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate" title={a.guessName}>
                  {a.guessName}
                </p>
                <p className="text-[10px] text-apple-blue truncate">{a.playerName}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
