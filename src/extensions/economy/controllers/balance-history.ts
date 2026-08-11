/**
 * Balance History — orchestrates capturing `BalanceSnapshot`s (balanceSnapshot.ts) into
 * `useBalanceHistoryState` and exporting the accumulated time series as CSV. Capture points, both
 * wired up in `index.tsx`:
 *   - `recordInitialBalanceSnapshot()`: called at the end of the "economy.initialization"
 *     map-ready task (fresh generation / regenerate map, once Goods/Markets/Production/Fauna have
 *     settled) and at the end of the `fmg:world-loaded` handler (a saved map was loaded). Either
 *     way it clears any previous map's history first and records the "Initial Generation" row.
 *   - `recordAdvanceBalanceSnapshot()`: called on `fmg:time-advance-completed` (host,
 *     `src/generators/timeEngine.ts`) — one row per completed Advance Day/Month/Year action
 *     (button click or `window.fmg.actions.advanceTime()` call), not per calendar day — see that
 *     event's doc-comment for why.
 */

import { downloadFile, getFileName, rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext } from "../economyContext";
import { type BalanceSnapshot, captureBalanceSnapshot } from "../generators/balanceSnapshot";
import {
  beginGoodsBalanceInterval,
  clearGoodsBalanceLedger,
  closeGoodsBalanceInterval,
  type GoodBalanceInterval
} from "../generators/goodsBalanceLedger";
import { useBalanceHistoryState } from "../store/balanceHistoryState";
import { csvDocument } from "./economyCsv";

/** Clears any prior map's history and records the first row for the map that just became ready. */
export function recordInitialBalanceSnapshot(): void {
  useBalanceHistoryState.getState().clear();
  clearGoodsBalanceLedger();
  const snapshot = captureBalanceSnapshot("Initial Generation");
  useBalanceHistoryState.getState().addSnapshot(snapshot);
  beginGoodsBalanceInterval(snapshot);
}

/** Records one row for a just-completed Advance Time action. */
export function recordAdvanceBalanceSnapshot(): void {
  const snapshot = captureBalanceSnapshot("Advance Time");
  useBalanceHistoryState.getState().addSnapshot(snapshot);
  const balance = closeGoodsBalanceInterval(snapshot);
  useBalanceHistoryState.getState().addGoodsBalance(balance.intervals, balance.attributions);
}

export function clearBalanceHistory(): void {
  useBalanceHistoryState.getState().clear();
  clearGoodsBalanceLedger();
}

/** Union of a per-snapshot dynamic column's keys across the whole history, in first-seen order. */
function collectColumnKeys(
  snapshots: readonly BalanceSnapshot[],
  pick: (s: BalanceSnapshot) => Record<string, number>
) {
  const keys = new Set<string>();
  for (const snapshot of snapshots) {
    for (const key of Object.keys(pick(snapshot))) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/**
 * Downloads the accumulated Balance History as CSV. Goods/Fauna get one column per name/species
 * seen in *any* snapshot (a Good added mid-session, e.g. by regenerating Goods, still gets a full
 * column with 0 for earlier rows) rather than a fixed schema, since the enabled Goods/species set
 * is generation-dependent.
 */
export function downloadBalanceHistoryCsv(): void {
  const snapshots = useBalanceHistoryState.getState().snapshots;
  if (snapshots.length === 0) return;

  const goodNames = collectColumnKeys(snapshots, s => s.goods.byGood);
  const speciesNames = collectColumnKeys(snapshots, s => s.fauna.bySpecies);

  const headers = [
    "Label",
    "Year",
    "Month",
    "Day",
    "Tick",
    "Population Total",
    "Population Urban",
    "Population Rural",
    "Urbanization Rate (%)",
    "Goods Total Stock",
    "Fauna Wild Total",
    "Fauna Domesticated Total",
    "Fauna At-Risk Species Count",
    "Total State Treasury",
    "Nutrition Kcal Coverage (%)",
    "Nutrition Protein Coverage (%)",
    ...goodNames.map(name => `Goods: ${name}`),
    ...speciesNames.map(name => `Fauna: ${name}`)
  ];

  const rows = snapshots.map(snapshot => {
    const fixed = [
      snapshot.label,
      snapshot.year,
      snapshot.month,
      snapshot.day,
      snapshot.tickCount,
      snapshot.population.total,
      snapshot.population.urban,
      snapshot.population.rural,
      snapshot.population.urbanizationRate * 100,
      snapshot.goods.totalStock,
      snapshot.fauna.wildTotal,
      snapshot.fauna.domesticatedTotal,
      snapshot.fauna.atRiskSpeciesCount,
      snapshot.totalStateTreasury,
      snapshot.nutrition.kcalCoverageRatio * 100,
      snapshot.nutrition.proteinCoverageRatio * 100
    ];
    const goodsCells = goodNames.map(name => snapshot.goods.byGood[name] ?? 0);
    const speciesCells = speciesNames.map(name => snapshot.fauna.bySpecies[name] ?? 0);
    return [...fixed, ...goodsCells, ...speciesCells].map(value => (typeof value === "number" ? rn(value, 2) : value));
  });

  const csv = csvDocument(headers, rows);
  downloadFile(csv, `${getFileName("BalanceHistory")}.csv`);
}

function formatPoint(point: { year: number; month: number; day: number; tickCount: number }): string {
  return `Y${point.year} M${point.month} D${point.day} T${point.tickCount}`;
}

function balanceWarning(interval: GoodBalanceInterval): string {
  const flags: string[] = [];
  if (Math.abs(interval.accountingGap) > 0.05) flags.push("ACCOUNTING_GAP");
  if (interval.closingStock <= 0.01 && interval.totalSources > 0.01 && interval.totalSinks > 0.01) {
    flags.push("STOCKOUT_WITH_THROUGHPUT");
  }
  if (interval.stockChange > 0.01 && interval.totalSources > interval.totalSinks * 1.25) flags.push("SURPLUS_TREND");
  if (interval.stockChange < -0.01 && interval.totalSinks > interval.totalSources * 1.25) flags.push("DEFICIT_TREND");
  return flags.join(";");
}

/** Downloads one long row per completed interval and Good, suitable for spreadsheet filtering. */
export function downloadGoodsBalanceHistoryCsv(): void {
  const intervals = useBalanceHistoryState.getState().intervals;
  if (!intervals.length) return;

  const headers = [
    "Start",
    "End",
    "Elapsed Days",
    "Good Id",
    "Good",
    "Type",
    "Tags",
    "Opening Market Stock",
    "Rural Harvest",
    "Mine Supply",
    "Smelter Supply",
    "Burg Craft",
    "Import Arrival",
    "Household Food",
    "Household Textiles",
    "Household Heating",
    "Recipe Input",
    "Construction",
    "Smelting",
    "Minting",
    "Military",
    "Market Investment",
    "Shipbuilding",
    "Export Departure",
    "Spoilage",
    "Total Sources",
    "Total Sinks",
    "Closing Market Stock",
    "Stock Change",
    "Net Flow",
    "Net Flow / Day",
    "Accounting Gap",
    "Warning"
  ];
  const rows = intervals.map(interval => [
    formatPoint(interval.start),
    formatPoint(interval.end),
    interval.elapsedDays,
    interval.goodId,
    interval.goodName,
    interval.types,
    interval.tags,
    rn(interval.openingStock, 2),
    rn(interval.ruralHarvest, 2),
    rn(interval.mineSupply, 2),
    rn(interval.smelterSupply, 2),
    rn(interval.burgCraft, 2),
    rn(interval.importArrival, 2),
    rn(interval.householdFood, 2),
    rn(interval.householdTextiles, 2),
    rn(interval.householdHeating, 2),
    rn(interval.recipeInput, 2),
    rn(interval.construction, 2),
    rn(interval.smelting, 2),
    rn(interval.minting, 2),
    rn(interval.military, 2),
    rn(interval.marketInvestment, 2),
    rn(interval.shipbuilding, 2),
    rn(interval.exportDeparture, 2),
    rn(interval.spoilage, 2),
    rn(interval.totalSources, 2),
    rn(interval.totalSinks, 2),
    rn(interval.closingStock, 2),
    rn(interval.stockChange, 2),
    rn(interval.totalSources - interval.totalSinks, 2),
    interval.elapsedDays > 0 ? rn((interval.totalSources - interval.totalSinks) / interval.elapsedDays, 4) : "",
    rn(interval.accountingGap, 2),
    balanceWarning(interval)
  ]);
  downloadFile(csvDocument(headers, rows), `${getFileName("GoodsBalanceHistory")}.csv`);
}

/** Downloads the producer / consumer / guild attribution behind Goods Balance History rows. */
export function downloadGoodsFlowAttributionCsv(): void {
  const attributions = useBalanceHistoryState.getState().attributions;
  if (!attributions.length) return;
  const headers = [
    "Start",
    "End",
    "Direction",
    "Category",
    "Good Id",
    "Good",
    "Units",
    "Market Id",
    "Market",
    "Burg Id",
    "Burg",
    "Guild Domain",
    "Related Output Good Id",
    "Related Output Good"
  ];
  const goodNames = new Map(getGoods().map(good => [good.i, good.name]));
  const marketNames = new Map(getMarkets().map(market => [market.i, market.name || `Market ${market.i}`]));
  const burgNames = new Map(
    getWorldContext()
      .pack.burgs.filter(burg => burg.i && !burg.removed)
      .map(burg => [burg.i!, burg.name || `Burg ${burg.i}`])
  );
  const rows = attributions.map(attribution => [
    formatPoint(attribution.start),
    formatPoint(attribution.end),
    attribution.direction,
    attribution.category,
    attribution.goodId,
    goodNames.get(attribution.goodId) ?? `Good ${attribution.goodId}`,
    rn(attribution.units, 2),
    attribution.marketId,
    attribution.marketId == null ? "" : (marketNames.get(attribution.marketId) ?? `Market ${attribution.marketId}`),
    attribution.burgId,
    attribution.burgId == null ? "" : (burgNames.get(attribution.burgId) ?? `Burg ${attribution.burgId}`),
    attribution.guildDomain,
    attribution.relatedGoodId,
    attribution.relatedGoodId == null
      ? ""
      : (goodNames.get(attribution.relatedGoodId) ?? `Good ${attribution.relatedGoodId}`)
  ]);
  downloadFile(csvDocument(headers, rows), `${getFileName("GoodsFlowAttribution")}.csv`);
}
