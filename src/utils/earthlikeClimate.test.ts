import { describe, expect, it } from "vitest";
import {
  distributeAnnualPrecipitationMm,
  getDailyMeanTemperatureC,
  getEarthlikeAmplitude,
  getMonthlyMeanTemperaturesC,
  getTemperatureCurveParameters,
  type TemperatureCurve
} from "./earthlikeClimate";
import { getDaysInMonth, isLeapYear } from "./seasonUtils";

const curve: TemperatureCurve = {
  annualMeanTemperatureC: 4,
  latitudeDeg: 60,
  continentality: 0.6,
  axialTiltDeg: 23.5,
  year: 2023
};

describe("Earthlike climate v1", () => {
  for (const year of [1900, 2000, 2023, 2024]) {
    it(`preserves annual temperature and precipitation in ${year}`, () => {
      const days = isLeapYear(year) ? 366 : 365;
      const monthly = getMonthlyMeanTemperaturesC({ ...curve, year });
      const average = (values: ArrayLike<number>) =>
        Array.from(values).reduce((sum, t, m) => sum + t * getDaysInMonth(year, m + 1), 0) / days;
      expect(Math.abs(average(monthly) - 4)).toBeLessThan(1e-9);
      expect(Math.abs(average(Float32Array.from(monthly)) - 4)).toBeLessThan(1e-5);
      expect(distributeAnnualPrecipitationMm(500, year).reduce((a, b) => a + b, 0)).toBeCloseTo(500, 10);
    });
  }
  it("reverses warm seasons without assuming identical shifted months", () => {
    const north = getMonthlyMeanTemperaturesC(curve);
    const south = getMonthlyMeanTemperaturesC({ ...curve, latitudeDeg: -60 });
    expect(north[6]).toBeGreaterThan(north[0]);
    expect(south[0]).toBeGreaterThan(south[6]);
  });
  it("has greater inland amplitude and later oceanic peak", () => {
    expect(getEarthlikeAmplitude(60, 1)).toBe(20);
    expect(getEarthlikeAmplitude(60, 0)).toBe(10);
    expect(
      getTemperatureCurveParameters({ ...curve, continentality: 0 }).peakDay -
        getTemperatureCurveParameters({ ...curve, continentality: 1 }).peakDay
    ).toBe(25);
  });
  it("has no annual swing at equator or zero tilt", () => {
    for (const c of [
      { ...curve, latitudeDeg: 0 },
      { ...curve, axialTiltDeg: 0 }
    ]) {
      expect(Array.from(getMonthlyMeanTemperaturesC(c))).toEqual(Array(12).fill(4));
    }
  });
  it("is periodic across year boundaries and consistent with the daily curve", () => {
    expect(getDailyMeanTemperatureC(curve, 10)).toBeCloseTo(getDailyMeanTemperatureC(curve, 375), 12);
    const monthly = getMonthlyMeanTemperaturesC(curve);
    let start = 0;
    for (let month = 0; month < 12; month++) {
      const days = getDaysInMonth(curve.year, month + 1);
      let total = 0;
      for (let day = 0; day < days; day++) total += getDailyMeanTemperatureC(curve, start + day + 0.5);
      expect(total / days).toBeCloseTo(monthly[month], 3);
      start += days;
    }
  });
});
