/**
 * Scrape CS player avatars from Perfect World data center (web page only).
 * Source: https://data.wanmei.com/csgo/players/overview
 *
 * Usage: node scripts/scrape-csgo-wanmei.js
 */
const fs = require('fs');
const path = require('path');
const { loadThemeData, saveThemeData } = require('./lib/image-utils');

const OVERVIEW_URL = 'https://data.wanmei.com/csgo/players/overview';
const TAB_LABELS = ['选手总览', 'MVPS', 'EVPS', '年度TOP20'];

function normalizeKey(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeImageUrl(src) {
  if (!src || src.includes('player-default') || src.includes('data:image') || src.includes('.svg')) {
    return null;
  }
  const base = src.split('?')[0];
  return `${base}?x-oss-process=image/resize,w_280`;
}

function addToMap(imageMap, name, src) {
  const url = normalizeImageUrl(src);
  if (!url || !name) return;
  imageMap.set(normalizeKey(name), url);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickTab(page, label) {
  await page.evaluate((tabLabel) => {
    const tabs = [...document.querySelectorAll('[role="tab"], .el-tabs__item, [class*="tab"]')];
    const tab = tabs.find((el) => (el.textContent || '').trim() === tabLabel);
    tab?.click();
  }, label);
  await sleep(1500);
}

async function extractPagePortraits(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();

    function push(name, src) {
      const n = (name || '').trim();
      const s = src || '';
      if (!n || !s || s.includes('player-default') || s.includes('.svg')) return;
      if (!s.includes('cdn.wmpvp.com')) return;
      const key = `${n}|${s.split('?')[0]}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name: n, alt: n, src: s });
    }

    document.querySelectorAll('.player-cell').forEach((cell) => {
      const img = cell.querySelector('img');
      const nameSpan = cell.querySelector('span:not(.match-player-avatar):not([class*="avatar"])');
      const name = (nameSpan?.textContent || img?.alt || '').trim();
      if (img?.src) push(name, img.src);
    });

    document.querySelectorAll('img[alt]').forEach((img) => {
      const alt = (img.alt || '').trim();
      const src = img.src || '';
      if (!alt || alt === 'team logo' || alt === '完美赛事数据中心') return;
      if (!src.includes('cdn.wmpvp.com')) return;
      if (src.includes('w_24') && !src.includes('crop')) return;
      push(alt, src);
    });

    return out;
  });
}

async function extractDetailPortrait(page) {
  return page.evaluate(() => {
    const heading = (document.querySelector('h2')?.textContent || '').trim();
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
      return alt && heading && alt.toLowerCase() === heading.toLowerCase();
    });
    if (byAlt) return { name: heading, src: byAlt.src };

    const largest = imgs.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (largest) return { name: heading, src: largest.src };
    return null;
  });
}

async function searchPlayerViaDropdown(page, query) {
  await page.goto(OVERVIEW_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder*="搜索"]', { timeout: 15000 });

  const input = await page.$('input[placeholder*="搜索"]');
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.type(query, { delay: 40 });

  try {
    await page.waitForSelector('.search-result .s-item', { timeout: 5000 });
  } catch {
    return null;
  }

  await sleep(600);

  const clicked = await page.evaluate((q) => {
    function normalize(s) {
      return s.toLowerCase().replace(/\s+/g, '');
    }
    const key = normalize(q);
    const result = document.querySelector('.search-result');
    if (!result) return false;

    const titles = [...result.querySelectorAll('.s-title')];
    const playerTitle = titles.find((t) => (t.textContent || '').includes('选手'));
    if (!playerTitle) return false;

    let node = playerTitle.nextElementSibling;
    while (node) {
      if (node.classList?.contains('s-item')) {
        const text = (node.textContent || '').replace(/\s+/g, '');
        if (normalize(text).includes(key) || key.includes(normalize(text))) {
          node.querySelector('.i-titbox')?.click();
          return true;
        }
      }
      if (node.classList?.contains('s-title')) break;
      node = node.nextElementSibling;
    }

    const items = [...result.querySelectorAll('.s-item')];
    const afterPlayer = items.filter(
      (item) => playerTitle.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    if (afterPlayer[0]) {
      afterPlayer[0].querySelector('.i-titbox')?.click();
      return true;
    }
    return false;
  }, query);

  if (!clicked) return null;

  try {
    await page.waitForFunction(() => /\/csgo\/players\/\d+/.test(window.location.pathname), {
      timeout: 8000,
    });
  } catch {
    return null;
  }

  await sleep(800);
  return extractDetailPortrait(page);
}

function lookupImage(imageMap, entry) {
  const keys = [entry.id, entry.name, ...(entry.aliases || [])].map(normalizeKey);

  for (const k of keys) {
    if (imageMap.has(k)) return imageMap.get(k);
  }

  for (const [k, url] of imageMap) {
    if (keys.some((key) => key.length >= 3 && (k === key || k.includes(key) || key.includes(k)))) {
      return url;
    }
  }
  return null;
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.error('Run: npm install puppeteer --save-dev');
    process.exit(1);
  }

  const data = loadThemeData('csgo.json');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1400, height: 900 });

  const imageMap = new Map();

  console.log('Loading overview page...');
  await page.goto(OVERVIEW_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('tbody tr', { timeout: 20000 });

  for (const tab of TAB_LABELS) {
    console.log(`Scraping tab: ${tab}`);
    await clickTab(page, tab);
    const scraped = await extractPagePortraits(page);
    for (const p of scraped) {
      addToMap(imageMap, p.name, p.src);
      if (p.alt && p.alt !== p.name) addToMap(imageMap, p.alt, p.src);
    }
    console.log(`  +${scraped.length} portraits (map size: ${imageMap.size})`);
  }

  let matched = 0;
  let searched = 0;

  for (const entry of data) {
    let found = lookupImage(imageMap, entry);

    if (!found) {
      const queries = [...new Set([entry.name, entry.id, ...(entry.aliases || [])].map(String))];
      for (const query of queries) {
        searched++;
        console.log(`Search: ${entry.name} (query: ${query})...`);
        try {
          const detail = await searchPlayerViaDropdown(page, query);
          if (detail?.src) {
            found = normalizeImageUrl(detail.src);
            if (found) {
              addToMap(imageMap, entry.name, detail.src);
              addToMap(imageMap, entry.id, detail.src);
              if (detail.name) addToMap(imageMap, detail.name, detail.src);
            }
            break;
          }
        } catch (e) {
          console.log(`  search failed: ${e.message}`);
        }
        await sleep(500);
      }
    }

    if (found) {
      entry.imageUrl = found;
      matched++;
      console.log(`OK ${entry.name} (${entry.displayName || entry.id})`);
    } else {
      console.log(`MISS ${entry.name}`);
    }
  }

  saveThemeData('csgo.json', data);
  await browser.close();

  console.log(`\nDone: ${matched}/${data.length} matched (${searched} search attempts)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
