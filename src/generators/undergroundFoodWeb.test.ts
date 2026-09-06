import { describe, expect, it } from "vitest";
import {
  computeUndergroundCellCapacity,
  computeUndergroundDomainCapacity,
  type UndergroundFoodWebCells
} from "./undergroundFoodWeb";

describe("computeUndergroundCellCapacity", () => {
  it("is zero when the cell has no void (no cavity to inhabit)", () => {
    const cells: UndergroundFoodWebCells = { area: [10], subterraneanVoid: [0] };
    expect(computeUndergroundCellCapacity(0, cells, {}, undefined, 5, 0.3)).toBe(0);
  });

  it("draws seepage from the overhead cell's own surface capacity", () => {
    const barren: UndergroundFoodWebCells = {
      area: [10],
      subterraneanVoid: [0.5],
      subsistenceNonAgriculturalCapacity: [0]
    };
    const fed: UndergroundFoodWebCells = {
      area: [10],
      subterraneanVoid: [0.5],
      subsistenceNonAgriculturalCapacity: [20]
    };
    const barrenCapacity = computeUndergroundCellCapacity(0, barren, {}, undefined, 5, 0.3);
    const fedCapacity = computeUndergroundCellCapacity(0, fed, {}, undefined, 5, 0.3);
    expect(fedCapacity).toBeGreaterThan(barrenCapacity);
  });

  it("gives a volcanic cell nonzero capacity even with zero overhead surface productivity", () => {
    const cells: UndergroundFoodWebCells = {
      area: [10],
      subterraneanVoid: [0.5],
      subsistenceNonAgriculturalCapacity: [0],
      biomeCode: [1]
    };
    const biomesData = { tags: [[], ["volcanic"]] };
    const capacity = computeUndergroundCellCapacity(0, cells, {}, biomesData, 5, 0.3);
    expect(capacity).toBeGreaterThan(0);
  });

  it("is capped by the physical void ceiling even with unlimited primary production inputs", () => {
    const cells: UndergroundFoodWebCells = {
      area: [10],
      subterraneanVoid: [0.01], // tiny cavity
      subsistenceNonAgriculturalCapacity: [10000],
      biomeCode: [1]
    };
    const biomesData = { tags: [[], ["volcanic"]] };
    // Safety ceiling set high so the void ceiling is the binding constraint.
    const capacity = computeUndergroundCellCapacity(0, cells, {}, biomesData, 5, 100);
    const physicalCeiling = 0.01 * 10 * 5 * 1.0;
    expect(capacity).toBeCloseTo(physicalCeiling, 5);
  });

  it("is capped by the race's populationCapacityMultiplier safety ceiling", () => {
    const cells: UndergroundFoodWebCells = {
      area: [10],
      subterraneanVoid: [1], // huge cavity, not the binding constraint
      subsistenceNonAgriculturalCapacity: [10000],
      biomeCode: [1]
    };
    const biomesData = { tags: [[], ["volcanic"]] };
    const referenceDensity = 5;
    const multiplier = 0.3;
    const capacity = computeUndergroundCellCapacity(0, cells, {}, biomesData, referenceDensity, multiplier);
    const safetyCeiling = referenceDensity * 10 * multiplier;
    expect(capacity).toBeCloseTo(safetyCeiling, 5);
  });

  it("adds hive brood only when the overhead climate is temperate/wet enough", () => {
    const cells: UndergroundFoodWebCells = { area: [10], subterraneanVoid: [0.5] };
    const cold = computeUndergroundCellCapacity(
      0,
      cells,
      { temperature: [-20], precipitation: [50] },
      undefined,
      5,
      0.3
    );
    const temperate = computeUndergroundCellCapacity(
      0,
      cells,
      { temperature: [15], precipitation: [50] },
      undefined,
      5,
      0.3
    );
    expect(temperate).toBeGreaterThan(cold);
  });

  it("adds worm offtake on top of primary production, still bounded by ceilings", () => {
    const cells: UndergroundFoodWebCells = { area: [10], subterraneanVoid: [0.5] };
    const withoutWorm = computeUndergroundCellCapacity(0, cells, {}, undefined, 5, 1, 0);
    const withWorm = computeUndergroundCellCapacity(0, cells, {}, undefined, 5, 1, 5);
    expect(withWorm).toBeGreaterThanOrEqual(withoutWorm);
  });
});

describe("computeUndergroundDomainCapacity", () => {
  it("returns a capacity entry for every domain cell", () => {
    const cells: UndergroundFoodWebCells = {
      area: [10, 10, 10],
      subterraneanVoid: [0.5, 0.6, 0]
    };
    const result = computeUndergroundDomainCapacity([0, 1, 2], cells, {}, undefined, 5, 0.3);
    expect(result.size).toBe(3);
    expect(result.get(2)).toBe(0);
    expect(result.get(0)).toBeGreaterThanOrEqual(0);
  });

  it("applies per-cell worm offtake overrides", () => {
    const cells: UndergroundFoodWebCells = { area: [10, 10], subterraneanVoid: [0.5, 0.5] };
    const result = computeUndergroundDomainCapacity([0, 1], cells, {}, undefined, 5, 1, { 0: 5 });
    expect(result.get(0)!).toBeGreaterThan(result.get(1)!);
  });
});
