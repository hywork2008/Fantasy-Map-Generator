import { describe, expect, it } from "vitest";
import {
  convertLegacyLatitudeToGeographic,
  EARTH_DEFAULT_MAP_SIZE,
  EARTH_EQUATORIAL_CIRCUMFERENCE_KM,
  type EarthMappedWorld,
  getEarthDistanceBetweenMapPoints,
  getEarthDistanceScale,
  getEarthMapLatitudeSpan,
  getEarthPathDistance
} from "./earthConfig";

describe("Earth map calibration", () => {
  it("keeps the standard 12.9% map about 5,170 km wide at a 2:1 aspect ratio", () => {
    const graphWidth = 1_080;
    const scale = getEarthDistanceScale(EARTH_DEFAULT_MAP_SIZE, graphWidth);

    expect(graphWidth * scale).toBeCloseTo((EARTH_EQUATORIAL_CIRCUMFERENCE_KM * EARTH_DEFAULT_MAP_SIZE) / 100, 5);
    expect(graphWidth * scale).toBeCloseTo(5_170, 0);
  });

  it("maps the full equatorial-width extent to the equatorial circumference", () => {
    const graphWidth = 1_080;
    const scale = getEarthDistanceScale(100, graphWidth);

    expect(graphWidth * scale).toBeCloseTo(EARTH_EQUATORIAL_CIRCUMFERENCE_KM, 5);
  });

  it("derives the map's latitude span from its equatorial width and aspect ratio", () => {
    expect(getEarthMapLatitudeSpan(EARTH_DEFAULT_MAP_SIZE, 1_280, 720)).toBeCloseTo(26.1225, 4);
  });
});

describe("Earth map distances", () => {
  const world: EarthMappedWorld = {
    graphWidth: 1_000,
    graphHeight: 500,
    distanceScale: getEarthDistanceScale(EARTH_DEFAULT_MAP_SIZE, 1_000),
    mapCoordinates: { latT: 23.22, latN: 11.61, lonT: 46.44, lonW: -23.22 }
  };

  it("measures a full equatorial-width map slice at about 5,170 km", () => {
    expect(getEarthDistanceBetweenMapPoints(world, [0, 250], [1_000, 250])).toBeCloseTo(
      (EARTH_EQUATORIAL_CIRCUMFERENCE_KM * 46.44) / 360,
      5
    );
  });

  it("reduces east-west distances away from the equator and sums ruler paths", () => {
    const equatorialDistance = getEarthDistanceBetweenMapPoints(world, [0, 250], [1_000, 250])!;
    const northernDistance = getEarthDistanceBetweenMapPoints(world, [0, 0], [1_000, 0])!;

    expect(northernDistance).toBeLessThan(equatorialDistance);
    expect(
      getEarthPathDistance(world, [
        [0, 250],
        [500, 250],
        [1_000, 250]
      ])
    ).toBeCloseTo(equatorialDistance, 5);
  });
});

describe("Legacy latitude migration", () => {
  it("centers latitude 50 on the equator regardless of the legacy map size", () => {
    expect(convertLegacyLatitudeToGeographic(50, 78)).toBeCloseTo(0, 5);
    expect(convertLegacyLatitudeToGeographic(50, undefined)).toBeCloseTo(0, 5);
    expect(convertLegacyLatitudeToGeographic(50, 100)).toBeCloseTo(0, 5);
  });

  it("reconstructs the legacy northern edge from the legacy map size before re-centering", () => {
    // legacyLatT = 78/100*180 = 140.4; legacyLatN = 90 - (180-140.4)*0.25 = 80.1; center = 80.1 - 70.2 = 9.9
    expect(convertLegacyLatitudeToGeographic(25, 78)).toBeCloseTo(9.9, 5);
  });

  it("always centers on the equator for a full-world legacy map, independent of the shift value", () => {
    expect(convertLegacyLatitudeToGeographic(0, 100)).toBeCloseTo(0, 5);
    expect(convertLegacyLatitudeToGeographic(100, 100)).toBeCloseTo(0, 5);
  });

  it("falls back to the zero-size approximation when the legacy map size is unavailable", () => {
    expect(convertLegacyLatitudeToGeographic(25, undefined)).toBeCloseTo(90 - 25 * 1.8, 5);
    expect(convertLegacyLatitudeToGeographic(75, undefined)).toBeCloseTo(90 - 75 * 1.8, 5);
  });

  it("clamps the result to [-90, 90]", () => {
    expect(convertLegacyLatitudeToGeographic(0, 0)).toBeLessThanOrEqual(90);
    expect(convertLegacyLatitudeToGeographic(100, 0)).toBeGreaterThanOrEqual(-90);
  });
});
