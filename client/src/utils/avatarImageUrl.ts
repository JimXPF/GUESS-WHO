/** 2x 像素，适配 retina */
const AVATAR_PX = { xs: 56, sm: 72, md: 88, row: 112, lg: 160 } as const;

export type AvatarSize = keyof typeof AVATAR_PX;

export function avatarPixelSize(size: AvatarSize): number {
  return AVATAR_PX[size];
}

const POKEMON_SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/** 从 PokeAPI 立绘 / 精灵 URL 解析图鉴编号 */
export function extractPokemonDexId(url: string): string | null {
  const match = url.match(/\/(?:official-artwork\/|pokemon\/)(\d+)\.png/i);
  return match?.[1] ?? null;
}

/** 宝可梦统一使用 front 精灵缩略图 */
export function pokemonSpriteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/sprites/pokemon/') && !url.includes('official-artwork')) {
    return url.split('?')[0];
  }
  const id = extractPokemonDexId(url);
  if (id) return `${POKEMON_SPRITE_BASE}/${id}.png`;
  return url;
}

/** 按展示尺寸请求更小的远程图，减轻带宽与解码压力 */
export function avatarImageUrl(
  url: string | null | undefined,
  size: AvatarSize = 'sm'
): string | null {
  if (!url) return null;
  const px = AVATAR_PX[size];

  try {
    const u = new URL(url);

    if (
      u.hostname.includes('raw.githubusercontent.com') &&
      (url.includes('pokeapi') || url.includes('/sprites/pokemon/'))
    ) {
      return pokemonSpriteUrl(url);
    }

    if (url.includes('x-oss-process=image')) {
      if (/resize,w_\d+/i.test(url)) {
        return url.replace(/resize,w_\d+/i, `resize,w_${px}`);
      }
      return `${url},resize,w_${px}/format,webp`;
    }

    if (u.hostname.includes('wmpvp.com') || u.hostname.includes('aliyuncs.com')) {
      const base = url.split('?')[0];
      return `${base}?x-oss-process=image/resize,w_${px}/format,webp`;
    }

    if (u.hostname.includes('xhscdn.com')) {
      const base = url.split('?')[0];
      return `${base}?imageView2/2/w/${px}/h/${px}/format/webp/q/75`;
    }

    return url;
  } catch {
    return url;
  }
}
