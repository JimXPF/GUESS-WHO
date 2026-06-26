import { Theme } from '../types';

const STAT_FIELDS = [
  'baseStatTotal',
  'hp',
  'attack',
  'defense',
  'spAttack',
  'spDefense',
  'speed',
] as const;

const POKEMON_OPTIONAL = [
  'type2',
  'evolutionStage',
  'category',
  'ability',
  'learnableMove',
] as const;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 整局开始时抽取对比字段，整局固定不变 */
export function pickActiveFields(theme: Theme): string[] {
  if (theme === 'pokemon') {
    const statField = pickOne([...STAT_FIELDS]);
    const others = shuffle([...POKEMON_OPTIONAL]).slice(0, 4);
    return ['type1', statField, ...others];
  }

  const pools: Record<Exclude<Theme, 'pokemon'>, string[]> = {
    csgo: ['team', 'nationality', 'age', 'rating', 'top20Count', 'position'],
    football: ['club', 'nationalTeam', 'age', 'marketValue', 'height', 'position'],
    nba: ['team', 'age', 'height', 'draft', 'playoffCount', 'position'],
    anime: ['anime', 'affiliation', 'race', 'occupation', 'age', 'powerLevel'],
  };

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
  return pickActiveFields(theme);
}
