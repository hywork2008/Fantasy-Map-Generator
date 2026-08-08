import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Market } from "./marketTypes";

const market: Market = {
  i: 1,
  centerBurgId: 1,
  color: "#fff",
  goods: {
    1: { stock: 3, price: 1 },
    2: { stock: 2, price: 1 },
    3: { stock: 1, price: 1 },
    4: { stock: 1, price: 1 },
    5: { stock: 1, price: 1 }
  }
};

vi.mock("../economyContext", () => ({
  getMarkets: () => [market],
  getGoods: () => [
    { i: 1, name: "Milk" },
    { i: 2, name: "Cheese" },
    { i: 3, name: "Grapes" },
    { i: 4, name: "Raisins" },
    { i: 5, name: "Wine" }
  ],
  getWorldContext: () => ({
    populationRate: 1_000,
    urbanization: 1,
    pack: { burgs: [{ i: 1, market: 1, population: 1 }] }
  })
}));
vi.mock("./foodProduction", () => ({ getMarketRuralPopulation: () => 0 }));

import {
  getFoodProcessingProductionHeadroom,
  recordFoodDeliveredExport,
  recordFoodMarketIntake,
  recordFoodProcessingConsumption,
  recordWineCaskFilling,
  settleFoodProcessingHouseholds
} from "./foodProcessingLedger";

describe("foodProcessingLedger", () => {
  beforeEach(() => {
    market.goods[1].stock = 3;
    market.goods[2].stock = 2;
    market.goods[3].stock = 1;
    market.goods[4].stock = 1;
    market.goods[5].stock = 1;
    market.foodProcessingLedger = undefined;
    market.returnableContainerLedger = undefined;
  });

  it("keeps market intake distinct from processing, household use, and fresh spoilage", () => {
    recordFoodMarketIntake(market, "Milk", 4);
    recordFoodProcessingConsumption(market, "Milk", 1);
    settleFoodProcessingHouseholds();
    const milk = market.foodProcessingLedger!.Milk!;
    expect(milk.marketIntake).toBe(4);
    expect(milk.processingConsumption).toBe(1);
    expect(milk.householdConsumption).toBeGreaterThan(0);
    expect(milk.spoilage).toBeGreaterThan(0);
    expect(market.goods[1].stock).toBe(0);
  });

  it("records physically delivered imports separately from local market intake", () => {
    recordFoodDeliveredExport(market, "Cheese", 0.75);

    expect(market.foodProcessingLedger!.Cheese).toMatchObject({ marketIntake: 0.75, deliveredExport: 0.75 });
  });

  it("limits preserved-food output to three months of household demand", () => {
    recordFoodMarketIntake(market, "Grapes", 1);

    const headroom = getFoodProcessingProductionHeadroom(market, "Wine", 0);
    expect(headroom).toBeGreaterThan(0);

    market.goods[5].stock += headroom;
    expect(getFoodProcessingProductionHeadroom(market, "Wine", 0)).toBe(0);
  });

  it("keeps initial, one-year, and five-year food snapshots bounded in deterministic market scenarios", () => {
    type Snapshot = {
      month: number;
      stock: number[];
      householdConsumption: number;
      unmetDemand: number;
      prices: number[];
      processingEmployment: number;
      wineCaskReturns: number;
    };
    const resetScenario = () => {
      for (const good of Object.values(market.goods)) good.stock = 0;
      market.foodProcessingLedger = undefined;
      market.returnableContainerLedger = undefined;
    };
    const capture = (month: number, processingEmployment: number): Snapshot => {
      const ledger = market.foodProcessingLedger;
      return {
        month,
        stock: [1, 2, 3, 4, 5].map(goodId => market.goods[goodId].stock),
        householdConsumption: Object.values(ledger ?? {}).reduce((sum, good) => sum + good.householdConsumption, 0),
        unmetDemand: Object.values(ledger ?? {}).reduce((sum, good) => sum + good.unmetDemand, 0),
        prices: [2, 5].map(goodId => market.goods[goodId].price),
        processingEmployment,
        wineCaskReturns: market.returnableContainerLedger?.cumulativeWineCaskReturns ?? 0
      };
    };
    const runScenario = (grapeLotsPerMonth: number): Snapshot[] => {
      resetScenario();
      const snapshots = [capture(0, 0)];
      let processingEmployment = 0;
      for (let month = 1; month <= 60; month++) {
        market.goods[1].stock += 1.5;
        recordFoodMarketIntake(market, "Milk", 1.5);
        market.goods[3].stock += grapeLotsPerMonth;
        recordFoodMarketIntake(market, "Grapes", grapeLotsPerMonth);

        const cheeseLots = Math.min(0.1, getFoodProcessingProductionHeadroom(market, "Cheese", 0));
        market.goods[1].stock -= cheeseLots * 10;
        market.goods[2].stock += cheeseLots;
        recordFoodProcessingConsumption(market, "Milk", cheeseLots * 10);
        recordFoodMarketIntake(market, "Cheese", cheeseLots);

        const wineLots = Math.min(
          0.1,
          getFoodProcessingProductionHeadroom(market, "Wine", 0),
          market.goods[3].stock / 0.26
        );
        market.goods[3].stock -= wineLots * 0.26;
        market.goods[5].stock += wineLots;
        recordFoodProcessingConsumption(market, "Grapes", wineLots * 0.26);
        recordFoodMarketIntake(market, "Wine", wineLots);
        recordWineCaskFilling(market, wineLots, wineLots * 0.08);
        processingEmployment += cheeseLots + wineLots;

        settleFoodProcessingHouseholds();
        if (month === 12 || month === 60) snapshots.push(capture(month, processingEmployment));
      }
      return snapshots;
    };

    const vineyardMarket = runScenario(0.2);
    const dairyOnlyMarket = runScenario(0);

    for (const snapshots of [vineyardMarket, dairyOnlyMarket]) {
      expect(snapshots.map(snapshot => snapshot.month)).toEqual([0, 12, 60]);
      expect(snapshots[0].stock).toEqual([0, 0, 0, 0, 0]);
      expect(snapshots[2].stock[0]).toBe(0);
      expect(snapshots[2].stock[2]).toBe(0);
      expect(snapshots[2].householdConsumption).toBeGreaterThan(0);
      expect(snapshots[2].unmetDemand).toBeGreaterThanOrEqual(0);
      expect(snapshots[1].prices).toEqual(snapshots[2].prices);
      expect(snapshots[2].processingEmployment).toBeGreaterThanOrEqual(snapshots[1].processingEmployment);
    }
    expect(vineyardMarket[2].householdConsumption).toBeGreaterThan(dairyOnlyMarket[2].householdConsumption);
    expect(vineyardMarket[2].processingEmployment).toBeGreaterThan(dairyOnlyMarket[2].processingEmployment);
    expect(vineyardMarket[2].wineCaskReturns).toBeGreaterThan(0);
  });
});
