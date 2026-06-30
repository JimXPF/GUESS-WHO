import { motion } from 'framer-motion';
import type { BattleRoundResult } from '../types';
import CharacterAvatar from './CharacterAvatar';

interface Props {
  result: BattleRoundResult;
  mySessionId: string;
}

export default function BattleRoundBanner({ result, mySessionId }: Props) {
  const isDraw = result.kind === 'draw';
  const isWinner = !isDraw && result.winnerSessionId === mySessionId;
  const myPartial = result.partialScores.find((p) => p.sessionId === mySessionId);
  const othersPartial = result.partialScores.filter((p) => p.sessionId !== mySessionId);

  const headline = isDraw
    ? '本题平局，机会已用尽'
    : isWinner
      ? '🎉 你猜对了！'
      : `🎉 ${result.winnerPlayerName} 猜对了！`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 to-white px-4 py-3 shadow-md shadow-emerald-100/60"
    >
      {result.roundLabel && (
        <p className="text-[11px] text-emerald-700/80 text-center mb-1">{result.roundLabel}</p>
      )}
      <p className="text-sm font-bold text-emerald-800 text-center">{headline}</p>

      <div className="flex items-center justify-center gap-3 mt-2">
        <CharacterAvatar
          name={result.answerName}
          imageUrl={result.answerImageUrl}
          size="md"
        />
        <div className="text-center sm:text-left">
          <p className="text-lg font-bold text-gray-900">{result.answerName}</p>
          {!isDraw && result.winnerPlayerName && (
            <p className="text-sm font-semibold text-apple-blue">
              +{result.winnerScore} 分 · 第 {result.winnerAttempts} 次猜对
            </p>
          )}
          {isDraw && (
            <p className="text-sm text-apple-gray">双方机会已用尽，按字段命中计分</p>
          )}
        </div>
      </div>

      {(myPartial || othersPartial.length > 0) && (
        <div className="mt-3 pt-2 border-t border-emerald-100/80 space-y-1">
          {myPartial && myPartial.score > 0 && (
            <p className="text-xs text-apple-gray text-center">
              你猜对 {myPartial.hitCount} 项，+{myPartial.score} 分
            </p>
          )}
          {myPartial && myPartial.score <= 0 && !isWinner && (
            <p className="text-xs text-apple-gray text-center">本题未获得加分</p>
          )}
          {othersPartial.map((p) =>
            p.score > 0 ? (
              <p key={p.sessionId} className="text-[11px] text-apple-gray/80 text-center">
                {p.playerName} 猜对 {p.hitCount} 项，+{p.score} 分
              </p>
            ) : null
          )}
        </div>
      )}
    </motion.div>
  );

}
