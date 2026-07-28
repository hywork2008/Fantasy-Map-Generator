import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getSmelterOperations,
  initEconomyContext,
  setGoods,
  setMarkets,
  setMineOperations,
  setMineralDeposits
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { SmelterOperations } from "./smelterOperations";

describe("SmelterOperationsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.biomesData = { tags: [[], ["forest"]] } as typeof worldContext.biomesData;
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [5, 0]
        ],
        c: [[1], [0]],
        biomeCode: Uint8Array.from([0, 1]),
        r: Uint16Array.from([0, 1])
      }
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Iron Ore", tags: ["ore"], value: 2, unit: "wagon", icon: "iron", color: "#777" },
      { i: 2, name: "Iron Ingot", tags: ["ingot"], value: 4, unit: "wagon", icon: "iron", color: "#777" },
      { i: 3, name: "Coal", tags: ["mineral"], value: 1, unit: "wagon", icon: "coal", color: "#333" }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 20, price: 2 } } }]);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 10,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  it("places a smelter at the neighboring river-and-forest site, then refines bounded Ore stock", () => {
    SmelterOperations.generate();

    expect(getSmelterOperations()).toEqual([
      expect.objectContaining({
        depositId: 1,
        cell: 1,
        burgId: 1,
        marketId: 1,
        waterPower: 1,
        fuelAccess: 1,
        annualCapacityTons: 120,
        smeltingYield: 0.8,
        securityInvestment: 0,
        active: true
      })
    ]);

    SmelterOperations.produceMonth();

    expect(getMarkets()[0].goods[1].stock).toBe(10);
    expect(getMarkets()[0].goods[2].stock).toBe(8);
  });

  it("does not create a smelter for mines that produce only unsmelted fuel minerals", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "coalSeam",
        primaryCommodity: "coal",
        commodities: ["coal"],
        yields: [{ commodity: "coal", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);

    SmelterOperations.generate();

    expect(getSmelterOperations()).toEqual([]);
  });
});
