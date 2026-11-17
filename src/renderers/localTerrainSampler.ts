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
  hillshade: true
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
    hillshade: shade === null ? base.hillshade : shade !== "0"
  };
}

export interface LocalTerrainSampler {
  /**
   * Meters above sea level at a map pixel. Sea is 0. `stepMeters` picks the coarsest baked
   * level at least that fine; outside its prefectures the next level, then the region raster.
   * Without `stepMeters` only the region raster is read.
   */
  metersAt(x: number, y: number, stepMeters?: number): number;
  consistency: GeorefConsistency;
  /** Baked level steps in meters, finest first. Empty when none are installed. */
  levelSteps: number[];
}

interface DemLevel {
  stepMeters: number;
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
      bundles?: { levels?: { stepMeters: number; file: string }[] }[];
    };
    const entries = (manifest.bundles ?? []).flatMap(bundle => bundle.levels ?? []);
    const levels = await Promise.all(
      entries.map(async entry => ({
        stepMeters: entry.stepMeters,
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
  const orders = new Map<number, number[]>();
  return {
    consistency,
    levelSteps: steps,
    metersAt: (x, y, stepMeters) => {
      const point = lonLat(x, y);
      let order: number[] = [];
      if (stepMeters !== undefined) {
        order = orders.get(stepMeters) ?? demLevelOrder(steps, stepMeters);
        orders.set(stepMeters, order);
      }
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
