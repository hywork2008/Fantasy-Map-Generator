import { describe, expect, it } from "vitest";
import { convertLegacyLatitudeToGeographic } from "../data/earthConfig";
import {
  EAST_ASIA_REGION,
  earthRegionMapCoordinates,
  JAPAN_REGION,
  LEGACY_PRECREATED_CLIMATE
} from "../data/earthRegions";
import { depthMetersToHeight, depthToMeters, heightToMeters, metersToHeight } from "./height";

describe("metersToHeight / heightToMeters", () => {
  it("keeps sea-level land at or above the land line", () => {
    expect(metersToHeight(0, 1.8)).toBe(20);
    expect(metersToHeight(-3, 1.8)).toBe(20);
    expect(heightToMeters(20, 1.8)).toBeGreaterThanOrEqual(0);
  });

  it("round-trips land elevations within a meter at exponent 1", () => {
    // exponent 1: h = 18 + meters, clamped to 100, so only 0–82 m survive a round trip.
    for (const meters of [2, 20, 50, 82]) {
      const h = metersToHeight(meters, 1);
      expect(heightToMeters(h, 1)).toBeCloseTo(meters, 0);
    }
  });

  it("maps water depths into 0–19", () => {
    expect(depthMetersToHeight(0)).toBe(19);
    expect(depthMetersToHeight(-10)).toBeGreaterThanOrEqual(0);
    expect(depthMetersToHeight(-10)).toBeLessThan(20);
    const h = depthMetersToHeight(-50);
    expect(depthToMeters(h)).toBeLessThan(0);
  });
});

describe("legacy east-asia climate conversion", () => {
  it("reconstructs the old 0–100 shift as a northern-hemisphere center", () => {
    const legacy = LEGACY_PRECREATED_CLIMATE["east-asia"];
    const center = convertLegacyLatitudeToGeographic(legacy.latitudeShift, legacy.mapSize);
    expect(center).toBeGreaterThan(30);
    expect(center).toBeLessThan(40);
    const lonT = (legacy.mapSize / 100) * 360;
    const lonE = 180 - (360 - lonT) * (legacy.longitude / 100);
    const lonW = lonE - lonT;
    expect(lonW).toBeCloseTo(110.3, 0);
    expect(lonE).toBeCloseTo(149.9, 0);
  });

  it("anchors the Earth-region climate to the East Asia bbox", () => {
    expect(EAST_ASIA_REGION.west).toBe(90);
    expect(EAST_ASIA_REGION.east).toBe(150);
    expect(EAST_ASIA_REGION.south).toBe(18);
    expect(EAST_ASIA_REGION.north).toBe(54);
    expect(EAST_ASIA_REGION.climateAnchor.latitude).toBe(36);
    expect(EAST_ASIA_REGION.climateAnchor.latitude).toBeGreaterThan(0);
    const coords = earthRegionMapCoordinates(EAST_ASIA_REGION);
    expect(coords.latS).toBe(18);
    expect(coords.latN).toBe(54);
    expect(coords.lonW).toBe(90);
    expect(coords.lonE).toBe(150);
    expect(coords.latS).toBeGreaterThan(0);
  });
});

describe("japan climate conversion", () => {
  it("anchors climate to the four-island bbox (Kyushu SW – Hokkaido NE)", () => {
    const coords = earthRegionMapCoordinates(JAPAN_REGION);
    expect(coords.lonW).toBeCloseTo(129.2, 5);
    expect(coords.lonE).toBeCloseTo(145.82, 5);
    expect(coords.latS).toBeCloseTo(30.95, 5);
    expect(coords.latN).toBeCloseTo(45.55, 5);
    expect(JAPAN_REGION.climateAnchor.mapSize).toBeCloseTo(((145.82 - 129.2) / 360) * 100, 3);
    expect(JAPAN_REGION.climateAnchor.latitude).toBeCloseTo((30.95 + 45.55) / 2, 5);
  });
});
