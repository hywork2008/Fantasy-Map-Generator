/**
 * Real-DEM heights for the campaign window of an Earth-region map, plus the dev tuning knobs
 * used while the resolution and LOD are being chosen. See docs/plan/japan-local-war-terrain.md.
 */
import { getEarthRegion } from "../data/earthRegions";
import { encodeEarthCellHeight, loadEarthRaster, loadEarthRasterBytes } from "../generators/earthRegionHeightmap";
import { decodeEarthRaster, type EarthRaster, sampleElevation, sampleLand } from "../generators/earthRegionRaster";
import type { EarthRegionGeoref } from "../types/WorldState";
import { type GeorefConsistency, georefConsistency, georefMapToLonLat } from "../utils/localTerrainGeoref";

/** `dem` = baked Japan local levels (scripts/bakeJapanLocalDem.mjs), falling back to `japanBin`. */
export type LocalTerrainSource = "cells" | "japanBin" | "dem";

export interface LocalTerrainTuning {
  source: LocalTerrainSource;
  /** Foot days from the centre to the window edge. Undefined keeps CAMPAIGN_FOOT_DAYS. */
  footDays?: number;
  /** Vertical exaggeration over true horizontal scale. */
  exaggeration: number;
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
  contact: { rings: { halfKm: number; stepKm: number }[]; exaggeration: number; enterKm: number; leaveKm: number };
  /** Flat radius around a burg in km. It blends back to the DEM over the same distance again. */
  burgPadKm: number;
  /** Half-width of the carved river corridor in meters. 0 = no carving. */
  riverCorridorM: number;
  /**
   * Deepest carve in meters. FMG rivers come from 21 km cells and often cross real ridges;
   * past this depth the ridge is left standing instead of cutting a canyon.
   */
  riverMaxCarveM: number;
  /** Colour sea and land from the DEM coastline instead of the cell heights. */
  demCoast: boolean;
}

/** Defaults for a georeferenced map. Procedural maps always draw `cells`. */
export const DEFAULT_LOCAL_TERRAIN_TUNING: LocalTerrainTuning = {
  source: "dem",
  footDays: 3,
  exaggeration: 3,
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
    exaggeration: 4,
    enterKm: 25,
    leaveKm: 40
  },
  burgPadKm: 1.5,
  riverCorridorM: 300,
  riverMaxCarveM: 30,
  demCoast: true
};

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
    stepKm: num("ltStepKm") ?? base.stepKm,
    maxSamplesPerSide: num("ltMaxSide") ?? base.maxSamplesPerSide,
    rings: base.rings,
    hillshade: shade === null ? base.hillshade : shade !== "0",
    demSource: params.get("ltDemSource") === "terrarium" ? "terrarium" : base.demSource,
    contact: base.contact,
    burgPadKm: num("ltBurgPadKm") ?? base.burgPadKm,
    riverCorridorM: num("ltRiverM") ?? base.riverCorridorM,
    riverMaxCarveM: num("ltRiverMaxCarveM") ?? base.riverMaxCarveM,
    demCoast: params.get("ltDemCoast") === "0" ? false : base.demCoast
  };
}

export interface LocalTerrainSampler {
  /**
   * Meters above sea level at a map pixel. Sea is 0. `stepMeters` picks the coarsest baked
   * level at least that fine; outside its prefectures the next level, then the region raster.
   * Without `stepMeters` only the region raster is read.
   */
  metersAt(x: number, y: number, stepMeters?: number): number;
  /** Land by the finest covering level's coastline, else the region raster's. */
  landAt(x: number, y: number): boolean;
  consistency: GeorefConsistency;
  /** Baked level steps in meters, finest first. Empty when none are installed. */
  levelSteps: number[];
}

interface DemLevel {
  stepMeters: number;
  source: string;
  raster: EarthRaster;
}

const LOCAL_DEM_DIR = "./heightmaps/earth/japan-local/";

/** Baked levels are optional dev assets while tuning; a missing manifest means none. */
async function loadDemLevels(regionId: string): Promise<DemLevel[]> {
  if (regionId !== "japan") return [];
  try {
    const manifest = JSON.parse(
      new TextDecoder().decode(await loadEarthRasterBytes(`${LOCAL_DEM_DIR}manifest.json`))
    ) as {
      bundles?: { source?: string; levels?: { stepMeters: number; file: string }[] }[];
    };
    const entries = (manifest.bundles ?? []).flatMap(bundle =>
      (bundle.levels ?? []).map(level => ({ ...level, source: bundle.source ?? "terrarium" }))
    );
    const levels = await Promise.all(
      entries.map(async entry => ({
        stepMeters: entry.stepMeters,
        source: entry.source,
        raster: decodeEarthRaster(await loadEarthRasterBytes(`${LOCAL_DEM_DIR}${entry.file}`))
      }))
    );
    return levels.sort((a, b) => a.stepMeters - b.stepMeters);
  } catch {
    return [];
  }
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
  heightExponent: number
): Promise<LocalTerrainSampler | null> {
  if (!geo) return null;
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
  const levels = await loadDemLevels(geo.id);
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
  return {
    consistency,
    levelSteps: steps,
    landAt: (x, y) => {
      const point = lonLat(x, y);
      for (const index of orderFor(0)) {
        if (sampleElevation(levels[index].raster, point.lon, point.lat) == null) continue;
        return sampleLand(levels[index].raster, point.lon, point.lat);
      }
      return sampleLand(raster, point.lon, point.lat);
    },
    metersAt: (x, y, stepMeters) => {
      const point = lonLat(x, y);
      const order = stepMeters === undefined ? [] : orderFor(stepMeters);
      for (const index of order) {
        const meters = sampleElevation(levels[index].raster, point.lon, point.lat);
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
}

export interface LocalTerrainField {
  metersAt(x: number, y: number, stepMeters?: number): number;
  waterAt(x: number, y: number): boolean;
  displayPoint(x: number, y: number, naval: boolean): readonly [number, number];
  stats: LocalTerrainFieldStats;
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
    burgPadKm: number;
    riverCorridorM: number;
    riverMaxCarveM?: number;
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
    riverMeanCarveM: 0
  };
  const waterAt = (x: number, y: number) => !sampler.landAt(x, y);

  // Burg pads: the DEM height at the burg, held flat out to r0 and blended back by r1.
  const r0 = px(input.burgPadKm);
  const r1 = r0 * 2;
  const pads =
    r0 > 0
      ? input.burgs
          .filter(burg => inside(burg.x, burg.y, r1) && !waterAt(burg.x, burg.y))
          .map(burg => ({ x: burg.x, y: burg.y, meters: sampler.metersAt(burg.x, burg.y, 100) }))
      : [];
  stats.burgPads = pads.length;
  const padIndex = new PointIndex(Math.max(r1, 1e-6), pads);

  // Rivers: samples every ~100 m with a running minimum from the higher end.
  const corridor = px(input.riverCorridorM / 1000);
  const maxCarve = input.riverMaxCarveM ?? Number.POSITIVE_INFINITY;
  const riverPoints: { x: number; y: number; meters: number }[] = [];
  let carveSum = 0;
  if (corridor > 0) {
    const stepPx = Math.max(px(0.1), 1e-6);
    for (const river of input.rivers) {
      const line = river.points.filter(point => inside(point[0], point[1], corridor * 2));
      if (line.length < 2) continue;
      const samples: { x: number; y: number; raw: number }[] = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i];
        const [bx, by] = line[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / stepPx));
        for (let k = 0; k < n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const y = ay + ((by - ay) * k) / n;
          samples.push({ x, y, raw: sampler.metersAt(x, y, 100) });
        }
      }
      const last = line[line.length - 1];
      samples.push({ x: last[0], y: last[1], raw: sampler.metersAt(last[0], last[1], 100) });
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
        riverPoints.push({ x: sample.x, y: sample.y, meters: Math.max(floor, sample.raw - maxCarve) });
      }
    }
  }
  stats.riverMeanCarveM = stats.riverSamples > 0 ? carveSum / stats.riverSamples : 0;
  const riverIndex = new PointIndex(Math.max(corridor * 2, 1e-6), riverPoints);

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
      if (river && river.distance < corridor * 2 && river.item.meters < meters) {
        const t = smoothstep((river.distance - corridor) / corridor);
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

  return { metersAt, waterAt, displayPoint, stats };
}
