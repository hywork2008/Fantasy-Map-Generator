import type { CropCalendarProfile } from "./cropCalendars";

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
  /** Shared month-by-month planting, harvest, and labour profile. */
  readonly calendar: CropCalendarProfile;
}

export interface ClimateRange {
  readonly min: number;
  readonly idealMin: number;
  readonly idealMax: number;
  readonly max: number;
}

/**
 * `grid.cells.prec` stores annual precipitation in a 100 mm proxy scale.
 * Staple-crop rainfall limits are physical annual-rainfall bands divided by
 * 100; source records and the turnip screening assumption are documented in
 * `docs/plan/staple-crop-climate.md`.
 */

const COOL_CEREAL_CALENDAR = {
  annualCycleDays: 240,
  turnaroundDays: 30,
  minimumGrowingTemperatureC: 3,
  harvestWindows: [{ startAfterPlantingDays: 210, durationDays: 30 }],
  labourByStage: { establishment: 0.2, maintenance: 0.25, harvestAndProcessing: 0.55 },
  canProduceContinuously: false,
  maximumCropsPerYear: 1
} as const satisfies CropCalendarProfile;

const WARM_CEREAL_CALENDAR = {
  annualCycleDays: 120,
  turnaroundDays: 30,
  minimumGrowingTemperatureC: 10,
  harvestWindows: [{ startAfterPlantingDays: 105, durationDays: 30 }],
  labourByStage: { establishment: 0.22, maintenance: 0.28, harvestAndProcessing: 0.5 },
  canProduceContinuously: false,
  maximumCropsPerYear: 2
} as const satisfies CropCalendarProfile;

const LEGUME_CALENDAR = {
  annualCycleDays: 150,
  turnaroundDays: 30,
  minimumGrowingTemperatureC: 5,
  harvestWindows: [{ startAfterPlantingDays: 135, durationDays: 30 }],
  labourByStage: { establishment: 0.22, maintenance: 0.28, harvestAndProcessing: 0.5 },
  canProduceContinuously: false,
  maximumCropsPerYear: 2
} as const satisfies CropCalendarProfile;

const ROOT_CALENDAR = {
  annualCycleDays: 150,
  turnaroundDays: 30,
  minimumGrowingTemperatureC: 2,
  harvestWindows: [{ startAfterPlantingDays: 135, durationDays: 45 }],
  labourByStage: { establishment: 0.2, maintenance: 0.3, harvestAndProcessing: 0.5 },
  canProduceContinuously: false,
  maximumCropsPerYear: 2
} as const satisfies CropCalendarProfile;

/**
 * Main medieval staples and companion legumes. Potatoes remain available to
 * worlds that allow post-medieval crops; callers decide era availability.
 */
export const STAPLE_CROP_PROFILES = {
  Wheat: {
    kind: "cereal",
    yieldMultiplier: 1.05,
    temperature: { min: 2, idealMin: 8, idealMax: 18, max: 24 },
    precipitation: { min: 3, idealMin: 7.5, idealMax: 9, max: 16 },
    soils: ["loam", "alluvial", "clay"],
    calendar: COOL_CEREAL_CALENDAR
  },
  Rye: {
    kind: "cereal",
    yieldMultiplier: 0.82,
    temperature: { min: -2, idealMin: 4, idealMax: 14, max: 21 },
    precipitation: { min: 4, idealMin: 6, idealMax: 10, max: 20 },
    soils: ["loam", "sandy", "thin"],
    calendar: COOL_CEREAL_CALENDAR
  },
  Barley: {
    kind: "cereal",
    yieldMultiplier: 0.88,
    temperature: { min: -2, idealMin: 5, idealMax: 16, max: 23 },
    precipitation: { min: 2, idealMin: 5, idealMax: 10, max: 20 },
    soils: ["loam", "alluvial", "sandy"],
    calendar: COOL_CEREAL_CALENDAR
  },
  Oats: {
    kind: "cereal",
    yieldMultiplier: 0.8,
    temperature: { min: 0, idealMin: 6, idealMax: 16, max: 21 },
    precipitation: { min: 2.5, idealMin: 6, idealMax: 10, max: 15 },
    soils: ["humus", "loam", "clay"],
    calendar: COOL_CEREAL_CALENDAR
  },
  Millet: {
    kind: "cereal",
    yieldMultiplier: 0.78,
    temperature: { min: 10, idealMin: 16, idealMax: 27, max: 34 },
    precipitation: { min: 2, idealMin: 5, idealMax: 7.5, max: 10 },
    soils: ["loam", "sandy", "alluvial"],
    calendar: WARM_CEREAL_CALENDAR
  },
  Buckwheat: {
    kind: "cereal",
    yieldMultiplier: 0.72,
    temperature: { min: 2, idealMin: 9, idealMax: 18, max: 25 },
    precipitation: { min: 4, idealMin: 7, idealMax: 10, max: 13 },
    soils: ["thin", "sandy", "loam"],
    calendar: COOL_CEREAL_CALENDAR
  },
  Peas: {
    kind: "legume",
    yieldMultiplier: 0.74,
    temperature: { min: 1, idealMin: 7, idealMax: 18, max: 23 },
    precipitation: { min: 3.5, idealMin: 8, idealMax: 12, max: 25 },
    soils: ["loam", "alluvial", "clay"],
    calendar: LEGUME_CALENDAR
  },
  "Broad Beans": {
    kind: "legume",
    yieldMultiplier: 0.78,
    temperature: { min: 3, idealMin: 8, idealMax: 18, max: 23 },
    precipitation: { min: 2.5, idealMin: 6.5, idealMax: 10, max: 26 },
    soils: ["clay", "loam", "alluvial"],
    calendar: LEGUME_CALENDAR
  },
  Lentils: {
    kind: "legume",
    yieldMultiplier: 0.7,
    temperature: { min: 6, idealMin: 13, idealMax: 24, max: 30 },
    precipitation: { min: 2.5, idealMin: 6, idealMax: 10, max: 25 },
    soils: ["sandy", "loam", "thin"],
    calendar: LEGUME_CALENDAR
  },
  Chickpeas: {
    kind: "legume",
    yieldMultiplier: 0.72,
    temperature: { min: 8, idealMin: 16, idealMax: 27, max: 33 },
    precipitation: { min: 3, idealMin: 6, idealMax: 10, max: 18 },
    soils: ["sandy", "loam", "alluvial"],
    calendar: LEGUME_CALENDAR
  },
  Turnips: {
    kind: "tuber",
    yieldMultiplier: 0.9,
    temperature: { min: -1, idealMin: 5, idealMax: 16, max: 22 },
    precipitation: { min: 2.5, idealMin: 5, idealMax: 8, max: 15 },
    soils: ["loam", "sandy", "humus"],
    calendar: ROOT_CALENDAR
  },
  Potatoes: {
    kind: "tuber",
    yieldMultiplier: 1.15,
    temperature: { min: 3, idealMin: 8, idealMax: 18, max: 24 },
    precipitation: { min: 2.5, idealMin: 5, idealMax: 8, max: 20 },
    soils: ["loam", "sandy", "humus"],
    calendar: ROOT_CALENDAR
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
