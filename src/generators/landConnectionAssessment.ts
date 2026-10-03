import type { RiverPoint } from "../services/riverGeometry";
import {
  type ConstrainedLandNetwork,
  findConstrainedLandRoute,
  type NetworkEnvironment,
  type NetworkRouteResult,
  type NetworkSearchSettings
} from "./constrainedLandNetwork";

export type AssessedNetworkRoute = Extract<NetworkRouteResult, { route: unknown }>["route"];
export interface LandConnectionAssessmentSettings {
  minimumImprovementMeters: number;
  nearEqualCostMeters: number;
  maxConstructionCostMeters: number;
  maxRouteCostMeters: number;
  maxSearches: number;
}
export interface LandConnectionComparison {
  baseline?: NetworkRouteResult;
  candidate?: NetworkRouteResult;
  bridgeFree?: NetworkRouteResult;
  searches: number;
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
  const candidate = query(input.candidateConnectionIds, true);
  if (!candidate) return unresolved("comparison-budget");
  comparison.candidate = candidate;
  const cf = failure(candidate);
  if (cf) return cf;
  if (!("route" in candidate))
    return "route" in baseline
      ? { status: "keep-baseline", reason: "no-feasible-proposal", route: baseline.route, comparison }
      : { status: "rejected", reason: "no-feasible-proposal", comparison };
  // Whole-route same-bank counterfactual. It does not replace point subpaths in
  // the candidate: choose a complete validated route, preserving shared geometry.
  const bridgeFreeIds = [...new Set(network.edges.filter(e => candidateIds.has(e.id) && !e.crossing).map(e => e.id))];
  const bridgeFree = query(bridgeFreeIds, true);
  if (!bridgeFree) return unresolved("comparison-budget");
  comparison.bridgeFree = bridgeFree;
  const df = failure(bridgeFree);
  if (df) return df;
  let route = candidate.route;
  const crossings = (r: AssessedNetworkRoute) => r.edges.filter(e => e.crossing).length;
  const tolerance = (a: number, b: number) => Math.max(s.nearEqualCostMeters, 16 * Number.EPSILON * Math.max(1, a, b));
  if (
    "route" in bridgeFree &&
    bridgeFree.route.costMeters - route.costMeters <= tolerance(route.costMeters, bridgeFree.route.costMeters) &&
    crossings(bridgeFree.route) < crossings(route)
  )
    route = bridgeFree.route;
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
