import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const windmillFraction = vi.hoisted(() => ({ value: 0.5 }));
vi.mock("../../hostCore", async importOriginal => ({
  ...(await importOriginal<typeof import("../../hostCore")>()),
  getDailyWindStats: () => ({
    meanSpeed: 5,
    maxSpeed: 7,
    maxHour: 14,
    calmFraction: 0,
    windmillFraction: windmillFraction.value
  })
}));

import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setDamSites, setGoods, setMarkets } from "../economyContext";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import { millCountsForBurg, settleMilling, WINDMILL_REFERENCE_WORKING_SHARE } from "./millCapacity";

/** W3 sensitivity: windmill output follows the cell's monthly windmill working share. */
describe("windmill utilization from the wind climate", () => {
  const { pack, grid, options, mapCoordinates, graphHeight } = worldContext;

  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext: { currentYear: 1350, currentMonth: 4 }
    } as unknown as ExtensionAPI);
    worldContext.options = { ...options, historicalPeriod: "highMedieval", winds: [0, 0, 90, 0, 0, 0] };
    worldContext.mapCoordinates = { latN: 90, latT: 180 } as typeof mapCoordinates;
    worldContext.graphHeight = 100;
    // A dry town (no river) so only the windmill grinds.
    worldContext.pack = {
      burgs: [{}, { i: 1, cell: 0, market: 1, x: 0, y: 50 }],
      cells: { r: [0], fl: [0], h: [30], g: [0] }
    } as unknown as PackedGraph;
    worldContext.grid = { cells: { h: new Uint8Array([30]) } } as unknown as typeof grid;
    setGoods([
      { i: 1, name: "Grain", tags: ["food", "stapleFood"], value: 1, unit: "wain" },
      { i: 2, name: "Flour", tags: ["food"], value: 1.5, unit: "sack", recipes: [{ 1: 1 }] }
    ] as Good[]);
    setDamSites([]);
  });

  afterEach(() => {
    Object.assign(worldContext, { pack, grid, options, mapCoordinates, graphHeight });
    clearEconomyContext();
  });

  function mill(): number {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: {},
        foodLedger: {
          foodStockAge0: 8,
          exportable: 8,
          foodStockAge1: 0,
          foodStockAge2: 0,
          storageOverflow: 0
        }
      } as unknown as Market
    ]);
    return settleMilling();
  }

  it("mills a full batch at a good site and less where the wind is weak", () => {
    windmillFraction.value = WINDMILL_REFERENCE_WORKING_SHARE;
    expect(millCountsForBurg(1)).toEqual({ wind: 1, water: 0, windUtilization: 1 });
    expect(mill()).toBe(1);
    windmillFraction.value = WINDMILL_REFERENCE_WORKING_SHARE / 4;
    expect(millCountsForBurg(1).windUtilization).toBe(0.25);
    expect(mill()).toBe(0.25);
    windmillFraction.value = 0;
    expect(mill()).toBe(0);
  });

  it("caps utilization at a full batch on very windy sites", () => {
    windmillFraction.value = 0.9;
    expect(millCountsForBurg(1).windUtilization).toBe(1);
  });
});
