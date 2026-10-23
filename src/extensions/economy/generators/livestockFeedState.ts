import { getCadencePhase } from "../context/cadencePhases";
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
