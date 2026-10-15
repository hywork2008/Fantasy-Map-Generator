import { SpatialBoundsIndex } from "../../services/spatialBoundsIndex";
import type { Point } from "../types/document";

/** Segment bounds prune distant routes without changing route priority or exact geometry tests. */
export class NearbyPolylineIndex<T extends { points: Point[] }> {
  private segments: SpatialBoundsIndex<{ route: number; a: Point; b: Point }>;

  constructor(private routes: readonly T[]) {
    this.segments = new SpatialBoundsIndex(
      routes.flatMap((route, index) => route.points.slice(1).map((b, i) => ({ route: index, a: route.points[i], b }))),
      ({ a, b }) => ({
        minX: Math.min(a[0], b[0]),
        minY: Math.min(a[1], b[1]),
        maxX: Math.max(a[0], b[0]),
        maxY: Math.max(a[1], b[1])
      })
    );
  }

  query(point: Point, radius: number): T[] {
    const segments = this.segments.query({
      minX: point[0] - radius,
      minY: point[1] - radius,
      maxX: point[0] + radius,
      maxY: point[1] + radius
    });
    return [...new Set(segments.map(segment => segment.route))].sort((a, b) => a - b).map(index => this.routes[index]);
  }
}
