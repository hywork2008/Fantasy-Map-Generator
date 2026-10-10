import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setDamSites, setGoods, setMarkets } from "../economyContext";
import type { DamSite } from "./damTypes";
import type { Good } from "./goods-generator";
import type { FoodLedger, Market } from "./marketTypes";
import {
  burgForDamSite,
  drawTradeableGrain,
  millCountsForBurg,
  prevailingWindDeg,
  settleMilling,
  windmillsAllowed
} from "./millCapacity";

function ledger(overrides: Partial<FoodLedger> = {}): FoodLedger {
  return {
    foodProduced: 0,
    ruralNeed: 0,
    urbanNeed: 0,
    exportable: 0,
    importNeed: 0,
    targetStock: 0,
    satisfiedImport: 0,
    importCapacityBonus: 0,
    foodStockAge0: 0,
    foodStockAge1: 0,
    foodStockAge2: 0,
    foodStockAge0UnitCost: 0,
    foodStockAge1UnitCost: 0,
    foodStockAge2UnitCost: 0,
    storageOverflow: 0,
    ruralFoodStressQuarters: 0,
    urbanFoodStressQuarters: 0,
    ruralSevereDeficitQuarters: 0,
    urbanSevereDeficitQuarters: 0,
    ...overrides
  };
}

function dam(cell: number, x = 0, y = 0): DamSite {
  return {
    i: cell + 1,
    cell,
    x,
    y,
    riverId: 1,
    dischargePotential: 1,
    headPotential: 1,
    qualityScore: 1,
    downstreamCells: []
  };
}

describe("drawTradeableGrain", () => {
  it("leaves the reserve and spends overflow before the oldest bucket", () => {
    const book = ledger({ foodStockAge0: 10, foodStockAge2: 4, exportable: 6, storageOverflow: 2 });
    expect(drawTradeableGrain(book, 100)).toBe(8);
    expect(book.storageOverflow).toBe(0);
    expect(book.foodStockAge2).toBe(0);
    expect(book.foodStockAge0).toBe(8);
    expect(book.exportable).toBe(0);
  });

  it("draws only the tradeable share of a named crop", () => {
    const book = ledger({
      foodStockAge0: 10,
      exportable: 4,
      stapleCropInventories: {
        3: { age0: 10, age1: 0, age2: 0, age0UnitCost: 1, age1UnitCost: 0, age2UnitCost: 0, overflow: 0 }
      }
    });
    expect(drawTradeableGrain(book, 100)).toBe(4);
    expect(book.stapleCropInventories?.[3].age0).toBe(6);
    expect(book.foodStockAge0).toBe(6);
    expect(book.exportable).toBe(0);
  });
});

describe("mill counts", () => {
  const pack = worldContext.pack;
  const options = worldContext.options;
  const coordinates = worldContext.mapCoordinates;
  const graphHeight = worldContext.graphHeight;

  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { currentYear: 1350 } } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{}, { i: 1, cell: 0, market: 1, x: 0, y: 10 }],
      cells: { r: [1], fl: [40], h: [30] }
    } as unknown as PackedGraph;
    worldContext.options = { ...options, historicalPeriod: "highMedieval", winds: undefined };
    setDamSites([]);
  });

  afterEach(() => {
    worldContext.pack = pack;
    worldContext.options = options;
    worldContext.mapCoordinates = coordinates;
    worldContext.graphHeight = graphHeight;
    clearEconomyContext();
  });

  it("counts one watermill on a formed river and does not add another for a dam on that cell", () => {
    expect(millCountsForBurg(1)).toEqual({ wind: 0, water: 1 });
    setDamSites([dam(0)]);
    expect(millCountsForBurg(1)).toEqual({ wind: 0, water: 1 });
  });

  it("gives a dam to the nearest burg of its market", () => {
    const burgs = [
      { i: 1, cell: 0, market: 1, x: 0, y: 0 },
      { i: 2, cell: 4, market: 1, x: 100, y: 0 }
    ];
    const owner = burgForDamSite(dam(9, 80, 0), burgs as never, () => 1);
    expect(owner?.i).toBe(2);
  });

  it("counts one windmill when the latitude belt resolves, and none before the high medieval", () => {
    worldContext.mapCoordinates = { latN: 90, latT: 180 };
    worldContext.graphHeight = 100;
    worldContext.options = { ...worldContext.options, winds: [0, 0, 90, 0, 0, 0], historicalPeriod: "highMedieval" };
    worldContext.pack.burgs[1].y = 50;
    expect(prevailingWindDeg(50)).toBe(90);
    expect(windmillsAllowed("earlyMedieval")).toBe(false);
    expect(millCountsForBurg(1).wind).toBe(1);
    worldContext.options = { ...worldContext.options, historicalPeriod: "earlyMedieval" };
    expect(millCountsForBurg(1)).toEqual({ wind: 0, water: 1 });
  });
});

describe("settleMilling", () => {
  const pack = worldContext.pack;
  const options = worldContext.options;

  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { currentYear: 1350 } } as unknown as ExtensionAPI);
    worldContext.options = { ...options, historicalPeriod: "highMedieval" };
    worldContext.pack = {
      burgs: [{}, { i: 1, cell: 0, market: 1, x: 0, y: 0 }],
      cells: { r: [1], fl: [40], h: [30] }
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Grain", tags: ["food", "stapleFood"], value: 1, unit: "wain" },
      { i: 2, name: "Flour", tags: ["food"], value: 1.5, unit: "sack", recipes: [{ 1: 1 }] }
    ] as Good[]);
    setDamSites([]);
  });

  afterEach(() => {
    worldContext.pack = pack;
    worldContext.options = options;
    clearEconomyContext();
  });

  it("mills one sack per watermill and leaves the rest of the surplus", () => {
    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: {},
      foodLedger: ledger({ foodStockAge0: 8, exportable: 8 })
    } as Market;
    setMarkets([market]);
    expect(settleMilling()).toBe(1);
    expect(market.goods[2].stock).toBe(1);
    expect(market.foodLedger?.foodStockAge0).toBe(7);
    expect(market.foodLedger?.exportable).toBe(7);
    expect(market.goods[1].stock).toBe(7);
  });

  it("mills nothing where there is no wind and no river", () => {
    worldContext.pack = {
      burgs: [{}, { i: 1, cell: 0, market: 1, x: 0, y: 0 }],
      cells: { r: [0], fl: [0], h: [30] }
    } as unknown as PackedGraph;
    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: {},
      foodLedger: ledger({ foodStockAge0: 8, exportable: 8 })
    } as Market;
    setMarkets([market]);
    expect(settleMilling()).toBe(0);
    expect(market.goods[2]).toBeUndefined();
    expect(market.foodLedger?.foodStockAge0).toBe(8);
  });
});
