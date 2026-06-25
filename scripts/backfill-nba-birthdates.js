/**
 * Backfill birthDate for nba.json from Hupu player pages.
 *
 * Usage:
 *   node scripts/backfill-nba-birthdates.js
 *   node scripts/backfill-nba-birthdates.js --only-missing
 *   node scripts/backfill-nba-birthdates.js --limit 20
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
const { applyBirthDate } = require('./lib/birthdate-utils');

const ONLY_MISSING = process.argv.includes('--only-missing');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();

async function fetchWithRetry(page, url, name, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchPlayerDetail(page, url);
    } catch (e) {
      const msg = e.message.slice(0, 80);
      if (attempt === maxAttempts) throw e;
      console.log(`  retry ${attempt}/${maxAttempts - 1} ${name}: ${msg}`);
      await sleep(3000 * attempt);
    }
  }
  return null;
}

async function main() {
  const { players } = loadTheme('nba');
  const targets = ONLY_MISSING ? players.filter((p) => !p.birthDate) : players;
  const slice = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

  console.log(
    `NBA backfill: ${slice.length}/${players.length} players (${ONLY_MISSING ? 'missing only' : 'all'})`
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

  let ok = 0;
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
        if (!detail?.birthday) {
          fail++;
          consecutiveFails++;
          console.log(`  [${i + 1}/${slice.length}] NO DATE ${p.name}`);
        } else if (applyBirthDate(p, detail.birthday)) {
          ok++;
          consecutiveFails = 0;
          if ((i + 1) % 25 === 0 || i === slice.length - 1) {
            console.log(`  [${i + 1}/${slice.length}] ${p.name} -> ${p.birthDate} (age ${p.age})`);
          }
        } else {
          fail++;
          consecutiveFails++;
        }

        if ((i + 1) % 10 === 0) saveProgress();

        // Restart browser after many timeouts (stale session)
        if (consecutiveFails >= 8) {
          console.log('  Restarting browser after repeated failures...');
          await browser.close().catch(() => {});
          browser = await launchBrowser();
          page = await setupPage(browser);
          consecutiveFails = 0;
          await sleep(5000);
        } else {
          await sleep(600);
        }
      } catch (e) {
        fail++;
        consecutiveFails++;
        console.log(`  FAIL ${p.name}: ${e.message.slice(0, 60)}`);
      }
    }
  } finally {
    saveProgress();
    await browser.close().catch(() => {});
  }

  const withBd = players.filter((p) => p.birthDate).length;
  console.log(`\nNBA done: filled ${ok}, failed ${fail}`);
  console.log(`With birthDate: ${withBd}/${players.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
