/**
 * Backfill playoffCount for all NBA players from Hupu career playoff stats.
 * Counts unique seasons with playoff data; excludes 汇总 rows and duplicate years.
 *
 * Usage:
 *   node scripts/backfill-nba-playoff-counts.js
 *   node scripts/backfill-nba-playoff-counts.js --only-zero
 *   node scripts/backfill-nba-playoff-counts.js --limit 20
 */
const { loadTheme, saveTheme } = require('./lib/theme-data');
const {
  scrapeAllRosters,
  fetchPlayerDetail,
  launchBrowser,
  setupPage,
  toId,
  normalizeName,
  sleep,
} = require('./lib/hupu-nba');

const ONLY_ZERO = process.argv.includes('--only-zero');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();

async function fetchWithRetry(page, url, name, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchPlayerDetail(page, url);
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      console.log(`  retry ${attempt}/${maxAttempts - 1} ${name}: ${e.message.slice(0, 60)}`);
      await sleep(3000 * attempt);
    }
  }
  return null;
}

async function main() {
  const { players } = loadTheme('nba');
  const targets = ONLY_ZERO ? players.filter((p) => !p.playoffCount) : players;
  const slice = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

  console.log(
    `NBA playoff backfill: ${slice.length}/${players.length} players (${ONLY_ZERO ? 'zero only' : 'all'})`
  );
  console.log('Loading Hupu roster URLs...');

  let { allPlayers, page, browser } = await scrapeAllRosters({ keepBrowser: true, quiet: true });

  const urlById = new Map();
  const urlByNormName = new Map();
  for (const r of allPlayers) {
    const slug = r.detailUrl.match(/\/players\/([a-z0-9]+)-\d+\.html/i)?.[1];
    if (slug) urlById.set(slug, r.detailUrl);
    urlByNormName.set(normalizeName(r.name), r.detailUrl);
  }

  let updated = 0;
  let fail = 0;
  let consecutiveFails = 0;

  const saveProgress = () => saveTheme('nba', players);

  try {
    for (let i = 0; i < slice.length; i++) {
      const p = slice[i];
      const url =
        urlById.get(p.id) ||
        (p.englishName ? urlById.get(toId(p.englishName)) : null) ||
        urlByNormName.get(normalizeName(p.name));

      if (!url) {
        fail++;
        console.log(`  [${i + 1}/${slice.length}] SKIP ${p.name} — no Hupu URL`);
        continue;
      }

      try {
        const detail = await fetchWithRetry(page, url, p.name);
        const count = detail?.playoffCount ?? 0;
        const prev = p.playoffCount ?? 0;
        p.playoffCount = count;
        if (count !== prev) updated++;
        consecutiveFails = 0;

        if ((i + 1) % 25 === 0 || i === slice.length - 1 || count !== prev) {
          if (count !== prev || (i + 1) % 25 === 0) {
            console.log(
              `  [${i + 1}/${slice.length}] ${p.name}: ${prev} -> ${count}${count !== prev ? ' *' : ''}`
            );
          }
        }

        if ((i + 1) % 10 === 0) saveProgress();
        await sleep(500);
      } catch (e) {
        fail++;
        consecutiveFails++;
        console.log(`  FAIL ${p.name}: ${e.message.slice(0, 60)}`);

        if (consecutiveFails >= 8) {
          console.log('  Restarting browser...');
          await browser.close().catch(() => {});
          browser = await launchBrowser();
          page = await setupPage(browser);
          consecutiveFails = 0;
          await sleep(5000);
        }
      }
    }
  } finally {
    saveProgress();
    await browser.close().catch(() => {});
  }

  const nonzero = players.filter((p) => p.playoffCount > 0).length;
  console.log(`\nDone: ${updated} changed, ${fail} failed`);
  console.log(`With playoffCount > 0: ${nonzero}/${players.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
