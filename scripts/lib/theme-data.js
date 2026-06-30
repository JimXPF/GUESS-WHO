/**
 * Unified theme data format:
 * { version, updatedAt, players: [...], meta: { ... } }
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'server', 'data');
const THEMES = ['csgo', 'football', 'nba', 'pokemon'];

function themePath(theme) {
  const name = String(theme).replace(/\.json$/, '');
  return path.join(DATA_DIR, `${name}.json`);
}

function loadTheme(theme) {
  const file = themePath(theme);
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (Array.isArray(raw)) {
    return { version: 1, players: raw, meta: {} };
  }
  return {
    version: raw.version ?? 1,
    updatedAt: raw.updatedAt,
    players: Array.isArray(raw.players) ? raw.players : [],
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
  };
}

function loadPlayers(themeOrFilename) {
  return loadTheme(themeOrFilename).players;
}

function saveTheme(themeOrFilename, players, metaPatch = null) {
  const theme = String(themeOrFilename).replace(/\.json$/, '');
  const existing = loadTheme(theme);
  const doc = {
    version: 1,
    updatedAt: new Date().toISOString(),
    players,
    meta:
      metaPatch !== null && metaPatch !== undefined
        ? { ...existing.meta, ...metaPatch }
        : existing.meta,
  };
  fs.writeFileSync(themePath(theme), `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
}

function loadThemeData(filename) {
  return loadPlayers(filename);
}

function saveThemeData(filename, players, metaPatch = null) {
  saveTheme(filename, players, metaPatch);
}

function getMeta(theme) {
  return loadTheme(theme).meta;
}

module.exports = {
  DATA_DIR,
  THEMES,
  themePath,
  loadTheme,
  loadPlayers,
  saveTheme,
  loadThemeData,
  saveThemeData,
  getMeta,
};
