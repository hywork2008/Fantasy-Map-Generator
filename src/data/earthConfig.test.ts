import { describe, expect, it } from "vitest";
import {
  ARCTIC_CIRCLE_LATITUDE_DEG,
  computeMapCoordinates,
  convertLegacyLatitudeToGeographic,
  EARTH_DEFAULT_MAP_SIZE,
  EARTH_EQUATORIAL_CIRCUMFERENCE_KM,
  type EarthMappedWorld,
  earthRegionAspect,
  earthRegionFitGraph,
  earthRegionView,
  getEarthDistanceBetweenMapPoints,
  getEarthDistanceScale,
  getEarthMapLatitudeSpan,
  getEarthPathDistance,
  getTemperateLatitudeBound,
  globeMeridianSliderRange,
  longitudeCenterToShift,
  longitudeShiftToCenter,
  mapLatitudeSliderRange,
  snapGlobeMeridian,
  unwrapLongitudeForRange,
  wrapLongitude
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

describe("earthRegionFitGraph", () => {
  const region = { west: 118.5, east: 146.4, south: 29.9, north: 46.6 };

  it("fits a landscape window without changing the geographic bbox", () => {
    const fitted = earthRegionFitGraph(region, 960, 540);
    expect(fitted.height).toBe(540);
    expect(fitted.width).toBeLessThan(960);
    expect(fitted.width / fitted.height).toBeCloseTo(earthRegionAspect(region), 2);
    const view = earthRegionView(region, fitted.width, fitted.height);
    expect(view.west).toBe(region.west);
    expect(view.east).toBe(region.east);
    expect(view.south).toBe(region.south);
    expect(view.north).toBe(region.north);
  });

  it("fits a portrait window without inventing extra latitude", () => {
    const fitted = earthRegionFitGraph(region, 540, 960);
    expect(fitted.width).toBe(540);
    expect(fitted.height).toBeLessThan(960);
    expect(fitted.width / fitted.height).toBeCloseTo(earthRegionAspect(region), 2);
  });
});

describe("getTemperateLatitudeBound", () => {
  it("caps the center latitude so the pole-ward edge lands exactly on the Arctic/Antarctic Circle", () => {
    const latitudeSpan = 20;
    const bound = getTemperateLatitudeBound(latitudeSpan, 90 - latitudeSpan / 2);

    expect(bound).toBeCloseTo(ARCTIC_CIRCLE_LATITUDE_DEG - latitudeSpan / 2, 6);
    expect(bound + latitudeSpan / 2).toBeCloseTo(ARCTIC_CIRCLE_LATITUDE_DEG, 6);
  });

  it("falls back to the ±90° clamp when it is tighter than the Arctic bound", () => {
    // A span so large that 90 - span / 2 is below the Arctic-circle-derived bound.
    const latitudeSpan = 10;
    const maxCenterLatitude = 5; // tighter than 66.5 - 10 / 2 = 61.5
    expect(getTemperateLatitudeBound(latitudeSpan, maxCenterLatitude)).toBe(maxCenterLatitude);
  });

  it("never returns a negative bound for an oversized span", () => {
    expect(getTemperateLatitudeBound(200, 0)).toBe(0);
  });

  it("returns 0 for non-finite input", () => {
    expect(getTemperateLatitudeBound(Number.NaN, 50)).toBe(0);
    expect(getTemperateLatitudeBound(20, Number.NaN)).toBe(0);
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

describe("World Configurator globe longitude", () => {
  const japanLonT = 146.4 - 118.5;
  const japanShift = 10.12;

  it("places a 50 shift on the prime meridian", () => {
    expect(longitudeShiftToCenter(50, 27.9)).toBeCloseTo(0, 5);
    expect(longitudeCenterToShift(0, 27.9)).toBeCloseTo(50, 5);
  });

  it("reconstructs Japan's climate-anchor shift as ~132°E, snapping the blue line to 135°", () => {
    const center = longitudeShiftToCenter(japanShift, japanLonT);
    expect(center).toBeCloseTo((118.5 + 146.4) / 2, 0);
    expect(snapGlobeMeridian(center)).toBe(135);
    const range = globeMeridianSliderRange(135, japanLonT);
    expect(range.min).toBeCloseTo(45 + japanLonT / 2, 5);
    expect(range.max).toBeCloseTo(225 - japanLonT / 2, 5);
    expect(center).toBeGreaterThan(range.min);
    expect(center).toBeLessThan(range.max);
  });

  it("round-trips a 135°E center through the legacy 0–100 shift", () => {
    const lonT = 27.9;
    const shift = longitudeCenterToShift(135, lonT);
    expect(longitudeShiftToCenter(shift, lonT)).toBeCloseTo(135, 5);
  });

  it("unwraps dateline longitudes so a 135° meridian slider still increases eastward", () => {
    expect(wrapLongitude(225)).toBe(-135);
    expect(unwrapLongitudeForRange(-135, 45, 225)).toBe(225);
    expect(unwrapLongitudeForRange(132.45, 45, 225)).toBeCloseTo(132.45, 5);
  });

  it("lets a Japan climate-anchor be moved off its geographic bbox", () => {
    const japan = computeMapCoordinates({ mapSize: 7.75, latitude: 38.25, longitude: 10.12 }, 960, 540);
    expect(japan.lonW).toBeCloseTo(118.5, 0);
    expect(japan.lonE).toBeCloseTo(146.4, 0);
    expect((japan.latN + japan.latS) / 2).toBeCloseTo(38.25, 0);

    const polar = computeMapCoordinates({ mapSize: 7.75, latitude: 80, longitude: 10.12 }, 960, 540);
    expect((polar.latN + polar.latS) / 2).toBeGreaterThan(60);
    expect(polar.latN).toBeLessThanOrEqual(90);
    expect(polar.lonW).toBeCloseTo(japan.lonW, 5);

    const west = computeMapCoordinates({ mapSize: 7.75, latitude: 38.25, longitude: 20 }, 960, 540);
    expect((west.lonW + west.lonE) / 2).toBeLessThan((japan.lonW + japan.lonE) / 2);
  });

  it("keeps the latitude slider from pushing the map off the globe", () => {
    const range = mapLatitudeSliderRange(12.9, 1280, 720);
    expect(range.max).toBeCloseTo(90 - getEarthMapLatitudeSpan(12.9, 1280, 720) / 2, 5);
    expect(range.min).toBeCloseTo(-range.max, 5);
  });
});
