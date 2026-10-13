import type { Point } from "../types/document";
import type { AerialLandmarkPlan } from "./aerialLandmarks";
import { convexHull } from "./geom";

function circle(center: Point, radius: number, steps = 14): Point[] {
  return Array.from({ length: steps }, (_, i): Point => {
    const t = (i / steps) * Math.PI * 2;
    return [center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius];
  });
}

/** Footprints that displace ordinary houses, lanes and fields. */
export function aerialLandmarkFootprints(plan: AerialLandmarkPlan): Point[][] {
  return [
    ...plan.monasteries.map(m => m.precinct),
    ...plan.tanneries.map(t => t.yard),
    ...plan.barbicans.map(b => convexHull([...b.court, ...b.frontTowers.flat()])),
    ...plan.windmills.map(w => circle(w.center, w.baseRadius + 1, 10)),
    ...plan.gallows.map(g => circle(g.center, g.moundRadius + 1, 12)),
    ...plan.guildHalls.flatMap(hall => (hall.tower ? [hall.footprint, hall.tower] : [hall.footprint])),
    ...plan.guildYards.map(yard => yard.polygon),
    ...plan.storageYards.map(yard => yard.polygon),
    ...plan.gateInns.map(inn => inn.footprint)
  ];
}
