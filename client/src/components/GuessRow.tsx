import { motion } from 'framer-motion';
import type { FieldCompare } from '../types';
import { RESULT_COLORS, RESULT_LABELS } from '../types';

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: 'sm' | 'md';
}

export function CharacterAvatar({ name, imageUrl, size = 'sm' }: AvatarProps) {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm';
  const initial = name.charAt(0);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${dim} rounded-full object-cover bg-gray-100 shrink-0 ring-1 ring-gray-200`}
        loading="lazy"
        onError={(e) => {
          const el = e.target as HTMLImageElement;
          el.replaceWith(
            Object.assign(document.createElement('div'), {
              className: `${dim} rounded-full bg-apple-blue/10 text-apple-blue font-semibold flex items-center justify-center shrink-0`,
              textContent: initial,
            })
          );
        }}
      />
    );
  }

  return (
    <div
      className={`${dim} rounded-full bg-apple-blue/10 text-apple-blue font-semibold flex items-center justify-center shrink-0`}
    >
      {initial}
    </div>
  );
}

const COL_WIDTH: Record<string, string> = {
  name: 'w-[120px]',
  team: 'w-[88px]',
  club: 'w-[88px]',
  anime: 'w-[96px]',
  affiliation: 'w-[92px]',
  nationality: 'w-[72px]',
  nationalTeam: 'w-[72px]',
  age: 'w-[64px]',
  height: 'w-[72px]',
  rating: 'w-[88px]',
  top20Count: 'w-[80px]',
  position: 'w-[64px]',
  school: 'w-[88px]',
  draft: 'w-[88px]',
  playoffCount: 'w-[72px]',
  marketValue: 'w-[80px]',
  race: 'w-[72px]',
  occupation: 'w-[72px]',
  powerLevel: 'w-[72px]',
};

function compareHint(
  result: FieldCompare['result'],
  direction: FieldCompare['direction'],
  guessValue: string | number | null | undefined
): string | null {
  if (!direction || guessValue == null) return null;
  const val = String(guessValue);
  const prefix = result === 'close' ? '略' : '';
  // direction is guess vs answer; label tells where the answer sits vs this guess
  if (direction === 'higher') return `${prefix}低于${val}`;
  if (direction === 'lower') return `${prefix}高于${val}`;
  return null;
}

interface Props {
  guessName: string;
  imageUrl?: string | null;
  fieldResults: FieldCompare[];
  isCorrect: boolean;
  index: number;
}

export default function GuessRow({
  guessName,
  imageUrl,
  fieldResults,
  isCorrect,
  index,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 260 }}
      className={
        isCorrect
          ? 'overflow-hidden rounded-xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 via-green-50/80 to-white shadow-lg shadow-emerald-200/60'
          : 'glass-card overflow-hidden'
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse table-fixed min-w-[980px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="sticky left-0 z-10 bg-white/95 backdrop-blur w-[140px] px-3 py-2 text-left font-medium text-apple-gray">
                猜测
              </th>
              {fieldResults.map((f) => (
                <th
                  key={f.field}
                  className={`px-1 py-2 text-center font-medium text-apple-gray ${COL_WIDTH[f.field] || 'w-[72px]'}`}
                >
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                className={`sticky left-0 z-10 backdrop-blur px-3 py-2 font-semibold text-sm border-r w-[140px] ${
                  isCorrect
                    ? 'bg-emerald-50/95 border-emerald-200'
                    : 'bg-white/95 border-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CharacterAvatar name={guessName} imageUrl={imageUrl} />
                  <span className="truncate" title={guessName}>
                    {guessName}
                  </span>
                  {isCorrect && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-apple-green text-xs font-medium shrink-0"
                    >
                      ✓
                    </motion.span>
                  )}
                </div>
              </td>
              {fieldResults.map((field, fi) => {
                const hint =
                  field.result === 'hit'
                    ? '猜对了'
                    : compareHint(field.result, field.direction, field.guessValue);
                return (
                  <motion.td
                    key={field.field}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 + fi * 0.03 }}
                    className={`px-1 py-1 text-center align-top ${COL_WIDTH[field.field] || 'w-[72px]'}`}
                  >
                    <div
                      className={`rounded-md px-1.5 py-1.5 h-full border ${RESULT_COLORS[field.result]}`}
                      title={`${RESULT_LABELS[field.result]}${hint ? ` · ${hint}` : ''}`}
                    >
                      <p className="font-medium truncate text-gray-800">
                        {field.guessValue ?? '—'}
                      </p>
                      {hint && (
                        <p className="text-[10px] font-semibold mt-0.5 opacity-90">{hint}</p>
                      )}
                    </div>
                  </motion.td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
