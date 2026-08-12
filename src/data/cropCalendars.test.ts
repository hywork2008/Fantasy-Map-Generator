import { describe, expect, it } from "vitest";
import {
  type CropCalendarProfile,
  classifyAgriculturalClimateZone,
  getCropCalendar,
  SEASON_REGION_PROFILES
} from "./cropCalendars";

const annualCrop: CropCalendarProfile = {
  annualCycleDays: 120,
  turnaroundDays: 30,
  minimumGrowingTemperatureC: 8,
  harvestWindows: [{ startAfterPlantingDays: 105, durationDays: 30 }],
  labourByStage: { establishment: 0.2, maintenance: 0.3, harvestAndProcessing: 0.5 },
  canProduceContinuously: false,
  maximumCropsPerYear: 2,
  allowsPlantingCohorts: true
};

describe("crop calendars", () => {
  it("concentrates a cold annual crop into one harvest", () => {
    const calendar = getCropCalendar(
      SEASON_REGION_PROFILES.north,
      classifyAgriculturalClimateZone({ annualTemperatureC: 11, annualPrecipitation: 45, irrigated: false }),
      annualCrop
    );
    expect(calendar.cropCycles).toBe(1);
    expect(calendar.harvestWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
    expect(calendar.harvestWeights.filter(weight => weight > 0)).toHaveLength(1);
  });

  it("permits two cycles only in a warm irrigated zone", () => {
    const calendar = getCropCalendar(
      SEASON_REGION_PROFILES.equatorial,
      classifyAgriculturalClimateZone({ annualTemperatureC: 20, annualPrecipitation: 12, irrigated: true }),
      annualCrop
    );
    expect(calendar.cropCycles).toBe(2);
  });

  it("rotates a permitted planting cohort without changing annual totals", () => {
    const zone = classifyAgriculturalClimateZone({ annualTemperatureC: 20, annualPrecipitation: 40, irrigated: true });
    const base = getCropCalendar(SEASON_REGION_PROFILES.equatorial, zone, annualCrop, 0);
    const late = getCropCalendar(SEASON_REGION_PROFILES.equatorial, zone, annualCrop, 2);
    expect(late.harvestWeights).not.toEqual(base.harvestWeights);
    expect(late.harvestWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });
});
