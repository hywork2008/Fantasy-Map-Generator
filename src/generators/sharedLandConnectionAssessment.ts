import type { RiverPoint } from "../services/riverGeometry";
import {
  type ConstrainedLandNetwork,
  findConstrainedLandRoute,
  type NetworkEnvironment,
  type NetworkRouteResult,
  type NetworkSearchSettings
} from "./constrainedLandNetwork";
import {
  type AlternativeNetworkRoute,
  compareLandRouteAlternatives,
  type LandAlternativeComparison
} from "./landRouteAlternatives";

export interface SharedConnectionPair {
  id: number;
  startNodeId: number;
  goalNodeId: number;
  startTangent?: RiverPoint;
  goalTangent?: RiverPoint;
  /** Explicit finite game weighting, not a demand/annualized economic model. */
  weight: number;
  /** Finite credit for reaching an unconnected pair; never inferred as infinity. */
  unconnectedAllowanceMeters: number;
}
export interface SharedConnectionSettings {
  maxPairs: number;
  maxSearches: number;
  maxReturnComparisons: number;
  nearEqualCostMeters: number;
  maxConstructionCostMeters: number;
  maxPairCostMeters: number;
  maxTotalCostMeters: number;
  minimumNetBenefitMeters: number;
}
export interface SharedPairComparison {
  id: number;
  baseline: NetworkRouteResult;
  alternatives: LandAlternativeComparison;
  route?: AlternativeNetworkRoute;
}
export type SharedConnectionAssessment = (
  | {
      status: "proposed";
      routes: readonly { pairId: number; route: AlternativeNetworkRoute }[];
      newConnectionIds: readonly number[];
      newFacilityIds: readonly number[];
      investmentMeters: number;
      operatingScoreMeters: number;
      totalScoreMeters: number;
      benefitBeforeInvestmentMeters: number;
      netBenefitMeters: number;
    }
  | {
      status: "rejected";
      reason:
        | "no-route"
        | "no-addition"
        | "no-shared-facility"
        | "investment-budget"
        | "total-cost-budget"
        | "pair-cost-budget"
        | "insufficient-benefit";
    }
  | {
      status: "unresolved";
      reason:
        | "invalid-input"
        | "pair-budget"
        | "comparison-budget"
        | "search-budget"
        | "invalid-geometry"
        | "invalid-cost"
        | "unvalidated-network";
    }
) & { comparisons: readonly SharedPairComparison[]; searches: number };
/** Bounded caller-selected group on one current network. Shared facilities are
 * hypothetically paid during per-pair selection, then their ACTUAL investment is
 * charged once in the complete package. No network mutation, registrations or
 * per-pair greedy construction. This heuristic is not joint global optimization.
 */
export function assessSharedLandConnections(
  network: ConstrainedLandNetwork,
  input: {
    pairs: readonly SharedConnectionPair[];
    baselineConnectionIds: readonly number[];
    candidateConnectionIds: readonly number[];
    sharedFacilityIds: readonly number[];
    settings: SharedConnectionSettings;
    searchSettings: NetworkSearchSettings;
    environment: NetworkEnvironment;
  }
): SharedConnectionAssessment {
  const comparisons: SharedPairComparison[] = [];
  let searches = 0;
  const s = input.settings;
  const unresolved = (
    reason: Extract<SharedConnectionAssessment, { status: "unresolved" }>["reason"]
  ): SharedConnectionAssessment => ({ status: "unresolved", reason, comparisons, searches });
  const rejected = (
    reason: Extract<SharedConnectionAssessment, { status: "rejected" }>["reason"]
  ): SharedConnectionAssessment => ({ status: "rejected", reason, comparisons, searches });
  if (
    ![s.maxPairs, s.maxSearches].every(n => Number.isSafeInteger(n) && n > 0) ||
    !Number.isSafeInteger(s.maxReturnComparisons) ||
    s.maxReturnComparisons < 0 ||
    ![
      s.nearEqualCostMeters,
      s.maxConstructionCostMeters,
      s.maxPairCostMeters,
      s.maxTotalCostMeters,
      s.minimumNetBenefitMeters
    ].every(n => Number.isFinite(n) && n >= 0)
  )
    return unresolved("invalid-input");
  if (input.pairs.length > s.maxPairs) return unresolved("pair-budget");
  const knownConnections = new Set(network.edges.map(e => e.id)),
    knownFacilities = new Set(network.edges.flatMap(e => (e.crossing ? [e.crossing.facilityId] : [])));
  for (const [ids, known] of [
    [input.baselineConnectionIds, knownConnections],
    [input.candidateConnectionIds, knownConnections],
    [input.sharedFacilityIds, knownFacilities]
  ] as const)
    if (ids.length > known.size || new Set(ids).size !== ids.length || ids.some(id => !known.has(id)))
      return unresolved("invalid-input");
  const connectionsById = new Map(network.edges.map(e => [e.id, e]));
  const facilitiesById = new Map(
    network.edges.flatMap(e => (e.crossing ? [[e.crossing.facilityId, e.crossing] as const] : []))
  );
  const baselineIds = new Set(input.baselineConnectionIds),
    candidateIds = new Set(input.candidateConnectionIds);
  if (input.pairs.length < 2 || !input.sharedFacilityIds.length || [...baselineIds].some(id => !candidateIds.has(id)))
    return unresolved("invalid-input");
  const seenPairs = new Set<string>();
  for (const p of input.pairs) {
    const key = [p.startNodeId, p.goalNodeId].sort((a, b) => a - b).join(":");
    if (
      !Number.isSafeInteger(p.id) ||
      p.id < 0 ||
      p.startNodeId === p.goalNodeId ||
      seenPairs.has(key) ||
      !Number.isFinite(p.weight) ||
      p.weight <= 0 ||
      !Number.isFinite(p.unconnectedAllowanceMeters) ||
      p.unconnectedAllowanceMeters < 0
    )
      return unresolved("invalid-input");
    seenPairs.add(key);
  }
  if (new Set(input.pairs.map(p => p.id)).size !== input.pairs.length) return unresolved("invalid-input");
  const baselineEdges = network.edges.filter(e => baselineIds.has(e.id)),
    existingFacilities = new Set(baselineEdges.flatMap(e => (e.crossing ? [e.crossing.facilityId] : [])));
  const existingConnections = [...baselineIds],
    hypotheticallyPaid = [...new Set([...existingFacilities, ...input.sharedFacilityIds])];
  const routes: { pairId: number; route: AlternativeNetworkRoute }[] = [];
  let operatingScore = 0,
    benefit = 0;
  for (const p of [...input.pairs].sort((a, b) => a.id - b.id)) {
    if (searches >= s.maxSearches) return unresolved("comparison-budget");
    searches++;
    const query = {
      startNodeId: p.startNodeId,
      goalNodeId: p.goalNodeId,
      startTangent: p.startTangent,
      goalTangent: p.goalTangent,
      settings: input.searchSettings,
      environment: input.environment
    };
    const baseline = findConstrainedLandRoute(network, {
      ...query,
      allowedConnectionIds: input.baselineConnectionIds,
      alreadyPaidFacilityIds: [...existingFacilities],
      alreadyPaidConnectionIds: existingConnections
    });
    if ("reason" in baseline && baseline.reason !== "no-route") return unresolved(baseline.reason);
    if (searches >= s.maxSearches) return unresolved("comparison-budget");
    const alternatives = compareLandRouteAlternatives(network, {
      query: {
        ...query,
        allowedConnectionIds: input.candidateConnectionIds,
        alreadyPaidFacilityIds: hypotheticallyPaid,
        alreadyPaidConnectionIds: existingConnections,
        maxConstructionCostMeters: s.maxConstructionCostMeters,
        maxRouteCostMeters: s.maxPairCostMeters
      },
      nearEqualCostMeters: s.nearEqualCostMeters,
      maxSearches: s.maxSearches - searches,
      maxReturnComparisons: s.maxReturnComparisons
    });
    searches += alternatives.comparison.searches;
    const record: SharedPairComparison = { id: p.id, baseline, alternatives: alternatives.comparison };
    comparisons.push(record);
    if ("reason" in alternatives && alternatives.reason !== "no-route") return unresolved(alternatives.reason);
    const route = "route" in alternatives ? alternatives.route : "route" in baseline ? baseline.route : null;
    if (!route) return rejected("no-route");
    if (route.costMeters > s.maxPairCostMeters) return rejected("pair-cost-budget");
    record.route = route;
    routes.push({ pairId: p.id, route });
    const operating = route.costs.travelMeters + route.costs.repeatCrossingMeters;
    operatingScore += p.weight * operating;
    benefit +=
      "route" in baseline
        ? p.weight * (baseline.route.costMeters - operating)
        : p.unconnectedAllowanceMeters - p.weight * operating;
    if (!Number.isFinite(operatingScore) || !Number.isFinite(benefit)) return unresolved("invalid-cost");
  }
  const facilityUsage = new Map<number, number>(),
    newConnections = new Set<number>(),
    newFacilities = new Set<number>();
  for (const { route } of routes) {
    for (const id of route.facilityIds) {
      facilityUsage.set(id, (facilityUsage.get(id) ?? 0) + 1);
      if (!existingFacilities.has(id)) newFacilities.add(id);
    }
    for (const e of route.edges) if (!baselineIds.has(e.id)) newConnections.add(e.id);
  }
  if (!newConnections.size) return rejected("no-addition");
  if (!input.sharedFacilityIds.some(id => (facilityUsage.get(id) ?? 0) >= 2)) return rejected("no-shared-facility");
  let investment = 0;
  for (const id of newFacilities) investment += facilitiesById.get(id)!.constructionCostMeters;
  for (const id of newConnections) investment += connectionsById.get(id)!.connectionConstructionCostMeters ?? 0;
  const totalScore = operatingScore + investment,
    netBenefit = benefit - investment;
  if (![investment, totalScore, netBenefit].every(Number.isFinite)) return unresolved("invalid-cost");
  if (investment > s.maxConstructionCostMeters) return rejected("investment-budget");
  if (totalScore > s.maxTotalCostMeters) return rejected("total-cost-budget");
  const numerical = 16 * Number.EPSILON * Math.max(1, Math.abs(benefit), investment, s.minimumNetBenefitMeters);
  if (netBenefit <= s.minimumNetBenefitMeters || netBenefit - s.minimumNetBenefitMeters <= numerical)
    return rejected("insufficient-benefit");
  return {
    status: "proposed",
    routes,
    newConnectionIds: [...newConnections].sort((a, b) => a - b),
    newFacilityIds: [...newFacilities].sort((a, b) => a - b),
    investmentMeters: investment,
    operatingScoreMeters: operatingScore,
    totalScoreMeters: totalScore,
    benefitBeforeInvestmentMeters: benefit,
    netBenefitMeters: netBenefit,
    comparisons,
    searches
  };
}
