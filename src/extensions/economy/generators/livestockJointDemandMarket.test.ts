import { describe, expect, it, vi } from "vitest";
import type { Market } from "./marketTypes";

const { stock, market } = vi.hoisted(() => ({
  stock: { "0:Sheep": { young: 0, breeding: 10, old: 0 }, "1:Cattle": { young: 0, breeding: 10, old: 0 } },
  market: { i: 1, goods: { 1: { stock: 100 }, 2: { stock: 0.5 }, 3: { stock: 1 } } }
}));
vi.mock("../context/cellTables", () => ({ getFaunaStockTable: () => stock, getMarketCellColumn: () => [1, 2] }));
vi.mock("../context/economyApi", () => ({ getWorldContext: () => ({ pack: { cells: { i: [0, 1], h: [30, 30] } } }) }));
vi.mock("../context/trade", () => ({
  getGoods: () => [
    { i: 1, name: "Milk" },
    { i: 2, name: "Cheese" },
    { i: 3, name: "Wool" }
  ]
}));
vi.mock("./faunaPopulation", () => ({ getAnnualHerdRenewal: () => null }));
vi.mock("./foodProcessingLedger", () => ({
  getMonthlyHouseholdDemand: (_market: unknown, name: string) => (name === "Milk" ? 1 : 0.1)
}));
vi.mock("./textileDemand", () => ({ getTextileMarketOrders: () => ({ inputs: { 3: 0.5 } }) }));

import { getJointLivestockMarketDemand } from "./livestockJointDemandMarket";

describe("market joint livestock demand", () => {
  it("credits finished cheese before milk input and limits fresh inventory to one month", () => {
    const before = JSON.stringify({ stock, market });
    const result = getJointLivestockMarketDemand(market as unknown as Market);
    expect(result.annualDairy.drinkingMilkLiters).toBe(12000);
    expect(result.annualDairy.cheeseKilograms).toBeCloseTo(1200);
    expect(result.annualDairy.milkForCheeseLiters).toBeCloseTo(7000);
    expect(result.annualDairy.usableMilkInventoryLiters).toBe(1000);
    expect(result.assessment.products.milkLiters.netAnnualDemand).toBeCloseTo(18000);
    expect(result.assessment.products.milkLiters.annualPotential).toBe(281.25);
    expect(result.selectedRuralWoolOrdersKgThisMonth).toBe(750);
    expect(result.assessment.products.woolKg.netAnnualDemand).toBeNull();
    expect(result.targetHeads).toBeNull();
    expect(JSON.stringify({ stock, market })).toBe(before);
  });
});
