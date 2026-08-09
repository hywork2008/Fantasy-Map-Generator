import { describe, expect, it } from "vitest";
import { getFoodLedgerSummary } from "./foodLedgerSummary";
import type { FoodLedger } from "./marketTypes";

function createLedger(overrides: Partial<FoodLedger> = {}): FoodLedger {
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

describe("getFoodLedgerSummary", () => {
  it("reports delivered imports separately from an undelivered reserve request", () => {
    const summary = getFoodLedgerSummary(
      createLedger({
        foodProduced: 40,
        ruralNeed: 30,
        urbanNeed: 20,
        satisfiedImport: 10,
        importNeed: 25,
        foodStockAge0: 15,
        foodStockAge1: 10,
        foodStockAge2: 5
      })
    );

    expect(summary).toMatchObject({
      localProduction: 40,
      quarterlyNeed: 20,
      importedFood: 10,
      importShare: 0.5,
      reserveGap: 15,
      stock: 30
    });
    expect(summary?.stockMonths).toBeCloseTo(4.5);
  });

  it("returns null until a Market has initialized its Food Ledger", () => {
    expect(getFoodLedgerSummary(undefined)).toBeNull();
  });
});
