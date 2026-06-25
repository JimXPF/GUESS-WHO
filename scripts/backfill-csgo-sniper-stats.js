/**
 * Fetch 狙击 radar stat from Wanmei for each CS:GO player (requires wanmeiId).
 * Usage: node scripts/backfill-csgo-sniper-stats.js [--limit N] [--only-missing]
 */
const puppeteer = require('puppeteer');
const { sleep, setupPage, openPlayerById, parsePlayerDetail } = require('./lib/wanmei');
const { loadTheme, saveTheme } = require('./lib/theme-data');
const { inferTeamPositions, buildPositionMaps } = require('./lib/csgo-roster-utils');

function argInt(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isNaN(n) ? fallback : n;
}

async function main() {
  const onlyMissing = process.argv.includes('--only-missing');
  const limit = argInt('--limit', Infinity);

  const theme = loadTheme('csgo');
  const targets = theme.players.filter((p) => {
    if (!p.wanmeiId) return false;
    if (onlyMissing && p.sniperStat != null) return false;
    return true;
  });

  console.log(`Sniper stat backfill: ${Math.min(targets.length, limit)}/${targets.length} players`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await setupPage(page);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < targets.length && updated + failed < limit; i++) {
    const player = targets[i];
    try {
      const ok = await openPlayerById(page, player.wanmeiId);
      if (!ok) {
        console.log(`  FAIL ${player.name}: page not found`);
        failed++;
        continue;
      }
      const detail = await parsePlayerDetail(page);
      if (detail?.sniperStat == null) {
        console.log(`  -- ${player.name}: no 狙击 stat`);
        failed++;
      } else {
        player.sniperStat = detail.sniperStat;
        updated++;
        if (updated % 25 === 0 || updated <= 5) {
          console.log(`  [${updated}] ${player.name} (${player.team}) -> ${detail.sniperStat}`);
        }
      }
    } catch (err) {
      console.log(`  FAIL ${player.name}: ${err.message}`);
      failed++;
    }
    await sleep(400);
  }

  await browser.close();

  const byTeam = new Map();
  for (const p of theme.players) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team).push(p);
  }
  for (const roster of byTeam.values()) {
    inferTeamPositions(roster, buildPositionMaps([]));
  }

  saveTheme('csgo', theme.players);
  console.log(`\nDone: ${updated} updated, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
