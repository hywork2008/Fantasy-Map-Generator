/**
 * Real-DEM heights for the campaign window of an Earth-region map, plus the dev tuning knobs
 * used while the resolution and LOD are being chosen. See docs/plan/japan-local-war-terrain.md.
 */
import { getEarthRegion } from "../data/earthRegions";
import { encodeEarthCellHeight, loadEarthRaster, loadEarthRasterBytes } from "../generators/earthRegionHeightmap";
import { decodeEarthRaster, type EarthRaster, sampleElevation, sampleLand } from "../generators/earthRegionRaster";
import type { EarthRegionGeoref } from "../types/WorldState";
import {
  type GeorefConsistency,
  georefConsistency,
  georefLonLatToMap,
  georefMapToLonLat
} from "../utils/localTerrainGeoref";
import { DEFAULT_VALLEY_TUNING, type ValleyTuning } from "./valleyProfile";

/** `dem` = baked Japan local levels (scripts/bakeJapanLocalDem.mjs), falling back to `japanBin`. */
export type LocalTerrainSource = "cells" | "japanBin" | "dem";

export interface LocalTerrainTuning {
  source: LocalTerrainSource;
  /** Foot days from the centre to the window edge. Undefined keeps CAMPAIGN_FOOT_DAYS. */
  footDays?: number;
  /**
   * Vertical exaggeration over true horizontal scale. Undefined follows the 3D Options
   * Height scale (`heightScaleExaggeration`); a number overrides it while tuning.
   */
  exaggeration?: number;
  /** Ground sample step in km. Undefined lets the source decide. */
  stepKm?: number;
  /** Finer squares around the centre (see `CampaignRing`). Empty = uniform `stepKm`. */
  rings: { halfKm: number; stepKm: number }[];
  /** Per-side vertex cap for a real-DEM ground. */
  maxSamplesPerSide: number;
  /** Bake a hillshade into the vertex colors (the campaign ground is unlit). */
  hillshade: boolean;
  /** Preferred baked source where both cover a point. */
  demSource: "terrarium" | "gsi";
  /**
   * Contact mode: once the camera is closer than `enterKm` to its target, the window is rebuilt
   * with these rings and exaggeration; it returns past `leaveKm`.
   */
  contact: { rings: { halfKm: number; stepKm: number }[]; enterKm: number; leaveKm: number };
  /**
   * `fmg` (default) draws the FMG rivers at their 2D width as water and carves them (the
   * simulation's rivers; always available). `real` draws and carves baked real rivers
   * (scripts/bakeJapanRivers.mjs, not distributed) and falls back to `fmg` without them.
   */
  riverSource: "real" | "fmg";
  /** Flat radius around a burg in km. It blends back to the DEM over the same distance again. */
  burgPadKm: number;
  /** Half-width of the carved river corridor in meters. 0 = no carving. */
  riverCorridorM: number;
  /**
   * Deepest carve in meters. FMG rivers come from 21 km cells and often cross real ridges;
   * past this depth the ridge is left standing instead of cutting a canyon.
   */
  riverMaxCarveM: number;
  /**
   * How far (km) an FMG river may move sideways to the lowest ground of its valley. FMG rivers
   * come from 21 km cells; this pulls their drawn course into the real valley. 0 = off.
   */
  riverSnapKm: number;
  /** Colour sea and land from the DEM coastline instead of the cell heights. */
  demCoast: boolean;
  /**
   * Valleys carved along the FMG rivers (docs/plan/fmg-cell-valleys.md). V1 applies them to
   * the cell-bilinear window only; `probeKm` is how far across the river the relief is read (0 = one grid cell).
   */
  valley: ValleyTuning & { probeKm: number };
  /**
   * Quadtree tiles (docs/plan/japan-terrain-tiles.md) replace the window ground while tuning.
   * Selection splits tiles above `maxScreenErrorPx` up to `maxTiles`; `maxZoom` caps the level.
   */
  tiles: {
    enabled: boolean;
    maxScreenErrorPx: number;
    maxTiles: number;
    maxZoom: number;
    /** Tiles farther than this from the war focus stop at `farZoom`. 0 = no limit. */
    farKm: number;
    farZoom: number;
    /** ISO 3166-2 codes to show (others dimmed). Empty = all of Japan. */
    prefectures: string[];
    /** `states` blends the state colours over the land. Off by default. */
    mapColors: "none" | "states";
    /**
     * Heights for river snapping, carving and the DEM coast: `prefectures` reads japan-local/,
     * `tiles` reads the terrain tiles (T7 comparison, docs/plan/japan-terrain-tiles.md).
     */
    fieldSource: "prefectures" | "tiles";
  };
}

/** Defaults for a georeferenced map. Procedural maps always draw `cells`. */
export const DEFAULT_LOCAL_TERRAIN_TUNING: LocalTerrainTuning = {
  source: "dem",
  footDays: 3,
  stepKm: 1,
  // R3: about 115k vertices and 0.16 s per redraw for a three-day window.
  rings: [
    { halfKm: 20, stepKm: 0.25 },
    { halfKm: 45, stepKm: 0.5 }
  ],
  maxSamplesPerSide: 1200,
  hillshade: true,
  demSource: "gsi",
  // R4: a 100 m ring is about 1.5× the vertices, so it is only built near the ground.
  contact: {
    rings: [
      { halfKm: 6, stepKm: 0.1 },
      { halfKm: 20, stepKm: 0.25 },
      { halfKm: 45, stepKm: 0.5 }
    ],
    enterKm: 25,
    leaveKm: 40
  },
  burgPadKm: 1.5,
  riverCorridorM: 300,
  riverMaxCarveM: 30,
  riverSnapKm: 6,
  riverSource: "fmg",
  demCoast: true,
  valley: { ...DEFAULT_VALLEY_TUNING, probeKm: 0 },
  tiles: {
    // Default since T5; `?ltTiles=0` draws the old window ground.
    enabled: true,
    maxScreenErrorPx: 2,
    maxTiles: 256,
    // Capped by the installed levels: z3 (500 m) distributed, z4–z5 only when baked locally.
    maxZoom: 5,
    // T4: 100 km (a bit past the 3-day window) halves the close-view tiles in Tokyo.
    farKm: 100,
    farZoom: 1,
    prefectures: [],
    mapColors: "none",
    fieldSource: "prefectures"
  }
};

/** Height scale 50 (the 3D Options default) is ×3, the value chosen in R1–R4. */
const HEIGHT_SCALE_PER_EXAGGERATION = 50 / 3;

/** Vertical exaggeration of the real-DEM window for a 3D Options Height scale. */
export function heightScaleExaggeration(heightScale: number): number {
  return Number.isFinite(heightScale) && heightScale > 0 ? heightScale / HEIGHT_SCALE_PER_EXAGGERATION : 3;
}

let tuning: LocalTerrainTuning = readUrlTuning(DEFAULT_LOCAL_TERRAIN_TUNING);

export function getLocalTerrainTuning(): LocalTerrainTuning {
  return tuning;
}

/** Dev hook (Playwright / console). The caller redraws the 3D view. */
export function setLocalTerrainTuning(patch: Partial<LocalTerrainTuning>): LocalTerrainTuning {
  tuning = { ...tuning, ...patch };
  return tuning;
}

// Dev builds expose the knobs so the Playwright harness reaches the renderer's module instance.
if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __fmgLocalTerrain?: unknown }).__fmgLocalTerrain = {
    get: getLocalTerrainTuning,
    set: setLocalTerrainTuning
  };
}

function readUrlTuning(base: LocalTerrainTuning): LocalTerrainTuning {
  if (typeof window === "undefined" || !window.location) return base;
  const params = new URL(window.location.href).searchParams;
  const num = (key: string) => {
    const raw = params.get(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const source = params.get("ltSource");
  const shade = params.get("ltShade");
  return {
    source: source === "cells" || source === "japanBin" || source === "dem" ? source : base.source,
    footDays: num("ltDays") ?? base.footDays,
    exaggeration: num("ltExag") ?? base.exaggeration,
    riverSource: params.get("ltRivers") === "real" ? "real" : base.riverSource,
    stepKm: num("ltStepKm") ?? base.stepKm,
    maxSamplesPerSide: num("ltMaxSide") ?? base.maxSamplesPerSide,
    rings: base.rings,
    hillshade: shade === null ? base.hillshade : shade !== "0",
    demSource: params.get("ltDemSource") === "terrarium" ? "terrarium" : base.demSource,
    contact: base.contact,
    burgPadKm: num("ltBurgPadKm") ?? base.burgPadKm,
    riverCorridorM: num("ltRiverM") ?? base.riverCorridorM,
    riverMaxCarveM: num("ltRiverMaxCarveM") ?? base.riverMaxCarveM,
    riverSnapKm: num("ltRiverSnapKm") ?? base.riverSnapKm,
    demCoast: params.get("ltDemCoast") === "0" ? false : base.demCoast,
    valley: {
      enabled: params.has("ltValley") ? params.get("ltValley") !== "0" : base.valley.enabled,
      reliefShare: num("ltValleyRelief") ?? base.valley.reliefShare,
      widthScale: num("ltValleyWidth") ?? base.valley.widthScale,
      gorge: params.has("ltValleyGorge") ? params.get("ltValleyGorge") !== "0" : base.valley.gorge,
      spurs: params.has("ltValleySpurs") ? params.get("ltValleySpurs") !== "0" : base.valley.spurs,
      maxDepthM: num("ltValleyMaxM") ?? base.valley.maxDepthM,
      probeKm: num("ltValleyProbeKm") ?? base.valley.probeKm
    },
    tiles: {
      enabled: params.has("ltTiles") ? params.get("ltTiles") !== "0" : base.tiles.enabled,
      maxScreenErrorPx: num("ltTileErr") ?? base.tiles.maxScreenErrorPx,
      maxTiles: num("ltTileMax") ?? base.tiles.maxTiles,
      maxZoom: num("ltTileZoom") ?? base.tiles.maxZoom,
      farKm: num("ltTileFarKm") ?? base.tiles.farKm,
      farZoom: num("ltTileFarZoom") ?? base.tiles.farZoom,
      prefectures: params.get("ltTilePrefs")?.split(",").filter(Boolean) ?? base.tiles.prefectures,
      mapColors: params.get("ltTileColors") === "states" ? "states" : base.tiles.mapColors,
      fieldSource: params.get("ltFieldSource") === "tiles" ? "tiles" : base.tiles.fieldSource
    }
  };
}

export interface LocalTerrainSampler {
  /**
   * Meters above sea level at a map pixel. Sea is 0. `stepMeters` picks the coarsest baked
   * level at least that fine; outside its prefectures the next level, then the region raster.
   * Without `stepMeters` only the region raster is read.
   */
  metersAt(x: number, y: number, stepMeters?: number): number;
  /** True above +0.5 m, false below -5 m (or off the region raster's land), undefined in between. */
  landAt(x: number, y: number): boolean | undefined;
  consistency: GeorefConsistency;
  /** Baked level steps in meters, finest first. Empty when none are installed. */
  levelSteps: number[];
  /** Baked real rivers in map pixels. Empty when none are installed. */
  realRivers: LocalTerrainPath[];
  /** Load measurement: wall time, decoded raster bytes, raster count (grows as windows load). */
  load: { ms: number; rasterBytes: number; rasters: number };
  /** Levels over this window (map pixels) that are listed but not loaded yet. */
  pendingLevels(bounds: { minX: number; minY: number; maxX: number; maxY: number }): number;
  /** Loads the levels over this window. Resolves true when it loaded anything. */
  ensureLevels(bounds: { minX: number; minY: number; maxX: number; maxY: number }): Promise<boolean>;
}

/** Baked rivers are optional dev assets; a missing file means none. */
async function loadRealRivers(regionId: string): Promise<{ points: [number, number][] }[]> {
  if (regionId !== "japan") return [];
  try {
    const json = JSON.parse(new TextDecoder().decode(await loadEarthRasterBytes(`${LOCAL_DEM_DIR}rivers.json`))) as {
      rivers?: { points: [number, number][] }[];
    };
    return json.rivers ?? [];
  } catch {
    return [];
  }
}

interface DemLevel {
  stepMeters: number;
  source: string;
  file: string;
  west: number;
  east: number;
  south: number;
  north: number;
  /** Null until a window over this level asks for it. */
  raster: EarthRaster | null;
  loading?: Promise<void>;
}

const LOCAL_DEM_DIR = "./heightmaps/earth/japan-local/";
/** Committed 1 km / 500 m levels, then the Git-ignored finer levels of a local bake. */
const DEM_MANIFESTS = ["manifest.json", "manifest.local.json"];

/** Level index only; rasters load per window (`ensureLevels`). Missing manifests mean no levels. */
async function loadDemManifests(regionId: string): Promise<DemLevel[]> {
  if (regionId !== "japan") return [];
  const levels: DemLevel[] = [];
  for (const file of DEM_MANIFESTS) {
    try {
      const manifest = JSON.parse(new TextDecoder().decode(await loadEarthRasterBytes(`${LOCAL_DEM_DIR}${file}`))) as {
        bundles?: {
          source?: string;
          levels?: { stepMeters: number; file: string; west: number; east: number; south: number; north: number }[];
        }[];
      };
      for (const bundle of manifest.bundles ?? [])
        for (const level of bundle.levels ?? [])
          levels.push({ ...level, source: bundle.source ?? "terrarium", raster: null });
    } catch {
      // Not installed.
    }
  }
  return levels.sort((a, b) => a.stepMeters - b.stepMeters);
}

/** Levels to try for a step: the coarsest at least as fine as asked, then finer, then coarser. */
export function demLevelOrder(steps: readonly number[], stepMeters: number): number[] {
  const order = steps.map((_, i) => i);
  const fine = order.filter(i => steps[i] <= stepMeters).sort((a, b) => steps[b] - steps[a]);
  const coarse = order.filter(i => steps[i] > stepMeters).sort((a, b) => steps[a] - steps[b]);
  return [...fine, ...coarse];
}

/**
 * Loads the region raster and checks it still matches the stored grid heights. Returns null
 * when the map has no georeference, the region is unknown, or the heights were edited.
 */
export async function createLocalTerrainSampler(
  geo: EarthRegionGeoref | undefined,
  grid: { points: ReadonlyArray<readonly number[]>; cells: { h: ArrayLike<number> } },
  graphWidth: number,
  graphHeight: number,
  heightExponent: number,
  /** `prefectureLevels: false` reads only the region raster (no japan-local/ manifests). */
  options: { prefectureLevels?: boolean } = {}
): Promise<LocalTerrainSampler | null> {
  if (!geo) return null;
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const region = getEarthRegion(geo.id);
  if (!region) return null;
  const raster = await loadEarthRaster(region);
  const lonLat = (x: number, y: number) => georefMapToLonLat(geo, x, y, graphWidth, graphHeight);
  const cells = grid.points.map((point, i) => ({ x: point[0], y: point[1], h: grid.cells.h[i] }));
  const consistency = georefConsistency(cells, (x, y) => {
    const { lon, lat } = lonLat(x, y);
    return encodeEarthCellHeight(sampleLand(raster, lon, lat), sampleElevation(raster, lon, lat), heightExponent);
  });
  if (!consistency.ok) return null;
  const [levels, riversLonLat] = await Promise.all([
    options.prefectureLevels === false ? Promise.resolve([]) : loadDemManifests(geo.id),
    loadRealRivers(geo.id)
  ]);
  const realRivers = riversLonLat.map(river => ({
    points: river.points.map(([lon, lat]) => {
      const point = georefLonLatToMap(geo, lon, lat, graphWidth, graphHeight);
      return [point.x, point.y] as [number, number];
    })
  }));
  const steps = levels.map(level => level.stepMeters);
  const orders = new Map<string, number[]>();
  const orderFor = (stepMeters: number) => {
    const preferred = getLocalTerrainTuning().demSource;
    const key = `${stepMeters}|${preferred}`;
    let order = orders.get(key);
    if (!order) {
      // Within one step, the preferred source first; steps keep demLevelOrder's order.
      const byStep = demLevelOrder(steps, stepMeters);
      order = [];
      for (const step of new Set(byStep.map(i => steps[i]))) {
        const same = byStep.filter(i => steps[i] === step);
        order.push(
          ...same.filter(i => levels[i].source === preferred),
          ...same.filter(i => levels[i].source !== preferred)
        );
      }
      orders.set(key, order);
    }
    return order;
  };
  const load = {
    ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - started,
    rasterBytes: 0,
    rasters: 0
  };
  const overlaps = (level: DemLevel, box: { west: number; east: number; south: number; north: number }) =>
    level.west < box.east && level.east > box.west && level.south < box.north && level.north > box.south;
  const lonLatBox = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const a = lonLat(bounds.minX, bounds.minY);
    const b = lonLat(bounds.maxX, bounds.maxY);
    return {
      west: Math.min(a.lon, b.lon),
      east: Math.max(a.lon, b.lon),
      south: Math.min(a.lat, b.lat),
      north: Math.max(a.lat, b.lat)
    };
  };
  return {
    consistency,
    levelSteps: steps,
    realRivers,
    load,
    pendingLevels: bounds => {
      const box = lonLatBox(bounds);
      return levels.filter(level => !level.raster && overlaps(level, box)).length;
    },
    ensureLevels: async bounds => {
      const box = lonLatBox(bounds);
      const wanted = levels.filter(level => !level.raster && overlaps(level, box));
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      await Promise.all(
        wanted.map(level => {
          level.loading ??= loadEarthRasterBytes(`${LOCAL_DEM_DIR}${level.file}`)
            .then(bytes => {
              level.raster = decodeEarthRaster(bytes);
              load.rasters++;
              load.rasterBytes += level.raster.elevation.byteLength + level.raster.land.byteLength;
            })
            .catch(() => {
              // Listed but not installed (a manifest from another bake): never retried.
              level.file = "";
            });
          return level.loading;
        })
      );
      load.ms += (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      return wanted.length > 0;
    },
    // The DEM itself is the coastline: Natural Earth admin-1 is a 1:10M outline and too coarse
    // for a 250 m window. Between -5 m and +0.5 m (reclaimed land, zero-metre zones down to about
    // -4 m in eastern Tokyo, DEM noise)
    // the answer is "unknown" and the caller decides from the FMG cell.
    landAt: (x, y) => {
      const point = lonLat(x, y);
      for (const index of orderFor(0)) {
        const levelRaster = levels[index].raster;
        if (!levelRaster) continue;
        const meters = sampleElevation(levelRaster, point.lon, point.lat);
        if (meters == null) continue;
        return meters > 0.5 ? true : meters < -5 ? false : undefined;
      }
      const meters = sampleElevation(raster, point.lon, point.lat);
      if (!sampleLand(raster, point.lon, point.lat)) return false;
      return meters != null && meters > 0.5 ? true : undefined;
    },
    metersAt: (x, y, stepMeters) => {
      const point = lonLat(x, y);
      const order = stepMeters === undefined ? [] : orderFor(stepMeters);
      for (const index of order) {
        const levelRaster = levels[index].raster;
        if (!levelRaster) continue;
        const meters = sampleElevation(levelRaster, point.lon, point.lat);
        if (meters != null) return Math.max(0, meters);
      }
      const meters = sampleElevation(raster, point.lon, point.lat);
      return meters != null && meters > 0 ? meters : 0;
    }
  };
}

/** World Y for true horizontal scale (map pixels) times `exaggeration`. */
export function localMetersToWorldY(meters: number, kmPerPx: number, exaggeration: number): number {
  if (!(kmPerPx > 0) || !Number.isFinite(meters)) return 0;
  return (meters / (kmPerPx * 1000)) * exaggeration;
}

export interface LocalTerrainPath {
  points: ReadonlyArray<readonly number[]>;
  /** Full width per point in map pixels. A river with widths is painted as water. */
  widths?: readonly number[];
}

export interface LocalTerrainFieldStats {
  burgPads: number;
  tokensMoved: number;
  riverSamples: number;
  /** River samples whose DEM rises above the running minimum from upstream. */
  riverCarved: number;
  /** River samples deeper than `riverMaxCarveM`: the FMG river crosses a real ridge there. */
  riverOverCap: number;
  riverMaxCarveM: number;
  riverMeanCarveM: number;
  /** Mean sideways move of snapped river points, km. */
  riverSnapMeanKm: number;
}

export interface LocalTerrainField {
  metersAt(x: number, y: number, stepMeters?: number): number;
  waterAt(x: number, y: number): boolean;
  displayPoint(x: number, y: number, naval: boolean): readonly [number, number];
  /** The rivers as drawn: snapped into their valleys when `riverSnapKm` > 0. */
  rivers: LocalTerrainPath[];
  stats: LocalTerrainFieldStats;
}

/**
 * Moves an FMG river sideways into the real valley along a path that keeps descending.
 *
 * Each point may move across the river's course by up to `radiusPx` (probed every `probePx`).
 * A dynamic programme picks one offset per point, minimising the sum of
 * - the ground height there,
 * - `RISE_PENALTY` × every metre the course climbs from the previous point (rivers run downhill;
 *   the points are ordered from source to mouth, but the higher end is taken as the source),
 * - `BEND_PENALTY` × the sideways change between neighbours, so the course stays smooth.
 * A move between neighbours is capped at `maxStepPx`, so the river cannot jump to another valley
 * in one step. Both ends stay put so tributaries and the mouth keep meeting.
 */
const RISE_PENALTY = 4;
const BEND_PENALTY_M_PER_PX_RATIO = 20;

export function snapRiverToValley(
  points: ReadonlyArray<readonly number[]>,
  metersAt: (x: number, y: number) => number,
  radiusPx: number,
  probePx: number,
  maxStepPx = radiusPx / 3
): { points: [number, number][]; meanShiftPx: number } {
  const n = points.length;
  const out = points.map(point => [point[0], point[1]] as [number, number]);
  if (n < 3 || !(radiusPx > 0) || !(probePx > 0)) return { points: out, meanShiftPx: 0 };

  const normals: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    normals.push([-dy / length, dx / length]);
  }
  const k = Math.max(1, Math.round(radiusPx / probePx));
  const offsets = Array.from({ length: 2 * k + 1 }, (_, j) => ((j - k) / k) * radiusPx);
  const centre = k;
  const heights = points.map((point, i) =>
    offsets.map(d => metersAt(point[0] + normals[i][0] * d, point[1] + normals[i][1] * d))
  );
  // Downstream = from the higher end to the lower end.
  const reversed = heights[0][centre] < heights[n - 1][centre];
  const order = reversed ? [...Array(n).keys()].reverse() : [...Array(n).keys()];
  const bend = BEND_PENALTY_M_PER_PX_RATIO / radiusPx;
  const maxStep = Math.max(1, Math.round((maxStepPx / radiusPx) * k));

  let cost = offsets.map((_, j) => (j === centre ? heights[order[0]][j] : Number.POSITIVE_INFINITY));
  const back: Int32Array[] = [];
  for (let step = 1; step < n; step++) {
    const i = order[step];
    const prev = order[step - 1];
    const last = step === n - 1;
    const next = new Array<number>(offsets.length).fill(Number.POSITIVE_INFINITY);
    const from = new Int32Array(offsets.length).fill(-1);
    for (let j = 0; j < offsets.length; j++) {
      if (last && j !== centre) continue;
      for (let q = Math.max(0, j - maxStep); q <= Math.min(offsets.length - 1, j + maxStep); q++) {
        if (!Number.isFinite(cost[q])) continue;
        const rise = Math.max(0, heights[i][j] - heights[prev][q]);
        const c = cost[q] + heights[i][j] + RISE_PENALTY * rise + bend * Math.abs(offsets[j] - offsets[q]);
        if (c < next[j]) {
          next[j] = c;
          from[j] = q;
        }
      }
    }
    back.push(from);
    cost = next;
  }
  // Walk back from the pinned last point.
  const chosen = new Array<number>(n).fill(centre);
  let j = centre;
  for (let step = n - 1; step >= 1; step--) {
    chosen[order[step]] = j;
    j = back[step - 1][j];
    if (j < 0) return { points: out, meanShiftPx: 0 };
  }
  chosen[order[0]] = j;

  let shift = 0;
  for (let i = 1; i < n - 1; i++) {
    const d = offsets[chosen[i]];
    out[i] = [points[i][0] + normals[i][0] * d, points[i][1] + normals[i][1] * d];
    shift += Math.abs(d);
  }
  return { points: out, meanShiftPx: shift / Math.max(1, n - 2) };
}

/** Bucketed points for "nearest within r" queries in map pixels. */
class PointIndex<T extends { x: number; y: number }> {
  private readonly buckets = new Map<string, T[]>();
  constructor(
    private readonly size: number,
    items: readonly T[]
  ) {
    for (const item of items) {
      const key = `${Math.floor(item.x / size)}:${Math.floor(item.y / size)}`;
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(item);
      else this.buckets.set(key, [item]);
    }
  }
  nearest(x: number, y: number): { item: T; distance: number } | undefined {
    const col = Math.floor(x / this.size);
    const row = Math.floor(y / this.size);
    let best: { item: T; distance: number } | undefined;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const item of this.buckets.get(`${col + dx}:${row + dy}`) ?? []) {
          const distance = Math.hypot(item.x - x, item.y - y);
          if (!best || distance < best.distance) best = { item, distance };
        }
      }
    }
    return best;
  }
}

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * The DEM as the campaign window draws it: flat pads under burgs, FMG rivers carved down to a
 * never-rising profile, the DEM coastline, and tokens moved off the wrong side of it.
 * `bounds` (map pixels) limits the work to the window. See docs/plan/japan-local-war-terrain.md §5.4.
 */
export function createLocalTerrainField(
  sampler: LocalTerrainSampler,
  input: {
    kmPerPx: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    burgs: readonly { x: number; y: number }[];
    rivers: readonly LocalTerrainPath[];
    /** FMG cell water, for DEM heights near 0 m where the coast is ambiguous. */
    cellWaterAt?: (x: number, y: number) => boolean;
    burgPadKm: number;
    riverCorridorM: number;
    riverMaxCarveM?: number;
    /** Snap rivers with widths (FMG rivers) into their valleys, km. 0 = off. */
    riverSnapKm?: number;
  }
): LocalTerrainField {
  const { kmPerPx, bounds } = input;
  const px = (km: number) => (kmPerPx > 0 ? km / kmPerPx : 0);
  const inside = (x: number, y: number, margin: number) =>
    x >= bounds.minX - margin && x <= bounds.maxX + margin && y >= bounds.minY - margin && y <= bounds.maxY + margin;
  const stats: LocalTerrainFieldStats = {
    burgPads: 0,
    tokensMoved: 0,
    riverSamples: 0,
    riverCarved: 0,
    riverOverCap: 0,
    riverMaxCarveM: 0,
    riverMeanCarveM: 0,
    riverSnapMeanKm: 0
  };
  const demWaterAt = (x: number, y: number) => {
    const land = sampler.landAt(x, y);
    return land === undefined ? (input.cellWaterAt?.(x, y) ?? false) : !land;
  };

  // Burg pads: the DEM height at the burg, held flat out to r0 and blended back by r1.
  const r0 = px(input.burgPadKm);
  const r1 = r0 * 2;
  const pads =
    r0 > 0
      ? input.burgs
          .filter(burg => inside(burg.x, burg.y, r1) && !demWaterAt(burg.x, burg.y))
          .map(burg => ({ x: burg.x, y: burg.y, meters: sampler.metersAt(burg.x, burg.y, 100) }))
      : [];
  stats.burgPads = pads.length;
  const padIndex = new PointIndex(Math.max(r1, 1e-6), pads);

  // FMG rivers (they carry widths) are snapped into their valleys first; real rivers already are.
  const snapPx = px(input.riverSnapKm ?? 0);
  let snapShift = 0;
  let snapCount = 0;
  const rivers: LocalTerrainPath[] = input.rivers.map(river => {
    if (!(snapPx > 0) || !river.widths || !river.points.some(point => inside(point[0], point[1], snapPx * 2)))
      return river;
    const snapped = snapRiverToValley(river.points, (x, y) => sampler.metersAt(x, y, 250), snapPx, px(0.25));
    snapShift += snapped.meanShiftPx;
    snapCount++;
    return { points: snapped.points, widths: river.widths };
  });
  stats.riverSnapMeanKm = snapCount ? (snapShift / snapCount) * kmPerPx : 0;

  // Rivers: samples every ~100 m with a running minimum from the higher end.
  const corridor = px(input.riverCorridorM / 1000);
  const maxCarve = input.riverMaxCarveM ?? Number.POSITIVE_INFINITY;
  const riverPoints: { x: number; y: number; meters: number; half: number }[] = [];
  let maxHalf = 0;
  let carveSum = 0;
  if (corridor > 0) {
    const stepPx = Math.max(px(0.1), 1e-6);
    for (const river of rivers) {
      const keep = river.points.map(point => inside(point[0], point[1], corridor * 2));
      const line = river.points.filter((_, i) => keep[i]);
      const widths = river.widths?.filter((_, i) => keep[i]);
      if (line.length < 2) continue;
      const samples: { x: number; y: number; raw: number; half: number }[] = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i];
        const [bx, by] = line[i + 1];
        const wa = (widths?.[i] ?? 0) / 2;
        const wb = (widths?.[i + 1] ?? 0) / 2;
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / stepPx));
        for (let k = 0; k < n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const y = ay + ((by - ay) * k) / n;
          samples.push({ x, y, raw: sampler.metersAt(x, y, 100), half: wa + ((wb - wa) * k) / n });
        }
      }
      const last = line[line.length - 1];
      samples.push({
        x: last[0],
        y: last[1],
        raw: sampler.metersAt(last[0], last[1], 100),
        half: (widths?.[line.length - 1] ?? 0) / 2
      });
      if (samples[0].raw < samples[samples.length - 1].raw) samples.reverse();
      let floor = Number.POSITIVE_INFINITY;
      for (const sample of samples) {
        floor = Math.min(floor, sample.raw);
        const carve = sample.raw - floor;
        stats.riverSamples++;
        if (carve > 1) stats.riverCarved++;
        if (carve > maxCarve) stats.riverOverCap++;
        stats.riverMaxCarveM = Math.max(stats.riverMaxCarveM, carve);
        carveSum += carve;
        riverPoints.push({
          x: sample.x,
          y: sample.y,
          meters: Math.max(floor, sample.raw - maxCarve),
          half: sample.half
        });
        maxHalf = Math.max(maxHalf, sample.half);
      }
    }
  }
  stats.riverMeanCarveM = stats.riverSamples > 0 ? carveSum / stats.riverSamples : 0;
  // A wide FMG river can be wider than the carve corridor; the index must reach its banks.
  const reach = Math.max(corridor * 2, maxHalf);
  const riverIndex = new PointIndex(Math.max(reach, 1e-6), riverPoints);
  const waterAt = (x: number, y: number) => {
    if (maxHalf > 0) {
      const river = riverIndex.nearest(x, y);
      if (river && river.distance <= river.item.half) return true;
    }
    return demWaterAt(x, y);
  };

  const metersAt = (x: number, y: number, stepMeters?: number) => {
    let meters = sampler.metersAt(x, y, stepMeters);
    if (pads.length) {
      const pad = padIndex.nearest(x, y);
      if (pad && pad.distance < r1) {
        const t = smoothstep((pad.distance - r0) / Math.max(r1 - r0, 1e-9));
        meters = pad.item.meters + (meters - pad.item.meters) * t;
      }
    }
    if (riverPoints.length) {
      const river = riverIndex.nearest(x, y);
      // The carved floor spans the river's own half-width, then the corridor blends back.
      const flat = Math.max(corridor, river?.item.half ?? 0);
      if (river && river.distance < flat + corridor && river.item.meters < meters) {
        const t = smoothstep((river.distance - flat) / corridor);
        meters = river.item.meters + (meters - river.item.meters) * t;
      }
    }
    return meters;
  };

  const displayPoint = (x: number, y: number, naval: boolean): readonly [number, number] => {
    if (waterAt(x, y) === naval) return [x, y];
    const step = px(0.25);
    for (let radius = step; radius <= px(10); radius += step) {
      for (let k = 0; k < 16; k++) {
        const angle = (k / 16) * Math.PI * 2;
        const cx = x + Math.cos(angle) * radius;
        const cy = y + Math.sin(angle) * radius;
        if (waterAt(cx, cy) === naval) {
          stats.tokensMoved++;
          return [cx, cy];
        }
      }
    }
    return [x, y];
  };

  return { metersAt, waterAt, displayPoint, rivers, stats };
}
