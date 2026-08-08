import { describe, expect, it } from "vitest";
import type { Burg } from "../../hostTypes";
import { allocateMarketProcurementBudgets } from "./marketProcurementBudget";
import type { Market } from "./marketTypes";

describe("allocateMarketProcurementBudgets", () => {
  it("reserves shared Market cash by population before villages and cities are produced", () => {
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: {},
      marketTreasury: { balance: 100, ruralGrainPayable: 0 }
    };
    const burgs = [{ i: 1, market: 1, population: 0.1 } as Burg, { i: 2, market: 1, population: 9 } as Burg];

    const budgets = allocateMarketProcurementBudgets(burgs, [market]);

    expect(budgets.get(1)).toBeGreaterThan(0);
    expect(budgets.get(2)).toBeGreaterThan(budgets.get(1)!);
    expect((budgets.get(1) ?? 0) + (budgets.get(2) ?? 0)).toBeCloseTo(100, 2);
  });

  it("reduces the shared producer budget when Market maintenance is underfunded", () => {
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: {},
      maintenanceCondition: 0,
      marketTreasury: { balance: 100, ruralGrainPayable: 0 }
    };
    const budgets = allocateMarketProcurementBudgets([{ i: 1, market: 1, population: 1 } as Burg], [market]);

    expect(budgets.get(1)).toBe(25);
  });
});
