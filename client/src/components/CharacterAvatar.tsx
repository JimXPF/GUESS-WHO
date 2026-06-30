import { useState } from 'react';
import { avatarImageUrl, avatarPixelSize, type AvatarSize } from '../utils/avatarImageUrl';

interface Props {
  name: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
  /** 无外圈描边与底色（逐步模式等紧凑列表） */
  frameless?: boolean;
  /** square：适合宝可梦等全身图；circle：默认圆形头像 */
  shape?: 'circle' | 'square';
  /** 使用题库原始 imageUrl，不做 CDN 缩略转换 */
  originalUrl?: boolean;
}

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  row: 'w-14 h-14 text-sm',
  lg: 'w-20 h-20 text-2xl',
};

export default function CharacterAvatar({
  name,
  imageUrl,
  size = 'sm',
  className = '',
  frameless = false,
  shape = 'circle',
  originalUrl = false,
}: Props) {
  const [failed, setFailed] = useState(false);
  const dim = SIZE_CLASS[size];
  const initial = name.charAt(0);
  const px = avatarPixelSize(size);
  const src = originalUrl ? imageUrl ?? null : avatarImageUrl(imageUrl, size);
  const isSquare = shape === 'square';

  if (src && !failed) {
    const imgClass = [
      dim,
      'shrink-0',
      isSquare ? 'object-contain' : 'object-cover rounded-full',
      !frameless && !isSquare ? 'bg-gray-100 ring-1 ring-gray-200' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <img
        src={src}
        alt={name}
        width={px}
        height={px}
        className={imgClass}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${dim} rounded-full bg-apple-blue/10 text-apple-blue font-semibold flex items-center justify-center shrink-0 ${className}`}
      aria-hidden={!name}
    >
      {initial}
    </div>
  );
}
