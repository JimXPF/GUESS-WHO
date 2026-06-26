/** Patch a single team's roster from wanmei. Usage: node scripts/patch-csgo-team.js 3DMAX */
const puppeteer = require('puppeteer');
const {
  sleep,
  setupPage,
  searchAndOpenTeam,
  parseActiveRoster,
  searchAndOpenPlayer,
  parsePlayerDetail,
  normalizeImageUrl,
} = require('./lib/wanmei');
const {
  buildPositionMaps,
  inferTeamPositions,
  positionToZh,
  toPlayerId,
} = require('./lib/csgo-roster-utils');
const { loadThemeData, saveThemeData } = require('./lib/image-utils');

const teamQuery = process.argv[2] || '3DMAX';

function mergeEntry(scraped, existing, teamName) {
  const id = toPlayerId(scraped.name);
  return {
    id,
    name: scraped.name,
    aliases: [...new Set([...(existing?.aliases || []), scraped.name, id])],
    team: teamName,
    nationality: scraped.nationality || existing?.nationality || '未知',
    rating: scraped.rating ?? existing?.rating ?? null,
    top20Count: scraped.top20Count ?? existing?.top20Count ?? 0,
    position: positionToZh(scraped.position || 'Rifler'),
    ...(scraped.top20Summary ? { top20Summary: scraped.top20Summary } : {}),
    ...(scraped.sniperStat != null ? { sniperStat: scraped.sniperStat } : existing?.sniperStat != null ? { sniperStat: existing.sniperStat } : {}),
    ...(scraped.wanmeiId ? { wanmeiId: scraped.wanmeiId } : {}),
    ...(existing?.age != null ? { age: existing.age } : {}),
    ...(existing?.birthDate ? { birthDate: existing.birthDate } : {}),
    imageUrl: normalizeImageUrl(scraped.src) || existing?.imageUrl,
  };
}

async function fetchPlayer(page, nick, existingByNick, teamName) {
  const existing = existingByNick.get(nick.toLowerCase());
  if (existing?.wanmeiId) {
    await page.goto(`https://data.wanmei.com/csgo/players/${existing.wanmeiId}`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await sleep(1200);
  } else if (!(await searchAndOpenPlayer(page, nick))) {
    console.warn(`  [WARN] not found: ${nick}`);
    return null;
  }
  const detail = await parsePlayerDetail(page);
  if (!detail?.name) return null;
  detail.team = teamName;
  return mergeEntry(detail, existing, teamName);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await setupPage(page);

  const all = loadThemeData('csgo.json');
  const existingByNick = new Map();
  for (const p of all) {
    existingByNick.set(p.name.toLowerCase(), p);
    existingByNick.set(p.id, p);
  }

  console.log(`[TEAM] ${teamQuery}`);
  if (!(await searchAndOpenTeam(page, teamQuery))) {
    console.error('Team not found');
    process.exit(1);
  }

  const teamName =
    (await page.evaluate(() => document.querySelector('h1')?.textContent?.trim())) || teamQuery;
  const roster = await parseActiveRoster(page);
  console.log(`Roster: ${roster.join(', ')}`);

  const players = [];
  for (const nick of roster) {
    const entry = await fetchPlayer(page, nick, existingByNick, teamName);
    if (entry) {
      players.push(entry);
      console.log(`  OK ${entry.name} R ${entry.rating} wanmeiId ${entry.wanmeiId}`);
    }
    await sleep(450);
  }

  inferTeamPositions(players, buildPositionMaps([]));

  const rosterIds = new Set(players.map((p) => p.id));
  const updated = [
    ...all.filter((p) => p.team !== teamName),
    ...players,
  ].sort((a, b) => {
    const t = a.team.localeCompare(b.team, 'zh-CN');
    return t !== 0 ? t : a.name.localeCompare(b.name);
  });

  saveThemeData('csgo.json', updated);
  await browser.close();

  const removed = all.filter((p) => p.team === teamName && !rosterIds.has(p.id));
  console.log(`\nUpdated ${teamName}: ${players.length} players`);
  if (removed.length) console.log(`Removed: ${removed.map((p) => p.name).join(', ')}`);
  console.log(`IGL: ${players.find((p) => String(p.position).includes('指挥'))?.name || 'none'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
