import { harvestForestStock } from "../../../generators/forestStock";
import type { WorldContext } from "../../hostCore";
import { type CultureType, DEFAULT_CULTURE_TYPE } from "../../hostTypes";
import { GROSS_FOOD_NEED } from "./foodConstants";
import type { Good, SoilType } from "./goods-generator";

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
 * Standard maps reserve fields for the burg population in the same cell as well as rural
 * residents. Megacity mode alone relaxes this local self-sufficiency rule so Food Ledger imports
 * can sustain a city whose own cell has no Grain production.
 */
export interface AgriculturalDemandOptions {
  readonly includeUrbanFoodDemand?: boolean;
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

    const climateYield = calculateClimateYield(world, cellId, conditions);
    relativeYield[cellId] = climateYield;
  }

  for (const cellId of cells.i) {
    const area = cultivableArea[cellId];
    if (area <= 0) continue;

    const effectiveAgTech = getEffectiveAgTech(world, cellId, agTechStockByCell);
    const stateProductivity = stateProductivityByCell?.[cellId] ?? 0;

    const yieldKgPerHa = calculateYieldKgPerHectare(
      world,
      cellId,
      effectiveAgTech,
      stateProductivity,
      relativeYield[cellId],
      conditions
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
    const yieldKgPerHa = calculateYieldKgPerHectare(
      world,
      cellId,
      effectiveAgTech,
      stateProductivity,
      undefined,
      conditions
    );
    const residentPeople = getCellFoodDemandPeople(
      world,
      cellId,
      populationRate,
      demandOptions.includeUrbanFoodDemand !== false
    );
    // Keep the same ten-percent reserve represented by calculateAgriculturalLandProfile.
    const targetCultivatedArea = Math.min(
      constraints.terrainAndBiomeCeiling,
      requiredFieldAreaHectares(residentPeople, yieldKgPerHa) * 1.1
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
  climateYield: number | undefined = undefined,
  conditions: AgriculturalConditions = {}
): number {
  const effectiveClimateYield = climateYield ?? calculateClimateYield(world, cellId, conditions);
  return (
    BASE_NET_YIELD_KG_PER_SOWN_HECTARE *
    effectiveClimateYield *
    (1 + AGTECH_YIELD_BONUS_MAX * effectiveAgTech) *
    (1 + STATE_YIELD_BONUS_MAX * stateProductivity)
  );
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
 * environment permits both. The culture type only ranks viable candidates; it never makes a
 * climate-incompatible crop grow. Shares are a representation of the rotation plan, not a claim
 * that every field contains both crops in the same season.
 */
export function getCropMix(
  world: Readonly<WorldContext>,
  cellId: number,
  cropGoods: readonly Good[]
): readonly CropMixEntry[] {
  const candidates = cropGoods
    .filter(good => good.crop)
    .map(good => ({ good, suitability: getCropSuitability(world, cellId, good) }))
    .filter(candidate => candidate.suitability > 0.1);
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
export function getCropSuitability(world: Readonly<WorldContext>, cellId: number, good: Good): number {
  const crop = good.crop;
  if (!crop) return 0;
  const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
  const temperature = world.grid?.cells.temp?.[gridCellId] ?? 12;
  const precipitation = world.grid?.cells.prec?.[gridCellId] ?? 45;
  const soil = getCellSoilType(world, cellId);
  const soilFactor = crop.soils.includes(soil) ? 1 : 0.55;
  return (
    rangeSuitability(temperature, crop.temperature) * rangeSuitability(precipitation, crop.precipitation) * soilFactor
  );
}

export function getCellSoilType(world: Readonly<WorldContext>, cellId: number): SoilType {
  const tags = world.biomesData.tags?.[world.pack.cells.biomeCode[cellId] ?? 0] ?? [];
  if (world.pack.cells.r[cellId]) return "alluvial";
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
  currentSalinity: Float32Array | undefined
): { soilFertility: Float32Array; irrigationSalinity: Float32Array } {
  const count = world.pack.cells.i.length;
  const soilFertility = new Float32Array(count);
  const irrigationSalinity = new Float32Array(count);

  for (const cellId of world.pack.cells.i) {
    const previousFertility = currentFertility?.[cellId] || 1;
    const previousSalinity = currentSalinity?.[cellId] || 0;
    const mix = getCropMix(world, cellId, cropGoods);
    const mainCropShare = mix
      .filter(entry => entry.good.crop?.kind !== "legume")
      .reduce((sum, entry) => sum + entry.share, 0);
    const legumeShare = mix
      .filter(entry => entry.good.crop?.kind === "legume")
      .reduce((sum, entry) => sum + entry.share, 0);
    // A main-crop / legume pair is the normal three-field rotation. Only a cell that cannot
    // sustain its companion legume is forced into continuous main-crop cultivation.
    const exhaustion = Math.max(0, mainCropShare - MAIN_CROP_SHARE_WITH_LEGUME) * 0.08;
    const restoration = legumeShare * 0.025;
    soilFertility[cellId] = Math.max(
      MIN_SOIL_FERTILITY,
      Math.min(MAX_SOIL_FERTILITY, previousFertility - exhaustion + restoration)
    );

    const gridCellId = world.pack.cells.g?.[cellId] ?? cellId;
    const precipitation = world.grid?.cells.prec?.[gridCellId] ?? 45;
    const tags = world.biomesData.tags?.[world.pack.cells.biomeCode[cellId] ?? 0] ?? [];
    const irrigatedDesert = tags.includes("desert") && Boolean(world.pack.cells.r[cellId]);
    const saltAccumulation = irrigatedDesert ? 0.014 * Math.max(0, 1 - precipitation / 20) : 0;
    const leaching = precipitation >= 20 ? 0.05 : precipitation >= 10 ? 0.015 : 0;
    irrigationSalinity[cellId] = Math.max(0, Math.min(1, previousSalinity + saltAccumulation - leaching));
  }

  return { soilFertility, irrigationSalinity };
}

function calculateClimateYield(
  world: Readonly<WorldContext>,
  cellId: number,
  conditions: AgriculturalConditions = {}
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
  const precipitationFactor =
    precipitation < 8
      ? 0
      : precipitation < 20
        ? 0.4 + ((precipitation - 8) / 12) * 0.35
        : precipitation < 60
          ? 0.75 + ((precipitation - 20) / 40) * 0.25
          : 1;
  const cropMix = conditions.cropGoods ? getCropMix(world, cellId, conditions.cropGoods) : [];
  const cropFactor = cropMix.length
    ? cropMix.reduce((sum, entry) => sum + entry.share * entry.suitability * (entry.good.crop?.yieldMultiplier ?? 1), 0)
    : 1;
  const fertility = conditions.soilFertilityByCell?.[cellId] ?? 1;
  const salinity = conditions.irrigationSalinityByCell?.[cellId] ?? 0;
  const soilFertilityFactor = Math.max(0.7, 1 - (1 - fertility) * 0.5);
  const salinityFactor = Math.max(0.35, 1 - salinity * 0.65);
  const waterAccess = world.pack.cells.r[cellId] ? 1.08 : 1;
  return Math.max(
    0,
    temperatureFactor * precipitationFactor * cropFactor * soilFertilityFactor * salinityFactor * waterAccess
  );
}

function rangeSuitability(
  value: number,
  range: { min: number; idealMin: number; idealMax: number; max: number }
): number {
  if (value <= range.min || value >= range.max) return 0;
  if (value >= range.idealMin && value <= range.idealMax) return 1;
  if (value < range.idealMin) return (value - range.min) / (range.idealMin - range.min);
  return (range.max - value) / (range.max - range.idealMax);
}
