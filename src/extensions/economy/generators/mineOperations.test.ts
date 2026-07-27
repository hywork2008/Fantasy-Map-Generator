import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getMineOperations,
  getMineralDeposits,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setMineralDeposits
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { MineOperations } from "./mineOperations";

describe("MineOperationsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: {
        i: [0],
        p: [[0, 0]],
        h: Uint8Array.from([55]),
        r: Uint16Array.from([0]),
        routes: {}
      }
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Lead", tags: ["ore"], value: 3, unit: "wagon", icon: "lead", color: "#777" },
      { i: 2, name: "Silver", tags: ["ore"], value: 20, unit: "bullion", icon: "silver", color: "#ccc" }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setGoodCellColumn(new Uint16Array([0]));
    setMarketCellColumn(new Uint16Array([1]));
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  it("creates an accessible operation and supplies every co-product to its market", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "lead",
        commodities: ["lead", "silver"],
        yields: [
          { commodity: "lead", reserveTons: 100, annualCapacityTons: 120 },
          { commodity: "silver", reserveTons: 20, annualCapacityTons: 12 }
        ],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: false,
        exhausted: false
      }
    ]);

    MineOperations.generate();
    MineOperations.produceMonth();

    expect(getMineOperations()).toHaveLength(1);
    expect(getMineralDeposits()[0].discovered).toBe(true);
    expect(getMineralDeposits()[0].yields[0].reserveTons).toBeLessThan(100);
    expect(getMarkets()[0].goods[1].stock).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[2].stock).toBeGreaterThan(0);
  });

  it("exhausts a deposit instead of supplying it indefinitely", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "lead",
        commodities: ["lead"],
        yields: [{ commodity: "lead", reserveTons: 0.1, annualCapacityTons: 120 }],
        richness: 1,
        depth: "surface",
        accessibility: 1,
        discovered: false,
        exhausted: false
      }
    ]);

    MineOperations.generate();
    MineOperations.produceMonth();
    const stockAfterExhaustion = getMarkets()[0].goods[1].stock;
    MineOperations.produceMonth();

    expect(getMineralDeposits()[0].exhausted).toBe(true);
    expect(getMineOperations()[0].active).toBe(false);
    expect(getMarkets()[0].goods[1].stock).toBe(stockAfterExhaustion);
  });
});
