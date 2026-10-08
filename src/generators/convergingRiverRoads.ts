import { bridgePassageFootprint } from "../services/bridgePassageGeometry";
import { indexedPhysicalWater } from "../services/indexedPhysicalWater";
import type { RiverPoint } from "../services/riverGeometry";
import { footprintTouchesWater } from "../services/riverPhysicalGeometry";
import { bridgeSkewPenaltyMeters } from "../utils/bridgeSkewPolicy";
import { measureProcessing, type ProcessingProfiler } from "../utils/processingProfiler";
import type { CrossingCandidateInput, ProvisionalRiverCrossing } from "./riverCrossingCandidates";
import { validateProvisionalRiverCrossing } from "./riverCrossingCandidates";

export interface ConvergingRoadLeg {
  id: number;
  points: readonly RiverPoint[];
}
export interface ConvergingRiverRoads {
  crossing: ProvisionalRiverCrossing;
  /** One identical city-side trunk and one shared deck, then separate far-bank arms. */
  trunk: readonly RiverPoint[];
  /** `points` = 5 trunk points, `sourceStart - 5` new far-bank points, then the
   * original leg from `rejoinSegment` on (at index `sourceStart`). */
  legs: readonly { id: number; points: readonly RiverPoint[]; rejoinSegment: number; sourceStart: number }[];
}
/** Far-bank arm: straight run off the bridge, in road widths, tried in order. */
const EXIT_LENGTH_FACTORS = [0, 4, 8, 12, 16];
const EXIT_SAMPLE_LIMIT = 48;
/** Corner radius of the far-bank arm, in road widths (capped by the legs). */
const EXIT_FILLET_WIDTHS = 10;
/** Points of a circular fillet replacing the corner `b` of a→b→c, or just `b`
 * when the turn is slight. The fillet is tangent to both legs. */
function filletCorner(a: RiverPoint, b: RiverPoint, c: RiverPoint, radius: number): RiverPoint[] {
  const u = unitOf(a, b),
    v = unitOf(b, c);
  const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
  if (turn < (5 * Math.PI) / 180 || turn > (150 * Math.PI) / 180) return [b];
  const half = Math.tan(turn / 2);
  const reach = Math.min(radius * half, distance(a, b) / 2, distance(b, c) / 2);
  const r = reach / half;
  const start: RiverPoint = [b[0] - u[0] * reach, b[1] - u[1] * reach];
  const end: RiverPoint = [b[0] + v[0] * reach, b[1] + v[1] * reach];
  const left = u[0] * v[1] - u[1] * v[0] > 0;
  const normal: RiverPoint = left ? [-u[1], u[0]] : [u[1], -u[0]];
  const center: RiverPoint = [start[0] + normal[0] * r, start[1] + normal[1] * r];
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const steps = Math.max(2, Math.ceil(turn / (Math.PI / 16)));
  const points: RiverPoint[] = [start];
  for (let k = 1; k < steps; k++) {
    const angle = a0 + (left ? 1 : -1) * turn * (k / steps);
    points.push([center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle)]);
  }
  points.push(end);
  return points;
}
/** A plain rejoin within this of the bridge axis is already straight enough. */
const EXIT_STRAIGHT_DEGREES = 10;
/** Original segments past the plain rejoin's that the arm may rejoin on. */
const EXIT_SEGMENT_REACH = 2;
const unitOf = (from: RiverPoint, to: RiverPoint): RiverPoint => {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [(to[0] - from[0]) / d, (to[1] - from[1]) / d];
};
const EXIT_CHECK_LIMIT = 48;
const trunkOf = (c: ProvisionalRiverCrossing, nearA: boolean, origin: RiverPoint): RiverPoint[] => [
  origin,
  nearA ? c.approachA : c.approachB,
  nearA ? c.deckA : c.deckB,
  nearA ? c.deckB : c.deckA,
  nearA ? c.approachB : c.approachA
];
const angleDegrees = (a: RiverPoint, b: RiverPoint) =>
  (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180) / Math.PI;
const distance = (a: RiverPoint, b: RiverPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const side = (p: RiverPoint, c: ProvisionalRiverCrossing) =>
  (p[0] - c.q[0]) * c.nCrossing[0] + (p[1] - c.q[1]) * c.nCrossing[1];

/** Plan on measured geometry before changing any FMG route. All accepted legs
 * share E→D→D→E exactly; ordinary roads never become substitute river bridges.
 * The outside arms retain the original path after a dry, bounded rejoin. */
export function convergeRiverRoadLegs(
  origin: RiverPoint,
  legs: readonly ConvergingRoadLeg[],
  candidates: readonly { crossing: ProvisionalRiverCrossing; input: CrossingCandidateInput }[],
  maximumRejoinDistanceMeters: number,
  options: {
    /** Candidates were just created from these exact inputs, so re-validation would repeat that work. */
    prevalidated?: boolean;
    profiler?: ProcessingProfiler;
  } = {}
): ConvergingRiverRoads | null {
  const { prevalidated = false, profiler } = options;
  if (!Number.isFinite(maximumRejoinDistanceMeters) || maximumRejoinDistanceMeters <= 0) return null;
  let best: { value: ConvergingRiverRoads; cost: number } | null = null;
  for (const { crossing: c, input } of candidates) {
    if (!prevalidated && !measureProcessing(profiler, "validate", () => validateProvisionalRiverCrossing(c, input)))
      continue;
    const target = input.waterIndex?.getSnapshot(input.geometry.water);
    const targetIndex = measureProcessing(profiler, "target-index", () =>
      target ? indexedPhysicalWater(target) : undefined
    );
    const water = [input.geometry.water, ...input.otherWater];
    const dry = (a: RiverPoint, b: RiverPoint) => {
      if (distance(a, b) < 1e-8) return true;
      const footprint = bridgePassageFootprint(a, b, input.dimensions.roadWidthMeters);
      return (
        !!footprint &&
        input.supportsDryFootprint(footprint) &&
        !(input.waterIndex
          ? input.waterIndex.touchesWater(footprint)
          : water.some(area => footprintTouchesWater(footprint, area)))
      );
    };
    const nearA = side(origin, c) < 0;
    const near = nearA ? c.approachA : c.approachB;
    const far = nearA ? c.approachB : c.approachA;
    if (distance(origin, near) > maximumRejoinDistanceMeters || !dry(origin, near)) continue;
    const direction = nearA ? 1 : -1;
    const farSide = direction * side(far, c) + input.dimensions.roadWidthMeters * 2;
    const adopted: ConvergingRiverRoads["legs"][number][] = [];
    let cost = distance(origin, near) + distance(near, far) + bridgeSkewPenaltyMeters(c.skewDegrees);
    const farDeck = nearA ? c.deckB : c.deckA;
    const axisLength = distance(farDeck, far);
    const axis: RiverPoint | null =
      axisLength > 1e-9 ? [(far[0] - farDeck[0]) / axisLength, (far[1] - farDeck[1]) / axisLength] : null;
    const width = input.dimensions.roadWidthMeters;
    const touchesTarget = (prefix: RiverPoint[]) =>
      prefix.slice(1).some((p, j) => {
        const footprint = bridgePassageFootprint(prefix[j], p, width);
        return (
          footprint &&
          (targetIndex ? targetIndex.touches(footprint) : footprintTouchesWater(footprint, input.geometry.water))
        );
      });
    for (const leg of legs) {
      if (leg.points.length < 2 || distance(leg.points[0], origin) > 1e-7) continue;
      for (let i = 1; i < leg.points.length; i++) {
        const a = leg.points[i - 1],
          b = leg.points[i];
        const sa = direction * side(a, c),
          sb = direction * side(b, c);
        if (sb <= farSide) continue;
        const firstT = sa >= farSide ? 0 : (farSide - sa) / (sb - sa);
        const length = distance(a, b);
        if (!length) continue;
        // A bank bends independently of this bridge's normal. The first point
        // on the far-side plane can still be wet: try farther dry rejoins on
        // the same original segment before giving up that economic connection.
        let rejoin: RiverPoint | null = null;
        for (const advance of [0, 1, 2, 4, 8, 16, 32, 64, 128]) {
          const t = Math.min(1, firstT + (advance * width * 2) / length);
          const at: RiverPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (distance(origin, at) > maximumRejoinDistanceMeters) continue;
          if (!dry(far, at)) continue;
          if (!touchesTarget([...leg.points.slice(0, i), at])) continue;
          rejoin = at;
          break;
        }
        if (!rejoin) continue;
        // Same adoption and cost as a plain rejoin; only the far-bank shape
        // changes, to leave the bridge straight when a nearby rejoin allows it.
        cost += distance(far, rejoin);
        const arm = axis
          ? measureProcessing(profiler, "exit-arm", () =>
              straightExitArm(leg, i, far, axis, origin, farSide, direction, rejoin!)
            )
          : null;
        adopted.push(
          arm
            ? {
                id: leg.id,
                points: [...trunkOf(c, nearA, origin), ...arm.points],
                rejoinSegment: arm.segment,
                sourceStart: arm.points.length - (leg.points.length - arm.segment) + 5
              }
            : {
                id: leg.id,
                points: [...trunkOf(c, nearA, origin), rejoin, ...leg.points.slice(i)],
                rejoinSegment: i,
                sourceStart: 6
              }
        );
        break;
      }
    }

    /** Leave the bridge straight along its axis, then rejoin the original road
     * where the turns are gentlest: a far-bank arm that turns hard at the
     * abutment reads as an L or a staircase, which no real road does without a
     * cliff there. Null when no candidate beats a plain rejoin's dry checks. */
    function straightExitArm(
      leg: ConvergingRoadLeg,
      firstSegment: number,
      farPoint: RiverPoint,
      exitAxis: RiverPoint,
      start: RiverPoint,
      plane: number,
      sign: number,
      plain: RiverPoint
    ): { points: RiverPoint[]; segment: number } | null {
      const plainTurn = angleDegrees(exitAxis, unitOf(farPoint, plain));
      if (plainTurn <= EXIT_STRAIGHT_DEGREES) return null;
      const samples: { at: RiverPoint; segment: number; along: RiverPoint }[] = [];
      const lastSegment = Math.min(leg.points.length - 1, firstSegment + EXIT_SEGMENT_REACH);
      for (let i = firstSegment; i <= lastSegment && samples.length < EXIT_SAMPLE_LIMIT; i++) {
        const a = leg.points[i - 1],
          b = leg.points[i];
        const sa = sign * side(a, c),
          sb = sign * side(b, c);
        if (sb <= plane) continue;
        const length = distance(a, b);
        if (!length) continue;
        const along: RiverPoint = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const from = sa >= plane ? 0 : (plane - sa) / (sb - sa);
        for (let t = from; t <= 1 + 1e-9 && samples.length < EXIT_SAMPLE_LIMIT; t += (width * 2) / length) {
          const at: RiverPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (distance(start, at) > maximumRejoinDistanceMeters) break;
          samples.push({ at, segment: i, along });
        }
      }
      const options: { exit: RiverPoint | null; sample: (typeof samples)[number]; turn: number; length: number }[] = [];
      for (const lengthFactor of EXIT_LENGTH_FACTORS) {
        const exit: RiverPoint | null = lengthFactor
          ? [farPoint[0] + exitAxis[0] * width * lengthFactor, farPoint[1] + exitAxis[1] * width * lengthFactor]
          : null;
        const from = exit ?? farPoint;
        for (const sample of samples) {
          const link = distance(from, sample.at);
          if (link < width) continue;
          const v: RiverPoint = [(sample.at[0] - from[0]) / link, (sample.at[1] - from[1]) / link];
          const leave = angleDegrees(exitAxis, v);
          // A real road runs off the abutment before it turns.
          if (!exit && leave > EXIT_STRAIGHT_DEGREES) continue;
          const turn = Math.max(leave, angleDegrees(v, sample.along));
          options.push({ exit, sample, turn, length: distance(farPoint, from) + link });
        }
      }
      // Gentlest turn first (10° buckets), then the shortest new arm.
      options.sort((x, y) => Math.ceil(x.turn / 10) - Math.ceil(y.turn / 10) || x.length - y.length);
      const dryExit = new Map<RiverPoint | null, boolean>();
      let checks = 0;
      for (const option of options) {
        if (++checks > EXIT_CHECK_LIMIT) break;
        if (option.exit && !dryExit.has(option.exit)) dryExit.set(option.exit, dry(farPoint, option.exit));
        if (option.exit && !dryExit.get(option.exit)) continue;
        if (!dry(option.exit ?? farPoint, option.sample.at)) continue;
        if (!touchesTarget([...leg.points.slice(0, option.sample.segment), option.sample.at])) continue;
        if (option.turn >= plainTurn) return null;
        const next = leg.points[option.sample.segment];
        const corners = [...(option.exit ? [option.exit] : []), option.sample.at];
        // Round each corner into a curve so the arm bends rather than kinks.
        const path = [farPoint, ...corners, next];
        const rounded: RiverPoint[] = [];
        for (let k = 1; k < path.length - 1; k++) {
          const arc = filletCorner(path[k - 1], path[k], path[k + 1], width * EXIT_FILLET_WIDTHS);
          const ok = arc.every((p, j) => j === 0 || dry(arc[j - 1], p));
          rounded.push(...(ok ? arc : [path[k]]));
        }
        return { points: [...rounded, ...leg.points.slice(option.sample.segment)], segment: option.sample.segment };
      }
      return null;
    }
    if (!adopted.length) continue;
    const value: ConvergingRiverRoads = {
      crossing: c,
      trunk: adopted[0].points.slice(0, 5),
      legs: adopted
    };
    if (
      !best ||
      adopted.length > best.value.legs.length ||
      (adopted.length === best.value.legs.length && cost < best.cost)
    )
      best = { value, cost };
  }
  return best?.value ?? null;
}
