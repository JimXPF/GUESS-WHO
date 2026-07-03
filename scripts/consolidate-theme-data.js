/**
 * One-time / repeatable merge: position-groups, type-chart, alias files → per-theme config.
 * Keeps geo/nationality-regions.json separate (not admin-configurable).
 */
const fs = require('fs');
const path = require('path');
const { mergeAliases } = require('./patch-search-aliases.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'server', 'data');
const POSITION_GROUPS = path.join(DATA, 'position-groups.json');
const TYPE_CHART = path.join(DATA, 'pokemon-type-chart.json');
const CSGO_NICK = path.join(DATA, 'aliases', 'csgo-nicknames.json');
const POKEMON_EXTRA = path.join(DATA, 'aliases', 'pokemon-extra.json');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function themeConfigFrom(raw) {
  const base = raw.config && typeof raw.config === 'object' ? { ...raw.config } : {};
  if (raw.meta && typeof raw.meta === 'object') {
    for (const [k, v] of Object.entries(raw.meta)) {
      if (base[k] === undefined) base[k] = v;
    }
  }
  return base;
}

function mergeCsgoAliases(players) {
  if (!fs.existsSync(CSGO_NICK)) return 0;
  const nickMap = loadJson(CSGO_NICK);
  delete nickMap._comment;
  let n = 0;
  for (const player of players) {
    const id = String(player.id).toLowerCase();
    const extra = nickMap[id] || nickMap[player.id];
    if (!extra?.length) continue;
    const base = [player.id];
    if (player.name && String(player.name).trim() !== String(player.id).trim()) {
      base.push(player.name);
    }
    player.aliases = mergeAliases(base, extra);
    n++;
  }
  return n;
}

function mergePokemonAliases(players) {
  if (!fs.existsSync(POKEMON_EXTRA)) return 0;
  const extraById = loadJson(POKEMON_EXTRA);
  delete extraById._comment;
  let n = 0;
  for (const mon of players) {
    const fromId = extraById[mon.id] || [];
    if (!fromId.length) continue;
    const before = (mon.aliases || []).length;
    mon.aliases = mergeAliases(mon.aliases, fromId);
    if (mon.aliases.length > before) n++;
  }
  return n;
}

function saveTheme(theme, doc) {
  const out = {
    version: doc.version ?? 2,
    updatedAt: new Date().toISOString(),
    config: doc.config,
    players: doc.players,
  };
  fs.writeFileSync(path.join(DATA, `${theme}.json`), `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
}

function main() {
  const positionGroups = loadJson(POSITION_GROUPS);
  const typeChart = loadJson(TYPE_CHART);

  for (const theme of ['csgo', 'football', 'nba', 'pokemon']) {
    const file = path.join(DATA, `${theme}.json`);
    const raw = loadJson(file);
    const config = themeConfigFrom(raw);

    if (theme !== 'pokemon' && positionGroups[theme]) {
      config.positionGroups = positionGroups[theme];
    }
    if (theme === 'pokemon') {
      config.typeChart = typeChart;
    }

    const players = raw.players || [];
    let aliasCount = 0;
    if (theme === 'csgo') aliasCount = mergeCsgoAliases(players);
    if (theme === 'pokemon') aliasCount = mergePokemonAliases(players);

    saveTheme(theme, { version: Math.max(raw.version ?? 1, 2), config, players });
    console.log(`[${theme}] config keys: ${Object.keys(config).join(', ')}; aliases merged: ${aliasCount}`);
  }

  console.log('Done. nationality-regions.json unchanged.');
}

if (require.main === module) {
  main();
}

module.exports = { main };
