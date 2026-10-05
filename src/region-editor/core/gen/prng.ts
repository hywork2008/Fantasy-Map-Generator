/**
 * 決定的擬似乱数生成器 (Deterministic PRNG)
 * 外部ストアや世界マップの RNG に依存せず、独立して再現可能なシード系列を提供する。
 */
export function makeRng(seed: string): {
  next: () => number;
  range: (min: number, max: number) => number;
  choice: <T>(items: readonly T[]) => T;
  intRange: (min: number, max: number) => number;
} {
  let state = 2166136261;
  for (const ch of seed) state = Math.imul(state ^ ch.charCodeAt(0), 16777619);

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const intRange = (min: number, max: number): number => Math.floor(range(min, max + 1));

  const choice = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("Cannot choose from empty array");
    return items[Math.floor(next() * items.length)];
  };

  return { next, range, choice, intRange };
}
