/**
 * Shared, world-agnostic crop-calendar calculations.
 *
 * The economy supplies a cell's already-classified climate inputs. This module deliberately
 * does not import an Economy context, renderer, or map data so the same calendar can be used by
 * Food Ledger, ordinary market production, and rural labour allocation.
 */

export type MonthlyWeights = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export type MonthlyValues = MonthlyWeights;
export type MonthlyFlags = readonly [
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
];

export type SeasonRegionId = "north" | "equatorial" | "south";
export type AgriculturalClimateZoneId =
  | "cold-rainfed-single"
  | "temperate-rainfed-single"
  | "warm-rainfed-single"
  | "warm-irrigated-double"
  | "tropical-irrigated-continuous"
  | "warm-water-limited-single";
export type PlantingCohort = 0 | 1 | 2;

export interface HarvestWindow {
  readonly startAfterPlantingDays: number;
  readonly durationDays: number;
}

export interface CropCalendarProfile {
  readonly annualCycleDays: number;
  readonly turnaroundDays: number;
  readonly minimumGrowingTemperatureC: number;
  readonly harvestWindows: readonly HarvestWindow[];
  readonly labourByStage: {
    readonly establishment: number;
    readonly maintenance: number;
    readonly harvestAndProcessing: number;
  };
  readonly canProduceContinuously: boolean;
  readonly maximumCropsPerYear: 1 | 2;
  /** Only irrigated short-cycle crops may use the deterministic 3-cohort stagger. */
  readonly allowsPlantingCohorts?: boolean;
}

export interface AgriculturalClimateZone {
  readonly id: AgriculturalClimateZoneId;
  readonly seasonality: "cold" | "temperate" | "warm" | "tropical";
  readonly waterRegime: "rainfed" | "irrigated" | "waterLimited";
  /** A class representative, combined once with the seasonal offsets below. */
  readonly referenceAnnualTemperatureC: number;
  readonly maximumAnnualCropCycles: 1 | 2;
  readonly allowsContinuousGrowth: boolean;
}

export interface SeasonRegionProfile {
  readonly id: SeasonRegionId;
  readonly hemisphere: SeasonRegionId;
  readonly monthlyTemperatureOffsets: MonthlyValues;
}

export interface CropCalendar {
  readonly harvestWeights: MonthlyWeights;
  readonly labourWeights: MonthlyWeights;
  readonly growableMonths: MonthlyFlags;
  readonly cropCycles: 0 | 1 | 2;
}

const NORTH_TEMPERATURE_OFFSETS: MonthlyValues = [-8, -7, -4, 0, 4, 7, 8, 7, 4, 0, -4, -7];
const EQUATORIAL_TEMPERATURE_OFFSETS: MonthlyValues = [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5, 0, 0.5, 1, 0.5];

function rotateHalfYear(values: MonthlyValues): MonthlyValues {
  return [
    values[6],
    values[7],
    values[8],
    values[9],
    values[10],
    values[11],
    values[0],
    values[1],
    values[2],
    values[3],
    values[4],
    values[5]
  ];
}

export const SEASON_REGION_PROFILES: Readonly<Record<SeasonRegionId, SeasonRegionProfile>> = {
  north: { id: "north", hemisphere: "north", monthlyTemperatureOffsets: NORTH_TEMPERATURE_OFFSETS },
  equatorial: { id: "equatorial", hemisphere: "equatorial", monthlyTemperatureOffsets: EQUATORIAL_TEMPERATURE_OFFSETS },
  south: { id: "south", hemisphere: "south", monthlyTemperatureOffsets: rotateHalfYear(NORTH_TEMPERATURE_OFFSETS) }
};

export function classifySeasonRegion(latitude: number): SeasonRegionId {
  if (latitude > 8) return "north";
  if (latitude < -8) return "south";
  return "equatorial";
}

/** Classifies annual cell data once; it intentionally does not invent a rainy season. */
export function classifyAgriculturalClimateZone(input: {
  annualTemperatureC: number;
  annualPrecipitation: number;
  irrigated: boolean;
}): AgriculturalClimateZone {
  const { annualTemperatureC, annualPrecipitation, irrigated } = input;
  const waterRegime = irrigated ? "irrigated" : annualPrecipitation < 18 ? "waterLimited" : "rainfed";
  if (annualTemperatureC < 5) {
    return {
      id: "cold-rainfed-single",
      seasonality: "cold",
      waterRegime,
      referenceAnnualTemperatureC: 3,
      maximumAnnualCropCycles: 1,
      allowsContinuousGrowth: false
    };
  }
  if (annualTemperatureC < 15) {
    return {
      id: "temperate-rainfed-single",
      seasonality: "temperate",
      waterRegime,
      referenceAnnualTemperatureC: 11,
      maximumAnnualCropCycles: 1,
      allowsContinuousGrowth: false
    };
  }
  if (annualTemperatureC < 24) {
    if (waterRegime === "irrigated") {
      return {
        id: "warm-irrigated-double",
        seasonality: "warm",
        waterRegime,
        referenceAnnualTemperatureC: 20,
        maximumAnnualCropCycles: 2,
        allowsContinuousGrowth: false
      };
    }
    return {
      id: waterRegime === "waterLimited" ? "warm-water-limited-single" : "warm-rainfed-single",
      seasonality: "warm",
      waterRegime,
      referenceAnnualTemperatureC: 20,
      maximumAnnualCropCycles: 1,
      allowsContinuousGrowth: false
    };
  }
  if (waterRegime === "irrigated") {
    return {
      id: "tropical-irrigated-continuous",
      seasonality: "tropical",
      waterRegime,
      referenceAnnualTemperatureC: 27,
      maximumAnnualCropCycles: 2,
      allowsContinuousGrowth: true
    };
  }
  return {
    id: waterRegime === "waterLimited" ? "warm-water-limited-single" : "warm-rainfed-single",
    seasonality: "warm",
    waterRegime,
    referenceAnnualTemperatureC: 25,
    maximumAnnualCropCycles: waterRegime === "rainfed" ? 2 : 1,
    allowsContinuousGrowth: false
  };
}

function zeroWeights(): MonthlyWeights {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

function normalize(weights: number[]): MonthlyWeights {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return zeroWeights();
  return weights.map(value => value / total) as unknown as MonthlyWeights;
}

function rotate(weights: MonthlyWeights, months: number): MonthlyWeights {
  const normalizedShift = ((months % 12) + 12) % 12;
  return weights.map((_, month) => weights[(month - normalizedShift + 12) % 12]) as unknown as MonthlyWeights;
}

function toMonthlyFlags(values: boolean[]): MonthlyFlags {
  return values as unknown as MonthlyFlags;
}

function longestCyclicRun(growable: readonly boolean[]): { start: number; length: number } {
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  let runLength = 0;
  for (let index = 0; index < 24; index++) {
    if (growable[index % 12]) {
      if (runLength === 0) runStart = index;
      runLength++;
      if (runLength > bestLength && runLength <= 12) {
        bestLength = runLength;
        bestStart = runStart % 12;
      }
    } else {
      runLength = 0;
    }
  }
  return { start: bestStart, length: bestLength };
}

function addWindow(weights: number[], startMonth: number, durationDays: number): void {
  const months = Math.max(1, Math.ceil(durationDays / 30));
  for (let offset = 0; offset < months; offset++) weights[(startMonth + offset) % 12] += 1 / months;
}

/**
 * Builds a normalized month calendar from a pre-classified seasonal region and climate zone.
 * It is cache-safe: callers may cache the return value by region, zone, crop id and cohort.
 */
export function getCropCalendar(
  seasonRegion: SeasonRegionProfile,
  zone: AgriculturalClimateZone,
  profile: CropCalendarProfile,
  plantingCohort?: PlantingCohort
): CropCalendar {
  const growable = seasonRegion.monthlyTemperatureOffsets.map(
    offset =>
      zone.referenceAnnualTemperatureC + offset >= profile.minimumGrowingTemperatureC &&
      zone.waterRegime !== "waterLimited"
  );
  const growableMonths = toMonthlyFlags(growable);
  const allMonthsGrowable = growable.every(Boolean);
  if (profile.canProduceContinuously && zone.allowsContinuousGrowth && allMonthsGrowable) {
    return {
      harvestWeights: [1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12],
      labourWeights: [1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12],
      growableMonths,
      cropCycles: 1
    };
  }

  const run = longestCyclicRun(growable);
  const cycleMonths = Math.ceil((profile.annualCycleDays + profile.turnaroundDays) / 30);
  if (run.length < cycleMonths)
    return { harvestWeights: zeroWeights(), labourWeights: zeroWeights(), growableMonths, cropCycles: 0 };
  const cycles: 1 | 2 =
    profile.maximumCropsPerYear === 2 && zone.maximumAnnualCropCycles === 2 && run.length >= cycleMonths * 2 ? 2 : 1;
  const plantingMonths = cycles === 2 ? [run.start, (run.start + cycleMonths) % 12] : [run.start];
  const harvest = Array.from({ length: 12 }, () => 0);
  const labour = Array.from({ length: 12 }, () => 0);
  const labourStages = profile.labourByStage;
  for (const plantingMonth of plantingMonths) {
    labour[plantingMonth] += labourStages.establishment;
    const maintenanceMonths = Math.max(1, Math.ceil(profile.annualCycleDays / 30));
    for (let offset = 0; offset < maintenanceMonths; offset++) {
      labour[(plantingMonth + offset) % 12] += labourStages.maintenance / maintenanceMonths;
    }
    for (const window of profile.harvestWindows) {
      const harvestMonth = (plantingMonth + Math.floor(window.startAfterPlantingDays / 30)) % 12;
      addWindow(harvest, harvestMonth, window.durationDays);
      const harvestMonths = Math.max(1, Math.ceil(window.durationDays / 30));
      for (let offset = 0; offset < harvestMonths; offset++) {
        labour[(harvestMonth + offset) % 12] += labourStages.harvestAndProcessing / harvestMonths;
      }
    }
  }
  const harvestWeights = normalize(harvest);
  const labourWeights = normalize(labour);
  const cohortShift = profile.allowsPlantingCohorts && plantingCohort !== undefined ? plantingCohort * 4 : 0;
  return {
    harvestWeights: rotate(harvestWeights, cohortShift),
    labourWeights: rotate(labourWeights, cohortShift),
    growableMonths,
    cropCycles: cycles
  };
}
