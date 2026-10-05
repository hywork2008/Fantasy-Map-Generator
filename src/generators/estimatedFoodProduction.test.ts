import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { estimateCellFoodProduction } from "./estimatedFoodProduction";
import { estimateFoodClimateYield } from "./foodClimateEstimate";

function fixture(flow: number): WorldContext {
  return {
    distanceScale: 1,
    populationRate: 1,
    biomesData: { habitability: [100, 0], tags: [["arable"], []] },
    grid: { cells: { temp: new Int8Array([14, 14, 14]), prec: new Uint8Array([8, 8, 8]) } },
    pack: {
      burgs: [],
      rivers: [],
      cells: {
        i: new Uint16Array([0, 1, 2]),
        g: new Uint16Array([0, 1, 2]),
        h: new Uint8Array([50, 50, 50]),
        area: new Float32Array([1, 1, 1]),
        biomeCode: new Uint8Array([0, 0, 1]),
        r: new Uint16Array([0, 0, 7]),
        c: [[2], [2], [0, 1]],
        riverDownstream: new Int32Array([-1, -1, -1]),
        fl: new Float32Array([0, 0, flow]),
        forestCover: new Float32Array(3)
      }
    }
  } as unknown as WorldContext;
}

describe("offline calibrated food production", () => {
  it("shares finite river water between fields and preserves the channel reserve", () => {
    const limited = estimateCellFoodProduction(fixture(10));
    const abundant = estimateCellFoodProduction(fixture(1000));
    expect(limited.deliveredWater[0]).toBeGreaterThan(0);
    expect(limited.deliveredWater[0]).toBeCloseTo(limited.deliveredWater[1]);
    expect(limited.deliveredWater[0] + limited.deliveredWater[1]).toBeLessThanOrEqual(30 * 10 * 0.45 * 0.4 + 1e-5);
    expect(abundant.deliveredWater[0]).toBeGreaterThan(limited.deliveredWater[0]);
    expect(limited.allocation.residualFlowByCell[2]).toBeGreaterThanOrEqual(30 * 10 * 0.55);
  });

  it("keeps a dry Degoryesk-like cell at zero agricultural yield", () => {
    expect(estimateFoodClimateYield(4, 5, "alluvial")).toBe(0);
    expect(estimateFoodClimateYield(4, 8, "alluvial")).toBeGreaterThan(0);
  });

  it("does not invent river water when flux is missing or zero", () => {
    const world = fixture(0);
    expect(Array.from(estimateCellFoodProduction(world).deliveredWater)).toEqual([0, 0, 0]);
    delete (world.pack.cells as Partial<typeof world.pack.cells>).fl;
    expect(Array.from(estimateCellFoodProduction(world).deliveredWater)).toEqual([0, 0, 0]);
  });
});
