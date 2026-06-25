/**
 * Shared Hupu NBA scraper utilities.
 */

const puppeteer = require('puppeteer');

const SLUG_TO_TEAM = {
  spurs: 'Spurs',
  rockets: 'Rockets',
  pelicans: 'Pelicans',
  mavericks: 'Mavericks',
  grizzlies: 'Grizzlies',
  lakers: 'Lakers',
  suns: 'Suns',
  clippers: 'Clippers',
  warriors: 'Warriors',
  kings: 'Kings',
  thunder: 'Thunder',
  nuggets: 'Nuggets',
  timberwolves: 'Timberwolves',
  blazers: 'Trail Blazers',
  jazz: 'Jazz',
  celtics: 'Celtics',
  knicks: 'Knicks',
  raptors: 'Raptors',
  nets: 'Nets',
  hawks: 'Hawks',
  magic: 'Magic',
  hornets: 'Hornets',
  heat: 'Heat',
  wizards: 'Wizards',
  pistons: 'Pistons',
  cavaliers: 'Cavaliers',
  bucks: 'Bucks',
  bulls: 'Bulls',
  pacers: 'Pacers',
  '76ers': '76ers',
};

/** Hupu Chinese team label → internal team code */
const HUPU_TEAM_ZH_TO_CODE = {
  洛杉矶湖人: 'Lakers',
  湖人: 'Lakers',
  印第安纳步行者: 'Pacers',
  步行者: 'Pacers',
  波特兰开拓者: 'Trail Blazers',
  开拓者: 'Trail Blazers',
  费城76人: '76ers',
  '76人': '76ers',
  布鲁克林篮网: 'Nets',
  篮网: 'Nets',
  波士顿凯尔特人: 'Celtics',
  凯尔特人: 'Celtics',
  纽约尼克斯: 'Knicks',
  尼克斯: 'Knicks',
  多伦多猛龙: 'Raptors',
  猛龙: 'Raptors',
  亚特兰大老鹰: 'Hawks',
  老鹰: 'Hawks',
  奥兰多魔术: 'Magic',
  魔术: 'Magic',
  夏洛特黄蜂: 'Hornets',
  黄蜂: 'Hornets',
  迈阿密热火: 'Heat',
  热火: 'Heat',
  华盛顿奇才: 'Wizards',
  奇才: 'Wizards',
  底特律活塞: 'Pistons',
  活塞: 'Pistons',
  克利夫兰骑士: 'Cavaliers',
  骑士: 'Cavaliers',
  密尔沃基雄鹿: 'Bucks',
  雄鹿: 'Bucks',
  芝加哥公牛: 'Bulls',
  公牛: 'Bulls',
  圣安东尼奥马刺: 'Spurs',
  马刺: 'Spurs',
  休斯顿火箭: 'Rockets',
  火箭: 'Rockets',
  新奥尔良鹈鹕: 'Pelicans',
  鹈鹕: 'Pelicans',
  达拉斯独行侠: 'Mavericks',
  独行侠: 'Mavericks',
  孟菲斯灰熊: 'Grizzlies',
  灰熊: 'Grizzlies',
  菲尼克斯太阳: 'Suns',
  太阳: 'Suns',
  洛杉矶快船: 'Clippers',
  快船: 'Clippers',
  金州勇士: 'Warriors',
  勇士: 'Warriors',
  萨克拉门托国王: 'Kings',
  国王: 'Kings',
  俄克拉荷马城雷霆: 'Thunder',
  雷霆: 'Thunder',
  丹佛掘金: 'Nuggets',
  掘金: 'Nuggets',
  明尼苏达森林狼: 'Timberwolves',
  森林狼: 'Timberwolves',
  犹他爵士: 'Jazz',
  爵士: 'Jazz',
};

const KNOWN_2026_TRADES = {
  扬尼斯·阿德托昆博: 'Heat',
  朱利叶斯·兰德尔: 'Nets',
  尼克·克拉克斯顿: 'Bulls',
  特雷·杨: 'Wizards',
  伊维察·祖巴茨: 'Pacers',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[·・\-—－–]/g, '')
    .replace(/\s+/g, '');
}

function hupuNameToStandard(name) {
  return String(name || '').trim().replace(/-/g, '·');
}

function standardToDash(name) {
  return String(name || '').trim().replace(/·/g, '-');
}

function toId(en) {
  return String(en || '')
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function slugFromTeamUrl(url) {
  const m = String(url).match(/\/players\/([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : null;
}

function mapTeamZh(zh) {
  if (!zh) return null;
  const t = zh.trim();
  if (HUPU_TEAM_ZH_TO_CODE[t]) return HUPU_TEAM_ZH_TO_CODE[t];
  for (const [key, code] of Object.entries(HUPU_TEAM_ZH_TO_CODE)) {
    if (t.includes(key)) return code;
  }
  return null;
}

/** Hupu position label → C / F / G / C-F / F-G / F-C / G-F */
function parsePosition(raw) {
  if (!raw) return null;
  const p = raw
    .trim()
    .toUpperCase()
    .replace(/（.*$/, '')
    .replace(/\(.*$/, '')
    .replace(/\s/g, '')
    .trim();
  const MAP = {
    C: 'C',
    F: 'F',
    G: 'G',
    'C-F': 'C-F',
    'F-C': 'F-C',
    'F-G': 'F-G',
    'G-F': 'G-F',
    CF: 'C-F',
    FC: 'F-C',
    FG: 'F-G',
    GF: 'G-F',
    PG: 'G',
    SG: 'G',
    SF: 'F',
    PF: 'F',
  };
  return MAP[p] || null;
}

function parseHeightCm(raw) {
  if (!raw) return null;
  const m = raw.match(/([\d.]+)\s*米/);
  if (m) return Math.round(parseFloat(m[1]) * 100);
  const ft = raw.match(/(\d+)尺(\d+)/);
  if (ft) return Math.round(parseInt(ft[1], 10) * 30.48 + parseInt(ft[2], 10) * 2.54);
  return null;
}

/** "2023年第1轮第顺位" → "2023年第1轮"; undrafted → null */
function parseDraft(raw) {
  if (!raw) return null;
  const t = raw.trim();
  const m = t.match(/(\d{4})年第(\d+)轮/);
  if (m) return `${m[1]}年第${m[2]}轮`;
  if (/落选秀|未参加选秀|undrafted/i.test(t)) return '落选秀';
  return null;
}

function countPlayoffSeasons(text) {
  const marker = '职业生涯季后赛平均数据';
  const idx = text.indexOf(marker);
  if (idx < 0) return 0;

  const after = text.slice(idx + marker.length);
  const headerIdx = after.search(/赛季[\s\t]+球队/);
  if (headerIdx < 0) return 0;

  const block = after.slice(headerIdx);
  const end = block.search(/\n(篮板排行榜|得分排行榜|助攻排行榜|抢断排行榜|盖帽排行榜|相关帖子|本赛季常规赛)/);
  const slice = end > 0 ? block.slice(0, end) : block.slice(0, 4000);

  const years = new Set();
  for (const line of slice.split('\n')) {
    const m = line.match(/^(20\d{2})[\t ]([^\t]+)[\t ]/);
    if (!m) continue;
    const team = m[2].trim();
    if (!team || team === '汇总') continue;
    years.add(m[1]);
  }
  return years.size;
}

async function clickCareerPlayoffTab(page) {
  return page.evaluate(() => {
    const candidates = [];
    for (const el of document.querySelectorAll('a, span, div, li, button')) {
      const t = (el.textContent || '').trim();
      if (!t.endsWith('生涯季后赛表现')) continue;
      if (t.includes('常规赛')) continue;
      if (t.length > 40) continue;
      candidates.push(el);
    }
    if (!candidates.length) return false;
    candidates[candidates.length - 1].click();
    return true;
  });
}

function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const m = birthday.match(/(\d{4})/);
  if (!m) return null;
  return new Date().getFullYear() - Number(m[1]);
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

async function fetchTeamLinks(page) {
  await page.goto('https://nba.hupu.com/players', { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(2000);

  const links = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('a[href*="/players/"]').forEach((a) => {
      const href = a.href || a.getAttribute('href') || '';
      const full = href.startsWith('http') ? href : `https://nba.hupu.com${href}`;
      if (!/\/players\/[a-z0-9]+$/i.test(full)) return;
      if (seen.has(full)) return;
      seen.add(full);
      out.push({ url: full, label: (a.textContent || '').trim() });
    });
    return out;
  });

  if (!links.some((l) => l.url.includes('/players/76ers'))) {
    links.push({ url: 'https://nba.hupu.com/players/76ers', label: '费城76人' });
  }

  const teams = [];
  for (const link of links) {
    const slug = slugFromTeamUrl(link.url);
    const teamCode = SLUG_TO_TEAM[slug];
    if (teamCode) teams.push({ slug, teamCode, url: link.url, label: link.label });
  }
  return teams;
}

async function fetchTeamRoster(page, team) {
  await page.goto(team.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);

  const players = await page.evaluate(() => {
    const map = new Map();
    document.querySelectorAll('a[href*="/players/"]').forEach((a) => {
      const href = a.href || a.getAttribute('href') || '';
      const full = href.startsWith('http') ? href : `https://nba.hupu.com${href}`;
      if (!/\/players\/[a-z0-9]+-\d+\.html/i.test(full)) return;
      const name = (a.textContent || '').trim();
      if (!name || name.length < 2) return;
      if (!map.has(full)) map.set(full, { name, detailUrl: full });
    });
    return Array.from(map.values());
  });

  return players.map((p) => ({ ...p, team: team.teamCode, teamLabel: team.label }));
}

async function fetchPlayerDetail(page, detailUrl, options = {}) {
  const timeout = options.timeout ?? 90000;
  const waitUntil = options.waitUntil ?? 'domcontentloaded';

  await page.goto(detailUrl, { waitUntil, timeout });
  await sleep(options.postWait ?? 900);

  await clickCareerPlayoffTab(page);
  await sleep(options.playoffTabWait ?? 1200);

  const raw = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const title = document.title || '';
    const parts = title.split('|');
    const zhNameRaw = parts[0]?.trim() || '';
    const enName = parts[1]?.trim() || '';

    const pick = (label) => {
      const re = new RegExp(`${label}[：:]\\s*([^\\n]+)`);
      const m = text.match(re);
      return m ? m[1].trim() : null;
    };

    let imageUrl = null;
    for (const img of document.querySelectorAll('img')) {
      const src = img.src || '';
      if (src.includes('gdc.hupucdn.com') && src.includes('/players/')) {
        imageUrl = src.split('?')[0];
        break;
      }
    }

    return {
      zhNameRaw,
      enName,
      positionRaw: pick('位置'),
      birthday: pick('生日'),
      teamZh: pick('球队'),
      schoolRaw: pick('学校'),
      draftRaw: pick('选秀'),
      heightRaw: pick('身高'),
      pageText: text,
      imageUrl,
    };
  });

  return {
    ...raw,
    height: parseHeightCm(raw.heightRaw),
    position: parsePosition(raw.positionRaw),
    draft: parseDraft(raw.draftRaw),
    playoffCount: countPlayoffSeasons(raw.pageText),
  };
}

async function scrapeAllRosters(options = {}) {
  const quiet = options.quiet === true;
  const keepBrowser = options.keepBrowser === true;
  const browser = await launchBrowser();
  const page = await setupPage(browser);

  try {
    if (!quiet) console.log('Loading https://nba.hupu.com/players ...');
    const teams = await fetchTeamLinks(page);
    if (!quiet) console.log(`Found ${teams.length} team roster pages.`);

    const byUrl = new Map();
    const nameToTeam = {};

    for (const team of teams) {
      try {
        if (!quiet) console.log(`  → ${team.label || team.teamCode} (${team.slug})`);
        const roster = await fetchTeamRoster(page, team);
        if (!quiet) console.log(`    ${roster.length} players`);
        for (const p of roster) {
          if (!byUrl.has(p.detailUrl)) {
            byUrl.set(p.detailUrl, p);
          }
          nameToTeam[normalizeName(p.name)] = team.teamCode;
        }
        await sleep(400);
      } catch (e) {
        if (!quiet) console.log(`    skip: ${e.message.slice(0, 80)}`);
      }
    }

    const allPlayers = Array.from(byUrl.values());
    const result = { teams, allPlayers, nameToTeam };

    if (keepBrowser) {
      return { ...result, page, browser };
    }

    await browser.close();
    return result;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

function applyTradeOverride(nameStd, team) {
  return KNOWN_2026_TRADES[nameStd] || team;
}

function buildAliases(nameStd, enName, hupuNameRaw) {
  const aliases = new Set();
  const dash = standardToDash(nameStd);
  if (enName) {
    aliases.add(enName);
    const parts = enName.split(' ');
    if (parts.length > 1) aliases.add(parts[parts.length - 1]);
  }
  if (hupuNameRaw && hupuNameRaw !== nameStd) aliases.add(hupuNameRaw);
  if (dash !== nameStd) aliases.add(dash);
  aliases.delete(nameStd);
  return [...aliases];
}

module.exports = {
  SLUG_TO_TEAM,
  HUPU_TEAM_ZH_TO_CODE,
  KNOWN_2026_TRADES,
  normalizeName,
  hupuNameToStandard,
  toId,
  mapTeamZh,
  parsePosition,
  parseHeightCm,
  parseDraft,
  countPlayoffSeasons,
  countPlayoffSeasons,
  clickCareerPlayoffTab,
  ageFromBirthday,
  launchBrowser,
  setupPage,
  fetchTeamLinks,
  fetchTeamRoster,
  fetchPlayerDetail,
  scrapeAllRosters,
  applyTradeOverride,
  buildAliases,
  sleep,
};
