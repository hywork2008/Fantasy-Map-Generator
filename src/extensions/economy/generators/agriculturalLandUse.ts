import type { WorldContext } from "../../hostCore";
import { GROSS_FOOD_NEED } from "./foodConstants";

export const STAPLE_NEED_KG_PER_PERSON_YEAR = 200;
export const EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK = 0.65;
export const ANNUAL_SOWN_SHARE = 0.67;
export const BASE_NET_YIELD_KG_PER_SOWN_HECTARE = 450;
export const LABOUR_DAYS_PER_HECTARE = 30;
export const WORKABLE_DAYS_PER_ADULT = 140;
export const FARM_LABOUR_SAFETY_MARGIN = 1.15;

/**
 * Rural technology (Tools/plow) adoption bonus, driven by AgTechInvestment.settleAnnual().
 * See docs/plan/rural-agtech-investment.md §3.4. "calibration TBD" like the rest of this module.
 */
export const AGTECH_YIELD_BONUS_MAX = 0.4;
export const AGTECH_LABOR_SAVINGS_MAX = 0.35;
/** Share of the bonus reached with Tools alone, before a draft animal is available (see below). */
export const AGTECH_NO_DRAFT_EFFECT_SHARE = 0.6;
/** Biome tags where Cattle/Horses are actually raised locally (their biomeOutputByTag keys in goods-generator.ts). */
export const DRAFT_CAPABLE_BIOME_TAGS: readonly string[] = ["grassland", "nomadic"];

/**
 * Approximate built-up area per burg population point, used to exclude a settlement's own
 * footprint from cropland/pasture/wildHabitatArea accounting. ~50 people/ha is a plausible dense
 * medieval town density.
 */
export const URBAN_AREA_HECTARES_PER_POPULATION_POINT = 0.02;

/**
 * State-funded public agricultural infrastructure (roads, irrigation), driven by
 * AgTechInvestment.settleAnnual()'s state-level settlement. See docs/plan/rural-agtech-investment.md §6.1.
 * Yield-only: unlike AGTECH_*, this has no labor-savings or draft-animal gating — infrastructure
 * helps crops grow but doesn't reduce any individual farmer's labor.
 */
export const STATE_YIELD_BONUS_MAX = 0.15;

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
  /**
   * Adults beyond what the cell's *minimum* food plan (local consumption only; committed
   * exports are not yet tracked) needs to keep farming, in rural population points. Looser
   * than `migratableAdults` when the cell cultivates a reserve beyond bare subsistence.
   * See docs/plan/megacity-food-import-economy.md §4.1 `ruralReleasePressure`.
   */
  readonly ruralReleasePressure: Float32Array;
}

/**
 * Calculates agriculture independently of `cells.capacity` on a per-cell basis.
 * It never reads population or carrying capacity while deriving environmental
 * production potential; those values are consumed only by current cultivation.
 *
 * `agTechStockByCell` is an optional per-cell resolution of Market.agTechStock, and
 * `stateProductivityByCell` of stateAgriculturalProductivity (the caller broadcasts each
 * market's/state's stock to its cells via marketCellColumn/cells.state — this function stays
 * unaware of Markets and States, matching its existing population-independent design). Omitted or
 * out-of-range entries are treated as 0, so callers without AgTechInvestment wired up (tests,
 * legacy call sites) get the pre-existing behavior unchanged. See docs/plan/rural-agtech-investment.md §3.4, §6.1.
 */
export function calculateAgriculturalLandProfile(
  world: Readonly<WorldContext>,
  agTechStockByCell?: Float32Array,
  stateProductivityByCell?: Float32Array
): AgriculturalLandProfile {
  const cells = world.pack.cells;
  const count = cells?.i?.length ?? 0;
  const cultivableArea = new Float32Array(count);
  const yieldPerArea = new Float32Array(count);
  const foodPotential = new Float32Array(count);
  const ruralFoodCapacity = new Float32Array(count);
  const cultivatedArea = new Float32Array(count);
  const farmLaborRequired = new Float32Array(count);
  const migratableAdults = new Float32Array(count);
  const ruralReleasePressure = new Float32Array(count);
  if (!count) {
    return {
      cultivableArea,
      yieldPerArea,
      foodPotential,
      ruralFoodCapacity,
      cultivatedArea,
      farmLaborRequired,
      migratableAdults,
      ruralReleasePressure
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

    const biomeTags = world.biomesData.tags?.[cells.biomeCode[cellId] ?? 0] ?? [];
    const hasDraftAnimal = biomeTags.some(tag => DRAFT_CAPABLE_BIOME_TAGS.includes(tag));
    const rawAgTechStock = agTechStockByCell?.[cellId] ?? 0;
    const effectiveAgTech = rawAgTechStock * (hasDraftAnimal ? 1 : AGTECH_NO_DRAFT_EFFECT_SHARE);
    const stateProductivity = stateProductivityByCell?.[cellId] ?? 0;

    const yieldKgPerHa =
      BASE_NET_YIELD_KG_PER_SOWN_HECTARE *
      relativeYield[cellId] *
      (1 + AGTECH_YIELD_BONUS_MAX * effectiveAgTech) *
      (1 + STATE_YIELD_BONUS_MAX * stateProductivity);
    yieldPerArea[cellId] = yieldKgPerHa;

    const supported = supportedPeople(area, yieldKgPerHa);
    ruralFoodCapacity[cellId] = supported / populationRate;
    foodPotential[cellId] = supported * GROSS_FOOD_NEED;

    const effectiveLaborDaysPerHectare = LABOUR_DAYS_PER_HECTARE * (1 - AGTECH_LABOR_SAVINGS_MAX * effectiveAgTech);

    const currentPeople = Math.max(0, cells.pop[cellId] ?? 0) * populationRate;
    const requiredArea = requiredFieldAreaHectares(currentPeople, yieldKgPerHa);
    // A modest crop reserve is represented by keeping ten percent more area in
    // cultivation when land exists; it does not make more land available.
    const currentArea = Math.min(area, requiredArea * 1.1);
    cultivatedArea[cellId] = currentArea;
    const requiredAdults = (currentArea * effectiveLaborDaysPerHectare) / WORKABLE_DAYS_PER_ADULT;
    const requiredAdultPoints = requiredAdults / populationRate;
    farmLaborRequired[cellId] = requiredAdultPoints;
    const ruralAdults = Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
    migratableAdults[cellId] = Math.max(0, ruralAdults - requiredAdultPoints * FARM_LABOUR_SAFETY_MARGIN);

    // minimumFood = localConsumption + committedExport; committedExport isn't tracked yet (0),
    // so this uses the bare pre-buffer requiredArea rather than the 1.1x-buffered currentArea.
    const minimumFarmAdults = (requiredArea * effectiveLaborDaysPerHectare) / WORKABLE_DAYS_PER_ADULT;
    const minimumFarmAdultPoints = minimumFarmAdults / populationRate;
    ruralReleasePressure[cellId] = Math.max(0, ruralAdults - minimumFarmAdultPoints * FARM_LABOUR_SAFETY_MARGIN);
  }

  return {
    cultivableArea,
    yieldPerArea,
    foodPotential,
    ruralFoodCapacity,
    cultivatedArea,
    farmLaborRequired,
    migratableAdults,
    ruralReleasePressure
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

/**
 * Raw physical cell area in hectares, independent of habitability/biome/terrain suitability.
 * Exported so faunaPopulation.ts's wildHabitatArea (docs/plan/biome-goods-producer-ecosystem.md
 * §4.2) can subtract cultivatedArea from the same physical footprint calculateCultivableAreaHectares
 * itself starts from, instead of re-deriving a slightly different figure.
 */
export function calculatePhysicalAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
  const cells = world.pack.cells;
  if ((cells.h[cellId] ?? 0) < 20) return 0;
  const rawArea = Math.max(0, cells.area?.[cellId] ?? 0);
  return rawArea * Math.max(0, world.distanceScale || 1) ** 2 * 100;
}

/**
 * Fraction of a cell's land that's workable given its elevation, independent of what it's being
 * worked for — cropland (below) and husbandry.ts's pasture ceiling both use this same "steeper
 * terrain is harder to farm/graze" curve.
 */
export function calculateTerrainWorkableShare(height: number): number {
  return height <= 50 ? 0.9 : Math.max(0.2, 0.9 - (height - 50) / 90);
}

/**
 * A settlement's own built-up footprint, in hectares — excluded from both cropland/pasture and
 * wildHabitatArea accounting (docs/plan/biome-goods-producer-ecosystem.md §4.2). Exported so
 * faunaPopulation.ts and husbandry.ts share one figure instead of re-deriving it.
 */
export function calculateBurgBuiltAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
  const burgId = world.pack.cells.burg?.[cellId];
  if (!burgId) return 0;
  const burg = world.pack.burgs?.[burgId];
  if (!burg || burg.removed) return 0;
  return Math.max(0, burg.population ?? 0) * URBAN_AREA_HECTARES_PER_POPULATION_POINT;
}

function calculateCultivableAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
  const cells = world.pack.cells;
  const physicalHectares = calculatePhysicalAreaHectares(world, cellId);
  if (physicalHectares <= 0) return 0;

  const height = cells.h[cellId] ?? 0;
  const biomeCode = cells.biomeCode[cellId] ?? 0;
  const habitability = Math.max(0, world.biomesData.habitability[biomeCode] ?? 0);
  if (habitability <= 0) return 0;
  const tags = world.biomesData.tags?.[biomeCode] ?? [];
  const terrainShare = calculateTerrainWorkableShare(height);
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
