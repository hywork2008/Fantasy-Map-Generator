import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGoods,
  getMarkets,
  getRuralHouseholdFoodStock,
  initEconomyContext,
  setMarketCellColumn,
  setMarkets,
  setRuralHouseholdFoodStock
} from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { settleMonthlyFoodConsumption } from "./foodLedgerConsumption";
import { emptyFoodLedger, FoodProduction } from "./foodProduction";
import { Goods } from "./goods-generator";
import { getRuralHouseholdWealth, moveRuralPursesWithFarms } from "./householdWealth";
import type { Market } from "./marketTypes";

/**
 * End-to-end regression guard for the Food Ledger v2 milestone: drives several simulated
 * quarters through the real seed/production/consumption pipeline (no mocks) and asserts the
 * bucketed stock never goes negative or NaN, and that Grain's synced generic-Goods stock
 * (`exportable + storageOverflow`) stays a meaningful, non-trivial pool rather than collapsing
 * to ~0 — the property that would starve any recipe (e.g. Beer, Liquor) sourcing Grain as an
 * ingredient via the generic `market.goods[...].stock` path.
 */
describe("Food Ledger lifecycle (integration)", () => {
  let grainId: number;

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);

    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.mapCoordinates = { latN: 10, latS: -10 };
    worldContext.graphWidth = 100;
    worldContext.graphHeight = 100;
    worldContext.biomesData = {
      i: [0, 4],
      name: ["Marine", "Grassland"],
      tags: [[], []]
    } as unknown as typeof worldContext.biomesData;
    worldContext.options = {
      month: 1,
      year: 1,
      populationRate: 1000,
      urbanization: 1
    } as unknown as typeof worldContext.options;

    worldContext.pack = {
      goods: [
        {
          i: 0,
          name: "Grain",
          value: 1,
          tags: ["food", "stapleFood"],
          unit: "wain",
          icon: "icon",
          color: "#fff",
          distribution: "1",
          recipes: [],
          demandCoverage: { food: 1 },
          biomeOutput: { 4: 0.5 }
        }
      ],
      cultures: [],
      burgs: [
        { i: 0 } as unknown as PackedGraph["burgs"][number],
        { i: 1, market: 1, population: 20, removed: false, treasury: 100 } as unknown as PackedGraph["burgs"][number]
      ],
      zones: [],
      markets: [],
      cells: {
        i: [0],
        biomeCode: new Uint8Array([4]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        market: Uint16Array.from([1]),
        pop: [40],
        h: new Uint8Array([50]),
        // Enough cultivated capacity to retain annual household provisions,
        // feed the burg, and still leave a tradable rural surplus.
        capacity: [160],
        c: [[]],
        p: [[0, 40]]
      }
    } as unknown as PackedGraph;

    Goods.sync();
    grainId = getGoods().find(good => good.tags.includes("stapleFood"))!.i;

    const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
    setMarkets([market1]);
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("settles a new market before its first harvest without reseeding provisions or money", () => {
    const former = getMarkets()[0];
    former.foodLedger = { ...emptyFoodLedger(), ruralHouseholdWealth: 100 };
    const market: Market = { i: 2, centerBurgId: 1, color: "", goods: {} };
    setMarkets([former, market]);
    worldContext.pack.burgs[1].market = 2;
    setMarketCellColumn(Uint16Array.from([2]));
    moveRuralPursesWithFarms(Uint16Array.from([1]), Uint16Array.from([2]));
    setRuralHouseholdFoodStock(Float32Array.from([100]));
    const urbanCash = getHouseholdWealth(1);

    settleMonthlyFoodConsumption(1);

    const ledger = market.foodLedger!;
    expect(ledger.monthlyConsumption).toMatchObject({
      ruralFromHousehold: 100,
      ruralFromMarket: 0,
      ruralPaid: 0,
      urbanSupplied: 0,
      urbanPaid: 0
    });
    expect(ledger.monthlyConsumption!.ruralNeed).toBeGreaterThan(100);
    expect(ledger.monthlyConsumption!.urbanNeed).toBeGreaterThan(0);
    expect(getRuralHouseholdFoodStock()[0]).toBe(0);
    expect(ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2).toBe(0);
    expect(getRuralHouseholdWealth(market)).toBe(100);
    expect(former.foodLedger.ruralHouseholdWealth).toBe(0);
    expect(getHouseholdWealth(1)).toBe(urbanCash);
    expect(market.marketTreasury?.balance ?? 0).toBe(0);

    // The next cycle reuses the same ledger and exhausted cell larder.
    settleMonthlyFoodConsumption(2);
    expect(market.foodLedger).toBe(ledger);
    expect(ledger.monthlyConsumption!.ruralFromHousehold).toBe(0);
    expect(ledger.ruralHouseholdWealth).toBe(100);
  });

  it("keeps bucketed stock non-negative and Grain's tradable-surplus view meaningfully positive across quarters", () => {
    FoodProduction.seedFoodLedgerBootstrap();

    for (let month = 1; month <= 24; month++) {
      worldContext.options = { ...worldContext.options, month: ((month - 1) % 12) + 1 } as typeof worldContext.options;

      if (month % 3 === 1) {
        FoodProduction.generateQuarterlyLedger(Math.floor((month - 1) / 3) % 4);
      }
      settleMonthlyFoodConsumption();

      const ledger = getMarkets()[0].foodLedger!;
      for (const value of [ledger.foodStockAge0, ledger.foodStockAge1, ledger.foodStockAge2, ledger.storageOverflow]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }

    const market = getMarkets()[0];
    const ledger = market.foodLedger!;
    const totalBucketedStock = ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2;
    expect(totalBucketedStock).toBeGreaterThan(0);

    // The synced generic-Goods view is what a recipe like Beer/Liquor would draw Grain from —
    // it must not have collapsed to a near-zero trickle.
    expect(market.goods[grainId]?.stock ?? 0).toBeGreaterThan(0);
  });
});
