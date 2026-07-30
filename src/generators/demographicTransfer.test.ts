import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../types/models";
import {
  addDemographicBuckets,
  demographicTotal,
  getBurgDemographics,
  getCellDemographics,
  setBurgDemographics,
  setCellDemographics,
  splitDemographicBuckets
} from "./demographicTransfer";

describe("demographicTransfer", () => {
  it("demographicTotal sums all four buckets", () => {
    expect(demographicTotal({ children: 10, maleAdults: 20, femaleAdults: 25, elders: 5 })).toBe(60);
  });

  it("splitDemographicBuckets divides every bucket by the same ratio and preserves the total", () => {
    const buckets = { children: 40, maleAdults: 30, femaleAdults: 20, elders: 10 };
    const { moved, remaining } = splitDemographicBuckets(buckets, 0.25);

    expect(moved).toEqual({ children: 10, maleAdults: 7.5, femaleAdults: 5, elders: 2.5 });
    expect(remaining).toEqual({ children: 30, maleAdults: 22.5, femaleAdults: 15, elders: 7.5 });
    expect(demographicTotal(moved) + demographicTotal(remaining)).toBeCloseTo(demographicTotal(buckets), 10);
  });

  it("splitDemographicBuckets clamps the ratio to [0, 1]", () => {
    const buckets = { children: 10, maleAdults: 10, femaleAdults: 10, elders: 10 };
    expect(splitDemographicBuckets(buckets, 1.5).moved).toEqual(buckets);
    expect(splitDemographicBuckets(buckets, -1).moved).toEqual({
      children: 0,
      maleAdults: 0,
      femaleAdults: 0,
      elders: 0
    });
  });

  it("addDemographicBuckets sums bucket-by-bucket", () => {
    const a = { children: 1, maleAdults: 2, femaleAdults: 3, elders: 4 };
    const b = { children: 10, maleAdults: 20, femaleAdults: 30, elders: 40 };
    expect(addDemographicBuckets(a, b)).toEqual({ children: 11, maleAdults: 22, femaleAdults: 33, elders: 44 });
  });

  it("getCellDemographics/setCellDemographics round-trip and keep cells.pop in sync", () => {
    const cells = {
      children: new Float32Array([5, 0]),
      maleAdults: new Float32Array([3, 0]),
      femaleAdults: new Float32Array([4, 0]),
      elders: new Float32Array([2, 0]),
      pop: new Float32Array([14, 0])
    } as unknown as WorldContext["pack"]["cells"];

    expect(getCellDemographics(cells, 0)).toEqual({ children: 5, maleAdults: 3, femaleAdults: 4, elders: 2 });

    setCellDemographics(cells, 1, { children: 1, maleAdults: 2, femaleAdults: 3, elders: 4 });
    expect(cells.children[1]).toBe(1);
    expect(cells.maleAdults[1]).toBe(2);
    expect(cells.femaleAdults[1]).toBe(3);
    expect(cells.elders[1]).toBe(4);
    expect(cells.pop[1]).toBe(10);
  });

  it("getBurgDemographics reads all-zero for a Burg without demographics", () => {
    const burg: Pick<Burg, "demographics"> = {};
    expect(getBurgDemographics(burg)).toEqual({ children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 });
  });

  it("setBurgDemographics writes all four buckets and keeps population in sync", () => {
    const burg: Burg = {
      cell: 0,
      x: 0,
      y: 0,
      population: 0,
      demographics: { capacity: 100, children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 }
    };

    setBurgDemographics(burg, { children: 10, maleAdults: 20, femaleAdults: 25, elders: 5 });

    expect(burg.demographics).toMatchObject({ children: 10, maleAdults: 20, femaleAdults: 25, elders: 5 });
    expect(burg.population).toBe(60);
  });

  it("setBurgDemographics is a no-op for a Burg without demographics", () => {
    const burg: Burg = { cell: 0, x: 0, y: 0, population: 0 };
    setBurgDemographics(burg, { children: 10, maleAdults: 20, femaleAdults: 25, elders: 5 });
    expect(burg.demographics).toBeUndefined();
    expect(burg.population).toBe(0);
  });

  it("moves a proportional share between a cell and a Burg while preserving the combined total", () => {
    const cells = {
      children: new Float32Array([40]),
      maleAdults: new Float32Array([30]),
      femaleAdults: new Float32Array([20]),
      elders: new Float32Array([10]),
      pop: new Float32Array([100])
    } as unknown as WorldContext["pack"]["cells"];
    const burg: Burg = {
      cell: 0,
      x: 0,
      y: 0,
      population: 0,
      demographics: { capacity: 100, children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 }
    };

    const { moved, remaining } = splitDemographicBuckets(getCellDemographics(cells, 0), 0.3);
    setCellDemographics(cells, 0, remaining);
    setBurgDemographics(burg, addDemographicBuckets(getBurgDemographics(burg), moved));

    expect(cells.pop[0]).toBeCloseTo(70, 10);
    expect(burg.population).toBeCloseTo(30, 10);
    expect(cells.pop[0] + (burg.population ?? 0)).toBeCloseTo(100, 10);
  });
});
