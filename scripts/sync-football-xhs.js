/**
 * Rebuild football.json from Xiaohongshu 2026 World Cup data.
 * Flow: standings → team lineup API → player detail API
 * marketValue unit: 万欧元 (e.g. 300 = 300万欧)
 *
 * Usage:
 *   node scripts/sync-football-xhs.js
 *   node scripts/sync-football-xhs.js --limit 3   # first 3 teams only
 */

const { loadTheme, saveTheme } = require('./lib/theme-data');
const {
  launchBrowser,
  setupPage,
  initSession,
  fetchTeams,
  fetchTeamLineup,
  fetchPlayerBase,
  buildAliases,
  refreshPlayerHeaders,
  toId,
  sleep,
} = require('./lib/xhs-worldcup');

const LIMIT_TEAMS = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();

async function main() {
  const browser = await launchBrowser();
  const page = await setupPage(browser);

  try {
    console.log('Step 1: Initializing XHS session & capturing API headers...');
    const captured = await initSession(page);

    let teams = await fetchTeams(page, captured);
    console.log(`Found ${teams.length} teams`);
    if (LIMIT_TEAMS > 0) teams = teams.slice(0, LIMIT_TEAMS);

    const teamNameById = Object.fromEntries(teams.map((t) => [t.teamId, t.teamName]));

    console.log('\nStep 2: Fetching team lineups...');
    const rosterMap = new Map();

    for (let i = 0; i < teams.length; i++) {
      const { teamId, teamName } = teams[i];
      try {
        const { players } = await fetchTeamLineup(page, captured, teamId);
        console.log(`  [${i + 1}/${teams.length}] ${teamName || teamId}: ${players.length} players`);
        for (const p of players) {
          if (!rosterMap.has(p.playerId)) {
            rosterMap.set(p.playerId, { ...p, lineupTeam: teamName || teamNameById[teamId] || '' });
          }
        }
        await sleep(200);
      } catch (e) {
        console.log(`  skip team ${teamId}: ${e.message.slice(0, 60)}`);
      }
    }

    const playerIds = [...rosterMap.keys()];
    console.log(`\nUnique players: ${playerIds.length}`);

    console.log('\nStep 3: Fetching player details...');
    const out = [];
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < playerIds.length; i++) {
      const pid = playerIds[i];
      const lineup = rosterMap.get(pid);

      if (i > 0 && i % 100 === 0) {
        console.log(`  Refreshing player API headers at ${i}/${playerIds.length}...`);
        await refreshPlayerHeaders(page, captured);
      }

      try {
        let detail = await fetchPlayerBase(page, captured, pid);
        if (!detail) {
          await refreshPlayerHeaders(page, captured);
          detail = await fetchPlayerBase(page, captured, pid);
        }
        if (!detail) {
          fail++;
          continue;
        }

        const name = detail.nameZh || lineup.name;
        const enName = detail.nameEn || '';
        const id = toId(enName) || `player-${pid}`;

        const club = lineup.club || detail.club || '';
        const age = lineup.age ?? detail.age ?? 0;

        const entry = {
          id,
          xhsPlayerId: pid,
          name,
          englishName: enName || undefined,
          aliases: buildAliases(name, enName, detail.shortName || lineup.name),
          club,
          nationalTeam: detail.nationalTeam || lineup.lineupTeam || '',
          age,
          marketValue: detail.marketValue,
          height: detail.height || 0,
          position: detail.position || lineup.position,
        };

        const img = detail.imageUrl || lineup.imageUrl;
        if (img) entry.imageUrl = img;

        out.push(entry);
        ok++;
        if ((i + 1) % 50 === 0 || i === playerIds.length - 1) {
          console.log(`  [${i + 1}/${playerIds.length}] ${name} (${entry.nationalTeam}) ${entry.marketValue}万欧元`);
        }
      } catch (e) {
        fail++;
        if (fail <= 5) console.log(`  FAIL ${pid}: ${e.message.slice(0, 50)}`);
      }
      await sleep(150);
    }

    const deduped = [];
    const seen = new Set();
    for (const p of out) {
      let id = p.id;
      if (seen.has(id)) id = `${id}-${p.nationalTeam}`;
      p.id = id;
      seen.add(id);
      deduped.push(p);
    }

    deduped.sort(
      (a, b) =>
        (a.nationalTeam || '').localeCompare(b.nationalTeam || '', 'zh') ||
        a.name.localeCompare(b.name, 'zh')
    );

    saveTheme('football', deduped, { ageReferenceYear: 2026 });

    console.log(`\nDone. Written ${deduped.length} players (${ok} ok, ${fail} failed).`);
    console.log(`  With images: ${deduped.filter((p) => p.imageUrl).length}`);
    console.log(`  With height: ${deduped.filter((p) => p.height).length}`);
    console.log(`  marketValue unit: 万欧元`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
