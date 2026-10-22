import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGoods,
  getMarkets,
  initEconomyContext,
  setBurgMarketLedgers,
  setFarmLaborRequired,
  setGoods,
  setHouseholdTextileWorkers,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import { type GoodFlowRecord, setGoodFlowObserver } from "./goodsBalanceLedger";
import type { FoodLedger } from "./marketTypes";
import {
  getMarketBlanketDemandProfile,
  getMarketTextileDemandProfile,
  settleTextileHouseholdDemand
} from "./textileDemand";

const byName = (name: string) => getGoods().find(good => good.name === name)!;

describe("rural household wool processing", () => {
  let flows: GoodFlowRecord[];
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.grid = { cells: { temp: Int8Array.from([10]) } } as typeof worldContext.grid;
    worldContext.pack = {
      burgs: [],
      states: [],
      cells: {
        i: [0],
        h: Uint8Array.from([30]),
        pop: Float32Array.from([100]),
        g: Uint16Array.from([0]),
        maleAdults: Float32Array.from([20]),
        femaleAdults: Float32Array.from([20])
      }
    } as unknown as PackedGraph;
    setGoods(["Wool", "Wool Cloth", "Wool Garments", "Wool Blankets"].map(name => Goods.getDefaultGood(name)!));
    Goods.sync();
    setMarketCellColumn(Uint16Array.from([1]));
    setBurgMarketLedgers([]);
    setHouseholdTextileWorkers(Float32Array.from([5000]));
    setFarmLaborRequired(Float32Array.from([30]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 0,
        color: "",
        goods: Object.fromEntries(
          getGoods().map(good => [good.i, { stock: good.name === "Wool" ? 1000 : 0, price: good.value }])
        ),
        foodLedger: { ruralHouseholdWealth: 100_000 } as FoodLedger,
        marketTreasury: { balance: 10, ruralGrainPayable: 0 }
      }
    ]);
    flows = [];
    setGoodFlowObserver(flow => flows.push(flow));
  });
  afterEach(() => {
    setGoodFlowObserver(null);
    clearEconomyContext();
  });

  it("pays for real fiber and uses shared labor to self-supply independent replacements without buying them twice", () => {
    const market = getMarkets()[0];
    const wool = byName("Wool");
    const woolBefore = market.goods[wool.i].stock;
    settleTextileHouseholdDemand();
    const home = market.ruralTextileProduction!;
    expect(home.garments).toBeGreaterThan(0);
    expect(home.blankets).toBeGreaterThan(0);
    expect(home.laborUsed).toBeGreaterThan(0);
    expect(home.laborUsed).toBeLessThanOrEqual(home.laborCapacity);
    const paid = home.garmentSpending + home.blanketSpending;
    expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(100_000 - paid, 8);
    expect(market.marketTreasury!.balance).toBeCloseTo(10 + paid, 8);
    expect((woolBefore - market.goods[wool.i].stock) * wool.value).toBeCloseTo(paid, 8);
    expect(market.textileLedger!.householdConsumption).toBeCloseTo(home.garments, 2);
    expect(market.blanketLedger!.householdConsumption).toBeCloseTo(home.blankets, 2);
    expect(home.garments).toBeLessThanOrEqual(getMarketTextileDemandProfile(1).monthlyDemand);
    expect(home.blankets).toBeLessThanOrEqual(getMarketBlanketDemandProfile(1).monthlyDemand);
    for (const good of getGoods().filter(good => good.name !== "Wool")) {
      expect(market.goods[good.i].stock).toBe(0);
      const produced = flows
        .filter(flow => flow.goodId === good.i && flow.direction === "source")
        .reduce((sum, flow) => sum + flow.units, 0);
      const consumed = flows
        .filter(flow => flow.goodId === good.i && flow.direction === "sink")
        .reduce((sum, flow) => sum + flow.units, 0);
      expect(produced).toBeCloseTo(consumed, 10);
    }
    expect(market.textileLedger!.ruralHomeProduction).toBe(home.garments);
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.laborUsed).toBeLessThanOrEqual(home.laborCapacity);
    expect(market.textileLedger!.cumulativeRuralHomeProduction).toBeCloseTo(
      home.garments + market.ruralTextileProduction!.garments,
      10
    );
  });

  it.each(["cash", "fiber", "labor", "population"])("does not create products without %s", missing => {
    const market = getMarkets()[0];
    if (missing === "cash") market.foodLedger!.ruralHouseholdWealth = 0;
    if (missing === "fiber") market.goods[byName("Wool").i].stock = 0;
    if (missing === "labor") setHouseholdTextileWorkers(new Float32Array());
    if (missing === "population") {
      worldContext.pack.cells.maleAdults.fill(0);
      worldContext.pack.cells.femaleAdults.fill(0);
    }
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.garments).toBe(0);
    expect(market.ruralTextileProduction!.blankets).toBe(0);
    expect(market.marketTreasury!.balance).toBe(10);
  });

  it("uses the same labor for weaving and both final goods and caps work after adult losses", () => {
    setHouseholdTextileWorkers(Float32Array.from([10]));
    setFarmLaborRequired(Float32Array.from([0.01]));
    settleTextileHouseholdDemand();
    expect(getMarkets()[0].ruralTextileProduction!.laborUsed).toBeLessThanOrEqual(10);
    const home = getMarkets()[0].ruralTextileProduction!;
    expect(home.laborUsed).toBeCloseTo(
      home.garments * (0.972 + 0.259 / 0.9) * 1000 + home.blankets * (0.0151875 + (0.259 * 250) / 0.95 / 4000) * 1000,
      8
    );
    worldContext.pack.cells.maleAdults[0] = 0.001;
    worldContext.pack.cells.femaleAdults[0] = 0.001;
    settleTextileHouseholdDemand();
    expect(getMarkets()[0].ruralTextileProduction!.laborCapacity).toBeCloseTo(2, 5);
  });

  it("can buy fiber for self-supply when finished stock exists but households cannot afford enough", () => {
    const market = getMarkets()[0];
    market.foodLedger!.ruralHouseholdWealth = 100;
    market.goods[byName("Wool Garments").i].stock = 100;
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.garments).toBeGreaterThan(5 / byName("Wool Garments").value);
    expect(market.ruralTextileProduction!.garmentSpending).toBeLessThanOrEqual(5);
    expect(market.foodLedger!.ruralHouseholdWealth).toBeGreaterThanOrEqual(95);
  });

  it("keeps edited multi-input recipes with the workshops and gives existing finished supply priority", () => {
    byName("Wool Cloth").recipes = [{ [byName("Wool").i]: 6, 12345: 1 }];
    settleTextileHouseholdDemand();
    expect(getMarkets()[0].ruralTextileProduction!.laborUsed).toBe(0);
    byName("Wool Cloth").recipes = [{ [byName("Wool").i]: 6 }];
    const market = getMarkets()[0];
    market.goods[byName("Wool Garments").i].stock = 100;
    market.goods[byName("Wool Blankets").i].stock = 100;
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.laborUsed).toBe(0);
    expect(market.textileLedger!.ruralConsumption).toBeGreaterThan(0);
  });
});
