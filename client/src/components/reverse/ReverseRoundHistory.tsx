import { memo, useMemo } from 'react';
import type { ReverseRoundRecord } from '../../types';
import CharacterAvatar from '../CharacterAvatar';

interface Props {
  rounds: ReverseRoundRecord[];
}

function ReverseRoundHistory({ rounds }: Props) {
  const recentRounds = useMemo(() => [...rounds].reverse(), [rounds]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <p className="text-xs text-apple-gray mb-2 shrink-0">历史记录</p>
      {rounds.length === 0 ? (
        <p className="text-sm text-apple-gray text-center py-4">暂无</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto pr-1 min-h-0">
          {recentRounds.map((r) => (
            <li
              key={`${r.questionIndex}-${r.answerId}`}
              className="glass-card p-2.5 text-xs space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <CharacterAvatar name={r.answerName} imageUrl={r.imageUrl} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{r.answerName}</p>
                  <p className="text-[10px] text-apple-gray">
                    剩余 {r.aliveCountAtEnd}/{r.totalPool}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    r.success
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-orange-50 text-orange-700'
                  }`}
                >
                  {r.autoDeduced ? '筛出' : r.success ? '猜对' : '未猜对'}
                </span>
              </div>
              {r.guessedName && !r.autoDeduced && (
                <p className="text-apple-gray pl-9">猜测：{r.guessedName}</p>
              )}
              <p className="text-right font-bold text-apple-blue">+{r.score}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default memo(ReverseRoundHistory);
