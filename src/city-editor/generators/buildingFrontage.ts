import { type SpatialBounds, SpatialBoundsIndex } from "../../services/spatialBoundsIndex";
import type { Point } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";
import { nearestOnPolyline, pointInPolygon, segmentSegmentHit } from "./geom";

export interface BuildingFrontageRoute {
  centerline: readonly (readonly [number, number])[];
  widthMeters: number;
  /** Private access belongs only to buildings in this parcel. */
  parcelId?: string;
}
export interface BuildingFrontageCandidate {
  kind: "gable" | "eave";
  flip: boolean;
  door: Point;
  normal: Point;
}
export interface BuildingFrontage extends BuildingFrontageCandidate {
  source: "street" | "access" | "unknown";
}
interface Segment {
  points: [Point, Point];
  halfWidth: number;
  parcelId?: string;
}
function bounds(points: readonly Point[], margin = 0): SpatialBounds {
  return {
    minX: Math.min(...points.map(p => p[0])) - margin,
    minY: Math.min(...points.map(p => p[1])) - margin,
    maxX: Math.max(...points.map(p => p[0])) + margin,
    maxY: Math.max(...points.map(p => p[1])) + margin
  };
}

/** Visual access only: does not add roads, change lot geometry or use face portals as house doors. */
export function createBuildingFrontageResolver(
  routes: readonly BuildingFrontageRoute[],
  lots: readonly BuildingLot[],
  blockedPolygons: readonly Point[][] = []
) {
  const segments: Segment[] = routes.flatMap(route =>
    route.centerline.slice(1).flatMap((b, i) => {
      const a = route.centerline[i];
      if (![...a, ...b, route.widthMeters].every(Number.isFinite) || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01)
        return [];
      return [
        {
          points: [
            [a[0], a[1]],
            [b[0], b[1]]
          ] as [Point, Point],
          halfWidth: Math.max(0, route.widthMeters / 2),
          parcelId: route.parcelId
        }
      ];
    })
  );
  const streets = new SpatialBoundsIndex(segments, segment => bounds(segment.points, segment.halfWidth));
  const obstacles = new SpatialBoundsIndex(
    [
      ...lots.map(lot => ({ ring: lot.polygon, lot })),
      ...blockedPolygons.map(ring => ({ ring, lot: undefined }))
    ].filter(obstacle => obstacle.ring.length >= 3),
    obstacle => bounds(obstacle.ring)
  );
  return (lot: BuildingLot, candidates: readonly BuildingFrontageCandidate[]): BuildingFrontage => {
    let best: BuildingFrontage | undefined;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      // Only choose a nearby frontage, rather than a remote road on the opposite side of a block.
      for (const segment of streets.query(bounds([candidate.door], 12))) {
        if (segment.parcelId && segment.parcelId !== lot.parcelId) continue;
        const [a, b] = segment.points;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const tangentDot = ((b[0] - a[0]) * candidate.normal[0] + (b[1] - a[1]) * candidate.normal[1]) / length;
        if (!segment.parcelId && Math.abs(tangentDot) > 0.5) continue;
        let hit = nearestOnPolyline(candidate.door, segment.points);
        if (segment.parcelId && hit.dist < 0.05) {
          // Parcel access can end at the actual facade: inspect its outward approach, not a zero-length ray.
          const outward = [a, b].sort(
            (p, q) => (q[0] - p[0]) * candidate.normal[0] + (q[1] - p[1]) * candidate.normal[1]
          )[0];
          const distance = Math.hypot(outward[0] - candidate.door[0], outward[1] - candidate.door[1]);
          if (distance < 0.05) continue;
          const step = Math.min(1, distance);
          hit = {
            ...hit,
            dist: step,
            point: [
              candidate.door[0] + ((outward[0] - candidate.door[0]) * step) / distance,
              candidate.door[1] + ((outward[1] - candidate.door[1]) * step) / distance
            ]
          };
        }
        const gap = Math.max(0, hit.dist - segment.halfWidth);
        if (gap > 12 || gap >= bestDistance - 1e-6 || hit.dist < 1e-6) continue;
        const dx = (hit.point[0] - candidate.door[0]) / hit.dist;
        const dy = (hit.point[1] - candidate.door[1]) / hit.dist;
        if (dx * candidate.normal[0] + dy * candidate.normal[1] < 0.5) continue;
        const start: Point = [
          candidate.door[0] + candidate.normal[0] * 0.02,
          candidate.door[1] + candidate.normal[1] * 0.02
        ];
        const end: Point = [candidate.door[0] + dx * gap, candidate.door[1] + dy * gap];
        const blocked = obstacles.query(bounds([start, end])).some(obstacle => {
          if (obstacle.lot === lot) return false;
          const ring = obstacle.ring;
          return (
            pointInPolygon(start, ring) ||
            pointInPolygon(end, ring) ||
            ring.some((p, i) => segmentSegmentHit(start, end, p, ring[(i + 1) % ring.length]))
          );
        });
        if (blocked) continue;
        bestDistance = gap;
        best = { ...candidate, source: segment.parcelId ? "access" : "street" };
      }
    }
    return best ?? { ...candidates[0], source: "unknown" };
  };
}
export type BuildingFrontageResolver = ReturnType<typeof createBuildingFrontageResolver>;
