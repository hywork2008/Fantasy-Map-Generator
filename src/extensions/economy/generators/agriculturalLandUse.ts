import type { WorldContext } from "../../hostCore";
import { GROSS_FOOD_NEED } from "./foodConstants";

export const STAPLE_NEED_KG_PER_PERSON_YEAR = 200;
export const EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK = 0.65;
export const ANNUAL_SOWN_SHARE = 0.67;
export const BASE_NET_YIELD_KG_PER_SOWN_HECTARE = 450;
export const LABOUR_DAYS_PER_HECTARE = 90;
export const WORKABLE_DAYS_PER_ADULT = 140;
export const FARM_LABOUR_SAFETY_MARGIN = 1.15;

export interface AgriculturalLandProfile {
  /** Maximum area that can become cropland under current terrain and biome constraints, in ha. */
  readonly cultivableArea: Float32Array;
  /** Climate- and globally-calibrated net grain yield, kg per sown ha. */
  readonly yieldPerArea: Float32Array;
  /** Food output with all cultivable land under crop, in the existing annual food unit. */
  readonly foodPotential: Float32Array;
  /** Rural people supportable without imports, expressed in rural population points. */
  readonly ruralFoodCapacity: Float32Array;
  /** Current planted and maintained field area, in ha. */
  readonly cultivatedArea: Float32Array;
  /** Adult rural labour required for the current field area, in rural population points. */
  readonly farmLaborRequired: Float32Array;
  /** Adults that can leave after farm labour's safety margin, in rural population points. */
  readonly migratableAdults: Float32Array;
}

/**
 * Calculates agriculture independently of `cells.capacity` on a per-cell basis.
 * It never reads population or carrying capacity while deriving environmental
 * production potential; those values are consumed only by current cultivation.
 */
export function calculateAgriculturalLandProfile(world: Readonly<WorldContext>): AgriculturalLandProfile {
  const cells = world.pack.cells;
  const count = cells?.i?.length ?? 0;
  const cultivableArea = new Float32Array(count);
  const yieldPerArea = new Float32Array(count);
  const foodPotential = new Float32Array(count);
  const ruralFoodCapacity = new Float32Array(count);
  const cultivatedArea = new Float32Array(count);
  const farmLaborRequired = new Float32Array(count);
  const migratableAdults = new Float32Array(count);
  if (!count) {
    return {
      cultivableArea,
      yieldPerArea,
      foodPotential,
      ruralFoodCapacity,
      cultivatedArea,
      farmLaborRequired,
      migratableAdults
    };
  }

  const relativeYield = new Float32Array(count);
  const populationRate = Math.max(1, world.populationRate || 1);

  for (const cellId of cells.i) {
    const area = calculateCultivableAreaHectares(world, cellId);
    cultivableArea[cellId] = area;
    if (area <= 0) continue;

    const climateYield = calculateClimateYield(world, cellId);
    relativeYield[cellId] = climateYield;
  }

  for (const cellId of cells.i) {
    const area = cultivableArea[cellId];
    if (area <= 0) continue;
    const yieldKgPerHa = BASE_NET_YIELD_KG_PER_SOWN_HECTARE * relativeYield[cellId];
    yieldPerArea[cellId] = yieldKgPerHa;

    const supported = supportedPeople(area, yieldKgPerHa);
    ruralFoodCapacity[cellId] = supported / populationRate;
    foodPotential[cellId] = supported * GROSS_FOOD_NEED;

    const currentPeople = Math.max(0, cells.pop[cellId] ?? 0) * populationRate;
    const requiredArea = requiredFieldAreaHectares(currentPeople, yieldKgPerHa);
    // A modest crop reserve is represented by keeping ten percent more area in
    // cultivation when land exists; it does not make more land available.
    const currentArea = Math.min(area, requiredArea * 1.1);
    cultivatedArea[cellId] = currentArea;
    const requiredAdults = (currentArea * LABOUR_DAYS_PER_HECTARE) / WORKABLE_DAYS_PER_ADULT;
    const requiredAdultPoints = requiredAdults / populationRate;
    farmLaborRequired[cellId] = requiredAdultPoints;
    const ruralAdults = Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
    migratableAdults[cellId] = Math.max(0, ruralAdults - requiredAdultPoints * FARM_LABOUR_SAFETY_MARGIN);
  }

  return {
    cultivableArea,
    yieldPerArea,
    foodPotential,
    ruralFoodCapacity,
    cultivatedArea,
    farmLaborRequired,
    migratableAdults
  };
}

export function requiredFieldAreaHectares(people: number, yieldKgPerHa: number): number {
  if (people <= 0 || yieldKgPerHa <= 0) return 0;
  return (
    (people * STAPLE_NEED_KG_PER_PERSON_YEAR) / (EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK * yieldKgPerHa * ANNUAL_SOWN_SHARE)
  );
}

function supportedPeople(cultivableHectares: number, yieldKgPerHa: number): number {
  return (
    (cultivableHectares * ANNUAL_SOWN_SHARE * yieldKgPerHa * EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK) /
    STAPLE_NEED_KG_PER_PERSON_YEAR
  );
}

function calculateCultivableAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
  const cells = world.pack.cells;
  const height = cells.h[cellId] ?? 0;
  if (height < 20) return 0;

  const rawArea = Math.max(0, cells.area[cellId] ?? 0);
  const physicalHectares = rawArea * Math.max(0, world.distanceScale || 1) ** 2 * 100;
  if (physicalHectares <= 0) return 0;

  const biomeCode = cells.biomeCode[cellId] ?? 0;
  const habitability = Math.max(0, world.biomesData.habitability[biomeCode] ?? 0);
  if (habitability <= 0) return 0;
  const tags = world.biomesData.tags?.[biomeCode] ?? [];
  const terrainShare = height <= 50 ? 0.9 : Math.max(0.2, 0.9 - (height - 50) / 90);
  const biomeCeiling = tags.includes("wetland")
    ? 0.35
    : tags.includes("desert")
      ? 0.2
      : tags.includes("mountain")
        ? 0.3
        : tags.includes("grassland") || tags.includes("arable")
          ? 0.8
          : 0.7;
  const forestCover = Math.max(0, Math.min(1, cells.forestCover?.[cellId] ?? (tags.includes("forest") ? 0.7 : 0)));
  const forestClearanceCeiling = 1 - forestCover * 0.25;
  return physicalHectares * terrainShare * biomeCeiling * forestClearanceCeiling;
}

function calculateClimateYield(world: Readonly<WorldContext>, cellId: number): number {
  const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
  const temperature = world.grid?.cells.temp?.[gridCellId] ?? 12;
  const precipitation = world.grid?.cells.prec?.[gridCellId] ?? 45;
  const temperatureFactor =
    temperature <= -5
      ? 0
      : temperature < 2
        ? 0.15 + ((temperature + 5) / 7) * 0.3
        : temperature < 7
          ? 0.45 + ((temperature - 2) / 5) * 0.55
          : temperature <= 18
            ? 1
            : temperature <= 28
              ? 1 - ((temperature - 18) / 10) * 0.35
              : 0.3;
  const precipitationFactor =
    precipitation < 8
      ? 0
      : precipitation < 20
        ? 0.4 + ((precipitation - 8) / 12) * 0.35
        : precipitation < 60
          ? 0.75 + ((precipitation - 20) / 40) * 0.25
          : 1;
  const waterAccess = world.pack.cells.r[cellId] ? 1.08 : 1;
  return Math.max(0, temperatureFactor * precipitationFactor * waterAccess);
}
