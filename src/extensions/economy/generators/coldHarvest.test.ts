import { describe, expect, it } from "vitest";
import { getColdExposure, getColdPopulationPenaltyPct } from "../../../utils/climateVariability";
import { combineFoodStress, computeColdHarvestSeverity, rollClimateAnomaly } from "./climateDisasters";
import { getColdAnomalyYieldFactor, type SeasonalCropPlan } from "./seasonalCropClimate";

const plan = (growingMeanTemperatureC: number, growable: boolean[]): SeasonalCropPlan =>
  ({
    growingMeanTemperatureC,
    growingDegreeDays: 1000,
    calendar: { cropCycles: 1, growableMonths: growable, harvestWeights: [], labourWeights: [] }
  }) as unknown as SeasonalCropPlan;
const summer = [false, false, false, true, true, true, true, true, true, false, false, false];

describe("cold anomaly yield factor", () => {
  it("is 1 without an anomaly or a viable plan", () => {
    expect(getColdAnomalyYieldFactor({ year: 2001, monthlyMeanTemperatureC: [] }, plan(12, summer))).toBe(1);
    expect(
      getColdAnomalyYieldFactor(
        { year: 2001, monthlyMeanTemperatureC: [], climateAnomalyC: new Array(12).fill(-1) },
        undefined
      )
    ).toBe(1);
  });

  it("cuts cool-season yields ~10% per °C and barely touches warm seasons", () => {
    const climate = { year: 2001, monthlyMeanTemperatureC: [], climateAnomalyC: new Array(12).fill(-1) };
    expect(getColdAnomalyYieldFactor(climate, plan(10, summer))).toBeCloseTo(0.9, 6);
    expect(getColdAnomalyYieldFactor(climate, plan(15, summer))).toBeCloseTo(0.95, 6);
    expect(getColdAnomalyYieldFactor(climate, plan(22, summer))).toBe(1);
  });

  it("only counts growing months", () => {
    const winterOnly = [-5, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, -5];
    expect(
      getColdAnomalyYieldFactor(
        { year: 2001, monthlyMeanTemperatureC: [], climateAnomalyC: winterOnly },
        plan(10, summer)
      )
    ).toBe(1);
  });
});

describe("cold harvest severity", () => {
  it("is zero without cooling and grows with cooling and marginality", () => {
    expect(computeColdHarvestSeverity(0, 1, 0)).toBe(0);
    expect(computeColdHarvestSeverity(0.6, 1, 0)).toBeGreaterThan(computeColdHarvestSeverity(0.6, 0, 0));
    expect(computeColdHarvestSeverity(1, 1, 0)).toBeGreaterThan(computeColdHarvestSeverity(0.5, 1, 0));
    expect(computeColdHarvestSeverity(10, 1, 0)).toBeGreaterThan(0.99);
    // Warm lowlands under a deep (2.5 °C) cooling stay well below total failure.
    expect(computeColdHarvestSeverity(2.5, 0, 0)).toBeLessThan(0.35);
  });

  it("puts a Little-Ice-Age cooling on marginal land around watch, a bad year into active", () => {
    const typical = computeColdHarvestSeverity(0.7, 0.9, 0);
    expect(typical).toBeGreaterThan(0.28);
    expect(typical).toBeLessThan(0.5);
    expect(computeColdHarvestSeverity(0.7, 0.9, 1)).toBeGreaterThan(computeColdHarvestSeverity(0.7, 0.9, 0));
    expect(computeColdHarvestSeverity(1.2, 1, 1)).toBeGreaterThan(0.5);
  });

  it("compounds with drought instead of adding", () => {
    expect(combineFoodStress(0.5, 0.5)).toBeCloseTo(0.75, 6);
    expect(combineFoodStress(0, 0.3)).toBeCloseTo(0.3, 6);
    expect(combineFoodStress(1, 0.3)).toBe(1);
  });

  it("drought roll keeps one draw and the old result at variability 1", () => {
    let calls = 0;
    const rng = { gauss: (_m: number, sd: number) => (calls++, sd) };
    expect(rollClimateAnomaly(0.2, rng)).toBeCloseTo(0.2 * 0.6 + 0.28 * 0.4, 6);
    expect(calls).toBe(1);
    expect(rollClimateAnomaly(0.2, rng, 1.5)).toBeCloseTo(0.2 * 0.6 + 0.42 * 0.4, 6);
  });
});

describe("cold exposure and Fast-Forward penalty", () => {
  const months = [-10, -8, -2, 4, 9, 13, 15, 14, 10, 4, -3, -8];
  it("averages cooling over months at or above 5 °C and rates cool summers as marginal", () => {
    const e = getColdExposure(months, new Array(12).fill(-1));
    expect(e.cooling).toBeCloseTo(1, 6);
    expect(e.marginality).toBeCloseTo(0.7, 6);
    expect(getColdPopulationPenaltyPct(e)).toBeCloseTo(1.5 * (0.3 + 0.7 * 0.7), 6);
    expect(getColdPopulationPenaltyPct(getColdExposure(months, new Array(12).fill(0)))).toBe(0);
  });
});
