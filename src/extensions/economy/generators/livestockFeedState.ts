import {
  getOrCreateLivestockFeedTable,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext
} from "../economyContext";
import { ANNUAL_FEED_DM_KG_PER_HEAD, getPastureGrowth } from "./livestockFeedPolicy";

export function livestockFeedPeriod(): number {
  return getSimulationYear() * 12 + getSimulationMonth() - 1;
}

/** Before the first real settlement, missing history is neutral rather than fabricated fodder. */
export function getLivestockFeedCoverage(cellId: number): number {
  const row = getOrCreateLivestockFeedTable()?.[cellId];
  const age = row?.feedPeriod === undefined ? Infinity : livestockFeedPeriod() - row.feedPeriod;
  return age >= 0 && age <= 1 ? (row?.coverage ?? 1) : 1;
}

/** Annual potential forage plus actual net purchases, never a second copy of stored local hay. */
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
      (sum, sample) => sum + sample.purchasedKg - sample.soldKg - sample.harvestLossKg - (sample.storageLossKg ?? 0),
      0
    );
  const available = pastureHa * getPastureGrowth(getWorldContext(), cellId).annualKgPerHa + netExternal;
  return Math.max(0, Math.min(1, available / required));
}
