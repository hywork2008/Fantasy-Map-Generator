/**
 * Cycle / annual market×good flow budgets for logistics sizing.
 * Pure module: no economyContext imports. Callers supply stock, demand, production snapshots.
 *
 * @see docs/plan/market-goods-flow-budget.md
 */

import { getGoodCargoSlotsPerUnit } from "./tradeCargo";

/** Production settlement is ~every 30 sim days → 12 cycles per year. */
export const CYCLES_PER_YEAR = 12;

/** Matches Markets.runGlobalTrade local reserve (demand × 1.2). */
export const TRADE_RESERVE_FACTOR = 0.2;

/** Default commercial sail fill targets (Phase B departure policy). */
export const DEFAULT_TARGET_UTILIZATION = 0.55;
export const DEFAULT_MIN_SAIL_UTILIZATION = 0.2;
export const DEFAULT_MAX_WAIT_DAYS_LAND = 14;
export const DEFAULT_MAX_WAIT_DAYS_SEA = 10;

export type GoodsTradeAffinity = "localBulk" | "tradeStaple" | "luxury" | "military";

/** Months of cycle demand held as target retail stock. */
export const DEFAULT_MONTHS_OF_COVER: Readonly<Record<GoodsTradeAffinity, number>> = {
  localBulk: 2.5,
  tradeStaple: 2,
  luxury: 1,
  military: 1.5
};

export type MarketGoodFlowBudgetInput = {
  marketId: number;
  goodId: number;
  /** Current retail stock (Economy units). */
  stock: number;
  /** Local demand this production cycle (consumer + industrial). */
  cycleDemand: number;
  /**
   * Local production credited this cycle (rural + burg). Omit or 0 when unknown;
   * budget still uses stock for export/import estimates.
   */
  cycleProduction?: number;
  monthsOfCover?: number;
  cargoSlotsPerUnit: number;
  tradeReserveFactor?: number;
};

export type MarketGoodFlowBudget = {
  marketId: number;
  goodId: number;
  cycleDemand: number;
  annualDemand: number;
  cycleProduction: number;
  annualProduction: number;
  stock: number;
  monthsOfCover: number;
  targetStock: number;
  localReserve: number;
  exportBudget: number;
  importBudget: number;
  exportCargoSlots: number;
  importCargoSlots: number;
  /** stock / cycleDemand when demand > 0; otherwise Infinity if stock > 0 else 0. */
  monthsOfCoverActual: number;
};

export type CaravanUtilizationSample = {
  usedSlots: number;
  capacitySlots: number;
  utilization: number;
};

export type CaravanUtilizationStats = {
  count: number;
  meanUtilization: number;
  medianUtilization: number;
  shareUnder10pct: number;
  shareUnder20pct: number;
  totalUsedSlots: number;
  totalCapacitySlots: number;
};

export type FleetSizingInput = {
  annualExportCargoSlots: number;
  capacitySlotsPerTrip: number;
  targetUtilization?: number;
  meanRoundTripDays: number;
};

export type FleetSizingResult = {
  effectiveSlotsPerTrip: number;
  tripsPerYear: number;
  requiredConcurrentVehicles: number;
};

export type StagingCapacityInput = {
  meanMonthlyExportCargoSlots: number;
  maxWaitDays: number;
  /** Extra buffer multiplier (default 1.25). */
  bufferFactor?: number;
};

/**
 * Classify a good for default months-of-cover. Uses tags / demandCoverage heuristics only;
 * call sites may override monthsOfCover explicitly.
 */
export function inferGoodsTradeAffinity(good: {
  tags?: readonly string[];
  demandCoverage?: Partial<Record<string, number>>;
  value?: number;
  trade?: { bulk?: number; weight?: number };
}): GoodsTradeAffinity {
  const tags = good.tags ?? [];
  if (tags.includes("military") || (good.demandCoverage?.military ?? 0) >= 0.5) return "military";
  if (tags.includes("luxury") || (good.demandCoverage?.luxury ?? 0) >= 0.5) return "luxury";

  const bulk = good.trade?.bulk ?? 3;
  const weight = good.trade?.weight ?? 3;
  const value = good.value ?? 1;
  const density = value / Math.max(1, bulk + weight);
  // High bulk / low density → local bulk; compact mid-value → trade staple.
  if (bulk >= 4 || density < 0.35) return "localBulk";
  if (density >= 1.5) return "luxury";
  return "tradeStaple";
}

export function getDefaultMonthsOfCover(good: Parameters<typeof inferGoodsTradeAffinity>[0]): number {
  return DEFAULT_MONTHS_OF_COVER[inferGoodsTradeAffinity(good)];
}

/**
 * Pure per-market×good flow budget. Export prefers holding targetStock (and localReserve)
 * before shipping; import fills up to max(targetStock, cycleDemand).
 */
export function computeMarketGoodFlowBudget(input: MarketGoodFlowBudgetInput): MarketGoodFlowBudget {
  const cycleDemand = Math.max(0, input.cycleDemand);
  const cycleProduction = Math.max(0, input.cycleProduction ?? 0);
  const stock = Math.max(0, input.stock);
  const monthsOfCover = input.monthsOfCover ?? 2;
  const reserveFactor = input.tradeReserveFactor ?? TRADE_RESERVE_FACTOR;
  const slots = Math.max(0, input.cargoSlotsPerUnit);

  const targetStock = monthsOfCover * cycleDemand;
  const localReserve = cycleDemand * (1 + reserveFactor);
  const holdFloor = Math.max(targetStock, localReserve);

  const exportBudget = Math.max(0, stock + cycleProduction - holdFloor);
  const importBudget = Math.max(0, Math.max(targetStock, cycleDemand) - stock - cycleProduction);

  const monthsOfCoverActual = cycleDemand > 1e-9 ? stock / cycleDemand : stock > 0 ? Number.POSITIVE_INFINITY : 0;

  return {
    marketId: input.marketId,
    goodId: input.goodId,
    cycleDemand,
    annualDemand: cycleDemand * CYCLES_PER_YEAR,
    cycleProduction,
    annualProduction: cycleProduction * CYCLES_PER_YEAR,
    stock,
    monthsOfCover,
    targetStock,
    localReserve,
    exportBudget,
    importBudget,
    exportCargoSlots: exportBudget * slots,
    importCargoSlots: importBudget * slots,
    monthsOfCoverActual
  };
}

/** Batch helper for many goods at one market. */
export function computeMarketFlowBudgets(rows: readonly MarketGoodFlowBudgetInput[]): MarketGoodFlowBudget[] {
  return rows.map(computeMarketGoodFlowBudget);
}

export function sumExportCargoSlots(budgets: readonly MarketGoodFlowBudget[]): number {
  return budgets.reduce((sum, row) => sum + row.exportCargoSlots, 0);
}

/**
 * Annual export slots if each cycle's exportBudget repeats (static snapshot annualization).
 * Prefer multi-cycle measured totals when available.
 */
export function annualizeExportCargoSlots(cycleExportCargoSlots: number): number {
  return Math.max(0, cycleExportCargoSlots) * CYCLES_PER_YEAR;
}

/** Size fleet from yearly cargo throughput. */
export function estimateFleetRequirement(input: FleetSizingInput): FleetSizingResult {
  const targetUtilization = input.targetUtilization ?? DEFAULT_TARGET_UTILIZATION;
  const capacity = Math.max(0, input.capacitySlotsPerTrip);
  const effectiveSlotsPerTrip = capacity * Math.min(1, Math.max(0.01, targetUtilization));
  const annual = Math.max(0, input.annualExportCargoSlots);
  const tripsPerYear = effectiveSlotsPerTrip > 0 ? annual / effectiveSlotsPerTrip : 0;
  const roundTrip = Math.max(1, input.meanRoundTripDays);
  const requiredConcurrentVehicles = tripsPerYear * (roundTrip / 365);
  return {
    effectiveSlotsPerTrip,
    tripsPerYear,
    requiredConcurrentVehicles
  };
}

/** Staging depth for accumulation: monthly export slots × wait fraction of a month. */
export function estimateStagingCargoSlots(input: StagingCapacityInput): number {
  const buffer = input.bufferFactor ?? 1.25;
  const monthFraction = Math.max(0, input.maxWaitDays) / 30;
  return Math.max(0, input.meanMonthlyExportCargoSlots) * monthFraction * buffer;
}

export function utilizationOf(usedSlots: number, capacitySlots: number): number {
  if (!(capacitySlots > 0) || !Number.isFinite(capacitySlots)) return 0;
  return Math.max(0, usedSlots) / capacitySlots;
}

/** Summarize caravan / manifest utilization samples (diagnostics A0). */
export function summarizeCaravanUtilization(samples: readonly CaravanUtilizationSample[]): CaravanUtilizationStats {
  if (!samples.length) {
    return {
      count: 0,
      meanUtilization: 0,
      medianUtilization: 0,
      shareUnder10pct: 0,
      shareUnder20pct: 0,
      totalUsedSlots: 0,
      totalCapacitySlots: 0
    };
  }

  const utils = samples.map(sample => utilizationOf(sample.usedSlots, sample.capacitySlots)).sort((a, b) => a - b);
  const totalUsedSlots = samples.reduce((sum, sample) => sum + Math.max(0, sample.usedSlots), 0);
  const totalCapacitySlots = samples.reduce((sum, sample) => sum + Math.max(0, sample.capacitySlots), 0);
  const mid = Math.floor(utils.length / 2);
  const medianUtilization = utils.length % 2 === 0 ? (utils[mid - 1] + utils[mid]) / 2 : utils[mid];
  const meanUtilization = utils.reduce((sum, value) => sum + value, 0) / utils.length;
  const shareUnder10pct = utils.filter(value => value < 0.1).length / utils.length;
  const shareUnder20pct = utils.filter(value => value < 0.2).length / utils.length;

  return {
    count: samples.length,
    meanUtilization,
    medianUtilization,
    shareUnder10pct,
    shareUnder20pct,
    totalUsedSlots,
    totalCapacitySlots
  };
}

/**
 * Build utilization samples from caravan-like objects that already have transportAllocations.
 * Capacity is the bottleneck across modes (same as getManifestCapacitySlots).
 */
export function samplesFromTransportAllocations(
  caravans: readonly {
    transportAllocations?: readonly { capacitySlots: number; usedSlots: number }[];
    payload?: readonly { units: number; cargoSlotsPerUnit?: number; goodId?: number }[];
  }[],
  goodsById?: readonly { cargo?: { cargoSlotsPerUnit: number }; trade?: { bulk?: number } }[]
): CaravanUtilizationSample[] {
  const samples: CaravanUtilizationSample[] = [];
  for (const caravan of caravans) {
    const allocations = caravan.transportAllocations;
    if (!allocations?.length) continue;
    const capacitySlots = Math.min(...allocations.map(allocation => allocation.capacitySlots));
    let usedSlots = allocations[0]?.usedSlots ?? 0;
    if (usedSlots <= 0 && caravan.payload?.length) {
      usedSlots = caravan.payload.reduce((sum, item) => {
        const slotsPerUnit =
          item.cargoSlotsPerUnit ??
          (item.goodId !== undefined && goodsById?.[item.goodId]
            ? getGoodCargoSlotsPerUnit(goodsById[item.goodId] as never)
            : 1);
        return sum + item.units * slotsPerUnit;
      }, 0);
    }
    samples.push({
      usedSlots,
      capacitySlots,
      utilization: utilizationOf(usedSlots, capacitySlots)
    });
  }
  return samples;
}
