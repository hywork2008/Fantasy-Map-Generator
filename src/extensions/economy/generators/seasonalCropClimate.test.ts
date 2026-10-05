import { describe, expect, it } from "vitest";
import { PERENNIAL_CROP_PROFILES } from "../../../data/perennialCrops";
import { STAPLE_CROP_PROFILES } from "../../../data/stapleCrops";
import { getMonthlyMeanTemperaturesC } from "../../../utils/earthlikeClimate";
import { getSeasonalCropPlan } from "./seasonalCropClimate";

const climate = (mean: number, amplitude: number, south = false) => ({
  year: 2001,
  monthlyMeanTemperatureC: Float64Array.from(
    { length: 12 },
    (_, m) => mean + amplitude * Math.cos((2 * Math.PI * (m - (south ? 0 : 6))) / 12)
  )
});

describe("monthly crop planning", () => {
  it("distinguishes a cold annual mean with a warm summer from a uniformly cold year", () => {
    const profile = STAPLE_CROP_PROFILES.Barley.calendar;
    expect(getSeasonalCropPlan(profile, climate(4, 0)).calendar.cropCycles).toBe(0);
    const summer = getSeasonalCropPlan(profile, climate(4, 8));
    expect(summer.calendar.cropCycles).toBe(1);
    expect(summer.growingDegreeDays).toBeGreaterThanOrEqual(500);
    expect(summer.growingMeanTemperatureC).toBeGreaterThan(4);
    expect(summer.calendar.harvestWeights.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(summer.calendar.labourWeights.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
  });

  it("rejects a hot but too short season and insufficient thermal time", () => {
    const short = { year: 2001, monthlyMeanTemperatureC: [0, 0, 0, 0, 0, 20, 20, 20, 0, 0, 0, 0] };
    expect(getSeasonalCropPlan(STAPLE_CROP_PROFILES.Barley.calendar, short).calendar.cropCycles).toBe(0);
    expect(getSeasonalCropPlan(STAPLE_CROP_PROFILES.Barley.calendar, climate(4, 0)).growingDegreeDays).toBe(0);
  });

  it("keeps a southern crop continuous over New Year and shifts its harvest into summer", () => {
    const north = getSeasonalCropPlan(STAPLE_CROP_PROFILES.Spelt.calendar, climate(4, 8));
    const south = getSeasonalCropPlan(STAPLE_CROP_PROFILES.Spelt.calendar, climate(4, 8, true));
    expect(north.calendar.cropCycles).toBe(1);
    expect(south.calendar.cropCycles).toBe(1);
    expect(south.calendar.harvestWeights.slice(5, 9).reduce((s, v) => s + v, 0)).toBe(0);
    expect(north.calendar.harvestWeights.slice(0, 3).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it("uses the actual host month means, not rounded current temperatures or representative zones", () => {
    const monthlyMeanTemperatureC = getMonthlyMeanTemperaturesC({
      annualMeanTemperatureC: 4,
      latitudeDeg: -48.693,
      continentality: 0.08,
      axialTiltDeg: 23.5,
      year: 839
    });
    const plan = getSeasonalCropPlan(STAPLE_CROP_PROFILES.Barley.calendar, { year: 839, monthlyMeanTemperatureC });
    expect(plan.calendar.cropCycles).toBe(1);
    expect(plan.calendar.harvestWeights.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
  });

  it("does not move a cohort's harvest into an un-growable month", () => {
    const profile = { ...STAPLE_CROP_PROFILES.Barley.calendar, allowsPlantingCohorts: true };
    const a = getSeasonalCropPlan(profile, climate(4, 8), true, 0);
    const b = getSeasonalCropPlan(profile, climate(4, 8), true, 2);
    expect(a.calendar.harvestWeights).toEqual(b.calendar.harvestWeights);
  });

  it("normalizes double cropping once and rejects an immature perennial", () => {
    const double = getSeasonalCropPlan(STAPLE_CROP_PROFILES.Peas.calendar, climate(20, 0), true);
    expect(double.calendar.cropCycles).toBe(2);
    expect(double.calendar.harvestWeights.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(getSeasonalCropPlan(PERENNIAL_CROP_PROFILES.Chestnuts.calendar, climate(4, 8)).calendar.cropCycles).toBe(0);
  });

  it("invalidates cached calendars when monthly input changes and supports leap years", () => {
    const input = climate(4, 8);
    expect(getSeasonalCropPlan(STAPLE_CROP_PROFILES.Barley.calendar, input).calendar.cropCycles).toBe(1);
    const edited = climate(4, 0);
    expect(getSeasonalCropPlan(STAPLE_CROP_PROFILES.Barley.calendar, edited).calendar.cropCycles).toBe(0);
    const leap = { ...climate(12, 0), year: 2000 };
    expect(getSeasonalCropPlan(STAPLE_CROP_PROFILES.Barley.calendar, leap).calendar.cropCycles).toBe(1);
  });
});
