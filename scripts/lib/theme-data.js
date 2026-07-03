/**
 * Unified theme data format:
 * { version, updatedAt, config: { ... }, players: [...] }
 * Legacy root `meta` is merged into config on read.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'server', 'data');
const THEMES = ['csgo', 'football', 'nba', 'pokemon'];

function themePath(theme) {
  const name = String(theme).replace(/\.json$/, '');
  return path.join(DATA_DIR, `${name}.json`);
}

function configFromRaw(raw) {
  const config =
    raw.config && typeof raw.config === 'object' ? { ...raw.config } : {};
  if (raw.meta && typeof raw.meta === 'object') {
    for (const [k, v] of Object.entries(raw.meta)) {
      if (config[k] === undefined) config[k] = v;
    }
  }
  return config;
}

function loadTheme(theme) {
  const file = themePath(theme);
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (Array.isArray(raw)) {
    return { version: 1, players: raw, config: {} };
  }
  return {
    version: raw.version ?? 1,
    updatedAt: raw.updatedAt,
    players: Array.isArray(raw.players) ? raw.players : [],
    config: configFromRaw(raw),
  };
}

function loadPlayers(themeOrFilename) {
  return loadTheme(themeOrFilename).players;
}

function saveTheme(themeOrFilename, players, configPatch = null) {
  const theme = String(themeOrFilename).replace(/\.json$/, '');
  const existing = loadTheme(theme);
  const doc = {
    version: 2,
    updatedAt: new Date().toISOString(),
    config:
      configPatch !== null && configPatch !== undefined
        ? { ...existing.config, ...configPatch }
        : existing.config,
    players,
  };
  fs.writeFileSync(themePath(theme), `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
}

function loadThemeData(filename) {
  return loadPlayers(filename);
}

function saveThemeData(filename, players, configPatch = null) {
  saveTheme(filename, players, configPatch);
}

function getConfig(theme) {
  return loadTheme(theme).config;
}

/** @deprecated use getConfig */
function getMeta(theme) {
  return getConfig(theme);
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
  getConfig,
  getMeta,
};
