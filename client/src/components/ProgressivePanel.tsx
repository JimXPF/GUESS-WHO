import type { GameSession } from '../types';
import CharacterAvatar from './CharacterAvatar';

interface Props {
  session: GameSession;
}

function HintTag({ hit, label }: { hit: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        hit
          ? 'bg-apple-green/15 text-apple-green ring-1 ring-apple-green/25'
          : 'bg-apple-red/10 text-apple-red ring-1 ring-apple-red/20'
      }`}
    >
      <span aria-hidden>{hit ? '√' : '×'}</span>
      {label}
    </span>
  );
}

function GuessRowContent({
  session,
  guess,
}: {
  session: GameSession;
  guess: NonNullable<GameSession['progressiveRounds']>[number]['guesses'][number];
}) {
  return (
    <>
      <CharacterAvatar
        name={guess.guessName}
        imageUrl={guess.imageUrl}
        size="row"
        frameless
        shape={session.theme === 'pokemon' ? 'square' : 'circle'}
      />
      <span className="font-medium shrink-0">{guess.guessName}</span>
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        {Array.isArray(guess.hintChecks) &&
          guess.hintChecks.map((c) => (
            <HintTag key={c.field} hit={c.hit} label={c.label} />
          ))}
      </div>
      {guess.livesLost && (
        <span className="text-xs text-apple-red shrink-0">(-1命)</span>
      )}
      {guess.isCorrect && (
        <span className="text-xs text-apple-green font-semibold shrink-0">答对啦!!</span>
      )}
    </>
  );
}

export default function ProgressivePanel({ session }: Props) {
  const rounds = Array.isArray(session.progressiveRounds) ? session.progressiveRounds : [];

  return (
    <div className="space-y-2">
      {rounds.map((round) => {
        const guesses = Array.isArray(round.guesses) ? round.guesses : [];
        return (
          <div key={round.hintIndex} className="glass-card overflow-hidden">
            <div className="px-4 py-3 min-h-[48px] flex items-center bg-apple-blue/5 border-b border-apple-blue/10 text-sm">
              <span className="text-apple-gray mr-2 shrink-0">提示{round.hintIndex + 1}</span>
              <span className="font-medium shrink-0">{round.hint.label}：</span>
              <span className="truncate">{round.hint.value}</span>
            </div>

            {guesses.length === 0 ? (
              <p className="px-4 py-3 min-h-[48px] flex items-center text-sm text-apple-gray">
                等待猜测…
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {guesses.map((g, i) => (
                  <li
                    key={`${round.hintIndex}-${i}`}
                    className="px-4 py-3 min-h-[48px] flex flex-wrap items-center gap-2 text-sm"
                  >
                    <GuessRowContent session={session} guess={g} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
