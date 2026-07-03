import fs from 'fs';
import path from 'path';
import { Theme } from '../types';

export interface ThemeDocument {
  version?: number;
  updatedAt?: string;
  config: Record<string, unknown>;
  players: unknown[];
}

const cache: Partial<Record<Theme, ThemeDocument>> = {};

/** Read theme JSON; `config` merges legacy root `meta` if present. */
export function readThemeDocument(theme: Theme): ThemeDocument {
  if (cache[theme]) return cache[theme]!;

  const filePath = path.join(__dirname, '..', 'data', `${theme}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (Array.isArray(raw)) {
    const doc: ThemeDocument = { players: raw, config: {} };
    cache[theme] = doc;
    return doc;
  }

  const config: Record<string, unknown> =
    raw.config && typeof raw.config === 'object' ? { ...raw.config } : {};
  if (raw.meta && typeof raw.meta === 'object') {
    for (const [key, value] of Object.entries(raw.meta as Record<string, unknown>)) {
      if (config[key] === undefined) config[key] = value;
    }
  }

  const doc: ThemeDocument = {
    version: raw.version,
    updatedAt: raw.updatedAt,
    config,
    players: Array.isArray(raw.players) ? raw.players : [],
  };
  cache[theme] = doc;
  return doc;
}

export function getThemeConfig(theme: Theme): Record<string, unknown> {
  return readThemeDocument(theme).config;
}

export function getPositionGroups(theme: Theme): Record<string, string[]> {
  const groups = getThemeConfig(theme).positionGroups;
  if (!groups || typeof groups !== 'object') return {};
  return groups as Record<string, string[]>;
}

export function getPokemonTypeChart(): {
  types: string[];
  chart: Record<string, Record<string, number>>;
} {
  const tc = getThemeConfig('pokemon').typeChart as
    | { types?: string[]; chart?: Record<string, Record<string, number>> }
    | undefined;
  return {
    types: tc?.types ?? [],
    chart: tc?.chart ?? {},
  };
}

export function clearThemeConfigCache(theme?: Theme): void {
  if (theme) delete cache[theme];
  else {
    for (const key of Object.keys(cache)) {
      delete cache[key as Theme];
    }
  }
}
