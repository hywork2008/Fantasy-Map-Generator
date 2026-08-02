import { describe, expect, it } from "vitest";
import { APPEARANCE_MEAN, APPEARANCE_STDDEV, getUnmarriedChance, rollPeakAppearance } from "./personFactory";

describe("getUnmarriedChance", () => {
  it("uses a 20% permanent-unmarried baseline for established ordinary adults", () => {
    expect(getUnmarriedChance(40, "ordinary", false)).toBe(0.2);
  });

  it("keeps dynastic rulers far more likely to be married", () => {
    expect(getUnmarriedChance(40, "dynastic", false)).toBe(0.03);
  });

  it("models late marriage before the late twenties", () => {
    expect(getUnmarriedChance(22, "ordinary", false)).toBe(0.45);
  });

  it("retains the clerical celibacy rate for religious roles", () => {
    expect(getUnmarriedChance(40, "dynastic", true)).toBe(0.2);
  });
});

describe("rollPeakAppearance", () => {
  it("returns integers in 1–100", () => {
    for (let i = 0; i < 50; i++) {
      const a = rollPeakAppearance();
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a)).toBe(true);
    }
  });

  it("clusters near the mean rather than a uniform spread", () => {
    const n = 800;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) samples.push(rollPeakAppearance());

    const mean = samples.reduce((s, v) => s + v, 0) / n;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);

    // Mean should sit near μ=50 (allow sampling noise)
    expect(mean).toBeGreaterThan(APPEARANCE_MEAN - 4);
    expect(mean).toBeLessThan(APPEARANCE_MEAN + 4);

    // σ≈15; uniform(1,100) has σ≈28.6 — reject if still near-uniform
    expect(std).toBeGreaterThan(APPEARANCE_STDDEV - 5);
    expect(std).toBeLessThan(APPEARANCE_STDDEV + 5);
    expect(std).toBeLessThan(22);

    // Central band denser than either tail (bell shape)
    const mid = samples.filter(v => v >= 35 && v <= 65).length;
    const lowTail = samples.filter(v => v <= 20).length;
    const highTail = samples.filter(v => v >= 80).length;
    expect(mid).toBeGreaterThan(lowTail + highTail);
    // Extremes should be uncommon (uniform would put ~20% in each ≤20 / ≥80)
    expect(lowTail / n).toBeLessThan(0.08);
    expect(highTail / n).toBeLessThan(0.08);
  });
});
