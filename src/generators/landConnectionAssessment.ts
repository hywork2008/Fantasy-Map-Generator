import type { RiverPoint } from "../services/riverGeometry";
import {
  type ConstrainedLandNetwork,
  findConstrainedLandRoute,
  type NetworkEnvironment,
  type NetworkRouteResult,
  type NetworkSearchSettings
} from "./constrainedLandNetwork";
import { compareLandRouteAlternatives } from "./landRouteAlternatives";

export type AssessedNetworkRoute = Extract<NetworkRouteResult, { route: unknown }>["route"];
export interface LandConnectionAssessmentSettings {
  minimumImprovementMeters: number;
  nearEqualCostMeters: number;
  maxConstructionCostMeters: number;
  maxRouteCostMeters: number;
  maxSearches: number;
  /** Explicitly enable the bounded same-river return pass; omitted preserves the earlier gate. */
  maxReturnComparisons?: number;
}
export interface LandConnectionComparison {
  baseline?: NetworkRouteResult;
  candidate?: NetworkRouteResult;
  bridgeFree?: NetworkRouteResult;
  searches: number;
  riverReturns?: readonly NetworkRouteResult[];
}
export type LandConnectionAssessment = (
  | {
      status: "proposed";
      route: AssessedNetworkRoute;
      newFacilityIds: readonly number[];
      newConnectionIds: readonly number[];
      travelSavingMeters: number | null;
      netImprovementMeters: number | null;
    }
  | {
      status: "keep-baseline";
      route: AssessedNetworkRoute;
      reason: "no-addition" | "insufficient-improvement" | "near-equal-fewer-crossings" | "no-feasible-proposal";
    }
  | { status: "rejected"; reason: "no-feasible-proposal" }
  | {
      status: "unresolved";
      reason:
        | "invalid-input"
        | "comparison-budget"
        | "search-budget"
        | "invalid-geometry"
        | "invalid-cost"
        | "unvalidated-network";
    }
) & { comparison: LandConnectionComparison };
/** Read-only one-pair proposal gate, never a construction/registration operation.
 * Availability is explicit: baseline IDs are currently usable connections, not
 * inferred from cells, cost=0 or missing routes. No ferry/water transport is invented.
 * All routes use the SAME endpoints, direction contract and current geometry.
 */
export function assessLandConnection(
  network: ConstrainedLandNetwork,
  input: {
    startNodeId: number;
    goalNodeId: number;
    startTangent?: RiverPoint;
    goalTangent?: RiverPoint;
    baselineConnectionIds: readonly number[];
    candidateConnectionIds: readonly number[];
    searchSettings: NetworkSearchSettings;
    settings: LandConnectionAssessmentSettings;
    environment: NetworkEnvironment;
  }
): LandConnectionAssessment {
  const comparison: LandConnectionComparison = { searches: 0 },
    s = input.settings;
  const unresolved = (
    reason: Extract<LandConnectionAssessment, { status: "unresolved" }>["reason"]
  ): LandConnectionAssessment => ({ status: "unresolved", reason, comparison });
  if (
    ![s.minimumImprovementMeters, s.nearEqualCostMeters, s.maxConstructionCostMeters, s.maxRouteCostMeters].every(
      n => Number.isFinite(n) && n >= 0
    ) ||
    !Number.isSafeInteger(s.maxSearches) ||
    s.maxSearches < 1
  )
    return unresolved("invalid-input");
  const known = new Set(network.edges.map(e => e.id));
  for (const ids of [input.baselineConnectionIds, input.candidateConnectionIds])
    if (ids.length > known.size || new Set(ids).size !== ids.length || ids.some(id => !known.has(id)))
      return unresolved("invalid-input");
  const baselineIds = new Set(input.baselineConnectionIds),
    candidateIds = new Set(input.candidateConnectionIds);
  if ([...baselineIds].some(id => !candidateIds.has(id))) return unresolved("invalid-input");
  const baselineEdges = network.edges.filter(e => baselineIds.has(e.id));
  const paidFacilities = [...new Set(baselineEdges.flatMap(e => (e.crossing ? [e.crossing.facilityId] : [])))];
  const paidRoads = [...new Set(baselineEdges.map(e => e.id))];
  const query = (ids: readonly number[], bounded: boolean): NetworkRouteResult | null => {
    if (comparison.searches >= s.maxSearches) return null;
    comparison.searches++;
    return findConstrainedLandRoute(network, {
      startNodeId: input.startNodeId,
      goalNodeId: input.goalNodeId,
      startTangent: input.startTangent,
      goalTangent: input.goalTangent,
      settings: input.searchSettings,
      environment: input.environment,
      allowedConnectionIds: ids,
      alreadyPaidFacilityIds: paidFacilities,
      alreadyPaidConnectionIds: paidRoads,
      ...(bounded
        ? { maxConstructionCostMeters: s.maxConstructionCostMeters, maxRouteCostMeters: s.maxRouteCostMeters }
        : {})
    });
  };
  const failure = (r: NetworkRouteResult): LandConnectionAssessment | null =>
    "reason" in r && r.reason !== "no-route" ? unresolved(r.reason) : null;
  const baseline = query(input.baselineConnectionIds, false);
  if (!baseline) return unresolved("comparison-budget");
  comparison.baseline = baseline;
  const bf = failure(baseline);
  if (bf) return bf;
  if (comparison.searches >= s.maxSearches) return unresolved("comparison-budget");
  const alternatives = compareLandRouteAlternatives(network, {
    query: {
      startNodeId: input.startNodeId,
      goalNodeId: input.goalNodeId,
      startTangent: input.startTangent,
      goalTangent: input.goalTangent,
      settings: input.searchSettings,
      environment: input.environment,
      allowedConnectionIds: input.candidateConnectionIds,
      alreadyPaidFacilityIds: paidFacilities,
      alreadyPaidConnectionIds: paidRoads,
      maxConstructionCostMeters: s.maxConstructionCostMeters,
      maxRouteCostMeters: s.maxRouteCostMeters
    },
    nearEqualCostMeters: s.nearEqualCostMeters,
    maxSearches: s.maxSearches - comparison.searches,
    maxReturnComparisons: s.maxReturnComparisons ?? 0
  });
  comparison.searches += alternatives.comparison.searches;
  comparison.candidate = alternatives.comparison.candidate;
  comparison.bridgeFree = alternatives.comparison.bridgeFree;
  comparison.riverReturns = alternatives.comparison.riverReturns;
  if ("reason" in alternatives) {
    if (alternatives.reason !== "no-route") return unresolved(alternatives.reason);
    return "route" in baseline
      ? { status: "keep-baseline", reason: "no-feasible-proposal", route: baseline.route, comparison }
      : { status: "rejected", reason: "no-feasible-proposal", comparison };
  }
  const route = alternatives.route;
  const crossings = (r: AssessedNetworkRoute) => r.edges.filter(e => e.crossing).length;
  const tolerance = (a: number, b: number) => Math.max(s.nearEqualCostMeters, 16 * Number.EPSILON * Math.max(1, a, b));
  const newConnectionIds = [...new Set(route.edges.filter(e => !baselineIds.has(e.id)).map(e => e.id))].sort(
    (a, b) => a - b
  );
  if (!newConnectionIds.length) return { status: "keep-baseline", reason: "no-addition", route, comparison };
  if ("route" in baseline) {
    if (
      Math.abs(baseline.route.costMeters - route.costMeters) <=
        tolerance(baseline.route.costMeters, route.costMeters) &&
      crossings(baseline.route) < crossings(route)
    )
      return { status: "keep-baseline", reason: "near-equal-fewer-crossings", route: baseline.route, comparison };
    const improvement = baseline.route.costMeters - route.costMeters;
    const numerical =
      16 * Number.EPSILON * Math.max(1, baseline.route.costMeters, route.costMeters, s.minimumImprovementMeters);
    if (improvement <= s.minimumImprovementMeters || improvement - s.minimumImprovementMeters <= numerical)
      return { status: "keep-baseline", reason: "insufficient-improvement", route: baseline.route, comparison };
  }
  const newFacilityIds = route.facilityIds.filter(id => !paidFacilities.includes(id));
  return {
    status: "proposed",
    route,
    newFacilityIds,
    newConnectionIds,
    travelSavingMeters: "route" in baseline ? baseline.route.costs.travelMeters - route.costs.travelMeters : null,
    netImprovementMeters: "route" in baseline ? baseline.route.costMeters - route.costMeters : null,
    comparison
  };
}
