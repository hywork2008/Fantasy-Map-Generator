/**
 * Interval-scoped physical goods accounting for balance analysis.
 *
 * This is deliberately an aggregate ledger, not an event log: a long Advance Year can create
 * many individual market operations, while a balance report needs the net quantity by Good,
 * purpose and actor. Callers record every material stock mutation they own through
 * `recordGoodFlow`; the controller closes the interval after an Advance Time action.
 */

import { rn } from "../../hostUtils";
import { getGoods, getMarkets } from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";

export type GoodFlowDirection = "source" | "sink" | "transfer";
export type GoodFlowCategory =
  | "ruralHarvest"
  | "mineSupply"
  | "smelterSupply"
  | "burgCraft"
  | "importArrival"
  | "householdFood"
  | "householdTextiles"
  | "recipeInput"
  | "construction"
  | "smelting"
  | "minting"
  | "military"
  | "marketInvestment"
  | "shipbuilding"
  | "exportDeparture"
  | "spoilage"
  | "burgDemand";

export interface GoodFlowRecord {
  readonly direction: GoodFlowDirection;
  readonly category: GoodFlowCategory;
  readonly goodId: number;
  readonly units: number;
  readonly marketId?: number;
  readonly burgId?: number;
  readonly guildDomain?: CraftKnowledgeDomain;
  /** Recipe output Good when this is a manufacturing input. */
  readonly relatedGoodId?: number;
}

export interface GoodsBalancePoint {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly tickCount: number;
}

export interface GoodFlowAttribution extends GoodFlowRecord {
  readonly start: GoodsBalancePoint;
  readonly end: GoodsBalancePoint;
}

export interface GoodBalanceInterval {
  readonly start: GoodsBalancePoint;
  readonly end: GoodsBalancePoint;
  readonly elapsedDays: number;
  readonly goodId: number;
  readonly goodName: string;
  readonly types: string;
  readonly tags: string;
  /** Market pool stock only; Burg inventory mirrors are excluded to avoid double-counting. */
  readonly openingStock: number;
  /** Market pool stock only; Burg inventory mirrors are excluded to avoid double-counting. */
  readonly closingStock: number;
  readonly stockChange: number;
  readonly totalSources: number;
  readonly totalSinks: number;
  readonly ruralHarvest: number;
  readonly mineSupply: number;
  readonly smelterSupply: number;
  readonly burgCraft: number;
  readonly importArrival: number;
  readonly householdFood: number;
  readonly householdTextiles: number;
  readonly recipeInput: number;
  readonly construction: number;
  readonly smelting: number;
  readonly minting: number;
  readonly military: number;
  readonly marketInvestment: number;
  readonly shipbuilding: number;
  readonly exportDeparture: number;
  readonly spoilage: number;
  /** Positive means a stock mutation was not recorded by the accounting ledger. */
  readonly accountingGap: number;
}

type ActiveInterval = {
  start: GoodsBalancePoint;
  openingStock: ReadonlyMap<number, number>;
  flows: Map<string, GoodFlowRecord>;
};

let activeInterval: ActiveInterval | null = null;

function copyPoint(point: GoodsBalancePoint): GoodsBalancePoint {
  return { year: point.year, month: point.month, day: point.day, tickCount: point.tickCount };
}

function currentStocks(): Map<number, number> {
  const stocks = new Map<number, number>();
  for (const good of getGoods().filter(isGoodEnabled)) {
    const stock = getMarkets().reduce((total, market) => total + (market.goods[good.i]?.stock ?? 0), 0);
    stocks.set(good.i, stock);
  }
  return stocks;
}

function flowKey(flow: GoodFlowRecord): string {
  return [
    flow.direction,
    flow.category,
    flow.goodId,
    flow.marketId ?? "",
    flow.burgId ?? "",
    flow.guildDomain ?? "",
    flow.relatedGoodId ?? ""
  ].join(":");
}

function calendarOrdinal(point: GoodsBalancePoint): number {
  return point.year * 365 + (point.month - 1) * 30 + (point.day - 1);
}

function totalBy(flow: readonly GoodFlowRecord[], direction: GoodFlowDirection, goodId: number): number {
  return flow.reduce(
    (total, entry) => total + (entry.direction === direction && entry.goodId === goodId ? entry.units : 0),
    0
  );
}

function categoryTotal(flow: readonly GoodFlowRecord[], category: GoodFlowCategory, goodId: number): number {
  return flow.reduce(
    (total, entry) => total + (entry.category === category && entry.goodId === goodId ? entry.units : 0),
    0
  );
}

/** Starts a new reporting interval at the current stock position. */
export function beginGoodsBalanceInterval(point: GoodsBalancePoint): void {
  activeInterval = { start: copyPoint(point), openingStock: currentStocks(), flows: new Map() };
}

/** Drops any active interval; used when a new map is generated or loaded. */
export function clearGoodsBalanceLedger(): void {
  activeInterval = null;
}

/** Records an aggregate physical stock movement. Calls before the first baseline are ignored. */
export function recordGoodFlow(flow: GoodFlowRecord): void {
  if (!activeInterval || !Number.isFinite(flow.units) || flow.units <= 0) return;
  const key = flowKey(flow);
  const previous = activeInterval.flows.get(key);
  activeInterval.flows.set(
    key,
    previous ? { ...previous, units: previous.units + flow.units } : { ...flow, units: rn(flow.units, 4) }
  );
}

/**
 * Closes the active interval and immediately opens the next one at the same end point.
 * Inventory transfers are intentionally kept out of the world stock identity: they appear in
 * attribution data, while only sources/sinks affect `accountingGap`.
 */
export function closeGoodsBalanceInterval(point: GoodsBalancePoint): {
  intervals: GoodBalanceInterval[];
  attributions: GoodFlowAttribution[];
} {
  if (!activeInterval) {
    beginGoodsBalanceInterval(point);
    return { intervals: [], attributions: [] };
  }

  const end = copyPoint(point);
  const flows = [...activeInterval.flows.values()];
  const closingStock = currentStocks();
  const elapsedDays =
    Math.max(0, end.tickCount - activeInterval.start.tickCount) ||
    Math.max(0, calendarOrdinal(end) - calendarOrdinal(activeInterval.start));
  const intervals = getGoods()
    .filter(isGoodEnabled)
    .map(good => {
      const opening = activeInterval?.openingStock.get(good.i) ?? 0;
      const closing = closingStock.get(good.i) ?? 0;
      const sources = totalBy(flows, "source", good.i);
      const sinks = totalBy(flows, "sink", good.i);
      const types = [good.recipes && "MFG", good.distribution && "RAW"].filter(Boolean).join(";");
      return {
        start: activeInterval!.start,
        end,
        elapsedDays,
        goodId: good.i,
        goodName: good.name,
        types,
        tags: good.tags.join(";"),
        openingStock: opening,
        closingStock: closing,
        stockChange: closing - opening,
        totalSources: sources,
        totalSinks: sinks,
        ruralHarvest: categoryTotal(flows, "ruralHarvest", good.i),
        mineSupply: categoryTotal(flows, "mineSupply", good.i),
        smelterSupply: categoryTotal(flows, "smelterSupply", good.i),
        burgCraft: categoryTotal(flows, "burgCraft", good.i),
        importArrival: categoryTotal(flows, "importArrival", good.i),
        householdFood: categoryTotal(flows, "householdFood", good.i),
        householdTextiles: categoryTotal(flows, "householdTextiles", good.i),
        recipeInput: categoryTotal(flows, "recipeInput", good.i),
        construction: categoryTotal(flows, "construction", good.i),
        smelting: categoryTotal(flows, "smelting", good.i),
        minting: categoryTotal(flows, "minting", good.i),
        military: categoryTotal(flows, "military", good.i),
        marketInvestment: categoryTotal(flows, "marketInvestment", good.i),
        shipbuilding: categoryTotal(flows, "shipbuilding", good.i),
        exportDeparture: categoryTotal(flows, "exportDeparture", good.i),
        spoilage: categoryTotal(flows, "spoilage", good.i),
        accountingGap: opening + sources - sinks - closing
      };
    });
  const attributions = flows.map(flow => ({ ...flow, start: activeInterval!.start, end }));
  activeInterval = { start: end, openingStock: closingStock, flows: new Map() };
  return { intervals, attributions };
}
