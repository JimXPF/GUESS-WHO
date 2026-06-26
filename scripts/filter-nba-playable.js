/**
 * Keep only NBA players whose Hupu detail page has regular-season career data since 2025.
 *
 * Usage:
 *   node scripts/filter-nba-playable.js
 *   node scripts/filter-nba-playable.js --limit 20
 *   node scripts/filter-nba-playable.js --dry-run
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

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();
const DRY_RUN = process.argv.includes('--dry-run');

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
  const targets = LIMIT > 0 ? players.slice(0, LIMIT) : players;

  console.log(`NBA playable filter: checking ${targets.length}/${players.length} players`);
  console.log('Loading Hupu roster URLs...');

  let { allPlayers, page, browser } = await scrapeAllRosters({ keepBrowser: true, quiet: true });

  const urlById = new Map();
  const urlByNormName = new Map();
  for (const r of allPlayers) {
    const slug = r.detailUrl.match(/\/players\/([a-z0-9]+)-\d+\.html/i)?.[1];
    if (slug) urlById.set(slug, r.detailUrl);
    urlByNormName.set(normalizeName(r.name), r.detailUrl);
  }

  const playableIds = new Set();
  const removed = [];
  let fail = 0;
  let consecutiveFails = 0;

  try {
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      const url =
        urlById.get(p.id) ||
        (p.englishName ? urlById.get(toId(p.englishName)) : null) ||
        urlByNormName.get(normalizeName(p.name));

      if (!url) {
        fail++;
        removed.push({ name: p.name, reason: 'no Hupu URL' });
        console.log(`  [${i + 1}/${targets.length}] SKIP ${p.name} — no URL`);
        continue;
      }

      try {
        const detail = await fetchWithRetry(page, url, p.name);
        const ok = detail?.hasCareerSince2025 === true;
        if (ok) {
          playableIds.add(p.id);
          p.hasCareerSince2025 = true;
          if (detail.careerRegularYears?.length) {
            p.careerRegularYears = detail.careerRegularYears;
          }
        } else {
          removed.push({
            name: p.name,
            reason: `no career since 2025 (years: ${(detail?.careerRegularYears || []).join(', ') || 'none'})`,
          });
          p.hasCareerSince2025 = false;
        }
        consecutiveFails = 0;

        if ((i + 1) % 25 === 0 || i === targets.length - 1) {
          console.log(
            `  [${i + 1}/${targets.length}] playable so far: ${playableIds.size}, removed: ${removed.length}`
          );
        }
        await sleep(500);
      } catch (e) {
        fail++;
        consecutiveFails++;
        removed.push({ name: p.name, reason: e.message.slice(0, 80) });
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
    await browser.close().catch(() => {});
  }

  const filtered =
    LIMIT > 0
      ? players.filter((p) => playableIds.has(p.id) || !targets.some((t) => t.id === p.id))
      : players.filter((p) => playableIds.has(p.id));

  console.log(`\nResult: ${filtered.length}/${players.length} playable, ${removed.length} excluded, ${fail} errors`);
  if (removed.length) {
    console.log('\nExcluded sample (first 20):');
    for (const r of removed.slice(0, 20)) {
      console.log(`  - ${r.name}: ${r.reason}`);
    }
  }

  if (!DRY_RUN) {
    saveTheme('nba', filtered);
    console.log(`\nSaved ${filtered.length} players to server/data/nba.json`);
  } else {
    console.log('\nDry run — nba.json not written');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
