/**
 * Backfill birthDate for csgo.json from Liquipedia cache (no network).
 * Sources: cache.ages + birth_date in cached wikitext (pages).
 *
 * Usage: node scripts/backfill-csgo-birthdates.js
 */
const fs = require('fs');
const path = require('path');
const { loadTheme, saveTheme } = require('./lib/theme-data');
const { parseBirthDate, normalizeBirthDate } = require('./lib/liquipedia-csgo');
const { applyBirthDate } = require('./lib/birthdate-utils');

const CACHE_PATH = path.join(__dirname, 'cache/liquipedia-cache.json');

function cacheKey(id) {
  return String(id || '')
    .trim()
    .toLowerCase();
}

function buildWikitextIndex(cache) {
  const index = {};
  for (const [pageName, entry] of Object.entries(cache.pages || {})) {
    const bd = normalizeBirthDate(parseBirthDate(entry.wikitext));
    if (bd) index[cacheKey(pageName)] = bd;
  }
  for (const [key, entry] of Object.entries(cache.ages || {})) {
    const bd = normalizeBirthDate(entry.birthDate);
    if (bd && !index[key]) index[key] = bd;
  }
  return index;
}

function lookupBirthDate(player, birthByKey) {
  const keys = new Set([
    cacheKey(player.id),
    cacheKey(player.name),
    ...(player.aliases || []).map(cacheKey),
  ]);
  for (const k of keys) {
    if (k && birthByKey[k]) return birthByKey[k];
  }
  return null;
}

function main() {
  if (!fs.existsSync(CACHE_PATH)) {
    console.error('No cache at', CACHE_PATH);
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  const birthByKey = buildWikitextIndex(cache);
  const { players } = loadTheme('csgo');

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const p of players) {
    const bd = lookupBirthDate(p, birthByKey);
    if (!bd) {
      skipped++;
      continue;
    }

    if (!p.birthDate) {
      applyBirthDate(p, bd);
      added++;
    } else if (p.birthDate !== bd) {
      applyBirthDate(p, bd);
      updated++;
    } else {
      const age = require('./lib/birthdate-utils').computeAge(bd);
      if (age != null) p.age = age;
    }
  }

  saveTheme('csgo', players);
  const withBd = players.filter((p) => p.birthDate).length;
  console.log(`CSGO: birthDate added ${added}, updated ${updated}, still missing ${skipped}`);
  console.log(`With birthDate: ${withBd}/${players.length}`);
  if (skipped > 0) {
    console.log('\nStill missing (not in cache yet):');
    for (const p of players.filter((x) => !x.birthDate)) {
      console.log(`  - ${p.name} (${p.team})`);
    }
  }
}

main();
