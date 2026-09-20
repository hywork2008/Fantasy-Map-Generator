// Composable standalone-mode site configuration. Replaces the exclusive
// archetype enum: coast ∈ {none, straight, bay, cape} × 0..2 rivers with shapes
// × hilltop relief. So "harbor + river", "two rivers straddling the town",
// "river reaching the coast", "town beside a river" are all reachable.
// Real FMG descriptors (M3) already carry this generality.

import type { Rng } from "../prng";
import type { CityProgram } from "../types";
import { presetPopulation } from "./presets";

export type CoastShape = "none" | "straight" | "bay" | "cape";
// Two axes rolled into one enum: town relationship (`through` crosses the site,
// `beside` runs past it, `toCoast` flows out to the sea) and, for the
// site-crossing kind, a channel-shape profile — `straight` (low sinuosity),
// `through` (a gentle meander), `meander` (pronounced), `greatBend` (one ~90°
// elbow at the town).
export type RiverShape = "through" | "beside" | "toCoast" | "straight" | "meander" | "greatBend";

/** The editable half of CityProgram — `capital` / `wallPlan` are never set by the
 * standalone Feature toggles. */
export type CityFeatureSet = Omit<CityProgram, "capital" | "wallPlan">;

/** Standalone wall-pattern overrides; "auto" defers to the wall-patterns.md §8
 * matrix (`siteInput.ts` `siteToWallPlan`). M4b exposes the implemented members. */
export type WallEnvelopeChoice = "auto" | "hull" | "notchFilled";
export type WallCoastChoice = "auto" | "open" | "seaWall";
export type WallLineChoice = "auto" | "polygonal" | "organic";

/** Urban morphological layout pattern:
 * - `auto`: resolved from size/seed (tiny maps roll Bram or Organic)
 * - `organic`: traditional irregular medieval cranked-block layout
 * - `bram`: Languedoc circulade concentric-ring village with core plaza, attached church, and concentric houses */
export type CityLayout = "auto" | "organic" | "bram";
export const CITY_LAYOUTS: CityLayout[] = ["auto", "organic", "bram"];

export interface WallChoice {
  envelope: WallEnvelopeChoice;
  coast: WallCoastChoice;
  line: WallLineChoice;
}

export const DEFAULT_WALL_CHOICE: WallChoice = { envelope: "auto", coast: "auto", line: "auto" };

export interface SiteConfig {
  coast: CoastShape;
  /** 0..2 rivers. */
  rivers: RiverShape[];
  /** Hilltop terrain — orthogonal to water; no classification effect. */
  relief: boolean;
  /** Built programme the standalone user toggles (Port / Walls / …). Written
   * straight onto the synthetic descriptor's `burg.*` flags (synthSite.ts). */
  features: CityFeatureSet;
  /** Wall-pattern overrides applied on top of the matrix plan (S4 only). */
  wall: WallChoice;
  /** Urban morphology layout (Bram circulade or Organic). Default is "auto". */
  layout?: CityLayout;
}

export const COAST_SHAPES: CoastShape[] = ["none", "straight", "bay", "cape"];
export const RIVER_SHAPES: RiverShape[] = ["through", "beside", "toCoast", "straight", "meander", "greatBend"];
export const FEATURE_KEYS: (keyof CityFeatureSet)[] = ["port", "walls", "citadel", "plaza", "temple", "shanty"];
export const WALL_ENVELOPE_CHOICES: WallEnvelopeChoice[] = ["auto", "hull", "notchFilled"];
export const WALL_COAST_CHOICES: WallCoastChoice[] = ["auto", "open", "seaWall"];
export const WALL_LINE_CHOICES: WallLineChoice[] = ["auto", "polygonal", "organic"];

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
  features: defaultFeatures(presetPopulation("smallCity")),
  wall: { ...DEFAULT_WALL_CHOICE },
  layout: "auto"
};

/** A stable string form for RNG seeding / display. Deliberately omits `features`
 * and `wall`: neither touches the S0–S3 synth geometry, so folding them in would
 * only churn the grid / coast / river RNG stream (and the S0–S3 regression net)
 * for no visible gain. */
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
  // Wall pattern stays on "auto" (the matrix): Randomize varies the SITE, not the
  // draw style — and `wall` is out of `siteConfigKey`, so rolling it here would
  // not even be reproducible.
  return { coast, rivers, relief: rng() < 0.3, features, wall: { ...DEFAULT_WALL_CHOICE }, layout: "auto" };
}
