import {
  classifyAgriculturalClimateZone,
  classifySeasonRegion,
  getCropCalendar,
  SEASON_REGION_PROFILES
} from "../../../data/cropCalendars";
import { getStapleCropSuitability } from "../../../data/stapleCrops";
import { harvestForestStock } from "../../../generators/forestStock";
import {
  allocateRiverWater,
  CHILD_COHORT_YEARS,
  compileRiverWaterNetwork,
  LIVELIHOOD_CODE,
  type RiverWaterAllocation,
  type RiverWithdrawal,
  type WorldContext
} from "../../hostCore";
import { type CultureType, DEFAULT_CULTURE_TYPE } from "../../hostTypes";
import { getLatitude } from "../../hostUtils";
import { GROSS_FOOD_NEED } from "./foodConstants";
import type { Good, SoilType } from "./goods-generator";

export const STAPLE_NEED_KG_PER_PERSON_YEAR = 200;
export const EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK = 0.65;
export const ANNUAL_SOWN_SHARE = 0.67;
export const BASE_NET_YIELD_KG_PER_SOWN_HECTARE = 450;
export const LABOUR_DAYS_PER_HECTARE = 30;
export const WORKABLE_DAYS_PER_ADULT = 140;
/** Calendar capacity used by the shared rural labour allocator. */
export const WORKABLE_DAYS_PER_ADULT_PER_MONTH = WORKABLE_DAYS_PER_ADULT / 12;
export const FARM_LABOUR_SAFETY_MARGIN = 1.15;
/**
 * Local consumption plus a modest on-field reserve. This is the *floor* on cultivated area,
 * not the target: remaining farmable adults expand fields up to labour- and land-affordable
 * limits (docs/simulation/population-food-supply.md §4.2).
 */
export const SUBSISTENCE_FIELD_RESERVE = 1.1;
/**
 * Share of rural adults kept off the plough in megacity mode so hinterland cells can
 * ship people *and* grain. Midpoint of the 30–40% dual-export calibration
 * (docs/plan/megacity-food-import-economy.md, 2026-07-30). The remaining farmers still
 * tend every hectare they can — food export grows with yield/land, not by cancelling
 * the migrant pool.
 */
export const MEGACITY_LABOR_EXPORT_SHARE = 0.32;

/**
 * Rural technology (Tools/plow) adoption bonus, driven by AgTechInvestment.settleAnnual().
 * See docs/plan/rural-agtech-investment.md §3.4. "calibration TBD" like the rest of this module.
 */
export const AGTECH_YIELD_BONUS_MAX = 0.4;
export const AGTECH_LABOR_SAVINGS_MAX = 0.35;
/** Share of the bonus reached with Tools alone, before a draft animal is available (see below). */
export const AGTECH_NO_DRAFT_EFFECT_SHARE = 0.6;
/**
 * Biome tags where Cattle/Horses are actually raised locally (their biomeOutputByTag keys in
 * goods-generator.ts). `arable` added 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase H)
 * alongside Cattle/Horses gaining an `arable` biomeOutputByTag entry — mixed-farming forest biomes
 * (Temperate deciduous forest, Tropical seasonal forest, Central European great forest) now also
 * raise draft animals, so they should get the same Tools-alone-vs-Tools-plus-draft-animal agtech
 * split as grassland/nomadic instead of always being treated as draft-animal-free.
 */
export const DRAFT_CAPABLE_BIOME_TAGS: readonly string[] = ["grassland", "nomadic", "arable"];

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
/** Maximum crop-yield gain from replacing fallow with a clover-and-fodder course. */
export const FOUR_COURSE_YIELD_BONUS_MAX = 0.12;
/** Better fodder and a planned rotation reduce labour for the staple-field share. */
export const FOUR_COURSE_LABOR_SAVINGS_MAX = 0.08;
/**
 * Rural Phosphate Fertilizer adoption bonus, driven by FertilizerInvestment.settleAnnual().
 * Yield-only, no labor-savings term — chemical fertilizer raises output per hectare, it doesn't
 * reduce the labour a farmer spends working the field. calibration TBD, between FOUR_COURSE
 * (0.12, free/practice-based) and AGTECH (0.4, needs Tools + draft animal). See
 * docs/plan/phosphate-fertilizer-vertical-slice.md §3.9.
 */
export const PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX = 0.2;
/** One course in the four-year plan is represented as a clover ley. */
export const FOUR_COURSE_CLOVER_LEY_SHARE = 0.25;
/** Extra organic-fertility recovery supplied by the clover ley and its livestock cycle. */
export const FOUR_COURSE_SOIL_RESTORATION_BONUS = 0.015;
/** Relative annual water supplied by one generated river-flux unit. Calibration is intentionally map-relative. */
export const IRRIGATION_ANNUAL_WATER_PER_FLUX = 30;
export const RIVER_ENVIRONMENTAL_FLOW_RESERVE = 0.55;
const MIN_SOIL_FERTILITY = 0.55;
const MAX_SOIL_FERTILITY = 1.1;

export interface CropMixEntry {
  readonly good: Good;
  readonly share: number;
  readonly suitability: number;
}

export interface AgriculturalConditions {
  /** Staple crops available to the world. Omit for legacy/test callers' generic-Grain behavior. */
  readonly cropGoods?: readonly Good[];
  /** Persistent, cell-local soil organic fertility; 1 is the three-field baseline. */
  readonly soilFertilityByCell?: Float32Array;
  /** Persistent salt loading from irrigation; 0 is clean soil, 1 is severely saline. */
  readonly irrigationSalinityByCell?: Float32Array;
  /** State technology adoption resolved to cells by DevelopmentPotential. */
  readonly fourCourseRotationByCell?: Float32Array;
  /** 0..1 command-area and canal-maintenance development. */
  readonly irrigationDevelopmentByCell?: Float32Array;
  /** 0..1 share of diverted water that reaches fields. */
  readonly irrigationConveyanceEfficiencyByCell?: Float32Array;
  /** Separate from irrigation: controls salt leaching and waterlogging only. */
  readonly fieldDrainageByCell?: Float32Array;
  /**
   * Market-purchased Phosphate Fertilizer adoption coverage, resolved to cells by
   * DevelopmentPotential from Market.fertilizerStock — same shape as fourCourseRotationByCell.
   * See docs/plan/phosphate-fertilizer-vertical-slice.md §3.8-3.9.
   */
  readonly fertilizerStockByCell?: Float32Array;
  /** Resolved once per agricultural pass; callers may provide a cached annual result. */
  readonly irrigation?: RiverIrrigationResults;
}

export interface RiverIrrigationResults {
  readonly irrigatedAreaHa: Float32Array;
  /** Rainfall-equivalent water delivered over the irrigated portion of a cell. */
  readonly irrigationSupplement: Float32Array;
  readonly irrigationDeliveredWater: Float32Array;
  readonly irrigationWaterStress: Float32Array;
  readonly residualFlowByCell: Float32Array;
  readonly allocation: RiverWaterAllocation;
}

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
  /** Flowering clover-ley area within cultivated land, in ha; future apiaries can use it as a nectar source. */
  readonly floweringForageArea: Float32Array;
  /** Adult rural labour required for the current field area, in rural population points. */
  readonly farmLaborRequired: Float32Array;
  /** Current staple-field work requirement, indexed as `cellId * 12 + month`, in real work-days. */
  readonly cropLaborDaysByMonth: Float32Array;
  /** Bare-subsistence staple-field work requirement, indexed as `cellId * 12 + month`, in real work-days. */
  readonly minimumCropLaborDaysByMonth: Float32Array;
  /** Adults that can leave after farm labour's safety margin, in rural population points. */
  readonly migratableAdults: Float32Array;
  /**
   * Adults reserved *before* extra fields were sized (child→adult outflow, and in megacity
   * the hinterland labour-export share). The occupation allocator must not spend this cohort
   * on harvest peaks or mutual aid.
   */
  readonly reservedLaborExport: Float32Array;
  /**
   * Adults beyond what the cell's *minimum* food plan (local consumption only; committed
   * exports are not yet tracked) needs to keep farming, in rural population points. Looser
   * than `migratableAdults` when the cell cultivates a reserve beyond bare subsistence.
   * See docs/plan/megacity-food-import-economy.md §4.1 `ruralReleasePressure`.
   */
  readonly ruralReleasePressure: Float32Array;
  readonly irrigation: RiverIrrigationResults;
}

/**
 * Standard maps reserve fields for the burg population in the same cell as well as rural
 * residents. Megacity mode alone relaxes this local self-sufficiency rule so Food Ledger imports
 * can sustain a city whose own cell has no Grain production.
 */
export interface AgriculturalDemandOptions {
  readonly includeUrbanFoodDemand?: boolean;
  /**
   * Megacity hinterland: reserve `MEGACITY_LABOR_EXPORT_SHARE` of rural adults (at least
   * this year's child→adult outflow) as urban-bound labour. Independent growth leaves
   * only the outflow reserved and spends every other adult on fields.
   */
  readonly reserveLaborForUrbanExport?: boolean;
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
  stateProductivityByCell?: Float32Array,
  demandOptions: AgriculturalDemandOptions = {},
  conditions: AgriculturalConditions = {}
): AgriculturalLandProfile {
  const cells = world.pack.cells;
  const count = cells?.i?.length ?? 0;
  const cultivableArea = new Float32Array(count);
  const yieldPerArea = new Float32Array(count);
  const foodPotential = new Float32Array(count);
  const ruralFoodCapacity = new Float32Array(count);
  const cultivatedArea = new Float32Array(count);
  const floweringForageArea = new Float32Array(count);
  const farmLaborRequired = new Float32Array(count);
  const cropLaborDaysByMonth = new Float32Array(count * 12);
  const minimumCropLaborDaysByMonth = new Float32Array(count * 12);
  const migratableAdults = new Float32Array(count);
  const reservedLaborExport = new Float32Array(count);
  const ruralReleasePressure = new Float32Array(count);
  const emptyIrrigation = createEmptyRiverIrrigationResults(count);
  if (!count) {
    return {
      cultivableArea,
      yieldPerArea,
      foodPotential,
      ruralFoodCapacity,
      cultivatedArea,
      floweringForageArea,
      farmLaborRequired,
      cropLaborDaysByMonth,
      minimumCropLaborDaysByMonth,
      migratableAdults,
      reservedLaborExport,
      ruralReleasePressure,
      irrigation: emptyIrrigation
    };
  }

  const populationRate = Math.max(1, world.populationRate || 1);

  for (const cellId of cells.i) {
    const area = calculateCultivableAreaHectares(world, cellId);
    cultivableArea[cellId] = area;
  }

  const irrigation =
    conditions.irrigation ??
    calculateRiverIrrigationResults(
      world,
      conditions.cropGoods ?? [],
      cultivableArea,
      conditions.irrigationDevelopmentByCell,
      conditions.irrigationConveyanceEfficiencyByCell
    );

  for (const cellId of cells.i) {
    const area = cultivableArea[cellId];
    if (area <= 0) continue;

    const effectiveAgTech = getEffectiveAgTech(world, cellId, agTechStockByCell);
    const stateProductivity = stateProductivityByCell?.[cellId] ?? 0;
    const fourCourseRotation = conditions.fourCourseRotationByCell?.[cellId] ?? 0;

    const yieldKgPerHa = calculateYieldKgPerHectare(
      world,
      cellId,
      effectiveAgTech,
      stateProductivity,
      { ...conditions, irrigation },
      area
    );
    yieldPerArea[cellId] = yieldKgPerHa;

    const supported = supportedPeople(area, yieldKgPerHa);
    ruralFoodCapacity[cellId] = supported / populationRate;
    foodPotential[cellId] = supported * GROSS_FOOD_NEED;

    const effectiveLaborDaysPerHectare = LABOUR_DAYS_PER_HECTARE * (1 - AGTECH_LABOR_SAVINGS_MAX * effectiveAgTech);

    const currentPeople = getCellFoodDemandPeople(
      world,
      cellId,
      populationRate,
      demandOptions.includeUrbanFoodDemand !== false
    );
    const requiredArea = requiredFieldAreaHectares(currentPeople, yieldKgPerHa);
    const ruralAdults = Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
    const reservedLaborExportPoints = getReservedLaborExportPoints(
      cells,
      cellId,
      demandOptions.reserveLaborForUrbanExport === true
    );
    const farmableAdults = Math.max(0, ruralAdults - reservedLaborExportPoints);
    const fourCourseLaborMultiplier = 1 - FOUR_COURSE_LABOR_SAVINGS_MAX * fourCourseRotation;
    const annualLaborDaysPerHectare = effectiveLaborDaysPerHectare * fourCourseLaborMultiplier;
    const subsistenceArea = Math.min(area, requiredArea * SUBSISTENCE_FIELD_RESERVE);
    const laborAffordableArea =
      yieldKgPerHa > 0
        ? getLaborAffordableAreaHectares(farmableAdults, populationRate, annualLaborDaysPerHectare, area)
        : 0;
    // Food first for the village, then the remaining *farmable* adults develop extra
    // hectares for export. Megacity keeps a labour-export reserve out of farmable.
    const currentArea = yieldKgPerHa > 0 ? Math.min(area, Math.max(subsistenceArea, laborAffordableArea)) : 0;
    cultivatedArea[cellId] = currentArea;
    floweringForageArea[cellId] =
      currentArea * FOUR_COURSE_CLOVER_LEY_SHARE * fourCourseRotation * getCloverSuitability(world, cellId);
    const currentMonthlyLaborDays = getCropMonthlyLabourDays(
      world,
      cellId,
      conditions,
      irrigation.irrigatedAreaHa[cellId] ?? 0,
      currentArea * annualLaborDaysPerHectare
    );
    const minimumMonthlyLaborDays = getCropMonthlyLabourDays(
      world,
      cellId,
      conditions,
      irrigation.irrigatedAreaHa[cellId] ?? 0,
      requiredArea * annualLaborDaysPerHectare
    );
    cropLaborDaysByMonth.set(currentMonthlyLaborDays, cellId * 12);
    minimumCropLaborDaysByMonth.set(minimumMonthlyLaborDays, cellId * 12);
    // Year-round resident farmers, not the harvest-month peak. Peak labour is a seasonal
    // shortage for mutual aid; counting it here made employment swing from ~0% (no
    // matching crop calendar) to well over 100% (concentrated harvest).
    const requiredAdults = getAnnualRequiredAdults(currentMonthlyLaborDays);
    const requiredAdultPoints = requiredAdults / populationRate;
    farmLaborRequired[cellId] = requiredAdultPoints;
    reservedLaborExport[cellId] = reservedLaborExportPoints;
    // Labour reserved before extra fields were sized stays migratable — extra planting
    // must not cancel the urban-bound cohort (outflow, or the megacity export share).
    migratableAdults[cellId] = Math.max(
      reservedLaborExportPoints,
      ruralAdults - requiredAdultPoints * FARM_LABOUR_SAFETY_MARGIN
    );

    // minimumFood = localConsumption + committedExport; committedExport isn't tracked yet (0),
    // so this uses the bare pre-buffer requiredArea rather than the reserve-buffered currentArea.
    const minimumFarmAdults = getAnnualRequiredAdults(minimumMonthlyLaborDays);
    const minimumFarmAdultPoints = minimumFarmAdults / populationRate;
    ruralReleasePressure[cellId] = Math.max(0, ruralAdults - minimumFarmAdultPoints * FARM_LABOUR_SAFETY_MARGIN);
  }

  return {
    cultivableArea,
    yieldPerArea,
    foodPotential,
    ruralFoodCapacity,
    cultivatedArea,
    floweringForageArea,
    farmLaborRequired,
    cropLaborDaysByMonth,
    minimumCropLaborDaysByMonth,
    migratableAdults,
    reservedLaborExport,
    ruralReleasePressure,
    irrigation
  };
}

export function requiredFieldAreaHectares(people: number, yieldKgPerHa: number): number {
  if (people <= 0 || yieldKgPerHa <= 0) return 0;
  return (
    (people * STAPLE_NEED_KG_PER_PERSON_YEAR) / (EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK * yieldKgPerHa * ANNUAL_SOWN_SHARE)
  );
}

/** Children→adult arrivals this year, in rural population points. */
export function getReservedAdultOutflowPoints(cells: WorldContext["pack"]["cells"], cellId: number): number {
  return Math.max(0, cells.children?.[cellId] ?? 0) / CHILD_COHORT_YEARS;
}

/**
 * Adults that must not be absorbed into extra ploughing. Independent growth reserves
 * only this year's child→adult outflow. Megacity also reserves the calibrated
 * hinterland labour-export share so a cell can ship people and grain together.
 */
export function getReservedLaborExportPoints(
  cells: WorldContext["pack"]["cells"],
  cellId: number,
  reserveLaborForUrbanExport: boolean
): number {
  const outflow = getReservedAdultOutflowPoints(cells, cellId);
  if (!reserveLaborForUrbanExport) return outflow;
  const livelihood = cells.livelihood?.[cellId] ?? 0;
  // Highland foraging/herding cells have no grain surplus to trade for urban labour.
  if (livelihood !== LIVELIHOOD_CODE.agriculture && livelihood !== LIVELIHOOD_CODE.none) return outflow;
  const ruralAdults = Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
  return Math.max(outflow, ruralAdults * MEGACITY_LABOR_EXPORT_SHARE);
}

/**
 * Hectares the remaining farmable adults can tend after the 15% safety margin.
 * Uses the annual (year-round resident) capacity, not the harvest-month peak —
 * harvest spikes are filled by household help and neighbour mutual aid.
 */
export function getLaborAffordableAreaHectares(
  farmableAdultPoints: number,
  populationRate: number,
  annualLaborDaysPerHectare: number,
  cultivableArea: number
): number {
  if (farmableAdultPoints <= 0 || annualLaborDaysPerHectare <= 0 || cultivableArea <= 0) return 0;
  return Math.min(
    cultivableArea,
    (farmableAdultPoints * Math.max(1, populationRate) * WORKABLE_DAYS_PER_ADULT) /
      (annualLaborDaysPerHectare * FARM_LABOUR_SAFETY_MARGIN)
  );
}

/**
 * Opens enough forest for each cell's resident population to maintain its initial (or newly
 * increased) grain field requirement. This is the only path from population demand to permanent
 * clearing: Wood production harvests the same stock, but does not itself create a field target.
 *
 * The map starts after this historical clearing has already happened, so the removed timber is not
 * inserted into an economy market inventory. Later annual calls make additional clearing as local
 * population grows. Standard maps include the burg population in this local field target;
 * Megacity mode is the only explicit opt-out and relies on the Food Ledger/import network instead.
 */
export function reconcileForestClearanceForAgriculture(
  world: WorldContext,
  agTechStockByCell?: Float32Array,
  stateProductivityByCell?: Float32Array,
  demandOptions: AgriculturalDemandOptions = {},
  conditions: AgriculturalConditions = {}
): boolean {
  const cells = world.pack.cells;
  if (!cells.forestStock || cells.forestStock.length !== cells.i.length) return false;

  const populationRate = Math.max(1, world.populationRate || 1);
  let changed = false;

  for (const cellId of cells.i) {
    const constraints = getCroplandConstraints(world, cellId);
    if (!constraints || constraints.terrainAndBiomeCeiling <= 0) continue;

    const effectiveAgTech = getEffectiveAgTech(world, cellId, agTechStockByCell);
    const stateProductivity = stateProductivityByCell?.[cellId] ?? 0;
    const yieldKgPerHa = calculateYieldKgPerHectare(world, cellId, effectiveAgTech, stateProductivity, conditions);
    const residentPeople = getCellFoodDemandPeople(
      world,
      cellId,
      populationRate,
      demandOptions.includeUrbanFoodDemand !== false
    );
    const ruralAdults = Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
    const farmableAdults = Math.max(
      0,
      ruralAdults - getReservedLaborExportPoints(cells, cellId, demandOptions.reserveLaborForUrbanExport === true)
    );
    const fourCourseRotation = conditions.fourCourseRotationByCell?.[cellId] ?? 0;
    const annualLaborDaysPerHectare =
      LABOUR_DAYS_PER_HECTARE *
      (1 - AGTECH_LABOR_SAVINGS_MAX * effectiveAgTech) *
      (1 - FOUR_COURSE_LABOR_SAVINGS_MAX * fourCourseRotation);
    const requiredArea = requiredFieldAreaHectares(residentPeople, yieldKgPerHa);
    const subsistenceArea = requiredArea * SUBSISTENCE_FIELD_RESERVE;
    const laborAffordableArea =
      yieldKgPerHa > 0
        ? getLaborAffordableAreaHectares(
            farmableAdults,
            populationRate,
            annualLaborDaysPerHectare,
            constraints.terrainAndBiomeCeiling
          )
        : 0;
    // Open enough forest for the same food-first target calculateAgriculturalLandProfile will plant.
    const targetCultivatedArea = Math.min(
      constraints.terrainAndBiomeCeiling,
      Math.max(subsistenceArea, laborAffordableArea)
    );
    if (targetCultivatedArea <= 0) continue;

    const forestCapacity = getForestCapacityForCell(cells, cellId, constraints.biomeTags);
    const standingForestCover = Math.max(0, Math.min(forestCapacity, cells.forestStock[cellId] ?? forestCapacity));
    const openLandArea = constraints.physicalHectares * (1 - standingForestCover);
    const additionalOpenArea = targetCultivatedArea - openLandArea;
    if (additionalOpenArea <= 0) continue;

    const harvestedCoverage = harvestForestStock(cells, cellId, additionalOpenArea / constraints.physicalHectares);
    changed ||= harvestedCoverage > 0;
  }

  return changed;
}

function getCellFoodDemandPeople(
  world: Readonly<WorldContext>,
  cellId: number,
  populationRate: number,
  includeUrbanFoodDemand: boolean
): number {
  const cells = world.pack.cells;
  const ruralPeople = Math.max(0, cells.pop[cellId] ?? 0) * populationRate;
  if (!includeUrbanFoodDemand) return ruralPeople;

  const burgId = cells.burg?.[cellId] ?? 0;
  const burg = burgId ? world.pack.burgs?.[burgId] : undefined;
  const urbanization = Math.max(0, world.urbanization ?? 1);
  const urbanPeople = burg && !burg.removed ? Math.max(0, burg.population ?? 0) * populationRate * urbanization : 0;
  return ruralPeople + urbanPeople;
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
  const constraints = getCroplandConstraints(world, cellId);
  if (!constraints) return 0;
  // `forestCover` is potential forest capacity, while forestStock is the only
  // mutable standing-timber value. Opening a forest therefore expands the area
  // that can be farmed; no second "cleared land" approximation is stored.
  const forestCapacity = getForestCapacityForCell(cells, cellId, constraints.biomeTags);
  const standingForestCover = Math.max(0, Math.min(forestCapacity, cells.forestStock?.[cellId] ?? forestCapacity));
  const openLandArea = constraints.physicalHectares * (1 - standingForestCover);
  return Math.min(constraints.terrainAndBiomeCeiling, openLandArea);
}

function getCroplandConstraints(
  world: Readonly<WorldContext>,
  cellId: number
): {
  readonly physicalHectares: number;
  readonly terrainAndBiomeCeiling: number;
  readonly biomeTags: readonly string[];
} | null {
  const cells = world.pack.cells;
  const physicalHectares = calculatePhysicalAreaHectares(world, cellId);
  if (physicalHectares <= 0) return null;

  const height = cells.h[cellId] ?? 0;
  const biomeCode = cells.biomeCode[cellId] ?? 0;
  const habitability = Math.max(0, world.biomesData.habitability[biomeCode] ?? 0);
  if (habitability <= 0) return null;
  const biomeTags = world.biomesData.tags?.[biomeCode] ?? [];
  const terrainShare = calculateTerrainWorkableShare(height);
  const biomeCeiling = biomeTags.includes("wetland")
    ? 0.35
    : biomeTags.includes("desert")
      ? 0.2
      : biomeTags.includes("mountain")
        ? 0.3
        : biomeTags.includes("grassland") || biomeTags.includes("arable")
          ? 0.8
          : 0.7;
  return { physicalHectares, terrainAndBiomeCeiling: physicalHectares * terrainShare * biomeCeiling, biomeTags };
}

function getForestCapacityForCell(
  cells: WorldContext["pack"]["cells"],
  cellId: number,
  biomeTags: readonly string[]
): number {
  return Math.max(0, Math.min(1, cells.forestCover?.[cellId] ?? (biomeTags.includes("forest") ? 0.7 : 0)));
}

function getEffectiveAgTech(world: Readonly<WorldContext>, cellId: number, agTechStockByCell?: Float32Array): number {
  const biomeTags = world.biomesData.tags?.[world.pack.cells.biomeCode[cellId] ?? 0] ?? [];
  const hasDraftAnimal = biomeTags.some(tag => DRAFT_CAPABLE_BIOME_TAGS.includes(tag));
  const rawAgTechStock = agTechStockByCell?.[cellId] ?? 0;
  return rawAgTechStock * (hasDraftAnimal ? 1 : AGTECH_NO_DRAFT_EFFECT_SHARE);
}

function calculateYieldKgPerHectare(
  world: Readonly<WorldContext>,
  cellId: number,
  effectiveAgTech: number,
  stateProductivity: number,
  conditions: AgriculturalConditions = {},
  cultivableArea?: number
): number {
  const effectiveClimateYield = calculateClimateYield(world, cellId, conditions, cultivableArea);
  return (
    BASE_NET_YIELD_KG_PER_SOWN_HECTARE *
    effectiveClimateYield *
    (1 + AGTECH_YIELD_BONUS_MAX * effectiveAgTech) *
    (1 + STATE_YIELD_BONUS_MAX * stateProductivity) *
    (1 + FOUR_COURSE_YIELD_BONUS_MAX * (conditions.fourCourseRotationByCell?.[cellId] ?? 0)) *
    (1 + PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX * (conditions.fertilizerStockByCell?.[cellId] ?? 0))
  );
}

function getCloverSuitability(world: Readonly<WorldContext>, cellId: number): number {
  const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
  const temperature = world.grid?.cells.temp?.[gridCellId] ?? 12;
  const precipitation = world.grid?.cells.prec?.[gridCellId] ?? 45;
  return (
    rangeSuitability(temperature, { min: 0, idealMin: 10, idealMax: 22, max: 30 }) *
    rangeSuitability(precipitation, { min: 15, idealMin: 30, idealMax: 70, max: 90 })
  );
}

function rangeSuitability(
  value: number,
  range: { readonly min: number; readonly idealMin: number; readonly idealMax: number; readonly max: number }
): number {
  if (value <= range.min || value >= range.max) return 0;
  if (value >= range.idealMin && value <= range.idealMax) return 1;
  if (value < range.idealMin) return (value - range.min) / (range.idealMin - range.min);
  return (range.max - value) / (range.max - range.idealMax);
}

const CULTURE_CROP_PREFERENCES: Record<CultureType, Partial<Record<string, number>>> = {
  Generic: { Wheat: 1.35, Barley: 1.15, Peas: 1.25, "Broad Beans": 1.15 },
  Hunting: { Oats: 1.35, Buckwheat: 1.45, Turnips: 1.2, Peas: 1.2 },
  Highland: { Rye: 1.5, Oats: 1.25, Buckwheat: 1.4, Peas: 1.2 },
  River: { Wheat: 1.45, Barley: 1.2, "Broad Beans": 1.4, Peas: 1.2 },
  Lake: { Oats: 1.4, Barley: 1.2, Peas: 1.4, "Broad Beans": 1.25 },
  Naval: { Wheat: 1.3, Barley: 1.25, Peas: 1.3, "Broad Beans": 1.2 },
  Nomadic: { Millet: 1.65, Barley: 1.2, Lentils: 1.4, Chickpeas: 1.4 }
};

const MAIN_CROP_SHARE_WITH_LEGUME = 2 / 3;

/**
 * Returns the cell's crop plan: exactly one cereal/root staple and one legume whenever the
 * environment permits both. The culture type only ranks candidates that already fit this
 * cell's temperature and rainfall; it never makes a too-cold or too-dry crop grow. Excess
 * rain is a preference (rain-tolerant crops win), not an empty mix. Shares represent the
 * rotation plan, not a claim that every field contains both crops in the same season.
 */
export function getCropMix(
  world: Readonly<WorldContext>,
  cellId: number,
  cropGoods: readonly Good[],
  conditions: AgriculturalConditions = {}
): readonly CropMixEntry[] {
  const candidates = cropGoods
    .filter(good => good.crop)
    .map(good => ({ good, suitability: getCropSuitability(world, cellId, good, conditions) }))
    .filter(candidate => candidate.suitability > 0);
  if (!candidates.length) return [];

  const cultureType = getCellCultureType(world, cellId);
  const mainCrop = selectCrop(
    candidates.filter(candidate => candidate.good.crop!.kind !== "legume"),
    cultureType,
    cellId,
    17
  );
  const legume = selectCrop(
    candidates.filter(candidate => candidate.good.crop!.kind === "legume"),
    cultureType,
    cellId,
    31
  );
  if (!mainCrop && !legume) return [];
  if (!mainCrop) return [{ ...legume!, share: 1 }];
  if (!legume) return [{ ...mainCrop, share: 1 }];

  return [
    { ...mainCrop, share: MAIN_CROP_SHARE_WITH_LEGUME },
    { ...legume, share: 1 - MAIN_CROP_SHARE_WITH_LEGUME }
  ];
}

/**
 * Converts annual field labour into the resident workforce required in its busiest calendar
 * month. The crop plan remains a rotation representation, so shares are aggregated before the
 * peak is selected. Legacy callers without a crop catalogue retain the former annual factor.
 */
function getCropMonthlyLabourDays(
  world: Readonly<WorldContext>,
  cellId: number,
  conditions: AgriculturalConditions,
  irrigatedArea: number,
  annualLaborDays: number
): Float32Array {
  const monthlyDays = new Float32Array(12);
  if (annualLaborDays <= 0) return monthlyDays;
  const cropGoods = conditions.cropGoods;
  if (!cropGoods?.length) {
    monthlyDays.fill(annualLaborDays / 12);
    return monthlyDays;
  }
  const mix = getCropMix(world, cellId, cropGoods, conditions);
  if (!mix.length) {
    monthlyDays.fill(annualLaborDays / 12);
    return monthlyDays;
  }
  const cells = world.pack.cells;
  const point = cells.p?.[cellId];
  const gridCellId = cells.g?.[cellId] ?? cellId;
  if (!point || gridCellId < 0) {
    monthlyDays.fill(annualLaborDays / 12);
    return monthlyDays;
  }
  const latitude = getLatitude(point[1], world.mapCoordinates, world.graphHeight);
  const temperature = world.grid.cells.temp?.[gridCellId] ?? 12;
  const precipitation = world.grid.cells.prec?.[gridCellId] ?? 45;
  const region = classifySeasonRegion(latitude);
  const zone = classifyAgriculturalClimateZone({
    annualTemperatureC: temperature,
    annualPrecipitation: precipitation,
    irrigated: irrigatedArea > 0
  });
  for (const entry of mix) {
    const calendarProfile = entry.good.crop?.calendar;
    if (!calendarProfile) continue;
    const calendar = getCropCalendar(SEASON_REGION_PROFILES[region], zone, calendarProfile);
    for (let month = 0; month < 12; month++) {
      monthlyDays[month] += annualLaborDays * entry.share * calendar.labourWeights[month];
    }
  }
  // Too-short growing seasons return all-zero labour weights. Keep the annual work
  // so employment does not collapse to "everyone surplus" on those cells.
  const allocated = monthlyDays.reduce((sum, days) => sum + days, 0);
  if (allocated <= 0) monthlyDays.fill(annualLaborDays / 12);
  return monthlyDays;
}

/** Year-round resident adults implied by the month-by-month work plan. */
export function getAnnualRequiredAdults(monthlyLaborDays: ArrayLike<number>): number {
  let totalDays = 0;
  for (let index = 0; index < monthlyLaborDays.length; index++) totalDays += monthlyLaborDays[index] ?? 0;
  return totalDays / WORKABLE_DAYS_PER_ADULT;
}

function selectCrop(
  candidates: readonly Omit<CropMixEntry, "share">[],
  cultureType: CultureType,
  cellId: number,
  salt: number
): Omit<CropMixEntry, "share"> | null {
  if (!candidates.length) return null;
  const preferences = CULTURE_CROP_PREFERENCES[cultureType];
  return candidates.reduce<Omit<CropMixEntry, "share"> | null>((selected, candidate) => {
    if (!selected) return candidate;
    const candidateScore = getCropSelectionScore(candidate, preferences, cellId, salt);
    const selectedScore = getCropSelectionScore(selected, preferences, cellId, salt);
    return candidateScore > selectedScore ? candidate : selected;
  }, null);
}

function getCropSelectionScore(
  candidate: Omit<CropMixEntry, "share">,
  preferences: Partial<Record<string, number>>,
  cellId: number,
  salt: number
): number {
  const culturalWeight = preferences[candidate.good.name] ?? 1;
  // A stable, small local variation prevents every equally suited cell in one culture from
  // displaying the same crop while keeping the result deterministic across redraws and saves.
  const variation = 0.93 + stableCropNoise(cellId, candidate.good.i, salt) * 0.14;
  return candidate.suitability * culturalWeight * variation;
}

function stableCropNoise(cellId: number, goodId: number, salt: number): number {
  let hash = (cellId + 1) * 374761393 + (goodId + 1) * 668265263 + salt * 1442695041;
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function getCellCultureType(world: Readonly<WorldContext>, cellId: number): CultureType {
  const cultureId = world.pack.cells.culture?.[cellId] ?? 0;
  return world.pack.cultures?.[cultureId]?.type ?? DEFAULT_CULTURE_TYPE;
}

/** Returns 0..1 crop suitability from the catalogued climate range and the cell's soil class. */
export function getCropSuitability(
  world: Readonly<WorldContext>,
  cellId: number,
  good: Good,
  conditions: AgriculturalConditions = {}
): number {
  const crop = good.crop;
  if (!crop) return 0;
  const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
  const temperature = world.grid?.cells.temp?.[gridCellId] ?? 12;
  const precipitation = world.grid?.cells.prec?.[gridCellId] ?? 45;
  const soil = getCellSoilType(world, cellId);
  const irrigationSupplement = conditions.irrigation?.irrigationSupplement[cellId] ?? 0;
  return getStapleCropSuitability(crop, temperature, precipitation, soil, irrigationSupplement);
}

/**
 * Resolves cell-level irrigation from the whole year's requests in one pass.
 * It is intentionally crop/market-neutral once the demand list has been built.
 */
export function calculateRiverIrrigationResults(
  world: Readonly<WorldContext>,
  cropGoods: readonly Good[],
  cultivableArea: Float32Array,
  irrigationDevelopmentByCell?: Float32Array,
  conveyanceEfficiencyByCell?: Float32Array
): RiverIrrigationResults {
  const count = world.pack.cells.i.length;
  const empty = createEmptyRiverIrrigationResults(count);
  if (!irrigationDevelopmentByCell?.length || !cropGoods.length) return empty;

  const network = compileRiverWaterNetwork({
    pack: world.pack,
    annualWaterPerFlux: IRRIGATION_ANNUAL_WATER_PER_FLUX
  });
  const demands: RiverWithdrawal[] = [];
  const commandAreaByCell = new Float32Array(count);
  const deficitByCell = new Float32Array(count);

  for (const cellId of world.pack.cells.i) {
    const development = clamp01(irrigationDevelopmentByCell[cellId] ?? 0);
    const area = cultivableArea[cellId] ?? 0;
    const intake = network.intakeByFieldCell[cellId];
    if (development <= 0 || area <= 0 || !intake) continue;

    const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
    const rainfall = world.grid.cells.prec?.[gridCellId] ?? 45;
    const target = getCropWaterTarget(world, cellId, cropGoods, rainfall);
    const deficit = Math.max(0, target - rainfall);
    const commandArea = area * development;
    if (deficit <= 0 || commandArea <= 0) continue;

    const efficiency = clamp(conveyanceEfficiencyByCell?.[cellId] ?? 0.35 + development * 0.5, 0.1, 0.95);
    const requestedDelivered = commandArea * deficit;
    demands.push({
      id: `irrigation:${cellId}`,
      intake,
      beneficiaryCellId: cellId,
      requestedWithdrawal: requestedDelivered / efficiency,
      maximumWithdrawal: requestedDelivered / efficiency,
      conveyanceEfficiency: efficiency,
      priority: 100
    });
    commandAreaByCell[cellId] = commandArea;
    deficitByCell[cellId] = deficit;
  }

  const allocation = allocateRiverWater(network, demands, {
    environmentalFlowReserve: RIVER_ENVIRONMENTAL_FLOW_RESERVE
  });
  const irrigatedAreaHa = new Float32Array(count);
  const irrigationSupplement = new Float32Array(count);
  const irrigationDeliveredWater = new Float32Array(count);
  const irrigationWaterStress = new Float32Array(count);
  for (const result of allocation.allocations) {
    const cellId = result.beneficiaryCellId;
    const deficit = deficitByCell[cellId] ?? 0;
    const commandArea = commandAreaByCell[cellId] ?? 0;
    if (deficit <= 0 || commandArea <= 0) continue;
    const delivered = Math.max(0, result.deliveredWater);
    const irrigatedArea = Math.min(commandArea, delivered / deficit);
    irrigatedAreaHa[cellId] = irrigatedArea;
    irrigationSupplement[cellId] = irrigatedArea > 0 ? delivered / irrigatedArea : 0;
    irrigationDeliveredWater[cellId] = delivered;
    irrigationWaterStress[cellId] = Math.max(
      0,
      Math.min(1, result.unmetWater / Math.max(result.requestedWithdrawal, 1e-6))
    );
  }

  return {
    irrigatedAreaHa,
    irrigationSupplement,
    irrigationDeliveredWater,
    irrigationWaterStress,
    residualFlowByCell: allocation.residualFlowByCell,
    allocation
  };
}

function createEmptyRiverIrrigationResults(count: number): RiverIrrigationResults {
  const allocation: RiverWaterAllocation = {
    status: "complete",
    allocations: [],
    residualFlowByCell: new Float32Array(count),
    withdrawnFlowByCell: new Float32Array(count),
    diagnostics: []
  };
  return {
    irrigatedAreaHa: new Float32Array(count),
    irrigationSupplement: new Float32Array(count),
    irrigationDeliveredWater: new Float32Array(count),
    irrigationWaterStress: new Float32Array(count),
    residualFlowByCell: allocation.residualFlowByCell,
    allocation
  };
}

function getCropWaterTarget(
  world: Readonly<WorldContext>,
  cellId: number,
  cropGoods: readonly Good[],
  rainfall: number
): number {
  const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
  const temperature = world.grid.cells.temp?.[gridCellId] ?? 12;
  const soil = getCellSoilType(world, cellId);
  const candidates = cropGoods
    .map(good => good.crop)
    .filter((crop): crop is NonNullable<Good["crop"]> => Boolean(crop))
    .filter(crop => getStapleCropSuitability(crop, temperature, crop.precipitation.idealMin, soil) > 0.1)
    .map(crop => crop.precipitation.idealMin)
    .filter(target => target > rainfall);
  return candidates.length ? Math.min(...candidates) : rainfall;
}

export function getCellSoilType(world: Readonly<WorldContext>, cellId: number): SoilType {
  const tags = world.biomesData.tags?.[world.pack.cells.biomeCode[cellId] ?? 0] ?? [];
  if (world.pack.cells.r?.[cellId]) return "alluvial";
  if (tags.includes("wetland")) return "clay";
  if (tags.includes("forest")) return "humus";
  if (tags.includes("desert")) return "sandy";
  if (tags.includes("mountain")) return "thin";
  return "loam";
}

/** Applies one annual crop cycle to the persistent soil columns, without mutating world data. */
export function advanceAgriculturalSoils(
  world: Readonly<WorldContext>,
  cropGoods: readonly Good[],
  currentFertility: Float32Array | undefined,
  currentSalinity: Float32Array | undefined,
  conditions: AgriculturalConditions = {}
): { soilFertility: Float32Array; irrigationSalinity: Float32Array } {
  const count = world.pack.cells.i.length;
  const soilFertility = new Float32Array(count);
  const irrigationSalinity = new Float32Array(count);

  for (const cellId of world.pack.cells.i) {
    const previousFertility = currentFertility?.[cellId] || 1;
    const previousSalinity = currentSalinity?.[cellId] || 0;
    const mix = getCropMix(world, cellId, cropGoods, conditions);
    const mainCropShare = mix
      .filter(entry => entry.good.crop?.kind !== "legume")
      .reduce((sum, entry) => sum + entry.share, 0);
    const legumeShare = mix
      .filter(entry => entry.good.crop?.kind === "legume")
      .reduce((sum, entry) => sum + entry.share, 0);
    // A main-crop / legume pair is the normal three-field rotation. Only a cell that cannot
    // sustain its companion legume is forced into continuous main-crop cultivation.
    const exhaustion = Math.max(0, mainCropShare - MAIN_CROP_SHARE_WITH_LEGUME) * 0.08;
    const fourCourseRotation = conditions.fourCourseRotationByCell?.[cellId] ?? 0;
    const restoration = legumeShare * 0.025 + fourCourseRotation * FOUR_COURSE_SOIL_RESTORATION_BONUS;
    soilFertility[cellId] = Math.max(
      MIN_SOIL_FERTILITY,
      Math.min(MAX_SOIL_FERTILITY, previousFertility - exhaustion + restoration)
    );

    const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
    const precipitation = world.grid?.cells.prec?.[gridCellId] ?? 45;
    const irrigationSupplement = conditions.irrigation?.irrigationSupplement[cellId] ?? 0;
    const irrigationShare = Math.min(
      1,
      (conditions.irrigation?.irrigatedAreaHa[cellId] ?? 0) /
        Math.max(calculateCultivableAreaHectares(world, cellId), 1e-6)
    );
    const drainage = clamp01(conditions.fieldDrainageByCell?.[cellId] ?? 0);
    const saltAccumulation =
      irrigationShare > 0
        ? 0.014 *
          irrigationShare *
          Math.min(1, irrigationSupplement / 20) *
          Math.max(0, 1 - precipitation / 20) *
          (1 - drainage * 0.75)
        : 0;
    const leaching = (precipitation >= 20 ? 0.05 : precipitation >= 10 ? 0.015 : 0) + drainage * 0.03;
    irrigationSalinity[cellId] = Math.max(0, Math.min(1, previousSalinity + saltAccumulation - leaching));
  }

  return { soilFertility, irrigationSalinity };
}

function calculateClimateYield(
  world: Readonly<WorldContext>,
  cellId: number,
  conditions: AgriculturalConditions = {},
  cultivableArea = calculateCultivableAreaHectares(world, cellId)
): number {
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
  const precipitationFactor = getPrecipitationFactor(precipitation);
  const irrigationSupplement = conditions.irrigation?.irrigationSupplement[cellId] ?? 0;
  const irrigatedShare = Math.min(
    1,
    (conditions.irrigation?.irrigatedAreaHa[cellId] ?? 0) / Math.max(cultivableArea, 1e-6)
  );
  const irrigatedPrecipitationFactor = getPrecipitationFactor(precipitation + irrigationSupplement);
  const areaWeightedPrecipitationFactor =
    precipitationFactor * (1 - irrigatedShare) + irrigatedPrecipitationFactor * irrigatedShare;
  const cropMix = conditions.cropGoods ? getCropMix(world, cellId, conditions.cropGoods, conditions) : [];
  const cropFactor = conditions.cropGoods
    ? cropMix.length
      ? cropMix.reduce(
          (sum, entry) => sum + entry.share * entry.suitability * (entry.good.crop?.yieldMultiplier ?? 1),
          0
        )
      : 0
    : 1;
  const fertility = conditions.soilFertilityByCell?.[cellId] ?? 1;
  const salinity = conditions.irrigationSalinityByCell?.[cellId] ?? 0;
  const soilFertilityFactor = Math.max(0.7, 1 - (1 - fertility) * 0.5);
  const salinityFactor = Math.max(0.35, 1 - salinity * 0.65);
  return Math.max(
    0,
    temperatureFactor * areaWeightedPrecipitationFactor * cropFactor * soilFertilityFactor * salinityFactor
  );
}

function getPrecipitationFactor(precipitation: number): number {
  if (precipitation < 8) return 0;
  if (precipitation < 20) return 0.4 + ((precipitation - 8) / 12) * 0.35;
  if (precipitation < 60) return 0.75 + ((precipitation - 20) / 40) * 0.25;
  return 1;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
