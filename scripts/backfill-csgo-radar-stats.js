/**
 * Fetch 火力雷达图 stats from Wanmei for each CS player (requires wanmeiId).
 * Dimensions: 狙击, 突破, 补枪, 残局, 道具
 *
 * Usage: node scripts/backfill-csgo-radar-stats.js [--limit N] [--only-missing]
 */
const puppeteer = require('puppeteer');
const { sleep, setupPage, openPlayerById, parsePlayerDetail } = require('./lib/wanmei');
const { loadTheme, saveTheme } = require('./lib/theme-data');
const { inferTeamPositions, buildPositionMaps } = require('./lib/csgo-roster-utils');

const RADAR_FIELDS = [
  ['firepowerStat', '火力值'],
  ['gameBreakerStat', '破局'],
  ['sniperStat', '狙击'],
  ['breakthroughStat', '突破'],
  ['tradeStat', '补枪'],
  ['clutchStat', '残局'],
  ['utilityStat', '道具'],
];

function argInt(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isNaN(n) ? fallback : n;
}

function needsBackfill(player, onlyMissing) {
  if (!player.wanmeiId) return false;
  if (!onlyMissing) return true;
  return RADAR_FIELDS.some(([key]) => player[key] == null);
}

async function main() {
  const onlyMissing = process.argv.includes('--only-missing');
  const limit = argInt('--limit', Infinity);

  const theme = loadTheme('csgo');
  const targets = theme.players.filter((p) => needsBackfill(p, onlyMissing));

  console.log(`Radar stat backfill: ${Math.min(targets.length, limit)}/${targets.length} players`);

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
      let touched = false;
      for (const [key] of RADAR_FIELDS) {
        if (detail?.[key] != null) {
          player[key] = detail[key];
          touched = true;
        }
      }
      if (!touched) {
        console.log(`  -- ${player.name}: no radar stats`);
        failed++;
      } else {
        updated++;
        if (updated % 25 === 0 || updated <= 5) {
          console.log(
            `  [${updated}] ${player.name}: 火力${player.firepowerStat ?? '-'} 突破${player.breakthroughStat ?? '-'} 狙击${player.sniperStat ?? '-'}`
          );
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
