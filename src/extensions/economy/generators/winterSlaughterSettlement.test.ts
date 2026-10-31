import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const climate = vi.hoisted(() => ({ values: [0, 2, 6, 12, 17, 21, 23, 22, 16, 10, 4, 1] }));
vi.mock("./seasonalCropClimate", async original => ({
  ...(await original<typeof import("./seasonalCropClimate")>()),
  readAgriculturalClimate: () => ({ year: 1300, monthlyMeanTemperatureC: climate.values })
}));

import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { getWinterSlaughterState, winterSlaughterNeedsPhysicalSettlement } from "../context/winterSlaughter";
import {
  clearEconomyContext,
  getGoods,
  getMarkets,
  getOrCreateFaunaStockTable,
  getOrCreateLivestockFeedTable,
  initEconomyContext,
  setGoods,
  setHusbandryMonthlyWorkDays,
  setHusbandryRequiredWorkers,
  setHusbandryWorkers,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import { getLivestockMonthlyFeedNeedKg, harvestLivestockForage, settleLivestockFeed } from "./livestockFeed";
import { withLivestockFeedPeriod } from "./livestockFeedState";
import { settleSlaughter } from "./slaughter";
import { settleWinterSlaughter } from "./winterSlaughterSettlement";

const goods = (name: string) => getGoods().find(good => good.name === name)!;
const period = 1300 * 12 + 9;

describe("physical winter preparation settlement", () => {
  it("spends the saved seasonal work reservation and cannot charge an unreserved neighbour", () => {
    setHusbandryWorkers(Float32Array.from([0.2, 0.2]));
    const calendar = new Float32Array(24);
    calendar[9] = 25;
    setHusbandryMonthlyWorkDays(calendar);
    withLivestockFeedPeriod(period, () => {
      harvestLivestockForage();
      settleWinterSlaughter();
    });
    const samples = getWinterSlaughterState()!.samples;
    const peak = samples.find(sample => sample.cellId === 0)!;
    const idle = samples.find(sample => sample.cellId === 1)!;
    expect(peak.workBudgetBasis).toBe("calendar");
    expect(peak.workReservedDays).toBe(25);
    expect(peak.heads.Sheep).toBeGreaterThan(0);
    expect(peak.workDays + peak.hayWorkDays! + peak.careWorkDays!).toBeLessThanOrEqual(25);
    expect(idle.workReservedDays).toBe(0);
    expect(idle.heads).toEqual({});
    expect(idle.workDays + idle.hayWorkDays! + idle.careWorkDays!).toBe(0);
  });
  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.currentYear = 1300;
    simulationContext.currentMonth = 10;
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.options = {
      ...worldContext.options,
      ruralEcosystemDetail: "detailed",
      winterLivestockSlaughter: "experimental-temperate"
    };
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.pack = {
      cells: {
        i: Uint16Array.from([0, 1]),
        h: Uint8Array.from([30, 30]),
        biomeCode: Uint8Array.from([1, 1]),
        pop: Float32Array.from([100, 100]),
        g: Uint16Array.from([0, 1]),
        burg: Uint16Array.from([0, 0]),
        culture: Uint16Array.from([0, 0]),
        religion: Uint16Array.from([0, 0]),
        area: Float32Array.from([1, 1]),
        state: Uint16Array.from([1, 1]),
        c: [[], []]
      },
      burgs: [{ i: 0 }, { i: 1, cell: 0, market: 1, state: 1, population: 1 }],
      states: [{ i: 0 }, { i: 1, military: [] }],
      cultures: [],
      landUse: {
        cells: [0, 1].map(() => ({
          diagnostics: ["resolved-livestock-land"],
          allocatedAreaHa: 1,
          patches: [{ kind: "pasture", areaHa: 1 }]
        }))
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = { tags: [[], ["grassland"]], habitability: [0, 100] } as never;
    setGoods(
      ["Salt", "Wood", "Sheep", "Fodder", "Tallow", "Leather", "Preserved food", "Pig"].map(
        name => Goods.getDefaultGood(name)!
      )
    );
    Goods.sync();
    setHusbandryWorkers(Float32Array.from([2, 2]));
    setHusbandryRequiredWorkers(Float32Array.from([2, 2]));
    setMarketCellColumn(Uint16Array.from([1, 1]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "",
        goods: {
          [goods("Salt").i]: { stock: 20, price: 3 },
          [goods("Wood").i]: { stock: 0, price: 10 },
          [goods("Sheep").i]: { stock: 5, price: 4 },
          [goods("Fodder").i]: { stock: 0, price: 1 }
        },
        foodLedger: { ruralHouseholdWealth: 1000 } as never,
        marketTreasury: { balance: 500, ruralGrainPayable: 0 }
      }
    ]);
    for (const cell of [0, 1]) getOrCreateFaunaStockTable()![`${cell}:Sheep`] = { young: 30, breeding: 40, old: 20 };
  });
  afterEach(() => clearEconomyContext());

  it("commits herd, material and cash transfers once, then feeds only the remaining animals", () => {
    withLivestockFeedPeriod(period, () => {
      harvestLivestockForage();
      const need = getLivestockMonthlyFeedNeedKg(0);
      const market = getMarkets()[0];
      const cash = market.foodLedger!.ruralHouseholdWealth! + market.marketTreasury!.balance;
      const saltBefore = market.goods[goods("Salt").i].stock;
      settleWinterSlaughter();
      const state = getWinterSlaughterState()!;
      const samples = state.samples;
      expect(samples.reduce((sum, sample) => sum + (sample.heads.Sheep ?? 0), 0)).toBeGreaterThan(0);
      expect(market.foodLedger!.ruralHouseholdWealth! + market.marketTreasury!.balance).toBeCloseTo(cash);
      expect((saltBefore - market.goods[goods("Salt").i].stock) * 60).toBeCloseTo(
        samples.reduce((sum, sample) => sum + sample.saltKg, 0)
      );
      expect(getLivestockMonthlyFeedNeedKg(0)).toBeLessThan(need);
      const saved = JSON.stringify(simulationContext.extensions);
      settleWinterSlaughter();
      expect(JSON.stringify(simulationContext.extensions)).toBe(saved);
      settleLivestockFeed();
      expect(getOrCreateLivestockFeedTable()![0].requiredKg).toBeCloseTo(getLivestockMonthlyFeedNeedKg(0));
      expect(getOrCreateFaunaStockTable()!["0:Sheep"].breeding).toBe(40);
      // The same market animals are neither appropriated nor converted to legacy joint byproducts.
      expect(settleSlaughter()).toEqual({ heads: 0, leather: 0, tallow: 0, rennet: 0, meat: 0, meatSold: 0 });
      expect(market.goods[goods("Sheep").i].stock).toBe(5);
      expect(market.goods[goods("Tallow").i]).toBeUndefined();
    });
  });

  it.each(["off", "simplified"])("leaves unenabled %s maps untouched", mode => {
    if (mode === "off") worldContext.options.winterLivestockSlaughter = "off";
    else worldContext.options.ruralEcosystemDetail = "simplified";
    const before = JSON.stringify(simulationContext.extensions);
    settleWinterSlaughter();
    expect(getWinterSlaughterState()).toBeNull();
    expect(JSON.stringify(simulationContext.extensions)).toBe(before);
  });

  it("continues saved preservation and consumption after new slaughter is disabled", () => {
    expect(winterSlaughterNeedsPhysicalSettlement()).toBe(true);
    withLivestockFeedPeriod(period, () => {
      harvestLivestockForage();
      settleWinterSlaughter();
    });
    const receipts = Object.keys(getWinterSlaughterState()!.receipts).length;
    worldContext.options.winterLivestockSlaughter = "off";
    simulationContext.extensions = JSON.parse(JSON.stringify(simulationContext.extensions));
    expect(winterSlaughterNeedsPhysicalSettlement()).toBe(true);
    withLivestockFeedPeriod(period + 1, () => settleWinterSlaughter());
    const state = getWinterSlaughterState()!;
    expect(Object.keys(state.receipts)).toHaveLength(receipts);
    expect(
      state.samples
        .filter(sample => sample.period === period + 1)
        .reduce((sum, sample) => sum + sample.preservedConsumedKg, 0)
    ).toBeGreaterThan(0);
    withLivestockFeedPeriod(period + 10, () => settleWinterSlaughter());
    expect(winterSlaughterNeedsPhysicalSettlement()).toBe(false);
  });

  it("honors explicit species prohibitions and does not spend for forbidden slaughter", () => {
    goods("Sheep").multipliers = { religion: { 0: 0 } };
    const before = structuredClone(getOrCreateFaunaStockTable());
    withLivestockFeedPeriod(period, () => {
      harvestLivestockForage();
      settleWinterSlaughter();
    });
    expect(getOrCreateFaunaStockTable()).toEqual(before);
    expect(getWinterSlaughterState()!.samples.every(sample => sample.spending === 0)).toBe(true);
  });
});
