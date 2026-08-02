/**
 * A0 flow diagnostics: aggregate multi-cycle market×good samples into annualized reports.
 * Pure module — no economyContext imports.
 *
 * @see docs/plan/market-goods-flow-budget.md §8
 */

import { CYCLES_PER_YEAR, computeMarketGoodFlowBudget, type MarketGoodFlowBudget } from "./marketFlowBudget";
import type { FlowCycleSnapshot, MarketGoodCycleSample } from "./marketFlowTypes";

export type { FlowCycleSnapshot, MarketGoodCycleSample } from "./marketFlowTypes";

export type MarketGoodFlowReportRow = {
  marketId: number;
  goodId: number;
  /** Number of cycle samples that contributed to this row. */
  cycles: number;
  /** Sum of cycle production (raw, not annualized). */
  totalProduction: number;
  /** Sum of cycle demand. */
  totalDemand: number;
  /** Sum of export units. */
  totalExport: number;
  /** Sum of import units. */
  totalImport: number;
  /**
   * Production scaled to a full year: totalProduction * (CYCLES_PER_YEAR / cycles).
   * When cycles === 12 this equals totalProduction.
   */
  annualProd: number;
  annualDemand: number;
  annualExport: number;
  annualImport: number;
  /** End stock from the most recent sample. */
  endStock: number;
  /** endStock / mean cycle demand when demand > 0. */
  monthsCover: number;
  /** Annualized export cargo slots. */
  exportSlots: number;
  /** Annualized import cargo slots. */
  importSlots: number;
  /** Mean soft export budget from stock/demand/production each cycle. */
  meanExportBudget: number;
  meanImportBudget: number;
};

export type FlowReportSummary = {
  cyclesRecorded: number;
  targetCycles: number;
  rows: MarketGoodFlowReportRow[];
  /** Mean of per-cycle caravan utilization means (when recorded). */
  meanCaravanUtilization: number | null;
  medianCaravanUtilization: number | null;
  shareUnder20pct: number | null;
  totalAnnualExportSlots: number;
  totalAnnualImportSlots: number;
};

function annualize(total: number, cycles: number): number {
  if (cycles <= 0) return 0;
  return total * (CYCLES_PER_YEAR / cycles);
}

function budgetFromSample(sample: MarketGoodCycleSample): MarketGoodFlowBudget {
  return computeMarketGoodFlowBudget({
    marketId: sample.marketId,
    goodId: sample.goodId,
    stock: sample.endStock,
    cycleDemand: sample.cycleDemand,
    cycleProduction: sample.cycleProduction,
    monthsOfCover: sample.monthsOfCover,
    cargoSlotsPerUnit: sample.cargoSlotsPerUnit
  });
}

/**
 * Aggregate cycle samples into per market×good report rows.
 * Pass one array of samples per cycle (order does not matter within a cycle).
 */
export function aggregateFlowSamples(
  cycleSamples: readonly (readonly MarketGoodCycleSample[])[]
): MarketGoodFlowReportRow[] {
  type Acc = {
    marketId: number;
    goodId: number;
    cycles: number;
    totalProduction: number;
    totalDemand: number;
    totalExport: number;
    totalImport: number;
    endStock: number;
    totalExportBudget: number;
    totalImportBudget: number;
    totalCargoSlotsPerUnit: number;
    lastCycleDemand: number;
  };

  const byKey = new Map<string, Acc>();

  for (const cycle of cycleSamples) {
    // Track which keys appear this cycle so cycles count is per market×good presence.
    const seen = new Set<string>();
    for (const sample of cycle) {
      const key = `${sample.marketId}:${sample.goodId}`;
      const budget = budgetFromSample(sample);
      let acc = byKey.get(key);
      if (!acc) {
        acc = {
          marketId: sample.marketId,
          goodId: sample.goodId,
          cycles: 0,
          totalProduction: 0,
          totalDemand: 0,
          totalExport: 0,
          totalImport: 0,
          endStock: 0,
          totalExportBudget: 0,
          totalImportBudget: 0,
          totalCargoSlotsPerUnit: 0,
          lastCycleDemand: 0
        };
        byKey.set(key, acc);
      }
      if (!seen.has(key)) {
        acc.cycles += 1;
        seen.add(key);
      }
      acc.totalProduction += Math.max(0, sample.cycleProduction);
      acc.totalDemand += Math.max(0, sample.cycleDemand);
      acc.totalExport += Math.max(0, sample.cycleExport);
      acc.totalImport += Math.max(0, sample.cycleImport);
      acc.endStock = Math.max(0, sample.endStock);
      acc.totalExportBudget += budget.exportBudget;
      acc.totalImportBudget += budget.importBudget;
      acc.totalCargoSlotsPerUnit += Math.max(0, sample.cargoSlotsPerUnit);
      acc.lastCycleDemand = Math.max(0, sample.cycleDemand);
    }
  }

  const rows: MarketGoodFlowReportRow[] = [];
  for (const acc of byKey.values()) {
    const cycles = acc.cycles;
    const meanSlots = cycles > 0 ? acc.totalCargoSlotsPerUnit / cycles : 0;
    const annualExport = annualize(acc.totalExport, cycles);
    const annualImport = annualize(acc.totalImport, cycles);
    const meanDemand = cycles > 0 ? acc.totalDemand / cycles : 0;
    const monthsCover = meanDemand > 1e-9 ? acc.endStock / meanDemand : acc.endStock > 0 ? Number.POSITIVE_INFINITY : 0;

    rows.push({
      marketId: acc.marketId,
      goodId: acc.goodId,
      cycles,
      totalProduction: acc.totalProduction,
      totalDemand: acc.totalDemand,
      totalExport: acc.totalExport,
      totalImport: acc.totalImport,
      annualProd: annualize(acc.totalProduction, cycles),
      annualDemand: annualize(acc.totalDemand, cycles),
      annualExport,
      annualImport,
      endStock: acc.endStock,
      monthsCover,
      exportSlots: annualExport * meanSlots,
      importSlots: annualImport * meanSlots,
      meanExportBudget: cycles > 0 ? acc.totalExportBudget / cycles : 0,
      meanImportBudget: cycles > 0 ? acc.totalImportBudget / cycles : 0
    });
  }

  rows.sort((a, b) => b.exportSlots - a.exportSlots || a.marketId - b.marketId || a.goodId - b.goodId);
  return rows;
}

/** Build a summary object from stored cycle snapshots. */
export function buildFlowReportSummary(
  snapshots: readonly FlowCycleSnapshot[],
  targetCycles: number = CYCLES_PER_YEAR
): FlowReportSummary {
  const cycleSamples = snapshots.map(snapshot => snapshot.samples);
  const rows = aggregateFlowSamples(cycleSamples);

  const utilMeans = snapshots
    .map(snapshot => snapshot.caravanUtilization?.meanUtilization)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const utilMedians = snapshots
    .map(snapshot => snapshot.caravanUtilization?.medianUtilization)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const under20 = snapshots
    .map(snapshot => snapshot.caravanUtilization?.shareUnder20pct)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const totalAnnualExportSlots = rows.reduce((sum, row) => sum + row.exportSlots, 0);
  const totalAnnualImportSlots = rows.reduce((sum, row) => sum + row.importSlots, 0);

  return {
    cyclesRecorded: snapshots.length,
    targetCycles,
    rows,
    meanCaravanUtilization: utilMeans.length
      ? utilMeans.reduce((sum, value) => sum + value, 0) / utilMeans.length
      : null,
    medianCaravanUtilization: utilMedians.length
      ? utilMedians.reduce((sum, value) => sum + value, 0) / utilMedians.length
      : null,
    shareUnder20pct: under20.length ? under20.reduce((sum, value) => sum + value, 0) / under20.length : null,
    totalAnnualExportSlots,
    totalAnnualImportSlots
  };
}

function csvEscape(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return value === Number.POSITIVE_INFINITY ? "Inf" : "";
    return String(Math.round(value * 1000) / 1000);
  }
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type FlowReportCsvNameLookup = {
  marketName?: (marketId: number) => string;
  goodName?: (goodId: number) => string;
};

/**
 * CSV for A0 tables:
 * market, good, annualProd, annualDemand, annualExport, annualImport, endStock, monthsCover, exportSlots
 */
export function formatFlowReportCsv(
  rows: readonly MarketGoodFlowReportRow[],
  names: FlowReportCsvNameLookup = {}
): string {
  const header = [
    "marketId",
    "market",
    "goodId",
    "good",
    "cycles",
    "annualProd",
    "annualDemand",
    "annualExport",
    "annualImport",
    "endStock",
    "monthsCover",
    "exportSlots",
    "importSlots",
    "meanExportBudget",
    "meanImportBudget"
  ].join(",");

  const lines = rows.map(row =>
    [
      row.marketId,
      csvEscape(names.marketName?.(row.marketId) ?? `Market ${row.marketId}`),
      row.goodId,
      csvEscape(names.goodName?.(row.goodId) ?? `Good ${row.goodId}`),
      row.cycles,
      csvEscape(row.annualProd),
      csvEscape(row.annualDemand),
      csvEscape(row.annualExport),
      csvEscape(row.annualImport),
      csvEscape(row.endStock),
      csvEscape(row.monthsCover),
      csvEscape(row.exportSlots),
      csvEscape(row.importSlots),
      csvEscape(row.meanExportBudget),
      csvEscape(row.meanImportBudget)
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

/** Keep only the newest `maxCycles` snapshots (ring buffer semantics). */
export function trimFlowCycleHistory(
  snapshots: readonly FlowCycleSnapshot[],
  maxCycles: number = CYCLES_PER_YEAR
): FlowCycleSnapshot[] {
  if (maxCycles <= 0) return [];
  if (snapshots.length <= maxCycles) return [...snapshots];
  return snapshots.slice(snapshots.length - maxCycles);
}
