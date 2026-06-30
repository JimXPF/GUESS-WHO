/** Mulberry32 PRNG for deterministic daily/room questions */
export interface SeededRng {
  next(): number;
  nextInt(max: number): number;
  pickOne<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
}

export function hashStringToSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0 || 1;
  const next = () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt(max: number) {
      return Math.floor(next() * max);
    },
    pickOne<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

/** UTC+8 calendar date YYYY-MM-DD */
export function getUtc8DateString(d = new Date()): string {
  const utc8 = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().slice(0, 10);
}
