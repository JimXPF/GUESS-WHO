/**
 * Add Hupu roster players missing from nba.json (incremental sync, no full rebuild).
 *
 * Usage:
 *   node scripts/sync-nba-missing-roster.js
 *   node scripts/sync-nba-missing-roster.js --limit 10
 *   node scripts/sync-nba-missing-roster.js --dry-run
 */
const { loadTheme, saveTheme } = require('./lib/theme-data');
const {
  scrapeAllRosters,
  fetchPlayerDetail,
  hupuNameToStandard,
  toId,
  slugMatchesId,
  mapTeamZh,
  ageFromBirthday,
  applyTradeOverride,
  buildAliases,
  sleep,
} = require('./lib/hupu-nba');
const { hasCJK, createLookupCache, getManualChineseName } = require('./lib/nba-name-lookup');

const schoolMap = loadTheme('nba').config.schools || {};

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();
const DRY_RUN = process.argv.includes('--dry-run');

function slugFromUrl(url) {
  return url.match(/\/players\/([a-z0-9]+)-\d+\.html/i)?.[1] || null;
}

async function resolveSchool(raw, lookup) {
  if (!raw || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  if (hasCJK(trimmed)) return trimmed;
  const direct = schoolMap[trimmed];
  if (direct) return direct;
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(schoolMap)) {
    if (k.toLowerCase() === lower) return v;
  }
  return lookup.getChineseSchool(trimmed, schoolMap);
}

async function resolveName(zhNameRaw, rosterName, enName, lookup) {
  const fromHupu = hupuNameToStandard(zhNameRaw || rosterName);
  if (hasCJK(fromHupu)) return fromHupu;
  const manual = getManualChineseName(enName || fromHupu || rosterName);
  if (manual) return manual;
  if (enName) {
    const looked = await lookup.getChineseName(enName);
    if (looked && hasCJK(looked)) return hupuNameToStandard(looked);
  }
  return fromHupu;
}

function isKnown(players, roster) {
  const slug = slugFromUrl(roster.detailUrl);
  return players.some((p) => {
    if (slug && slugMatchesId(slug, p.id)) return true;
    if (p.englishName && slugMatchesId(slug, toId(p.englishName))) return true;
    return false;
  });
}

async function buildEntry(roster, detail, lookup) {
  const enName = detail.enName || '';
  const nameStd = await resolveName(detail.zhNameRaw, roster.name, enName, lookup);
  const id = toId(enName) || slugFromUrl(roster.detailUrl);

  let team = mapTeamZh(detail.teamZh) || roster.team;
  team = applyTradeOverride(nameStd, team);

  const school = await resolveSchool(detail.schoolRaw, lookup);

  const entry = {
    id,
    name: nameStd,
    englishName: enName || undefined,
    aliases: buildAliases(nameStd, enName, detail.zhNameRaw || roster.name),
    team,
    height: detail.height ?? undefined,
    school: school ?? undefined,
    draft: detail.draft ?? '落选秀',
    playoffCount: detail.playoffCount ?? 0,
    position: detail.position || 'F',
    hasCareerSince2025: true,
  };

  if (detail.birthday) {
    const { normalizeBirthDate, computeAge } = require('./lib/birthdate-utils');
    const bd = normalizeBirthDate(detail.birthday);
    if (bd) {
      entry.birthDate = bd;
      const age = computeAge(bd);
      if (age != null) entry.age = age;
    }
  } else {
    entry.age = ageFromBirthday(detail.birthday) ?? undefined;
  }

  if (detail.imageUrl) entry.imageUrl = detail.imageUrl;
  if (detail.careerRegularYears?.length) entry.careerRegularYears = detail.careerRegularYears;
  if (detail.currentSeasonGp != null) entry.currentSeasonGp = detail.currentSeasonGp;
  if (detail.maxCareerGpSince2025 != null) entry.maxCareerGpSince2025 = detail.maxCareerGpSince2025;
  if (detail.bestGpSince2025 != null) entry.bestGpSince2025 = detail.bestGpSince2025;
  if (detail.totalGpSince2025 != null) entry.totalGpSince2025 = detail.totalGpSince2025;
  if (detail.careerGpSince2025?.length) entry.careerGpSince2025 = detail.careerGpSince2025;

  return entry;
}

async function main() {
  const { players } = loadTheme('nba');
  console.log(`nba.json: ${players.length} players`);
  console.log('Scraping Hupu rosters...');

  const { allPlayers, page, browser } = await scrapeAllRosters({ keepBrowser: true, quiet: true });
  let missing = allPlayers.filter((r) => !isKnown(players, r));
  console.log(`Missing from nba.json: ${missing.length}/${allPlayers.length}`);

  if (LIMIT > 0) missing = missing.slice(0, LIMIT);

  if (!missing.length) {
    console.log('Nothing to add.');
    await browser.close();
    return;
  }

  const lookup = createLookupCache();
  const added = [];
  let fail = 0;

  try {
    for (let i = 0; i < missing.length; i++) {
      const roster = missing[i];
      try {
        const detail = await fetchPlayerDetail(page, roster.detailUrl);
        const entry = await buildEntry(roster, detail, lookup);
        added.push(entry);
        console.log(`  [${i + 1}/${missing.length}] + ${entry.name} (${entry.team})`);
      } catch (e) {
        fail++;
        console.log(`  FAIL ${roster.name}: ${e.message.slice(0, 60)}`);
      }
      await sleep(320);
    }
  } finally {
    await browser.close();
  }

  const merged = [...players, ...added].sort(
    (a, b) => (a.team || '').localeCompare(b.team || '') || a.name.localeCompare(b.name, 'zh')
  );

  console.log(`\nAdded ${added.length}, failed ${fail}`);
  if (!DRY_RUN && added.length) {
    saveTheme('nba', merged);
    console.log(`Saved ${merged.length} players to server/data/nba.json`);
  } else if (DRY_RUN) {
    console.log('Dry run — not saved');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
