/** Levenshtein edit distance */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? row[j - 1]
          : Math.min(row[j] + 1, prev + 1, row[j - 1] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Max allowed typos by input length and theme */
export function maxEditDistance(inputLen: number, theme: string): number {
  if (theme === 'csgo') {
    if (inputLen <= 3) return 0;
    if (inputLen <= 7) return 1;
    return 2;
  }
  if (inputLen <= 1) return 0;
  if (inputLen <= 3) return 1;
  if (inputLen <= 6) return 2;
  return Math.min(3, Math.floor(inputLen / 3));
}

export function isFuzzyMatch(
  input: string,
  candidate: string,
  theme: string
): boolean {
  const dist = levenshtein(input, candidate);
  return dist <= maxEditDistance(input.length, theme);
}

/** Pick single best match; null if ambiguous tie */
export function pickBestFuzzy<T>(
  input: string,
  items: Array<{ key: string; value: T }>,
  theme: string
): T | null {
  const bestByValue = new Map<T, number>();

  for (const item of items) {
    const dist = levenshtein(input, item.key);
    const max = maxEditDistance(input.length, theme);
    if (dist <= max) {
      const prev = bestByValue.get(item.value);
      if (prev === undefined || dist < prev) {
        bestByValue.set(item.value, dist);
      }
    }
  }

  if (bestByValue.size === 0) return null;

  let bestDist = Infinity;
  let bestValues: T[] = [];

  for (const [value, dist] of bestByValue) {
    if (dist < bestDist) {
      bestDist = dist;
      bestValues = [value];
    } else if (dist === bestDist) {
      bestValues.push(value);
    }
  }

  if (bestValues.length !== 1) return null;
  return bestValues[0];
}

/** Substring / contains match for partial input (min 2 chars) */
export function isPartialMatch(input: string, candidate: string): boolean {
  if (input.length < 2) return false;
  return candidate.includes(input) || input.includes(candidate);
}
