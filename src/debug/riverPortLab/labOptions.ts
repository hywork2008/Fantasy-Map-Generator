/**
 * River-Port Lab generation options (docs/plan/river-port-lab.md §4). Debug-only module state, not
 * part of OptionsState: it is never saved or exported, and with `enabled: false` (the default)
 * generation is untouched, so ordinary seeds stay reproducible.
 */
import Alea from "alea";
import { useOptionsState } from "../../store/optionsState";
import { LAB_SITE_KINDS } from "./classifyRiverSite";
import type { RiverPortLabOptions } from "./labOptions.types";
import { type LabTerrainGrid, type LabTerrainReport, shapeLabTerrain } from "./labTerrain";

export const DEFAULT_LAB_OPTIONS: RiverPortLabOptions = {
  enabled: false,
  riverDensity: 4,
  ignoreClimate: true,
  seaBorder: true,
  landShare: 0.8,
  lakes: 2,
  siteQuota: { estuary: 6, deltaBranch: 3, confluence: 6, confluenceBelow: 3, meander: 3, lakeOutlet: 2, riverBank: 2 },
  fillTowns: false
};

/** localStorage key; also how headless tools (fmg:small --lab) enable the lab before page-load generation. */
export const LAB_STORAGE_KEY = "riverPortLab";

let current: RiverPortLabOptions = structuredClone(DEFAULT_LAB_OPTIONS);
try {
  const stored = globalThis.localStorage?.getItem(LAB_STORAGE_KEY);
  if (stored) current = normalize({ ...current, ...JSON.parse(stored) });
} catch {
  /* no storage or bad JSON: defaults */
}

export function getLabOptions(): RiverPortLabOptions {
  return current;
}

export function setLabOptions(update: Partial<RiverPortLabOptions>): RiverPortLabOptions {
  current = normalize({ ...current, ...update });
  try {
    globalThis.localStorage?.setItem(LAB_STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: the in-memory options still apply */
  }
  return current;
}

function normalize(next: RiverPortLabOptions): RiverPortLabOptions {
  next.enabled = Boolean(next.enabled);
  next.riverDensity = Math.min(10, Math.max(1, Number(next.riverDensity) || 1));
  next.seaBorder = next.seaBorder !== false;
  next.landShare = Math.min(0.9, Math.max(0, Number(next.landShare) || 0));
  next.lakes = Math.min(10, Math.max(0, Math.round(Number(next.lakes) || 0)));
  next.siteQuota = Object.fromEntries(
    LAB_SITE_KINDS.map(kind => [kind, Math.max(0, Math.round(Number(next.siteQuota?.[kind]) || 0))])
  ) as RiverPortLabOptions["siteQuota"];
  return next;
}

/** Lab options in force for the generation now running: Province scope only. */
export function activeLabOptions(): RiverPortLabOptions | null {
  return current.enabled && useOptionsState.getState().mapScope === "province" ? current : null;
}

/** Uniform precipitation per riverDensity step (grid prec units) used when the climate is ignored. */
export const LAB_UNIFORM_PRECIPITATION = 20;

/**
 * Rain that feeds river flux under the lab. Only the rivers see it: grid.cells.prec (biomes,
 * habitability, cultures) keeps the real climate, so a wet lab map is not turned into wetland.
 * Uses its own random stream, leaving the generation stream untouched.
 */
export function labRiverPrecipitation(climate: ArrayLike<number>, seed: string): ArrayLike<number> {
  const lab = activeLabOptions();
  if (!lab?.ignoreClimate) return climate;
  const random = Alea(`${seed}:river-port-lab`);
  return Array.from(climate, () => Math.round(LAB_UNIFORM_PRECIPITATION * lab.riverDensity * (0.8 + 0.4 * random())));
}

/** Shapes the fresh heightmap for the lab (labTerrain.ts); a no-op when the lab is off. */
export function applyLabTerrain(grid: LabTerrainGrid, heights: Uint8Array): LabTerrainReport | null {
  const lab = activeLabOptions();
  if (!lab) return null;
  return shapeLabTerrain(grid, heights, lab);
}

export type { RiverPortLabOptions } from "./labOptions.types";
