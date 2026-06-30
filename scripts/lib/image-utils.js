const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'server', 'data');
const UA = 'GuessWhoGame/1.0 (local quiz; educational)';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function hasChinese(s) {
  return /[\u4e00-\u9fff]/.test(String(s));
}

function pickEnglishName(entry) {
  const candidates = [];
  if (!hasChinese(entry.name)) candidates.push(entry.name);
  for (const a of entry.aliases || []) {
    if (/^[A-Za-z0-9\s.'\-]+$/.test(String(a)) && String(a).length > 2) {
      candidates.push(a);
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || null;
}

function englishNames(entry) {
  const names = new Set();
  if (!hasChinese(entry.name)) names.add(entry.name);
  for (const a of entry.aliases || []) {
    if (/^[A-Za-z0-9\s.'\-]+$/.test(String(a)) && String(a).length > 2) {
      names.add(a);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  const lower = url.toLowerCase();
  return !lower.includes('/icon') && !lower.includes('logo.svg');
}

async function safeJson(res) {
  if (!res?.ok) return null;
  const text = await res.text();
  if (!text?.trim().startsWith('{') && !text?.trim().startsWith('[')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchJson(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': UA, ...opts.headers },
      });
      if (res.status === 429) {
        await delay(2000 * (i + 1));
        continue;
      }
      return await safeJson(res);
    } catch {
      await delay(1000);
    }
  }
  return null;
}

const {
  loadThemeData,
  saveThemeData,
  loadPlayers,
} = require('./theme-data');

function printCoverage() {
  console.log('\n=== Coverage ===');
  for (const theme of ['csgo', 'football', 'nba', 'pokemon']) {
    const data = loadPlayers(theme);
    console.log(`${theme}.json: ${data.filter((e) => e.imageUrl).length}/${data.length}`);
  }
}

module.exports = {
  DATA_DIR,
  UA,
  delay,
  hasChinese,
  pickEnglishName,
  englishNames,
  isValidImageUrl,
  fetchJson,
  loadThemeData,
  saveThemeData,
  printCoverage,
};
