/** Compute age from ISO birth date (YYYY-MM-DD), as of today (server local date). */
export function computeAgeFromBirthDate(
  birthDate: string,
  asOf: Date = new Date()
): number | null {
  const parts = birthDate.split(/[-/]/).map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;

  const [year, month, day] = parts;
  let age = asOf.getFullYear() - year;
  const todayCode = (asOf.getMonth() + 1) * 100 + asOf.getDate();
  const birthCode = month * 100 + day;
  if (todayCode < birthCode) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

/** Football: XHS age is stamped at referenceYear; add year delta at runtime. */
export const FOOTBALL_AGE_REFERENCE_YEAR = 2026;

export function computeAgeFromReferenceYear(
  baseAge: unknown,
  referenceYear: number = FOOTBALL_AGE_REFERENCE_YEAR,
  asOf: Date = new Date()
): number | null {
  const age = typeof baseAge === 'number' ? baseAge : parseInt(String(baseAge ?? ''), 10);
  if (Number.isNaN(age) || age < 0 || age > 120) return null;
  const delta = asOf.getFullYear() - referenceYear;
  const current = age + delta;
  return current >= 0 && current <= 120 ? current : null;
}

export function normalizeBirthDate(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  }
  return null;
}
