/**
 * Fetch 2025+ games played (常规赛+季后赛) from Hupu into nba.json.
 *
 * Writes per player: currentSeasonGp, careerGpSince2025, maxCareerGpSince2025, bestGpSince2025
 *
 * Usage:
 *   node scripts/backfill-nba-games-since-2025.js
 *   node scripts/backfill-nba-games-since-2025.js --limit 30
 *   node scripts/backfill-nba-games-since-2025.js --dry-run
 *   node scripts/backfill-nba-games-since-2025.js --all-roster
 *   node scripts/backfill-nba-games-since-2025.js --force
 */
const { loadTheme, saveTheme } = require('./lib/theme-data');
const {
  scrapeAllRosters,
  fetchPlayerDetail,
  launchBrowser,
  setupPage,
  toId,
  normalizeSlug,
  normalizeName,
  sleep,
} = require('./lib/hupu-nba');

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();
const DRY_RUN = process.argv.includes('--dry-run');
const ALL_ROSTER = process.argv.includes('--all-roster');
const FORCE = process.argv.includes('--force');

function bucketGp(gp) {
  if (gp == null) return '无数据';
  if (gp === 0) return '0';
  if (gp <= 5) return '1-5';
  if (gp <= 10) return '6-10';
  if (gp <= 20) return '11-20';
  if (gp <= 40) return '21-40';
  return '41+';
}

function buildHistogram(values) {
  const hist = {};
  for (const v of values) {
    const b = bucketGp(v);
    hist[b] = (hist[b] || 0) + 1;
  }
  return hist;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function fetchWithRetry(page, url, name, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchPlayerDetail(page, url);
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      await sleep(3000 * attempt);
    }
  }
  return null;
}

async function main() {
  const { players } = loadTheme('nba');
  let targets = LIMIT > 0 ? players.slice(0, LIMIT) : players;

  if (!FORCE) {
    const before = targets.length;
    targets = targets.filter((p) => p.totalGpSince2025 == null);
    console.log(`Skipping ${before - targets.length} already backfilled (use --force to redo)`);
  }

  console.log(`NBA games backfill: ${targets.length} players to fetch`);
  if (targets.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  console.log('Loading Hupu roster URLs...');

  let { allPlayers, page, browser } = await scrapeAllRosters({ keepBrowser: true, quiet: true });

  const urlById = new Map();
  const urlByNormName = new Map();
  for (const r of allPlayers) {
    const slug = r.detailUrl.match(/\/players\/([a-z0-9]+)-\d+\.html/i)?.[1];
    if (slug) {
      urlById.set(slug, r.detailUrl);
      urlById.set(normalizeSlug(slug), r.detailUrl);
    }
    urlByNormName.set(normalizeName(r.name), r.detailUrl);
  }

  if (ALL_ROSTER) {
    console.log(`--all-roster: extending to ${allPlayers.length} Hupu roster entries`);
    const existingIds = new Set(targets.map((p) => p.id));
    for (const r of allPlayers) {
      const slug = r.detailUrl.match(/\/players\/([a-z0-9]+)-\d+\.html/i)?.[1];
      const id = slug || toId(r.name);
      if (existingIds.has(id)) continue;
      targets.push({
        id,
        name: r.name,
        _rosterOnly: true,
      });
      existingIds.add(id);
    }
    if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  }

  const rows = [];
  let fail = 0;
  let consecutiveFails = 0;

  const saveProgress = () => {
    if (DRY_RUN) return;
    saveTheme('nba', players);
  };

  try {
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      const url =
        urlById.get(p.id) ||
        urlById.get(normalizeSlug(p.id)) ||
        (p.englishName ? urlById.get(toId(p.englishName)) : null) ||
        (p.englishName ? urlById.get(normalizeSlug(toId(p.englishName))) : null) ||
        urlByNormName.get(normalizeName(p.name));

      if (!url) {
        fail++;
        rows.push({ id: p.id, name: p.name, error: 'no URL' });
        continue;
      }

      try {
        const detail = await fetchWithRetry(page, url, p.name);
        if (!p._rosterOnly && detail) {
          p.currentSeasonGp = detail.currentSeasonGp ?? undefined;
          p.maxCareerGpSince2025 = detail.maxCareerGpSince2025 ?? undefined;
          p.bestGpSince2025 = detail.bestGpSince2025 ?? undefined;
          p.totalGpSince2025 = detail.totalGpSince2025 ?? undefined;
          if (detail.careerGpSince2025?.length) {
            p.careerGpSince2025 = detail.careerGpSince2025;
          }
        }

        const row = {
          id: p.id,
          name: p.name,
          team: p.team,
          currentSeasonGp: detail?.currentSeasonGp ?? null,
          maxCareerGpSince2025: detail?.maxCareerGpSince2025 ?? null,
          bestGpSince2025: detail?.bestGpSince2025 ?? null,
          totalGpSince2025: detail?.totalGpSince2025 ?? null,
          careerGpSince2025: detail?.careerGpSince2025 ?? [],
          hasCareerSince2025: detail?.hasCareerSince2025 === true,
        };
        rows.push(row);

        consecutiveFails = 0;
        if ((i + 1) % 25 === 0 || i === targets.length - 1) {
          console.log(`  [${i + 1}/${targets.length}] latest: ${p.name} bestGp=${row.bestGpSince2025 ?? '—'}`);
        }
        if ((i + 1) % 10 === 0) saveProgress();
        await sleep(500);
      } catch (e) {
        fail++;
        consecutiveFails++;
        rows.push({ id: p.id, name: p.name, error: e.message.slice(0, 80) });
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

  const withGp = rows.filter((r) => r.totalGpSince2025 != null).map((r) => r.totalGpSince2025);
  const sorted = [...withGp].sort((a, b) => a - b);

  const audit = {
    updatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    withData: withGp.length,
    failed: fail,
    histogramTotalGp: buildHistogram(withGp),
    histogramBestGp: buildHistogram(rows.map((r) => r.bestGpSince2025)),
    histogramCurrentSeason: buildHistogram(rows.map((r) => r.currentSeasonGp)),
    statsTotalGp: {
      min: sorted[0] ?? null,
      max: sorted[sorted.length - 1] ?? null,
      median: percentile(sorted, 50),
      p25: percentile(sorted, 25),
      p75: percentile(sorted, 75),
      p90: percentile(sorted, 90),
      mean: withGp.length
        ? Math.round((withGp.reduce((a, b) => a + b, 0) / withGp.length) * 10) / 10
        : null,
    },
    zeroTotalGp: rows.filter((r) => r.totalGpSince2025 === 0).length,
    oneToFiveTotalGp: rows.filter((r) => r.totalGpSince2025 != null && r.totalGpSince2025 <= 5).length,
  };

  console.log('\n=== totalGpSince2025 总场数分布 ===');
  for (const [k, v] of Object.entries(audit.histogramTotalGp)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('\n总场数统计:', audit.statsTotalGp);
  console.log(`0 场: ${audit.zeroTotalGp}, ≤5 场: ${audit.oneToFiveTotalGp}`);
  if (!DRY_RUN) console.log('\n已更新 server/data/nba.json 中的场次字段');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
