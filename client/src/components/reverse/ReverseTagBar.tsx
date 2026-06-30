import { memo } from 'react';
import type { ReverseQueryRecord } from '../../types';
import { reverseOperatorLabel } from './reverseUtils';

interface Props {
  queries: ReverseQueryRecord[];
}

/** 与中央筛选区等宽，紧贴其上方 */
function ReverseTagBar({ queries }: Props) {
  if (queries.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200/80 bg-white/90 px-2.5 py-2 w-full">
      <div
        className="grid w-full gap-1.5"
        style={{ gridTemplateColumns: `repeat(${queries.length}, minmax(0, 1fr))` }}
      >
        {queries.map((q, i) => {
          const text = `${q.label} ${reverseOperatorLabel(q.condition.operator)} ${q.displayValue}`;
          return (
            <span
              key={`${q.condition.field}-${q.condition.operator}-${i}`}
              className={`inline-flex items-center justify-center gap-1 min-w-0 w-full px-2 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium border ${
                q.matched
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              <span aria-hidden className="shrink-0">{q.matched ? '✓' : '✕'}</span>
              <span className="truncate">[{text}]</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default memo(ReverseTagBar);
