/**
 * CS:GO roster helpers — country/team labels, IGL maps, position inference.
 * Used by Perfect World sync and Liquipedia patch scripts (no external HLTV scraping).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../server/data');

/** @type {Record<string, string>} HLTV English country name → 中文 */
const COUNTRY_EN_TO_ZH = {
  France: '法国',
  Denmark: '丹麦',
  Sweden: '瑞典',
  Norway: '挪威',
  Finland: '芬兰',
  Poland: '波兰',
  Germany: '德国',
  Austria: '奥地利',
  Switzerland: '瑞士',
  Netherlands: '荷兰',
  Belgium: '比利时',
  'United Kingdom': '英国',
  England: '英格兰',
  Scotland: '苏格兰',
  Wales: '威尔士',
  Ireland: '爱尔兰',
  Spain: '西班牙',
  Portugal: '葡萄牙',
  Italy: '意大利',
  Croatia: '克罗地亚',
  Serbia: '塞尔维亚',
  'Bosnia and Herzegovina': '波黑',
  Slovenia: '斯洛文尼亚',
  'Czech Republic': '捷克',
  Czechia: '捷克',
  Slovakia: '斯洛伐克',
  Hungary: '匈牙利',
  Romania: '罗马尼亚',
  Bulgaria: '保加利亚',
  Greece: '希腊',
  Russia: '俄罗斯',
  Ukraine: '乌克兰',
  Belarus: '白俄罗斯',
  Latvia: '拉脱维亚',
  Lithuania: '立陶宛',
  Estonia: '爱沙尼亚',
  Moldova: '摩尔多瓦',
  Kazakhstan: '哈萨克斯坦',
  Uzbekistan: '乌兹别克斯坦',
  Mongolia: '蒙古',
  China: '中国',
  'Hong Kong': '中国香港',
  Taiwan: '中国台湾',
  Japan: '日本',
  'South Korea': '韩国',
  Australia: '澳大利亚',
  'New Zealand': '新西兰',
  Brazil: '巴西',
  Argentina: '阿根廷',
  Uruguay: '乌拉圭',
  Chile: '智利',
  Colombia: '哥伦比亚',
  Mexico: '墨西哥',
  Canada: '加拿大',
  USA: '美国',
  'United States': '美国',
  Turkey: '土耳其',
  Israel: '以色列',
  'South Africa': '南非',
  Morocco: '摩洛哥',
  Egypt: '埃及',
  Indonesia: '印度尼西亚',
  Philippines: '菲律宾',
  Vietnam: '越南',
  Thailand: '泰国',
  India: '印度',
  ' Saudi Arabia': '沙特阿拉伯',
  'Saudi Arabia': '沙特阿拉伯',
  UAE: '阿联酋',
  'United Arab Emirates': '阿联酋',
  Qatar: '卡塔尔',
  Iran: '伊朗',
  Kosovo: '科索沃',
  Montenegro: '黑山',
  'North Macedonia': '北马其顿',
  Macedonia: '北马其顿',
  Iceland: '冰岛',
  Luxembourg: '卢森堡',
  Cyprus: '塞浦路斯',
  Malta: '马耳他',
  Georgia: '格鲁吉亚',
  Armenia: '亚美尼亚',
  Azerbaijan: '阿塞拜疆',
  Kyrgyzstan: '吉尔吉斯斯坦',
  Bolivia: '玻利维亚',
  Peru: '秘鲁',
  Venezuela: '委内瑞拉',
  Paraguay: '巴拉圭',
  Ecuador: '厄瓜多尔',
  Cuba: '古巴',
  'Costa Rica': '哥斯达黎加',
  Panama: '巴拿马',
  Nicaragua: '尼加拉瓜',
  Honduras: '洪都拉斯',
  'El Salvador': '萨尔瓦多',
  Guatemala: '危地马拉',
  Jamaica: '牙买加',
  'Trinidad and Tobago': '特立尼达和多巴哥',
  Nigeria: '尼日利亚',
  Senegal: '塞内加尔',
  Ghana: '加纳',
  'Ivory Coast': '科特迪瓦',
  "Côte d'Ivoire": '科特迪瓦',
  Cameroon: '喀麦隆',
  Tunisia: '突尼斯',
  Algeria: '阿尔及利亚',
  Kenya: '肯尼亚',
  Namibia: '纳米比亚',
  Botswana: '博茨瓦纳',
  Zimbabwe: '津巴布韦',
  Pakistan: '巴基斯坦',
  Bangladesh: '孟加拉国',
  'Sri Lanka': '斯里兰卡',
  Nepal: '尼泊尔',
  Singapore: '新加坡',
  Malaysia: '马来西亚',
  Cambodia: '柬埔寨',
  Laos: '老挝',
  Myanmar: '缅甸',
  Brunei: '文莱',
};

/** @type {Record<string, string>} HLTV team name → 中文/常用名 */
const TEAM_EN_TO_ZH = {
  Vitality: 'Vitality',
  Falcons: 'Falcons',
  MOUZ: 'MOUZ',
  'Team Spirit': 'Spirit',
  Spirit: 'Spirit',
  G2: 'G2',
  FaZe: 'FaZe',
  'Natus Vincere': 'NAVI',
  NAVI: 'NAVI',
  Liquid: 'Liquid',
  'Team Liquid': 'Liquid',
  Heroic: 'Heroic',
  Astralis: 'Astralis',
  FURIA: 'FURIA',
  'Virtus.pro': 'VP',
  '3DMAX': '3DMAX',
  BIG: 'BIG',
  Complexity: 'Complexity',
  Cloud9: 'Cloud9',
  ENCE: 'ENCE',
  NIP: 'NIP',
  'The MongolZ': 'The MongolZ',
  TYLOO: 'TYLOO',
  'Lynn Vision': 'LVG',
  paiN: 'paiN',
  Legacy: 'Legacy',
  GamerLegion: 'GamerLegion',
  Monte: 'Monte',
  SAW: 'SAW',
  Passion: 'Passion UA',
  'Passion UA': 'Passion UA',
  Aurora: 'Aurora',
  BetBoom: 'BB',
  BB: 'BB',
  B8: 'B8',
  M80: 'M80',
  ECLOT: 'ECLOT',
  Imperial: 'Imperial',
  OG: 'OG',
  'Gentle Mates': 'Gentle Mates',
  FUT: 'FUT',
  PVISION: 'PVISION',
  '9z': '9z',
};

const POSITION_EN_TO_ZH = {
  AWPer: '狙击手',
  Sniper: '狙击手',
  Rifler: '步枪手',
  Entry: '步枪手',
  Lurker: '步枪手',
  Support: '步枪手',
  IGL: '指挥',
};

/** Known in-game leaders (nick / id lowercase) */
const KNOWN_IGL = new Set(
  [
    'apex',
    'karrigan',
    'snax',
    'chopper',
    'siuhy',
    'aleksib',
    'boombl4',
    'hooxi',
    'tabsen',
    'ztr',
    'gla1ve',
    'nitr0',
    'fallen',
    'biguzera',
    'jt',
    'buzz',
    's1n',
    'blamef',
    'kyxsan',
    'malbsmd',
    'jerry',
    'krystal',
    'adamb',
    'sdy',
    'b1st',
    'exit',
    'arrozdoce',
    'maka',
    'fear',
    'karrigan',
    'cadian',
    'cadiaN',
    'dexter',
    '910',
    'z4kr',
  ].map((s) => s.toLowerCase())
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function toPlayerId(ign) {
  return String(ign || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function loadRoleOverrides() {
  try {
    const { loadTheme } = require('./theme-data');
    return loadTheme('csgo').meta.roleOverrides || { igl: [], awper: [] };
  } catch {
    return { igl: [], awper: [] };
  }
}

function buildPositionMaps(existingData) {
  const byId = new Map();
  const awpers = new Set();
  const igls = new Set();

  const overrides = loadRoleOverrides();
  for (const n of overrides.awper || []) awpers.add(normalizeKey(n));

  for (const entry of existingData || []) {
    const key = normalizeKey(entry.id || entry.name);
    if (entry.position) {
      byId.set(key, entry.position);
      if (entry.position === 'AWPer' || entry.position === '狙击手') awpers.add(key);
    }
  }

  return { byId, awpers, igls };
}

function countryToZh(name) {
  if (!name || name === '-') return '未知';
  const direct = COUNTRY_EN_TO_ZH[name];
  if (direct) return direct;

  const geo = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'geo/nationality-regions.json'), 'utf8')
  );
  for (const zh of Object.keys(geo.countries || {})) {
    if (normalizeKey(zh) === normalizeKey(name)) return zh;
  }
  return name;
}

function teamToZh(name) {
  if (!name) return '未知';
  return TEAM_EN_TO_ZH[name] || name;
}

function positionToZh(pos) {
  if (!pos) return '步枪手';
  if (POSITION_EN_TO_ZH[pos]) return POSITION_EN_TO_ZH[pos];
  if (['狙击手', '步枪手', '指挥'].includes(pos)) return pos;
  return '步枪手';
}

function countMajorWins(achievements) {
  if (!Array.isArray(achievements)) return 0;
  return achievements.filter(
    (a) => /major/i.test(a.event?.name || '') && /^1st$/i.test(String(a.place || '').trim())
  ).length;
}

function roundRating(val) {
  const n = Number(val);
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function resolvePosition(ign, positionMaps) {
  const key = normalizeKey(toPlayerId(ign));
  if (positionMaps.igls.has(key)) return '指挥';
  if (positionMaps.awpers.has(key)) return '狙击手';
  const prev = positionMaps.byId.get(key);
  if (prev) return positionToZh(prev);
  return '步枪手';
}

function loadTeamIgls() {
  try {
    const { loadTheme } = require('./theme-data');
    return loadTheme('csgo').meta.teamIgls || {};
  } catch {
    return {};
  }
}

function playerMatchesNick(player, nick) {
  const key = normalizeKey(nick);
  if (normalizeKey(player.name) === key) return true;
  if (normalizeKey(player.id) === key) return true;
  for (const a of player.aliases || []) {
    if (normalizeKey(a) === key) return true;
  }
  return false;
}

function inferTeamPositions(teamPlayers, positionMaps) {
  const teamIgls = loadTeamIgls();
  const teamName = teamPlayers[0]?.team;
  const designatedIgl = teamName ? teamIgls[teamName] : null;

  for (const p of teamPlayers) {
    const key = normalizeKey(p.id || p.name);

    if (designatedIgl) {
      p.position = playerMatchesNick(p, designatedIgl)
        ? '指挥'
        : positionMaps.awpers.has(key)
          ? '狙击手'
          : '步枪手';
      continue;
    }

    p.position = positionMaps.awpers.has(key) ? '狙击手' : '步枪手';
  }

  const snipers = teamPlayers.filter((p) => p.position === '狙击手');
  if (snipers.length > 1) {
    const primary =
      snipers.find((p) => positionMaps.awpers.has(normalizeKey(p.id))) || snipers[0];
    for (const p of teamPlayers) {
      if (p.position === '狙击手' && p !== primary) p.position = '步枪手';
    }
  }

  const hasAwper = teamPlayers.some((p) => p.position === '狙击手');
  if (!hasAwper && teamPlayers.length) {
    const awpCandidate = teamPlayers.find(
      (p) =>
        p.position !== '指挥' && positionMaps.awpers.has(normalizeKey(p.id))
    );
    if (awpCandidate) awpCandidate.position = '狙击手';
  }
}

async function withRetry(fn, { retries = 4, baseDelayMs = 2000, label = '' } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (!/cloudflare|access denied|403|429/i.test(msg) || i === retries - 1) {
        throw err;
      }
      const wait = baseDelayMs * (i + 1);
      console.warn(`  [RETRY] ${label || 'request'} (${i + 1}/${retries}) in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

module.exports = {
  sleep,
  normalizeKey,
  toPlayerId,
  countryToZh,
  teamToZh,
  positionToZh,
  countMajorWins,
  roundRating,
  buildPositionMaps,
  resolvePosition,
  inferTeamPositions,
  playerMatchesNick,
  loadTeamIgls,
  withRetry,
  COUNTRY_EN_TO_ZH,
  TEAM_EN_TO_ZH,
};
