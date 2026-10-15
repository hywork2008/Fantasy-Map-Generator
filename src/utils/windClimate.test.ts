import { describe, expect, it } from "vitest";
import {
  bearingToCompass8,
  getBandWindVector,
  getBeaufortForce,
  getBeltShiftDeg,
  getSeasonalStrengthFactor,
  getZonalWindVector,
  windSpeed,
  windTowardToVector,
  windVectorToFromDeg,
  windVectorToTowardDeg
} from "./windClimate";

const WINDS = [225, 45, 225, 315, 135, 315];

describe("wind direction conventions", () => {
  it("round-trips options.winds bearings and reports the meteorological 'from' direction", () => {
    for (const toward of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const { u, v } = windTowardToVector(toward, 5);
      expect(windVectorToTowardDeg(u, v)).toBeCloseTo(toward, 6);
      expect(windVectorToFromDeg(u, v)).toBeCloseTo((toward + 180) % 360, 6);
    }
    // Blowing toward the east (90) is a west wind.
    const east = windTowardToVector(90, 6);
    expect(east.u).toBeCloseTo(6, 6);
    expect(bearingToCompass8(windVectorToFromDeg(east.u, east.v))).toBe("W");
  });
  it("maps speeds to Beaufort force", () => {
    expect(getBeaufortForce(0.2)).toBe(0);
    expect(getBeaufortForce(6)).toBe(4);
    expect(getBeaufortForce(40)).toBe(12);
  });
});

describe("band wind", () => {
  it("matches options.winds away from band boundaries (test 11)", () => {
    for (const [lat, tier] of [
      [75, 0],
      [45, 1],
      [15, 2],
      [-15, 3],
      [-45, 4],
      [-75, 5]
    ]) {
      const { u, v } = getBandWindVector(WINDS, lat);
      expect(windVectorToTowardDeg(u, v)).toBeCloseTo(WINDS[tier], 4);
    }
  });
  it("follows the configured directions when they change", () => {
    const rotated = WINDS.map(w => (w + 90) % 360);
    const { u, v } = getBandWindVector(rotated, 45);
    expect(windVectorToTowardDeg(u, v)).toBeCloseTo(rotated[1], 4);
  });
  it("weakens to a calm belt at boundaries and stays continuous across them", () => {
    expect(windSpeed(...(Object.values(getBandWindVector(WINDS, 30)) as [number, number]))).toBeLessThanOrEqual(
      2.5 + 1e-9
    );
    const a = getBandWindVector(WINDS, 30.001);
    const b = getBandWindVector(WINDS, 29.999);
    expect(Math.abs(a.u - b.u) + Math.abs(a.v - b.v)).toBeLessThan(0.01);
    const edgeIn = getBandWindVector(WINDS, 36 - 1e-6);
    const edgeOut = getBandWindVector(WINDS, 36 + 1e-6);
    expect(Math.abs(edgeIn.u - edgeOut.u) + Math.abs(edgeIn.v - edgeOut.v)).toBeLessThan(0.01);
  });
});

describe("seasonal belt migration", () => {
  it("moves north in northern summer and south in northern winter; zero tilt does not move (test 12)", () => {
    const july = getBeltShiftDeg(200, 365, 0, 23.5);
    const january = getBeltShiftDeg(15, 365, 0, 23.5);
    expect(july).toBeGreaterThan(4);
    expect(january).toBeLessThan(-4);
    expect(getBeltShiftDeg(200, 365, 1, 23.5)).toBeGreaterThan(july);
    expect(getBeltShiftDeg(200, 365, 1, 0)).toBeCloseTo(0, 9);
  });
  it("strengthens westerlies in each hemisphere's own winter", () => {
    expect(getSeasonalStrengthFactor(15, 365, 50)).toBeGreaterThan(1.2);
    expect(getSeasonalStrengthFactor(200, 365, 50)).toBeLessThan(0.8);
    expect(getSeasonalStrengthFactor(15, 365, -50)).toBeLessThan(0.8);
    expect(getSeasonalStrengthFactor(15, 365, 5)).toBeCloseTo(1, 9);
  });
  it("swings a boundary-zone latitude between bands with the season", () => {
    // 33°N: westerly-side in winter (belt shifted south), trade-side in summer.
    const winter = getZonalWindVector(WINDS, 33, 15, 365, 0.5, 23.5);
    const summer = getZonalWindVector(WINDS, 33, 200, 365, 0.5, 23.5);
    expect(winter.u).toBeGreaterThan(0); // toward the east
    expect(summer.u).toBeLessThan(0); // toward the west
  });
});
