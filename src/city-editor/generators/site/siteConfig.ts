import type {
  CityFeatureSet,
  CityLayout,
  CoastShape,
  RiverShape,
  SiteConfig,
  WallChoice,
  WallCoastChoice,
  WallEnvelopeChoice,
  WallLineChoice,
  WallMaterialChoice
} from "../../types/contracts/siteConfig";
// Composable standalone-mode site configuration. Replaces the exclusive
// archetype enum: coast ∈ {none, straight, bay, cape} × 0..2 rivers with shapes
// × hilltop relief. So "harbor + river", "two rivers straddling the town",
// "river reaching the coast", "town beside a river" are all reachable.
// Real FMG descriptors (M3) already carry this generality.

import type { Rng } from "../prng";
import { presetPopulation } from "./presets";

// Two axes rolled into one enum: town relationship (`through` crosses the site,
// `beside` runs past it, `toCoast` flows out to the sea) and, for the
// site-crossing kind, a channel-shape profile — `straight` (low sinuosity),
// `through` (a gentle meander), `meander` (pronounced), `greatBend` (one ~90°
// elbow at the town).

export const CITY_LAYOUTS: CityLayout[] = ["auto", "organic", "circulade", "bram", "classic"];

export const DEFAULT_WALL_CHOICE: WallChoice = { envelope: "auto", coast: "auto", line: "auto", material: "auto" };

export const COAST_SHAPES: CoastShape[] = ["none", "straight", "bay", "cape"];
export const RIVER_SHAPES: RiverShape[] = ["through", "beside", "toCoast", "straight", "meander", "greatBend"];
export const FEATURE_KEYS: (keyof CityFeatureSet)[] = ["port", "walls", "citadel", "plaza", "temple", "shanty"];
export const WALL_ENVELOPE_CHOICES: WallEnvelopeChoice[] = ["auto", "hull", "notchFilled"];
export const WALL_COAST_CHOICES: WallCoastChoice[] = ["auto", "open", "seaWall", "opening"];
export const WALL_LINE_CHOICES: WallLineChoice[] = ["auto", "polygonal", "organic"];
export const WALL_MATERIAL_CHOICES: WallMaterialChoice[] = ["auto", "stone", "wood"];

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
  layout: "organic"
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
