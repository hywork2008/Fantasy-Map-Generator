// Composable standalone-mode site configuration. Replaces the exclusive
// archetype enum: coast ∈ {none, straight, bay, cape} × 0..2 rivers with shapes
// × hilltop relief. So "harbor + river", "two rivers straddling the town",
// "river reaching the coast", "town beside a river" are all reachable.
// Real FMG descriptors (M3) already carry this generality.

import type { Rng } from "../core/prng";
import type { CityProgram } from "../core/types";
import { presetPopulation } from "./presets";

export type CoastShape = "none" | "straight" | "bay" | "cape";
// Two axes rolled into one enum: town relationship (`through` crosses the site,
// `beside` runs past it, `toCoast` flows out to the sea) and, for the
// site-crossing kind, a channel-shape profile — `straight` (low sinuosity),
// `through` (a gentle meander), `meander` (pronounced), `greatBend` (one ~90°
// elbow at the town).
export type RiverShape = "through" | "beside" | "toCoast" | "straight" | "meander" | "greatBend";

/** The editable half of CityProgram — `capital` is never synthesised standalone. */
export type CityFeatureSet = Omit<CityProgram, "capital">;

export interface SiteConfig {
  coast: CoastShape;
  /** 0..2 rivers. */
  rivers: RiverShape[];
  /** Hilltop terrain — orthogonal to water; no classification effect. */
  relief: boolean;
  /** Built programme the standalone user toggles (Port / Walls / …). Written
   * straight onto the synthetic descriptor's `burg.*` flags (synthSite.ts). */
  features: CityFeatureSet;
}

export const COAST_SHAPES: CoastShape[] = ["none", "straight", "bay", "cape"];
export const RIVER_SHAPES: RiverShape[] = ["through", "beside", "toCoast", "straight", "meander", "greatBend"];
export const FEATURE_KEYS: (keyof CityFeatureSet)[] = ["port", "walls", "citadel", "plaza", "temple", "shanty"];

/** Plausible initial check state from population — the user is free to change
 * every box once the panel is shown. `port` starts off; the UI raises it when a
 * coast is picked. */
export function defaultFeatures(population: number): CityFeatureSet {
  return {
    walls: population >= 3_000,
    plaza: population >= 1_500,
    temple: true,
    citadel: false,
    port: false,
    shanty: population >= 8_000
  };
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  coast: "none",
  rivers: ["through"],
  relief: false,
  features: defaultFeatures(presetPopulation("smallCity"))
};

/** A stable string form for RNG seeding / display. Deliberately omits `features`:
 * in M4a they only set descriptor `burg.*` booleans and have no effect on the
 * S0–S3 synth geometry, so folding them in here would only churn the grid /
 * coast / river RNG stream (and the S0–S3 regression net) for no visible gain.
 * A feature that gains a synth-geometry effect later should join this key then. */
export function siteConfigKey(config: SiteConfig): string {
  return `${config.coast}|${config.rivers.join(",") || "-"}|${config.relief ? "relief" : "flat"}`;
}

/** A coherent random combination for the "Randomize site" button. */
export function randomSiteConfig(rng: Rng): SiteConfig {
  const coast = COAST_SHAPES[rng.int(0, COAST_SHAPES.length)];
  const count = rng.int(0, 3);
  // `toCoast` needs a shoreline to reach; the rest work landlocked too.
  const pool: RiverShape[] = coast === "none" ? RIVER_SHAPES.filter(s => s !== "toCoast") : RIVER_SHAPES;
  const rivers = Array.from({ length: count }, () => pool[rng.int(0, pool.length)]);
  const features: CityFeatureSet = {
    walls: rng() < 0.6,
    citadel: rng() < 0.3,
    plaza: rng() < 0.7,
    temple: rng() < 0.85,
    // A harbour needs water; landlocked sites never roll one.
    port: coast !== "none" && rng() < 0.7,
    shanty: rng() < 0.35
  };
  return { coast, rivers, relief: rng() < 0.3, features };
}
