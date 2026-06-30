import type { RoomPlayerState } from '../types';

interface Props {
  players: RoomPlayerState[];
  mySessionId: string;
  mode: 'battle' | 'relay-chain';
  currentTurnPlayer?: string | null;
}

export default function PlayerProgressBar({ players, mySessionId, mode, currentTurnPlayer }: Props) {
  return (
    <div className="fixed top-14 left-2 z-30 flex flex-col gap-1.5 max-w-[200px]">
      {mode === 'relay-chain' && currentTurnPlayer && (
        <div className="glass-card px-3 py-1.5 text-xs font-medium text-apple-blue">
          当前作答：{currentTurnPlayer}
        </div>
      )}
      {players.map((p) => (
        <div
          key={p.sessionId}
          className={`glass-card px-3 py-2 text-xs ${
            p.sessionId === mySessionId ? 'ring-2 ring-apple-blue/40' : ''
          }`}
          title={
            p.scoreBreakdown?.length
              ? p.scoreBreakdown
                  .map((b) => `第${b.round}轮-${b.fieldLabel} ${b.points > 0 ? '+' : ''}${b.points}`)
                  .join('\n')
              : undefined
          }
        >
          <div className="font-medium truncate">{p.playerName}</div>
          <div className="text-apple-gray flex justify-between gap-2 mt-0.5">
            <span>{p.score}分</span>
            <span>对{p.correctCount}</span>
            <span>剩{p.attemptsLeft}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
