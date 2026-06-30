import { motion } from 'framer-motion';
import type { FieldCompare } from '../types';
import { RESULT_COLORS, RESULT_LABELS } from '../types';
import CharacterAvatar from './CharacterAvatar';

export { default as CharacterAvatar } from './CharacterAvatar';

const COL_WIDTH: Record<string, string> = {
  name: 'w-[120px]',
  team: 'w-[88px]',
  club: 'w-[88px]',
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
  type1: 'w-[64px]',
  type2: 'w-[64px]',
  evolutionStage: 'w-[72px]',
  category: 'w-[80px]',
  ability: 'w-[72px]',
  hp: 'w-[56px]',
  attack: 'w-[56px]',
  defense: 'w-[56px]',
  spAttack: 'w-[56px]',
  spDefense: 'w-[56px]',
  speed: 'w-[56px]',
  eggGroup: 'w-[80px]',
  learnableMove: 'w-[88px]',
  baseStatTotal: 'w-[72px]',
};

function compareHint(
  field: string,
  result: FieldCompare['result'],
  direction: FieldCompare['direction'],
  guessValue: string | number | null | undefined
): string | null {
  if (!direction || guessValue == null) return null;

  if (field === 'draft') {
    const yearMatch = String(guessValue).match(/(\d{4})/);
    const year = yearMatch?.[1] ?? String(guessValue);
    if (direction === 'later') return `晚于${year}`;
    if (direction === 'earlier') return `早于${year}`;
  }

  const val = String(guessValue);
  const prefix = result === 'close' ? '略' : '';
  if (direction === 'higher') return `${prefix}低于${val}`;
  if (direction === 'lower') return `${prefix}高于${val}`;
  return null;
}

function FieldCell({ field, index, rowIndex }: { field: FieldCompare; index: number; rowIndex: number }) {
  const hint =
    field.result === 'hit'
      ? '✓'
      : field.hint ?? compareHint(field.field, field.result, field.direction, field.guessValue);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: rowIndex * 0.04 + index * 0.02 }}
      className={`rounded-md px-1 py-1 border text-center min-w-0 ${RESULT_COLORS[field.result]}`}
      title={`${field.label} · ${RESULT_LABELS[field.result]}${hint && hint !== '✓' ? ` · ${hint}` : ''}`}
    >
      <p className="text-[9px] text-apple-gray leading-none mb-0.5 truncate">{field.label}</p>
      <p className="text-[11px] font-semibold text-gray-800 leading-tight break-all">
        {field.guessValue ?? '—'}
      </p>
      {hint && (
        <p className="text-[9px] font-medium mt-0.5 opacity-90 leading-none">{hint}</p>
      )}
    </motion.div>
  );
}

interface Props {
  guessName: string;
  imageUrl?: string | null;
  fieldResults: FieldCompare[];
  isCorrect: boolean;
  index: number;
  playerName?: string;
  isActivePlayer?: boolean;
  scoreDelta?: number;
  showRelayScoring?: boolean;
}

export default function GuessRow({
  guessName,
  imageUrl,
  fieldResults,
  isCorrect,
  index,
  playerName,
  isActivePlayer,
  scoreDelta,
  showRelayScoring,
}: Props) {
  const cardClass = isCorrect
    ? 'rounded-xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 via-green-50/80 to-white shadow-md shadow-emerald-200/50'
    : isActivePlayer
      ? 'rounded-xl border border-blue-200/80 bg-blue-50/70 shadow-md shadow-blue-100/60'
      : 'glass-card';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 280 }}
      className={cardClass}
    >
      {scoreDelta != null && (
        <div
          className={`px-3 pt-2 text-right text-xs font-bold ${
            scoreDelta >= 0 ? 'text-apple-green' : 'text-apple-red'
          }`}
        >
          {scoreDelta > 0 ? '+' : ''}
          {scoreDelta} 分
        </div>
      )}
      {/* Mobile: compact header + wrapped field grid */}
      <div className="lg:hidden p-2">
        <div className="flex items-center gap-2 min-w-0 mb-2">
          <span className="text-[10px] font-semibold text-apple-gray shrink-0 tabular-nums">
            猜测{index + 1}
          </span>
          {playerName && (
            <span className="text-[10px] font-medium text-apple-blue shrink-0">{playerName}</span>
          )}
          <CharacterAvatar name={guessName} imageUrl={imageUrl} size="xs" />
          <span className="text-sm font-semibold truncate min-w-0 flex-1" title={guessName}>
            {guessName}
          </span>
          {isCorrect && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-apple-green text-xs font-bold shrink-0"
            >
              ✓
            </motion.span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {fieldResults.map((field, fi) => (
            <div key={field.field} className="relative">
              <FieldCell field={field} index={fi} rowIndex={index} />
              {showRelayScoring && field.claimedBy && (
                <p className="text-[8px] text-center mt-0.5 text-apple-gray truncate px-0.5">
                  {field.result === 'hit'
                    ? field.claimedBy === playerName
                      ? '首认领'
                      : '已被认领'
                    : '已认领·答错'}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: horizontal table */}
      <div className="hidden lg:block overflow-x-auto">
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
                  <span className="text-[10px] text-apple-gray shrink-0">#{index + 1}</span>
                  {playerName && (
                    <span className="text-[10px] font-medium text-apple-blue shrink-0 max-w-[56px] truncate">
                      {playerName}
                    </span>
                  )}
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
                    : field.hint ?? compareHint(field.field, field.result, field.direction, field.guessValue);
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
