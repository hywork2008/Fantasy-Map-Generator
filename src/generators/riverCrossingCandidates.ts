import { sampleRiverAxis } from "../services/riverAxisSampling";
import { RIVER_GEOMETRY_TOLERANCE, type RiverPoint } from "../services/riverGeometry";
import {
  footprintTouchesWater,
  type NormalBankHit,
  normalWaterSection,
  type PhysicalRiverGeometry,
  type PhysicalWaterPolygon,
  validWaterPolygon
} from "../services/riverPhysicalGeometry";
import { planRiverCrossing, type RiverCrossingPlan } from "../utils/riverCrossing";

/** Design values are explicit until seed-based calibration supplies central defaults. */
export interface CrossingCandidateDimensions {
  bankSeatMeters: number;
  straightApproachMeters: number;
  roadWidthMeters: number;
  localWindowMeters: number;
}
export interface ProvisionalRiverCrossing {
  id: number;
  riverId: number;
  geometryVersion: number;
  arcLengthMeters: number;
  q: RiverPoint;
  tRiver: RiverPoint;
  nCrossing: RiverPoint;
  waterA: RiverPoint;
  waterB: RiverPoint;
  deckA: RiverPoint;
  deckB: RiverPoint;
  approachA: RiverPoint;
  approachB: RiverPoint;
  banks: readonly [NormalBankHit, NormalBankHit];
  waterDistanceMeters: number;
  deckLengthMeters: number;
  plan: RiverCrossingPlan;
  /** External approach corridors still require directional search and curvature validation. */
  status: "provisional";
}
export interface CrossingCandidateInput {
  id: number;
  geometry: PhysicalRiverGeometry;
  arcLengthMeters: number;
  dimensions: CrossingCandidateDimensions;
  /** Complete water obstacles in the local corridor, including lakes and other rivers. */
  otherWater: readonly PhysicalWaterPolygon[];
  capability: Omit<Parameters<typeof planRiverCrossing>[0], "widthMeters">;
  /** Mandatory terrain check of the whole dry footprint, not just its endpoints. */
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
}
export type CrossingCandidateResult =
  | { candidate: ProvisionalRiverCrossing }
  | {
      reason:
        | "invalid-input"
        | "unstable-axis"
        | "unresolved-section"
        | "nonlocal-banks"
        | "wet-approach"
        | "unsupported-bank"
        | "compound-crossing"
        | "bridge-unavailable";
    };
const epsilon = RIVER_GEOMETRY_TOLERANCE;
const dot = (a: RiverPoint, b: RiverPoint) => a[0] * b[0] + a[1] * b[1];
const relative = (a: RiverPoint, b: RiverPoint): RiverPoint => [a[0] - b[0], a[1] - b[1]];

/** Clip one boundary edge to the finite occupied rectangle in the section frame. */
function clippedEdge(
  a: RiverPoint,
  b: RiverPoint,
  q: RiverPoint,
  tangent: RiverPoint,
  normal: RiverPoint,
  lo: number,
  hi: number,
  halfWidth: number
): [number, number] | null {
  const start = relative(a, q),
    end = relative(b, q);
  let lower = 0,
    upper = 1;
  for (const [basis, min, max] of [
    [tangent, -halfWidth, halfWidth],
    [normal, lo, hi]
  ] as const) {
    const x = dot(start, basis),
      dx = dot(end, basis) - x;
    if (Math.abs(dx) <= epsilon) {
      if (x < min - epsilon || x > max + epsilon) return null;
      continue;
    }
    const u = (min - x) / dx,
      v = (max - x) / dx;
    lower = Math.max(lower, Math.min(u, v));
    upper = Math.min(upper, Math.max(u, v));
    if (lower > upper) return null;
  }
  return [lower, upper];
}
export function createProvisionalRiverCrossing(input: CrossingCandidateInput): CrossingCandidateResult {
  const { geometry, dimensions: d } = input;
  if (
    !Number.isSafeInteger(input.id) ||
    !Number.isFinite(input.arcLengthMeters) ||
    !Object.values(d).every(v => Number.isFinite(v) && v > 0) ||
    d.localWindowMeters < d.roadWidthMeters / 2 ||
    !validWaterPolygon(geometry.water) ||
    !input.otherWater.every(validWaterPolygon)
  )
    return { reason: "invalid-input" };
  const sample = sampleRiverAxis(geometry.axis, input.arcLengthMeters, d.localWindowMeters);
  if (!sample) return { reason: "unstable-axis" };
  const { point: q, tangent: tRiver, normal: nCrossing } = sample;
  const section = normalWaterSection(q, nCrossing, geometry.water);
  if (!section) return { reason: "unresolved-section" };
  const { negative: a, positive: b } = section;
  const local = (hit: NormalBankHit) =>
    hit.reference &&
    hit.bankArcLength !== null &&
    Number.isFinite(hit.bankArcLength) &&
    Math.abs(hit.bankArcLength - input.arcLengthMeters) <= d.localWindowMeters;
  if (
    !local(a) ||
    !local(b) ||
    a.reference!.side !== "right" ||
    b.reference!.side !== "left" ||
    a.ringIndex !== b.ringIndex
  )
    return { reason: "nonlocal-banks" };
  const point = (distance: number): RiverPoint => [q[0] + distance * nCrossing[0], q[1] + distance * nCrossing[1]];
  const deckLo = a.distance - d.bankSeatMeters,
    deckHi = b.distance + d.bankSeatMeters;
  const approachLo = deckLo - d.straightApproachMeters,
    approachHi = deckHi + d.straightApproachMeters;
  const halfWidth = d.roadWidthMeters / 2;
  const rectangle = (lo: number, hi: number): RiverPoint[] =>
    [
      [lo, -halfWidth],
      [hi, -halfWidth],
      [hi, halfWidth],
      [lo, halfWidth]
    ].map(([n, t]) => [q[0] + n * nCrossing[0] + t * tRiver[0], q[1] + n * nCrossing[1] + t * tRiver[1]]);
  const deck = rectangle(deckLo, deckHi);
  // Include the full deck-end cross section and a dry support strip behind it.
  const dryA = rectangle(approachLo, deckLo + Math.min(d.bankSeatMeters / 2, d.straightApproachMeters));
  const dryB = rectangle(deckHi - Math.min(d.bankSeatMeters / 2, d.straightApproachMeters), approachHi);
  const waterObstacles = [geometry.water, ...input.otherWater];
  if ([dryA, dryB].some(p => waterObstacles.some(w => footprintTouchesWater(p, w)))) return { reason: "wet-approach" };
  if (![dryA, dryB].every(input.supportsDryFootprint)) return { reason: "unsupported-bank" };
  if (input.otherWater.some(w => footprintTouchesWater(deck, w))) return { reason: "compound-crossing" };
  // Every boundary in the occupied deck must belong to the same local pair of banks.
  for (let r = 0; r < geometry.water.rings.length; r++) {
    const ring = geometry.water.rings[r];
    for (let i = 0; i < ring.length; i++) {
      const clipped = clippedEdge(
        ring[i],
        ring[(i + 1) % ring.length],
        q,
        tRiver,
        nCrossing,
        deckLo,
        deckHi,
        halfWidth
      );
      if (!clipped) continue;
      const ref = geometry.water.bankReferences?.[r]?.[i];
      if (
        r !== a.ringIndex ||
        !ref ||
        clipped.some(u => {
          const arc = ref.arcStart + u * (ref.arcEnd - ref.arcStart);
          return !Number.isFinite(arc) || Math.abs(arc - input.arcLengthMeters) > d.localWindowMeters;
        })
      )
        return { reason: "compound-crossing" };
    }
  }
  const plan = planRiverCrossing({ ...input.capability, widthMeters: deckHi - deckLo });
  if (plan.kind !== "fixedBridge" && plan.kind !== "movableBridge") return { reason: "bridge-unavailable" };
  return {
    candidate: {
      id: input.id,
      riverId: geometry.axis.riverId,
      geometryVersion: geometry.axis.geometryVersion,
      arcLengthMeters: input.arcLengthMeters,
      q,
      tRiver,
      nCrossing,
      waterA: a.point,
      waterB: b.point,
      deckA: point(deckLo),
      deckB: point(deckHi),
      approachA: point(approachLo),
      approachB: point(approachHi),
      banks: [a, b],
      waterDistanceMeters: b.distance - a.distance,
      deckLengthMeters: deckHi - deckLo,
      plan,
      status: "provisional"
    }
  };
}
/** Re-evaluate from the referenced geometry to catch stale versions and shifted decks.
 * Provisional validation is never permission to register a land connection.
 */
export function validateProvisionalRiverCrossing(
  candidate: ProvisionalRiverCrossing,
  input: CrossingCandidateInput
): boolean {
  const result = createProvisionalRiverCrossing(input);
  if (!("candidate" in result)) return false;
  const expected = result.candidate;
  if (
    candidate.id !== expected.id ||
    candidate.riverId !== expected.riverId ||
    candidate.geometryVersion !== expected.geometryVersion ||
    candidate.status !== "provisional" ||
    candidate.arcLengthMeters !== expected.arcLengthMeters ||
    candidate.plan.kind !== expected.plan.kind
  )
    return false;
  const keys = ["q", "tRiver", "nCrossing", "waterA", "waterB", "deckA", "deckB", "approachA", "approachB"] as const;
  return (
    keys.every(key => Math.hypot(...relative(candidate[key], expected[key])) <= epsilon) &&
    Math.abs(candidate.waterDistanceMeters - expected.waterDistanceMeters) <= epsilon &&
    Math.abs(candidate.deckLengthMeters - expected.deckLengthMeters) <= epsilon &&
    candidate.banks.length === expected.banks.length &&
    candidate.banks.every((bank, i) => {
      const other = expected.banks[i];
      return (
        bank.ringIndex === other.ringIndex &&
        bank.edgeIndex === other.edgeIndex &&
        Math.abs(bank.distance - other.distance) <= epsilon &&
        Math.hypot(...relative(bank.point, other.point)) <= epsilon &&
        bank.bankArcLength !== null &&
        other.bankArcLength !== null &&
        Math.abs(bank.bankArcLength - other.bankArcLength) <= epsilon &&
        bank.reference?.side === other.reference?.side &&
        bank.reference?.arcStart === other.reference?.arcStart &&
        bank.reference?.arcEnd === other.reference?.arcEnd
      );
    }) &&
    (Object.keys(expected.plan) as (keyof RiverCrossingPlan)[]).every(key => candidate.plan[key] === expected.plan[key])
  );
}
