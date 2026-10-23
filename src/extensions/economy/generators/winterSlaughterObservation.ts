import type { WinterSlaughterSample, WinterSlaughterState } from "./winterSlaughter";

/** Constraint counts overlap; old saves lacking these observations remain explicitly unmeasured. */
export function summarizeWinterSlaughterDecisions(samples: readonly WinterSlaughterSample[]) {
  const result = {
    eligibleSeasonSamples: 0,
    forecastShortageSamples: 0,
    seasonalShortageSamples: 0,
    activeSamples: 0,
    calendarSamples: 0,
    legacyWorkSamples: 0,
    missingWorkDiagnostics: 0,
    missingDecisionDiagnostics: 0,
    eligibleDecisions: 0,
    laborBlockedDecisions: 0,
    handlingBlockedDecisions: 0,
    outletBlockedDecisions: 0,
    workOverdraftSamples: 0,
    maximumWorkOverdraftDays: 0,
    maximumHeadBalanceError: 0,
    maximumCarcassBalanceErrorKg: 0,
    maximumEdibleBalanceErrorKg: 0,
    firstPeriodFeedNeedReductionKg: 0,
    headsBySpecies: {} as Record<string, number>
  };
  for (const sample of samples) {
    if (sample.eligibleSeason) result.eligibleSeasonSamples++;
    if (sample.forecastUnmetBeforeKg > 0) result.forecastShortageSamples++;
    if (sample.eligibleSeason && sample.forecastUnmetBeforeKg > 0) result.seasonalShortageSamples++;
    if (Object.values(sample.heads).some(heads => heads > 0)) result.activeSamples++;
    if (sample.workBudgetBasis === "calendar") result.calendarSamples++;
    else if (sample.workBudgetBasis === "legacy-average") result.legacyWorkSamples++;
    else result.missingWorkDiagnostics++;
    if (sample.decisions === undefined) result.missingDecisionDiagnostics++;
    for (const decision of sample.decisions ?? []) {
      if (decision.eligibleHeads <= 0) continue;
      result.eligibleDecisions++;
      if (decision.laborHeads <= 0) result.laborBlockedDecisions++;
      if (decision.handlingHeads <= 0) result.handlingBlockedDecisions++;
      if (decision.outletHeads <= 0) result.outletBlockedDecisions++;
    }
    if (
      sample.workReservedDays !== undefined &&
      sample.careWorkDays !== undefined &&
      sample.hayWorkDays !== undefined
    ) {
      const overdraft = Math.max(
        0,
        sample.workDays + sample.careWorkDays + sample.hayWorkDays - sample.workReservedDays
      );
      result.maximumWorkOverdraftDays = Math.max(result.maximumWorkOverdraftDays, overdraft);
      if (overdraft > 1e-6) result.workOverdraftSamples++;
    }
    for (const [species, opening] of Object.entries(sample.sourceOpeningCohorts)) {
      const closing = sample.sourceClosingCohorts[species];
      const error =
        opening.young +
        opening.breeding +
        opening.old -
        (closing.young + closing.breeding + closing.old) -
        (sample.heads[species] ?? 0);
      result.maximumHeadBalanceError = Math.max(result.maximumHeadBalanceError, Math.abs(error));
    }
    for (const [species, heads] of Object.entries(sample.heads))
      result.headsBySpecies[species] = (result.headsBySpecies[species] ?? 0) + heads;
    result.maximumCarcassBalanceErrorKg = Math.max(
      result.maximumCarcassBalanceErrorKg,
      Math.abs(sample.carcassKg - sample.edibleRecoveredKg - sample.nonFoodKg)
    );
    result.maximumEdibleBalanceErrorKg = Math.max(
      result.maximumEdibleBalanceErrorKg,
      Math.abs(sample.edibleRecoveredKg - sample.freshConsumedKg - sample.preservationInputKg)
    );
    result.firstPeriodFeedNeedReductionKg += sample.feedNeedBeforeKg - sample.feedNeedAfterKg;
  }
  return result;
}

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
