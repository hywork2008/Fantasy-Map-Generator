import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import { pointInPolygon, polygonArea } from "../../geom";
import type { PathSurface } from "./surfaces";

export type VectorPolygon = PathSurface;
export const regionArea = (p: VectorPolygon) =>
  Math.abs(polygonArea(p.outer)) - p.holes.reduce((n, h) => n + Math.abs(polygonArea(h)), 0);
export function containsRegion(polygons: VectorPolygon[], p: Point): boolean {
  return polygons.some(r => pointInPolygon(p, r.outer) && !r.holes.some(h => pointInPolygon(p, h)));
}
export function indexedContains(polygons: VectorPolygon[]) {
  const trees = polygons.map(p =>
    [p.outer, ...p.holes].map(r => {
      const tree = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; a: Point; b: Point }>();
      tree.load(
        r.map((a, i) => {
          const b = r[(i + 1) % r.length];
          return {
            a,
            b,
            minX: Math.min(a[0], b[0]),
            maxX: Math.max(a[0], b[0]),
            minY: Math.min(a[1], b[1]),
            maxY: Math.max(a[1], b[1])
          };
        })
      );
      return tree;
    })
  );
  return (p: Point) =>
    trees.some(rings => {
      const inside = (tree: (typeof rings)[number]) => {
        let yes = false;
        for (const { a, b } of tree.search({ minX: p[0], maxX: Infinity, minY: p[1], maxY: p[1] }))
          if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
        return yes;
      };
      return inside(rings[0]) && !rings.slice(1).some(inside);
    });
}
/** Only derived boundaries enter the clipping kernel; source paths and surveyed rings remain untouched. */
export function regionBoolean(
  a: VectorPolygon[],
  b: VectorPolygon[],
  operation: "union" | "difference" | "intersection",
  /** False skips the lattice retry and lets a kernel failure throw: for display-only results with their own
   * fallback, because the sweep kernel can loop without end on a retried lattice (coast-and-river streets). */
  retry = true
): VectorPolygon[] {
  const toClip = (polygons: VectorPolygon[]): MultiPolygon => polygons.map(p => [p.outer, ...p.holes]);
  const count = [...a, ...b].reduce((n, p) => n + p.outer.length + p.holes.reduce((n, h) => n + h.length, 0), 0);
  if (count > 30000) throw new Error("region-budget");
  if ((operation !== "union" && !a.length) || (operation === "intersection" && !b.length)) return [];
  if (operation === "union" && !a.length && !b.length) return [];
  const run = (left: MultiPolygon, right: MultiPolygon) =>
    operation === "union"
      ? polygonClipping.union([...left, ...right])
      : operation === "difference"
        ? polygonClipping.difference(left, right)
        : polygonClipping.intersection(left, right);
  let result: MultiPolygon;
  try {
    result = run(toClip(a), toClip(b));
  } catch (error) {
    // The sweep kernel can lose an almost coincident derived edge. Retry on a
    // sub-micrometer lattice, far below the 5mm sampling tolerance. Source paths
    // and surveyed input rings are never changed by this numerical fallback.
    if (
      !retry ||
      !(error instanceof Error) ||
      (!/^Unable to (complete output ring|find segment)/.test(error.message) &&
        !(error instanceof RangeError && error.stack?.includes("RingOut")) &&
        // The same lost edge can surface as a missing ring of a segment in the result sweep.
        !(error instanceof TypeError && error.stack?.includes("polygon-clipping")))
    )
      throw error;
    const rounded = (polygons: VectorPolygon[], step: number): MultiPolygon =>
      polygons.flatMap(p => {
        const rings = [p.outer, ...p.holes]
          .map(r =>
            r
              .map(p => [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step] as Point)
              .filter((p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1])
          )
          .filter(r => r.length >= 3);
        return rings.length ? [rings] : [];
      });
    try {
      result = run(rounded(a, 1e-8), rounded(b, 1e-8));
    } catch {
      result = run(rounded(a, 1e-7), rounded(b, 1e-7));
    }
  }
  let points = 0;
  const polygons = result
    .map(rings => {
      const converted = rings
        .map(r => {
          const points: Point[] = [];
          for (const p of r.slice(0, -1))
            if (!points.length || Math.hypot(p[0] - points.at(-1)![0], p[1] - points.at(-1)![1]) > 1e-7)
              points.push([p[0], p[1]]);
          if (
            points.length > 1 &&
            Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) <= 1e-7
          )
            points.pop();
          // Boolean output can contain zero-area out-and-back spikes where a
          // rounded doorway edge meets a road. Remove collinear derived vertices,
          // including reversals; source paths never enter this cleanup.
          for (let i = points.length - 1; i >= 0 && points.length > 3; i--) {
            const a = points[(i + points.length - 1) % points.length],
              b = points[i],
              c = points[(i + 1) % points.length];
            const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
            const height =
              length > 1e-9
                ? Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / length
                : Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (height < 1e-7) points.splice(i, 1);
          }
          if (points.length > 16000) throw new Error("region-budget");
          return points;
        })
        .filter(r => r.length >= 3);
      points += converted.reduce((n, r) => n + r.length, 0);
      return { outer: converted[0], holes: converted.slice(1) };
    })
    .filter(p => p.outer && regionArea(p) > 1e-8);
  if (points > 50000) throw new Error("region-budget");
  return polygons.sort(
    (a, b) => regionArea(b) - regionArea(a) || JSON.stringify(a.outer).localeCompare(JSON.stringify(b.outer))
  );
}
