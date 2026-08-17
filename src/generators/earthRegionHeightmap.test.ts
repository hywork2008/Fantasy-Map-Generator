import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { HeightThreshold } from "../data/constants";
import { earthRegionView, KM_PER_DEG_LAT, KM_PER_DEG_LON_EQUATOR } from "../data/earthConfig";
import { EAST_ASIA_REGION, JAPAN_REGION } from "../data/earthRegions";
import { useOptionsState } from "../store/optionsState";
import { generateGrid } from "../utils/graphUtils";
import { loadEarthRaster } from "./earthRegionHeightmap";
import { lonLatToMapPoint, mapPointToLonLat, sampleLand } from "./earthRegionRaster";
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

const CAPES = {
  capeSoya: { lon: 141.94, lat: 45.52 },
  capeSata: { lon: 130.66, lat: 30.99 }
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
      expect(Math.hypot(here.lon - place.lon, here.lat - place.lat), `${name} too far`).toBeLessThan(0.7);
    }
  }, 20000);

  it("keeps Hokkaido, Honshu, Shikoku and Kyushu in separate land components", async () => {
    const { grid, heights } = await generateEastAsia(6);
    const hokkaido = landComponentId(
      heights,
      grid,
      nearestCell(grid, LANDMARKS.hokkaido.lon, LANDMARKS.hokkaido.lat, heights)
    );
    const honshu = landComponentId(heights, grid, nearestCell(grid, LANDMARKS.kanto.lon, LANDMARKS.kanto.lat, heights));
    const shikoku = landComponentId(
      heights,
      grid,
      nearestCell(grid, LANDMARKS.shikoku.lon, LANDMARKS.shikoku.lat, heights)
    );
    const kyushu = landComponentId(
      heights,
      grid,
      nearestCell(grid, LANDMARKS.kyushu.lon, LANDMARKS.kyushu.lat, heights)
    );
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

const OFF_FRAME = {
  okinawa: { lon: 127.68, lat: 26.21 }
};

const IN_FRAME = {
  tsushima: { lon: 129.33, lat: 34.38 },
  sado: { lon: 138.37, lat: 38.02 },
  awaji: { lon: 134.83, lat: 34.33 },
  oki: { lon: 133.28, lat: 36.17 }
};

function isInsideJapanBbox(lon: number, lat: number): boolean {
  return lon >= JAPAN_REGION.west && lon <= JAPAN_REGION.east && lat >= JAPAN_REGION.south && lat <= JAPAN_REGION.north;
}

function waterCellsAlong(
  grid: ReturnType<typeof generateGrid>,
  heights: Uint8Array,
  pred: (lon: number, lat: number) => boolean
): { lon: number; lat: number }[] {
  const cells: { lon: number; lat: number }[] = [];
  for (let i = 0; i < grid.points.length; i++) {
    if (heights[i] >= HeightThreshold.WATER_MAX_HEIGHT) continue;
    const [x, y] = grid.points[i];
    const here = mapPointToLonLat(JAPAN_REGION, GRAPH_WIDTH, GRAPH_HEIGHT, x, y);
    if (pred(here.lon, here.lat)) cells.push(here);
  }
  return cells;
}

describe("fromEarthRegion japan", () => {
  it("frames Kyushu in the south-west and Hokkaido in the north-east", () => {
    expect(JAPAN_REGION.west).toBeCloseTo(128.6, 5);
    expect(JAPAN_REGION.south).toBeCloseTo(29.9, 5);
    expect(JAPAN_REGION.east).toBeCloseTo(146.4, 5);
    expect(JAPAN_REGION.north).toBeCloseTo(46.6, 5);
    expect(JAPAN_REGION.north - CAPES.capeSoya.lat).toBeGreaterThan(0.8);
    expect(CAPES.capeSata.lat - JAPAN_REGION.south).toBeGreaterThan(0.8);
    expect(isInsideJapanBbox(LANDMARKS.kyushu.lon, LANDMARKS.kyushu.lat)).toBe(true);
    expect(isInsideJapanBbox(LANDMARKS.hokkaido.lon, LANDMARKS.hokkaido.lat)).toBe(true);
    expect(isInsideJapanBbox(CAPES.capeSoya.lon, CAPES.capeSoya.lat)).toBe(true);
    expect(isInsideJapanBbox(CAPES.capeSata.lon, CAPES.capeSata.lat)).toBe(true);
    expect(isInsideJapanBbox(OFF_FRAME.okinawa.lon, OFF_FRAME.okinawa.lat)).toBe(false);
    for (const [name, place] of Object.entries(IN_FRAME)) {
      expect(isInsideJapanBbox(place.lon, place.lat), name).toBe(true);
    }
  });

  it("does not stretch Japan to the window aspect", () => {
    const midLat = ((JAPAN_REGION.north + JAPAN_REGION.south) / 2) * (Math.PI / 180);
    const expected = (KM_PER_DEG_LON_EQUATOR * Math.cos(midLat)) / KM_PER_DEG_LAT;
    for (const [gw, gh] of [
      [960, 540],
      [540, 960],
      [800, 800]
    ] as const) {
      const origin = lonLatToMapPoint(JAPAN_REGION, gw, gh, 137.5, 38.25);
      const east = lonLatToMapPoint(JAPAN_REGION, gw, gh, 138.5, 38.25);
      const north = lonLatToMapPoint(JAPAN_REGION, gw, gh, 137.5, 39.25);
      const dx = Math.hypot(east.x - origin.x, east.y - origin.y);
      const dy = Math.hypot(north.x - origin.x, north.y - origin.y);
      expect(dx / dy, `${gw}x${gh}`).toBeCloseTo(expected, 3);
      const view = earthRegionView(JAPAN_REGION, gw, gh);
      expect(view.west).toBeLessThanOrEqual(JAPAN_REGION.west + 1e-6);
      expect(view.east).toBeGreaterThanOrEqual(JAPAN_REGION.east - 1e-6);
      expect(view.south).toBeLessThanOrEqual(JAPAN_REGION.south + 1e-6);
      expect(view.north).toBeGreaterThanOrEqual(JAPAN_REGION.north - 1e-6);
    }
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
    expect(hokkaido, "hokkaido land").toBeGreaterThanOrEqual(0);
    expect(honshu, "honshu land").toBeGreaterThanOrEqual(0);
    expect(shikoku, "shikoku land").toBeGreaterThanOrEqual(0);
    expect(kyushu, "kyushu land").toBeGreaterThanOrEqual(0);
    expect(hokkaido !== honshu, `Hokkaido-Honshu ${hokkaido}/${honshu}`).toBe(true);
    expect(honshu !== shikoku, `Honshu-Shikoku ${honshu}/${shikoku}`).toBe(true);
    expect(honshu !== kyushu, `Honshu-Kyushu ${honshu}/${kyushu}`).toBe(true);
    expect(shikoku !== kyushu, `Shikoku-Kyushu ${shikoku}/${kyushu}`).toBe(true);

    const raster = await loadEarthRaster(JAPAN_REGION);
    for (const [name, place] of Object.entries(IN_FRAME)) {
      expect(sampleLand(raster, place.lon, place.lat), `${name} raster`).toBe(true);
    }
    expect(sampleLand(raster, 129.07, 35.18), "Busan").toBe(true);
    expect(sampleLand(raster, 131.89, 43.12), "Vladivostok").toBe(true);
  }, 20000);

  it("keeps a coastal sea corridor north of Cape Soya and south of Cape Sata", async () => {
    const { grid, heights } = await generateJapan(4);
    const soyaLand = nearestJapanCell(grid, CAPES.capeSoya.lon, CAPES.capeSoya.lat, heights);
    const sataLand = nearestJapanCell(grid, CAPES.capeSata.lon, CAPES.capeSata.lat, heights);
    expect(heights[soyaLand]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
    expect(heights[sataLand]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);

    const northSea = waterCellsAlong(
      grid,
      heights,
      (lon, lat) => lat > CAPES.capeSoya.lat + 0.15 && lon > 141.2 && lon < 142.7
    );
    expect(northSea.length, "water north of Cape Soya").toBeGreaterThan(4);
    const northSpan = Math.max(...northSea.map(c => c.lon)) - Math.min(...northSea.map(c => c.lon));
    expect(northSpan, "north-coast passage is not a single pinch cell").toBeGreaterThan(0.5);

    const southSea = waterCellsAlong(
      grid,
      heights,
      (lon, lat) => lat < CAPES.capeSata.lat - 0.15 && lon > 130.2 && lon < 131.2
    );
    expect(southSea.length, "water south of Cape Sata").toBeGreaterThan(4);
    const southSpan = Math.max(...southSea.map(c => c.lon)) - Math.min(...southSea.map(c => c.lon));
    expect(southSpan, "south-coast passage is not a single pinch cell").toBeGreaterThan(0.4);
  }, 20000);
});
