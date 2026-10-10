import { bridgeSkewDegrees, bridgeSkewLimitForPeriod, withinBridgeSkewLimit } from "../utils/bridgeSkewPolicy";
import { buildPolylineRiverAxis, RIVER_GEOMETRY_TOLERANCE, type RiverPoint } from "./riverGeometry";

export interface DiagnosticRiver {
  id: number;
  points: readonly RiverPoint[];
}
export interface DiagnosticRoute {
  id: number;
  points: readonly RiverPoint[];
}
export interface CrossingObservation {
  routeId: number;
  riverId: number;
  routeSegment: number;
  riverSegment: number;
  point: RiverPoint;
  riverArcLength: number;
  normalizedDot: number;
  status: "perpendicular" | "oblique" | "ambiguous";
  /** Deviation of the route from the river normal (0° = square). */
  skewDegrees: number;
  /** False when an oblique crossing exceeds the bridge skew limit (bridgeSkewPolicy.ts). */
  withinSkewLimit: boolean;
}
const cross = (a: RiverPoint, b: RiverPoint) => a[0] * b[1] - a[1] * b[0];
/** Read-only baseline audit. Does not certify bridge banks, approaches, or smooth renderers.
 * Every geometry pair is inspected, including routes with no shared river cell IDs.
 * Repeated crossings are observations, not proof that a same-bank detour is available.
 */
export function diagnosePolylineRiverCrossings(
  rivers: readonly DiagnosticRiver[],
  routes: readonly DiagnosticRoute[],
  maxSkewDegrees = bridgeSkewLimitForPeriod()
) {
  const crossings: CrossingObservation[] = [];
  const unresolved: { kind: "river" | "route"; id: number; reason: "invalid-axis" | "overlap"; otherId?: number }[] =
    [];
  const axes = rivers.map(r => ({ id: r.id, axis: buildPolylineRiverAxis(r.id, 0, r.points) }));
  for (const river of axes) if (!river.axis) unresolved.push({ kind: "river", id: river.id, reason: "invalid-axis" });
  for (const route of routes) {
    const routeAxis = buildPolylineRiverAxis(route.id, 0, route.points);
    if (!routeAxis) {
      unresolved.push({ kind: "route", id: route.id, reason: "invalid-axis" });
      continue;
    }
    for (const river of axes) {
      if (!river.axis) continue;
      const observations: CrossingObservation[] = [];
      for (const road of routeAxis.segments)
        for (const water of river.axis.segments) {
          const offset: RiverPoint = [water.start[0] - road.start[0], water.start[1] - road.start[1]];
          const denominator = cross(road.tangent, water.tangent);
          if (Math.abs(denominator) <= RIVER_GEOMETRY_TOLERANCE) {
            if (Math.abs(cross(offset, road.tangent)) > RIVER_GEOMETRY_TOLERANCE) continue;
            const lo = offset[0] * road.tangent[0] + offset[1] * road.tangent[1];
            const hi = lo + water.length * (road.tangent[0] * water.tangent[0] + road.tangent[1] * water.tangent[1]);
            if (
              Math.min(road.length, Math.max(lo, hi)) - Math.max(0, Math.min(lo, hi)) > RIVER_GEOMETRY_TOLERANCE &&
              !unresolved.some(
                u => u.kind === "route" && u.id === route.id && u.otherId === river.id && u.reason === "overlap"
              )
            )
              unresolved.push({ kind: "route", id: route.id, otherId: river.id, reason: "overlap" });
            continue;
          }
          const roadDistance = cross(offset, water.tangent) / denominator;
          const waterDistance = cross(offset, road.tangent) / denominator;
          if (roadDistance < 0 || roadDistance > road.length || waterDistance < 0 || waterDistance > water.length)
            continue;
          const point: RiverPoint = [
            road.start[0] + roadDistance * road.tangent[0],
            road.start[1] + roadDistance * road.tangent[1]
          ];
          const dot = Math.abs(road.tangent[0] * water.tangent[0] + road.tangent[1] * water.tangent[1]);
          const skewDegrees = bridgeSkewDegrees(road.tangent, water.tangent);
          const vertex =
            roadDistance === 0 || roadDistance === road.length || waterDistance === 0 || waterDistance === water.length;
          const previous = observations.find(
            o =>
              Math.hypot(o.point[0] - point[0], o.point[1] - point[1]) <= RIVER_GEOMETRY_TOLERANCE &&
              Math.abs(o.riverArcLength - water.arcStart - waterDistance) <= RIVER_GEOMETRY_TOLERANCE
          );
          if (previous) {
            previous.status = "ambiguous";
            continue;
          }
          observations.push({
            routeId: route.id,
            riverId: river.id,
            routeSegment: road.index,
            riverSegment: water.index,
            point,
            riverArcLength: water.arcStart + waterDistance,
            normalizedDot: dot,
            skewDegrees,
            withinSkewLimit: withinBridgeSkewLimit(skewDegrees, maxSkewDegrees),
            status: vertex ? "ambiguous" : dot <= RIVER_GEOMETRY_TOLERANCE ? "perpendicular" : "oblique"
          });
        }
      crossings.push(...observations);
    }
  }
  const repeatedCrossings = routes.flatMap(route =>
    rivers.flatMap(river => {
      const count = crossings.filter(c => c.routeId === route.id && c.riverId === river.id).length;
      return count > 1 ? [{ routeId: route.id, riverId: river.id, count }] : [];
    })
  );
  return { crossings, unresolved, repeatedCrossings };
}
