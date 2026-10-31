import { describe, expect, it } from "vitest";
import {
  distributeSeasonalPrecipitation as distribute,
  getDrySeasonCandidates,
  getPrecipitationDailyScores
} from "./precipitationSeasonality";
import { getDaysInMonth } from "./seasonUtils";

const ones = new Float64Array(12).fill(1);
const sum = (v: ArrayLike<number>) => Array.from(v).reduce((a, b) => a + b, 0);
function modeled(latitudeDeg: number, continentality = 0.15, moisture = ones) {
  return getPrecipitationDailyScores({
    latitudeDeg,
    continentality,
    landFraction: 0.6,
    axialTiltDeg: 23.5,
    moisture,
    orographic: ones
  });
}
function dry(monthly: number[], source = "modeledSeasonality" as const) {
  return getDrySeasonCandidates({
    year: 2023,
    annualPrecipitationMm: sum(monthly),
    monthlyPrecipitationMm: monthly,
    precipitationSeasonalitySource: source,
    precipitationSeasonalityConfidence: 1
  });
}

describe("seasonal precipitation", () => {
  it("conserves the annual water equivalent, including zero, tiny totals and leap years", () => {
    for (const year of [2023, 2024])
      for (const annual of [0, 1e-9, 762.6, 25500]) {
        const { monthly } = distribute(annual, year, modeled(18), 0.8, 23.5);
        expect(Array.from(monthly).every(v => Number.isFinite(v) && v >= 0)).toBe(true);
        expect(Math.abs(sum(monthly) - annual)).toBeLessThanOrEqual(Math.max(1e-8, annual * 1e-12));
      }
  });
  it("uses day proportions at zero tilt, zero confidence and constant scores; diagnoses invalid annual input", () => {
    for (const [scores, q, tilt] of [
      [modeled(18), 1, 0],
      [modeled(18), 0, 23.5],
      [ones, 1, 23.5]
    ] as const) {
      const out = distribute(366, 2024, scores, q, tilt);
      for (let m = 0; m < 12; m++) expect(out.monthly[m]).toBeCloseTo(getDaysInMonth(2024, m + 1), 10);
    }
    for (const annual of [NaN, -1, Infinity]) {
      const out = distribute(annual, 2024, ones, 1, 23.5);
      expect(sum(out.monthly)).toBe(0);
      expect(out.invalidAnnualPrecipitation).toBe(true);
    }
    for (const bad of [NaN, Number.MAX_VALUE]) {
      const result = distribute(365, 2023, new Float64Array(12).fill(bad), 1, 23.5);
      expect(result.source).toBe("uniformFallback");
      expect(result.monthly[0]).toBeCloseTo(31, 10);
    }
  });
  it("supports summer monsoons, winter rain, equatorial double peaks and weak maritime seasons", () => {
    const summer = distribute(1800, 2023, modeled(18, 0.6), 1, 23.5).monthly;
    const winter = distribute(760, 2023, modeled(38, 0.05), 1, 23.5).monthly;
    expect(sum(summer.slice(5, 8))).toBeGreaterThan(0.4 * sum(summer));
    expect(sum(winter.slice(5, 8))).toBeLessThan(winter[11] + winter[0] + winter[1]);
    expect(dry(Array.from(summer)).status).toBe("seasonal");
    const equator = modeled(0, 0);
    const peaks = Array.from(equator).filter((v, m) => v > equator[(m + 11) % 12] && v > equator[(m + 1) % 12]);
    expect(peaks).toHaveLength(2);
    const wet = distribute(2800, 2023, equator, 1, 23.5).monthly;
    expect(dry(Array.from(wet)).status).toBe("none");
    const maritime = modeled(50, 0);
    expect(Math.max(...maritime) / Math.min(...maritime)).toBeLessThan(3);
    const southern = distribute(1800, 2023, modeled(-18, 0.6), 1, 23.5).monthly;
    expect(southern[0]).toBeGreaterThan(southern[6]);
  });
  it("finds year-crossing and two separate dry intervals without interpreting uniform or chronic aridity as seasonal", () => {
    expect(dry([5, 5, 200, 200, 200, 200, 200, 200, 200, 200, 5, 5]).intervals).toEqual([
      { startMonth: 11, length: 4 }
    ]);
    expect(dry([5, 5, 200, 200, 200, 5, 5, 200, 200, 200, 200, 200]).intervals).toHaveLength(2);
    expect(dry(new Array(12).fill(0)).status).toBe("chronicallyDry");
    expect(getDrySeasonCandidates({ year: 2023 }).status).toBe("unknown");
    const uniform = distribute(1000, 2023, ones, 0, 23.5);
    expect(
      getDrySeasonCandidates({
        year: 2023,
        annualPrecipitationMm: 1000,
        monthlyPrecipitationMm: uniform.monthly,
        precipitationSeasonalitySource: uniform.source,
        precipitationSeasonalityConfidence: 0
      }).status
    ).toBe("unknown");
  });
});
