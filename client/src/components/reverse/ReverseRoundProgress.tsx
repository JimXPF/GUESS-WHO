import { memo } from 'react';

interface Props {
  totalRounds: number;
  /** 已完成的轮数（roundHistory.length） */
  completedRounds: number;
  /** 当前进行中的轮次（1-based） */
  currentRound: number;
}

function ReverseRoundProgress({ totalRounds, completedRounds, currentRound }: Props) {
  return (
    <div className="flex items-center gap-1.5 w-full" role="progressbar" aria-valuenow={completedRounds} aria-valuemin={0} aria-valuemax={totalRounds}>
      {Array.from({ length: totalRounds }, (_, i) => {
        const round = i + 1;
        const done = round <= completedRounds;
        const active = !done && round === currentRound;
        return (
          <div key={round} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <div
              className={`h-1.5 w-full rounded-full transition-colors ${
                done
                  ? 'bg-apple-blue'
                  : active
                    ? 'bg-apple-blue/40 ring-1 ring-apple-blue/50'
                    : 'bg-gray-200'
              }`}
            />
            <span
              className={`text-[9px] leading-none truncate w-full text-center ${
                done || active ? 'text-apple-blue font-medium' : 'text-apple-gray'
              }`}
            >
              {round}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default memo(ReverseRoundProgress);
