import { bridgePassageFootprint } from "../services/bridgePassageGeometry";
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
    const water = [input.geometry.water, ...input.otherWater];
    const dry = (a: RiverPoint, b: RiverPoint) => {
      if (distance(a, b) < 1e-8) return true;
      const footprint = bridgePassageFootprint(a, b, input.dimensions.roadWidthMeters);
      return (
        !!footprint &&
        input.supportsDryFootprint(footprint) &&
        !water.some(area => footprintTouchesWater(footprint, area))
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
        if (sa >= farSide || sb <= farSide || sb <= sa) continue;
        const t = (farSide - sa) / (sb - sa);
        const rejoin: RiverPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (distance(origin, rejoin) > maximumRejoinDistanceMeters || !dry(far, rejoin)) continue;
        // Only replace a real water crossing; a road already on this bank
        // must keep its independent city entrance.
        if (
          !leg.points.slice(1, i + 1).some((p, j) => {
            const footprint = bridgePassageFootprint(leg.points[j], p, input.dimensions.roadWidthMeters);
            return footprint && footprintTouchesWater(footprint, input.geometry.water);
          })
        )
          continue;
        const trunk = [origin, near, nearA ? c.deckA : c.deckB, nearA ? c.deckB : c.deckA, far];
        adopted.push({ id: leg.id, points: [...trunk, rejoin, ...leg.points.slice(i)], rejoinSegment: i });
        cost += distance(far, rejoin);
        break;
      }
    }
    if (adopted.length < 2) continue;
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
