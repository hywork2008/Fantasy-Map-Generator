import { describe, expect, it } from "vitest";
import { convertLegacyLatitudeToGeographic } from "../data/earthConfig";
import {
  ATLANTICS_REGION,
  BRITAIN_REGION,
  EAST_ASIA_REGION,
  EUROPE_CENTRAL_REGION,
  earthRegionMapCoordinates,
  JAPAN_REGION,
  LEGACY_PRECREATED_CLIMATE,
  MEDITERRANEAN_SEA_REGION
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
    expect(coords.lonW).toBeCloseTo(118.5, 5);
    expect(coords.lonE).toBeCloseTo(146.4, 5);
    expect(coords.latS).toBeCloseTo(29.9, 5);
    expect(coords.latN).toBeCloseTo(46.6, 5);
    expect(JAPAN_REGION.climateAnchor.mapSize).toBeCloseTo(((146.4 - 118.5) / 360) * 100, 3);
    expect(JAPAN_REGION.climateAnchor.latitude).toBeCloseTo((29.9 + 46.6) / 2, 5);
  });
});

describe("britain climate conversion", () => {
  it("anchors climate to the British Isles bbox (Ireland SW – Shetland NE)", () => {
    const coords = earthRegionMapCoordinates(BRITAIN_REGION);
    expect(coords.lonW).toBeCloseTo(-11.5, 5);
    expect(coords.lonE).toBeCloseTo(3.0, 5);
    expect(coords.latS).toBeCloseTo(49.0, 5);
    expect(coords.latN).toBeCloseTo(61.7, 5);
    expect(BRITAIN_REGION.climateAnchor.mapSize).toBeCloseTo(((3.0 - -11.5) / 360) * 100, 3);
    expect(BRITAIN_REGION.climateAnchor.latitude).toBeCloseTo((49.0 + 61.7) / 2, 5);
  });
});

describe("mediterranean-sea climate conversion", () => {
  it("anchors climate to the Gibraltar–Levant bbox", () => {
    const coords = earthRegionMapCoordinates(MEDITERRANEAN_SEA_REGION);
    expect(coords.lonW).toBeCloseTo(-7, 5);
    expect(coords.lonE).toBeCloseTo(36.8, 5);
    expect(coords.latS).toBeCloseTo(29.8, 5);
    expect(coords.latN).toBeCloseTo(46.2, 5);
    expect(MEDITERRANEAN_SEA_REGION.climateAnchor.mapSize).toBeCloseTo(((36.8 - -7) / 360) * 100, 3);
    expect(MEDITERRANEAN_SEA_REGION.climateAnchor.latitude).toBeCloseTo((29.8 + 46.2) / 2, 5);
  });
});

describe("europe-central climate conversion", () => {
  it("anchors climate to the Channel–Elbe industrial-core bbox", () => {
    const coords = earthRegionMapCoordinates(EUROPE_CENTRAL_REGION);
    expect(coords.lonW).toBeCloseTo(-1.8, 5);
    expect(coords.lonE).toBeCloseTo(14.8, 5);
    expect(coords.latS).toBeCloseTo(45.5, 5);
    expect(coords.latN).toBeCloseTo(54.3, 5);
    expect(EUROPE_CENTRAL_REGION.climateAnchor.mapSize).toBeCloseTo(((14.8 - -1.8) / 360) * 100, 3);
    expect(EUROPE_CENTRAL_REGION.climateAnchor.latitude).toBeCloseTo((45.5 + 54.3) / 2, 5);
  });
});

describe("atlantics climate conversion", () => {
  it("anchors climate to the recognizable North Atlantic basin", () => {
    const coords = earthRegionMapCoordinates(ATLANTICS_REGION);
    expect(coords.lonW).toBeCloseTo(-108, 5);
    expect(coords.lonE).toBeCloseTo(44, 5);
    expect(coords.latS).toBeCloseTo(-8, 5);
    expect(coords.latN).toBeCloseTo(68, 5);
    expect(ATLANTICS_REGION.climateAnchor.mapSize).toBeCloseTo(((44 - -108) / 360) * 100, 3);
    expect(ATLANTICS_REGION.climateAnchor.latitude).toBeCloseTo((-8 + 68) / 2, 5);
  });
});
