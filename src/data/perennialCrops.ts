import type { CropCalendarProfile } from "./cropCalendars";
import type { ClimateRange, StapleSoilType } from "./stapleCrops";

/**
 * Climate, land, and labour requirements for perennial food crops. These are
 * intentionally separate from `StapleCropProfile`: orchards and vineyards are
 * not part of the cereal/legume rotation or the staple-food ledger.
 */
export type PerennialCropKind = "orchard" | "vine";

export interface PerennialCropProfile {
  readonly kind: PerennialCropKind;
  readonly temperature: ClimateRange;
  readonly precipitation: ClimateRange;
  readonly soils: readonly StapleSoilType[];
  /** Maximum share of suitable, unclaimed land that this crop may occupy. */
  readonly maximumLandShare: number;
  /** Desired planted area per local resident, in hectares. */
  readonly areaHectaresPerPerson: number;
  /** Annual work distributed across the year, in adult work days per hectare. */
  readonly laborDaysPerHectare: number;
  /** Market lots harvested from one fully staffed hectare in a month. */
  readonly yieldLotsPerHectarePerMonth: number;
  /** One annual harvest, plus pruning and maintenance labour distributed by month. */
  readonly calendar: CropCalendarProfile;
}

const VINE_CALENDAR = {
  annualCycleDays: 365,
  turnaroundDays: 0,
  minimumGrowingTemperatureC: 5,
  harvestWindows: [{ startAfterPlantingDays: 240, durationDays: 45 }],
  labourByStage: { establishment: 0.2, maintenance: 0.45, harvestAndProcessing: 0.35 },
  canProduceContinuously: false,
  maximumCropsPerYear: 1
} as const satisfies CropCalendarProfile;

const MEDITERRANEAN_ORCHARD_CALENDAR = {
  annualCycleDays: 365,
  turnaroundDays: 0,
  minimumGrowingTemperatureC: 5,
  harvestWindows: [{ startAfterPlantingDays: 285, durationDays: 60 }],
  labourByStage: { establishment: 0.2, maintenance: 0.35, harvestAndProcessing: 0.45 },
  canProduceContinuously: false,
  maximumCropsPerYear: 1
} as const satisfies CropCalendarProfile;

const TEMPERATE_ORCHARD_CALENDAR = {
  annualCycleDays: 365,
  turnaroundDays: 0,
  minimumGrowingTemperatureC: 6,
  harvestWindows: [{ startAfterPlantingDays: 240, durationDays: 45 }],
  labourByStage: { establishment: 0.25, maintenance: 0.4, harvestAndProcessing: 0.35 },
  canProduceContinuously: false,
  maximumCropsPerYear: 1
} as const satisfies CropCalendarProfile;

/**
 * The precipitation axis uses FMG's existing annual precipitation proxy, not
 * millimetres. Values were calibrated from the FAO ECOCROP absolute/optimal
 * annual-rainfall bands documented in `docs/plan/perennial-fruit-crops.md`.
 */
export const PERENNIAL_CROP_PROFILES = {
  Grapes: {
    kind: "vine",
    temperature: { min: 5, idealMin: 10, idealMax: 25, max: 34 },
    precipitation: { min: 20, idealMin: 40, idealMax: 80, max: 120 },
    soils: ["loam", "alluvial", "sandy", "thin"],
    maximumLandShare: 0.5,
    areaHectaresPerPerson: 0.04,
    laborDaysPerHectare: 20,
    yieldLotsPerHectarePerMonth: 0.03,
    calendar: VINE_CALENDAR
  },
  Olives: {
    kind: "orchard",
    temperature: { min: 5, idealMin: 20, idealMax: 34, max: 40 },
    precipitation: { min: 20, idealMin: 40, idealMax: 70, max: 120 },
    soils: ["loam", "sandy", "thin", "alluvial"],
    maximumLandShare: 0.35,
    areaHectaresPerPerson: 0.018,
    laborDaysPerHectare: 16,
    yieldLotsPerHectarePerMonth: 0.018,
    calendar: MEDITERRANEAN_ORCHARD_CALENDAR
  },
  Apples: {
    kind: "orchard",
    temperature: { min: 8, idealMin: 14, idealMax: 27, max: 33 },
    precipitation: { min: 50, idealMin: 70, idealMax: 100, max: 160 },
    soils: ["loam", "humus", "alluvial"],
    maximumLandShare: 0.3,
    areaHectaresPerPerson: 0.02,
    laborDaysPerHectare: 24,
    yieldLotsPerHectarePerMonth: 0.04,
    calendar: TEMPERATE_ORCHARD_CALENDAR
  },
  Pears: {
    kind: "orchard",
    temperature: { min: 10, idealMin: 20, idealMax: 32, max: 37 },
    precipitation: { min: 40, idealMin: 60, idealMax: 90, max: 140 },
    soils: ["loam", "clay", "alluvial"],
    maximumLandShare: 0.24,
    areaHectaresPerPerson: 0.014,
    laborDaysPerHectare: 22,
    yieldLotsPerHectarePerMonth: 0.032,
    calendar: TEMPERATE_ORCHARD_CALENDAR
  },
  Plums: {
    kind: "orchard",
    temperature: { min: 6, idealMin: 18, idealMax: 33, max: 36 },
    precipitation: { min: 60, idealMin: 90, idealMax: 120, max: 150 },
    soils: ["loam", "clay", "alluvial"],
    maximumLandShare: 0.2,
    areaHectaresPerPerson: 0.012,
    laborDaysPerHectare: 22,
    yieldLotsPerHectarePerMonth: 0.03,
    calendar: TEMPERATE_ORCHARD_CALENDAR
  },
  Figs: {
    kind: "orchard",
    temperature: { min: 4, idealMin: 16, idealMax: 26, max: 38 },
    precipitation: { min: 30, idealMin: 70, idealMax: 110, max: 180 },
    soils: ["loam", "sandy", "thin", "alluvial"],
    maximumLandShare: 0.22,
    areaHectaresPerPerson: 0.012,
    laborDaysPerHectare: 18,
    yieldLotsPerHectarePerMonth: 0.028,
    calendar: MEDITERRANEAN_ORCHARD_CALENDAR
  },
  Lemons: {
    kind: "orchard",
    temperature: { min: 12, idealMin: 15, idealMax: 28, max: 36 },
    precipitation: { min: 30, idealMin: 100, idealMax: 150, max: 220 },
    soils: ["loam", "sandy", "alluvial"],
    maximumLandShare: 0.18,
    areaHectaresPerPerson: 0.008,
    laborDaysPerHectare: 26,
    yieldLotsPerHectarePerMonth: 0.025,
    calendar: MEDITERRANEAN_ORCHARD_CALENDAR
  }
} as const satisfies Record<string, PerennialCropProfile>;

export function getPerennialCropSuitability(
  profile: PerennialCropProfile,
  temperature: number,
  precipitation: number,
  soil: StapleSoilType,
  irrigationSupplement = 0
): number {
  const effectivePrecipitation = precipitation + Math.max(0, irrigationSupplement);
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
