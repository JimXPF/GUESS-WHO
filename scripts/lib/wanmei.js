/**
 * Shared Perfect World (wanmei) page helpers for Puppeteer scrapers.
 */
const TEAMS_URL = 'https://data.wanmei.com/csgo/teams';
const PLAYERS_URL = 'https://data.wanmei.com/csgo/players/overview';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setupPage(page) {
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1400, height: 900 });
}

async function collectHltvTeamNames(page, maxScroll = 80) {
  return collectHltvTopTeamNames(page, maxScroll);
}

/** HLTV 战队榜（完美世界 teams 页 HLTV Tab），默认取 TOP 30 */
async function collectHltvTopTeamNames(page, limit = 30, maxScroll = 80) {
  await page.goto(TEAMS_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2000);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((t) =>
      (t.textContent || '').includes('HLTV')
    );
    tab?.click();
  });
  await sleep(2500);

  const names = [];
  const seen = new Set();
  for (let i = 0; i < maxScroll && names.length < limit; i++) {
    const batch = await page.evaluate(() =>
      [...document.querySelectorAll('.team-name')]
        .map((e) => e.textContent?.trim())
        .filter(Boolean)
    );
    for (const n of batch) {
      if (!seen.has(n)) {
        seen.add(n);
        names.push(n);
        if (names.length >= limit) break;
      }
    }
    if (names.length >= limit) break;
    await page.evaluate(() => {
      const scroller = document.querySelector('.team-valve-virtual__scroller');
      if (scroller) scroller.scrollTop += 250;
    });
    await sleep(200);
  }
  return names.slice(0, limit);
}

async function openPlayerById(page, playerId) {
  const url = `https://data.wanmei.com/csgo/players/${playerId}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  return /\/csgo\/players\/\d+/.test(page.url());
}

function parseTop20FromText(text) {
  if (!text) return { top20Count: 0, top20Summary: null };
  const matches = [...String(text).matchAll(/(\d{4})\s*#\s*(\d+)/g)];
  const parts = matches.map((m) => `${m[1]} #${m[2]}`);
  return {
    top20Count: parts.length,
    top20Summary: parts.length ? `${parts.join('; ')};` : null,
  };
}

async function searchAndOpenTeam(page, query) {
  await page.goto(TEAMS_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder*="搜索"]', { timeout: 15000 });

  const input = await page.$('input[placeholder*="搜索"]');
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.type(query, { delay: 35 });
  await sleep(900);

  try {
    await page.waitForSelector('.search-result .s-item', { timeout: 5000 });
  } catch {
    return false;
  }

  const clicked = await page.evaluate((q) => {
    const key = q.toLowerCase().replace(/\s+/g, '');
    const result = document.querySelector('.search-result');
    if (!result) return false;

    const titles = [...result.querySelectorAll('.s-title')];
    const teamTitle = titles.find((t) => (t.textContent || '').includes('战队'));
    if (!teamTitle) return false;

    let node = teamTitle.nextElementSibling;
    while (node) {
      if (node.classList?.contains('s-item')) {
        const text = (node.textContent || '').replace(/\s+/g, '');
        if (text.toLowerCase() === key || text.toLowerCase().includes(key)) {
          node.querySelector('.i-titbox')?.click();
          return true;
        }
      }
      if (node.classList?.contains('s-title')) break;
      node = node.nextElementSibling;
    }

    const firstTeam = teamTitle.nextElementSibling;
    if (firstTeam?.classList?.contains('s-item')) {
      firstTeam.querySelector('.i-titbox')?.click();
      return true;
    }
    return false;
  }, query);

  if (!clicked) return false;

  try {
    await page.waitForFunction(() => /\/csgo\/teams\/detail\//.test(location.pathname), {
      timeout: 10000,
    });
  } catch {
    return false;
  }

  await sleep(1200);
  return true;
}

async function parseActiveRoster(page) {
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((t) =>
      (t.textContent || '').includes('阵容')
    );
    tab?.click();
  });
  await sleep(1500);

  return page.evaluate(() => {
    const players = [];
    document.querySelectorAll('tbody tr').forEach((tr) => {
      const tds = [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim());
      if (tds.length >= 2 && tds[1] === '首发' && /^[A-Za-z0-9_.-]+$/.test(tds[0] || '')) {
        players.push(tds[0]);
      }
    });
    return [...new Set(players)];
  });
}

async function searchAndOpenPlayer(page, query) {
  await page.goto(PLAYERS_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder*="搜索"]', { timeout: 15000 });

  const input = await page.$('input[placeholder*="搜索"]');
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.type(query, { delay: 35 });
  await sleep(900);

  try {
    await page.waitForSelector('.search-result .s-item', { timeout: 5000 });
  } catch {
    return false;
  }

  const clicked = await page.evaluate((q) => {
    const key = q.toLowerCase().replace(/\s+/g, '');
    const result = document.querySelector('.search-result');
    if (!result) return false;

    const titles = [...result.querySelectorAll('.s-title')];
    const playerTitle = titles.find((t) => (t.textContent || '').includes('选手'));
    if (!playerTitle) return false;

    const items = [];
    let node = playerTitle.nextElementSibling;
    while (node) {
      if (node.classList?.contains('s-item')) {
        items.push(node);
      }
      if (node.classList?.contains('s-title')) break;
      node = node.nextElementSibling;
    }

    const pick =
      items.find((el) => (el.textContent || '').replace(/\s+/g, '').toLowerCase() === key) ||
      items.find((el) => (el.textContent || '').replace(/\s+/g, '').toLowerCase().startsWith(key));

    if (pick) {
      pick.querySelector('.i-titbox')?.click();
      return true;
    }
    return false;
  }, query);

  if (!clicked) return false;

  try {
    await page.waitForFunction(() => /\/csgo\/players\/\d+/.test(location.pathname), {
      timeout: 10000,
    });
  } catch {
    return false;
  }

  await sleep(1000);
  return true;
}

function normalizeImageUrl(src) {
  if (!src || src.includes('player-default') || src.includes('data:image') || src.includes('.svg')) {
    return null;
  }
  const base = src.split('?')[0];
  return `${base}?x-oss-process=image/resize,w_280`;
}

async function parsePlayerDetail(page) {
  const raw = await page.evaluate(() => {
    const name = (document.querySelector('h2')?.textContent || '').trim();
    const text = document.body.innerText;

    let team = null;
    let nationality = null;

    for (const el of document.querySelectorAll('li')) {
      const item = (el.textContent || '').trim();
      if (item.startsWith('战队') && item.length > 2) {
        team = item.replace(/^战队/, '').trim();
      }
      if (item.startsWith('国籍') && item.length > 2) {
        nationality = item.replace(/^国籍/, '').trim();
      }
    }

    if (!team) {
      const m = text.match(/战队\s*\n\s*([^\n]+)\s*\n\s*国籍/);
      if (m) team = m[1].trim();
    }
    if (!nationality) {
      nationality = text.match(/国籍\s*\n\s*([^\n]+)/)?.[1]?.trim() || null;
    }

    if (team === '选手' || team === '战队') team = null;

    const gaugeValues = [...document.querySelectorAll('.gauge-value')]
      .map((el) => parseFloat(String(el.textContent || '').trim()))
      .filter((n) => !Number.isNaN(n));
    const rating = gaugeValues.length ? gaugeValues[0] : null;

    let top20Text = '';
    const extras = document.querySelector('.player-overview-profile-extras');
    if (extras) {
      top20Text = (extras.textContent || '').replace(/HLTV TOP 20 成就/g, '').trim();
    }
    if (!top20Text) {
      for (const li of document.querySelectorAll('li')) {
        const t = (li.textContent || '').trim();
        if (/\d{4}\s*#\s*\d+/.test(t)) {
          top20Text = t;
          break;
        }
      }
    }

    const abilities = {};
    for (const head of document.querySelectorAll('.ability-head')) {
      const label = head.querySelector('.ability-title')?.textContent?.trim();
      const scoreText = head.querySelector('.score-value')?.textContent?.trim();
      if (!label || scoreText == null || scoreText === '') continue;
      const n = parseInt(scoreText, 10);
      if (!Number.isNaN(n)) abilities[label] = n;
    }

    const radar = {};
    for (const label of ['狙击', '突破', '补枪', '残局', '道具']) {
      if (abilities[label] != null) {
        radar[label] = abilities[label];
        continue;
      }
      const re = new RegExp(`${label}\\s*\\n\\s*(\\d+)`);
      const m = text.match(re);
      if (m) radar[label] = parseInt(m[1], 10);
    }

    let position = 'Rifler';
    if ((abilities['狙击'] ?? radar['狙击'] ?? 0) >= 65) position = 'AWPer';

    const imgs = [...document.querySelectorAll('img')].filter((img) => {
      const src = img.src || '';
      return (
        src.includes('cdn.wmpvp.com') &&
        !src.includes('player-default') &&
        !src.includes('.svg') &&
        !src.includes('w_24') &&
        !src.includes('w_28') &&
        !src.includes('w_45')
      );
    });

    const byAlt = imgs.find((img) => {
      const alt = (img.alt || '').trim();
      return alt && name && alt.toLowerCase() === name.toLowerCase();
    });
    const imgEl = byAlt || imgs.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const src = imgEl?.src || null;

    const wanmeiId = (location.pathname.match(/\/players\/(\d+)/) || [])[1] || null;

    return { name, team, nationality, position, src, rating, top20Text, wanmeiId, radar, abilities };
  });

  const top20 = parseTop20FromText(raw.top20Text);
  const radar = raw.radar || {};
  const abilities = raw.abilities || {};
  return {
    name: raw.name,
    team: raw.team,
    nationality: raw.nationality,
    position: raw.position,
    src: raw.src,
    rating: raw.rating != null ? Math.round(raw.rating * 100) / 100 : null,
    top20Count: top20.top20Count,
    top20Summary: top20.top20Summary,
    wanmeiId: raw.wanmeiId,
    firepowerStat: abilities['火力值'] ?? null,
    gameBreakerStat: abilities['破局'] ?? null,
    sniperStat: abilities['狙击'] ?? radar['狙击'] ?? null,
    breakthroughStat: abilities['突破'] ?? radar['突破'] ?? null,
    tradeStat: abilities['补枪'] ?? radar['补枪'] ?? null,
    clutchStat: abilities['残局'] ?? radar['残局'] ?? null,
    utilityStat: abilities['道具'] ?? radar['道具'] ?? null,
    radar,
    abilities,
  };
}

module.exports = {
  TEAMS_URL,
  PLAYERS_URL,
  sleep,
  setupPage,
  collectHltvTeamNames,
  collectHltvTopTeamNames,
  searchAndOpenTeam,
  parseActiveRoster,
  searchAndOpenPlayer,
  openPlayerById,
  parsePlayerDetail,
  parseTop20FromText,
  normalizeImageUrl,
};
