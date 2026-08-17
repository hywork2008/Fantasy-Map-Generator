import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { HeightThreshold } from "../data/constants";
import { EAST_ASIA_REGION } from "../data/earthRegions";
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
