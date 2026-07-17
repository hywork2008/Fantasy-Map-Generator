import { performance } from "node:perf_hooks";
import "./nodeDomPolyfill";
import type { AppServices } from "../src/context/appServices";
import type { ViewContext } from "../src/context/viewContext";
import type { WorldContext } from "../src/context/worldContext";
import { buildDeckLayers, clearDeckLayerDataCache, getDeckLayerDataCacheSize } from "../src/renderers/webgl/buildDeckLayers";
import { useLayerState } from "../src/store/layerState";

/**
 * Phase 5 perf measurement tool (docs/webgl-renderer-migration-candidates.md items 3 & 5).
 * Synthesizes a WorldContext at a given cell count and times buildDeckLayers() for the three
 * scenarios the migration doc asks about: cold-cache initial draw, a layer-preset switch
 * (partial cache hit), and a repeat call with fully unchanged inputs (upper bound stand-in for
 * "zoom/pan" — in the real app zoom/pan never calls buildDeckLayers() at all, see
 * DeckGlRenderer.syncViewState() in src/renderers/webgl/deckRenderer.ts).
 *
 * Run: npm run perf:webgl-layers
 */

const appServices = {} as AppServices;

interface Mesh {
  vertices: { p: [number, number][]; c: number[][] };
  cellsV: number[][];
  cellsC: number[][];
}

/** Builds a rectangular cell grid with real shared vertices/edges between neighbors, so path
 * layers that depend on shared-edge lookup (grid, borders) do representative work. */
function buildGridMesh(cellCount: number, spacing = 10): Mesh {
  const gridSize = Math.ceil(Math.sqrt(cellCount));
  const vertsPerRow = gridSize + 1;
  const p: [number, number][] = [];
  for (let row = 0; row <= gridSize; row++) {
    for (let col = 0; col <= gridSize; col++) p.push([col * spacing, row * spacing]);
  }

  const c: number[][] = Array.from({ length: p.length }, () => []);
  const cellsV: number[][] = [];
  const cellsC: number[][] = [];

  for (let cellId = 0; cellId < cellCount; cellId++) {
    const row = Math.floor(cellId / gridSize);
    const col = cellId % gridSize;
    const topLeft = row * vertsPerRow + col;
    const topRight = topLeft + 1;
    const bottomLeft = topLeft + vertsPerRow;
    const bottomRight = bottomLeft + 1;
    const vertexIds = [topLeft, topRight, bottomRight, bottomLeft];
    cellsV.push(vertexIds);
    for (const vertexId of vertexIds) c[vertexId].push(cellId);

    const neighbors: number[] = [];
    if (col > 0) neighbors.push(cellId - 1);
    if (col < gridSize - 1 && cellId + 1 < cellCount) neighbors.push(cellId + 1);
    if (row > 0) neighbors.push(cellId - gridSize);
    if (cellId + gridSize < cellCount) neighbors.push(cellId + gridSize);
    cellsC.push(neighbors);
  }

  return { vertices: { p, c }, cellsV, cellsC };
}

function makeColorPalette(count: number): Array<{ i: number; color: string }> {
  return Array.from({ length: count }, (_, i) => ({ i, color: `hsl(${(i * 47) % 360}, 60%, 50%)` }));
}

function buildSyntheticWorldContext(cellCount: number): WorldContext {
  const mesh = buildGridMesh(cellCount);
  const cellsP = mesh.cellsV.map(vertexIds => {
    const points = vertexIds.map(vertexId => mesh.vertices.p[vertexId]);
    const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return [x, y] as [number, number];
  });

  const cellsI = new Uint32Array(cellCount);
  const cellsH = new Uint8Array(cellCount);
  const cellsG = new Uint32Array(cellCount);
  const cellsBiome = new Uint8Array(cellCount);
  const cellsCulture = new Uint8Array(cellCount);
  const cellsReligion = new Uint8Array(cellCount);
  const cellsState = new Uint16Array(cellCount);
  const cellsProvince = new Uint16Array(cellCount);
  const cellsDanger = new Uint8Array(cellCount);
  const cellsPop = new Uint8Array(cellCount);
  const cellsArea = new Float32Array(cellCount).fill(100);

  const numStates = 24;
  const numProvinces = 48;
  const numCultures = 12;
  const numReligions = 8;
  const numBiomes = 13;

  for (let i = 0; i < cellCount; i++) {
    cellsI[i] = i;
    // ~4% ocean (h < 20), rest land at varying heights, matching buildLandPolygons' h >= 20 filter.
    cellsH[i] = i % 25 === 0 ? 5 : 20 + (i % 70);
    cellsG[i] = i;
    cellsBiome[i] = i % numBiomes;
    cellsCulture[i] = i % numCultures;
    cellsReligion[i] = i % numReligions;
    cellsState[i] = i % numStates;
    cellsProvince[i] = i % numProvinces;
    cellsDanger[i] = i % 100;
    cellsPop[i] = i % 40;
  }

  const temp = new Int8Array(cellCount).map((_, i) => (i % 60) - 20);
  const prec = new Uint8Array(cellCount).map((_, i) => i % 300);

  const grid = {
    points: cellsP,
    cells: { i: cellsI, v: mesh.cellsV, c: mesh.cellsC, h: cellsH, temp, prec },
    vertices: mesh.vertices
  };

  return {
    mapId: 1,
    graphWidth: Math.ceil(Math.sqrt(cellCount)) * 10,
    graphHeight: Math.ceil(Math.sqrt(cellCount)) * 10,
    biomesData: { color: Array.from({ length: numBiomes }, (_, i) => `hsl(${i * 30}, 50%, 50%)`) },
    options: { burgs: { groups: [] }, military: [] },
    style: { burgIcons: {}, anchors: {} },
    grid,
    pack: {
      cells: {
        i: cellsI,
        v: mesh.cellsV,
        c: mesh.cellsC,
        p: cellsP,
        h: cellsH,
        g: cellsG,
        biome: cellsBiome,
        culture: cellsCulture,
        religion: cellsReligion,
        state: cellsState,
        province: cellsProvince,
        danger: cellsDanger,
        pop: cellsPop,
        area: cellsArea,
        routes: {}
      },
      vertices: mesh.vertices,
      cultures: makeColorPalette(numCultures),
      religions: makeColorPalette(numReligions),
      states: makeColorPalette(numStates),
      provinces: makeColorPalette(numProvinces),
      burgs: [],
      markers: [],
      zones: [],
      rivers: [],
      ice: [],
      features: [],
      routes: []
    }
  } as unknown as WorldContext;
}

// Cell-count-scaling layers only (buildBurgIconSymbols/markers/military/labels/emblems scale with
// entity count, not cell count, and the synthetic fixture above intentionally leaves those empty).
const PRESET_INITIAL = {
  toggleHeight: true,
  toggleBiomes: true,
  toggleStates: true,
  toggleProvinces: true,
  toggleTemperature: true,
  togglePopulation: true,
  togglePrecipitation: true,
  toggleDanger: true,
  toggleCells: true,
  toggleGrid: true,
  toggleBorders: true
};

const PRESET_SWITCHED = {
  toggleHeight: true,
  toggleCultures: true,
  toggleReligions: true,
  toggleStates: true,
  toggleTemperature: true,
  toggleDanger: true,
  toggleCells: true
};

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function runScenario(cellCount: number) {
  const worldContext = buildSyntheticWorldContext(cellCount);
  const viewContext = { focusScope: null } as ViewContext;

  clearDeckLayerDataCache();
  useLayerState.getState().setAllActiveLayers(PRESET_INITIAL);
  const initialMs = timeMs(() => buildDeckLayers(worldContext, viewContext, appServices));
  const cacheEntriesAfterInitial = getDeckLayerDataCacheSize();

  useLayerState.getState().setAllActiveLayers(PRESET_SWITCHED);
  const presetSwitchMs = timeMs(() => buildDeckLayers(worldContext, viewContext, appServices));

  // Real zoom/pan never calls buildDeckLayers() (see syncViewState()); this is the upper bound if
  // it did, with every input unchanged — i.e. a full per-layer cache hit.
  const zoomOnlyMs = timeMs(() => buildDeckLayers(worldContext, viewContext, appServices));

  return { cellCount, initialMs, presetSwitchMs, zoomOnlyMs, cacheEntriesAfterInitial };
}

function main(): void {
  // Discard a small warm-up run so V8 JIT warm-up doesn't skew the first real (smallest) scale.
  runScenario(2_000);

  const scales = [10_000, 50_000, 100_000];
  const results = scales.map(runScenario);

  console.log("\nWebGL deck.gl layer build benchmark — buildDeckLayers() timings by cell count\n");
  console.table(
    results.map(r => ({
      cells: r.cellCount,
      "initial draw (ms)": r.initialMs.toFixed(1),
      "preset switch (ms)": r.presetSwitchMs.toFixed(1),
      "zoom-only / full cache hit (ms)": r.zoomOnlyMs.toFixed(1),
      "cache entries": r.cacheEntriesAfterInitial
    }))
  );
}

main();
