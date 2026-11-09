import { planRiverCrossing, RIVER_CARGO_VESSEL } from "../../../../utils/riverCrossing";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorFerry } from "../../../types/vector/ferry";
import { planFerryCrossing } from "../../ferryLanding";
import { pointInPolygon } from "../../geom";
import { validateVectorFerries } from "../ferry";
import { containsRegion } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";

/** A road end this near a river's water is a landing on its bank. */
const LANDING_REACH_METERS = 3;

/** The crossing an FMG river's period allows (bridge or ferry), as the mesh editor plans it. */
export function descriptorRiverCrossing(d: BurgSiteDescriptor, source: BurgSiteDescriptor["rivers"][number]) {
  return (
    source.crossing ??
    planRiverCrossing({
      widthMeters: source.widthMeters ?? 0,
      depthMeters: source.depthMeters,
      period: d.historicalPeriod,
      transport: d.transport,
      vessel: source.navigationVessel ?? RIVER_CARGO_VESSEL
    })
  );
}

/** The FMG river a site's river path was drawn from, and the crossing its period allows. */
export function vectorRiverCrossing(doc: VectorCityDocument, river: VectorPath) {
  const d = doc.site?.descriptor,
    riverId = Number(river.id.split(":")[1]),
    source = river.id.startsWith("fmg-river:") ? d?.rivers.find(r => r.riverId === riverId) : undefined;
  if (!d || !source) return;
  return { source, plan: descriptorRiverCrossing(d, source) };
}

/**
 * A road FMG runs over a ferry river ends on the town bank, as the mesh editor clips it (`ferryConnection`): its
 * course from the town is kept up to the water, less its half width so the road stays dry. Undefined keeps the road.
 */
export function roadToFerryLanding(
  points: Point[],
  halfWidth: number,
  wet: (p: Point) => boolean,
  town: Point
): Point[] | undefined {
  // The course is walked from its end nearer the town.
  const far = (p: Point) => Math.hypot(p[0] - town[0], p[1] - town[1]);
  if (points.length >= 2 && far(points.at(-1)!) < far(points[0]))
    return roadToFerryLanding([...points].reverse(), halfWidth, wet, town)?.reverse();
  if (points.length < 2 || wet(points[0])) return;
  const kept: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      steps = Math.max(1, Math.ceil(length));
    for (let s = 1; s <= steps; s++) {
      const p: Point = [a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps];
      if (!wet(p)) continue;
      let lo: Point = [a[0] + ((b[0] - a[0]) * (s - 1)) / steps, a[1] + ((b[1] - a[1]) * (s - 1)) / steps],
        hi = p;
      for (let k = 0; k < 16; k++) {
        const mid: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
        if (wet(mid)) hi = mid;
        else lo = mid;
      }
      // Back off until the road's end, a disc of its half width, stands clear of the water however the road meets it.
      const clear = (p: Point) =>
          Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8).every(
            t => !wet([p[0] + Math.cos(t) * (halfWidth + 0.5), p[1] + Math.sin(t) * (halfWidth + 0.5)])
          ),
        at = (d: number): Point => [lo[0] - ((b[0] - a[0]) / length) * d, lo[1] - ((b[1] - a[1]) / length) * d];
      let back = halfWidth + 0.5;
      while (!clear(at(back)) && back < 20 * (halfWidth + 1)) back += 0.5;
      const end = at(back);
      // Drop course points the backed-off end passed.
      while (kept.length > 1) {
        const q = kept.at(-1)!;
        if ((end[0] - q[0]) * (b[0] - a[0]) + (end[1] - q[1]) * (b[1] - a[1]) > 0) break;
        kept.pop();
      }
      return Math.hypot(end[0] - kept.at(-1)![0], end[1] - kept.at(-1)![1]) > 1
        ? [...kept, end]
        : kept.length > 1
          ? kept
          : undefined;
    }
    kept.push(b);
  }
  return;
}

/** The dry edge of the bank straight ahead of a road's end, where its ferry lands; the end itself if none is near. */
function bankAhead(end: Point, ahead: Point, wet: (p: Point) => boolean, reach: number): Point {
  let lo = end,
    hi: Point | undefined;
  for (let d = 0.5; d <= reach && !hi; d += 0.5) {
    const p: Point = [end[0] + ahead[0] * d, end[1] + ahead[1] * d];
    if (wet(p)) hi = p;
    else lo = p;
  }
  if (!hi) return end;
  for (let k = 0; k < 16; k++) {
    const mid: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    if (wet(mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** A river roads cross by ferry: FMG gives it a ferry, as no bridge of the period spans it. */
export const isFerryRiver = (doc: VectorCityDocument, river: VectorPath) =>
  vectorRiverCrossing(doc, river)?.plan.kind === "ferry";

/**
 * Ferries where the site's roads end on the bank of a ferry river (P5b-4): each crossing heads square across from
 * the road's end and drifts downstream in the mesh editor's figure of eight (`planFerryCrossing`).
 */
export function raiseVectorFerries(doc: VectorCityDocument): { document: VectorCityDocument; failures: string[] } {
  const site = doc.site;
  if (!site) return { document: doc, failures: [] };
  const water = allVectorWater(doc),
    // As the mesh editor's test: outside the surveyed site counts as water, so a crossing wider than the frame
    // ends at its edge.
    wet = (p: Point) => containsRegion(water, p) || !containsRegion(site.domain, p),
    ferries: Record<string, VectorFerry> = {},
    failures: string[] = [];
  for (const river of Object.values(doc.paths).filter(p => p.role === "river")) {
    const crossing = vectorRiverCrossing(doc, river);
    if (crossing?.plan.kind !== "ferry") continue;
    const channel = (site.water.find(w => w.riverPathId === river.id)?.polygons ?? [pathSurface(river)]).map(
        p => p.outer
      ),
      course = samplePath(river).map(s => s.point);
    if (course.length < 2) continue;
    for (const road of Object.values(doc.paths).filter(p => p.role === "road")) {
      const points = samplePath(road).map(s => s.point),
        half = Math.max(road.width.leftMeters, road.width.rightMeters);
      for (const [end, inner] of [
        [points[0], points[1]],
        [points.at(-1)!, points.at(-2)!]
      ] as [Point, Point][]) {
        const reach = Math.min(
          ...channel.flatMap(r => r.map((a, i) => pointSegmentDistance(end, a, r[(i + 1) % r.length])))
        );
        if (!(reach <= half + LANDING_REACH_METERS) || channel.some(r => pointInPolygon(end, r))) continue;
        // Downstream along the river's course where the road meets it.
        let k = 0;
        for (let i = 0; i + 1 < course.length; i++)
          if (pointSegmentDistance(end, course[i], course[i + 1]) < pointSegmentDistance(end, course[k], course[k + 1]))
            k = i;
        const a = course[k],
          b = course[k + 1],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 1e-6) continue;
        const flow: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
          heading = Math.hypot(end[0] - inner[0], end[1] - inner[1]) || 1,
          ahead: Point = [(end[0] - inner[0]) / heading, (end[1] - inner[1]) / heading],
          width = crossing.plan.widthMeters,
          landing = bankAhead(end, ahead, wet, half + LANDING_REACH_METERS + 2),
          far: Point = [landing[0] + ahead[0] * width, landing[1] + ahead[1] * width],
          plan = planFerryCrossing({
            landing,
            far,
            flow,
            wet,
            crossingWidthMeters: width,
            currentMetersPerSecond: crossing.source.hydrology?.surfaceVelocity,
            extentMeters: doc.frame.extentMeters
          }),
          id = `ferry:${Object.keys(ferries).length}`,
          // A far landing beyond the site (or still in the water there) is not drawn, as one beyond the mesh frame.
          ferry: VectorFerry = {
            id,
            riverPathId: river.id,
            roadPathId: road.id,
            ...plan,
            farInFrame: plan.farInFrame && !wet(plan.farLanding)
          };
        const trial = {
          ...doc,
          environment: { features: {}, hidden: [], ...doc.environment, ferries: { [id]: ferry } }
        };
        if (validateVectorFerries(trial).length) failures.push(road.id);
        else ferries[id] = ferry;
      }
    }
  }
  if (!Object.keys(ferries).length) return { document: doc, failures };
  return {
    document: { ...doc, environment: { features: {}, hidden: [], ...doc.environment, ferries } },
    failures
  };
}
