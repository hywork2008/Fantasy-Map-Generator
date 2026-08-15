import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import {
  collectIndependentBurgStats,
  collectSettlementOverviewStats,
  countIndependentBurgs
} from "./settlementOverviewStats";

describe("collectSettlementOverviewStats", () => {
  it("separates unclaimed and unsettled capacity from governed population", () => {
    const pack = {
      cells: {
        i: new Uint16Array([0, 1, 2]),
        state: new Uint16Array([0, 1, 1]),
        capacity: new Float32Array([10, 20, 30]),
        pop: new Float32Array([0, 12, 0])
      },
      burgs: [0, { i: 1, state: 1, population: 5 }, { i: 2, state: 0, population: 99 }]
    } as unknown as PackedGraph;

    expect(collectSettlementOverviewStats(pack, 1000, 2)).toEqual({
      unclaimedCapacity: 10_000,
      unsettledCapacity: 40_000,
      governedPopulation: 22_000
    });
  });
});

describe("countIndependentBurgs", () => {
  it("counts live burgs whose owner is unclaimed land", () => {
    const burgs = [
      0,
      { i: 1, state: 1 },
      { i: 2, state: 0 },
      { i: 3, state: 0, removed: true },
      { i: 4 },
      { i: 0, state: 0 }
    ] as unknown as PackedGraph["burgs"];

    expect(countIndependentBurgs(burgs)).toBe(2);
  });

  it("returns 0 when there are no independent burgs", () => {
    expect(countIndependentBurgs(undefined)).toBe(0);
    expect(countIndependentBurgs([{ i: 1, state: 2 }] as unknown as PackedGraph["burgs"])).toBe(0);
  });
});

describe("collectIndependentBurgStats", () => {
  it("sums area and population of independent burg cells only", () => {
    const pack = {
      cells: {
        area: new Float32Array([0, 4, 7, 11, 13]),
        pop: new Float32Array([0, 2, 3, 5, 8])
      },
      burgs: [
        0,
        { i: 1, state: 1, cell: 1, population: 20 },
        { i: 2, state: 0, cell: 2, population: 9 },
        { i: 3, state: 0, cell: 3, population: 6, removed: true },
        { i: 4, state: 0, cell: 4, population: 4 }
      ]
    } as unknown as PackedGraph;

    expect(collectIndependentBurgStats(pack)).toEqual({
      count: 2,
      cells: 2,
      area: 20,
      rural: 11,
      urban: 13
    });
  });

  it("returns zeros when there is nothing to count", () => {
    expect(collectIndependentBurgStats(undefined)).toEqual({
      count: 0,
      cells: 0,
      area: 0,
      rural: 0,
      urban: 0
    });
    expect(
      collectIndependentBurgStats({
        cells: { area: new Float32Array([5]), pop: new Float32Array([3]) },
        burgs: [{ i: 1, state: 2, cell: 0, population: 99 }]
      } as unknown as PackedGraph)
    ).toEqual({
      count: 0,
      cells: 0,
      area: 0,
      rural: 0,
      urban: 0
    });
  });
});
