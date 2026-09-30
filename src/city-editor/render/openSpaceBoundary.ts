import type { Point } from "../core/types";

/** Exterior edges of non-overlapping paving pieces. Split partial shared edges
 * first: clipping a quay against a river often creates T junctions. */
export function openSpaceBoundary(polygons: Point[][]): [Point, Point][] {
  const epsilon = 1e-5;
  const vertices = polygons.flat();
  const key = (p: Point) => `${Math.round(p[0] / epsilon)},${Math.round(p[1] / epsilon)}`;
  const edges = new Map<string, { edge: [Point, Point]; count: number }>();
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length < epsilon) continue;
      const cuts = [
        { t: 0, point: a },
        { t: 1, point: b }
      ];
      for (const point of vertices) {
        const px = point[0] - a[0],
          py = point[1] - a[1];
        const t = (px * dx + py * dy) / (length * length);
        if (t <= 0 || t >= 1 || Math.abs(px * dy - py * dx) / length > epsilon) continue;
        if (!cuts.some(c => Math.abs(c.t - t) * length < epsilon)) cuts.push({ t, point });
      }
      cuts.sort((p, q) => p.t - q.t);
      for (let j = 1; j < cuts.length; j++) {
        const start = cuts[j - 1].point,
          end = cuts[j].point;
        const id = [key(start), key(end)].sort().join("/");
        const existing = edges.get(id);
        if (existing) existing.count++;
        else edges.set(id, { edge: [start, end], count: 1 });
      }
    }
  }
  return [...edges.values()].filter(e => e.count === 1).map(e => e.edge);
}
