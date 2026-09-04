import { getBurgDemographics, useOptionsState } from "../../hostCore";
import type { CultureType } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import {
  getConstructionNamedSeats,
  getConstructionOperations,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getQuarryOperations,
  getWorldContext,
  setConstructionOperations
} from "../economyContext";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";
import type { ConstructionOperation, LegacyConstructionOperation } from "./constructionEmploymentTypes";
import { pointsToPeople } from "./craftScale";
import { isGoodEnabled } from "./goods-generator";
import { getHousingRecipe, getMasonMaterialShare, type HousingRecipe } from "./housingRecipes";
import { Markets } from "./markets-generator";

export type { ConstructionOperation, LegacyConstructionOperation } from "./constructionEmploymentTypes";
export {
  BASE_HOUSING_RECIPE_BY_CULTURE,
  getHousingRecipe,
  getMasonMaterialShare,
  type HousingRecipe
} from "./housingRecipes";

/** Adult headcount at which `getTargetBuildingStock()` reaches ~63% of full saturation. */
const POPULATION_SCALE_ADULTS = 400;
/** Base headcount a Burg's construction operation needs even with no backlog (upkeep). */
const CONSTRUCTION_WORKERS_BASE = 1;
/** Share of a Burg's adults that become construction workers at maximum backlog (1.0). */
const WORKERS_SHARE_PER_BACKLOG = 0.05;
/** How much of the annual material need may be drawn from local market stock per month. */
const MATERIAL_STOCK_SHARE = 0.3;
const STONE_PER_MASON_WORKER_ANNUAL = 8;
const WOOD_PER_CARPENTER_WORKER_ANNUAL = 10;
/**
 * Roman Concrete is a direct Stone substitute (efficiency 2×), not brick.
 * See docs/plan/urban-construction-industry.md §7.1 decision 3.
 */
const ROMAN_CONCRETE_STONE_EFFICIENCY = 2;
/** Share of the remaining housing gap a fully-staffed, fully-supplied operation closes in one year. */
export const BASE_ANNUAL_STOCK_GROWTH = 0.25;
/**
 * Floor on the housing-scaled `effectiveCapacity` band: undeveloped towns still reach half
 * of food-derived capacity.
 */
const MIN_CAPACITY_SHARE = 0.5;
/**
 * Ceiling share when `buildingStock` is 1. Above 1 so housing can keep import-boosted
 * `effectiveCapacity` instead of clipping it back to generation-time `capacity`.
 * docs/plan/economy-coupling-audit.md L4.
 */
export const MAX_CONSTRUCTION_CAPACITY_SHARE = 1.3;

/** Urban household size for dwelling derivation (docs/analytics/population.md; K18). */
export const HOUSEHOLD_SIZE_URBAN = 4.5;
/**
 * When seeding `dwellingStock` from legacy `buildingStock`, allow slight overshoot relative to
 * current required (migration only — produceMonth still caps at required).
 */
const SEED_OVERBUILD_CAP = 1.2;

/**
 * Population-driven size target for employment backlog scaling (K16).
 * Kept for Phase 2 calibration; does not cap Δdwellings growth (K14).
 */
export function getTargetBuildingStock(adults: number): number {
  return 1 - Math.exp(-Math.max(0, adults) / POPULATION_SCALE_ADULTS);
}

export interface MasonShareContext {
  cultureType?: CultureType | string;
  highFantasy?: boolean;
  /** Defaults false in pure unit tests; live paths pass `isBrickGoodAvailable()`. */
  brickAvailable?: boolean;
}

/**
 * Mason share from culture recipe + terrain gates (K17).
 * No quarry + no brick → 0 (all wood). No quarry + brick → masons allowed for brick cultures.
 */
export function getMasonShare(hasQuarryAccess: boolean, context: MasonShareContext = {}): number {
  const recipe = getHousingRecipe({
    cultureType: context.cultureType,
    hasQuarryAccess,
    highFantasy: context.highFantasy ?? useOptionsState.getState().culturesSet === "highFantasy",
    brickAvailable: context.brickAvailable ?? false
  });
  return getMasonMaterialShare(recipe);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** people = populationPoints × populationRate (K18 — no urbanization factor). */
export function getUrbanPeople(populationPoints: number, populationRate: number): number {
  return Math.max(0, populationPoints) * Math.max(0, populationRate);
}

export function getHouseholds(populationPoints: number, populationRate: number): number {
  return getUrbanPeople(populationPoints, populationRate) / HOUSEHOLD_SIZE_URBAN;
}

/**
 * Required permanent dwellings for a residential market burg.
 * Ops never exist for forts; for all existing ops required ≥ 1.
 */
export function getRequiredDwellings(populationPoints: number, populationRate: number): number {
  return Math.max(1, Math.ceil(getHouseholds(populationPoints, populationRate)));
}

/**
 * Housing gap ∈ [0, 1]. Equals `max(0, 1 - buildingStock)` only after normalize/write-through.
 */
export function getHousingBacklog(dwellingStock: number, requiredDwellings: number): number {
  const required = Math.max(1, requiredDwellings);
  return Math.max(0, 1 - Math.max(0, dwellingStock) / required);
}

/**
 * Size-aware employment backlog (K16): housing gap × soft adult size target.
 * Empty towns match Phase 2 worker demand; partial housing still increases pressure.
 */
export function getEffectiveConstructionBacklog(
  dwellingStock: number,
  requiredDwellings: number,
  adults: number
): number {
  return getHousingBacklog(dwellingStock, requiredDwellings) * getTargetBuildingStock(adults);
}

/**
 * Write-through + archive seed (K13 / K15). Mutates `op` in place and returns it typed as
 * post-normalize `ConstructionOperation`.
 */
export function normalizeConstructionOperation(
  op: ConstructionOperation | LegacyConstructionOperation,
  burg: { population?: number },
  populationRate: number
): ConstructionOperation {
  const required = getRequiredDwellings(burg.population ?? 0, populationRate);
  if (op.dwellingStock == null || Number.isNaN(op.dwellingStock as number)) {
    const sat = clamp01(op.buildingStock ?? 0);
    op.dwellingStock = Math.min(required * SEED_OVERBUILD_CAP, Math.max(0, sat * required));
  }
  op.dwellingStock = Math.max(0, op.dwellingStock as number);
  op.buildingStock = clamp01(op.dwellingStock / required);
  return op as ConstructionOperation;
}

/** Size-aware effective backlog shared by the points (materials) and people (Employment) formulas below. */
function computeEffectiveBacklog(
  operation: Pick<ConstructionOperation, "buildingStock"> & {
    dwellingStock?: number;
    requiredDwellings?: number;
  },
  adults: number
): number {
  let housingBacklog: number;
  if (operation.dwellingStock != null && operation.requiredDwellings != null) {
    housingBacklog = getHousingBacklog(operation.dwellingStock, operation.requiredDwellings);
  } else {
    // After write-through: housingBacklog ≡ max(0, 1 - buildingStock).
    housingBacklog = Math.max(0, 1 - clamp01(operation.buildingStock));
  }
  return housingBacklog * getTargetBuildingStock(adults);
}

/**
 * Headcount needed to close this year's size-aware housing backlog, split masons/carpenters.
 * `masonShareContext` drives culture brick/stone recipe (K17); omit for Generic-without-brick tests.
 */
export function getConstructionRequiredWorkers(
  operation: Pick<ConstructionOperation, "buildingStock" | "hasQuarryAccess"> & {
    dwellingStock?: number;
    requiredDwellings?: number;
  },
  adults: number,
  masonShareContext: MasonShareContext = {}
): { mason: number; carpenter: number } {
  const effectiveBacklog = computeEffectiveBacklog(operation, adults);
  const totalRequired = CONSTRUCTION_WORKERS_BASE + effectiveBacklog * adults * WORKERS_SHARE_PER_BACKLOG;
  const masonShare = getMasonShare(operation.hasQuarryAccess, masonShareContext);
  return { mason: rn(totalRequired * masonShare, 2), carpenter: rn(totalRequired * (1 - masonShare), 2) };
}

/**
 * Real-people construction hire-board / labor-factor-gate demand, authored independently of
 * getConstructionRequiredWorkers() (docs/plan/craft-demand-calibration.md §2.2, Key Decision 11).
 * Materials (masonLoad/woodNeed) stay on the unchanged points formula at every settlement size —
 * only Employment, hire-board postings, and named seats move to this real-people figure.
 */
export const CONSTRUCTION_EMPLOYMENT_BASE_PEOPLE = 8;

export function getConstructionRequiredPeople(
  operation: Pick<ConstructionOperation, "buildingStock" | "hasQuarryAccess"> & {
    dwellingStock?: number;
    requiredDwellings?: number;
  },
  adults: number,
  populationRate: number,
  masonShareContext: MasonShareContext = {}
): { mason: number; carpenter: number } {
  const effectiveBacklog = computeEffectiveBacklog(operation, adults);
  const totalPeople =
    CONSTRUCTION_EMPLOYMENT_BASE_PEOPLE +
    pointsToPeople(effectiveBacklog * adults * WORKERS_SHARE_PER_BACKLOG, populationRate);
  const masonShare = getMasonShare(operation.hasQuarryAccess, masonShareContext);
  return { mason: rn(totalPeople * masonShare, 2), carpenter: rn(totalPeople * (1 - masonShare), 2) };
}

/**
 * Dynamic stand-in for the static cosmetic `burg.shanty` flag: underdeveloped burgs produce at a
 * reduced local-bonus rate. Undefined operation → no penalty (pre-system / disabled economy).
 * Stays in [0.5, 1.0]: full housing is "no penalty", not a production bonus.
 */
export function getConstructionProductivityMultiplier(
  operation: Pick<ConstructionOperation, "buildingStock"> | undefined
): number {
  if (!operation) return 1;
  return MIN_CAPACITY_SHARE + (1 - MIN_CAPACITY_SHARE) * clamp01(operation.buildingStock);
}

/**
 * Housing band on `effectiveCapacity`. [0.5, 1.3] so a fully built town can hold import
 * headroom above food-derived `capacity`, while an undeveloped town is still floored at half.
 */
export function getConstructionCapacityMultiplier(
  operation: Pick<ConstructionOperation, "buildingStock"> | undefined
): number {
  if (!operation) return 1;
  return MIN_CAPACITY_SHARE + (MAX_CONSTRUCTION_CAPACITY_SHARE - MIN_CAPACITY_SHARE) * clamp01(operation.buildingStock);
}

/**
 * Estimate dwellings currently under construction (pipeline, not a stored stock).
 *
 * Model: at full labor coverage, annual completions ≈ gap × BASE_ANNUAL_STOCK_GROWTH (25%).
 * Treat one year of that throughput as concurrent new-build volume (medieval house cycle
 * roughly months–year). Material shortages are not folded in here — UI tip notes the estimate
 * is labor-limited; materials can only slow further.
 */
/** Named hire seats (Phase 3) counted without importing constructionHire (madge cycle). */
function countNamedConstructionSeats(burgId: number): { mason: number; carpenter: number } {
  let mason = 0;
  let carpenter = 0;
  for (const seat of getConstructionNamedSeats()) {
    if (seat.burgId !== burgId) continue;
    if (seat.role === "mason") mason += 1;
    else carpenter += 1;
  }
  return { mason, carpenter };
}

export function estimateDwellingsUnderConstruction(args: {
  dwellingStock: number;
  requiredDwellings: number;
  masonWorkers: number;
  carpenterWorkers: number;
  requiredMason: number;
  requiredCarpenter: number;
}): number {
  const gap = Math.max(0, args.requiredDwellings - Math.max(0, args.dwellingStock));
  if (gap <= 0) return 0;
  const needLabor = Math.max(0, args.requiredMason) + Math.max(0, args.requiredCarpenter);
  const haveLabor = Math.max(0, args.masonWorkers) + Math.max(0, args.carpenterWorkers);
  // Upkeep-only ops (needLabor ≈ base headcount) still produce some throughput when staffed.
  const laborFactor = needLabor > 0 ? Math.min(1, haveLabor / needLabor) : haveLabor > 0 ? 1 : 0;
  return Math.max(0, rn(gap * BASE_ANNUAL_STOCK_GROWTH * laborFactor, 1));
}

/** Debug/summary snapshot of housing ledger for a construction op + burg. */
export function getHousingLedgerSnapshot(
  operation: ConstructionOperation | LegacyConstructionOperation | undefined,
  burg:
    | {
        population?: number;
        culture?: number;
        type?: CultureType | string;
        demographics?: { maleAdults?: number; femaleAdults?: number };
      }
    | undefined,
  populationRate: number
): {
  dwellingStock: number;
  requiredDwellings: number;
  households: number;
  housingBacklog: number;
  buildingStock: number;
  /** Estimated new dwellings in the construction pipeline (labor-limited). */
  underConstruction: number;
  /** Assigned mason + carpenter headcount (population points). */
  constructionWorkers: number;
} | null {
  if (!operation || !burg) return null;
  const normalized = normalizeConstructionOperation({ ...operation }, burg, populationRate);
  const required = getRequiredDwellings(burg.population ?? 0, populationRate);
  const adults = Math.max(0, (burg.demographics?.maleAdults ?? 0) + (burg.demographics?.femaleAdults ?? 0));
  const workersNeeded = getConstructionRequiredWorkers({ ...normalized, requiredDwellings: required }, adults, {
    cultureType: resolveBurgCultureType(burg),
    highFantasy: useOptionsState.getState().culturesSet === "highFantasy",
    brickAvailable: isBrickGoodAvailable()
  });
  const named = countNamedConstructionSeats(normalized.burgId);
  const effectiveMason = normalized.masonWorkers + named.mason;
  const effectiveCarpenter = normalized.carpenterWorkers + named.carpenter;
  const underConstruction = estimateDwellingsUnderConstruction({
    dwellingStock: normalized.dwellingStock,
    requiredDwellings: required,
    masonWorkers: effectiveMason,
    carpenterWorkers: effectiveCarpenter,
    requiredMason: workersNeeded.mason,
    requiredCarpenter: workersNeeded.carpenter
  });
  return {
    dwellingStock: rn(normalized.dwellingStock, 2),
    requiredDwellings: required,
    households: rn(getHouseholds(burg.population ?? 0, populationRate), 2),
    housingBacklog: rn(getHousingBacklog(normalized.dwellingStock, required), 4),
    buildingStock: rn(normalized.buildingStock, 4),
    underConstruction,
    constructionWorkers: rn(effectiveMason + effectiveCarpenter, 1)
  };
}

export function isBrickGoodAvailable(): boolean {
  const brick = getGoods().find(good => good.name.toLowerCase() === "brick");
  return Boolean(brick && isGoodEnabled(brick));
}

export function resolveBurgCultureType(burg: {
  culture?: number;
  type?: CultureType | string;
}): CultureType | string | undefined {
  const pack = getWorldContext().pack;
  const cultureId = burg.culture;
  if (cultureId != null && pack.cultures?.[cultureId]?.type) {
    return pack.cultures[cultureId].type as CultureType;
  }
  return burg.type;
}

export function getHousingRecipeForBurg(
  burg: { culture?: number; type?: CultureType | string },
  hasQuarryAccess: boolean
): HousingRecipe {
  return getHousingRecipe({
    cultureType: resolveBurgCultureType(burg),
    hasQuarryAccess,
    highFantasy: useOptionsState.getState().culturesSet === "highFantasy",
    brickAvailable: isBrickGoodAvailable()
  });
}

function getAdults(burg: Parameters<typeof getBurgDemographics>[0]): number {
  const demographics = getBurgDemographics(burg);
  return Math.max(0, demographics.maleAdults + demographics.femaleAdults);
}

function getPopulationRate(): number {
  return Math.max(0, getWorldContext().populationRate ?? 0) || 1;
}

function consumeMaterialMonthly(
  marketId: number,
  good: { i: number; name: string } | undefined,
  annualNeed: number
): number {
  if (!good || annualNeed <= 0 || !isGoodEnabled(good)) return 0;
  return Markets.consumeForConstruction(marketId, good.i, annualNeed / 12, MATERIAL_STOCK_SHARE);
}

/**
 * Burg-anchored construction / housing industry: every non-fort market burg gets an operation.
 */
export class ConstructionOperationsModule {
  generate(): void {
    const { pack } = getWorldContext();
    const populationRate = getPopulationRate();
    const marketColumn = getMarketCellColumn();
    const marketById = new Set(getMarkets().map(market => market.i));
    const previousByBurg = new Map(
      getConstructionOperations().map(operation => [operation.burgId, operation as LegacyConstructionOperation])
    );
    const quarryAccessByBurg = new Set(
      getQuarryOperations()
        .filter(quarry => quarry.stoneRatio > 0)
        .map(quarry => quarry.burgId)
    );

    const operations: ConstructionOperation[] = [];
    for (const burg of pack.burgs ?? []) {
      if (!burg.i || burg.removed) continue;
      // K8: forts are garrisons, not residential towns — no ConstructionOperation.
      if (burg.group === "fort") continue;
      const marketId = marketColumn[burg.cell] || burg.market || 0;
      if (!marketId || !marketById.has(marketId)) continue;

      const previous = previousByBurg.get(burg.i);
      const draft: LegacyConstructionOperation = {
        i: operations.length + 1,
        burgId: burg.i,
        marketId,
        masonWorkers: previous?.masonWorkers ?? 0,
        carpenterWorkers: previous?.carpenterWorkers ?? 0,
        buildingStock: previous?.buildingStock ?? 0,
        dwellingStock: previous?.dwellingStock,
        hasQuarryAccess: quarryAccessByBurg.has(burg.i),
        active: true,
        civicStock: previous?.civicStock
      };
      operations.push(normalizeConstructionOperation(draft, burg, populationRate));
    }

    setConstructionOperations(operations);
  }

  clear(): void {
    setConstructionOperations([]);
  }

  /**
   * Settles one Economy production month: consumes Stone/Brick/Wood by culture recipe,
   * advances `dwellingStock`, write-through `buildingStock` (K13/K14/K17).
   */
  produceMonth(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const stoneGood = goodsByName.get("stone");
    const woodGood = goodsByName.get("wood");
    const brickGood = goodsByName.get("brick");
    const concreteGood = goodsByName.get("roman concrete");
    const burgs = getWorldContext().pack.burgs;
    const populationRate = getPopulationRate();
    const brickAvailable = isBrickGoodAvailable();
    const highFantasy = useOptionsState.getState().culturesSet === "highFantasy";

    for (const raw of getConstructionOperations()) {
      if (!raw.active) continue;
      const burg = burgs[raw.burgId];
      if (!burg || burg.removed) continue;
      if (burg.group === "fort") continue;

      const operation = normalizeConstructionOperation(raw, burg, populationRate);
      const requiredDwellings = getRequiredDwellings(burg.population ?? 0, populationRate);
      // Re-assert write-through after population may have changed since last month.
      operation.buildingStock = clamp01(operation.dwellingStock / requiredDwellings);

      const recipe = getHousingRecipe({
        cultureType: resolveBurgCultureType(burg),
        hasQuarryAccess: operation.hasQuarryAccess,
        highFantasy,
        brickAvailable
      });
      const masonShare = getMasonMaterialShare(recipe);
      const adults = getAdults(burg);
      const required = getConstructionRequiredWorkers({ ...operation, requiredDwellings }, adults, {
        cultureType: resolveBurgCultureType(burg),
        highFantasy,
        brickAvailable
      });
      // Named hire-board seats count toward labor coverage (Phase 3).
      const namedSeats = countNamedConstructionSeats(operation.burgId);
      let masonFactor: number;
      let carpenterFactor: number;
      if (getEconomyCalibrationState().applyCalibration) {
        // Key Decision 11: the labor-factor gate uses real-people assigned/required, decoupled from
        // the unchanged points-denominated material formula above (masonLoad/woodNeed keep
        // required.mason/carpenter — the points figure — regardless of this branch).
        const requiredPeople = getConstructionRequiredPeople(
          { ...operation, requiredDwellings },
          adults,
          populationRate,
          {
            cultureType: resolveBurgCultureType(burg),
            highFantasy,
            brickAvailable
          }
        );
        const assignedMasonPeople = pointsToPeople(operation.masonWorkers, populationRate) + namedSeats.mason;
        const assignedCarpenterPeople =
          pointsToPeople(operation.carpenterWorkers, populationRate) + namedSeats.carpenter;
        masonFactor = requiredPeople.mason > 0 ? Math.min(1, assignedMasonPeople / requiredPeople.mason) : 1;
        carpenterFactor =
          requiredPeople.carpenter > 0 ? Math.min(1, assignedCarpenterPeople / requiredPeople.carpenter) : 1;
      } else {
        const masonHeadcount = operation.masonWorkers + namedSeats.mason;
        const carpenterHeadcount = operation.carpenterWorkers + namedSeats.carpenter;
        masonFactor = required.mason > 0 ? Math.min(1, masonHeadcount / required.mason) : 1;
        carpenterFactor = required.carpenter > 0 ? Math.min(1, carpenterHeadcount / required.carpenter) : 1;
      }

      const masonLoad = required.mason * STONE_PER_MASON_WORKER_ANNUAL;
      const masonMaterial = recipe.stone + recipe.brick;
      const stoneFrac = masonMaterial > 0 ? recipe.stone / masonMaterial : 0;
      const brickFrac = masonMaterial > 0 ? recipe.brick / masonMaterial : 0;
      const stoneNeedAnnual = masonLoad * stoneFrac;
      const brickNeedAnnual = masonLoad * brickFrac;

      // Stone portion: Roman Concrete substitutes stone only (not brick), then Stone.
      let stoneCoveredAnnual = 0;
      if (stoneNeedAnnual > 0) {
        if (concreteGood && isGoodEnabled(concreteGood)) {
          const concreteNeededMonthly = (stoneNeedAnnual - stoneCoveredAnnual) / ROMAN_CONCRETE_STONE_EFFICIENCY / 12;
          const concreteConsumedMonthly = Markets.consumeForConstruction(
            operation.marketId,
            concreteGood.i,
            concreteNeededMonthly,
            MATERIAL_STOCK_SHARE
          );
          stoneCoveredAnnual += concreteConsumedMonthly * ROMAN_CONCRETE_STONE_EFFICIENCY * 12;
        }
        if (stoneCoveredAnnual < stoneNeedAnnual) {
          stoneCoveredAnnual +=
            consumeMaterialMonthly(operation.marketId, stoneGood, stoneNeedAnnual - stoneCoveredAnnual) * 12;
        }
      }
      const stoneFactor = stoneNeedAnnual > 0 ? Math.min(1, stoneCoveredAnnual / stoneNeedAnnual) : 1;

      let brickCoveredAnnual = 0;
      if (brickNeedAnnual > 0) {
        brickCoveredAnnual = consumeMaterialMonthly(operation.marketId, brickGood, brickNeedAnnual) * 12;
      }
      const brickFactor = brickNeedAnnual > 0 ? Math.min(1, brickCoveredAnnual / brickNeedAnnual) : 1;

      // Mason material factor: weighted by stone/brick fracs when both apply.
      let masonMaterialFactor = 1;
      if (masonMaterial > 0 && required.mason > 0) {
        masonMaterialFactor = stoneFrac * stoneFactor + brickFrac * brickFactor;
      }

      let woodFactor = 1;
      if (woodGood && isGoodEnabled(woodGood) && required.carpenter > 0) {
        const woodNeededAnnual = required.carpenter * WOOD_PER_CARPENTER_WORKER_ANNUAL;
        // Brick firing wood is paid when Brick is manufactured (recipe), not double-charged here.
        // Shipbuilding competes indirectly via shared market stock.
        const consumed = Markets.consumeForConstruction(
          operation.marketId,
          woodGood.i,
          woodNeededAnnual / 12,
          MATERIAL_STOCK_SHARE
        );
        woodFactor = woodNeededAnnual > 0 ? Math.min(1, (consumed * 12) / woodNeededAnnual) : 1;
      }

      const laborFactor = masonShare * masonFactor + (1 - masonShare) * carpenterFactor;
      const materialFactor = masonShare * masonMaterialFactor + (1 - masonShare) * woodFactor;
      const progressFactor = Math.min(laborFactor, materialFactor);

      // K14: growth uses full housingBacklog, not employment's size-aware effectiveBacklog.
      const housingBacklog = getHousingBacklog(operation.dwellingStock, requiredDwellings);
      const deltaDwellings = (requiredDwellings * housingBacklog * BASE_ANNUAL_STOCK_GROWTH * progressFactor) / 12;
      operation.dwellingStock = Math.min(requiredDwellings, rn(operation.dwellingStock + deltaDwellings, 4));
      operation.buildingStock = clamp01(operation.dwellingStock / requiredDwellings);
    }
  }

  /**
   * Housing band on `effectiveCapacity` from write-through `buildingStock`.
   * Independent layer on top of foodImportNetwork's quarterly import capacity:
   * clamps into [0.5, housingMultiplier] × food-derived `capacity` so housing
   * can keep import headroom instead of only shrinking the town.
   */
  constrainEffectiveCapacity(): void {
    const burgs = getWorldContext().pack.burgs;
    const populationRate = getPopulationRate();
    for (const raw of getConstructionOperations()) {
      const burg = burgs[raw.burgId];
      if (!burg?.demographics) continue;
      const operation = normalizeConstructionOperation(raw, burg, populationRate);
      const base = burg.demographics.capacity;
      const multiplier = getConstructionCapacityMultiplier(operation);
      const floor = base * MIN_CAPACITY_SHARE;
      const ceiling = base * multiplier;
      const current = burg.demographics.effectiveCapacity ?? base;
      burg.demographics.effectiveCapacity = minmax(current, floor, ceiling);
    }
  }
}

export const ConstructionOperations = new ConstructionOperationsModule();
