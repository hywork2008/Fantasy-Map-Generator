import type { WorldProposalDiagnostics, WorldProposalSettings } from "./worldLandConnectionProposals";

export interface LandSearchMeasurements {
  networkLabels: number;
  networkExpansions: number;
  approachLabels: number;
  approachExpansions: number;
}
export interface LandBudgetPolicy {
  headroom: number;
  minimum: LandSearchMeasurements;
  ceiling: LandSearchMeasurements;
  maxAssessmentSearches: number;
}
/** Measured peaks with explicit headroom, bounded by caller ceilings. Counts are
 * operation budgets, not a promise of wall-clock latency. Keep precision,
 * radius, slopes and perpendicularity unchanged. Reserve one whole shared
 * prepare/commit comparison after evaluation. */
export function tuneLandConnectionBudgets(
  settings: WorldProposalSettings,
  measurements: LandSearchMeasurements,
  policy: LandBudgetPolicy,
  pairCount: number
): { settings: WorldProposalSettings; ceilingLimited: boolean; requiredAssessmentSearches: number } {
  const keys = ["networkLabels", "networkExpansions", "approachLabels", "approachExpansions"] as const;
  if (
    !Number.isFinite(policy.headroom) ||
    policy.headroom < 1 ||
    !Number.isSafeInteger(pairCount) ||
    pairCount < 1 ||
    pairCount > settings.maxPairs ||
    !Number.isSafeInteger(policy.maxAssessmentSearches) ||
    policy.maxAssessmentSearches < 1 ||
    !keys.every(
      key =>
        Number.isSafeInteger(measurements[key]) &&
        measurements[key] >= 0 &&
        Number.isSafeInteger(policy.minimum[key]) &&
        policy.minimum[key] > 0 &&
        Number.isSafeInteger(policy.ceiling[key]) &&
        policy.ceiling[key] >= policy.minimum[key]
    )
  )
    throw new Error("invalid-land-budget-policy");
  const tuned = structuredClone(settings);
  let ceilingLimited = false;
  const size = (key: (typeof keys)[number]) => {
    const wanted = Math.max(policy.minimum[key], Math.ceil(measurements[key] * policy.headroom));
    ceilingLimited ||= wanted > policy.ceiling[key];
    return Math.min(wanted, policy.ceiling[key]);
  };
  tuned.search.maxLabels = size("networkLabels");
  tuned.search.maxExpansions = size("networkExpansions");
  tuned.approaches.corridor.maxLabels = size("approachLabels");
  tuned.approaches.corridor.maxExpansions = size("approachExpansions");
  if (
    ![settings.individual.maxReturnComparisons ?? 0, settings.shared.maxReturnComparisons].every(
      n => Number.isSafeInteger(n) && n >= 0
    )
  )
    throw new Error("invalid-land-budget-policy");
  const individual = 3 + (settings.individual.maxReturnComparisons ?? 0);
  const sharedPerPair = 3 + settings.shared.maxReturnComparisons;
  const groups = settings.sharedSelection?.maxGroups ?? 1;
  const groupPairs = Math.min(
    pairCount,
    settings.shared.maxPairs,
    settings.sharedSelection?.maxPairsPerGroup ?? pairCount
  );
  const shared = pairCount < 2 ? 0 : sharedPerPair * groupPairs;
  const requiredAssessmentSearches =
    individual * pairCount +
    (settings.sharedSelection && pairCount >= 2 ? pairCount : 0) +
    shared * groups +
    2 * Math.max(individual, shared);
  if (![individual, sharedPerPair, groups, requiredAssessmentSearches].every(n => Number.isSafeInteger(n) && n > 0))
    throw new Error("invalid-land-budget-policy");
  ceilingLimited ||= requiredAssessmentSearches > policy.maxAssessmentSearches;
  tuned.individual.maxSearches = individual;
  tuned.shared.maxSearches = shared || sharedPerPair * 2;
  tuned.maxAssessmentSearches = Math.min(requiredAssessmentSearches, policy.maxAssessmentSearches);
  return { settings: tuned, ceilingLimited, requiredAssessmentSearches };
}

/** Includes rejected/unresolved comparisons: successful routes alone would hide
 * the very budget pressure this measurement is intended to detect. */
export function measureLandProposalSearches(diagnostics: WorldProposalDiagnostics): LandSearchMeasurements {
  const measurements: LandSearchMeasurements = {
    networkLabels: 0,
    networkExpansions: 0,
    approachLabels: diagnostics.approachSearchPeak?.labels ?? 0,
    approachExpansions: diagnostics.approachSearchPeak?.expansions ?? 0
  };
  const observe = (result: { stats: { labels: number; expansions: number } } | undefined) => {
    if (!result) return;
    measurements.networkLabels = Math.max(measurements.networkLabels, result.stats.labels);
    measurements.networkExpansions = Math.max(measurements.networkExpansions, result.stats.expansions);
  };
  for (const entry of diagnostics.individuals) {
    const comparison = entry.assessment.comparison;
    observe(comparison.baseline);
    observe(comparison.candidate);
    observe(comparison.bridgeFree);
    for (const result of comparison.riverReturns ?? []) observe(result);
  }
  for (const search of diagnostics.sharedBundleSearches ?? []) observe(search.result);
  const shared = [
    ...(diagnostics.shared ? [diagnostics.shared] : []),
    ...(diagnostics.sharedGroups ?? []).map(record => record.assessment)
  ];
  for (const assessment of shared)
    for (const comparison of assessment.comparisons) {
      observe(comparison.baseline);
      observe(comparison.alternatives.candidate);
      observe(comparison.alternatives.bridgeFree);
      for (const result of comparison.alternatives.riverReturns) observe(result);
    }
  return measurements;
}
