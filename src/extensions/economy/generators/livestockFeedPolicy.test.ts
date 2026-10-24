import { describe, expect, it } from "vitest";
import {
  calculateLivestockHayPlan,
  calculateWinterFeedShare,
  HAY_DRY_MATTER_RETENTION,
  HAY_STORAGE_LOSS_PER_MONTH
} from "./livestockFeedPolicy";

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

  it("takes the main cut before peak growth from a shut-up meadow, earliest months first", () => {
    const weights = [0, 0, 0, 0.05, 0.1, 0.2, 0.3, 0.2, 0.1, 0.05, 0, 0];
    const plan = calculateLivestockHayPlan(12000, 24000, weights);
    expect(plan.shutUpMonth).toBe(4);
    expect(plan.harvestWeights[4]).toBe(0);
    expect(plan.harvestWeights[5]).toBeGreaterThan(plan.harvestWeights[7]);
    const firstUnused = plan.harvestWeights.findIndex((weight, month) => month >= 5 && weight === 0);
    expect(plan.harvestWeights.slice(firstUnused).every(weight => weight === 0)).toBe(true);
    expect(plan.harvestWeights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
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

  it("keeps only the herd its own summer surplus can carry through a long dormant season", () => {
    const longWinter = [...Array(4).fill(1 / 4), ...Array(8).fill(0)];
    expect(calculateWinterFeedShare(12000, 12000 / 0.8, Array(12).fill(1 / 12))).toBe(1);
    const share = calculateWinterFeedShare(12000, 12000, longWinter);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    // At the share, eight lean months are covered by stored hay; slightly more animals are not.
    const plan = calculateLivestockHayPlan(12000 * share, 12000, longWinter);
    expect(plan.seasonalGapKg).toBeCloseTo((12000 * share * 8) / 12, 3);
    const larger = calculateLivestockHayPlan(12000 * (share + 0.02), 12000, longWinter);
    expect(larger.rawHarvestKg * HAY_DRY_MATTER_RETENTION).toBeLessThan(larger.seasonalGapKg);
  });
});
