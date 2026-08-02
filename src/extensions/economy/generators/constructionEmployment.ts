import { getBurgDemographics, useOptionsState } from "../../hostCore";
import { rn } from "../../hostUtils";
import {
  getConstructionOperations,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getQuarryOperations,
  getWorldContext,
  setConstructionOperations
} from "../economyContext";
import type { ConstructionOperation, LegacyConstructionOperation } from "./constructionEmploymentTypes";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

export type { ConstructionOperation, LegacyConstructionOperation } from "./constructionEmploymentTypes";

/** Adult headcount at which `getTargetBuildingStock()` reaches ~63% of full saturation. */
const POPULATION_SCALE_ADULTS = 400;
/** Base headcount a Burg's construction operation needs even with no backlog (upkeep). */
const CONSTRUCTION_WORKERS_BASE = 1;
/** Share of a Burg's adults that become construction workers at maximum backlog (1.0). */
const WORKERS_SHARE_PER_BACKLOG = 0.05;
/** Default mason/carpenter split for a Burg with quarry access, absent any culture bonus. */
const BASE_MASON_SHARE = 0.4;
/** §7.1 decision 5: High Fantasy cultures set raises mason share when quarry exists. */
const HIGH_FANTASY_MASON_SHARE_BONUS = 0.2;
const MAX_MASON_SHARE = 0.8;
/** How much of the annual material need may be drawn from local market stock per month. */
const MATERIAL_STOCK_SHARE = 0.3;
const STONE_PER_MASON_WORKER_ANNUAL = 8;
const WOOD_PER_CARPENTER_WORKER_ANNUAL = 10;
/**
 * Roman Concrete is a direct Stone substitute (efficiency 2×).
 * See docs/plan/urban-construction-industry.md §7.1 decision 3.
 */
const ROMAN_CONCRETE_STONE_EFFICIENCY = 2;
/** Share of the remaining housing gap a fully-staffed, fully-supplied operation closes in one year. */
const BASE_ANNUAL_STOCK_GROWTH = 0.25;
/**
 * Floor on the annual `effectiveCapacity` ceiling: undeveloped towns still reach half capacity.
 */
const MIN_CAPACITY_SHARE = 0.5;

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

/**
 * §7.1 decision 5 (still in force for PR-H1 materials path): no quarry → all wood.
 * Culture brick recipes without quarry are PR-M.
 */
export function getMasonShare(hasQuarryAccess: boolean): number {
  if (!hasQuarryAccess) return 0;
  const bonus = useOptionsState.getState().culturesSet === "highFantasy" ? HIGH_FANTASY_MASON_SHARE_BONUS : 0;
  return Math.min(MAX_MASON_SHARE, BASE_MASON_SHARE + bonus);
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

/**
 * Headcount needed to close this year's size-aware housing backlog, split masons/carpenters.
 * Caller should pass a normalized op (or one with consistent dwellingStock + buildingStock).
 * When only `buildingStock` is known (already write-through), dwellings are inferred as
 * `buildingStock * requiredDwellings` if `requiredDwellings` is provided; otherwise backlog is
 * derived solely from write-through sat (`max(0, 1 - buildingStock)`).
 */
export function getConstructionRequiredWorkers(
  operation: Pick<ConstructionOperation, "buildingStock" | "hasQuarryAccess"> & {
    dwellingStock?: number;
    requiredDwellings?: number;
  },
  adults: number
): { mason: number; carpenter: number } {
  let housingBacklog: number;
  if (operation.dwellingStock != null && operation.requiredDwellings != null) {
    housingBacklog = getHousingBacklog(operation.dwellingStock, operation.requiredDwellings);
  } else {
    // After write-through: housingBacklog ≡ max(0, 1 - buildingStock).
    housingBacklog = Math.max(0, 1 - clamp01(operation.buildingStock));
  }
  const sizeTarget = getTargetBuildingStock(adults);
  const effectiveBacklog = housingBacklog * sizeTarget;
  const totalRequired = CONSTRUCTION_WORKERS_BASE + effectiveBacklog * adults * WORKERS_SHARE_PER_BACKLOG;
  const masonShare = getMasonShare(operation.hasQuarryAccess);
  return { mason: rn(totalRequired * masonShare, 2), carpenter: rn(totalRequired * (1 - masonShare), 2) };
}

/**
 * Dynamic stand-in for the static cosmetic `burg.shanty` flag: underdeveloped burgs produce at a
 * reduced local-bonus rate. Undefined operation → no penalty (pre-system / disabled economy).
 */
export function getConstructionProductivityMultiplier(
  operation: Pick<ConstructionOperation, "buildingStock"> | undefined
): number {
  if (!operation) return 1;
  return MIN_CAPACITY_SHARE + (1 - MIN_CAPACITY_SHARE) * clamp01(operation.buildingStock);
}

/** Debug/summary snapshot of housing ledger for a construction op + burg. */
export function getHousingLedgerSnapshot(
  operation: ConstructionOperation | LegacyConstructionOperation | undefined,
  burg: { population?: number } | undefined,
  populationRate: number
): {
  dwellingStock: number;
  requiredDwellings: number;
  households: number;
  housingBacklog: number;
  buildingStock: number;
} | null {
  if (!operation || !burg) return null;
  const normalized = normalizeConstructionOperation({ ...operation }, burg, populationRate);
  const required = getRequiredDwellings(burg.population ?? 0, populationRate);
  return {
    dwellingStock: rn(normalized.dwellingStock, 2),
    requiredDwellings: required,
    households: rn(getHouseholds(burg.population ?? 0, populationRate), 2),
    housingBacklog: rn(getHousingBacklog(normalized.dwellingStock, required), 4),
    buildingStock: rn(normalized.buildingStock, 4)
  };
}

function getAdults(burg: Parameters<typeof getBurgDemographics>[0]): number {
  const demographics = getBurgDemographics(burg);
  return Math.max(0, demographics.maleAdults + demographics.femaleAdults);
}

function getPopulationRate(): number {
  return Math.max(0, getWorldContext().populationRate ?? 0) || 1;
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
   * Settles one Economy production month: consumes Stone/Wood, advances `dwellingStock`,
   * write-through `buildingStock` (K13/K14). Never does independent `buildingStock +=`.
   */
  produceMonth(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const stoneGood = goodsByName.get("stone");
    const woodGood = goodsByName.get("wood");
    const concreteGood = goodsByName.get("roman concrete");
    const burgs = getWorldContext().pack.burgs;
    const populationRate = getPopulationRate();

    for (const raw of getConstructionOperations()) {
      if (!raw.active) continue;
      const burg = burgs[raw.burgId];
      if (!burg || burg.removed) continue;
      if (burg.group === "fort") continue;

      const operation = normalizeConstructionOperation(raw, burg, populationRate);
      const requiredDwellings = getRequiredDwellings(burg.population ?? 0, populationRate);
      // Re-assert write-through after population may have changed since last month.
      operation.buildingStock = clamp01(operation.dwellingStock / requiredDwellings);

      const adults = getAdults(burg);
      const required = getConstructionRequiredWorkers({ ...operation, requiredDwellings }, adults);
      const masonFactor = required.mason > 0 ? Math.min(1, operation.masonWorkers / required.mason) : 1;
      const carpenterFactor = required.carpenter > 0 ? Math.min(1, operation.carpenterWorkers / required.carpenter) : 1;

      let stoneFactor = 1;
      if (operation.hasQuarryAccess && required.mason > 0) {
        const stoneNeededAnnual = required.mason * STONE_PER_MASON_WORKER_ANNUAL;
        let coveredAnnual = 0;

        if (concreteGood && isGoodEnabled(concreteGood)) {
          const concreteNeededMonthly = (stoneNeededAnnual - coveredAnnual) / ROMAN_CONCRETE_STONE_EFFICIENCY / 12;
          const concreteConsumedMonthly = Markets.consumeForConstruction(
            operation.marketId,
            concreteGood.i,
            concreteNeededMonthly,
            MATERIAL_STOCK_SHARE
          );
          coveredAnnual += concreteConsumedMonthly * ROMAN_CONCRETE_STONE_EFFICIENCY * 12;
        }
        if (stoneGood && isGoodEnabled(stoneGood) && coveredAnnual < stoneNeededAnnual) {
          const stoneNeededMonthly = (stoneNeededAnnual - coveredAnnual) / 12;
          const stoneConsumedMonthly = Markets.consumeForConstruction(
            operation.marketId,
            stoneGood.i,
            stoneNeededMonthly,
            MATERIAL_STOCK_SHARE
          );
          coveredAnnual += stoneConsumedMonthly * 12;
        }
        stoneFactor = stoneNeededAnnual > 0 ? Math.min(1, coveredAnnual / stoneNeededAnnual) : 1;
      }

      let woodFactor = 1;
      if (woodGood && isGoodEnabled(woodGood) && required.carpenter > 0) {
        const woodNeededAnnual = required.carpenter * WOOD_PER_CARPENTER_WORKER_ANNUAL;
        // Shipbuilding competes indirectly via shared market stock (economy must not import it).
        const consumed = Markets.consumeForConstruction(
          operation.marketId,
          woodGood.i,
          woodNeededAnnual / 12,
          MATERIAL_STOCK_SHARE
        );
        woodFactor = woodNeededAnnual > 0 ? Math.min(1, (consumed * 12) / woodNeededAnnual) : 1;
      }

      const masonShare = getMasonShare(operation.hasQuarryAccess);
      const laborFactor = masonShare * masonFactor + (1 - masonShare) * carpenterFactor;
      const materialFactor = masonShare * stoneFactor + (1 - masonShare) * woodFactor;
      const progressFactor = Math.min(laborFactor, materialFactor);

      // K14: growth uses full housingBacklog, not employment's size-aware effectiveBacklog.
      const housingBacklog = getHousingBacklog(operation.dwellingStock, requiredDwellings);
      const deltaDwellings = (requiredDwellings * housingBacklog * BASE_ANNUAL_STOCK_GROWTH * progressFactor) / 12;
      operation.dwellingStock = Math.min(requiredDwellings, rn(operation.dwellingStock + deltaDwellings, 4));
      operation.buildingStock = clamp01(operation.dwellingStock / requiredDwellings);
    }
  }

  /**
   * Annual ceiling on `effectiveCapacity` from write-through `buildingStock`.
   * Independent layer on top of foodImportNetwork's quarterly import capacity.
   */
  constrainEffectiveCapacity(): void {
    const burgs = getWorldContext().pack.burgs;
    const populationRate = getPopulationRate();
    for (const raw of getConstructionOperations()) {
      const burg = burgs[raw.burgId];
      if (!burg?.demographics) continue;
      const operation = normalizeConstructionOperation(raw, burg, populationRate);
      const base = burg.demographics.capacity;
      const ceiling = base * getConstructionProductivityMultiplier(operation);
      burg.demographics.effectiveCapacity = Math.min(burg.demographics.effectiveCapacity ?? base, ceiling);
    }
  }
}

export const ConstructionOperations = new ConstructionOperationsModule();
