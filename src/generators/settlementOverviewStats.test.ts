import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import { collectSettlementOverviewStats } from "./settlementOverviewStats";

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
