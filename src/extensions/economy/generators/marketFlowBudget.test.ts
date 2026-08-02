import { describe, expect, it } from "vitest";
import {
  annualizeExportCargoSlots,
  CYCLES_PER_YEAR,
  computeMarketGoodFlowBudget,
  DEFAULT_MIN_SAIL_UTILIZATION,
  DEFAULT_TARGET_UTILIZATION,
  estimateFleetRequirement,
  estimateStagingCargoSlots,
  getDefaultMonthsOfCover,
  inferGoodsTradeAffinity,
  summarizeCaravanUtilization,
  TRADE_RESERVE_FACTOR
} from "./marketFlowBudget";

describe("market flow budget", () => {
  it("holds target stock and local reserve before exporting", () => {
    // cycleDemand=10 → localReserve=12, monthsOfCover=2 → targetStock=20, holdFloor=20
    // stock=30 + prod=5 → export = 35 - 20 = 15
    const budget = computeMarketGoodFlowBudget({
      marketId: 1,
      goodId: 3,
      stock: 30,
      cycleDemand: 10,
      cycleProduction: 5,
      monthsOfCover: 2,
      cargoSlotsPerUnit: 2
    });

    expect(budget.localReserve).toBeCloseTo(10 * (1 + TRADE_RESERVE_FACTOR));
    expect(budget.targetStock).toBeCloseTo(20);
    expect(budget.exportBudget).toBeCloseTo(15);
    expect(budget.importBudget).toBeCloseTo(0);
    expect(budget.exportCargoSlots).toBeCloseTo(30);
    expect(budget.annualDemand).toBeCloseTo(10 * CYCLES_PER_YEAR);
    expect(budget.monthsOfCoverActual).toBeCloseTo(3);
  });

  it("requests imports when stock and production cannot cover target", () => {
    const budget = computeMarketGoodFlowBudget({
      marketId: 2,
      goodId: 1,
      stock: 2,
      cycleDemand: 10,
      cycleProduction: 1,
      monthsOfCover: 2,
      cargoSlotsPerUnit: 1
    });

    // max(targetStock=20, cycleDemand=10) - 2 - 1 = 17
    expect(budget.importBudget).toBeCloseTo(17);
    expect(budget.exportBudget).toBeCloseTo(0);
    expect(budget.importCargoSlots).toBeCloseTo(17);
  });

  it("treats missing production as zero without inventing surplus", () => {
    const budget = computeMarketGoodFlowBudget({
      marketId: 0,
      goodId: 0,
      stock: 5,
      cycleDemand: 10,
      cargoSlotsPerUnit: 1,
      monthsOfCover: 1
    });

    expect(budget.cycleProduction).toBe(0);
    // holdFloor = max(10, 12) = 12; stock 5 → no export; import = max(10,10) - 5 = 5
    expect(budget.exportBudget).toBeCloseTo(0);
    expect(budget.importBudget).toBeCloseTo(5);
  });

  it("annualizes cycle export slots by CYCLES_PER_YEAR", () => {
    expect(annualizeExportCargoSlots(10)).toBe(10 * CYCLES_PER_YEAR);
  });

  it("infers trade affinity for luxury and bulk goods", () => {
    expect(inferGoodsTradeAffinity({ tags: ["luxury"], value: 50 })).toBe("luxury");
    expect(inferGoodsTradeAffinity({ tags: ["military"], demandCoverage: { military: 0.8 } })).toBe("military");
    expect(inferGoodsTradeAffinity({ trade: { bulk: 5, weight: 4 }, value: 1 })).toBe("localBulk");
    expect(getDefaultMonthsOfCover({ tags: ["luxury"] })).toBe(1);
    expect(getDefaultMonthsOfCover({ trade: { bulk: 5, weight: 4 }, value: 1 })).toBe(2.5);
  });

  it("sizes fleet from annual export slots and round-trip days", () => {
    const result = estimateFleetRequirement({
      annualExportCargoSlots: 1200,
      capacitySlotsPerTrip: 100,
      targetUtilization: DEFAULT_TARGET_UTILIZATION,
      meanRoundTripDays: 30
    });

    // effective = 55; trips = 1200/55; concurrent = trips * 30/365
    expect(result.effectiveSlotsPerTrip).toBeCloseTo(55);
    expect(result.tripsPerYear).toBeCloseTo(1200 / 55);
    expect(result.requiredConcurrentVehicles).toBeCloseTo((1200 / 55) * (30 / 365));
  });

  it("estimates staging depth from monthly export and wait days", () => {
    // 100 slots/month, wait 15 days ≈ half month * 1.25 buffer = 62.5
    expect(estimateStagingCargoSlots({ meanMonthlyExportCargoSlots: 100, maxWaitDays: 15 })).toBeCloseTo(62.5);
  });

  it("summarizes utilization and flags under-filled holds", () => {
    const stats = summarizeCaravanUtilization([
      { usedSlots: 1, capacitySlots: 100 }, // 1%
      { usedSlots: 15, capacitySlots: 100 }, // 15%
      { usedSlots: 55, capacitySlots: 100 }, // 55%
      { usedSlots: 90, capacitySlots: 100 } // 90%
    ]);

    expect(stats.count).toBe(4);
    expect(stats.meanUtilization).toBeCloseTo((0.01 + 0.15 + 0.55 + 0.9) / 4);
    expect(stats.medianUtilization).toBeCloseTo((0.15 + 0.55) / 2);
    expect(stats.shareUnder10pct).toBeCloseTo(0.25);
    expect(stats.shareUnder20pct).toBeCloseTo(0.5);
    expect(stats.totalUsedSlots).toBe(1 + 15 + 55 + 90);
    expect(DEFAULT_MIN_SAIL_UTILIZATION).toBe(0.2);
  });
});
