/**
 * Semantic biome identity and catalog types.
 *
 * `BiomeKey` is the sole source of meaning. Numeric `BiomeCode` values are an
 * internal, catalog-local index for dense cell columns and climate matrices —
 * never compare codes by range, and never treat a bare number as a stable id
 * outside a paired `BiomeCatalogSnapshot`.
 */

export const BIOME_TAGS = [
  "marine",
  "forest",
  "wetland",
  "mountain",
  "coastal",
  "dry",
  "cold",
  "desert",
  "grassland",
  "scrub",
  "snow",
  "arable",
  "nomadic"
] as const;

export type BiomeTag = (typeof BIOME_TAGS)[number];

/** Standard catalog keys. Order is default code assignment only, not semantics. */
export const STANDARD_BIOME_KEYS = [
  "marine",
  "hotDesert",
  "coldDesert",
  "savanna",
  "grassland",
  "tropicalSeasonalForest",
  "temperateDeciduousForest",
  "tropicalRainforest",
  "temperateRainforest",
  "taiga",
  "tundra",
  "glacier",
  "wetland",
  "centralEuropeanGreatForest",
  "mediterraneanWoodlandScrub",
  "temperateConiferousForest",
  "montaneForest",
  "alpineTundra",
  "mangrove",
  "xericShrubland",
  "cloudForest",
  "heathMoorland",
  "floodedForest",
  // Phase 5
  "coldSteppe",
  "tropicalDryForest",
  "borealPeatland"
] as const;

export type StandardBiomeKey = (typeof STANDARD_BIOME_KEYS)[number];

/** Custom / migrated biomes use opaque string keys outside the standard union. */
export type CustomBiomeKey = `custom:${string}` | `legacyCustom:${number}`;

export type BiomeKey = StandardBiomeKey | CustomBiomeKey | string;

/** Dense cell-column code. Meaningful only with a catalog snapshot. */
export type BiomeCode = number;

export interface BiomeRelief {
  readonly density: number;
  /** Weighted icon multiset: icon name → weight. Expanded at catalog build. */
  readonly icons: Readonly<Record<string, number>>;
}

export interface BiomeDefinition {
  readonly key: BiomeKey;
  readonly label: string;
  readonly color: string;
  readonly habitability: number;
  readonly movementCost: number;
  readonly relief: BiomeRelief;
  readonly tags: readonly BiomeTag[];
}

/**
 * Runtime catalog. Parallel arrays (`name`, `color`, …) are derived views for
 * hot paths and legacy call sites — definitions/keys are the source of truth.
 */
export interface BiomeCatalog {
  readonly version: number;
  readonly definitionsByKey: Readonly<Record<string, BiomeDefinition>>;
  /** Internal lookup only. Order has no semantic meaning beyond this instance. */
  readonly keysByCode: readonly BiomeKey[];
  readonly codesByKey: Readonly<Record<string, BiomeCode>>;
}

/** Persisted with cell biomeCode columns so codes stay meaningful across loads. */
export interface BiomeCatalogSnapshot {
  readonly version: number;
  readonly keys: readonly BiomeKey[];
  readonly definitions: readonly BiomeDefinition[];
}

export const BIOME_CATALOG_VERSION = 1;
