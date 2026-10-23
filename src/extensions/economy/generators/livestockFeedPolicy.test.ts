import { describe, expect, it } from "vitest";
import { calculateLivestockHayPlan, HAY_DRY_MATTER_RETENTION, HAY_STORAGE_LOSS_PER_MONTH } from "./livestockFeedPolicy";

describe("seasonal livestock hay planning", () => {
  it("bridges a six-month dormant season including storage losses, rather than assuming three months", () => {
    const weights = [...Array(6).fill(1 / 6), ...Array(6).fill(0)];
    const plan = calculateLivestockHayPlan(12000, 24000, weights);
    let hay = plan.reserveAfterMonthKg[5];
    expect(hay).toBeGreaterThan(6000);
    for (let month = 6; month < 12; month++) {
      hay *= 1 - HAY_STORAGE_LOSS_PER_MONTH;
      expect(hay).toBeGreaterThanOrEqual(1000 - 1e-8);
      hay -= 1000;
      expect(plan.harvestWeights[month]).toBe(0);
    }
    expect(hay).toBeCloseTo(0, 7);
    expect(plan.rawHarvestKg * HAY_DRY_MATTER_RETENTION).toBeGreaterThanOrEqual(6000);
    expect(plan.rawHarvestKg).toBeLessThanOrEqual(18000);
    expect(plan.harvestWeights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("rotates the same plan with the hemisphere without changing its annual mass or labor", () => {
    const weights = [0, 0, 0, 0.05, 0.1, 0.2, 0.3, 0.2, 0.1, 0.05, 0, 0];
    const rotate = (values: readonly number[]) => [...values.slice(6), ...values.slice(0, 6)];
    const north = calculateLivestockHayPlan(12000, 24000, weights);
    const south = calculateLivestockHayPlan(12000, 24000, rotate(weights));
    expect(south.rawHarvestKg).toBeCloseTo(north.rawHarvestKg, 8);
    expect(south.seasonalGapKg).toBe(north.seasonalGapKg);
    rotate(north.reserveAfterMonthKg).forEach((value, month) => {
      expect(south.reserveAfterMonthKg[month]).toBeCloseTo(value, 8);
    });
  });

  it.each([0, 12000])("does not promise hay by reusing kilograms already needed for grazing (%s kg forage)", forage => {
    const plan = calculateLivestockHayPlan(12000, forage, Array(12).fill(1 / 12));
    expect(plan.rawHarvestKg).toBe(0);
    expect(plan.harvestWeights.every(weight => weight === 0)).toBe(true);
    expect(plan.reserveAfterMonthKg.every(kg => kg === 3000)).toBe(true);
  });

  it("retains the existing reserve floor for year-round growth without assuming a winter", () => {
    const plan = calculateLivestockHayPlan(12000, 24000, Array(12).fill(1 / 12));
    expect(plan.seasonalGapKg).toBe(0);
    expect(plan.reserveAfterMonthKg.every(kg => kg === 3000)).toBe(true);
    expect(plan.rawHarvestKg).toBeLessThan(12000);
    expect(plan.rawHarvestKg).toBeGreaterThan(3000);
  });
});
