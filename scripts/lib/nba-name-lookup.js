/**
 * NBA Chinese name helpers for Hupu sync (manual overrides only; no external APIs).
 */

const TRAD_TO_SIMP = {
  維: '维',
  亞: '亚',
  馬: '马',
  東: '东',
  喬: '乔',
  約: '约',
  華: '华',
  國: '国',
  學: '学',
  爾: '尔',
  裏: '里',
  裡: '里',
  溫: '温',
  凱: '凯',
  韋: '韦',
  達: '达',
  萬: '万',
  羅: '罗',
  傑: '杰',
  歐: '欧',
  諾: '诺',
  賈: '贾',
  庫: '库',
  湯: '汤',
  蘭: '兰',
  貝: '贝',
  薩: '萨',
  茲: '兹',
  穆: '穆',
  頓: '顿',
  萊: '莱',
  蓋: '盖',
  倫: '伦',
  納: '纳',
  體: '体',
  會: '会',
  聯: '联',
  選: '选',
  順: '顺',
  輪: '轮',
  後: '后',
  衛: '卫',
  鋒: '锋',
};

/** Manual Chinese names when Hupu page has no zh label */
const MANUAL_ZH_NAMES = {
  'Koa Peat': '科阿·皮特',
  'Koa-Peat': '科阿·皮特',
};

function getManualChineseName(enName) {
  const key = String(enName || '').trim();
  return MANUAL_ZH_NAMES[key] || MANUAL_ZH_NAMES[key.replace(/-/g, ' ')] || null;
}

function hasCJK(s) {
  return /[\u4e00-\u9fff]/.test(String(s || ''));
}

function tradToSimp(text) {
  return String(text || '')
    .split('')
    .map((ch) => TRAD_TO_SIMP[ch] || ch)
    .join('');
}

function createLookupCache() {
  const nameCache = new Map();

  return {
    async getChineseName(enName) {
      const key = String(enName || '').toLowerCase();
      if (nameCache.has(key)) return nameCache.get(key);
      const result = getManualChineseName(enName);
      nameCache.set(key, result);
      return result;
    },
    async getChineseSchool(enSchool, schoolMap) {
      const key = String(enSchool || '').trim();
      if (schoolMap[key]) return schoolMap[key];
      for (const [k, v] of Object.entries(schoolMap)) {
        if (key.toLowerCase() === k.toLowerCase()) return v;
      }
      return key || null;
    },
  };
}

module.exports = {
  hasCJK,
  tradToSimp,
  getManualChineseName,
  createLookupCache,
};
