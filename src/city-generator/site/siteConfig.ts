// Composable standalone-mode site configuration. Replaces the exclusive
// archetype enum: coast ∈ {none, straight, bay, cape} × 0..2 rivers with shapes
// × hilltop relief. So "harbor + river", "two rivers straddling the town",
// "river reaching the coast", "town beside a river" are all reachable.
// Real FMG descriptors (M3) already carry this generality.

import type { Rng } from "../core/prng";

export type CoastShape = "none" | "straight" | "bay" | "cape";
// Two axes rolled into one enum: town relationship (`through` crosses the site,
// `beside` runs past it, `toCoast` flows out to the sea) and, for the
// site-crossing kind, a channel-shape profile — `straight` (low sinuosity),
// `through` (a gentle meander), `meander` (pronounced), `greatBend` (one ~90°
// elbow at the town).
export type RiverShape = "through" | "beside" | "toCoast" | "straight" | "meander" | "greatBend";

export interface SiteConfig {
  coast: CoastShape;
  /** 0..2 rivers. */
  rivers: RiverShape[];
  /** Hilltop terrain — orthogonal to water; no classification effect. */
  relief: boolean;
}

export const COAST_SHAPES: CoastShape[] = ["none", "straight", "bay", "cape"];
export const RIVER_SHAPES: RiverShape[] = ["through", "beside", "toCoast", "straight", "meander", "greatBend"];

export const DEFAULT_SITE_CONFIG: SiteConfig = { coast: "none", rivers: ["through"], relief: false };

/** A stable string form for RNG seeding / display. */
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
  return { coast, rivers, relief: rng() < 0.3 };
}
