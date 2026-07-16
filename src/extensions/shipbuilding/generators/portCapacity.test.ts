import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearShipbuildingContext, initShipbuildingContext } from "../shipbuildingContext";
import { computePortCapacity } from "./portCapacity";
import type { ShipyardCandidate } from "./shipyardCandidates";

describe("computePortCapacity", () => {
  beforeEach(() => {
    initShipbuildingContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.pack = {
      burgs: [],
      cells: { harbor: new Uint8Array(10) }
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearShipbuildingContext();
  });

  function setup(burgOverride: Partial<Burg>, harbor: number): ShipyardCandidate[] {
    const burgs: Burg[] = [{} as Burg, { i: 1, x: 0, y: 0, cell: 1, ...burgOverride } as Burg];
    worldContext.pack.burgs = burgs;
    (worldContext.pack.cells.harbor as Uint8Array)[1] = harbor;
    return [{ burgId: 1, forestRatio: 0.5 }];
  }

  it("gives a small fishing village a couple of small berths and nothing bigger", () => {
    const candidates = setup({ population: 1 }, 2);
    const capacity = computePortCapacity(candidates)?.get(1);
    expect(capacity).toEqual({ small: 2, medium: 0, large: 0 });
  });

  it("unlocks medium berths once a town clears the medium threshold", () => {
    const candidates = setup({ population: 5 }, 3);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 4, medium: 1, large: 0 });
  });

  it("keeps large berths locked below the large threshold even with a decent harbor", () => {
    const candidates = setup({ population: 15 }, 4);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 7, medium: 2, large: 0 });
  });

  it("unlocks a large berth once total score and harbor quality both clear their thresholds", () => {
    const candidates = setup({ population: 30 }, 5);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 10, medium: 3, large: 1 });
  });

  it("applies the capital bonus multiplicatively", () => {
    const candidates = setup({ population: 30, capital: 1 }, 5);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 15, medium: 5, large: 1 });
  });

  it("stacks capital and citadel bonuses with a maxed-out harbor", () => {
    const candidates = setup({ population: 30, capital: 1, citadel: 1 }, 6);
    expect(computePortCapacity(candidates).get(1)).toEqual({ small: 20, medium: 7, large: 2 });
  });

  it("guarantees at least one small berth even for a tiny population", () => {
    const candidates = setup({ population: 0.001 }, 1);
    expect(computePortCapacity(candidates).get(1)?.small).toBe(1);
  });

  it("skips removed burgs", () => {
    const candidates = setup({ population: 30, removed: true }, 5);
    expect(computePortCapacity(candidates).has(1)).toBe(false);
  });
});
