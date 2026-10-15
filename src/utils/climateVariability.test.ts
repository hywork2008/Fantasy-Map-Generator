import { describe, expect, it } from "vitest";
import {
  type ClimateVariabilityOptions,
  getColdEpisodeDepth,
  getGlobalClimateAnomaly,
  getLatitudeAmplification,
  getMonthlyCellAnomalyC,
  getVolcanicAnomalyC,
  normalizeClimateVariability
} from "./climateVariability";

const base: ClimateVariabilityOptions = {
  start: "later",
  mode: "irregular",
  periodYears: 450,
  depthC: 0.5,
  volcanicPerCentury: 0.8,
  anchorYear: 1000
};

describe("climate variability", () => {
  it("is off for missing or off options (old saves)", () => {
    const off = normalizeClimateVariability(undefined);
    expect(off.start).toBe("off");
    for (const y of [-500, 0, 1000, 1500]) {
      const a = getGlobalClimateAnomaly(off, "seed", y);
      expect(a.episodeC).toBe(0);
      expect(a.volcanicC).toBe(0);
    }
  });

  it("is a pure function of seed and year, also for negative years", () => {
    for (const y of [-3000, -1, 0, 1234, 9999]) {
      expect(getGlobalClimateAnomaly(base, "abc", y)).toEqual(getGlobalClimateAnomaly(base, "abc", y));
    }
    const seq = Array.from({ length: 50 }, (_, i) => getGlobalClimateAnomaly(base, "abc", 1400 + i * 7).episodeC);
    const skipped = Array.from(
      { length: 50 },
      (_, i) => getGlobalClimateAnomaly(base, "abc", 1400 + (49 - i) * 7).episodeC
    ).reverse();
    expect(seq).toEqual(skipped);
  });

  it("fromStart puts the anchor year inside a cold episode; later starts warm and cools afterwards", () => {
    for (const mode of ["periodic", "irregular"] as const)
      for (const seed of ["a", "b", "c", "d"]) {
        const from = { ...base, mode, start: "fromStart" as const };
        expect(getColdEpisodeDepth(from, seed, from.anchorYear)).toBeGreaterThan(0.5);
        const later = { ...base, mode, start: "later" as const };
        expect(getColdEpisodeDepth(later, seed, later.anchorYear)).toBe(0);
        const firstCentury = Array.from({ length: 450 }, (_, i) =>
          getColdEpisodeDepth(later, seed, later.anchorYear + i)
        );
        expect(Math.max(...firstCentury)).toBeGreaterThan(0.5);
      }
  });

  it("irregular episodes recur at roughly the configured spacing and take a plausible share of time", () => {
    for (const seed of ["x", "y", "z"]) {
      let cold = 0;
      let onsets = 0;
      let wasCold = false;
      for (let y = 0; y < 20000; y++) {
        const isCold = getColdEpisodeDepth(base, seed, base.anchorYear + y) > 0.05;
        if (isCold) cold++;
        if (isCold && !wasCold) onsets++;
        wasCold = isCold;
      }
      const spacing = 20000 / onsets;
      expect(spacing).toBeGreaterThan(450 * 0.9);
      expect(spacing).toBeLessThan(450 * 2);
      expect(cold / 20000).toBeGreaterThan(0.1);
      expect(cold / 20000).toBeLessThan(0.4);
    }
  });

  it("depth scales the episode, including frozen-world depths", () => {
    const deep = { ...base, start: "fromStart" as const, depthC: 20 };
    expect(getGlobalClimateAnomaly(deep, "s", deep.anchorYear).episodeC).toBeLessThan(-10);
    expect(normalizeClimateVariability({ ...deep, depthC: 999 }).depthC).toBe(30);
  });

  it("volcanic cold summers are rare, short and roughly Tambora-sized", () => {
    let years = 0;
    let min = 0;
    for (let y = 0; y < 10000; y++) {
      const v = getVolcanicAnomalyC({ ...base, start: "fromStart", depthC: 0 }, "v", y);
      if (v < -0.1) years++;
      min = Math.min(min, v);
    }
    expect(years / 10000).toBeGreaterThan(0.005);
    expect(years / 10000).toBeLessThan(0.06);
    expect(min).toBeGreaterThan(-3);
  });

  it("amplifies toward the poles with an area-weighted mean of 1", () => {
    expect(getLatitudeAmplification(70)).toBeGreaterThan(getLatitudeAmplification(10));
    let sum = 0;
    let w = 0;
    for (let lat = 0.5; lat < 90; lat++) {
      const c = Math.cos((lat * Math.PI) / 180);
      sum += getLatitudeAmplification(lat) * c;
      w += c;
    }
    expect(sum / w).toBeCloseTo(1, 2);
  });

  it("cell anomaly keeps the global component as its annual mean and is colder in continental winters", () => {
    const warmth = Array.from({ length: 12 }, (_, m) => Math.cos((2 * Math.PI * (m - 6.5)) / 12));
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const a = getMonthlyCellAnomalyC({ episodeC: -1, volcanicC: 0 }, 50, 0.9, warmth, 2001);
    const mean = a.reduce((s, v, m) => s + v * days[m], 0) / 365;
    expect(mean).toBeCloseTo(-getLatitudeAmplification(50), 6);
    expect(a[0]).toBeLessThan(a[6]);
    const v = getMonthlyCellAnomalyC({ episodeC: 0, volcanicC: -1 }, 50, 0.5, warmth, 2001);
    expect(v[6]).toBeLessThan(v[0]);
  });
});
