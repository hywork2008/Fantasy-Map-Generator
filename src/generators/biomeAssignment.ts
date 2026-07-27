/**
 * Pure climate/terrain biome assignment (Phase 3).
 * Returns BiomeKey only — never hard-coded numeric codes.
 */

import { BiomeConstants, HeightThreshold } from "../data/constants";
import type { StandardBiomeKey } from "../types/biome";
import type { BiomeRegionProfile } from "../types/biomeRegion";

export interface CellBiomeClimate {
  readonly moisture: number;
  readonly temperature: number;
  readonly height: number;
  readonly hasRiver: boolean;
  readonly flux: number;
  /** pack.cells.t distance field: 1 = land coast, -1 = water coast, … */
  readonly coastDistance: number;
  readonly neighborOcean: boolean;
  readonly x: number;
  readonly y: number;
}

export interface AssignmentOptions {
  readonly profile: BiomeRegionProfile;
  readonly seed: number;
}

/** Low-frequency spatial noise in [0, 1) for regional masks. */
export function spatialNoise(x: number, y: number, seed: number, scale = 0.008): number {
  const sx = Math.floor(x * scale);
  const sy = Math.floor(y * scale);
  const n = Math.imul(sx + seed * 374761393, 668265263) ^ Math.imul(sy + seed * 668265263, 374761393);
  const h = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((h >>> 0) % 10000) / 10000;
}

/** Smoothed noise for continuous forest belts (not speckles). */
export function smoothRegionMask(x: number, y: number, seed: number): number {
  const a = spatialNoise(x, y, seed, 0.004);
  const b = spatialNoise(x + 17, y + 31, seed + 1, 0.009);
  const c = spatialNoise(x - 9, y + 5, seed + 2, 0.015);
  return a * 0.5 + b * 0.3 + c * 0.2;
}

/**
 * Forest limit height: warmer → higher treeline. Below this (and above montane min)
 * is montane forest; above is alpine tundra if not permanent ice.
 */
export function treelineHeight(temperature: number): number {
  const raw = BiomeConstants.TREELINE_BASE_HEIGHT + temperature * BiomeConstants.TREELINE_TEMP_SCALE;
  return Math.max(42, Math.min(86, raw));
}

/**
 * Perennial snow/ice: not merely "cold", but conditions where summer melt is insufficient.
 * High peaks can hold ice even at milder lowland temperatures.
 */
export function isPerennialSnowIce(temperature: number, height: number): boolean {
  if (temperature < BiomeConstants.GLACIER_ABS_TEMP) return true;
  if (height >= BiomeConstants.GLACIER_EXTREME_HEIGHT && temperature < 2) return true;
  if (height >= BiomeConstants.GLACIER_HIGH_PEAK_HEIGHT && temperature < BiomeConstants.GLACIER_HIGH_PEAK_TEMP)
    return true;
  return false;
}

export function isAboveTreeline(temperature: number, height: number): boolean {
  return height >= treelineHeight(temperature);
}

function isWetlandCell(moisture: number, temperature: number, height: number): boolean {
  if (temperature <= -2) return false;
  if (moisture > BiomeConstants.WETLAND_COAST_MOISTURE && height < BiomeConstants.WETLAND_COAST_HEIGHT) return true;
  if (
    moisture > BiomeConstants.WETLAND_INLAND_MOISTURE &&
    height > BiomeConstants.WETLAND_INLAND_HEIGHT_MIN &&
    height < BiomeConstants.WETLAND_INLAND_HEIGHT_MAX
  )
    return true;
  return false;
}

function isMangroveCandidate(c: CellBiomeClimate): boolean {
  return (
    c.height >= HeightThreshold.WATER_MAX_HEIGHT &&
    c.height <= BiomeConstants.MANGROVE_MAX_HEIGHT &&
    c.coastDistance === 1 &&
    c.neighborOcean &&
    c.temperature >= BiomeConstants.MANGROVE_MIN_TEMP &&
    c.moisture >= BiomeConstants.MANGROVE_MIN_MOISTURE
  );
}

function isFloodedForestCandidate(c: CellBiomeClimate): boolean {
  if (c.temperature < BiomeConstants.FLOODED_FOREST_MIN_TEMP) return false;
  if (c.moisture < BiomeConstants.FLOODED_FOREST_MIN_MOISTURE) return false;
  if (c.hasRiver && c.flux >= BiomeConstants.FLOODED_FOREST_MIN_FLUX) return true;
  // Seasonal flood plain proxy: very wet lowland with river
  if (c.hasRiver && c.height < 30 && c.moisture >= 28) return true;
  return false;
}

function isCloudForestCandidate(c: CellBiomeClimate): boolean {
  return (
    c.height >= BiomeConstants.CLOUD_FOREST_MIN_HEIGHT &&
    c.temperature >= BiomeConstants.CLOUD_FOREST_MIN_TEMP &&
    c.moisture >= BiomeConstants.CLOUD_FOREST_MIN_MOISTURE &&
    !isPerennialSnowIce(c.temperature, c.height)
  );
}

function isMediterraneanCandidate(c: CellBiomeClimate): boolean {
  return (
    c.temperature >= BiomeConstants.MED_MIN_TEMP &&
    c.temperature <= BiomeConstants.MED_MAX_TEMP &&
    c.moisture >= BiomeConstants.MED_MIN_MOISTURE &&
    c.moisture <= BiomeConstants.MED_MAX_MOISTURE &&
    c.height < 55
  );
}

function isXericCandidate(c: CellBiomeClimate): boolean {
  return (
    c.temperature >= BiomeConstants.XERIC_MIN_TEMP &&
    c.temperature <= BiomeConstants.XERIC_MAX_TEMP &&
    c.moisture >= BiomeConstants.XERIC_MIN_MOISTURE &&
    c.moisture <= BiomeConstants.XERIC_MAX_MOISTURE &&
    !c.hasRiver
  );
}

function isTemperateConiferCandidate(c: CellBiomeClimate): boolean {
  return (
    c.temperature >= BiomeConstants.TEMP_CONIFER_MIN_TEMP &&
    c.temperature <= BiomeConstants.TEMP_CONIFER_MAX_TEMP &&
    c.moisture >= BiomeConstants.TEMP_CONIFER_MIN_MOISTURE &&
    c.height < treelineHeight(c.temperature)
  );
}

function isGreatForestClimate(c: CellBiomeClimate): boolean {
  return (
    c.temperature >= BiomeConstants.GREAT_FOREST_MIN_TEMP &&
    c.temperature <= BiomeConstants.GREAT_FOREST_MAX_TEMP &&
    c.moisture >= BiomeConstants.GREAT_FOREST_MIN_MOISTURE &&
    c.height <= BiomeConstants.GREAT_FOREST_MAX_HEIGHT &&
    c.height >= HeightThreshold.WATER_MAX_HEIGHT
  );
}

function isHeathCandidate(c: CellBiomeClimate): boolean {
  return (
    c.temperature >= BiomeConstants.HEATH_MIN_TEMP &&
    c.temperature <= BiomeConstants.HEATH_MAX_TEMP &&
    c.moisture >= BiomeConstants.HEATH_MIN_MOISTURE &&
    c.height <= BiomeConstants.HEATH_MAX_HEIGHT &&
    !c.hasRiver
  );
}

/** Phase 5: cold continental steppe / forest-steppe margin. */
export function isColdSteppeCandidate(c: CellBiomeClimate): boolean {
  return (
    c.temperature >= BiomeConstants.COLD_STEPPE_MIN_TEMP &&
    c.temperature <= BiomeConstants.COLD_STEPPE_MAX_TEMP &&
    c.moisture >= BiomeConstants.COLD_STEPPE_MIN_MOISTURE &&
    c.moisture <= BiomeConstants.COLD_STEPPE_MAX_MOISTURE &&
    c.height >= HeightThreshold.WATER_MAX_HEIGHT &&
    c.height <= BiomeConstants.COLD_STEPPE_MAX_HEIGHT &&
    !(c.hasRiver && c.flux >= BiomeConstants.FLOODED_FOREST_MIN_FLUX)
  );
}

/** Phase 5: tropical dry / thorn woodland between savanna and moist seasonal forest. */
export function isTropicalDryForestCandidate(c: CellBiomeClimate): boolean {
  return (
    c.temperature >= BiomeConstants.TROPICAL_DRY_MIN_TEMP &&
    c.moisture >= BiomeConstants.TROPICAL_DRY_MIN_MOISTURE &&
    c.moisture <= BiomeConstants.TROPICAL_DRY_MAX_MOISTURE &&
    c.height >= HeightThreshold.WATER_MAX_HEIGHT &&
    c.height <= BiomeConstants.TROPICAL_DRY_MAX_HEIGHT &&
    !isMangroveCandidate(c) &&
    !(c.hasRiver && c.flux >= BiomeConstants.FLOODED_FOREST_MIN_FLUX * 1.2)
  );
}

/** Phase 5: cold peat / muskeg — not temperate heath, not full taiga. */
export function isBorealPeatlandCandidate(c: CellBiomeClimate): boolean {
  if (c.temperature > BiomeConstants.BOREAL_PEAT_MAX_TEMP) return false;
  if (c.temperature <= -2) return false;
  if (c.height > BiomeConstants.BOREAL_PEAT_MAX_HEIGHT) return false;
  if (c.height < HeightThreshold.WATER_MAX_HEIGHT) return false;
  if (c.moisture >= BiomeConstants.BOREAL_PEAT_MIN_MOISTURE) return true;
  return isWetlandCell(c.moisture, c.temperature, c.height);
}

/**
 * Priority classification per plan order. Matrix fallback is applied by the caller
 * when this returns null (meaning "use climate matrix").
 */
export function classifySpecialBiome(c: CellBiomeClimate, options: AssignmentOptions): StandardBiomeKey | null {
  if (c.height < HeightThreshold.WATER_MAX_HEIGHT) return "marine";

  // 2. Perennial snow/ice — not mere cold lowland tundra
  if (isPerennialSnowIce(c.temperature, c.height)) return "glacier";

  // 3. Mangrove
  if (isMangroveCandidate(c)) {
    if (options.profile === "tropicalRiverBasin" || c.temperature >= 22) return "mangrove";
    if (options.profile !== "medievalEurope" && c.temperature >= BiomeConstants.MANGROVE_MIN_TEMP) return "mangrove";
  }

  // 5a. Cloud forest (tropical mountains) before generic montane
  if (isCloudForestCandidate(c)) {
    if (options.profile === "tropicalRiverBasin" || options.profile === "mountainRealm" || c.moisture >= 32) {
      return "cloudForest";
    }
  }

  // 5. Elevation vs treeline
  if (isAboveTreeline(c.temperature, c.height) && !isPerennialSnowIce(c.temperature, c.height)) {
    return "alpineTundra";
  }
  if (
    c.height >= BiomeConstants.MONTANE_MIN_HEIGHT &&
    c.height < treelineHeight(c.temperature) &&
    c.moisture >= 10 &&
    c.temperature > -2
  ) {
    if (options.profile === "mountainRealm" || c.height >= 55) return "montaneForest";
  }

  // 4. Flooded forest before generic wetland
  if (isFloodedForestCandidate(c)) {
    const boost = options.profile === "tropicalRiverBasin" || options.profile === "medievalEurope";
    if (boost || c.flux >= BiomeConstants.FLOODED_FOREST_MIN_FLUX * 1.2) return "floodedForest";
  }

  // Classic wetland / peat / heath (before matrix)
  if (isWetlandCell(c.moisture, c.temperature, c.height) || isBorealPeatlandCandidate(c)) {
    // Cold peat first — separate from temperate heath and generic wetland
    if (
      isBorealPeatlandCandidate(c) &&
      options.profile !== "tropicalRiverBasin" &&
      options.profile !== "mediterranean"
    ) {
      const peatBoost = options.profile === "medievalEurope" ? 0.12 : 0;
      if (smoothRegionMask(c.x, c.y, options.seed + 29) + peatBoost > 0.48) return "borealPeatland";
      // Very cold + very wet flats almost always muskeg even without strong mask
      if (c.temperature <= 3 && c.moisture >= BiomeConstants.BOREAL_PEAT_MIN_MOISTURE + 4) return "borealPeatland";
    }
    if (
      isHeathCandidate(c) &&
      (options.profile === "medievalEurope" || smoothRegionMask(c.x, c.y, options.seed) > 0.62)
    ) {
      return "heathMoorland";
    }
    if (isWetlandCell(c.moisture, c.temperature, c.height)) return "wetland";
  }

  // 6. Dry temperate/subtropical
  if (isMediterraneanCandidate(c)) {
    const medBoost = options.profile === "mediterranean" ? 0.25 : 0;
    if (smoothRegionMask(c.x, c.y, options.seed + 7) + medBoost > 0.45) return "mediterraneanWoodlandScrub";
  }
  if (isXericCandidate(c)) {
    if (c.moisture < BiomeConstants.HOT_DESERT_MOISTURE && c.temperature >= 25) {
      // leave to hot desert rule below
    } else if (smoothRegionMask(c.x, c.y, options.seed + 11) > 0.4) {
      return "xericShrubland";
    }
  }

  // Hot desert explicit (legacy)
  if (c.temperature >= 25 && !c.hasRiver && c.moisture < BiomeConstants.HOT_DESERT_MOISTURE) {
    return "hotDesert";
  }

  // Phase 5: tropical dry / thorn forest (before matrix savanna–seasonal split)
  if (isTropicalDryForestCandidate(c) && options.profile !== "medievalEurope") {
    const dryBoost = options.profile === "tropicalRiverBasin" ? 0.2 : 0;
    if (smoothRegionMask(c.x, c.y, options.seed + 31) + dryBoost > 0.42) return "tropicalDryForest";
  }

  // Phase 5: cold steppe (continental dry grassland)
  if (isColdSteppeCandidate(c) && options.profile !== "tropicalRiverBasin") {
    let steppeBoost = 0;
    if (options.profile === "medievalEurope") steppeBoost = 0.15; // eastern continental margin
    if (options.profile === "mediterranean") steppeBoost = -0.1;
    if (smoothRegionMask(c.x, c.y, options.seed + 33) + steppeBoost > 0.5) return "coldSteppe";
  }

  // 7. Temperate forest splits
  if (isTemperateConiferCandidate(c)) {
    const coniferBoost = options.profile === "mountainRealm" ? 0.15 : 0;
    if (smoothRegionMask(c.x, c.y, options.seed + 13) + coniferBoost > 0.55) return "temperateConiferousForest";
  }

  // Heath without full wetland
  if (isHeathCandidate(c) && options.profile === "medievalEurope") {
    if (smoothRegionMask(c.x, c.y, options.seed + 19) > 0.58) return "heathMoorland";
  }

  return null; // climate matrix fallback
}

/**
 * After matrix assignment, reclassify matrix results into regional / Phase-5 types.
 */
export function applyRegionalForestMask(
  key: StandardBiomeKey,
  c: CellBiomeClimate,
  options: AssignmentOptions
): StandardBiomeKey {
  // Grassland / savanna matrix cells → cold steppe or tropical dry forest where climate fits
  if (key === "grassland" || key === "savanna") {
    if (key === "grassland" && options.profile === "medievalEurope" && isHeathCandidate(c)) {
      if (smoothRegionMask(c.x, c.y, options.seed + 23) > 0.7) return "heathMoorland";
    }
    if (isColdSteppeCandidate(c) && options.profile !== "tropicalRiverBasin") {
      const steppeBoost = options.profile === "medievalEurope" ? 0.18 : 0;
      if (smoothRegionMask(c.x, c.y, options.seed + 33) + steppeBoost > 0.45) return "coldSteppe";
    }
    if (key === "savanna" && isTropicalDryForestCandidate(c) && options.profile !== "medievalEurope") {
      const dryBoost = options.profile === "tropicalRiverBasin" ? 0.22 : 0;
      if (smoothRegionMask(c.x, c.y, options.seed + 31) + dryBoost > 0.4) return "tropicalDryForest";
    }
  }

  // Moist tropical seasonal forest on the dry side → tropical dry forest
  if (key === "tropicalSeasonalForest" && isTropicalDryForestCandidate(c) && options.profile !== "medievalEurope") {
    if (c.moisture <= BiomeConstants.TROPICAL_DRY_MAX_MOISTURE - 2) {
      if (smoothRegionMask(c.x, c.y, options.seed + 31) > 0.38) return "tropicalDryForest";
    }
  }

  // Taiga / wetland matrix → boreal peatland on cold wet flats
  if ((key === "taiga" || key === "wetland" || key === "tundra") && isBorealPeatlandCandidate(c)) {
    if (options.profile !== "tropicalRiverBasin" && options.profile !== "mediterranean") {
      const peatBoost = options.profile === "medievalEurope" ? 0.1 : 0;
      if (smoothRegionMask(c.x, c.y, options.seed + 29) + peatBoost > 0.5) return "borealPeatland";
    }
  }

  if (key !== "temperateDeciduousForest" && key !== "temperateRainforest" && key !== "temperateConiferousForest") {
    return key;
  }

  if (!isGreatForestClimate(c)) return key;

  const mask = smoothRegionMask(c.x, c.y, options.seed + 3);
  let threshold = 0.72; // global: sparse continuous belts
  if (options.profile === "medievalEurope") threshold = 0.38;
  if (options.profile === "global") threshold = 0.68;
  if (options.profile === "mountainRealm") threshold = 0.85;

  if (mask >= threshold) return "centralEuropeanGreatForest";
  return key;
}

/**
 * Matrix band lookup helper: moisture/temp → index for biomesMatrix.
 */
export function climateMatrixBands(
  moisture: number,
  temperature: number
): {
  moistureBand: number;
  temperatureBand: number;
} {
  return {
    moistureBand: Math.min((moisture / 5) | 0, 4),
    temperatureBand: Math.min(Math.max(20 - temperature, 0), 25)
  };
}
