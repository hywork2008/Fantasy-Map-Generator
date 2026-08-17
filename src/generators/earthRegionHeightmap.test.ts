import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { HeightThreshold } from "../data/constants";
import { earthRegionAspect, earthRegionFitGraph, KM_PER_DEG_LAT, KM_PER_DEG_LON_EQUATOR } from "../data/earthConfig";
import { BRITAIN_REGION, EAST_ASIA_REGION, JAPAN_REGION } from "../data/earthRegions";
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
