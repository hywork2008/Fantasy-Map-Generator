import type { WinterSlaughterState } from "./winterSlaughter";

/** Separate meat mass and diet observations: no conversion into staple ration fulfillment. */
export function observeWinterSlaughter(state: WinterSlaughterState | null) {
  if (!state) return null;
  const samples = state.samples;
  const totals = {
    heads: 0,
    carcassKg: 0,
    edibleRecoveredKg: 0,
    nonFoodKg: 0,
    preservationInputKg: 0,
    completedKg: 0,
    processingLossKg: 0,
    freshConsumedKg: 0,
    preservedConsumedKg: 0,
    spoilageKg: 0,
    saltKg: 0,
    woodKg: 0,
    spending: 0,
    workDays: 0,
    dietaryKcal: 0,
    foregoneAnnualWoolPotentialKg: 0,
    dietaryProteinKg: 0
  };
  for (const row of samples) {
    totals.heads += Object.values(row.heads).reduce((sum, heads) => sum + heads, 0);
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      if (key !== "heads") totals[key] += row[key];
    }
  }
  return {
    schemaVersion: state.schemaVersion,
    periodWindow: samples.length
      ? [Math.min(...samples.map(row => row.period)), Math.max(...samples.map(row => row.period))]
      : null,
    totals,
    stockKg: Object.values(state.stocks).reduce((sum, stock) => sum + stock.remainingKg, 0),
    processingKg: Object.values(state.jobs).reduce(
      (sum, job) => sum + (job.status === "processing" ? job.inputKg : 0),
      0
    ),
    pigFeedSavedKg: null,
    stapleRationCredit: 0,
    samples: structuredClone(samples)
  };
}
