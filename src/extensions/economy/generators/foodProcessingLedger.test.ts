import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordCumulativeCellFoodProcessing } from "../economyContext";
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
    5: { stock: 1, price: 1 },
    6: { stock: 4, price: 1 },
    7: { stock: 0, price: 1 }
  }
};
const urbanWaterSystems: unknown[] = [];

vi.mock("../economyContext", () => ({
  getMarkets: () => [market],
  getUrbanWaterSystems: () => urbanWaterSystems,
  getGoods: () => [
    { i: 1, name: "Milk", tags: ["food", "freshFood"] },
    { i: 2, name: "Cheese", tags: ["food"] },
    { i: 3, name: "Grapes", tags: ["food", "freshFood"] },
    { i: 4, name: "Raisins", tags: ["food"] },
    { i: 5, name: "Wine", tags: ["food"] },
    { i: 6, name: "Game", tags: ["food", "freshFood"] },
    { i: 7, name: "Beer", tags: ["food", "beverage"] },
    { i: 8, name: "Apples", tags: ["food", "freshFood"] },
    { i: 9, name: "Pears", tags: ["food", "freshFood"] },
    { i: 10, name: "Cider", tags: ["food", "beverage"] },
    { i: 11, name: "Perry", tags: ["food", "beverage"] },
    { i: 12, name: "Fish", tags: ["food", "freshFood"] },
    { i: 13, name: "Shellfish", tags: ["food", "freshFood"] },
    { i: 14, name: "Iron", tags: ["metal"] }
  ],
  recordCumulativeCellFoodProcessing: vi.fn(),
  getWorldContext: () => ({
    populationRate: 1_000,
    urbanization: 1,
    pack: { burgs: [{ i: 1, market: 1, population: 1 }] }
  })
}));
vi.mock("./marketPopulation", () => ({ getMarketRuralPopulation: () => 0 }));

import {
  CHEESE_RESERVE_MONTHS,
  getAleDemandSnapshot,
  getFoodProcessingProductionHeadroom,
  recordBeerCaskFilling,
  recordCellFoodHouseholdConsumption,
  recordFoodDeliveredExport,
  recordFoodMarketIntake,
  recordFoodProcessingConsumption,
  recordOrchardCaskFilling,
  recordWineCaskFilling,
  refreshAleHouseholdDemand,
  settleFoodProcessingHouseholds
} from "./foodProcessingLedger";

describe("foodProcessingLedger", () => {
  beforeEach(() => {
    vi.mocked(recordCumulativeCellFoodProcessing).mockClear();
    market.goods[1].stock = 3;
    market.goods[2].stock = 2;
    market.goods[3].stock = 1;
    market.goods[4].stock = 1;
    market.goods[5].stock = 1;
    market.goods[6].stock = 4;
    market.goods[7].stock = 0;
    for (const id of [8, 9, 10, 11]) market.goods[id] = { stock: 0, price: 1 };
    market.foodProcessingLedger = undefined;
    market.returnableContainerLedger = undefined;
    urbanWaterSystems.length = 0;
  });

  it.each([
    ["Fish", 12],
    ["Game", 6],
    ["Shellfish", 13]
  ] as const)("records %s preservation inputs without changing stock, demand or cash", (name, goodId) => {
    const before = JSON.stringify(market);
    recordFoodProcessingConsumption(market, name, 0.125);
    expect(recordCumulativeCellFoodProcessing).toHaveBeenCalledExactlyOnceWith(goodId, 0.125);
    expect(JSON.stringify(market)).toBe(before);
  });

  it("records tracked Milk once and excludes non-food inputs and unknown goods", () => {
    recordFoodProcessingConsumption(market, "Milk", 2);
    expect(market.foodProcessingLedger!.Milk!.processingConsumption).toBe(2);
    expect(recordCumulativeCellFoodProcessing).toHaveBeenCalledExactlyOnceWith(1, 2);
    recordFoodProcessingConsumption(market, "Iron", 3);
    recordFoodProcessingConsumption(market, "Unknown", 3);
    for (const units of [0, -1, NaN, Infinity]) recordFoodProcessingConsumption(market, "Fish", units);
    expect(recordCumulativeCellFoodProcessing).toHaveBeenCalledTimes(1);
  });

  it("holds seasonal orchard drinks to annual demand and returns only the casks actually consumed", () => {
    expect(getFoodProcessingProductionHeadroom(market, "Cider", 0)).toBeCloseTo(3.9);
    expect(getFoodProcessingProductionHeadroom(market, "Perry", 0)).toBeCloseTo(1.95);
    market.goods[10].stock = 3.9;
    market.goods[11].stock = 1.95;
    recordOrchardCaskFilling(market, "Cider", 3.9, 1.56);
    recordOrchardCaskFilling(market, "Perry", 1.95, 0.78);
    expect(getFoodProcessingProductionHeadroom(market, "Cider", 0)).toBeCloseTo(0);
    expect(getFoodProcessingProductionHeadroom(market, "Perry", 0.1)).toBe(0);
    settleFoodProcessingHouseholds();
    expect(market.foodProcessingLedger?.Cider?.householdConsumption).toBeCloseTo(3.9 / 12);
    expect(market.foodProcessingLedger?.Perry?.householdConsumption).toBeCloseTo(1.95 / 12);
    expect(market.returnableContainerLedger?.orchardCasks?.Cider?.returns).toBeCloseTo(3.9 / 12);
    expect(market.returnableContainerLedger?.orchardCasks?.Cider?.inService).toBeCloseTo((3.9 * 11) / 12);
    expect(market.returnableContainerLedger?.orchardCasks?.Perry?.replacement).toBeCloseTo(0.78);
  });

  it("counts local orchard fruit processing and avoids buying the same fresh ration twice", () => {
    market.goods[8].stock = 1;
    recordCellFoodHouseholdConsumption(market, "Apples", 0.5);
    recordFoodProcessingConsumption(market, "Apples", 1.5);
    settleFoodProcessingHouseholds();
    expect(market.foodProcessingLedger?.Apples?.processingConsumption).toBe(1.5);
    expect(market.foodProcessingLedger?.Apples?.householdConsumption).toBe(0.5);
    expect(market.goods[8].stock).toBe(0);
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

  it("applies source-cell consumption only to the current household settlement", () => {
    recordCellFoodHouseholdConsumption(market, "Milk", 1);
    settleFoodProcessingHouseholds();

    expect(market.foodProcessingLedger!.Milk!.localHouseholdConsumptionThisCycle).toBe(0);
    const consumedAfterFirstCycle = market.foodProcessingLedger!.Milk!.householdConsumption;

    market.goods[1].stock = 3;
    settleFoodProcessingHouseholds();

    expect(market.foodProcessingLedger!.Milk!.householdConsumption).toBeGreaterThan(consumedAfterFirstCycle);
  });

  it("spoils unprocessed fresh meat that is not covered by the specialised dairy/grape ledger", () => {
    settleFoodProcessingHouseholds();

    expect(market.goods[6].stock).toBe(0);
  });

  it("limits non-dairy preserved-food output to three months of household demand", () => {
    recordFoodMarketIntake(market, "Grapes", 1);

    const headroom = getFoodProcessingProductionHeadroom(market, "Wine", 0);
    expect(headroom).toBeGreaterThan(0);

    market.goods[5].stock += headroom;
    expect(getFoodProcessingProductionHeadroom(market, "Wine", 0)).toBe(0);
  });

  it("raises and settles bounded daily ale demand when urban drinking water is unsafe", () => {
    refreshAleHouseholdDemand();
    const safeDemand = getAleDemandSnapshot(market);

    urbanWaterSystems.push({ burgId: 1, waterContamination: 1, drinkingWaterSecurity: 0 });
    refreshAleHouseholdDemand();
    const unsafeDemand = getAleDemandSnapshot(market);

    expect(unsafeDemand.baselineDemand).toBeCloseTo(safeDemand.baselineDemand);
    expect(unsafeDemand.monthlyDemand).toBeCloseTo(safeDemand.baselineDemand * 1.5);
    expect(unsafeDemand.waterSafetyDemand).toBeCloseTo(safeDemand.baselineDemand * 0.5);
    expect(unsafeDemand.drinkingWaterRisk).toBe(1);

    market.goods[7].stock = unsafeDemand.monthlyDemand;
    recordBeerCaskFilling(market, unsafeDemand.monthlyDemand, unsafeDemand.monthlyDemand * 0.08);
    settleFoodProcessingHouseholds();

    const beer = market.foodProcessingLedger!.Beer!;
    expect(beer.householdConsumption).toBeCloseTo(unsafeDemand.monthlyDemand);
    expect(beer.unmetDemand).toBe(0);
    expect(beer.waterSafetyDemand).toBeCloseTo(unsafeDemand.waterSafetyDemand);
    expect(market.returnableContainerLedger!.beerCasksInService).toBe(0);
    expect(market.returnableContainerLedger!.cumulativeBeerCaskReturns).toBeCloseTo(unsafeDemand.monthlyDemand);
  });

  it.each([0.25, 2])("settles ale by demand and supply regardless of price (stock share %s)", stockShare => {
    const outcomes = [0.01, 100].map(price => {
      market.foodProcessingLedger = undefined;
      market.goods[7].price = price;
      refreshAleHouseholdDemand();
      const demand = getAleDemandSnapshot(market).monthlyDemand;
      market.goods[7].stock = demand * stockShare;
      settleFoodProcessingHouseholds();
      const ledger = market.foodProcessingLedger!.Beer!;
      expect(ledger.householdConsumption).toBeCloseTo(demand * Math.min(1, stockShare));
      expect(ledger.unmetDemand).toBeCloseTo(demand * Math.max(0, 1 - stockShare));
      return {
        demand,
        consumption: ledger.householdConsumption,
        unmet: ledger.unmetDemand,
        stock: market.goods[7].stock
      };
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
    market.goods[7].price = 1;
  });

  it("turns part of same-market Milk surplus into a one-year Cheese reserve", () => {
    market.goods[1].stock = 500;
    market.goods[2].stock = 0;

    const headroom = getFoodProcessingProductionHeadroom(market, "Cheese", 0);
    // 1,000 residents consume 1.67 Milk lots/month; 25% of the remainder is eligible for
    // conversion at 10 Milk lots per Cheese lot. This is far above the household-only target.
    expect(headroom).toBeCloseTo((500 - 20 / 12) * 0.25 * 0.1, 4);

    market.goods[2].stock = (25 / 12) * CHEESE_RESERVE_MONTHS;
    expect(getFoodProcessingProductionHeadroom(market, "Cheese", 0)).toBe(0);
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
