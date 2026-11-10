import type { CityDocument, Point } from "../../types/document";
import { distanceToSegment } from "./wayGeometry";

/** A stepped way within this distance of the door counts as the street the building opens onto. */
export const FRONT_ROAD_REACH_METERS = 4;

/**
 * Level of the nearest stepped way within reach of `door`: the landing under it,
 * or a point on the flight beside it. Absent when no stepped way is near.
 */
export function frontRoadLevel(document: CityDocument, door: Point): number | null {
  let best: { distance: number; level: number } | null = null;
  for (const way of document.terrain?.ways ?? []) {
    if (way.profile !== "stepped" || !way.landings?.length) continue;
    let along = 0;
    for (let i = 1; i < way.centerline.length; i++) {
      const a = way.centerline[i - 1];
      const b = way.centerline[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const hit = distanceToSegment(door, a, b);
      if (hit.distance <= FRONT_ROAD_REACH_METERS && (!best || hit.distance < best.distance)) {
        const level = levelAt(way, along + hit.t * length);
        if (level !== null) best = { distance: hit.distance, level };
      }
      along += length;
    }
  }
  return best ? best.level : null;
}

function levelAt(way: NonNullable<NonNullable<CityDocument["terrain"]>["ways"]>[number], chainage: number) {
  for (const landing of way.landings ?? [])
    if (chainage >= landing.fromMeters - 1e-6 && chainage <= landing.toMeters + 1e-6) return landing.levelMeters;
  for (const flight of way.flights ?? []) {
    if (chainage < flight.fromMeters || chainage > flight.toMeters) continue;
    const span = flight.toMeters - flight.fromMeters || 1;
    const t = (chainage - flight.fromMeters) / span;
    return flight.fromLevelMeters + (flight.toLevelMeters - flight.fromLevelMeters) * t;
  }
  return null;
}
