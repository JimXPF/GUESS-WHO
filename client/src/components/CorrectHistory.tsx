import { motion } from 'framer-motion';
import type { CorrectAnswerRecord, FieldCompare } from '../types';
import CharacterAvatar from './CharacterAvatar';

interface Props {
  answers: CorrectAnswerRecord[];
}

function FieldMini({ f }: { f: FieldCompare }) {
  return (
    <div className="flex justify-between text-xs py-0.5 border-b border-gray-100 last:border-none">
      <span className="text-apple-gray">{f.label}</span>
      <span className={`font-medium ${f.result === 'hit' ? 'text-apple-green' : 'text-gray-700'}`}>
        {f.guessValue ?? '—'}
      </span>
    </div>
  );
}

export default function CorrectHistory({ answers }: Props) {
  return (
    <div className="flex flex-col min-h-0">
      <p className="text-xs text-apple-gray mb-2 shrink-0">答对记录</p>
      {answers.length === 0 ? (
        <p className="text-sm text-apple-gray text-center py-4">暂无</p>
      ) : (
        <ul className="space-y-2 pr-1">
          {answers.map((a, i) => (
            <motion.li
              key={`${a.guessId}-${a.questionIndex}`}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-2 text-sm group relative"
            >
              <span className="text-apple-gray text-xs w-4 shrink-0">{i + 1}</span>
              <CharacterAvatar name={a.guessName} imageUrl={a.imageUrl} />
              <span className="font-medium truncate group-hover:whitespace-normal group-hover:overflow-visible">
                {a.guessName}
              </span>

              {/* Hover popover with full field results - pop to the LEFT to avoid clipping in narrow sidebar */}
              {a.fieldResults && a.fieldResults.length > 0 && (
                <div className="absolute right-full mr-3 top-0 z-[60] hidden group-hover:block w-56 glass-card p-3 text-xs shadow-xl border border-gray-200">
                  <p className="font-semibold mb-2 text-apple-gray">详细内容</p>
                  <div className="space-y-0.5">
                    {a.fieldResults.map((f, fi) => (
                      <FieldMini key={fi} f={f} />
                    ))}
                  </div>
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
