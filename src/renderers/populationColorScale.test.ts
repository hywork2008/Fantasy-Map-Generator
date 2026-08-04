import { describe, expect, it } from "vitest";
import { buildPopulationColorMetrics, heatBucketToColorT, ratioToHeatBucket } from "./populationColorScale";

describe("ratioToHeatBucket / heatBucketToColorT", () => {
  it("uses falsy 0 for empty and truthy 1–10 for heat (getIsolines-safe)", () => {
    expect(ratioToHeatBucket(0)).toBe(0);
    expect(ratioToHeatBucket(-1)).toBe(0);
    expect(ratioToHeatBucket(0.05)).toBe(1);
    expect(ratioToHeatBucket(0.5)).toBe(6);
    expect(ratioToHeatBucket(0.95)).toBe(10);
    expect(ratioToHeatBucket(1)).toBe(10);
    expect(ratioToHeatBucket(1.5)).toBe(10);
  });

  it("maps buckets 1–10 onto the sequential color domain", () => {
    expect(heatBucketToColorT(0)).toBe(0);
    expect(heatBucketToColorT(1)).toBeCloseTo(0.1);
    expect(heatBucketToColorT(10)).toBe(1);
  });
});

describe("buildPopulationColorMetrics", () => {
  const base = {
    cellIds: [0, 1, 2],
    pop: [0, 50, 10],
    area: [100, 100, 100],
    capacity: [0, 100, 100],
    height: [10, 30, 30], // cell 0 = water
    burgs: [] as { i?: number; removed?: boolean; cell?: number; population?: number }[],
    populationRate: 1,
    urbanization: 1,
    isInScope: () => true
  };

  it("capacity scale colors by occupancy, not absolute population", () => {
    const { getBucket } = buildPopulationColorMetrics({ ...base, colorScale: "capacity" });

    // Cell 1: 50% full → band 6 (floor(5)+1)
    expect(getBucket(1)).toBe(6);
    // Cell 2: 10% full → band 2
    expect(getBucket(2)).toBe(2);
    // Water / empty → 0 (falsy for getIsolines)
    expect(getBucket(0)).toBe(0);
  });

  it("capacity scale treats near-full cells as darkest even when absolute pop is small", () => {
    const { getBucket } = buildPopulationColorMetrics({
      cellIds: [0, 1],
      pop: [9, 90],
      area: [100, 100],
      capacity: [10, 1000],
      height: [30, 30],
      burgs: [],
      populationRate: 1,
      urbanization: 1,
      colorScale: "capacity",
      isInScope: () => true
    });

    // 9/10 = 90% → 10; 90/1000 = 9% → 1
    expect(getBucket(0)).toBe(10);
    expect(getBucket(1)).toBe(1);
  });

  it("never returns a truthy negative bucket that would paint ocean in getIsolines", () => {
    const { getBucket } = buildPopulationColorMetrics({ ...base, colorScale: "capacity" });
    for (const id of base.cellIds) {
      const bucket = getBucket(id);
      expect(bucket).toBeGreaterThanOrEqual(0);
      // -1 is truthy and would be outlined as a fill type covering seas
      expect(bucket).not.toBe(-1);
    }
  });

  it("relativeDensity scale keeps legacy map-max behavior", () => {
    const { getBucket } = buildPopulationColorMetrics({
      cellIds: [0, 1, 2],
      // Densities: 0, 50, 0.5 — only cells with density ≥ 1 receive heat
      pop: [0, 5000, 50],
      area: [100, 100, 100],
      capacity: [0, 100, 100],
      height: [30, 30, 30],
      burgs: [],
      populationRate: 1,
      urbanization: 1,
      colorScale: "relativeDensity",
      isInScope: () => true
    });

    // Max density cell gets the top bucket
    expect(getBucket(1)).toBe(10);
    // Sparse cell under density < 1 threshold → no heat
    expect(getBucket(2)).toBe(0);
    expect(getBucket(0)).toBe(0);
  });

  it("relativeDensity colors mid-density cells between zero and map max", () => {
    const { getBucket } = buildPopulationColorMetrics({
      cellIds: [0, 1],
      pop: [100, 10_000],
      area: [10, 10],
      capacity: [1000, 1000],
      height: [30, 30],
      burgs: [],
      populationRate: 1,
      urbanization: 1,
      colorScale: "relativeDensity",
      isInScope: () => true
    });

    expect(getBucket(1)).toBe(10);
    const mid = getBucket(0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);
  });

  it("does not assign heat to water even when rural pop is present", () => {
    const { getBucket } = buildPopulationColorMetrics({
      cellIds: [0],
      pop: [50],
      area: [100],
      capacity: [100],
      height: [5],
      burgs: [],
      populationRate: 1,
      urbanization: 1,
      colorScale: "capacity",
      isInScope: () => true
    });
    expect(getBucket(0)).toBe(0);
  });
});
