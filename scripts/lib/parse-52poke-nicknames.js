/** Parse 52poke wiki unofficial name list; returns Map<officialZhName, string[]> */
function parse52PokeNicknames(content) {
  const map = new Map();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const colon = trimmed.indexOf('：');
    if (colon === -1) continue;
    const left = trimmed.slice(2, colon);
    const right = trimmed.slice(colon + 1);
    const nameMatch = left.match(/^([\u4e00-\u9fff·]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const nicks = right
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter((s) => s && /[\u4e00-\u9fff]/.test(s));
    if (nicks.length === 0) continue;
    if (!map.has(name)) map.set(name, new Set());
    for (const n of nicks) map.get(name).add(n);
  }
  return map;
}

module.exports = { parse52PokeNicknames };
