import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import "./nodeDomPolyfill";
import type { AppServices } from "../src/context/appServices";
import type { ViewContext } from "../src/context/viewContext";
import type { WorldContext } from "../src/context/worldContext";
import {
  buildDeckLayers,
  clearDeckLayerDataCache,
  estimateDeckLayerProjectionBytes,
  getDeckLayerDataCacheSize
} from "../src/renderers/webgl/buildDeckLayers";
import type { WebglRevisionProjection } from "../src/renderers/webgl/webglTopicRevisions";
import type { DataTopic } from "../src/runtime/worldRuntime";
import { FULL_REPLACE_TOPICS } from "../src/runtime/worldRuntime";
import { useLayerState } from "../src/store/layerState";

/**
 * §13 / P3-2 continuous performance harness.
 *
 * Measures at 10k / 50k / 100k cells:
 *   - initial projection (cold cache)
 *   - single-topic update (map.politics revision only)
 *   - full replace (all topic revisions)
 *   - preset switch (partial cache hit)
 *   - zoom-only full cache hit (upper bound; real zoom never rebuilds)
 *   - peak JS heap deltas, pack/grid typed-array budget, projection cache bytes,
 *     estimated GPU attribute bytes, snapshot/staging clone cost, mode-switch release
 *
 * Run: npm run perf:webgl-layers
 * Writes: docs/analytics/webgl-layer-benchmark-latest.json
 *
 * Partial GPU buffer updates are only justified when single-topic times approach
 * full projection for the affected layers — see report.partialGpuRecommendation.
 */

const appServices = {} as AppServices;

const CORE_TOPICS: readonly DataTopic[] = FULL_REPLACE_TOPICS;

interface Mesh {
  vertices: { p: [number, number][]; c: number[][] };
  cellsV: number[][];
  cellsC: number[][];
}

/** Builds a rectangular cell grid with real shared vertices/edges between neighbors. */
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
  return Array.from({ length: count }, (_, i) => {
    const hue = (i * 47) % 360;
    return { i, color: "hsl(" + hue + ", 60%, 50%)" };
  });
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
    biomesData: {
      color: Array.from({ length: numBiomes }, (_, i) => "hsl(" + i * 30 + ", 50%, 50%)")
    },
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

// Cell-count-scaling layers only (entity-count layers intentionally empty in the fixture).
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

/** Soft budgets used only for advisory flags (not CI hard fails). Tuned from 2026-07 runs. */
const SOFT_BUDGETS = {
  initialMsAt100k: 2000,
  singleTopicMsAt100k: 800,
  fullReplaceMsAt100k: 2000,
  zoomOnlyMsAt100k: 20,
  /** If single-topic / initial > this ratio at 100k, consider partial GPU for politics layers. */
  partialGpuSingleTopicRatio: 0.55
} as const;

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function heapUsedBytes(): number {
  return process.memoryUsage().heapUsed;
}

function maybeGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc === "function") gc();
}

function makeRevisionProjection(revision: number, topicRevisions: Record<string, number>): WebglRevisionProjection {
  return { revision, topicRevisions };
}

function uniformTopicRevisions(value: number): Record<string, number> {
  return Object.fromEntries(CORE_TOPICS.map(topic => [topic, value]));
}

/** Typed-array payload of the synthetic pack/grid (canonical density columns only). */
function estimatePackGridTypedArrayBytes(world: WorldContext): number {
  let bytes = 0;
  const visit = (value: unknown): void => {
    if (ArrayBuffer.isView(value)) {
      bytes += (value as ArrayBufferView).byteLength;
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      // Skip large nested number[][] neighbor tables for this budget (topology CSR is separate).
      return;
    }
    for (const child of Object.values(value as Record<string, unknown>)) visit(child);
  };
  visit(world.pack.cells);
  visit(world.grid.cells);
  return bytes;
}

/**
 * Approximate cost of a staging snapshot of dense cell columns (archive / generate rollback).
 * structuredClone of typed arrays is counted as 2× live payload (source + clone).
 */
function measureSnapshotStagingBytes(world: WorldContext): { cloneMs: number; stagingBytes: number } {
  const columns: ArrayBufferView[] = [];
  const cells = world.pack.cells as unknown as Record<string, unknown>;
  for (const value of Object.values(cells)) {
    if (ArrayBuffer.isView(value)) columns.push(value as ArrayBufferView);
  }
  const liveBytes = columns.reduce((sum, view) => sum + view.byteLength, 0);
  const start = performance.now();
  const clones = columns.map(view => {
    const Ctor = view.constructor as new (length: number) => ArrayBufferView;
    const copy = new Ctor(view.length);
    (copy as unknown as { set: (src: ArrayLike<number>) => void }).set(view as unknown as ArrayLike<number>);
    return copy;
  });
  const cloneMs = performance.now() - start;
  // Keep clones alive until measurement returns so V8 does not elide the copy.
  const stagingBytes = liveBytes + clones.reduce((sum, view) => sum + view.byteLength, 0);
  return { cloneMs, stagingBytes };
}

/** Best-effort estimate of GPU-uploadable attribute bytes from deck.gl layer props. */
function estimateGpuAttributeBytes(
  layers: ReadonlyArray<{ props?: Record<string, unknown> & { data?: unknown } }>
): number {
  let bytes = 0;
  const seen = new Set<object>();
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    if (ArrayBuffer.isView(value)) {
      bytes += (value as ArrayBufferView).byteLength;
      return;
    }
    if (Array.isArray(value)) {
      // deck.gl binary attribute bags are non-enumerable (`attributes` on the data array).
      const attrs = (value as { attributes?: unknown }).attributes;
      if (attrs) walk(attrs);
      return;
    }
    for (const child of Object.values(value as Record<string, unknown>)) walk(child);
  };
  for (const layer of layers) {
    const props = layer.props;
    if (!props) continue;
    // deck.gl often stores `data` as a non-enumerable prop; read it explicitly.
    walk(props.data);
    walk((props as { attributes?: unknown }).attributes);
  }
  return bytes;
}

interface ScaleResult {
  cellCount: number;
  initialMs: number;
  singleTopicMs: number;
  fullReplaceMs: number;
  presetSwitchMs: number;
  zoomOnlyMs: number;
  cacheEntriesAfterInitial: number;
  packGridTypedArrayBytes: number;
  projectionCacheBytes: number;
  landTopologyBytes: number;
  estimatedGpuAttributeBytes: number;
  snapshotCloneMs: number;
  snapshotStagingBytes: number;
  heapBeforeMb: number;
  heapAfterInitialMb: number;
  heapAfterFullMb: number;
  heapAfterReleaseMb: number;
  /** Projection-cache bytes freed by clearDeckLayerDataCache (mode-switch stand-in). */
  modeSwitchReleaseMb: number;
  /** pack/grid typed arrays + projection cache + estimated GPU attrs held at peak. */
  concurrentMemoryBudgetBytes: number;
}

function runScenario(cellCount: number): ScaleResult {
  const worldContext = buildSyntheticWorldContext(cellCount);
  const viewContext = { focusScope: null } as ViewContext;
  const packGridTypedArrayBytes = estimatePackGridTypedArrayBytes(worldContext);
  const snapshot = measureSnapshotStagingBytes(worldContext);

  maybeGc();
  const heapBefore = heapUsedBytes();

  clearDeckLayerDataCache();
  useLayerState.getState().setAllActiveLayers(PRESET_INITIAL);

  const baseProjection = makeRevisionProjection(1, uniformTopicRevisions(1));
  let layers = buildDeckLayers(worldContext, viewContext, appServices, {
    revisionProjection: baseProjection
  });
  // Warm signatures once so "initial" below is a true cold-cache rebuild after clear.
  clearDeckLayerDataCache();

  const initialMs = timeMs(() => {
    layers = buildDeckLayers(worldContext, viewContext, appServices, {
      revisionProjection: baseProjection
    });
  });
  const heapAfterInitial = heapUsedBytes();
  const cacheEntriesAfterInitial = getDeckLayerDataCacheSize();
  const projectionAfterInitial = estimateDeckLayerProjectionBytes();
  const estimatedGpuAttributeBytes = estimateGpuAttributeBytes(
    layers as unknown as Array<{ props?: Record<string, unknown> }>
  );

  // Single-topic: only map.politics advances (states/provinces/borders invalidation path).
  const politicsBump = makeRevisionProjection(2, {
    ...uniformTopicRevisions(1),
    "map.politics": 2
  });
  // Mutate political column so content-hash fallback (if used) also sees a change.
  const packCells = worldContext.pack.cells as unknown as { state: Uint16Array };
  packCells.state[0] = (packCells.state[0] + 1) % 24;

  const singleTopicMs = timeMs(() => {
    layers = buildDeckLayers(worldContext, viewContext, appServices, {
      revisionProjection: politicsBump
    });
  });

  // Full replace: every topic revision advances (archive load / world.generate path).
  const fullReplaceProjection = makeRevisionProjection(3, uniformTopicRevisions(2));
  const fullReplaceMs = timeMs(() => {
    layers = buildDeckLayers(worldContext, viewContext, appServices, {
      revisionProjection: fullReplaceProjection
    });
  });
  const heapAfterFull = heapUsedBytes();
  const projectionAfterFull = estimateDeckLayerProjectionBytes();

  useLayerState.getState().setAllActiveLayers(PRESET_SWITCHED);
  const presetSwitchMs = timeMs(() => {
    layers = buildDeckLayers(worldContext, viewContext, appServices, {
      revisionProjection: fullReplaceProjection
    });
  });

  // Real zoom/pan never calls buildDeckLayers(); this is the full-cache-hit upper bound.
  const zoomOnlyMs = timeMs(() => {
    layers = buildDeckLayers(worldContext, viewContext, appServices, {
      revisionProjection: fullReplaceProjection
    });
  });

  const projectionBeforeClear = estimateDeckLayerProjectionBytes();
  clearDeckLayerDataCache();
  maybeGc();
  const heapAfterRelease = heapUsedBytes();
  const projectionAfterClear = estimateDeckLayerProjectionBytes();

  return {
    cellCount,
    initialMs,
    singleTopicMs,
    fullReplaceMs,
    presetSwitchMs,
    zoomOnlyMs,
    cacheEntriesAfterInitial,
    packGridTypedArrayBytes,
    projectionCacheBytes: Math.max(projectionAfterInitial.totalBytes, projectionAfterFull.totalBytes),
    landTopologyBytes: Math.max(projectionAfterInitial.landTopologyBytes, projectionAfterFull.landTopologyBytes),
    estimatedGpuAttributeBytes,
    snapshotCloneMs: snapshot.cloneMs,
    snapshotStagingBytes: snapshot.stagingBytes,
    heapBeforeMb: heapBefore / (1024 * 1024),
    heapAfterInitialMb: heapAfterInitial / (1024 * 1024),
    heapAfterFullMb: heapAfterFull / (1024 * 1024),
    heapAfterReleaseMb: heapAfterRelease / (1024 * 1024),
    // Prefer deterministic projection-cache release; process heap needs --expose-gc to drop reliably.
    modeSwitchReleaseMb: Math.max(
      0,
      (projectionBeforeClear.totalBytes - projectionAfterClear.totalBytes) / (1024 * 1024)
    ),
    concurrentMemoryBudgetBytes:
      packGridTypedArrayBytes +
      Math.max(projectionAfterInitial.totalBytes, projectionAfterFull.totalBytes) +
      estimatedGpuAttributeBytes
  };
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function partialGpuRecommendation(results: ScaleResult[]): string {
  const at100k = results.find(r => r.cellCount === 100_000);
  if (!at100k) return "insufficient-data";
  const ratio = at100k.singleTopicMs / Math.max(at100k.initialMs, 1);
  if (ratio >= SOFT_BUDGETS.partialGpuSingleTopicRatio) {
    return (
      `consider-partial-gpu: single-topic/initial ratio ${ratio.toFixed(2)} at 100k ` +
      `(≥ ${SOFT_BUDGETS.partialGpuSingleTopicRatio}); profile politics/state polygon layers first`
    );
  }
  return (
    `not-needed: single-topic/initial ratio ${ratio.toFixed(2)} at 100k ` +
    `(< ${SOFT_BUDGETS.partialGpuSingleTopicRatio}); keep full layer rebuild on topic invalidation`
  );
}

function advisoryFlags(results: ScaleResult[]): string[] {
  const flags: string[] = [];
  const at100k = results.find(r => r.cellCount === 100_000);
  if (!at100k) return flags;
  if (at100k.initialMs > SOFT_BUDGETS.initialMsAt100k) {
    flags.push(`initial projection ${at100k.initialMs.toFixed(1)}ms exceeds soft budget ${SOFT_BUDGETS.initialMsAt100k}ms`);
  }
  if (at100k.singleTopicMs > SOFT_BUDGETS.singleTopicMsAt100k) {
    flags.push(`single-topic ${at100k.singleTopicMs.toFixed(1)}ms exceeds soft budget ${SOFT_BUDGETS.singleTopicMsAt100k}ms`);
  }
  if (at100k.fullReplaceMs > SOFT_BUDGETS.fullReplaceMsAt100k) {
    flags.push(`full replace ${at100k.fullReplaceMs.toFixed(1)}ms exceeds soft budget ${SOFT_BUDGETS.fullReplaceMsAt100k}ms`);
  }
  if (at100k.zoomOnlyMs > SOFT_BUDGETS.zoomOnlyMsAt100k) {
    flags.push(`zoom-only cache hit ${at100k.zoomOnlyMs.toFixed(1)}ms exceeds soft budget ${SOFT_BUDGETS.zoomOnlyMsAt100k}ms`);
  }
  return flags;
}

function main(): void {
  // Discard a small warm-up so V8 JIT warm-up does not skew the smallest scale.
  runScenario(2_000);

  const scales = [10_000, 50_000, 100_000];
  const results = scales.map(runScenario);
  const recommendation = partialGpuRecommendation(results);
  const flags = advisoryFlags(results);

  console.log("\nWebGL deck.gl projection benchmark (§13 / P3-2) — timings by cell count\n");
  console.table(
    results.map(r => ({
      cells: r.cellCount,
      "initial (ms)": r.initialMs.toFixed(1),
      "single-topic politics (ms)": r.singleTopicMs.toFixed(1),
      "full replace (ms)": r.fullReplaceMs.toFixed(1),
      "preset switch (ms)": r.presetSwitchMs.toFixed(1),
      "zoom-only cache hit (ms)": r.zoomOnlyMs.toFixed(1),
      "cache entries": r.cacheEntriesAfterInitial
    }))
  );

  console.log("\nMemory / projection budgets (approximate)\n");
  console.table(
    results.map(r => ({
      cells: r.cellCount,
      "pack/grid TA (MB)": formatMb(r.packGridTypedArrayBytes),
      "projection cache (MB)": formatMb(r.projectionCacheBytes),
      "land CSR (MB)": formatMb(r.landTopologyBytes),
      "est. GPU attrs (MB)": formatMb(r.estimatedGpuAttributeBytes),
      "concurrent budget (MB)": formatMb(r.concurrentMemoryBudgetBytes),
      "snapshot staging (MB)": formatMb(r.snapshotStagingBytes),
      "snapshot clone (ms)": r.snapshotCloneMs.toFixed(1),
      "heap after full (MB)": r.heapAfterFullMb.toFixed(1),
      "cache release (MB)": r.modeSwitchReleaseMb.toFixed(1)
    }))
  );

  console.log(`\nPartial GPU recommendation: ${recommendation}`);
  if (flags.length) {
    console.log("Soft budget advisories:");
    for (const flag of flags) console.log(`  - ${flag}`);
  } else {
    console.log("Soft budget advisories: none");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    softBudgets: SOFT_BUDGETS,
    partialGpuRecommendation: recommendation,
    advisoryFlags: flags,
    results: results.map(r => ({
      ...r,
      initialMs: Number(r.initialMs.toFixed(2)),
      singleTopicMs: Number(r.singleTopicMs.toFixed(2)),
      fullReplaceMs: Number(r.fullReplaceMs.toFixed(2)),
      presetSwitchMs: Number(r.presetSwitchMs.toFixed(2)),
      zoomOnlyMs: Number(r.zoomOnlyMs.toFixed(2)),
      snapshotCloneMs: Number(r.snapshotCloneMs.toFixed(2)),
      heapBeforeMb: Number(r.heapBeforeMb.toFixed(2)),
      heapAfterInitialMb: Number(r.heapAfterInitialMb.toFixed(2)),
      heapAfterFullMb: Number(r.heapAfterFullMb.toFixed(2)),
      heapAfterReleaseMb: Number(r.heapAfterReleaseMb.toFixed(2)),
      modeSwitchReleaseMb: Number(r.modeSwitchReleaseMb.toFixed(2))
    }))
  };

  const outDir = path.join(import.meta.dirname, "../docs/analytics");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "webgl-layer-benchmark-latest.json");
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)}`);
}

main();
