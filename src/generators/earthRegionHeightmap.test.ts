import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { HeightThreshold } from "../data/constants";
import { earthRegionAspect, earthRegionFitGraph, KM_PER_DEG_LAT, KM_PER_DEG_LON_EQUATOR } from "../data/earthConfig";
import {
  BRITAIN_REGION,
  EAST_ASIA_REGION,
  EUROPE_CENTRAL_REGION,
  JAPAN_REGION,
  MEDITERRANEAN_SEA_REGION
} from "../data/earthRegions";
import { useOptionsState } from "../store/optionsState";
import { generateGrid } from "../utils/graphUtils";
import { loadEarthRaster } from "./earthRegionHeightmap";
import { lonLatToMapPoint, mapPointToLonLat, sampleLand } from "./earthRegionRaster";
import { HeightmapGenerator } from "./heightmap-generator";

const MAX_GRAPH_WIDTH = 960;
const MAX_GRAPH_HEIGHT = 540;
const EAST_ASIA_GRAPH = earthRegionFitGraph(EAST_ASIA_REGION, MAX_GRAPH_WIDTH, MAX_GRAPH_HEIGHT);
const JAPAN_GRAPH = earthRegionFitGraph(JAPAN_REGION, MAX_GRAPH_WIDTH, MAX_GRAPH_HEIGHT);
const BRITAIN_GRAPH = earthRegionFitGraph(BRITAIN_REGION, MAX_GRAPH_WIDTH, MAX_GRAPH_HEIGHT);
const MED_GRAPH = earthRegionFitGraph(MEDITERRANEAN_SEA_REGION, MAX_GRAPH_WIDTH, MAX_GRAPH_HEIGHT);
const EUROPE_CENTRAL_GRAPH = earthRegionFitGraph(EUROPE_CENTRAL_REGION, MAX_GRAPH_WIDTH, MAX_GRAPH_HEIGHT);

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
    const here = mapPointToLonLat(EAST_ASIA_REGION, EAST_ASIA_GRAPH.width, EAST_ASIA_GRAPH.height, x, y);
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
  worldContext.graphWidth = EAST_ASIA_GRAPH.width;
  worldContext.graphHeight = EAST_ASIA_GRAPH.height;
  useOptionsState.getState().setOptions({ points, template: "east-asia", heightExponent: 1.8 });
  const grid = generateGrid("earth-asia-test", EAST_ASIA_GRAPH.width, EAST_ASIA_GRAPH.height);
  const heights = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
  return { grid, heights };
}

describe("fromEarthRegion east-asia", () => {
  it("keeps Kanto, Nobi and Osaka plains as land", async () => {
    const { grid, heights } = await generateEastAsia(4);
    for (const name of ["kanto", "nobi", "osaka"] as const) {
      const place = LANDMARKS[name];
      const cell = nearestCell(grid, place.lon, place.lat, heights);
      expect(heights[cell], name).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
      const here = mapPointToLonLat(
        EAST_ASIA_REGION,
        EAST_ASIA_GRAPH.width,
        EAST_ASIA_GRAPH.height,
        ...grid.points[cell]
      );
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
  worldContext.graphWidth = JAPAN_GRAPH.width;
  worldContext.graphHeight = JAPAN_GRAPH.height;
  useOptionsState.getState().setOptions({ points, template: "japan", heightExponent: 1.8 });
  const grid = generateGrid("earth-japan-test", JAPAN_GRAPH.width, JAPAN_GRAPH.height);
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
    const here = mapPointToLonLat(JAPAN_REGION, JAPAN_GRAPH.width, JAPAN_GRAPH.height, x, y);
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
    const here = mapPointToLonLat(JAPAN_REGION, JAPAN_GRAPH.width, JAPAN_GRAPH.height, x, y);
    if (pred(here.lon, here.lat)) cells.push(here);
  }
  return cells;
}

describe("fromEarthRegion japan", () => {
  it("frames Kyushu in the south-west and Hokkaido in the north-east", () => {
    expect(JAPAN_REGION.west).toBeCloseTo(118.5, 5);
    expect(JAPAN_REGION.south).toBeCloseTo(29.9, 5);
    expect(JAPAN_REGION.east).toBeCloseTo(146.4, 5);
    expect(JAPAN_REGION.north).toBeCloseTo(46.6, 5);
    expect(JAPAN_REGION.north - CAPES.capeSoya.lat).toBeGreaterThan(0.8);
    expect(CAPES.capeSata.lat - JAPAN_REGION.south).toBeGreaterThan(0.8);
    expect(isInsideJapanBbox(LANDMARKS.kyushu.lon, LANDMARKS.kyushu.lat)).toBe(true);
    expect(isInsideJapanBbox(LANDMARKS.hokkaido.lon, LANDMARKS.hokkaido.lat)).toBe(true);
    expect(isInsideJapanBbox(CAPES.capeSoya.lon, CAPES.capeSoya.lat)).toBe(true);
    expect(isInsideJapanBbox(CAPES.capeSata.lon, CAPES.capeSata.lat)).toBe(true);
    expect(isInsideJapanBbox(121.5, 37.0), "Yellow Sea").toBe(true);
    expect(isInsideJapanBbox(OFF_FRAME.okinawa.lon, OFF_FRAME.okinawa.lat)).toBe(false);
    for (const [name, place] of Object.entries(IN_FRAME)) {
      expect(isInsideJapanBbox(place.lon, place.lat), name).toBe(true);
    }
  });

  it("does not stretch Japan to the window aspect", () => {
    const midLat = ((JAPAN_REGION.north + JAPAN_REGION.south) / 2) * (Math.PI / 180);
    const expected = (KM_PER_DEG_LON_EQUATOR * Math.cos(midLat)) / KM_PER_DEG_LAT;
    const aspect = earthRegionAspect(JAPAN_REGION);
    for (const [maxW, maxH] of [
      [960, 540],
      [540, 960],
      [800, 800]
    ] as const) {
      const fitted = earthRegionFitGraph(JAPAN_REGION, maxW, maxH);
      expect(fitted.width / fitted.height, `${maxW}x${maxH} aspect`).toBeCloseTo(aspect, 2);
      expect(fitted.width).toBeLessThanOrEqual(maxW);
      expect(fitted.height).toBeLessThanOrEqual(maxH);
      const origin = lonLatToMapPoint(JAPAN_REGION, fitted.width, fitted.height, 137.5, 38.25);
      const east = lonLatToMapPoint(JAPAN_REGION, fitted.width, fitted.height, 138.5, 38.25);
      const north = lonLatToMapPoint(JAPAN_REGION, fitted.width, fitted.height, 137.5, 39.25);
      const dx = Math.hypot(east.x - origin.x, east.y - origin.y);
      const dy = Math.hypot(north.x - origin.x, north.y - origin.y);
      expect(dx / dy, `${maxW}x${maxH}`).toBeCloseTo(expected, 3);
    }
  });

  it("keeps Kanto as land and the four home islands separate", async () => {
    const { grid, heights } = await generateJapan(6);
    const kanto = nearestJapanCell(grid, LANDMARKS.kanto.lon, LANDMARKS.kanto.lat, heights);
    expect(heights[kanto]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
    const here = mapPointToLonLat(JAPAN_REGION, JAPAN_GRAPH.width, JAPAN_GRAPH.height, ...grid.points[kanto]);
    expect(Math.hypot(here.lon - LANDMARKS.kanto.lon, here.lat - LANDMARKS.kanto.lat)).toBeLessThan(0.4);

    const kyushuCell = nearestJapanCell(grid, LANDMARKS.kyushu.lon, LANDMARKS.kyushu.lat, heights);
    const hokkaidoCell = nearestJapanCell(grid, LANDMARKS.hokkaido.lon, LANDMARKS.hokkaido.lat, heights);
    const [kx, ky] = grid.points[kyushuCell];
    const [hx, hy] = grid.points[hokkaidoCell];
    expect(kx, "Kyushu is on the western half").toBeLessThan(JAPAN_GRAPH.width / 2);
    expect(ky, "Kyushu is on the southern half").toBeGreaterThan(JAPAN_GRAPH.height / 2);
    expect(hx, "Hokkaido is on the eastern half").toBeGreaterThan(JAPAN_GRAPH.width / 2);
    expect(hy, "Hokkaido is on the northern half").toBeLessThan(JAPAN_GRAPH.height / 2);

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

const BRITAIN_LANDMARKS = {
  london: { lon: -0.12, lat: 51.51 },
  manchester: { lon: -2.24, lat: 53.48 },
  dublin: { lon: -6.26, lat: 53.35 },
  cork: { lon: -8.47, lat: 51.9 },
  edinburgh: { lon: -3.19, lat: 55.95 },
  shetland: { lon: -1.27, lat: 60.38 },
  landsEnd: { lon: -5.72, lat: 50.07 },
  dover: { lon: 1.32, lat: 51.13 }
};

const BRITAIN_IN_FRAME = {
  man: { lon: -4.5, lat: 54.23 },
  wight: { lon: -1.3, lat: 50.67 },
  anglesey: { lon: -4.38, lat: 53.28 },
  calais: { lon: 1.86, lat: 50.95 }
};

async function generateBritain(points = 4) {
  worldContext.graphWidth = BRITAIN_GRAPH.width;
  worldContext.graphHeight = BRITAIN_GRAPH.height;
  useOptionsState.getState().setOptions({ points, template: "britain", heightExponent: 1.8 });
  const grid = generateGrid("earth-britain-test", BRITAIN_GRAPH.width, BRITAIN_GRAPH.height);
  const heights = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
  return { grid, heights };
}

function nearestBritainCell(
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
    const here = mapPointToLonLat(BRITAIN_REGION, BRITAIN_GRAPH.width, BRITAIN_GRAPH.height, x, y);
    const d = (here.lon - lon) ** 2 + (here.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function britainWaterAlong(
  grid: ReturnType<typeof generateGrid>,
  heights: Uint8Array,
  pred: (lon: number, lat: number) => boolean
): { lon: number; lat: number }[] {
  const cells: { lon: number; lat: number }[] = [];
  for (let i = 0; i < grid.points.length; i++) {
    if (heights[i] >= HeightThreshold.WATER_MAX_HEIGHT) continue;
    const [x, y] = grid.points[i];
    const here = mapPointToLonLat(BRITAIN_REGION, BRITAIN_GRAPH.width, BRITAIN_GRAPH.height, x, y);
    if (pred(here.lon, here.lat)) cells.push(here);
  }
  return cells;
}

function isInsideBritainBbox(lon: number, lat: number): boolean {
  return (
    lon >= BRITAIN_REGION.west &&
    lon <= BRITAIN_REGION.east &&
    lat >= BRITAIN_REGION.south &&
    lat <= BRITAIN_REGION.north
  );
}

describe("fromEarthRegion britain", () => {
  it("frames western Ireland in the south-west and Shetland in the north-east", () => {
    expect(BRITAIN_REGION.west).toBeCloseTo(-11.5, 5);
    expect(BRITAIN_REGION.east).toBeCloseTo(3.0, 5);
    expect(BRITAIN_REGION.south).toBeCloseTo(49.0, 5);
    expect(BRITAIN_REGION.north).toBeCloseTo(61.7, 5);
    expect(BRITAIN_REGION.north - BRITAIN_LANDMARKS.shetland.lat).toBeGreaterThan(0.8);
    expect(BRITAIN_LANDMARKS.landsEnd.lat - BRITAIN_REGION.south).toBeGreaterThan(0.8);
    expect(BRITAIN_REGION.east - BRITAIN_LANDMARKS.dover.lon).toBeGreaterThan(1);
    expect(isInsideBritainBbox(BRITAIN_LANDMARKS.cork.lon, BRITAIN_LANDMARKS.cork.lat)).toBe(true);
    expect(isInsideBritainBbox(BRITAIN_LANDMARKS.shetland.lon, BRITAIN_LANDMARKS.shetland.lat)).toBe(true);
    expect(isInsideBritainBbox(-19, 64.8), "Iceland").toBe(false);
    for (const [name, place] of Object.entries(BRITAIN_IN_FRAME)) {
      expect(isInsideBritainBbox(place.lon, place.lat), name).toBe(true);
    }
  });

  it("does not stretch Britain to the window aspect", () => {
    const midLat = ((BRITAIN_REGION.north + BRITAIN_REGION.south) / 2) * (Math.PI / 180);
    const expected = (KM_PER_DEG_LON_EQUATOR * Math.cos(midLat)) / KM_PER_DEG_LAT;
    const aspect = earthRegionAspect(BRITAIN_REGION);
    for (const [maxW, maxH] of [
      [960, 540],
      [540, 960],
      [800, 800]
    ] as const) {
      const fitted = earthRegionFitGraph(BRITAIN_REGION, maxW, maxH);
      expect(fitted.width / fitted.height, `${maxW}x${maxH} aspect`).toBeCloseTo(aspect, 2);
      expect(fitted.width).toBeLessThanOrEqual(maxW);
      expect(fitted.height).toBeLessThanOrEqual(maxH);
      const origin = lonLatToMapPoint(BRITAIN_REGION, fitted.width, fitted.height, -4.25, 55.35);
      const east = lonLatToMapPoint(BRITAIN_REGION, fitted.width, fitted.height, -3.25, 55.35);
      const north = lonLatToMapPoint(BRITAIN_REGION, fitted.width, fitted.height, -4.25, 56.35);
      const dx = Math.hypot(east.x - origin.x, east.y - origin.y);
      const dy = Math.hypot(north.x - origin.x, north.y - origin.y);
      expect(dx / dy, `${maxW}x${maxH}`).toBeCloseTo(expected, 3);
    }
  });

  it("keeps London as land and Ireland separate from Great Britain", async () => {
    const { grid, heights } = await generateBritain(6);
    const london = nearestBritainCell(grid, BRITAIN_LANDMARKS.london.lon, BRITAIN_LANDMARKS.london.lat, heights);
    expect(heights[london]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
    const here = mapPointToLonLat(BRITAIN_REGION, BRITAIN_GRAPH.width, BRITAIN_GRAPH.height, ...grid.points[london]);
    expect(Math.hypot(here.lon - BRITAIN_LANDMARKS.london.lon, here.lat - BRITAIN_LANDMARKS.london.lat)).toBeLessThan(
      0.4
    );

    const ireland = landComponentId(
      heights,
      grid,
      nearestBritainCell(grid, BRITAIN_LANDMARKS.dublin.lon, BRITAIN_LANDMARKS.dublin.lat, heights)
    );
    const britain = landComponentId(heights, grid, london);
    const france = landComponentId(
      heights,
      grid,
      nearestBritainCell(grid, BRITAIN_IN_FRAME.calais.lon, BRITAIN_IN_FRAME.calais.lat, heights)
    );
    expect(ireland, "ireland land").toBeGreaterThanOrEqual(0);
    expect(britain, "britain land").toBeGreaterThanOrEqual(0);
    expect(france, "calais land").toBeGreaterThanOrEqual(0);
    expect(ireland !== britain, `Ireland-Britain ${ireland}/${britain}`).toBe(true);
    expect(britain !== france, `Britain-France ${britain}/${france}`).toBe(true);

    const raster = await loadEarthRaster(BRITAIN_REGION);
    for (const [name, place] of Object.entries(BRITAIN_IN_FRAME)) {
      expect(sampleLand(raster, place.lon, place.lat), `${name} raster`).toBe(true);
    }
    expect(sampleLand(raster, BRITAIN_LANDMARKS.shetland.lon, BRITAIN_LANDMARKS.shetland.lat), "Shetland").toBe(true);
  }, 20000);

  it("keeps a coastal sea corridor through the Strait of Dover", async () => {
    const { grid, heights } = await generateBritain(4);
    const doverLand = nearestBritainCell(grid, BRITAIN_LANDMARKS.dover.lon, BRITAIN_LANDMARKS.dover.lat, heights);
    expect(heights[doverLand]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);

    const channel = britainWaterAlong(
      grid,
      heights,
      (lon, lat) => lon > 1.15 && lon < 1.85 && lat > 50.85 && lat < 51.2
    );
    expect(channel.length, "water in the Strait of Dover").toBeGreaterThan(3);
    const span = Math.max(...channel.map(c => c.lat)) - Math.min(...channel.map(c => c.lat));
    expect(span, "Dover passage is not a single pinch cell").toBeGreaterThan(0.15);
  }, 20000);
});

const MED_LANDMARKS = {
  gibraltar: { lon: -5.35, lat: 36.14 },
  cadiz: { lon: -6.29, lat: 36.53 },
  venice: { lon: 12.34, lat: 45.44 },
  tunis: { lon: 10.18, lat: 36.81 },
  alexandria: { lon: 29.92, lat: 31.2 },
  palermo: { lon: 13.36, lat: 38.12 },
  cagliari: { lon: 9.11, lat: 39.22 },
  ajaccio: { lon: 8.74, lat: 41.93 },
  nicosia: { lon: 33.38, lat: 35.17 }
};

const MED_IN_FRAME = {
  sicily: { lon: 13.36, lat: 38.12 },
  sardinia: { lon: 9.11, lat: 39.22 },
  corsica: { lon: 8.74, lat: 41.93 },
  crete: { lon: 24.9, lat: 35.2 },
  cyprus: { lon: 33.38, lat: 35.17 },
  mallorca: { lon: 2.65, lat: 39.57 },
  malta: { lon: 14.38, lat: 35.9 }
};

async function generateMediterranean(points = 4) {
  worldContext.graphWidth = MED_GRAPH.width;
  worldContext.graphHeight = MED_GRAPH.height;
  useOptionsState.getState().setOptions({ points, template: "mediterranean-sea", heightExponent: 1.8 });
  const grid = generateGrid("earth-med-test", MED_GRAPH.width, MED_GRAPH.height);
  const heights = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
  return { grid, heights };
}

function nearestMedCell(grid: ReturnType<typeof generateGrid>, lon: number, lat: number, heights?: Uint8Array): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < grid.points.length; i++) {
    if (heights && heights[i] < HeightThreshold.WATER_MAX_HEIGHT) continue;
    const [x, y] = grid.points[i];
    const here = mapPointToLonLat(MEDITERRANEAN_SEA_REGION, MED_GRAPH.width, MED_GRAPH.height, x, y);
    const d = (here.lon - lon) ** 2 + (here.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function medWaterAlong(
  grid: ReturnType<typeof generateGrid>,
  heights: Uint8Array,
  pred: (lon: number, lat: number) => boolean
): { lon: number; lat: number }[] {
  const cells: { lon: number; lat: number }[] = [];
  for (let i = 0; i < grid.points.length; i++) {
    if (heights[i] >= HeightThreshold.WATER_MAX_HEIGHT) continue;
    const [x, y] = grid.points[i];
    const here = mapPointToLonLat(MEDITERRANEAN_SEA_REGION, MED_GRAPH.width, MED_GRAPH.height, x, y);
    if (pred(here.lon, here.lat)) cells.push(here);
  }
  return cells;
}

function isInsideMedBbox(lon: number, lat: number): boolean {
  return (
    lon >= MEDITERRANEAN_SEA_REGION.west &&
    lon <= MEDITERRANEAN_SEA_REGION.east &&
    lat >= MEDITERRANEAN_SEA_REGION.south &&
    lat <= MEDITERRANEAN_SEA_REGION.north
  );
}

describe("fromEarthRegion mediterranean-sea", () => {
  it("frames Gibraltar in the west and the Levant in the east", () => {
    expect(MEDITERRANEAN_SEA_REGION.west).toBeCloseTo(-7, 5);
    expect(MEDITERRANEAN_SEA_REGION.east).toBeCloseTo(36.8, 5);
    expect(MEDITERRANEAN_SEA_REGION.south).toBeCloseTo(29.8, 5);
    expect(MEDITERRANEAN_SEA_REGION.north).toBeCloseTo(46.2, 5);
    expect(MED_LANDMARKS.gibraltar.lon - MEDITERRANEAN_SEA_REGION.west).toBeGreaterThan(1);
    expect(MEDITERRANEAN_SEA_REGION.east - MED_LANDMARKS.nicosia.lon).toBeGreaterThan(2);
    expect(MEDITERRANEAN_SEA_REGION.north - MED_LANDMARKS.venice.lat).toBeGreaterThan(0.5);
    expect(MED_LANDMARKS.alexandria.lat - MEDITERRANEAN_SEA_REGION.south).toBeGreaterThan(1);
    expect(isInsideMedBbox(MED_LANDMARKS.cadiz.lon, MED_LANDMARKS.cadiz.lat)).toBe(true);
    expect(isInsideMedBbox(-9.14, 38.72), "Lisbon").toBe(false);
    expect(isInsideMedBbox(32.9, 24.09), "Aswan").toBe(false);
    for (const [name, place] of Object.entries(MED_IN_FRAME)) {
      expect(isInsideMedBbox(place.lon, place.lat), name).toBe(true);
    }
  });

  it("does not stretch the Mediterranean to the window aspect", () => {
    const midLat = ((MEDITERRANEAN_SEA_REGION.north + MEDITERRANEAN_SEA_REGION.south) / 2) * (Math.PI / 180);
    const expected = (KM_PER_DEG_LON_EQUATOR * Math.cos(midLat)) / KM_PER_DEG_LAT;
    const aspect = earthRegionAspect(MEDITERRANEAN_SEA_REGION);
    for (const [maxW, maxH] of [
      [960, 540],
      [540, 960],
      [800, 800]
    ] as const) {
      const fitted = earthRegionFitGraph(MEDITERRANEAN_SEA_REGION, maxW, maxH);
      expect(fitted.width / fitted.height, `${maxW}x${maxH} aspect`).toBeCloseTo(aspect, 2);
      expect(fitted.width).toBeLessThanOrEqual(maxW);
      expect(fitted.height).toBeLessThanOrEqual(maxH);
      const origin = lonLatToMapPoint(MEDITERRANEAN_SEA_REGION, fitted.width, fitted.height, 14.9, 38);
      const east = lonLatToMapPoint(MEDITERRANEAN_SEA_REGION, fitted.width, fitted.height, 15.9, 38);
      const north = lonLatToMapPoint(MEDITERRANEAN_SEA_REGION, fitted.width, fitted.height, 14.9, 39);
      const dx = Math.hypot(east.x - origin.x, east.y - origin.y);
      const dy = Math.hypot(north.x - origin.x, north.y - origin.y);
      expect(dx / dy, `${maxW}x${maxH}`).toBeCloseTo(expected, 2);
    }
  });

  it("keeps Venice as land and Sicily, Sardinia and Corsica separate", async () => {
    const { grid, heights } = await generateMediterranean(6);
    const venice = nearestMedCell(grid, MED_LANDMARKS.venice.lon, MED_LANDMARKS.venice.lat, heights);
    expect(heights[venice]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
    const here = mapPointToLonLat(MEDITERRANEAN_SEA_REGION, MED_GRAPH.width, MED_GRAPH.height, ...grid.points[venice]);
    expect(Math.hypot(here.lon - MED_LANDMARKS.venice.lon, here.lat - MED_LANDMARKS.venice.lat)).toBeLessThan(0.5);

    const italy = landComponentId(heights, grid, venice);
    const sicily = landComponentId(
      heights,
      grid,
      nearestMedCell(grid, MED_LANDMARKS.palermo.lon, MED_LANDMARKS.palermo.lat, heights)
    );
    const sardinia = landComponentId(
      heights,
      grid,
      nearestMedCell(grid, MED_LANDMARKS.cagliari.lon, MED_LANDMARKS.cagliari.lat, heights)
    );
    const corsica = landComponentId(
      heights,
      grid,
      nearestMedCell(grid, MED_LANDMARKS.ajaccio.lon, MED_LANDMARKS.ajaccio.lat, heights)
    );
    expect(italy, "italy land").toBeGreaterThanOrEqual(0);
    expect(sicily, "sicily land").toBeGreaterThanOrEqual(0);
    expect(sardinia, "sardinia land").toBeGreaterThanOrEqual(0);
    expect(corsica, "corsica land").toBeGreaterThanOrEqual(0);
    expect(italy !== sicily, `Italy-Sicily ${italy}/${sicily}`).toBe(true);
    expect(sardinia !== corsica, `Sardinia-Corsica ${sardinia}/${corsica}`).toBe(true);

    const raster = await loadEarthRaster(MEDITERRANEAN_SEA_REGION);
    for (const [name, place] of Object.entries(MED_IN_FRAME)) {
      expect(sampleLand(raster, place.lon, place.lat), `${name} raster`).toBe(true);
    }
  }, 20000);

  it("keeps a sea corridor through the Strait of Gibraltar", async () => {
    const { grid, heights } = await generateMediterranean(4);
    const gibraltarLand = nearestMedCell(grid, MED_LANDMARKS.gibraltar.lon, MED_LANDMARKS.gibraltar.lat, heights);
    expect(heights[gibraltarLand]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);

    const strait = medWaterAlong(grid, heights, (lon, lat) => lon > -5.9 && lon < -5.1 && lat > 35.8 && lat < 36.2);
    expect(strait.length, "water in the Strait of Gibraltar").toBeGreaterThan(2);
    const span = Math.max(...strait.map(c => c.lon)) - Math.min(...strait.map(c => c.lon));
    expect(span, "Gibraltar passage is not a single pinch cell").toBeGreaterThan(0.2);
  }, 20000);
});

const EUROPE_CENTRAL_LANDMARKS = {
  paris: { lon: 2.35, lat: 48.86 },
  amsterdam: { lon: 4.9, lat: 52.37 },
  brussels: { lon: 4.35, lat: 50.85 },
  cologne: { lon: 6.96, lat: 50.94 },
  lyon: { lon: 4.84, lat: 45.76 },
  hamburg: { lon: 10.0, lat: 53.55 },
  berlin: { lon: 13.41, lat: 52.52 },
  london: { lon: -0.12, lat: 51.51 },
  dover: { lon: 1.32, lat: 51.13 }
};

const EUROPE_CENTRAL_IN_FRAME = {
  essen: { lon: 7.01, lat: 51.45 },
  antwerp: { lon: 4.4, lat: 51.22 },
  frankfurt: { lon: 8.68, lat: 50.11 },
  leipzig: { lon: 12.37, lat: 51.34 }
};

async function generateEuropeCentral(points = 4) {
  worldContext.graphWidth = EUROPE_CENTRAL_GRAPH.width;
  worldContext.graphHeight = EUROPE_CENTRAL_GRAPH.height;
  useOptionsState.getState().setOptions({ points, template: "europe-central", heightExponent: 1.8 });
  const grid = generateGrid("earth-europe-central-test", EUROPE_CENTRAL_GRAPH.width, EUROPE_CENTRAL_GRAPH.height);
  const heights = await HeightmapGenerator.generate(worldContext, viewContext, appServices, grid);
  return { grid, heights };
}

function nearestEuropeCentralCell(
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
    const here = mapPointToLonLat(EUROPE_CENTRAL_REGION, EUROPE_CENTRAL_GRAPH.width, EUROPE_CENTRAL_GRAPH.height, x, y);
    const d = (here.lon - lon) ** 2 + (here.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function europeCentralWaterAlong(
  grid: ReturnType<typeof generateGrid>,
  heights: Uint8Array,
  pred: (lon: number, lat: number) => boolean
): { lon: number; lat: number }[] {
  const cells: { lon: number; lat: number }[] = [];
  for (let i = 0; i < grid.points.length; i++) {
    if (heights[i] >= HeightThreshold.WATER_MAX_HEIGHT) continue;
    const [x, y] = grid.points[i];
    const here = mapPointToLonLat(EUROPE_CENTRAL_REGION, EUROPE_CENTRAL_GRAPH.width, EUROPE_CENTRAL_GRAPH.height, x, y);
    if (pred(here.lon, here.lat)) cells.push(here);
  }
  return cells;
}

function isInsideEuropeCentralBbox(lon: number, lat: number): boolean {
  return (
    lon >= EUROPE_CENTRAL_REGION.west &&
    lon <= EUROPE_CENTRAL_REGION.east &&
    lat >= EUROPE_CENTRAL_REGION.south &&
    lat <= EUROPE_CENTRAL_REGION.north
  );
}

describe("fromEarthRegion europe-central", () => {
  it("frames the Channel and Low Countries in the north-west and Saxony in the east", () => {
    expect(EUROPE_CENTRAL_REGION.west).toBeCloseTo(-1.8, 5);
    expect(EUROPE_CENTRAL_REGION.east).toBeCloseTo(14.8, 5);
    expect(EUROPE_CENTRAL_REGION.south).toBeCloseTo(45.5, 5);
    expect(EUROPE_CENTRAL_REGION.north).toBeCloseTo(54.3, 5);
    expect(isInsideEuropeCentralBbox(EUROPE_CENTRAL_LANDMARKS.paris.lon, EUROPE_CENTRAL_LANDMARKS.paris.lat)).toBe(
      true
    );
    expect(isInsideEuropeCentralBbox(EUROPE_CENTRAL_LANDMARKS.lyon.lon, EUROPE_CENTRAL_LANDMARKS.lyon.lat)).toBe(true);
    expect(isInsideEuropeCentralBbox(EUROPE_CENTRAL_LANDMARKS.hamburg.lon, EUROPE_CENTRAL_LANDMARKS.hamburg.lat)).toBe(
      true
    );
    expect(isInsideEuropeCentralBbox(EUROPE_CENTRAL_LANDMARKS.berlin.lon, EUROPE_CENTRAL_LANDMARKS.berlin.lat)).toBe(
      true
    );
    expect(isInsideEuropeCentralBbox(EUROPE_CENTRAL_LANDMARKS.london.lon, EUROPE_CENTRAL_LANDMARKS.london.lat)).toBe(
      true
    );
    expect(isInsideEuropeCentralBbox(16.37, 48.21), "Vienna").toBe(false);
    expect(isInsideEuropeCentralBbox(12.57, 55.68), "Copenhagen").toBe(false);
    expect(isInsideEuropeCentralBbox(9.19, 45.46), "Milan").toBe(false);
    for (const [name, place] of Object.entries(EUROPE_CENTRAL_IN_FRAME)) {
      expect(isInsideEuropeCentralBbox(place.lon, place.lat), name).toBe(true);
    }
  });

  it("does not stretch Central Europe to the window aspect", () => {
    const midLat = ((EUROPE_CENTRAL_REGION.north + EUROPE_CENTRAL_REGION.south) / 2) * (Math.PI / 180);
    const expected = (KM_PER_DEG_LON_EQUATOR * Math.cos(midLat)) / KM_PER_DEG_LAT;
    const aspect = earthRegionAspect(EUROPE_CENTRAL_REGION);
    for (const [maxW, maxH] of [
      [960, 540],
      [540, 960],
      [800, 800]
    ] as const) {
      const fitted = earthRegionFitGraph(EUROPE_CENTRAL_REGION, maxW, maxH);
      expect(fitted.width / fitted.height, `${maxW}x${maxH} aspect`).toBeCloseTo(aspect, 2);
      expect(fitted.width).toBeLessThanOrEqual(maxW);
      expect(fitted.height).toBeLessThanOrEqual(maxH);
      const origin = lonLatToMapPoint(EUROPE_CENTRAL_REGION, fitted.width, fitted.height, 6.5, 49.8);
      const east = lonLatToMapPoint(EUROPE_CENTRAL_REGION, fitted.width, fitted.height, 7.5, 49.8);
      const north = lonLatToMapPoint(EUROPE_CENTRAL_REGION, fitted.width, fitted.height, 6.5, 50.8);
      const dx = Math.hypot(east.x - origin.x, east.y - origin.y);
      const dy = Math.hypot(north.x - origin.x, north.y - origin.y);
      expect(dx / dy, `${maxW}x${maxH}`).toBeCloseTo(expected, 2);
    }
  });

  it("keeps Paris as land and Britain separate from the continent", async () => {
    const { grid, heights } = await generateEuropeCentral(6);
    const paris = nearestEuropeCentralCell(
      grid,
      EUROPE_CENTRAL_LANDMARKS.paris.lon,
      EUROPE_CENTRAL_LANDMARKS.paris.lat,
      heights
    );
    expect(heights[paris]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
    const here = mapPointToLonLat(
      EUROPE_CENTRAL_REGION,
      EUROPE_CENTRAL_GRAPH.width,
      EUROPE_CENTRAL_GRAPH.height,
      ...grid.points[paris]
    );
    expect(
      Math.hypot(here.lon - EUROPE_CENTRAL_LANDMARKS.paris.lon, here.lat - EUROPE_CENTRAL_LANDMARKS.paris.lat)
    ).toBeLessThan(0.4);

    const continent = landComponentId(heights, grid, paris);
    const britain = landComponentId(
      heights,
      grid,
      nearestEuropeCentralCell(grid, EUROPE_CENTRAL_LANDMARKS.london.lon, EUROPE_CENTRAL_LANDMARKS.london.lat, heights)
    );
    expect(continent, "continent land").toBeGreaterThanOrEqual(0);
    expect(britain, "london land").toBeGreaterThanOrEqual(0);
    expect(continent !== britain, `Continent-Britain ${continent}/${britain}`).toBe(true);

    const raster = await loadEarthRaster(EUROPE_CENTRAL_REGION);
    for (const [name, place] of Object.entries(EUROPE_CENTRAL_IN_FRAME)) {
      expect(sampleLand(raster, place.lon, place.lat), `${name} raster`).toBe(true);
    }
    expect(
      sampleLand(raster, EUROPE_CENTRAL_LANDMARKS.cologne.lon, EUROPE_CENTRAL_LANDMARKS.cologne.lat),
      "Cologne"
    ).toBe(true);
  }, 20000);

  it("keeps a sea corridor through the Strait of Dover", async () => {
    const { grid, heights } = await generateEuropeCentral(4);
    const doverLand = nearestEuropeCentralCell(
      grid,
      EUROPE_CENTRAL_LANDMARKS.dover.lon,
      EUROPE_CENTRAL_LANDMARKS.dover.lat,
      heights
    );
    expect(heights[doverLand]).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);

    const channel = europeCentralWaterAlong(
      grid,
      heights,
      (lon, lat) => lon > 1.15 && lon < 1.85 && lat > 50.85 && lat < 51.2
    );
    expect(channel.length, "water in the Strait of Dover").toBeGreaterThan(3);
    const span = Math.max(...channel.map(c => c.lat)) - Math.min(...channel.map(c => c.lat));
    expect(span, "Dover passage is not a single pinch cell").toBeGreaterThan(0.15);
  }, 20000);
});
