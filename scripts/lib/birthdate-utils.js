/** Shared birth-date helpers for data scripts (mirrors server/services/ageUtils.ts). */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeBirthDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  // Hupu: 1996年7月30日
  const zh = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (zh) return `${zh[1]}-${pad2(zh[2])}-${pad2(zh[3])}`;

  return null;
}

function computeAge(birthDate, asOf = new Date()) {
  const bd = normalizeBirthDate(birthDate);
  if (!bd) return null;
  const parts = bd.split(/[-/]/).map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;

  const [year, month, day] = parts;
  let age = asOf.getFullYear() - year;
  const todayCode = (asOf.getMonth() + 1) * 100 + asOf.getDate();
  const birthCode = month * 100 + day;
  if (todayCode < birthCode) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function applyBirthDate(player, birthDate) {
  const bd = normalizeBirthDate(birthDate);
  if (!bd) return false;
  player.birthDate = bd;
  const age = computeAge(bd);
  if (age != null) player.age = age;
  return true;
}

module.exports = {
  normalizeBirthDate,
  computeAge,
  applyBirthDate,
};
