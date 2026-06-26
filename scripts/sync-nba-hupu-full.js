/**
 * Full rebuild of nba.json from Hupu:
 * 1. Scrape all team rosters (~525 players) — only Hupu players kept
 * 2. Fetch each player detail page for bio, position, image, playoff count
 * 3. Overlay known 2026 offseason trades
 * 4. Look up Chinese names / school translations when needed
 *
 * Usage:
 *   node scripts/sync-nba-hupu-full.js
 *   node scripts/sync-nba-hupu-full.js --limit 20   # test first N players
 */

const {
  scrapeAllRosters,
  fetchPlayerDetail,
  hupuNameToStandard,
  toId,
  mapTeamZh,
  ageFromBirthday,
  applyTradeOverride,
  buildAliases,
  sleep,
} = require('./lib/hupu-nba');
const { hasCJK, createLookupCache, getManualChineseName } = require('./lib/nba-name-lookup');
const { loadTheme, saveTheme } = require('./lib/theme-data');

const schoolMap = loadTheme('nba').meta.schools || {};

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();

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

async function main() {
  console.log('Step 1: Scraping Hupu team rosters...\n');
  const { allPlayers, page, browser } = await scrapeAllRosters({ keepBrowser: true });
  console.log(`\nUnique players on Hupu: ${allPlayers.length}`);

  const targets = LIMIT > 0 ? allPlayers.slice(0, LIMIT) : allPlayers;
  console.log(`\nStep 2: Fetching player detail pages (${targets.length})...\n`);

  const lookup = createLookupCache();
  const out = [];
  let ok = 0;
  let fail = 0;
  let nameLookups = 0;
  let schoolLookups = 0;

  for (let i = 0; i < targets.length; i++) {
    const roster = targets[i];
    try {
      const detail = await fetchPlayerDetail(page, roster.detailUrl);
      const enName = detail.enName || '';
      let nameStd = await resolveName(detail.zhNameRaw, roster.name, enName, lookup);
      if (!hasCJK(nameStd) && enName) {
        nameLookups++;
        console.log(`  [name lookup] ${enName} → ${nameStd || '(failed)'}`);
      }

      const id = toId(enName) || roster.detailUrl.match(/\/players\/([a-z0-9]+)-\d+\.html/i)?.[1];

      let team = mapTeamZh(detail.teamZh) || roster.team;
      team = applyTradeOverride(nameStd, team);

      let school = await resolveSchool(detail.schoolRaw, lookup);
      if (detail.schoolRaw && !hasCJK(detail.schoolRaw) && school === detail.schoolRaw.trim()) {
        schoolLookups++;
      }

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

      if (!detail.hasCareerSince2025) {
        console.log(`  skip (no 2025+ career): ${nameStd}`);
        continue;
      }
      entry.hasCareerSince2025 = true;
      if (detail.careerRegularYears?.length) {
        entry.careerRegularYears = detail.careerRegularYears;
      }
      if (detail.currentSeasonGp != null) entry.currentSeasonGp = detail.currentSeasonGp;
      if (detail.maxCareerGpSince2025 != null) {
        entry.maxCareerGpSince2025 = detail.maxCareerGpSince2025;
      }
      if (detail.bestGpSince2025 != null) entry.bestGpSince2025 = detail.bestGpSince2025;
      if (detail.totalGpSince2025 != null) entry.totalGpSince2025 = detail.totalGpSince2025;
      if (detail.careerGpSince2025?.length) {
        entry.careerGpSince2025 = detail.careerGpSince2025;
      }

      out.push(entry);
      ok++;
      if ((i + 1) % 25 === 0 || i === targets.length - 1) {
        console.log(
          `  [${i + 1}/${targets.length}] latest: ${nameStd} (${team}) ${entry.height}cm ${entry.position} PO=${entry.playoffCount}`
        );
      }
    } catch (e) {
      fail++;
      console.log(`  FAIL ${roster.name}: ${e.message.slice(0, 60)}`);
    }
    await sleep(320);
  }

  await browser.close();

  const deduped = [];
  const seenIds = new Set();
  for (const p of out) {
    let id = p.id;
    if (!id || seenIds.has(id)) {
      id = `${id || 'player'}-${deduped.length}`;
      p.id = id;
    }
    seenIds.add(id);
    deduped.push(p);
  }

  deduped.sort((a, b) => (a.team || '').localeCompare(b.team || '') || a.name.localeCompare(b.name, 'zh'));

  saveTheme('nba', deduped);

  console.log(`\nDone.`);
  console.log(`  Written: ${deduped.length} players`);
  console.log(`  Detail OK: ${ok}, failed: ${fail}`);
  console.log(`  Name lookups: ${nameLookups}, school web lookups: ${schoolLookups}`);
  console.log(`  With images: ${deduped.filter((p) => p.imageUrl).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
