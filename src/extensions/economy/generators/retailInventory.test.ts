import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarketShipments,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import {
  getBurgTradeableGoodStock,
  getRetailGoodStock,
  getRetailLocalityMultiplier,
  planRetailReplenishment,
  reconcileRetailInventory,
  removeBurgTradeableGoodStock,
  tickRetailInventory,
  validateRetailInventory
} from "./retailInventory";

vi.mock("./tradeRoutePlanner", () => ({
  TradeRoutePlanner: {
    findRoutePath: vi.fn(() => ({
      points: [],
      segments: [
        {
          type: "land",
          points: [
            [0, 0, 0],
            [10, 0, 1]
          ]
        }
      ]
    }))
  }
}));

vi.mock("./tradeRouteDuration", () => ({
  calculateRouteDurationDays: vi.fn(() => 7)
}));

describe("retail inventory logistics", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext: { tickCount: 0, extensions: {} }
    } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.options = { gunpowderEraEnabled: true } as typeof worldContext.options;
    worldContext.pack = {
      burgs: [
        { i: 0 } as Burg,
        { i: 1, name: "Origin", market: 1, population: 100, x: 0, y: 0, cell: 0 } as Burg,
        { i: 2, name: "Destination", market: 1, population: 100, x: 10, y: 0, cell: 1 } as Burg
      ],
      cells: { i: [0, 1], routes: { 0: { 1: 0 } } },
      states: [{ i: 0 }]
    } as unknown as PackedGraph;
    setGoods([
      {
        i: 1,
        name: "Cloth",
        value: 10,
        tags: [],
        unit: "bale",
        icon: "",
        color: "",
        distribution: "1",
        recipes: []
      },
      {
        i: 2,
        name: "Cats",
        value: 3,
        tags: ["liveAnimal", "pestControl"],
        unit: "head",
        icon: "",
        color: "",
        distribution: "1",
        recipes: []
      }
    ]);
    Goods.sync();
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: { 1: { stock: 100, price: 10 }, 2: { stock: 1, price: 3 } }
    };
    setMarkets([market]);
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("uses the route duration for delivery and retains it as a shelf-local price premium", () => {
    reconcileRetailInventory();
    planRetailReplenishment();

    expect(getMarketShipments()).toMatchObject([
      { originBurgId: 1, destinationBurgId: 2, units: 10, dispatchedTick: 0, arrivalTick: 7, travelDays: 7 }
    ]);

    tickRetailInventory(7);

    expect(getRetailGoodStock(2, 1, 1)).toMatchObject({ onHand: 10, transportDays: 7 });
    expect(getRetailLocalityMultiplier(2, 1, 1)).toBeCloseTo(1.028);
    expect(Markets.retailBuyPrice(10, 2, 1, 1)).toBe(11.31);
    expect(Markets.retailSellPrice(10, 2, 1, 1)).toBe(8.75);
    expect(validateRetailInventory()).toEqual([]);
  });

  it("makes a burg's wholesale stock available to a local player without creating a shipment", () => {
    reconcileRetailInventory();

    expect(getBurgTradeableGoodStock(1, 1, 1)).toBe(100);
    expect(getBurgTradeableGoodStock(1, 1, 2)).toBe(1);
    expect(removeBurgTradeableGoodStock(1, 1, 1, 20)).toBe(true);
    expect(removeBurgTradeableGoodStock(1, 1, 2, 1)).toBe(true);
    getMarkets()[0].goods[1].stock -= 20;
    getMarkets()[0].goods[2].stock -= 1;
    expect(getMarketShipments()).toEqual([]);
    expect(validateRetailInventory()).toEqual([]);
  });
});
