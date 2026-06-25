/**
 * Patch CS:GO ages from Liquipedia (conservative, cached).
 *
 * Recommended — browser mode (visits real wiki pages, human-like delays):
 *   npm run patch:csgo:liquipedia -- --only-missing --limit 5 --delay-min 18000 --delay-max 32000
 *
 * API mode (faster, easier to rate-limit):
 *   npm run patch:csgo:liquipedia -- --api --only-missing --limit 5 --delay-min 15000 --delay-max 28000
 *
 * With proxy / VPN:
 *   set LIQUIPEDIA_PROXY=http://127.0.0.1:7890
 *   npm run patch:csgo:liquipedia -- --only-missing --limit 5
 *
 * Flags:
 *   --browser            visit wiki pages with Puppeteer (default)
 *   --api                use MediaWiki API instead of browser
 *   --only-missing       skip players that already have birthDate (or age if no birthDate yet)
 *   --limit N            max network fetches this run (default 5)
 *   --delay MS           fixed delay (sets min=max)
 *   --delay-min MS       random delay lower bound (default 15000 browser / 8000 api)
 *   --delay-max MS       random delay upper bound (default 28000 browser / 12000 api)
 *   --positions-only     re-apply IGL only, no Liquipedia
 */
const {
  setDelayRange,
  fetchPlayerAge,
  randomSleepBetween,
  getProxyUrl,
  LiquipediaBlockedError,
  launchLiquipediaBrowser,
  closeLiquipediaBrowser,
} = require('./lib/liquipedia-csgo');
const { buildPositionMaps, inferTeamPositions } = require('./lib/csgo-roster-utils');
const { loadThemeData, saveThemeData } = require('./lib/image-utils');

function argInt(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isNaN(n) ? fallback : n;
}

function applyPositions(players) {
  const positionMaps = buildPositionMaps([]);
  const byTeam = new Map();
  for (const p of players) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team).push(p);
  }
  for (const roster of byTeam.values()) {
    inferTeamPositions(roster, positionMaps);
  }
}

async function main() {
  const onlyMissing = process.argv.includes('--only-missing');
  const positionsOnly = process.argv.includes('--positions-only');
  const useApi = process.argv.includes('--api');
  const useBrowser = !useApi;
  const mode = useBrowser ? 'browser' : 'api';
  const limit = argInt('--limit', 5);

  const fixedDelay = process.argv.includes('--delay') ? argInt('--delay', 15000) : null;
  const defaultMin = useBrowser ? 15000 : 8000;
  const defaultMax = useBrowser ? 28000 : 12000;
  const delayMin = fixedDelay ?? argInt('--delay-min', defaultMin);
  const delayMax = fixedDelay ?? argInt('--delay-max', defaultMax);
  setDelayRange(delayMin, delayMax);

  const players = loadThemeData('csgo.json');

  if (positionsOnly) {
    applyPositions(players);
    saveThemeData('csgo.json', players);
    console.log('Positions updated (no Liquipedia requests).');
    return;
  }

  const proxy = getProxyUrl();
  console.log(
    `Liquipedia sync: mode=${mode}, limit=${limit}, delay=${delayMin}-${delayMax}ms, onlyMissing=${onlyMissing}`
  );
  console.log(`Proxy: ${proxy || '(direct / system VPN)'}`);
  console.log('Cache: scripts/cache/liquipedia-cache.json\n');

  let browserCtx = null;
  if (useBrowser) {
    try {
      browserCtx = await launchLiquipediaBrowser();
    } catch (err) {
      console.error(`Browser launch failed: ${err.message}`);
      console.error('Try --api mode or check puppeteer install.');
      process.exit(1);
    }
  }

  let ok = 0;
  let fail = 0;
  let requests = 0;

  try {
    for (const player of players) {
      if (onlyMissing && (player.birthDate || player.age != null)) continue;
      if (requests >= limit) {
        console.log(`\nReached --limit ${limit}. Run again later for more.`);
        break;
      }

      try {
        console.log(`  → fetching ${player.name} (${player.team})…`);
        const result = await fetchPlayerAge(player, {
          mode,
          page: browserCtx?.page,
        });
        if (result) {
          player.birthDate = result.birthDate;
          player.age = result.age;
          ok++;
          const fromCache = !!result.cachedAt;
          const via = fromCache ? 'cache' : result.source || mode;
          console.log(`  OK ${player.name} -> ${result.age} (${result.birthDate}, ${via})`);
          if (!fromCache) requests++;
        } else {
          fail++;
          console.log(`  -- ${player.name} (no birth_date)`);
          if (useBrowser) requests++;
        }
      } catch (err) {
        if (err instanceof LiquipediaBlockedError) {
          console.error(`\n[STOP] ${err.message}`);
          console.error('Try: switch VPN/proxy, wait, then --limit 3 --delay-min 25000 --delay-max 40000');
          break;
        }
        fail++;
        console.warn(`  ERR ${player.name}: ${err.message}`);
      }

      await randomSleepBetween();
    }
  } finally {
    await closeLiquipediaBrowser();
  }

  applyPositions(players);
  saveThemeData('csgo.json', players);

  const withAge = players.filter((p) => p.age != null).length;
  console.log('\n=== Done ===');
  console.log(`Ages in bank: ${withAge}/${players.length}`);
  console.log(`This run: ${ok} updated, ${fail} failed, ~${requests} page fetches`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
