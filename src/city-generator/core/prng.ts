// Deterministic seeded PRNG. mulberry32 + xmur3 string seeding — both public
// domain (github.com/bryc/code). Kept in-tree so src/city-generator/ stays
// dependency-free (the world app's `alea` is not imported here).

export interface Rng {
  /** Next float in [0, 1). */
  (): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
}

export function makeRng(seed: string): Rng {
  const seedFn = xmur3(seed);
  let a = seedFn();

  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = next as Rng;
  rng.range = (min, max) => min + (max - min) * next();
  rng.int = (min, max) => min + Math.floor(next() * (max - min));
  return rng;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
