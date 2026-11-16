import Alea from "alea";
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getCadencePhase } from "../context/cadencePhases";
import { getMarketCellColumn } from "../context/cellTables";
import { registerContextFallbackReset } from "../context/economyApi";
import {
  getOrCreateLivestockFeedTable,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext
} from "../economyContext";
import { ANNUAL_FEED_DM_KG_PER_HEAD, getPastureGrowth } from "./livestockFeedPolicy";

let activeFeedPeriod: number | undefined;
registerContextFallbackReset(() => {
  activeFeedPeriod = undefined;
});

export function withLivestockFeedPeriod<T>(period: number | undefined, run: () => T): T {
  const previous = activeFeedPeriod;
  activeFeedPeriod = period ?? previous;
  try {
    return run();
  } finally {
    activeFeedPeriod = previous;
  }
}

export function livestockFeedPeriod(): number {
  const next = getCadencePhase("livestockFeedNextPeriod");
  return activeFeedPeriod ?? (next > 0 ? next - 1 : getSimulationYear() * 12 + getSimulationMonth() - 1);
}

export function livestockFeedMonth(): number {
  return (((livestockFeedPeriod() % 12) + 12) % 12) + 1;
}

/** Before the first real settlement, missing history is neutral rather than fabricated fodder. */
export function getLivestockFeedCoverage(cellId: number): number {
  const row = getOrCreateLivestockFeedTable()?.[cellId];
  const age = row?.feedPeriod === undefined ? Infinity : livestockFeedPeriod() - row.feedPeriod;
  return age >= 0 && age <= 1 ? (row?.coverage ?? 1) : 1;
}

/** Annual potential forage plus actual net purchases and consumed residue equivalents; local hay is not added twice. */
export function getAnnualLivestockFeedFactor(
  cellId: number,
  pastureHa: number,
  targets: readonly { goodName: string; capacityHeads: number }[]
): number {
  const required = targets.reduce(
    (sum, row) => sum + row.capacityHeads * (ANNUAL_FEED_DM_KG_PER_HEAD[row.goodName] ?? 0),
    0
  );
  if (!(required > 0)) return 1;
  const period = livestockFeedPeriod();
  const samples = getOrCreateLivestockFeedTable()?.[cellId]?.samples ?? [];
  const netExternal = samples
    .filter(sample => sample.period <= period && sample.period > period - 12)
    .reduce(
      (sum, sample) =>
        sum +
        sample.purchasedKg +
        (sample.cropResidueFeedKg ?? 0) -
        sample.soldKg -
        sample.harvestLossKg -
        (sample.storageLossKg ?? 0),
      0
    );
  const available = pastureHa * getPastureGrowth(getWorldContext(), cellId).annualKgPerHa + netExternal;
  return Math.max(0, Math.min(1, available / required));
}

/**
 * Animals the cell actually fed over the last twelve settled months, in heads of its current herd:
 * current heads x fed/required. Null until most of a year is recorded or when the year was fully fed.
 * The annual herd update can run before the last month's feed settles, so ten months suffice.
 * Grass that stood uncut for want of hands in haymaking does not feed animals in winter (E1 §7.45).
 */
export function getRecentlyFedHerdShare(cellId: number): number | null {
  const period = livestockFeedPeriod();
  const samples = (getOrCreateLivestockFeedTable()?.[cellId]?.samples ?? []).filter(
    sample => sample.period <= period && sample.period > period - 12
  );
  if (samples.length < 10) return null;
  const required = samples.reduce((sum, sample) => sum + sample.requiredKg, 0);
  if (!(required > 0)) return null;
  // Grain only tides the herd over: where keepers answer the shortfall with the herd, it is not counted as fed.
  const grainUncounted = getFeedShortfallResponse(cellId) === "herd";
  const share =
    samples.reduce((sum, sample) => sum + sample.fedKg - (grainUncounted ? (sample.grainFeedKg ?? 0) : 0), 0) /
    required;
  return share < 1 ? Math.max(0, share) : null;
}

/**
 * How a cell answers a year short of feed (docs/plan/livestock-feed-shortfall.md §7): when the last twelve settled
 * months needed grain or went unfed beyond 1% of need, next year's keepers either make hay on rest days as work
 * of necessity ("work") or winter fewer animals, not counting the grain as feed ("herd"). `random` draws one per
 * cell and year from the world seed, `feedShortfallWorkShare` of them "work". Null when the year was fed.
 */
export function getFeedShortfallResponse(cellId: number): "work" | "herd" | null {
  const { feedShortfallResponse, feedShortfallWorkShare } = getMarketSettings();
  if (feedShortfallResponse === "legacy") return null;
  const period = livestockFeedPeriod();
  const samples = (getOrCreateLivestockFeedTable()?.[cellId]?.samples ?? []).filter(
    sample => sample.period <= period && sample.period > period - 12
  );
  const required = samples.reduce((sum, sample) => sum + sample.requiredKg, 0);
  if (samples.length < 10 || !(required > 0)) return null;
  const short = samples.reduce(
    (sum, sample) => sum + Math.max(0, sample.requiredKg - sample.fedKg + (sample.grainFeedKg ?? 0)),
    0
  );
  if (!(short > 0.01 * required)) return null;
  if (feedShortfallResponse !== "random") return feedShortfallResponse;
  const draw = Alea(`feed-shortfall:${getWorldContext().seed ?? ""}:${cellId}:${getSimulationYear()}`)();
  return draw < feedShortfallWorkShare ? "work" : "herd";
}

/**
 * Share of full carcass weight the stock of each market gives at slaughter (docs/plan/livestock-lean-condition.md):
 * 1 less `leanMaxCarcassLoss` times the body reserve spent, averaged over the market's cells by this month's feed
 * need. Markets with no lean stock are absent (full carcasses).
 */
export function getMarketLeanCarcassFactors(): Map<number, number> {
  const factors = new Map<number, number>();
  const { leanCondition, leanReserveMonths, leanMaxCarcassLoss } = getMarketSettings();
  if (leanCondition === "off") return factors;
  const table = getOrCreateLivestockFeedTable();
  if (!table) return factors;
  const marketCells = getMarketCellColumn();
  const sums = new Map<number, { need: number; lost: number }>();
  for (const [key, row] of Object.entries(table)) {
    if (!row || !(row.requiredKg > 0)) continue;
    const market = marketCells[Number(key)] ?? 0;
    const sum = sums.get(market) ?? { need: 0, lost: 0 };
    sum.need += row.requiredKg;
    sum.lost += Math.min(row.requiredKg, (row.leanDeficitKg ?? 0) / leanReserveMonths);
    sums.set(market, sum);
  }
  for (const [market, sum] of sums)
    if (sum.lost > 0) factors.set(market, 1 - (leanMaxCarcassLoss * sum.lost) / sum.need);
  return factors;
}

/**
 * Share of full milk lean stock give (docs/plan/livestock-lean-condition.md §8): 1 less `leanMilkLoss` times the body
 * reserve spent, until the herd is refed.
 */
export function getLeanMilkFactor(cellId: number): number {
  const { leanCondition, leanReserveMonths, leanMilkLoss } = getMarketSettings();
  if (leanCondition === "off" || !(leanMilkLoss > 0)) return 1;
  const row = getOrCreateLivestockFeedTable()?.[cellId];
  const need = row?.leanNeedKg ?? 0;
  if (!row || !(need > 0) || !((row.leanDeficitKg ?? 0) > 0)) return 1;
  return 1 - leanMilkLoss * Math.min(1, (row.leanDeficitKg ?? 0) / (leanReserveMonths * need));
}
