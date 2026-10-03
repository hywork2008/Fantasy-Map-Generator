import type { PhysicalWaterIndex } from "./physicalWaterIndex";
import { RIVER_GEOMETRY_TOLERANCE, type RiverPoint } from "./riverGeometry";
import { validWaterPolygon } from "./riverPhysicalGeometry";

export interface CorridorLine {
  kind: "line";
  start: RiverPoint;
  end: RiverPoint;
  lengthMeters: number;
}
export interface CorridorArc {
  kind: "arc";
  start: RiverPoint;
  end: RiverPoint;
  center: RiverPoint;
  radiusMeters: number;
  startAngle: number;
  sweep: number;
  lengthMeters: number;
}
export type CorridorPiece = CorridorLine | CorridorArc;
export const corridorDot = (a: RiverPoint, b: RiverPoint) => a[0] * b[0] + a[1] * b[1];
export const corridorDelta = (a: RiverPoint, b: RiverPoint): RiverPoint => [a[0] - b[0], a[1] - b[1]];
export function corridorUnit(vector: RiverPoint): RiverPoint | null {
  const size = Math.hypot(...vector);
  return Number.isFinite(size) && size > RIVER_GEOMETRY_TOLERANCE ? [vector[0] / size, vector[1] / size] : null;
}
export function sameCorridorDirection(a: RiverPoint, b: RiverPoint): boolean {
  return corridorDot(a, b) > 0 && Math.abs(a[0] * b[1] - a[1] * b[0]) <= RIVER_GEOMETRY_TOLERANCE;
}
export function corridorPositionTolerance(...points: RiverPoint[]): number {
  return Math.max(RIVER_GEOMETRY_TOLERANCE, 16 * Number.EPSILON * Math.max(1, ...points.flatMap(p => p.map(Math.abs))));
}
/** True circular fillet, tangent to the incoming/outgoing lines. A parallel
 * reversal is not a turn; it has no finite-radius fillet and is rejected.
 */
export function makeCorridorTurn(
  vertex: RiverPoint,
  incoming: RiverPoint,
  outgoing: RiverPoint,
  radiusMeters: number
): { trimMeters: number; arc: CorridorArc | null; angle: number } | null {
  if (
    ![...vertex, ...incoming, ...outgoing, radiusMeters].every(Number.isFinite) ||
    radiusMeters <= 0 ||
    Math.abs(Math.hypot(...incoming) - 1) > RIVER_GEOMETRY_TOLERANCE ||
    Math.abs(Math.hypot(...outgoing) - 1) > RIVER_GEOMETRY_TOLERANCE
  )
    return null;
  if (sameCorridorDirection(incoming, outgoing)) return { trimMeters: 0, arc: null, angle: 0 };
  const angle = Math.atan2(incoming[0] * outgoing[1] - incoming[1] * outgoing[0], corridorDot(incoming, outgoing));
  if (Math.abs(angle) >= Math.PI - RIVER_GEOMETRY_TOLERANCE) return null;
  const dot = corridorDot(incoming, outgoing),
    cross = Math.abs(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]);
  const trimMeters = radiusMeters * (dot > 0 ? cross / (1 + dot) : (1 - dot) / cross),
    sign = Math.sign(angle);
  const start: RiverPoint = [vertex[0] - incoming[0] * trimMeters, vertex[1] - incoming[1] * trimMeters];
  const end: RiverPoint = [vertex[0] + outgoing[0] * trimMeters, vertex[1] + outgoing[1] * trimMeters];
  const center: RiverPoint = [
    start[0] - sign * incoming[1] * radiusMeters,
    start[1] + sign * incoming[0] * radiusMeters
  ];
  if (![trimMeters, ...start, ...end, ...center].every(Number.isFinite)) return null;
  return {
    trimMeters,
    angle,
    arc: {
      kind: "arc",
      start,
      end,
      center,
      radiusMeters,
      startAngle: Math.atan2(start[1] - center[1], start[0] - center[0]),
      sweep: angle,
      lengthMeters: radiusMeters * Math.abs(angle)
    }
  };
}
export interface CorridorArcValidation {
  roadWidthMeters: number;
  maxEnvelopeErrorMeters: number;
  maxArcSections: number;
  water: PhysicalWaterIndex;
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
}
/** Cover the entire annular swept road area with convex sector envelopes.
 * The outer chord is moved OUTWARD, so sampling cannot miss water between chords.
 * This is a conservative collision test, not a sampled centerline test.
 */
export function checkCorridorArc(
  arc: CorridorArc,
  input: CorridorArcValidation
):
  | { footprints: readonly (readonly RiverPoint[])[] }
  | { reason: "invalid-arc" | "geometry-budget" | "water-intersection" | "unsupported-terrain" } {
  if (
    ![
      arc.radiusMeters,
      arc.startAngle,
      arc.sweep,
      arc.lengthMeters,
      ...arc.start,
      ...arc.end,
      ...arc.center,
      input.roadWidthMeters,
      input.maxEnvelopeErrorMeters
    ].every(Number.isFinite) ||
    input.roadWidthMeters <= 0 ||
    input.maxEnvelopeErrorMeters <= 0 ||
    arc.radiusMeters <= input.roadWidthMeters / 2 ||
    Math.abs(arc.sweep) <= RIVER_GEOMETRY_TOLERANCE ||
    Math.abs(arc.sweep) >= Math.PI ||
    !Number.isSafeInteger(input.maxArcSections) ||
    input.maxArcSections < 1
  )
    return { reason: "invalid-arc" };
  const tolerance = corridorPositionTolerance(arc.start, arc.end, arc.center);
  const expected = (angle: number): RiverPoint => [
    arc.center[0] + arc.radiusMeters * Math.cos(angle),
    arc.center[1] + arc.radiusMeters * Math.sin(angle)
  ];
  if (
    Math.hypot(...corridorDelta(arc.start, expected(arc.startAngle))) > tolerance ||
    Math.hypot(...corridorDelta(arc.end, expected(arc.startAngle + arc.sweep))) > tolerance ||
    Math.abs(arc.lengthMeters - arc.radiusMeters * Math.abs(arc.sweep)) > tolerance
  )
    return { reason: "invalid-arc" };
  const outer = arc.radiusMeters + input.roadWidthMeters / 2,
    inner = arc.radiusMeters - input.roadWidthMeters / 2;
  const maxAngle = Math.min(Math.PI / 4, 2 * Math.acos(outer / (outer + input.maxEnvelopeErrorMeters)));
  const sections = Math.ceil(Math.abs(arc.sweep) / maxAngle);
  if (!Number.isFinite(sections) || sections > input.maxArcSections) return { reason: "geometry-budget" };
  const delta = arc.sweep / sections,
    enclosingOuter = outer / Math.cos(Math.abs(delta) / 2);
  const footprints: RiverPoint[][] = [];
  for (let i = 0; i < sections; i++) {
    const a = arc.startAngle + i * delta,
      b = a + delta;
    const at = (radius: number, angle: number): RiverPoint => [
      arc.center[0] + radius * Math.cos(angle),
      arc.center[1] + radius * Math.sin(angle)
    ];
    const footprint = [at(inner, a), at(enclosingOuter, a), at(enclosingOuter, b), at(inner, b)];
    if (!validWaterPolygon({ id: -1, rings: [footprint] })) return { reason: "invalid-arc" };
    if (input.water.touchesWater(footprint)) return { reason: "water-intersection" };
    if (!input.supportsDryFootprint(footprint)) return { reason: "unsupported-terrain" };
    footprints.push(footprint);
  }
  return { footprints };
}
export function corridorPieceTangents(piece: CorridorPiece): { start: RiverPoint; end: RiverPoint } | null {
  if (piece.kind === "line") {
    const tangent = corridorUnit(corridorDelta(piece.end, piece.start));
    return tangent ? { start: tangent, end: tangent } : null;
  }
  const sign = Math.sign(piece.sweep),
    endAngle = piece.startAngle + piece.sweep;
  return {
    start: [-sign * Math.sin(piece.startAngle), sign * Math.cos(piece.startAngle)],
    end: [-sign * Math.sin(endAngle), sign * Math.cos(endAngle)]
  };
}
