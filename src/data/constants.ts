/**
 * @file constants.ts
 * @description Named constants to replace magic numbers scattered across modules and renderers.
 *
 * Organization:
 *   - HeightThreshold  : terrain height boundaries (water/land/highland/mountain)
 *   - TemperatureThreshold : climate temperature thresholds
 *   - RiverConstants   : river generation parameters
 *   - BiomeConstants   : biome classification thresholds
 *   - FeatureSizeRatio : ocean/sea/continent/island minimum size ratios
 *   - HeightmapConstants : heightmap algorithm parameters
 *   - TemperatureRenderer : draw-temperature renderer constants
 */

// ---------------------------------------------------------------------------
// Terrain height thresholds
// ---------------------------------------------------------------------------

/** Terrain height boundaries used throughout the generator and renderers. */
export const HeightThreshold = {
  /** Height value at and above which a cell is considered land (< 20 = water). */
  WATER_MAX_HEIGHT: 20,

  /** Minimum possible height value (inclusive). */
  HEIGHT_MIN: 0,

  /** Maximum possible height value (inclusive). */
  HEIGHT_MAX: 100,

  /** Upper bound for hill height before retry in addHill / addPit loops. */
  HILL_MAX_HEIGHT: 90,

  /** Minimum height for the river downcut (erosion) check; lowlands are skipped. */
  SHALLOW_WATER_MIN: 35,

  /** Minimum height for Highland culture bonus (no penalty). */
  HIGHLAND_MIN: 62,

  /** Minimum height for mountain crossing penalty. */
  MOUNTAIN_MIN: 67,

  /** Minimum height for hill crossing penalty. */
  HILL_MIN: 44,

  /** Minimum height for a lake to be considered "lava" type. */
  LAVA_LAKE_HEIGHT: 60
} as const;

// ---------------------------------------------------------------------------
// Temperature thresholds
// ---------------------------------------------------------------------------

/** Climate-related temperature cutoff values (°C). */
export const TemperatureThreshold = {
  /** Water temperature at or below which icebergs can form. */
  ICEBERG_MAX_TEMP: 0,

  /** Land temperature at or below which glaciers form. */
  GLACIER_MAX_TEMP: -8,

  /** Lake temperature below which the lake is classified as "frozen". */
  FROZEN_LAKE_TEMP: -3,

  /** Temperature below which cells are classified as permafrost (glacier biome). */
  PERMAFROST_TEMP: -5,

  /** Temperature at or above which hot desert biome is possible. */
  HOT_DESERT_TEMP: 25,

  /** Temperature at or below which wetland biome is impossible (too cold). */
  WETLAND_COLD_LIMIT: -2
} as const;

// ---------------------------------------------------------------------------
// River generation constants
// ---------------------------------------------------------------------------

/** Parameters governing river formation and geometry. */
export const RiverConstants = {
  /** Minimum accumulated flux required for a cell to become a river source. */
  MIN_FLUX_TO_FORM_RIVER: 30,

  /** Minimum number of cells a river must span to be retained in the dataset. */
  MIN_RIVER_CELLS: 3,

  /**
   * Threshold (as a fraction of all rivers sorted by length) below which a
   * river is considered "small" for type labelling purposes.
   */
  SMALL_RIVER_LENGTH_PERCENTILE: 0.15,

  /** Maximum height reduction per step during river downcutting (erosion). */
  MAX_DOWNCUT: 5
} as const;

// ---------------------------------------------------------------------------
// Biome constants
// ---------------------------------------------------------------------------

/** Biome classification thresholds for moisture, temperature, and height. */
export const BiomeConstants = {
  /** Minimum land height used in biome moisture calculation. Same as WATER_MAX_HEIGHT. */
  MIN_LAND_HEIGHT: 20,

  /** Maximum moisture level for hot desert biome (when no river is present). */
  HOT_DESERT_MOISTURE: 8,

  /** Moisture level above which a near-coast cell becomes wetland. */
  WETLAND_COAST_MOISTURE: 40,

  /** Maximum height for a near-coast wetland cell. */
  WETLAND_COAST_HEIGHT: 25,

  /** Moisture level above which an inland cell can become wetland. */
  WETLAND_INLAND_MOISTURE: 24,

  /** Minimum height for an inland wetland cell. */
  WETLAND_INLAND_HEIGHT_MIN: 24,

  /** Maximum height for an inland wetland cell. */
  WETLAND_INLAND_HEIGHT_MAX: 60,

  // ── Phase 3 assignment thresholds (playtest-tunable) ──────────────────────

  /** Absolute cold floor for perennial snow/ice regardless of elevation. */
  GLACIER_ABS_TEMP: -8,

  /** High peaks can hold perennial snow when summer-mean proxy is this cold. */
  GLACIER_HIGH_PEAK_TEMP: -1,

  /** Minimum height for high-peak perennial ice when temp is low. */
  GLACIER_HIGH_PEAK_HEIGHT: 78,

  /** Extreme height: perennial ice even with mildly cold summers. */
  GLACIER_EXTREME_HEIGHT: 88,

  /** Base height of the treeline at 0°C; rises with warmer temperatures. */
  TREELINE_BASE_HEIGHT: 52,

  /** Degrees °C → height units added to treeline. */
  TREELINE_TEMP_SCALE: 0.9,

  /** Minimum height for montane forest (below treeline). */
  MONTANE_MIN_HEIGHT: 48,

  /** Mangrove: minimum temperature (°C). */
  MANGROVE_MIN_TEMP: 20,

  /** Mangrove: minimum moisture. */
  MANGROVE_MIN_MOISTURE: 22,

  /** Mangrove: maximum land height. */
  MANGROVE_MAX_HEIGHT: 26,

  /** Flooded forest: minimum river flux. */
  FLOODED_FOREST_MIN_FLUX: 40,

  /** Flooded forest: minimum moisture. */
  FLOODED_FOREST_MIN_MOISTURE: 20,

  /** Flooded forest: minimum temperature. */
  FLOODED_FOREST_MIN_TEMP: 8,

  /** Cloud forest: minimum height, tropical moisture. */
  CLOUD_FOREST_MIN_HEIGHT: 50,

  /** Cloud forest: minimum temperature (still warm). */
  CLOUD_FOREST_MIN_TEMP: 14,

  /** Cloud forest: minimum moisture. */
  CLOUD_FOREST_MIN_MOISTURE: 28,

  /** Mediterranean: temperature band. */
  MED_MIN_TEMP: 12,
  MED_MAX_TEMP: 24,

  /** Mediterranean: moisture band (summer-dry proxy). */
  MED_MIN_MOISTURE: 8,
  MED_MAX_MOISTURE: 18,

  /** Temperate coniferous: temperature band. */
  TEMP_CONIFER_MIN_TEMP: 0,
  TEMP_CONIFER_MAX_TEMP: 12,

  /** Temperate coniferous: minimum moisture. */
  TEMP_CONIFER_MIN_MOISTURE: 14,

  /** Xeric shrubland: moisture / temp bands between desert and grassland. */
  XERIC_MAX_MOISTURE: 14,
  XERIC_MIN_MOISTURE: 7,
  XERIC_MIN_TEMP: 8,
  XERIC_MAX_TEMP: 30,

  /** Heath / moorland: cool open wetland-edge. */
  HEATH_MAX_TEMP: 12,
  HEATH_MIN_TEMP: 0,
  HEATH_MIN_MOISTURE: 16,
  HEATH_MAX_HEIGHT: 45,

  /** Great forest candidate: temperate moist lowland/hill band. */
  GREAT_FOREST_MIN_TEMP: 4,
  GREAT_FOREST_MAX_TEMP: 16,
  GREAT_FOREST_MIN_MOISTURE: 14,
  GREAT_FOREST_MAX_HEIGHT: 55,

  /** Target sandy beach share of coastline length for the global profile. */
  SANDY_BEACH_TARGET_MIN: 0.25,
  SANDY_BEACH_TARGET_MAX: 0.35,

  /** Nearshore: maximum water depth proxy (height below sea) for habitat. */
  NEARSHORE_MAX_DEPTH_PROXY: 8
} as const;

// ---------------------------------------------------------------------------
// Feature size ratios
// ---------------------------------------------------------------------------

/**
 * Size ratios (expressed as fractions of the total grid cell count) that
 * determine whether a water/land feature qualifies as ocean/sea/gulf or
 * continent/island/isle.
 */
export const FeatureSizeRatio = {
  /** Minimum cell fraction for a water body to be classified as "ocean". */
  OCEAN_MIN: 1 / 25,

  /** Minimum cell fraction for a water body to be classified as "sea" (vs. gulf). */
  SEA_MIN: 1 / 1000,

  /** Minimum cell fraction for a land mass to be classified as "continent". */
  CONTINENT_MIN: 1 / 10,

  /** Minimum cell fraction for a land mass to be classified as "island" (vs. isle). */
  ISLAND_MIN: 1 / 1000
} as const;

// ---------------------------------------------------------------------------
// Heightmap algorithm constants
// ---------------------------------------------------------------------------

/** Tuning values for the procedural heightmap generation algorithms. */
export const HeightmapConstants = {
  /** Maximum number of placement retries in addHill / addPit / addTrough loops. */
  PLACEMENT_ITER_LIMIT: 50,

  /** Minimum multiplier for per-cell random jitter in hill/blob spreading. */
  JITTER_MIN: 0.9,

  /** Range of per-cell random jitter (actual value = JITTER_MIN + rand * JITTER_RANGE). */
  JITTER_RANGE: 0.2,

  /**
   * Every Nth cell along a mountain ridge receives a "prominence" arm.
   * Lower values create more arms; higher values create sparser, cleaner ridges.
   */
  PROMINENCE_INTERVAL: 6,

  /**
   * Vertical offset applied when checking whether a lake shore has an outlet.
   * Keeps the stored lake height slightly below the lowest shoreline cell.
   */
  LAKE_ELEVATION_DELTA: 0.1,

  /**
   * Small height increment added to cells while resolving depressions.
   * Tiny values prevent abrupt step artefacts on the heightmap.
   */
  DEPRESSION_FILL_STEP: 0.1,

  /**
   * Height increment added to a lake's surface height when it is too low to
   * overflow its shoreline during depression resolution.
   */
  LAKE_HEIGHT_INCREMENT: 0.2,

  /**
   * Image pixel-brightness threshold used when loading a pre-created heightmap.
   * Pixels with brightness < this value are treated as shallow ocean (0–20 range);
   * pixels above it are remapped via a power curve to the land range (20–100).
   */
  IMAGE_WATER_THRESHOLD: 0.2,

  /**
   * Deepest ocean distance-field value written during grid markup.
   * Must be negative; cells further from land are assigned values down to this limit.
   */
  DEEP_WATER_LIMIT: -10
} as const;

// ---------------------------------------------------------------------------
// Temperature renderer constants
// ---------------------------------------------------------------------------

/** Constants used exclusively by the draw-temperature renderer. */
export const TemperatureRenderer = {
  /** Minimum squared distance between two isotherm labels to avoid overlap. */
  LABEL_MIN_DIST2: 100,

  /** Minimum pixel margin from SVG edges within which labels are not placed. */
  LABEL_MARGIN: 20,

  /** Minimum number of points in a chain before a bottom-center label is added. */
  LABEL_MIN_CHAIN_POINTS: 20,

  /** Chain relaxation interval: keep only every Nth vertex before rendering. */
  RELAX_INTERVAL: 4,

  /** Minimum relaxed chain length to render an isotherm path. */
  MIN_CHAIN_LENGTH: 6
} as const;
