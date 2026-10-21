/** Shared meter dimensions and metadata; safe for generation without loading Three.js. */
export const WATER_BASIN_KINDS = ["publicBasin", "spring", "washhouse"] as const;
export type WaterBasinKind = (typeof WATER_BASIN_KINDS)[number];
export const PUBLIC_WATER_BASINS = {
  publicBasin: { name: "Public stone water basin", width: 3.4, depth: 3.4, height: 2.5, radius: 1.7 },
  spring: { name: "Spring collection basin", width: 3.4, depth: 2.4, height: 2.6 },
  washhouse: { name: "Communal washing place", width: 4, depth: 2.8, height: 1.25 }
} as const;
export const PUBLIC_WATER_BASIN_NOTE =
  "Imagined medieval European stone waterworks, in meters; illustrative proportions, not surveyed reconstructions. The public basin has a gravity-fed spout and collection pool; the spring basin has a rear source wall; the washing place has sloping stone scrubbing slabs. Supply conduits and drainage continue underground and are omitted. Water represents a supplied basin, not a simulation or a drinking-water quality claim.";
