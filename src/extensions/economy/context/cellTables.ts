/**
 * Cell-indexed columns and the sparse per-cell tables (fauna, food reserves, cumulative flows).
 *
 * Split out of the former single 2,452-line `economyContext.ts`, which had grown into a
 * 410-export module every one of this extension's ~180 files imported. `economyContext.ts` is now
 * a re-export barrel over these domain modules, so the public API is unchanged and no call site
 * moved. docs/plan/economy-coupling-audit.md T3.
 */

/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { CellFoodReserve } from "../generators/cellFoodRescueTypes";
import type { FaunaCohorts } from "../generators/faunaPopulationTypes";
import { getEconomySlice, getSliceCellColumn, setSliceCellColumn } from "./economyApi";

/** Per-cell dominant good id, owned by the economy extension. */
export function getGoodCellColumn(): Uint16Array {
  return getSliceCellColumn("good");
}

export function setGoodCellColumn(column: Uint16Array): void {
  setSliceCellColumn("good", column);
}

/** Per-cell market id, owned by the economy extension. */
export function getMarketCellColumn(): Uint16Array {
  return getSliceCellColumn("market");
}

export function setMarketCellColumn(column: Uint16Array): void {
  setSliceCellColumn("market", column);
}

/**
 * Sparse "marketId:collectionBurgId:goodId" → banked-catch accumulator, owned by the
 * economy slice. Used by liveAnimalCatch.ts to turn liveAnimal-tagged goods' continuous
 * rural production rate into lumpy integer catches instead of a fractional trickle.
 * Returns null when the extension API / simulation context is not available (unit tests
 * may use a module fallback in liveAnimalCatch.ts).
 */
export function getOrCreateLiveAnimalCatchTable(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.liveAnimalCatchAccumulators;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.liveAnimalCatchAccumulators = table;
  return table;
}

/**
 * Sparse "cellId:speciesKey" → {young,breeding,old} headcount, owned by the economy slice
 * (docs/plan/biome-goods-producer-ecosystem.md §4, Phase 2). speciesKey is "Game" for the wild
 * stock or a liveAnimal Good's name for domesticated stock. Returns null when the extension API /
 * simulation context is not available (unit tests may treat this as "fauna model inactive").
 */
export function getOrCreateFaunaStockTable(): Record<string, FaunaCohorts> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.faunaStock;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, FaunaCohorts>;
  }
  const table: Record<string, FaunaCohorts> = {};
  slice.faunaStock = table;
  return table;
}

/**
 * Cell-local preserved-food reserves, expressed as raw-fresh equivalents. Fresh food never enters
 * the Market pool; only preservation output above this reserve is allowed into normal trade.
 */
export function getOrCreateCellFoodReserves(): Record<number, CellFoodReserve> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.cellFoodReserves;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<number, CellFoodReserve>;
  }
  const reserves: Record<number, CellFoodReserve> = {};
  slice.cellFoodReserves = reserves;
  return reserves;
}

/**
 * Sparse "marketId:goodId" → last up-to-4 quarterly consumed-stock samples, for non-food
 * liveAnimal goods' demand-absorption carrying-capacity cap (§4.5). Paired with
 * getOrCreateNonFoodFaunaDemandSnapshot(), which holds the stock level as of the last quarter
 * boundary, and getOrCreateNonFoodFaunaProductionSnapshot(), which holds the cumulative-production
 * total as of the same boundary — together they let the next quarter's sample be derived as
 * "produced this quarter + stock delta" rather than a raw stock delta alone (see that function's
 * doc-comment for why the raw-delta-only version silently reports ~0 demand for a chronically
 * undersupplied good).
 */
export function getOrCreateNonFoodFaunaDemandHistory(): Record<string, number[]> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.nonFoodFaunaDemandHistory;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number[]>;
  }
  const table: Record<string, number[]> = {};
  slice.nonFoodFaunaDemandHistory = table;
  return table;
}

export function getOrCreateNonFoodFaunaDemandSnapshot(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.nonFoodFaunaDemandSnapshot;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.nonFoodFaunaDemandSnapshot = table;
  return table;
}

/**
 * Snapshot of getOrCreateMarketGoodProductionTotals() as of the last quarter boundary, for the
 * same "marketId:goodId" key as getOrCreateNonFoodFaunaDemandSnapshot(). Found 2026-08-08: a good
 * whose market supply chronically can't keep up with demand (e.g. Sheep, entirely bought up as
 * Wool's `recipes: [{ Sheep: 1 }]` ingredient the moment it lands) sits at near-zero stock at
 * EVERY quarter boundary even while huge volumes are actually changing hands — `previousStock -
 * currentStock` alone reads that as "nobody wants it" (both snapshots are already ~0, so the delta
 * is ~0 too) and the demand-absorption cap crashes toward 0 exactly as if it really were an
 * unsellable surplus, wiping the species out within a year (§4.3's carryingCapacity<=0 hard-zero
 * rule). Recovering `producedThisQuarter + previousStock - currentStock` instead correctly
 * attributes that throughput as consumption regardless of how little stock ever had a chance to
 * visibly pile up between snapshots.
 */
export function getOrCreateNonFoodFaunaProductionSnapshot(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.nonFoodFaunaProductionSnapshot;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.nonFoodFaunaProductionSnapshot = table;
  return table;
}

/**
 * Sparse goodId → cumulative units ever placed into a market, owned by the economy slice.
 * Two independent event sources feed it, both in markets-generator.ts: Markets.sell() (a Burg selling
 * its own craft-manufactured output — the production-generator.ts:594 call site, matching
 * production-overview.ts's own "sold" deal-kind naming) and addRuralOutput() (a cell's rural/biome
 * harvest — Grapes, Milk, Fish, Game, Wood, ... — reaching the market; these are never manufactured by
 * a Burg, so no Deal exists for them). 2026-08-08 (docs/temp/0807-alcoholic.md): the addRuralOutput()
 * half was added after the Goods Editor's Sales column shipped with only the sell() half — craft goods
 * (Wine, Cheese) showed real numbers while their own raw ingredients (Grapes, Milk), produced and
 * consumed just as continuously, sat at ~0. Unlike `production` (economyTotals.ts's getProduction(), a
 * per-cycle snapshot recomputed fresh every time) and `deals` (wiped every production cycle for UI
 * history — see getDeals()'s doc-comment), this accumulates across the whole session and is only ever
 * cleared explicitly (resetCumulativeMarketIntake(), the Goods Editor's reset button). Returns null when
 * the extension API / simulation context is not available.
 */
export function getOrCreateCumulativeMarketIntake(): Record<number, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.cumulativeGoodsSales;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<number, number>;
  }
  const table: Record<number, number> = {};
  slice.cumulativeGoodsSales = table;
  return table;
}

/** Zeroes every good's cumulative market-intake counter in place. */
export function resetCumulativeMarketIntake(): void {
  const table = getOrCreateCumulativeMarketIntake();
  if (table) {
    for (const goodId of Object.keys(table)) delete table[Number(goodId)];
  }
  const foodFlows = getOrCreateCumulativeCellFoodFlows();
  if (foodFlows) {
    for (const goodId of Object.keys(foodFlows)) delete foodFlows[Number(goodId)];
  }
}

/** @deprecated Intake includes rural harvest and is not necessarily a retail sale. */
export const getOrCreateCumulativeGoodsSales = getOrCreateCumulativeMarketIntake;

/** @deprecated Use resetCumulativeMarketIntake. */
export const resetCumulativeGoodsSales = resetCumulativeMarketIntake;

export type CumulativeCellFoodFlow = {
  /** Fresh units actually harvested in source cells, before local consumption or processing. */
  harvested: number;
  /** Fresh units actually used as preservation or manufacturing inputs. */
  processed: number;
  /** Shelf-stable output made for a source cell's private reserve, not placed into Market stock. */
  privateReserveOutput: number;
};

/**
 * Per-good realised fresh-food flow, separate from Market intake and from the editor's projected
 * production estimate. It is reset alongside the Goods Editor's cumulative Market-output counter.
 */
export function getOrCreateCumulativeCellFoodFlows(): Record<number, CumulativeCellFoodFlow> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.cumulativeCellFoodFlows;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<number, CumulativeCellFoodFlow>;
  }
  const flows: Record<number, CumulativeCellFoodFlow> = {};
  slice.cumulativeCellFoodFlows = flows;
  return flows;
}

export function recordCumulativeCellFoodHarvest(goodId: number, units: number): void {
  if (!Number.isFinite(units) || units <= 0) return;
  const flows = getOrCreateCumulativeCellFoodFlows();
  if (!flows) return;
  const flow = flows[goodId] ?? { harvested: 0, processed: 0, privateReserveOutput: 0 };
  flow.harvested += units;
  flows[goodId] = flow;
}

export function recordCumulativeCellFoodProcessing(goodId: number, units: number): void {
  if (!Number.isFinite(units) || units <= 0) return;
  const flows = getOrCreateCumulativeCellFoodFlows();
  if (!flows) return;
  const flow = flows[goodId] ?? { harvested: 0, processed: 0, privateReserveOutput: 0 };
  flow.processed += units;
  flows[goodId] = flow;
}

export function recordCumulativeCellFoodReserveOutput(goodId: number, units: number): void {
  if (!Number.isFinite(units) || units <= 0) return;
  const flows = getOrCreateCumulativeCellFoodFlows();
  if (!flows) return;
  const flow = flows[goodId] ?? { harvested: 0, processed: 0, privateReserveOutput: 0 };
  flow.privateReserveOutput = (flow.privateReserveOutput ?? 0) + units;
  flows[goodId] = flow;
}

/**
 * Sparse "marketId:goodId" → cumulative units ever placed into THAT market's stock, owned by the
 * economy slice. Same two event sources as getOrCreateCumulativeMarketIntake() (Markets.sell() and
 * addRuralOutput() in markets-generator.ts), just market-scoped instead of world-wide. Lets a
 * per-market consumer recover how much actually flowed INTO a market between two points in time,
 * not just where its stock number happened to net out to — see
 * getOrCreateNonFoodFaunaProductionSnapshot()'s doc-comment for why that distinction matters.
 * Never reset automatically; only meaningful as a delta between two snapshots taken by the caller.
 */
export function getOrCreateMarketGoodProductionTotals(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.marketGoodProductionTotals;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.marketGoodProductionTotals = table;
  return table;
}
