// Standalone size presets — the four buttons from the reference UI. Population →
// CityParams uses the same walled-density model as FMG's burgSiteDescriptor.ts,
// so preset grids line up with real-burg grids once M3 wires the descriptor in.
//
// M2 replaces / wraps this with site/synthSite.ts (preset → full BurgSiteDescriptor).

import type { CityParams } from "../core/types";

export type PresetId = "smallTown" | "largeTown" | "smallCity" | "largeCity";

export interface Preset {
  id: PresetId;
  label: string;
  /** Inhabitants — midpoint of the reference generator's band for this size. */
  population: number;
}

export const PRESETS: Preset[] = [
  { id: "smallTown", label: "Small Town", population: 1_200 },
  { id: "largeTown", label: "Large Town", population: 4_000 },
  { id: "smallCity", label: "Small City", population: 12_000 },
  { id: "largeCity", label: "Large City", population: 30_000 }
];

/** People per hectare inside medieval town walls (burgSiteDescriptor.ts). */
const WALLED_DENSITY_PER_HA = 150;

export function presetParams(preset: PresetId, seed: string): CityParams {
  const population = PRESETS.find(p => p.id === preset)?.population ?? 4_000;
  const areaHa = Math.max(population, 50) / WALLED_DENSITY_PER_HA;
  const cityRadiusMeters = clamp(Math.sqrt((areaHa * 1e4) / Math.PI), 80, 1500);
  const extentMeters = clamp(Math.round(cityRadiusMeters * 6), 1500, 4500);
  return {
    seed,
    extentMeters,
    cityRadiusMeters,
    cellSizeMeters: cityRadiusMeters / 10,
    lloydPasses: 3
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
