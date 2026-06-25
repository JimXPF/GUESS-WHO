/**
 * Patch NBA players missing proper Chinese names (e.g. "Koa Peat" → 科阿·皮特).
 *
 * Usage:
 *   node scripts/patch-nba-chinese-names.js
 *   node scripts/patch-nba-chinese-names.js --dry-run
 */
const { hasCJK, createLookupCache, getManualChineseName, tradToSimp } = require('./lib/nba-name-lookup');
const { hupuNameToStandard, buildAliases } = require('./lib/hupu-nba');
const { loadTheme, saveTheme } = require('./lib/theme-data');
const DRY = process.argv.includes('--dry-run');

function needsChineseName(entry) {
  const name = String(entry.name || '').trim();
  if (!name) return true;
  if (!hasCJK(name)) return true;
  if (entry.englishName && name === entry.englishName) return true;
  return false;
}

(async () => {
  const { players: data } = loadTheme('nba');
  const lookup = createLookupCache();
  let patched = 0;

  for (const p of data) {
    if (!needsChineseName(p)) continue;

    const en = p.englishName || p.name;
    let zh = hasCJK(p.name) ? p.name : null;
    if (!zh) zh = getManualChineseName(en);
    if (!zh || !hasCJK(zh)) {
      const looked = await lookup.getChineseName(en);
      if (looked && hasCJK(looked)) zh = hupuNameToStandard(tradToSimp(looked));
    }

    if (!zh || !hasCJK(zh)) {
      console.log(`  skip (no zh): ${p.name} / ${en}`);
      continue;
    }

    if (p.name === zh) continue;

    console.log(`  ${p.name || en} → ${zh}`);
    if (!DRY) {
      const oldName = p.name;
      p.name = zh;
      p.aliases = buildAliases(zh, en, oldName);
    }
    patched++;
  }

  if (!DRY && patched) {
    saveTheme('nba', data);
  }
  console.log(`\n${DRY ? 'Would patch' : 'Patched'} ${patched} players.`);
})();
