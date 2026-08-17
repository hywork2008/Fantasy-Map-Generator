import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { HeightThreshold } from "../data/constants";
import { EAST_ASIA_REGION, JAPAN_REGION } from "../data/earthRegions";
import { useOptionsState } from "../store/optionsState";
import { generateGrid } from "../utils/graphUtils";
import { mapPointToLonLat } from "./earthRegionRaster";
import { HeightmapGenerator } from "./heightmap-generator";

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 540;

const LANDMARKS = {
  kanto: { lon: 139.75, lat: 36.0 },
  nobi: { lon: 136.75, lat: 35.25 },
  osaka: { lon: 135.52, lat: 34.78 },
  hokkaido: { lon: 142.9, lat: 43.5 },
  shikoku: { lon: 133.5, lat: 33.7 },
  kyushu: { lon: 130.8, lat: 32.8 },
  tokyoBay: { lon: 139.95, lat: 35.35 }
};

function nearestCell(grid: ReturnType<typeof generateGrid>, lon: number, lat: number, heights?: Uint8Array): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < grid.points.length; i++) {
    if (heights && heights[i] < HeightThreshold.WATER_MAX_HEIGHT) continue;
    const [x, y] = grid.points[i];
    const here = mapPointToLonLat(EAST_ASIA_REGION, GRAPH_WIDTH, GRAPH_HEIGHT, x, y);
    const d = (here.lon - lon) ** 2 + (here.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function landComponentId(heights: Uint8Array, grid: ReturnType<typeof generateGrid>, start: number): number {
  if (heights[start] < HeightThreshold.WATER_MAX_HEIGHT) return -1;
  const seen = new Uint8Array(heights.length);
  const stack = [start];
  seen[start] = 1;
  let min = start;
  while (stack.length) {
    const cell = stack.pop()!;
    if (cell < min) min = cell;
    for (const neighbor of grid.cells.c[cell] ?? []) {
      if (seen[neighbor] || heights[neighbor] < HeightThreshold.WATER_MAX_HEIGHT) continue;
      seen[neighbor] = 1;
      stack.push(neighbor);
    }
  }
  return min;
}

async function generateEastAsia(points = 4) {
  worldContext.graphWidth = GRAPH_WIDTH;
  worldContext.graphHeight = GRAPH_HEIGHT;
  useOptionsState.getState().setOptions({ points, template: "east-asia", heightExponent: 1.8 });
  const grid = generateGrid("earth-asia-test", GRAPH_WIDTH, GRAPH_HEIGHT);
  const heights = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
  return { grid, heights };
}

describe("fromEarthRegion east-asia", () => {
  it("keeps Kanto, Nobi and Osaka plains as land", async () => {
    const { grid, heights } = await generateEastAsia(4);
    for (const [name, place] of Object.entries(LANDMARKS)) {
      if (name === "tokyoBay") continue;
      const cell = nearestCell(grid, place.lon, place.lat, heights);
      expect(heights[cell], name).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
      const here = mapPointToLonLat(EAST_ASIA_REGION, GRAPH_WIDTH, GRAPH_HEIGHT, ...grid.points[cell]);
      expect(Math.hypot(here.lon - place.lon, here.lat - place.lat), `${name} too far`).toBeLessThan(0.5);
    }
  }, 20000);

  it("keeps Hokkaido, Honshu, Shikoku and Kyushu in separate land components", async () => {
    const { grid, heights } = await generateEastAsia(6);
    const hokkaido = landComponentId(heights, grid, nearestCell(grid, LANDMARKS.hokkaido.lon, LANDMARKS.hokkaido.lat));
    const honshu = landComponentId(heights, grid, nearestCell(grid, LANDMARKS.kanto.lon, LANDMARKS.kanto.lat));
    const shikoku = landComponentId(heights, grid, nearestCell(grid, LANDMARKS.shikoku.lon, LANDMARKS.shikoku.lat));
    const kyushu = landComponentId(heights, grid, nearestCell(grid, LANDMARKS.kyushu.lon, LANDMARKS.kyushu.lat));
    expect(hokkaido, "hokkaido land").toBeGreaterThanOrEqual(0);
    expect(honshu, "honshu land").toBeGreaterThanOrEqual(0);
    expect(shikoku, "shikoku land").toBeGreaterThanOrEqual(0);
    expect(kyushu, "kyushu land").toBeGreaterThanOrEqual(0);
    expect(hokkaido !== honshu, `Hokkaido-Honshu ${hokkaido}/${honshu}`).toBe(true);
    expect(honshu !== shikoku, `Honshu-Shikoku ${honshu}/${shikoku}`).toBe(true);
    expect(honshu !== kyushu, `Honshu-Kyushu ${honshu}/${kyushu}`).toBe(true);
    expect(shikoku !== kyushu, `Shikoku-Kyushu ${shikoku}/${kyushu}`).toBe(true);
  }, 20000);
});

async function generateJapan(points = 4) {
  worldContext.graphWidth = GRAPH_WIDTH;
  worldContext.graphHeight = GRAPH_HEIGHT;
  useOptionsState.getState().setOptions({ points, template: "japan", heightExponent: 1.8 });
  const grid = generateGrid("earth-japan-test", GRAPH_WIDTH, GRAPH_HEIGHT);
  const heights = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
  return { grid, heights };
}

function nearestJapanCell(
  grid: ReturnType<typeof generateGrid>,
  lon: number,
  lat: number,
  heights?: Uint8Array
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < grid.points.length; i++) {
    if (heights && heights[i] < HeightThreshold.WATER_MAX_HEIGHT) continue;
    const [x, y] = grid.points[i];
    const here = mapPointToLonLat(JAPAN_REGION, GRAPH_WIDTH, GRAPH_HEIGHT, x, y);
    const d = (here.lon - lon) ** 2 + (here.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const OFF_MAP = {
  okinawa: { lon: 127.68, lat: 26.21 },
  kunashiri: { lon: 146.05, lat: 44.4 },
  tsushima: { lon: 129.33, lat: 34.38 },
  sado: { lon: 138.37, lat: 38.02 }
};

function isInsideJapanBbox(lon: number, lat: number): boolean {
  return lon >= JAPAN_REGION.west && lon <= JAPAN_REGION.east && lat >= JAPAN_REGION.south && lat <= JAPAN_REGION.north;
}

describe("fromEarthRegion japan", () => {
  it("frames Kyushu in the south-west and Hokkaido in the north-east", () => {
    expect(JAPAN_REGION.west).toBeCloseTo(129.2, 5);
    expect(JAPAN_REGION.south).toBeCloseTo(30.95, 5);
    expect(JAPAN_REGION.east).toBeCloseTo(145.82, 5);
    expect(JAPAN_REGION.north).toBeCloseTo(45.55, 5);
    expect(JAPAN_REGION.east).toBeLessThan(146);
    expect(JAPAN_REGION.south).toBeGreaterThan(30);
    expect(isInsideJapanBbox(LANDMARKS.kyushu.lon, LANDMARKS.kyushu.lat)).toBe(true);
    expect(isInsideJapanBbox(LANDMARKS.hokkaido.lon, LANDMARKS.hokkaido.lat)).toBe(true);
    expect(isInsideJapanBbox(OFF_MAP.okinawa.lon, OFF_MAP.okinawa.lat)).toBe(false);
    expect(isInsideJapanBbox(OFF_MAP.kunashiri.lon, OFF_MAP.kunashiri.lat)).toBe(false);
  });

  it("keeps Kanto as land and the four home islands separate", async () => {
    const { grid, heights } = await generateJapan(6);
    const kanto = nearestJapanCell(grid, LANDMARKS.kanto.lon, LANDMARKS.kanto.lat, heights);
    expect(heights[kanto]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
    const here = mapPointToLonLat(JAPAN_REGION, GRAPH_WIDTH, GRAPH_HEIGHT, ...grid.points[kanto]);
    expect(Math.hypot(here.lon - LANDMARKS.kanto.lon, here.lat - LANDMARKS.kanto.lat)).toBeLessThan(0.4);

    const kyushuCell = nearestJapanCell(grid, LANDMARKS.kyushu.lon, LANDMARKS.kyushu.lat, heights);
    const hokkaidoCell = nearestJapanCell(grid, LANDMARKS.hokkaido.lon, LANDMARKS.hokkaido.lat, heights);
    const [kx, ky] = grid.points[kyushuCell];
    const [hx, hy] = grid.points[hokkaidoCell];
    expect(kx, "Kyushu is on the western half").toBeLessThan(GRAPH_WIDTH / 2);
    expect(ky, "Kyushu is on the southern half").toBeGreaterThan(GRAPH_HEIGHT / 2);
    expect(hx, "Hokkaido is on the eastern half").toBeGreaterThan(GRAPH_WIDTH / 2);
    expect(hy, "Hokkaido is on the northern half").toBeLessThan(GRAPH_HEIGHT / 2);

    const hokkaido = landComponentId(heights, grid, hokkaidoCell);
    const honshu = landComponentId(heights, grid, nearestJapanCell(grid, LANDMARKS.kanto.lon, LANDMARKS.kanto.lat));
    const shikoku = landComponentId(
      heights,
      grid,
      nearestJapanCell(grid, LANDMARKS.shikoku.lon, LANDMARKS.shikoku.lat)
    );
    const kyushu = landComponentId(heights, grid, kyushuCell);
    expect(new Set([hokkaido, honshu, shikoku, kyushu]).size).toBe(4);

    for (const [name, place] of Object.entries(OFF_MAP)) {
      if (!isInsideJapanBbox(place.lon, place.lat)) continue;
      const cell = nearestJapanCell(grid, place.lon, place.lat);
      const sampled = mapPointToLonLat(JAPAN_REGION, GRAPH_WIDTH, GRAPH_HEIGHT, ...grid.points[cell]);
      if (Math.hypot(sampled.lon - place.lon, sampled.lat - place.lat) > 0.25) continue;
      expect(heights[cell], `${name} should stay off the four-island mask`).toBeLessThan(
        HeightThreshold.WATER_MAX_HEIGHT
      );
    }
  }, 20000);
});
