import type { PhysicalWaterIndex } from "../services/physicalWaterIndex";
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
import { BRIDGE_SKEW_MAX_DEGREES } from "../utils/bridgeSkewPolicy";
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
  /** River tangent at q. */
  tRiver: RiverPoint;
  /** Bridge axis (unit, bank A → bank B): the river normal turned by `skewDegrees`. */
  nCrossing: RiverPoint;
  /** Signed deviation of the bridge axis from the river normal (bridgeSkewPolicy.ts). */
  skewDegrees: number;
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
  /** Signed turn of the bridge axis away from the river normal; 0 = square crossing.
   * Callers keep |skewDegrees| within the state's allowance (bridgeSkewPolicy.ts). */
  skewDegrees?: number;
  dimensions: CrossingCandidateDimensions;
  /** Complete water obstacles in the local corridor, including lakes and other rivers. */
  otherWater: readonly PhysicalWaterPolygon[];
  /** Complete obstacle snapshot. Indexed mode requires an empty otherWater array;
   * all river/lake/sea obstacles must be in this index before candidate generation.
   */
  waterIndex?: PhysicalWaterIndex;
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
  const targetWater = input.waterIndex ? input.waterIndex.getSnapshot(geometry.water) : geometry.water;
  if (!targetWater || (input.waterIndex && input.otherWater.length)) return { reason: "invalid-input" };
  if (
    !Number.isSafeInteger(input.id) ||
    !Number.isFinite(input.arcLengthMeters) ||
    !Object.values(d).every(v => Number.isFinite(v) && v > 0) ||
    d.localWindowMeters < d.roadWidthMeters / 2 ||
    (!input.waterIndex && (!validWaterPolygon(targetWater) || !input.otherWater.every(validWaterPolygon)))
  )
    return { reason: "invalid-input" };
  const skewDegrees = input.skewDegrees ?? 0;
  if (!Number.isFinite(skewDegrees) || Math.abs(skewDegrees) > BRIDGE_SKEW_MAX_DEGREES)
    return { reason: "invalid-input" };
  const sample = sampleRiverAxis(geometry.axis, input.arcLengthMeters, d.localWindowMeters);
  if (!sample) return { reason: "unstable-axis" };
  const { point: q, tangent: tRiver } = sample;
  // Turn the river frame as one: the deck runs along nCrossing, its width along `lateral`.
  const turn = (v: RiverPoint): RiverPoint => {
    if (!skewDegrees) return v;
    const angle = (skewDegrees * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
  };
  const nCrossing = turn(sample.normal),
    lateral = turn(tRiver);
  const section = normalWaterSection(q, nCrossing, targetWater);
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
  // A skewed deck's square end meets the bank obliquely: its trailing corner
  // needs half the road width × tan(skew) more seat to stay on dry land.
  const seat = d.bankSeatMeters + (d.roadWidthMeters / 2) * Math.abs(Math.tan((skewDegrees * Math.PI) / 180));
  const deckLo = a.distance - seat,
    deckHi = b.distance + seat;
  const approachLo = deckLo - d.straightApproachMeters,
    approachHi = deckHi + d.straightApproachMeters;
  const halfWidth = d.roadWidthMeters / 2;
  const rectangle = (lo: number, hi: number): RiverPoint[] =>
    [
      [lo, -halfWidth],
      [hi, -halfWidth],
      [hi, halfWidth],
      [lo, halfWidth]
    ].map(([n, t]) => [q[0] + n * nCrossing[0] + t * lateral[0], q[1] + n * nCrossing[1] + t * lateral[1]]);
  const deck = rectangle(deckLo, deckHi);
  // Include the full deck-end cross section and a dry support strip behind it.
  const dryA = rectangle(approachLo, deckLo + Math.min(d.bankSeatMeters / 2, d.straightApproachMeters));
  const dryB = rectangle(deckHi - Math.min(d.bankSeatMeters / 2, d.straightApproachMeters), approachHi);
  if ([deck, dryA, dryB].some(p => !validWaterPolygon({ id: -1, rings: [p] }))) return { reason: "invalid-input" };
  const waterObstacles = [targetWater, ...input.otherWater];
  const touchesWater = (footprint: readonly RiverPoint[], excludeTarget = false) =>
    input.waterIndex
      ? input.waterIndex.touchesWater(footprint, excludeTarget ? targetWater : undefined)
      : (excludeTarget ? input.otherWater : waterObstacles).some(w => footprintTouchesWater(footprint, w));
  if ([dryA, dryB].some(p => touchesWater(p))) return { reason: "wet-approach" };
  if (![dryA, dryB].every(input.supportsDryFootprint)) return { reason: "unsupported-bank" };
  if (touchesWater(deck, true)) return { reason: "compound-crossing" };
  // Every boundary in the occupied deck must belong to the same local pair of banks.
  for (let r = 0; r < targetWater.rings.length; r++) {
    const ring = targetWater.rings[r];
    for (let i = 0; i < ring.length; i++) {
      const clipped = clippedEdge(
        ring[i],
        ring[(i + 1) % ring.length],
        q,
        lateral,
        nCrossing,
        deckLo,
        deckHi,
        halfWidth
      );
      if (!clipped) continue;
      const ref = targetWater.bankReferences?.[r]?.[i];
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
      skewDegrees,
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
  // Callers re-derive inputs from the river; the candidate carries its own skew.
  // Archived candidates from before skewed bridges have none and were square.
  const skewDegrees = input.skewDegrees ?? candidate.skewDegrees ?? 0;
  const result = createProvisionalRiverCrossing({ ...input, skewDegrees });
  if (!("candidate" in result)) return false;
  const expected = result.candidate;
  if (
    candidate.id !== expected.id ||
    candidate.riverId !== expected.riverId ||
    candidate.geometryVersion !== expected.geometryVersion ||
    candidate.status !== "provisional" ||
    candidate.arcLengthMeters !== expected.arcLengthMeters ||
    (candidate.skewDegrees ?? 0) !== expected.skewDegrees ||
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
