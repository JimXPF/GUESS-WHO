/**
 * Xiaohongshu 2026 World Cup API helpers (via Puppeteer + signed headers).
 */

const puppeteer = require('puppeteer');

const COMPETITION_ID = 1;
const SEASON_ID = 13776;
const STANDINGS_URL = 'https://www.xiaohongshu.com/worldcup26/fixtures?wcup_tab=standings';
const SAMPLE_TEAM_URL = 'https://www.xiaohongshu.com/worldcup26/team/11764';
const SAMPLE_PLAYER_URL = 'https://www.xiaohongshu.com/worldcup26/player/40599';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POSITION_MAP = {
  G: '守门员',
  D: '后卫',
  M: '中场',
  F: '前锋',
  GK: '守门员',
  DEF: '后卫',
  MID: '中场',
  FWD: '前锋',
  守门员: '守门员',
  后卫: '后卫',
  中场: '中场',
  前锋: '前锋',
};

function toId(en) {
  return String(en || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** market_value from API is euros; convert to 万欧元 */
function toMarketValueWanEuro(raw) {
  const n = Number(raw);
  if (!n || isNaN(n)) return 0;
  return Math.round(n / 10000);
}

function mapPosition(pos) {
  if (!pos) return '中场';
  const p = String(pos).trim();
  if (POSITION_MAP[p]) return POSITION_MAP[p];
  const upper = p.toUpperCase();
  return POSITION_MAP[upper] || '中场';
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });
  return page;
}

function sanitizeHeaders(headers) {
  const allowed = [
    'accept',
    'accept-language',
    'content-type',
    'referer',
    'user-agent',
    'x-s',
    'x-s-common',
    'x-t',
    'x-b3-traceid',
    'x-xray-traceid',
    'xy-direction',
  ];
  const out = {};
  for (const k of allowed) {
    if (headers[k]) out[k] = headers[k];
  }
  return out;
}

async function refreshPlayerHeaders(page, captured) {
  captured.player = null;
  return new Promise((resolve) => {
    const handler = (req) => {
      if (req.url().includes('player/base') && req.method() === 'POST') {
        captured.player = { url: req.url(), headers: sanitizeHeaders(req.headers()) };
        page.off('request', handler);
        resolve();
      }
    };
    page.on('request', handler);
    page
      .goto(SAMPLE_PLAYER_URL, { waitUntil: 'networkidle2', timeout: 60000 })
      .then(() => sleep(2500))
      .then(() => {
        if (!captured.player) {
          page.off('request', handler);
          resolve();
        }
      })
      .catch(() => {
        page.off('request', handler);
        resolve();
      });
  });
}

async function refreshLineupHeaders(page, captured) {
  return new Promise((resolve) => {
    const handler = (req) => {
      if (req.url().includes('team/lineup') && req.method() === 'POST') {
        captured.lineup = { url: req.url(), headers: sanitizeHeaders(req.headers()) };
        page.off('request', handler);
        resolve();
      }
    };
    page.on('request', handler);
    page
      .goto(SAMPLE_TEAM_URL, { waitUntil: 'networkidle2', timeout: 60000 })
      .then(() => sleep(1500))
      .then(() =>
        page.evaluate(() => {
          [...document.querySelectorAll('*')].find((el) => (el.textContent || '').trim() === '阵容')?.click();
        })
      )
      .then(() => sleep(3000))
      .then(() => {
        page.off('request', handler);
        resolve();
      })
      .catch(() => {
        page.off('request', handler);
        resolve();
      });
  });
}

function attachHeaderCapture(page) {
  const captured = { lineup: null, player: null, standings: null };
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('team/lineup') && req.method() === 'POST') {
      captured.lineup = { url, headers: sanitizeHeaders(req.headers()) };
    }
    if (url.includes('player/base') && req.method() === 'POST') {
      captured.player = { url, headers: sanitizeHeaders(req.headers()) };
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('worldcup/standings?')) return;
    try {
      const json = await res.json();
      if (json?.success && json.data?.standing_list?.length) {
        captured.standings = json;
      }
    } catch (_) {}
  });
  return captured;
}

async function loadTeamsFromDom(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/worldcup26/team/"]')]
        .map((a) => {
          const m = (a.href || '').match(/\/team\/(\d+)/);
          return m ? Number(m[1]) : null;
        })
        .filter(Boolean)
    );
    if (links.length > 0) {
      const names = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('a[href*="/worldcup26/team/"]').forEach((a) => {
          const m = (a.href || '').match(/\/team\/(\d+)/);
          if (m) out[m[1]] = (a.textContent || '').trim();
        });
        return out;
      });
      return {
        data: {
          standing_list: [
            {
              teams: [...new Set(links)].map((id) => ({
                team_id: id,
                team_name: names[String(id)] || '',
              })),
            },
          ],
        },
      };
    }
    await sleep(3000);
  }
  return null;
}

async function initSession(page) {
  const captured = attachHeaderCapture(page);

  await page.goto(STANDINGS_URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(5000);

  if (!captured.standings) {
    captured.standings = await loadTeamsFromDom(page);
  }
  if (!captured.standings || parseTeamsFromStandings(captured.standings).length === 0) {
    await page.evaluate(() => {
      [...document.querySelectorAll('*')].find((el) => (el.textContent || '').trim() === '积分榜')?.click();
    });
    await sleep(3000);
    captured.standings = (await loadTeamsFromDom(page)) || captured.standings;
  }
  if (!captured.standings || parseTeamsFromStandings(captured.standings).length === 0) {
    throw new Error('Failed to load World Cup team list from XHS standings page');
  }

  await page.goto(SAMPLE_TEAM_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll('*')].find((el) => (el.textContent || '').trim() === '阵容')?.click();
  });
  await sleep(3000);

  await page.goto(SAMPLE_PLAYER_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);

  if (!captured.lineup || !captured.player) {
    throw new Error('Failed to capture signed API headers from XHS pages');
  }

  return captured;
}

function parseTeamsFromStandings(standingsJson) {
  const teams = [];
  const seen = new Set();
  for (const group of standingsJson?.data?.standing_list || []) {
    for (const t of group.teams || []) {
      if (t.team_id && !seen.has(t.team_id)) {
        seen.add(t.team_id);
        teams.push({ teamId: t.team_id, teamName: t.team_name || '' });
      }
    }
  }
  return teams;
}

async function signedPost(page, reqInfo, body) {
  return page.evaluate(
    async (info, payload) => {
      const res = await fetch(info.url, {
        method: 'POST',
        headers: info.headers,
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      return res.json();
    },
    reqInfo,
    body
  );
}

async function fetchTeams(page, captured) {
  return parseTeamsFromStandings(captured.standings);
}

async function fetchTeamLineup(page, captured, teamId) {
  const json = await signedPost(page, captured.lineup, {
    team_id: teamId,
    competition_id: COMPETITION_ID,
    season_id: SEASON_ID,
  });
  if (!json?.success || !json.data?.match_lineup) return { teamId, players: [] };

  const lineup = json.data.match_lineup;
  const players = [];
  for (const block of lineup.detail_list || []) {
    for (const p of block.player_info || []) {
      players.push({
        playerId: p.player_id,
        name: p.name,
        age: Number(p.age) || null,
        club: p.club_name || '',
        position: mapPosition(p.position),
        imageUrl: p.logo || null,
        shirtNumber: p.shirt_number,
      });
    }
  }
  return { teamId, players };
}

async function fetchPlayerBase(page, captured, playerId) {
  const json = await signedPost(page, captured.player, { player_id: playerId });
  if (!json?.success || !json.data?.player_base) return null;
  const b = json.data.player_base;
  return {
    playerId: b.player_id,
    nameZh: b.player_name,
    nameEn: b.player_name_en,
    shortName: b.player_short_name,
    nationalTeam: b.country,
    club: b.club_name || '',
    age: Number(b.age) || null,
    position: mapPosition(b.position),
    marketValue: toMarketValueWanEuro(b.market_value),
    height: b.height ? Number(b.height) : null,
    weight: b.weight ? Number(b.weight) : null,
    imageUrl: b.player_logo || null,
    shirtNumber: b.shirt_number,
  };
}

function buildAliases(nameZh, nameEn, shortName) {
  const aliases = new Set();
  if (nameEn) {
    aliases.add(nameEn);
    const parts = nameEn.split(' ');
    if (parts.length > 1) aliases.add(parts[parts.length - 1]);
  }
  if (shortName && shortName !== nameZh) aliases.add(shortName);
  if (nameZh.includes('·')) aliases.add(nameZh.replace(/·/g, '-'));
  if (nameZh.includes('-')) aliases.add(nameZh.replace(/-/g, '·'));
  aliases.delete(nameZh);
  return [...aliases];
}

module.exports = {
  COMPETITION_ID,
  SEASON_ID,
  STANDINGS_URL,
  sleep,
  toId,
  toMarketValueWanEuro,
  mapPosition,
  launchBrowser,
  setupPage,
  initSession,
  fetchTeams,
  fetchTeamLineup,
  fetchPlayerBase,
  buildAliases,
  refreshPlayerHeaders,
  refreshLineupHeaders,
};
