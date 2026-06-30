import CharacterAvatar from './CharacterAvatar';

interface Props {
  name: string;
  imageUrl?: string | null;
  subtitle?: string;
  compact?: boolean;
}

export default function AnswerRevealPanel({
  name,
  imageUrl,
  subtitle = '正确答案',
  compact = false,
}: Props) {
  return (
    <div
      className={`rounded-xl bg-apple-bg text-center ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      }`}
    >
      <p className="text-xs sm:text-sm text-apple-gray mb-3">{subtitle}</p>
      <div className="flex flex-col items-center gap-2">
        <CharacterAvatar name={name} imageUrl={imageUrl} size={compact ? 'md' : 'lg'} />
        <p
          className={`font-semibold text-apple-red ${
            compact ? 'text-lg' : 'text-xl sm:text-2xl'
          }`}
        >
          {name}
        </p>
      </div>
    </div>
  );
}
