/**
 * Deterministic pseudo-random number generation.
 * mulberry32: tiny, fast, good enough for games & reproducible simulations.
 */
export type Rng = {
  /** uniform in [0, 1) */
  next(): number;
  /** standard normal (Box–Muller) */
  normal(): number;
  /** uniform in [a, b) */
  range(a: number, b: number): number;
  /** integer in [a, b] */
  int(a: number, b: number): number;
  /** exponential with given mean */
  exp(mean: number): number;
  pick<T>(arr: readonly T[]): T;
};

export function hashSeed(seed: number, salt: string): number {
  // FNV-1a over salt mixed with seed → independent sub-streams per purpose
  let h = 2166136261 ^ (seed >>> 0);
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  let spare: number | null = null;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      while (u <= 1e-12) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    range: (x, y) => x + (y - x) * next(),
    int: (x, y) => x + Math.floor(next() * (y - x + 1)),
    exp(mean) {
      let u = 0;
      while (u <= 1e-12) u = next();
      return -Math.log(u) * mean;
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
  return rng;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}
