/**
 * Climate and soil requirements shared by initial settlement and the economy
 * extension. These are deliberately host data: initial population is placed
 * before extensions are initialized.
 */
export type StapleCropKind = "cereal" | "tuber" | "legume";
export type StapleSoilType = "alluvial" | "clay" | "humus" | "loam" | "sandy" | "thin";

export interface StapleCropProfile {
  readonly kind: StapleCropKind;
  /** Net edible output relative to the shared agricultural baseline. */
  readonly yieldMultiplier: number;
  readonly temperature: ClimateRange;
  readonly precipitation: ClimateRange;
  readonly soils: readonly StapleSoilType[];
}

export interface ClimateRange {
  readonly min: number;
  readonly idealMin: number;
  readonly idealMax: number;
  readonly max: number;
}

/**
 * Main medieval staples and companion legumes. Potatoes remain available to
 * worlds that allow post-medieval crops; callers decide era availability.
 */
export const STAPLE_CROP_PROFILES = {
  Wheat: {
    kind: "cereal",
    yieldMultiplier: 1.05,
    temperature: { min: 2, idealMin: 8, idealMax: 18, max: 24 },
    precipitation: { min: 18, idealMin: 30, idealMax: 60, max: 80 },
    soils: ["loam", "alluvial", "clay"]
  },
  Rye: {
    kind: "cereal",
    yieldMultiplier: 0.82,
    temperature: { min: -2, idealMin: 4, idealMax: 14, max: 21 },
    precipitation: { min: 12, idealMin: 24, idealMax: 55, max: 75 },
    soils: ["loam", "sandy", "thin"]
  },
  Barley: {
    kind: "cereal",
    yieldMultiplier: 0.88,
    temperature: { min: -2, idealMin: 5, idealMax: 16, max: 23 },
    precipitation: { min: 10, idealMin: 20, idealMax: 50, max: 70 },
    soils: ["loam", "alluvial", "sandy"]
  },
  Oats: {
    kind: "cereal",
    yieldMultiplier: 0.8,
    temperature: { min: 0, idealMin: 6, idealMax: 16, max: 21 },
    precipitation: { min: 20, idealMin: 35, idealMax: 70, max: 90 },
    soils: ["humus", "loam", "clay"]
  },
  Millet: {
    kind: "cereal",
    yieldMultiplier: 0.78,
    temperature: { min: 10, idealMin: 16, idealMax: 27, max: 34 },
    precipitation: { min: 7, idealMin: 15, idealMax: 42, max: 62 },
    soils: ["loam", "sandy", "alluvial"]
  },
  Buckwheat: {
    kind: "cereal",
    yieldMultiplier: 0.72,
    temperature: { min: 2, idealMin: 9, idealMax: 18, max: 25 },
    precipitation: { min: 15, idealMin: 28, idealMax: 60, max: 80 },
    soils: ["thin", "sandy", "loam"]
  },
  Peas: {
    kind: "legume",
    yieldMultiplier: 0.74,
    temperature: { min: 1, idealMin: 7, idealMax: 18, max: 23 },
    precipitation: { min: 15, idealMin: 28, idealMax: 62, max: 82 },
    soils: ["loam", "alluvial", "clay"]
  },
  "Broad Beans": {
    kind: "legume",
    yieldMultiplier: 0.78,
    temperature: { min: 3, idealMin: 8, idealMax: 18, max: 23 },
    precipitation: { min: 18, idealMin: 30, idealMax: 65, max: 85 },
    soils: ["clay", "loam", "alluvial"]
  },
  Lentils: {
    kind: "legume",
    yieldMultiplier: 0.7,
    temperature: { min: 6, idealMin: 13, idealMax: 24, max: 30 },
    precipitation: { min: 6, idealMin: 14, idealMax: 38, max: 55 },
    soils: ["sandy", "loam", "thin"]
  },
  Chickpeas: {
    kind: "legume",
    yieldMultiplier: 0.72,
    temperature: { min: 8, idealMin: 16, idealMax: 27, max: 33 },
    precipitation: { min: 5, idealMin: 12, idealMax: 34, max: 50 },
    soils: ["sandy", "loam", "alluvial"]
  },
  Turnips: {
    kind: "tuber",
    yieldMultiplier: 0.9,
    temperature: { min: -1, idealMin: 5, idealMax: 16, max: 22 },
    precipitation: { min: 18, idealMin: 30, idealMax: 70, max: 90 },
    soils: ["loam", "sandy", "humus"]
  },
  Potatoes: {
    kind: "tuber",
    yieldMultiplier: 1.15,
    temperature: { min: 3, idealMin: 8, idealMax: 18, max: 24 },
    precipitation: { min: 20, idealMin: 35, idealMax: 70, max: 90 },
    soils: ["loam", "sandy", "humus"]
  }
} as const satisfies Record<string, StapleCropProfile>;

export const STAPLE_CROP_LIST = Object.values(STAPLE_CROP_PROFILES);

/** Returns climate-and-soil suitability on a 0–1 scale. */
export function getStapleCropSuitability(
  profile: StapleCropProfile,
  temperature: number,
  precipitation: number,
  soil: StapleSoilType,
  irrigationSupplement: number | boolean = 0
): number {
  // Boolean true remains a compatibility adapter for old callers. New callers
  // pass the actual delivered rainfall-equivalent supplement.
  const effectivePrecipitation =
    typeof irrigationSupplement === "number"
      ? precipitation + Math.max(0, irrigationSupplement)
      : irrigationSupplement
        ? Math.max(precipitation, profile.precipitation.idealMin * 0.8)
        : precipitation;
  const soilFactor = profile.soils.includes(soil) ? 1 : 0.55;
  return (
    rangeSuitability(temperature, profile.temperature) *
    rangeSuitability(effectivePrecipitation, profile.precipitation) *
    soilFactor
  );
}

function rangeSuitability(value: number, range: ClimateRange): number {
  if (value <= range.min || value >= range.max) return 0;
  if (value >= range.idealMin && value <= range.idealMax) return 1;
  if (value < range.idealMin) return (value - range.min) / (range.idealMin - range.min);
  return (range.max - value) / (range.max - range.idealMax);
}
