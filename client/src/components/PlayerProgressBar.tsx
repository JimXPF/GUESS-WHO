import type { RoomPlayerState } from '../types';

interface Props {
  players: RoomPlayerState[];
  mySessionId: string;
  mode: 'battle' | 'relay-chain';
  currentTurnSessionId?: string | null;
  currentTurnPlayer?: string | null;
  /** 对战每题机会上限，用于展示「已猜 N/M」 */
  maxAttemptsPerQuestion?: number;
}

export default function PlayerProgressBar({
  players,
  mySessionId,
  mode,
  currentTurnSessionId,
  currentTurnPlayer,
  maxAttemptsPerQuestion = 10,
}: Props) {
  const showBattlePressure = mode === 'battle';

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {mode === 'relay-chain' && currentTurnPlayer && (
        <div className="rounded-xl border border-blue-200/80 bg-blue-50/90 px-3 py-2 text-xs font-semibold text-apple-blue shadow-md shadow-blue-100/60">
          当前作答：{currentTurnPlayer}
        </div>
      )}
      <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
        {players.map((p) => {
          const isActiveTurn =
            mode === 'relay-chain' && currentTurnSessionId === p.sessionId;
          const isMe = p.sessionId === mySessionId;
          const attempts = p.questionAttempts ?? 0;
          const hits = p.hitCount ?? 0;
          const hot = showBattlePressure && (attempts >= 3 || hits >= 3);

          return (
            <div
              key={p.sessionId}
              className={`rounded-xl px-3 py-2.5 text-xs transition-all ${
                isActiveTurn
                  ? 'bg-blue-50/95 border border-blue-200/80 shadow-md shadow-blue-100/70 ring-1 ring-apple-blue/25'
                  : hot
                    ? 'glass-card ring-1 ring-apple-orange/35 bg-orange-50/40'
                    : isMe
                      ? 'glass-card ring-1 ring-apple-blue/20'
                      : 'glass-card'
              }`}
              title={
                p.scoreBreakdown?.length
                  ? p.scoreBreakdown
                      .map(
                        (b) =>
                          `第${b.round}轮-${b.fieldLabel} ${b.points > 0 ? '+' : ''}${b.points}`
                      )
                      .join('\n')
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold truncate">{p.playerName}</div>
                {isActiveTurn && (
                  <span className="shrink-0 text-[10px] font-bold text-apple-blue bg-white/80 px-1.5 py-0.5 rounded-full">
                    作答中
                  </span>
                )}
                {isMe && !isActiveTurn && (
                  <span className="shrink-0 text-[10px] text-apple-blue/80">你</span>
                )}
              </div>
              <div className="text-apple-gray flex justify-between gap-2 mt-1">
                <span>{p.score}分</span>
                <span>对{p.correctCount}</span>
                <span>剩{p.attemptsLeft}</span>
              </div>
              {showBattlePressure && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                      attempts > 0
                        ? 'bg-apple-blue/10 text-apple-blue'
                        : 'bg-gray-100 text-apple-gray'
                    }`}
                  >
                    已猜 {attempts}/{maxAttemptsPerQuestion}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                      hits > 0
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-apple-gray'
                    }`}
                  >
                    命中 {hits} 项
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
