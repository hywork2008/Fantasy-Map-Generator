import { bridgePassageFootprint } from "../services/bridgePassageGeometry";
import { indexedPhysicalWater } from "../services/indexedPhysicalWater";
import type { RiverPoint } from "../services/riverGeometry";
import { footprintTouchesWater } from "../services/riverPhysicalGeometry";
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
  legs: readonly { id: number; points: readonly RiverPoint[]; rejoinSegment: number }[];
}
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
  maximumRejoinDistanceMeters: number
): ConvergingRiverRoads | null {
  if (!Number.isFinite(maximumRejoinDistanceMeters) || maximumRejoinDistanceMeters <= 0) return null;
  let best: { value: ConvergingRiverRoads; cost: number } | null = null;
  for (const { crossing: c, input } of candidates) {
    if (!validateProvisionalRiverCrossing(c, input)) continue;
    const target = input.waterIndex?.getSnapshot(input.geometry.water);
    const targetIndex = target ? indexedPhysicalWater(target) : undefined;
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
    let cost = distance(origin, near) + distance(near, far);
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
          const t = Math.min(1, firstT + (advance * input.dimensions.roadWidthMeters * 2) / length);
          const at: RiverPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (distance(origin, at) > maximumRejoinDistanceMeters) continue;
          if (!dry(far, at)) continue;
          const prefix = [...leg.points.slice(0, i), at];
          if (
            !prefix.slice(1).some((p, j) => {
              const footprint = bridgePassageFootprint(prefix[j], p, input.dimensions.roadWidthMeters);
              return (
                footprint &&
                (targetIndex ? targetIndex.touches(footprint) : footprintTouchesWater(footprint, input.geometry.water))
              );
            })
          )
            continue;
          rejoin = at;
          break;
        }
        if (!rejoin) continue;
        const trunk = [origin, near, nearA ? c.deckA : c.deckB, nearA ? c.deckB : c.deckA, far];
        adopted.push({ id: leg.id, points: [...trunk, rejoin, ...leg.points.slice(i)], rejoinSegment: i });
        cost += distance(far, rejoin);
        break;
      }
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
