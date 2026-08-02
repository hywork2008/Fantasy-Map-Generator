/**
 * Live A0 flow diagnostics collector.
 * Snapshots retail stock at production-cycle start; records demand, production estimate,
 * trade units, and caravan utilization after trade + demand fill.
 *
 * History lives in simulation.extensions.economy.flowCycleHistory (last 12 cycles).
 *
 * @see docs/plan/market-goods-flow-budget.md
 */

import {
  getCaravans,
  getDeals,
  getFlowCycleHistory,
  getGoods,
  getMarkets,
  getSimulationDay,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext,
  setFlowCycleHistory
} from "../economyContext";
import { DEMAND_PRIORITY, DEMAND_TARGET_FACTORS, type DemandCategory, Goods, isGoodEnabled } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import {
  CYCLES_PER_YEAR,
  getDefaultMonthsOfCover,
  samplesFromTransportAllocations,
  summarizeCaravanUtilization
} from "./marketFlowBudget";
import {
  buildFlowReportSummary,
  type FlowCycleSnapshot,
  type FlowReportSummary,
  formatFlowReportCsv,
  type MarketGoodCycleSample,
  trimFlowCycleHistory
} from "./marketFlowReport";
import type { Deal, Market } from "./marketTypes";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";

/** Sparse stock map: marketId → goodId → units. */
export type StockSnapshot = Map<number, Map<number, number>>;

let _pendingStartStocks: StockSnapshot | null = null;
let _nextCycleIndex = 0;

function isTradeableGood(good: Good): boolean {
  if (!isGoodEnabled(good)) return false;
  if (good.tags.includes("stapleFood")) return false;
  return Boolean(good.distribution || good.recipes?.length);
}

function collectConsumerDemandFactors(goods: readonly Good[]): number[] {
  const totalCoverageByCategory = Object.fromEntries(
    DEMAND_PRIORITY.map(category => [
      category,
      goods.reduce((sum, good) => sum + (good.demandCoverage?.[category] || 0), 0) || 1
    ])
  ) as Record<DemandCategory, number>;

  const demandFactor: number[] = [];
  for (const good of goods) {
    demandFactor[good.i] = DEMAND_PRIORITY.reduce((sum, category) => {
      const share = (good.demandCoverage?.[category] || 0) / (totalCoverageByCategory[category] || 1);
      return sum + share * DEMAND_TARGET_FACTORS[category];
    }, 0);
  }
  return demandFactor;
}

function collectIndustrialDemandFactors(goods: readonly Good[], consumerDemandFactors: number[]): number[] {
  const demandFactor: number[] = [];
  for (const good of goods) {
    if (!good.recipes?.length) continue;
    const outputDemand = consumerDemandFactors[good.i] || 0;
    for (const recipe of good.recipes) {
      for (const [ingredientIdStr, amount] of Object.entries(recipe)) {
        const ingredientId = Number(ingredientIdStr);
        const ingredient = Goods.get(ingredientId);
        if (!ingredient || !isGoodEnabled(ingredient)) continue;
        demandFactor[ingredientId] = (demandFactor[ingredientId] || 0) + amount * outputDemand;
      }
    }
  }
  return demandFactor;
}

function calculatePopulationByMarket(): number[] {
  const populationByMarket: number[] = [];
  for (const burg of getWorldContext().pack.burgs) {
    if (!burg.i || burg.removed || !burg.market || !burg.population) continue;
    populationByMarket[burg.market] = (populationByMarket[burg.market] || 0) + burg.population;
  }
  return populationByMarket;
}

/** Capture retail stocks for tradeable goods (call at production cycle start). */
export function snapshotMarketStocks(markets: readonly Market[] = getMarkets()): StockSnapshot {
  const goods = getGoods().filter(isTradeableGood);
  const snapshot: StockSnapshot = new Map();
  for (const market of markets) {
    const byGood = new Map<number, number>();
    for (const good of goods) {
      const stock = market.goods[good.i]?.stock ?? 0;
      if (stock > 0) byGood.set(good.i, stock);
    }
    snapshot.set(market.i, byGood);
  }
  return snapshot;
}

export function beginFlowCycleCapture(): void {
  _pendingStartStocks = snapshotMarketStocks();
}

function sumDealUnits(deals: readonly Deal[], side: "seller" | "buyer"): Map<string, number> {
  const totals = new Map<string, number>();
  for (const deal of deals) {
    if (side === "seller" && deal.sellerType !== "market") continue;
    if (side === "buyer" && deal.buyerType !== "market") continue;
    const marketId = side === "seller" ? deal.seller : deal.buyer;
    const key = `${marketId}:${deal.good}`;
    totals.set(key, (totals.get(key) || 0) + deal.units);
  }
  return totals;
}

/**
 * Record one completed production cycle into the ring buffer.
 * Call after runGlobalTrade + fillDemand (and optional caravan spawn).
 */
export function recordFlowCycleEnd(options?: {
  startStocks?: StockSnapshot | null;
  deals?: readonly Deal[];
  year?: number;
  month?: number;
  day?: number;
}): FlowCycleSnapshot | null {
  const startStocks = options?.startStocks ?? _pendingStartStocks;
  _pendingStartStocks = null;

  const markets = getMarkets();
  if (!markets.length) return null;

  const goods = getGoods().filter(isTradeableGood);
  if (!goods.length) return null;

  const deals = options?.deals ?? getDeals();
  const exportByKey = sumDealUnits(deals, "seller");
  const importByKey = sumDealUnits(deals, "buyer");

  const consumerFactors = collectConsumerDemandFactors(goods);
  const industrialFactors = collectIndustrialDemandFactors(goods, consumerFactors);
  const populationByMarket = calculatePopulationByMarket();

  const samples: MarketGoodCycleSample[] = [];
  for (const market of markets) {
    const population = populationByMarket[market.i] || 0;
    const startByGood = startStocks?.get(market.i);

    for (const good of goods) {
      const endStock = market.goods[good.i]?.stock ?? 0;
      const cycleDemand = population * ((consumerFactors[good.i] || 0) + (industrialFactors[good.i] || 0));
      const key = `${market.i}:${good.i}`;
      const cycleExport = exportByKey.get(key) || 0;
      const cycleImport = importByKey.get(key) || 0;
      const startStock = startByGood?.get(good.i) ?? 0;

      // Accounting identity (approx): end = start + prod + import - export - consumption
      // ⇒ prod - consumption = end - start - import + export
      // When start snapshot is missing, fall back to 0 production (stock-only soft budget).
      const netProductionMinusConsumption = startStocks != null ? endStock - startStock - cycleImport + cycleExport : 0;
      // Report non-negative production estimate; consumption beyond production is ignored here.
      const cycleProduction = Math.max(0, netProductionMinusConsumption);

      // Skip empty rows that never moved and have no demand/stock.
      if (
        cycleDemand <= 1e-9 &&
        cycleProduction <= 1e-9 &&
        cycleExport <= 1e-9 &&
        cycleImport <= 1e-9 &&
        endStock <= 1e-9
      ) {
        continue;
      }

      samples.push({
        marketId: market.i,
        goodId: good.i,
        cycleDemand,
        cycleProduction,
        cycleExport,
        cycleImport,
        endStock,
        cargoSlotsPerUnit: getGoodCargoSlotsPerUnit(good),
        monthsOfCover: getDefaultMonthsOfCover(good)
      });
    }
  }

  const caravans = getCaravans().filter(caravan => caravan.state === "transit" || caravan.state === "loading");
  const utilSamples = samplesFromTransportAllocations(caravans, getGoods());
  const caravanUtilization = summarizeCaravanUtilization(utilSamples);

  const snapshot: FlowCycleSnapshot = {
    cycleIndex: _nextCycleIndex++,
    year: options?.year ?? getSimulationYear(),
    month: options?.month ?? getSimulationMonth(),
    day: options?.day ?? getSimulationDay(),
    samples,
    caravanUtilization
  };

  const history = trimFlowCycleHistory([...getFlowCycleHistory(), snapshot], CYCLES_PER_YEAR);
  setFlowCycleHistory(history);
  return snapshot;
}

export function getFlowReport(): FlowReportSummary {
  return buildFlowReportSummary(getFlowCycleHistory(), CYCLES_PER_YEAR);
}

export function downloadFlowReportCsv(filename = "market-flow-report.csv"): void {
  const summary = getFlowReport();
  const world = getWorldContext();
  const markets = getMarkets();
  const marketName = (marketId: number) => {
    const market = markets.find(candidate => candidate.i === marketId);
    if (!market) return `Market ${marketId}`;
    if (market.name) return market.name;
    const burg = world.pack.burgs[market.centerBurgId];
    return burg?.name ?? `Market ${marketId}`;
  };
  const goodName = (goodId: number) => Goods.get(goodId)?.name ?? `Good ${goodId}`;
  const csv = formatFlowReportCsv(summary.rows, { marketName, goodName });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function clearFlowDiagnostics(): void {
  _pendingStartStocks = null;
  _nextCycleIndex = 0;
  setFlowCycleHistory([]);
}

/** Test helper: inject a start snapshot without running production. */
export function __setPendingStartStocksForTests(snapshot: StockSnapshot | null): void {
  _pendingStartStocks = snapshot;
}

export function __resetFlowDiagnosticsForTests(): void {
  clearFlowDiagnostics();
}
