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
import type { ConstructionOperation } from "./constructionEmploymentTypes";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

export type { ConstructionOperation } from "./constructionEmploymentTypes";

/** Adult headcount at which `getTargetBuildingStock()` reaches ~63% of full saturation. */
const POPULATION_SCALE_ADULTS = 400;
/** Base headcount a Burg's construction operation needs even with no backlog (upkeep). */
const CONSTRUCTION_WORKERS_BASE = 1;
/** Share of a Burg's adults that become construction workers at maximum backlog (1.0). */
const WORKERS_SHARE_PER_BACKLOG = 0.05;
/** Default mason/carpenter split for a Burg with quarry access, absent any culture bonus. */
const BASE_MASON_SHARE = 0.4;
/** §7.1 decision 5: "文化(特にCultures setがHigh Fantasyの場合)か地形によって比率を決める." */
const HIGH_FANTASY_MASON_SHARE_BONUS = 0.2;
const MAX_MASON_SHARE = 0.8;
/** How much of the annual material need may be drawn from local market stock per month. */
const MATERIAL_STOCK_SHARE = 0.3;
const STONE_PER_MASON_WORKER_ANNUAL = 8;
const WOOD_PER_CARPENTER_WORKER_ANNUAL = 10;
/**
 * §7.1 decision 3: Roman Concrete is a direct Stone substitute, not a separate technology-
 * adoption stock. 1 unit of Roman Concrete covers as much mason need as 1/ROMAN_CONCRETE_STONE_EFFICIENCY
 * units of Stone would — i.e. masons need less material (by mass/unit) when Concrete is
 * available, reflecting Roman concrete's historical labor/material efficiency advantage.
 */
const ROMAN_CONCRETE_STONE_EFFICIENCY = 2;
/** Share of the backlog a fully-staffed, fully-supplied operation closes in one year. */
const BASE_ANNUAL_STOCK_GROWTH = 0.25;
/**
 * Floor on the annual `effectiveCapacity` ceiling (§3.3 decision §7.1-2b): an undeveloped town
 * (buildingStock=0) can still reach half its base capacity — a hard 0 floor would create a
 * bootstrapping deadlock before construction has had any time to grow.
 */
const MIN_CAPACITY_SHARE = 0.5;

/**
 * Population-driven target for `buildingStock` (docs/plan/urban-construction-industry.md §3.3):
 * a saturating curve so a rapidly-growing frontier Burg (large gap between `adults` and
 * `buildingStock`'s slow annual growth) generates a correspondingly large `backlog`, and thus a
 * correspondingly large mason/carpenter employment demand — the mechanism the whole feature
 * exists for.
 */
export function getTargetBuildingStock(adults: number): number {
  return 1 - Math.exp(-Math.max(0, adults) / POPULATION_SCALE_ADULTS);
}

/**
 * §7.1 decision 5: terrain gates first (no quarry access → all-wood construction, share 0),
 * then culture adjusts the split within whatever terrain allows.
 */
export function getMasonShare(hasQuarryAccess: boolean): number {
  if (!hasQuarryAccess) return 0;
  // culturesSet lives in the React options store, not WorldContext.options (a generation-time
  // snapshot) — read live, same as index.tsx's ruralUrbanMigration check.
  const bonus = useOptionsState.getState().culturesSet === "highFantasy" ? HIGH_FANTASY_MASON_SHARE_BONUS : 0;
  return Math.min(MAX_MASON_SHARE, BASE_MASON_SHARE + bonus);
}

/**
 * Headcount needed to close this year's backlog, split between masons and carpenters. Reused by
 * the annual Burg-anchored employment reconciliation in `basicEmployment.ts` and by
 * `produceMonth()`'s labor-coverage factor. Unlike mine/quarry `requiredWorkers`, this is not a
 * pure function of a static candidate — it depends on the operation's current `buildingStock`,
 * which only `produceMonth()` advances, so it is recomputed on demand rather than cached.
 */
export function getConstructionRequiredWorkers(
  operation: Pick<ConstructionOperation, "buildingStock" | "hasQuarryAccess">,
  adults: number
): { mason: number; carpenter: number } {
  const target = getTargetBuildingStock(adults);
  const backlog = Math.max(0, target - operation.buildingStock);
  const totalRequired = CONSTRUCTION_WORKERS_BASE + backlog * adults * WORKERS_SHARE_PER_BACKLOG;
  const masonShare = getMasonShare(operation.hasQuarryAccess);
  return { mason: rn(totalRequired * masonShare, 2), carpenter: rn(totalRequired * (1 - masonShare), 2) };
}

/**
 * Dynamic stand-in for the static, cosmetic `burg.shanty` flag (§7.1 decision 2a): an
 * underdeveloped Burg (low `buildingStock` relative to its population target) produces at a
 * reduced local-bonus rate. Returns 1 (no penalty) when `operation` is undefined so Burgs that
 * predate this system, or a disabled economy, see unchanged behavior.
 */
export function getConstructionProductivityMultiplier(
  operation: Pick<ConstructionOperation, "buildingStock"> | undefined
): number {
  if (!operation) return 1;
  return MIN_CAPACITY_SHARE + (1 - MIN_CAPACITY_SHARE) * Math.max(0, Math.min(1, operation.buildingStock));
}

function getAdults(burg: Parameters<typeof getBurgDemographics>[0]): number {
  const demographics = getBurgDemographics(burg);
  return Math.max(0, demographics.maleAdults + demographics.femaleAdults);
}

/**
 * Burg-anchored construction industry: every Burg with a market gets an operation (unlike
 * quarries, every settlement needs buildings, not just ones sitting on quarriable terrain).
 * Mirrors QuarryOperationsModule's generate()/clear()/produceMonth() shape.
 */
export class ConstructionOperationsModule {
  generate(): void {
    const { pack } = getWorldContext();
    const marketColumn = getMarketCellColumn();
    const marketById = new Set(getMarkets().map(market => market.i));
    const previousByBurg = new Map(getConstructionOperations().map(operation => [operation.burgId, operation]));
    const quarryAccessByBurg = new Set(
      getQuarryOperations()
        .filter(quarry => quarry.stoneRatio > 0)
        .map(quarry => quarry.burgId)
    );

    const operations: ConstructionOperation[] = [];
    for (const burg of pack.burgs ?? []) {
      if (!burg.i || burg.removed) continue;
      const marketId = marketColumn[burg.cell] || burg.market || 0;
      if (!marketId || !marketById.has(marketId)) continue;

      const previous = previousByBurg.get(burg.i);
      operations.push({
        i: operations.length + 1,
        burgId: burg.i,
        marketId,
        masonWorkers: previous?.masonWorkers ?? 0,
        carpenterWorkers: previous?.carpenterWorkers ?? 0,
        buildingStock: previous?.buildingStock ?? 0,
        hasQuarryAccess: quarryAccessByBurg.has(burg.i),
        active: true
      });
    }

    setConstructionOperations(operations);
  }

  clear(): void {
    setConstructionOperations([]);
  }

  /** Settles one Economy production month: consumes Stone/Wood, advances `buildingStock`. */
  produceMonth(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const stoneGood = goodsByName.get("stone");
    const woodGood = goodsByName.get("wood");
    const concreteGood = goodsByName.get("roman concrete");
    const burgs = getWorldContext().pack.burgs;

    for (const operation of getConstructionOperations()) {
      if (!operation.active) continue;
      const burg = burgs[operation.burgId];
      if (!burg || burg.removed) continue;

      const adults = getAdults(burg);
      const required = getConstructionRequiredWorkers(operation, adults);
      const masonFactor = required.mason > 0 ? Math.min(1, operation.masonWorkers / required.mason) : 1;
      const carpenterFactor = required.carpenter > 0 ? Math.min(1, operation.carpenterWorkers / required.carpenter) : 1;

      let stoneFactor = 1;
      if (operation.hasQuarryAccess && required.mason > 0) {
        const stoneNeededAnnual = required.mason * STONE_PER_MASON_WORKER_ANNUAL;
        let coveredAnnual = 0;

        // Roman Concrete first (§7.1 decision 3: direct, more efficient substitute), Stone
        // covers whatever Concrete could not.
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
        // §7.1 decision 4: economy must not depend on the (optional, separate) shipbuilding
        // extension, so ship-vs-housing Wood priority cannot be read directly. Both draws
        // instead compete for the same bounded monthly stock share — when shipbuilding's own
        // Wood demand is high, less is left in market stock for carpenters to draw here, and
        // vice versa, without economy needing to know shipbuilding is even enabled.
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

      const target = getTargetBuildingStock(adults);
      const backlog = Math.max(0, target - operation.buildingStock);
      const monthlyGrowth = (backlog * BASE_ANNUAL_STOCK_GROWTH * progressFactor) / 12;
      operation.buildingStock = Math.min(1, rn(operation.buildingStock + monthlyGrowth, 4));
    }
  }

  /**
   * Annual ceiling on `effectiveCapacity` derived from `buildingStock` (§7.1 decision 2b): an
   * independent, periodically-reasserted cap layered on top of — not merged with —
   * foodImportNetwork.ts's quarterly `applyImportCapacity()`, which can raise a food-importing
   * Burg's `effectiveCapacity` back up within the same year. A tighter merge of the two capacity
   * systems is a documented follow-up (docs/plan/urban-construction-industry.md §7 未決定事項).
   */
  constrainEffectiveCapacity(): void {
    const burgs = getWorldContext().pack.burgs;
    for (const operation of getConstructionOperations()) {
      const burg = burgs[operation.burgId];
      if (!burg?.demographics) continue;
      const base = burg.demographics.capacity;
      const ceiling = base * getConstructionProductivityMultiplier(operation);
      burg.demographics.effectiveCapacity = Math.min(burg.demographics.effectiveCapacity ?? base, ceiling);
    }
  }
}

export const ConstructionOperations = new ConstructionOperationsModule();
