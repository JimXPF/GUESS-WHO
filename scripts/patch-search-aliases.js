/**
 * Merge search aliases into csgo.json and pokemon.json
 * Sources: csgo-nicknames.json, pokemon-extra.json, 52poke unofficial names
 */
const fs = require('fs');
const path = require('path');
const { parse52PokeNicknames } = require('./lib/parse-52poke-nicknames');

const ROOT = path.join(__dirname, '..');
const CSGO_PATH = path.join(ROOT, 'server', 'data', 'csgo.json');
const POKEMON_PATH = path.join(ROOT, 'server', 'data', 'pokemon.json');
const CSGO_NICK = path.join(ROOT, 'server', 'data', 'aliases', 'csgo-nicknames.json');
const POKEMON_EXTRA = path.join(ROOT, 'server', 'data', 'aliases', 'pokemon-extra.json');
const WIKI_CACHE = path.join(ROOT, 'scripts', 'cache', '52poke-unofficial-names.txt');

function mergeAliases(existing, additions) {
  const set = new Set();
  for (const a of existing || []) {
    if (a && String(a).trim()) set.add(String(a).trim());
  }
  for (const a of additions || []) {
    if (a && String(a).trim()) set.add(String(a).trim());
  }
  return [...set];
}

function patchCsgo() {
  const raw = JSON.parse(fs.readFileSync(CSGO_PATH, 'utf-8'));
  const nickMap = JSON.parse(fs.readFileSync(CSGO_NICK, 'utf-8'));
  delete nickMap._comment;

  let updated = 0;
  for (const player of raw.players) {
    const id = player.id.toLowerCase();
    const extra = nickMap[id] || nickMap[player.id];
    if (!extra?.length) continue;
    // nick file is source of truth — rebuild aliases (id/name + nicknames), drop stale merges
    const base = [player.id];
    if (player.name && String(player.name).trim() !== String(player.id).trim()) {
      base.push(player.name);
    }
    player.aliases = mergeAliases(base, extra);
    updated++;
  }

  raw.updatedAt = new Date().toISOString();
  fs.writeFileSync(CSGO_PATH, JSON.stringify(raw, null, 2), 'utf-8');
  console.log(`[csgo] synced nicknames for ${updated} players`);
}

function patchPokemon() {
  const raw = JSON.parse(fs.readFileSync(POKEMON_PATH, 'utf-8'));
  const extraById = JSON.parse(fs.readFileSync(POKEMON_EXTRA, 'utf-8'));
  delete extraById._comment;

  let byName = new Map();
  if (fs.existsSync(WIKI_CACHE)) {
    const wiki = fs.readFileSync(WIKI_CACHE, 'utf-8');
    byName = parse52PokeNicknames(wiki);
    console.log(`[pokemon] parsed ${byName.size} entries from 52poke wiki cache`);
  } else {
    console.warn(`[pokemon] wiki cache missing: ${WIKI_CACHE}`);
  }

  let updated = 0;
  for (const mon of raw.players) {
    const fromId = extraById[mon.id] || [];
    const fromName = byName.has(mon.name) ? [...byName.get(mon.name)] : [];
    const before = (mon.aliases || []).length;
    mon.aliases = mergeAliases(
      mergeAliases(mon.aliases, fromId),
      fromName
    );
    if (mon.aliases.length > before) updated++;
  }

  raw.updatedAt = new Date().toISOString();
  fs.writeFileSync(POKEMON_PATH, JSON.stringify(raw, null, 2), 'utf-8');
  console.log(`[pokemon] merged nicknames for ${updated} species`);
}

module.exports = { patchCsgo, patchPokemon };

if (require.main === module) {
  patchCsgo();
  patchPokemon();
}
