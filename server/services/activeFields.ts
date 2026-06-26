import { Theme } from '../types';

/** 非宝可梦主题：固定 6 项对比字段 */
export function pickActiveFields(theme: Theme): string[] {
  const pools: Record<Exclude<Theme, 'pokemon'>, string[]> = {
    csgo: ['team', 'nationality', 'age', 'rating', 'top20Count', 'position'],
    football: ['club', 'nationalTeam', 'age', 'marketValue', 'height', 'position'],
    nba: ['team', 'age', 'height', 'draft', 'playoffCount', 'position'],
    anime: ['anime', 'affiliation', 'race', 'occupation', 'age', 'powerLevel'],
  };

  if (theme === 'pokemon') {
    throw new Error('Use buildPokemonQuestion() for pokemon theme');
  }
  return [...pools[theme]];
}

export function parseActiveFields(raw: string | undefined, theme: Theme): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed) && parsed.every((f) => typeof f === 'string') && parsed.length > 0) {
      return parsed;
    }
  } catch {
    /* fallback */
  }
  if (theme === 'pokemon') {
    return ['type1', 'category', 'ability', 'baseStatTotal', 'evolutionStage', 'type2'];
  }
  return pickActiveFields(theme);
}
