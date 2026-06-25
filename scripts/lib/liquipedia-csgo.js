/**
 * Liquipedia Counter-Strike helpers — conservative access.
 *
 * Modes:
 * - browser (default): Puppeteer visits wiki pages like a human
 * - api: MediaWiki parse API (faster but easier to rate-limit)
 *
 * Anti-ban:
 * - Disk cache
 * - Random delay between requests (--delay-min / --delay-max)
 * - Optional proxy via LIQUIPEDIA_PROXY / HTTPS_PROXY
 * - Stop on 429/403 / Cloudflare challenge
 */
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '../cache/liquipedia-cache.json');
const WIKI_BASE = 'https://liquipedia.net/counterstrike';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const API_USER_AGENT =
  'GuessWho-CS-DataSync/1.0 (local dev; non-commercial; +https://liquipedia.net/api)';

const DEFAULT_MIN_INTERVAL_MS = 8000;
const DEFAULT_MAX_INTERVAL_MS = 8000;

let lastRequestAt = 0;
let minIntervalMs = DEFAULT_MIN_INTERVAL_MS;
let maxIntervalMs = DEFAULT_MAX_INTERVAL_MS;
let proxyDispatcher = null;
let proxyUrlInUse = null;
let browserSession = null;

class LiquipediaBlockedError extends Error {
  constructor(status, pageName) {
    super(`Liquipedia blocked request HTTP ${status} for "${pageName}" — stop and retry later`);
    this.name = 'LiquipediaBlockedError';
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomMs(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function getProxyUrl() {
  return process.env.LIQUIPEDIA_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
}

function getFetchDispatcher() {
  const url = getProxyUrl();
  if (!url) return undefined;
  if (!proxyDispatcher || proxyUrlInUse !== url) {
    const { ProxyAgent } = require('undici');
    proxyDispatcher = new ProxyAgent(url);
    proxyUrlInUse = url;
  }
  return proxyDispatcher;
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return { pages: {}, ages: {} };
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return { pages: {}, ages: {} };
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

function cacheKey(pageName) {
  return String(pageName || '')
    .trim()
    .toLowerCase();
}

function setMinInterval(ms) {
  minIntervalMs = Math.max(2000, ms);
  maxIntervalMs = Math.max(minIntervalMs, maxIntervalMs);
}

function setDelayRange(min, max) {
  minIntervalMs = Math.max(2000, min);
  maxIntervalMs = Math.max(minIntervalMs, max);
}

async function randomSleepBetween() {
  const gap = randomMs(minIntervalMs, maxIntervalMs);
  const now = Date.now();
  const wait = gap - (now - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function waitForSlot() {
  await randomSleepBetween();
}

function pageUrl(pageName) {
  const slug = encodeURIComponent(String(pageName || '').trim().replace(/ /g, '_'));
  return `${WIKI_BASE}/${slug}`;
}

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeBirthDate(raw) {
  if (!raw) return null;
  const text = String(raw).trim();

  const iso = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  const named = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    if (month) return `${named[3]}-${pad2(month)}-${pad2(named[2])}`;
  }

  return null;
}

function parseBirthDate(wikitext) {
  if (!wikitext) return null;
  const m = wikitext.match(/\|birth_date\s*=\s*([^\n|]+)/i);
  if (!m) return null;
  return normalizeBirthDate(m[1].trim()) || m[1].trim();
}

function computeAge(birthDateStr, asOf = new Date()) {
  const normalized = normalizeBirthDate(birthDateStr) || birthDateStr;
  const parts = normalized.split(/[-/]/).map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;

  const [year, month, day] = parts;
  let age = asOf.getFullYear() - year;
  const todayCode = (asOf.getMonth() + 1) * 100 + asOf.getDate();
  const birthCode = month * 100 + day;
  if (todayCode < birthCode) age -= 1;
  return age >= 0 && age <= 60 ? age : null;
}

function pageNameForPlayer(entry) {
  return String(entry.name || entry.id || '').trim();
}

function nationalityToHint(nationality) {
  const map = {
    法国: 'French',
    丹麦: 'Danish',
    巴西: 'Brazilian',
    德国: 'German',
    波兰: 'Polish',
    俄罗斯: 'Russian',
    乌克兰: 'Ukrainian',
    美国: 'American',
    加拿大: 'Canadian',
    瑞典: 'Swedish',
    挪威: 'Norwegian',
    芬兰: 'Finnish',
    澳大利亚: 'Australian',
    中国: 'Chinese',
    蒙古: 'Mongolian',
    以色列: 'Israeli',
    土耳其: 'Turkish',
    塞尔维亚: 'Serbian',
    保加利亚: 'Bulgarian',
    罗马尼亚: 'Romanian',
    阿根廷: 'Argentine',
    乌拉圭: 'Uruguayan',
    智利: 'Chilean',
    西班牙: 'Spanish',
    葡萄牙: 'Portuguese',
    英国: 'British',
    荷兰: 'Dutch',
    比利时: 'Belgian',
    捷克: 'Czech',
    斯洛伐克: 'Slovak',
    立陶宛: 'Lithuanian',
    拉脱维亚: 'Latvian',
    爱沙尼亚: 'Estonian',
    哈萨克斯坦: 'Kazakh',
    乌兹别克斯坦: 'Uzbek',
    南非: 'South African',
    新西兰: 'New Zealander',
    日本: 'Japanese',
    韩国: 'Korean',
    阿尔巴尼亚: 'Albanian',
  };
  return map[String(nationality || '').trim()] || null;
}

async function setupBrowserPage(page) {
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({
    width: 1366 + randomMs(-40, 40),
    height: 768 + randomMs(-30, 30),
  });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
  });
}

async function simulateHuman(page) {
  const scrollY = randomMs(120, 900);
  await page.evaluate((y) => window.scrollBy(0, y), scrollY);
  await sleep(randomMs(800, 2200));
  if (Math.random() < 0.35) {
    await page.mouse.move(randomMs(200, 900), randomMs(150, 600), { steps: randomMs(8, 18) });
    await sleep(randomMs(400, 1200));
  }
}

async function detectBlockedPage(page, pageName) {
  const info = await page.evaluate(() => ({
    title: document.title || '',
    body: (document.body?.innerText || '').slice(0, 800).toLowerCase(),
    url: location.href,
  }));

  if (/just a moment|access denied|429|rate limit|too many requests|cloudflare/i.test(info.title + info.body)) {
    throw new LiquipediaBlockedError(429, pageName);
  }
  if (/403|forbidden/i.test(info.title)) {
    throw new LiquipediaBlockedError(403, pageName);
  }
}

async function parseBirthFromDom(page) {
  return page.evaluate(() => {
    const labels = document.querySelectorAll('.infobox-description, .infobox-label');
    for (const label of labels) {
      const key = (label.textContent || '').trim().toLowerCase().replace(/:$/, '');
      if (key !== 'born' && key !== 'birth date') continue;
      const cell = label.nextElementSibling;
      const raw = (cell?.textContent || '').trim();
      if (raw) return raw;
    }

    const html = document.documentElement.innerHTML;
    const m = html.match(/\|birth_date\s*=\s*([^\n|<]+)/i);
    return m ? m[1].trim() : null;
  });
}

async function resolveDisambiguation(page, entry) {
  const hint = nationalityToHint(entry.nationality);
  const picked = await page.evaluate((countryHint) => {
    const links = [...document.querySelectorAll('#mw-content-text a[href*="/counterstrike/"]')];
    if (!links.length) return null;

    if (countryHint) {
      const match = links.find((a) => (a.textContent || '').includes(countryHint));
      if (match) return match.getAttribute('href');
    }
    const playerLink = links.find((a) => /player/i.test(a.textContent || ''));
    return (playerLink || links[0])?.getAttribute('href') || null;
  }, hint);

  if (!picked) return false;
  const url = picked.startsWith('http') ? picked : `https://liquipedia.net${picked}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(randomMs(1200, 2400));
  await simulateHuman(page);
  return true;
}

async function launchLiquipediaBrowser() {
  const puppeteer = require('puppeteer');
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    // Windows: keep any stray window off-screen (avoids top-left white box)
    '--window-position=-32000,-32000',
    '--window-size=1280,720',
  ];
  const proxy = getProxyUrl();
  if (proxy) args.push(`--proxy-server=${proxy}`);

  const browser = await puppeteer.launch({
    headless: true,
    args,
  });
  const page = await browser.newPage();
  await setupBrowserPage(page);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('Browser: warming up on Liquipedia main page...');
  await waitForSlot();
  await page.goto(`${WIKI_BASE}/Main_Page`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(randomMs(2000, 4000));
  await simulateHuman(page);
  await detectBlockedPage(page, 'Main_Page');

  browserSession = { browser, page };
  return browserSession;
}

async function closeLiquipediaBrowser() {
  if (browserSession?.browser) {
    await browserSession.browser.close().catch(() => {});
    browserSession = null;
  }
}

async function fetchPlayerAgeBrowser(page, entry) {
  const pageName = pageNameForPlayer(entry);
  if (!pageName) return null;

  await waitForSlot();
  console.log(`    [browser] open ${pageName} (random delay ${minIntervalMs}-${maxIntervalMs}ms applied)`);
  await page.goto(pageUrl(pageName), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(randomMs(1500, 3500));
  await simulateHuman(page);
  await detectBlockedPage(page, pageName);

  const isDisambig = await page.evaluate(() => {
    const title = (document.title || '').toLowerCase();
    const body = document.body?.innerText || '';
    return title.includes('disambiguation') || body.includes('may refer to:');
  });

  if (isDisambig) {
    const ok = await resolveDisambiguation(page, entry);
    if (!ok) return null;
    await detectBlockedPage(page, pageName);
  }

  const birthRaw = await parseBirthFromDom(page);
  const birthDate = normalizeBirthDate(birthRaw) || birthRaw;
  if (!birthDate) return null;

  const age = computeAge(birthDate);
  if (age == null) return null;

  return { age, birthDate, pageName, source: 'browser' };
}

async function fetchWikitext(pageName, { useCache = true, cache = null } = {}) {
  const key = cacheKey(pageName);
  const store = cache || loadCache();

  if (useCache && store.pages[key]?.wikitext !== undefined) {
    return store.pages[key].wikitext;
  }

  await waitForSlot();

  const url =
    'https://liquipedia.net/counterstrike/api.php?' +
    new URLSearchParams({
      action: 'parse',
      page: pageName,
      prop: 'wikitext',
      format: 'json',
    });

  const dispatcher = getFetchDispatcher();
  const res = await fetch(url, {
    ...(dispatcher ? { dispatcher } : {}),
    headers: {
      'User-Agent': API_USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (res.status === 429 || res.status === 403) {
    throw new LiquipediaBlockedError(res.status, pageName);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pageName}`);

  const json = await res.json();
  const wikitext = json.error ? null : json.parse?.wikitext?.['*'] || null;

  store.pages[key] = {
    wikitext,
    fetchedAt: new Date().toISOString(),
  };
  saveCache(store);

  return wikitext;
}

function parseBirthDateFromWikitext(wikitext) {
  return parseBirthDate(wikitext);
}

async function fetchPlayerAge(entry, { asOf = new Date(), cache = null, mode = 'browser', page = null } = {}) {
  const store = cache || loadCache();
  const playerKey = cacheKey(entry.id || entry.name);

  if (store.ages[playerKey]?.age != null) {
    return store.ages[playerKey];
  }

  const pageName = pageNameForPlayer(entry);
  if (!pageName) return null;

  try {
    let birthDate = null;
    let source = mode;

    if (mode === 'browser') {
      const browserPage = page || browserSession?.page;
      if (!browserPage) throw new Error('Browser mode requires an active Puppeteer page');
      const browserResult = await fetchPlayerAgeBrowser(browserPage, entry);
      if (!browserResult) return null;
      birthDate = browserResult.birthDate;
      source = 'browser';
    } else {
      const wikitext = await fetchWikitext(pageName, { cache: store });
      birthDate = parseBirthDate(wikitext);
      if (!birthDate) return null;
      source = 'api';
    }

    const age = computeAge(birthDate, asOf);
    if (age == null) return null;

    const result = { age, birthDate, pageName, source };
    store.ages[playerKey] = { ...result, cachedAt: new Date().toISOString() };
    saveCache(store);
    return result;
  } catch (err) {
    if (err instanceof LiquipediaBlockedError) throw err;
    return null;
  }
}

module.exports = {
  CACHE_PATH,
  WIKI_BASE,
  LiquipediaBlockedError,
  sleep,
  randomMs,
  setMinInterval,
  setDelayRange,
  randomSleepBetween,
  getProxyUrl,
  loadCache,
  saveCache,
  fetchWikitext,
  parseBirthDate,
  parseBirthDateFromWikitext,
  normalizeBirthDate,
  computeAge,
  pageNameForPlayer,
  pageUrl,
  launchLiquipediaBrowser,
  closeLiquipediaBrowser,
  fetchPlayerAgeBrowser,
  fetchPlayerAge,
};
