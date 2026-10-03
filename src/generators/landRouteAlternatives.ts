import {
  type ConstrainedLandNetwork,
  findConstrainedLandRoute,
  type NetworkRouteResult
} from "./constrainedLandNetwork";
export type ConstrainedRouteQuery = Parameters<typeof findConstrainedLandRoute>[1];
export type AlternativeNetworkRoute = Extract<NetworkRouteResult, { route: unknown }>["route"];
export interface LandAlternativeComparison {
  candidate?: NetworkRouteResult;
  bridgeFree?: NetworkRouteResult;
  riverReturns: NetworkRouteResult[];
  searches: number;
  returnComparisonsEnabled: boolean;
}
export type LandRouteAlternatives = (
  | { route: AlternativeNetworkRoute }
  | {
      reason:
        | Exclude<Extract<NetworkRouteResult, { reason: string }>["reason"], "no-route">
        | "no-route"
        | "comparison-budget";
    }
) & { comparison: LandAlternativeComparison };
/** Compare COMPLETE unregistered routes. Excluding the two facilities of a river
 * return leaves other necessary crossings available and recomputes all direction,
 * history and construction state from the beginning; never splice saved points.
 * One bounded pass over consecutive same-river returns is a heuristic, not a
 * proof that every unnecessary excursion is removed. Zero disables that pass.
 */
export function compareLandRouteAlternatives(
  network: ConstrainedLandNetwork,
  input: {
    query: ConstrainedRouteQuery;
    nearEqualCostMeters: number;
    maxSearches: number;
    maxReturnComparisons: number;
  }
): LandRouteAlternatives {
  const comparison: LandAlternativeComparison = {
    riverReturns: [],
    searches: 0,
    returnComparisonsEnabled: input.maxReturnComparisons > 0
  };
  const fail = (reason: Extract<LandRouteAlternatives, { reason: string }>["reason"]): LandRouteAlternatives => ({
    reason,
    comparison
  });
  if (
    !Number.isFinite(input.nearEqualCostMeters) ||
    input.nearEqualCostMeters < 0 ||
    !Number.isSafeInteger(input.maxSearches) ||
    input.maxSearches < 1 ||
    !Number.isSafeInteger(input.maxReturnComparisons) ||
    input.maxReturnComparisons < 0
  )
    return fail("invalid-input");
  const ids = input.query.allowedConnectionIds ?? [...new Set(network.edges.map(e => e.id))];
  const allowedIds = new Set(ids);
  const query = (allowedConnectionIds: readonly number[]) => {
    if (comparison.searches >= input.maxSearches) return null;
    comparison.searches++;
    return findConstrainedLandRoute(network, { ...input.query, allowedConnectionIds });
  };
  const candidate = query(ids);
  if (!candidate) return fail("comparison-budget");
  comparison.candidate = candidate;
  if (!("route" in candidate)) return fail(candidate.reason);
  const bridgeFree = query([...new Set(network.edges.filter(e => allowedIds.has(e.id) && !e.crossing).map(e => e.id))]);
  if (!bridgeFree) return fail("comparison-budget");
  comparison.bridgeFree = bridgeFree;
  if ("reason" in bridgeFree && bridgeFree.reason !== "no-route") return fail(bridgeFree.reason);
  let route = candidate.route;
  const count = (r: AlternativeNetworkRoute) => r.edges.filter(e => e.crossing).length;
  function consider(other: AlternativeNetworkRoute) {
    const tolerance = Math.max(
      input.nearEqualCostMeters,
      16 * Number.EPSILON * Math.max(1, route.costMeters, other.costMeters)
    );
    if (other.costMeters - route.costMeters <= tolerance && count(other) < count(route)) route = other;
  }
  if ("route" in bridgeFree) consider(bridgeFree.route);
  if (input.maxReturnComparisons > 0) {
    const previous = new Map<number, NonNullable<(typeof route.edges)[number]["crossing"]>>(),
      exclusions = new Map<string, number[]>();
    for (const edge of route.edges)
      if (edge.crossing) {
        const c = edge.crossing,
          prior = previous.get(c.riverId);
        if (prior && prior.fromBank === c.toBank && prior.toBank === c.fromBank) {
          const pair = [...new Set([prior.facilityId, c.facilityId])].sort((a, b) => a - b);
          exclusions.set(pair.join(":"), pair);
          if (exclusions.size > input.maxReturnComparisons) return fail("comparison-budget");
        }
        previous.set(c.riverId, c);
      }
    // Stable river/facility provenance, no coordinate-derived facility identity.
    for (const pair of [...exclusions.values()].sort((a, b) => a[0] - b[0] || (a[1] ?? -1) - (b[1] ?? -1))) {
      const excluded = new Set(pair),
        allowed = [
          ...new Set(
            network.edges
              .filter(e => allowedIds.has(e.id) && (!e.crossing || !excluded.has(e.crossing.facilityId)))
              .map(e => e.id)
          )
        ];
      const alternative = query(allowed);
      if (!alternative) return fail("comparison-budget");
      comparison.riverReturns.push(alternative);
      if ("reason" in alternative) {
        if (alternative.reason !== "no-route") return fail(alternative.reason);
      } else consider(alternative.route);
    }
  }
  return { route, comparison };
}
