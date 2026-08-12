import { describe, expect, it } from "vitest";
import {
  getCurrentDirection,
  getDayOfYear,
  getDaysInMonth,
  getSeason,
  getSeasonalAmplitude,
  getSeasonalityStrength,
  getSeasonalTemperatureOffset,
  getSolarDeclinationDeg,
  isLeapYear
} from "./seasonUtils";

describe("isLeapYear / getDaysInMonth", () => {
  it("identifies leap years using the Gregorian rule", () => {
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
    expect(isLeapYear(1900)).toBe(false); // divisible by 100, not 400
    expect(isLeapYear(2024)).toBe(true); // divisible by 4
    expect(isLeapYear(2023)).toBe(false);
  });

  it("returns 29 for February on a leap year, 28 otherwise", () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2023, 2)).toBe(28);
  });

  it("returns 30/31 for the other months", () => {
    expect(getDaysInMonth(2023, 4)).toBe(30);
    expect(getDaysInMonth(2023, 1)).toBe(31);
  });
});

describe("getDayOfYear", () => {
  it("returns 1 for January 1st", () => {
    expect(getDayOfYear(2023, 1, 1)).toBe(1);
  });

  it("accumulates days across months", () => {
    expect(getDayOfYear(2023, 3, 1)).toBe(31 + 28 + 1);
  });

  it("accounts for leap-year February", () => {
    expect(getDayOfYear(2024, 3, 1)).toBe(31 + 29 + 1);
  });
});

describe("getSolarDeclinationDeg", () => {
  it("peaks near +23.5 around the northern summer solstice (day ~172)", () => {
    expect(getSolarDeclinationDeg(172)).toBeCloseTo(23.5, 0);
  });

  it("peaks near -23.5 around the northern winter solstice (day ~355)", () => {
    expect(getSolarDeclinationDeg(355)).toBeCloseTo(-23.5, 0);
  });

  it("crosses zero near the equinoxes (day ~80)", () => {
    expect(Math.abs(getSolarDeclinationDeg(80))).toBeLessThan(2);
  });

  it("scales with an explicit axialTiltDeg argument", () => {
    expect(getSolarDeclinationDeg(172, 45)).toBeCloseTo(45, 0);
    expect(getSolarDeclinationDeg(172, 0)).toBeCloseTo(0, 5);
  });
});

const climate = { temperatureEquator: 27, temperatureNorthPole: -30, temperatureSouthPole: -15 };

describe("getSeasonalAmplitude", () => {
  it("is zero at the equator", () => {
    expect(getSeasonalAmplitude(0, climate)).toBeCloseTo(0, 5);
  });

  it("is larger near the poles than near the equator", () => {
    const nearEquator = getSeasonalAmplitude(10, climate);
    const nearPole = getSeasonalAmplitude(80, climate);
    expect(nearPole).toBeGreaterThan(nearEquator);
  });

  it("is symmetric in the sign of latitude", () => {
    expect(getSeasonalAmplitude(45, climate)).toBeCloseTo(getSeasonalAmplitude(-45, climate), 10);
  });
});

describe("getSeasonalityStrength", () => {
  it("is zero at the equator", () => {
    expect(getSeasonalityStrength(0)).toBeCloseTo(0, 5);
  });

  it("is one at the poles", () => {
    expect(getSeasonalityStrength(90)).toBeCloseTo(1, 5);
    expect(getSeasonalityStrength(-90)).toBeCloseTo(1, 5);
  });

  it("is symmetric in the sign of latitude", () => {
    expect(getSeasonalityStrength(30)).toBeCloseTo(getSeasonalityStrength(-30), 10);
  });

  it("is independent of the map's configured climate spread", () => {
    // Unlike getSeasonalAmplitude, this has no climate parameter to vary in the first place;
    // this test documents that the shape is bare sin(|latitude|), not climate-derived.
    expect(getSeasonalityStrength(45)).toBeCloseTo(Math.sin(Math.PI / 4), 10);
  });
});

describe("getSeasonalTemperatureOffset", () => {
  it("is zero at the equator regardless of date", () => {
    expect(getSeasonalTemperatureOffset(0, 2023, 6, 21, climate)).toBeCloseTo(0, 5);
  });

  it("is positive in the northern hemisphere in northern summer", () => {
    expect(getSeasonalTemperatureOffset(60, 2023, 6, 21, climate)).toBeGreaterThan(0);
  });

  it("is negative in the northern hemisphere in northern winter", () => {
    expect(getSeasonalTemperatureOffset(60, 2023, 12, 21, climate)).toBeLessThan(0);
  });

  it("flips sign for the same month in the southern hemisphere", () => {
    const north = getSeasonalTemperatureOffset(60, 2023, 6, 21, climate);
    const south = getSeasonalTemperatureOffset(-60, 2023, 6, 21, climate);
    expect(south).toBeCloseTo(-north, 5);
  });

  it("is zero for any date/latitude when axial tilt is 0° (no seasons without a tilted axis)", () => {
    expect(getSeasonalTemperatureOffset(60, 2023, 6, 21, climate, 0)).toBeCloseTo(0, 10);
    expect(getSeasonalTemperatureOffset(60, 2023, 12, 21, climate, 0)).toBeCloseTo(0, 10);
    expect(getSeasonalTemperatureOffset(-60, 2023, 6, 21, climate, 0)).toBeCloseTo(0, 10);
  });

  it("matches the default (omitted) axialTiltDeg at Earth's own 23.5° tilt", () => {
    const withDefault = getSeasonalTemperatureOffset(60, 2023, 6, 21, climate);
    const withExplicitEarthTilt = getSeasonalTemperatureOffset(60, 2023, 6, 21, climate, 23.5);
    expect(withExplicitEarthTilt).toBeCloseTo(withDefault, 10);
  });

  it("grows in magnitude as axial tilt increases beyond Earth's own", () => {
    const earthTilt = Math.abs(getSeasonalTemperatureOffset(60, 2023, 6, 21, climate, 23.5));
    const higherTilt = Math.abs(getSeasonalTemperatureOffset(60, 2023, 6, 21, climate, 45));
    const evenHigherTilt = Math.abs(getSeasonalTemperatureOffset(60, 2023, 6, 21, climate, 90));
    expect(higherTilt).toBeGreaterThan(earthTilt);
    expect(evenHigherTilt).toBeGreaterThan(higherTilt);
  });
});

describe("getSeason", () => {
  it("buckets northern-hemisphere months into the expected seasons", () => {
    expect(getSeason(45, 1)).toBe("winter");
    expect(getSeason(45, 4)).toBe("spring");
    expect(getSeason(45, 7)).toBe("summer");
    expect(getSeason(45, 10)).toBe("autumn");
    expect(getSeason(45, 12)).toBe("winter");
  });

  it("flips the season for the same month in the southern hemisphere", () => {
    expect(getSeason(-45, 1)).toBe("summer");
    expect(getSeason(-45, 7)).toBe("winter");
  });

  it("treats latitude 0 as northern-hemisphere reference", () => {
    expect(getSeason(0, 1)).toBe("winter");
  });
});

describe("getCurrentDirection", () => {
  it("favors east in spring and summer", () => {
    expect(getCurrentDirection(4)).toBe(1);
    expect(getCurrentDirection(7)).toBe(1);
  });

  it("favors west in autumn and winter", () => {
    expect(getCurrentDirection(10)).toBe(-1);
    expect(getCurrentDirection(1)).toBe(-1);
  });
});
