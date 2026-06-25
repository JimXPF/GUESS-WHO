/**
 * Sync CS:GO question bank from Perfect World (完美世界) data center.
 * - Team ranking: https://data.wanmei.com/csgo/teams (HLTV Tab, TOP 30)
 * - Player detail: https://data.wanmei.com/csgo/players/{id}
 *
 * Usage: node scripts/sync-csgo-rosters-wanmei.js
 */
const puppeteer = require('puppeteer');
const {
  sleep,
  setupPage,
  collectHltvTopTeamNames,
  searchAndOpenTeam,
  parseActiveRoster,
  searchAndOpenPlayer,
  openPlayerById,
  parsePlayerDetail,
  normalizeImageUrl,
} = require('./lib/wanmei');
const {
  buildPositionMaps,
  inferTeamPositions,
  positionToZh,
} = require('./lib/csgo-roster-utils');
const { loadThemeData, saveThemeData } = require('./lib/image-utils');

const TOP_TEAMS = 30;

function normalizeKey(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, '');
}

function toPlayerId(nick) {
  return nick.toLowerCase().replace(/\s+/g, '');
}

function buildExistingMaps(data) {
  const byId = new Map();
  const byNick = new Map();
  for (const entry of data) {
    byId.set(normalizeKey(entry.id), entry);
    byNick.set(normalizeKey(entry.name), entry);
    for (const a of entry.aliases || []) {
      byNick.set(normalizeKey(a), entry);
    }
  }
  return { byId, byNick };
}

function mergeAliases(existing, nick, reuseExisting) {
  const aliases = new Set([nick]);
  aliases.add(toPlayerId(nick));
  if (reuseExisting && existing) {
    for (const a of existing.aliases || []) aliases.add(a);
    if (existing.name) aliases.add(existing.name);
    if (existing.id) aliases.add(existing.id);
  }
  return [...aliases];
}

function isSamePlayer(existing, scrapedName) {
  if (!existing) return false;
  const scrapedKey = normalizeKey(scrapedName);
  const scrapedId = normalizeKey(toPlayerId(scrapedName));
  const keys = new Set([
    normalizeKey(existing.id),
    normalizeKey(existing.name),
    ...(existing.aliases || []).map(normalizeKey),
  ]);
  return keys.has(scrapedKey) || keys.has(scrapedId);
}

function mergeEntry(scraped, existing, teamFallback) {
  const reuseExisting = isSamePlayer(existing, scraped.name);
  const id = reuseExisting && existing?.id ? existing.id : toPlayerId(scraped.name);
  const imageUrl = normalizeImageUrl(scraped.src) || existing?.imageUrl;

  const entry = {
    id,
    name: scraped.name,
    aliases: mergeAliases(reuseExisting ? existing : null, scraped.name, reuseExisting),
    team: scraped.team || teamFallback || existing?.team || '未知',
    nationality:
      scraped.nationality && scraped.nationality !== '-'
        ? scraped.nationality
        : existing?.nationality || '未知',
    rating: scraped.rating ?? existing?.rating ?? null,
    top20Count: scraped.top20Count ?? existing?.top20Count ?? 0,
    position: positionToZh(scraped.position || existing?.position || 'Rifler'),
  };

  if (scraped.top20Summary) entry.top20Summary = scraped.top20Summary;
  else if (reuseExisting && existing?.top20Summary) entry.top20Summary = existing.top20Summary;

  if (scraped.wanmeiId) entry.wanmeiId = scraped.wanmeiId;
  else if (reuseExisting && existing?.wanmeiId) entry.wanmeiId = existing.wanmeiId;

  if (reuseExisting && existing?.displayName) entry.displayName = existing.displayName;
  if (reuseExisting && existing?.age != null) entry.age = existing.age;
  if (reuseExisting && existing?.birthDate) entry.birthDate = existing.birthDate;
  if (imageUrl) entry.imageUrl = imageUrl;
  return entry;
}

async function fetchPlayer(page, nick, existingMaps, teamFallback, wanmeiIdHint) {
  let opened = false;
  if (wanmeiIdHint) {
    opened = await openPlayerById(page, wanmeiIdHint);
  }
  if (!opened) {
    opened = await searchAndOpenPlayer(page, nick);
  }
  if (!opened) {
    console.log(`    [WARN] player page not found: ${nick}`);
    return null;
  }

  const detail = await parsePlayerDetail(page);
  if (!detail?.name) return null;

  if (teamFallback) detail.team = teamFallback;

  const existing =
    existingMaps.byId.get(normalizeKey(toPlayerId(detail.name))) ||
    existingMaps.byNick.get(normalizeKey(detail.name)) ||
    existingMaps.byNick.get(normalizeKey(nick));

  const matched = existing && isSamePlayer(existing, detail.name) ? existing : null;
  return mergeEntry(detail, matched, teamFallback);
}

async function syncTeam(page, teamQuery, existingMaps, positionMaps) {
  console.log(`\n[TEAM] ${teamQuery}`);
  const opened = await searchAndOpenTeam(page, teamQuery);
  if (!opened) {
    console.log('  -> team page not found');
    return [];
  }

  const teamTitle = await page.evaluate(() => {
    return (
      document.querySelector('h1')?.textContent?.trim() ||
      document.title.split('|')[0]?.trim() ||
      null
    );
  });

  const roster = await parseActiveRoster(page);
  if (!roster.length) {
    console.log('  -> no active roster (首发)');
    return [];
  }

  console.log(`  -> ${teamTitle || teamQuery}: ${roster.join(', ')}`);

  const players = [];
  for (const nick of roster) {
    const existing =
      existingMaps.byNick.get(normalizeKey(nick)) ||
      existingMaps.byId.get(normalizeKey(toPlayerId(nick)));
    const entry = await fetchPlayer(
      page,
      nick,
      existingMaps,
      teamTitle || teamQuery,
      existing?.wanmeiId
    );
    if (entry) {
      players.push(entry);
      console.log(
        `    OK ${entry.name} | ${entry.team} | ${entry.nationality} | R ${entry.rating ?? '-'} | TOP20 ${entry.top20Count} | ${entry.position}`
      );
    }
    await sleep(450);
  }

  inferTeamPositions(players, positionMaps);
  return players;
}

async function main() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch {
    console.error('Run: npm install puppeteer --save-dev');
    process.exit(1);
  }

  const existing = loadThemeData('csgo.json');
  const existingMaps = buildExistingMaps(existing);
  const positionMaps = buildPositionMaps([]);
  const page = await browser.newPage();
  await setupPage(page);

  console.log(`Collecting HLTV TOP ${TOP_TEAMS} teams from wanmei...`);
  const teamQueries = await collectHltvTopTeamNames(page, TOP_TEAMS);
  console.log(`Teams: ${teamQueries.join(', ')}`);

  const allPlayers = [];
  const seenIds = new Set();

  for (const teamQuery of teamQueries) {
    const players = await syncTeam(page, teamQuery, existingMaps, positionMaps);
    for (const p of players) {
      const key = normalizeKey(p.id);
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      allPlayers.push(p);
    }
    await sleep(500);
  }

  allPlayers.sort((a, b) => {
    const teamCmp = a.team.localeCompare(b.team, 'zh-CN');
    if (teamCmp !== 0) return teamCmp;
    return a.name.localeCompare(b.name);
  });

  saveThemeData('csgo.json', allPlayers);
  await browser.close();

  const withImage = allPlayers.filter((p) => p.imageUrl).length;
  const withRating = allPlayers.filter((p) => p.rating != null).length;
  const withTop20 = allPlayers.filter((p) => p.top20Count > 0).length;
  const teams = new Set(allPlayers.map((p) => p.team)).size;

  console.log('\n=== Sync complete (wanmei) ===');
  console.log(`Players: ${allPlayers.length}`);
  console.log(`Teams: ${teams}`);
  console.log(`With rating: ${withRating}/${allPlayers.length}`);
  console.log(`With TOP 20: ${withTop20}/${allPlayers.length}`);
  console.log(`With images: ${withImage}/${allPlayers.length}`);
  console.log(`Previous bank: ${existing.length} players`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
