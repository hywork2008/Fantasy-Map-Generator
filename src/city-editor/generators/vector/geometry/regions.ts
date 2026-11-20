import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import { pointInPolygon, polygonArea, segmentsIntersect } from "../../geom";
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
/**
 * `containsRegion([polygon], p)` for one polygon tested at many points: the same crossing test on the same edges,
 * so the answer is identical, but only the edges spanning the point's height are visited (an index by height).
 * Worth it for outlines of many vertices, such as a meandering river's water.
 */
export function regionContains(polygon: VectorPolygon): (p: Point) => boolean {
  return regionProbe(polygon).contains;
}
/**
 * `regionContains`, and whether any edge's box comes within `d` of a point. With no edge that near, every point
 * within `d` (by either axis) is inside exactly when the point is: no edge can lie between them.
 */
export function regionProbe(polygon: VectorPolygon): {
  contains: (p: Point) => boolean;
  near: (p: Point, d: number) => boolean;
} {
  type Edge = { minX: number; minY: number; maxX: number; maxY: number; i: number };
  const rings = [polygon.outer, ...polygon.holes].map(r => {
    const edges = r.map((pi, i) => {
      const pj = r[(i + r.length - 1) % r.length];
      return { pi, pj, i };
    });
    // By height alone for the crossing test; by box, built on first use, for nearness.
    const tree = new RBush<Edge>();
    tree.load(
      edges.map(({ pi, pj, i }) => ({
        minX: 0,
        maxX: 0,
        minY: Math.min(pi[1], pj[1]),
        maxY: Math.max(pi[1], pj[1]),
        i
      }))
    );
    let boxes: RBush<Edge> | undefined;
    const box = () => {
      if (!boxes) {
        boxes = new RBush<Edge>();
        boxes.load(
          edges.map(({ pi, pj, i }) => ({
            minX: Math.min(pi[0], pj[0]),
            maxX: Math.max(pi[0], pj[0]),
            minY: Math.min(pi[1], pj[1]),
            maxY: Math.max(pi[1], pj[1]),
            i
          }))
        );
      }
      return boxes;
    };
    return { r, tree, box };
  });
  // pointInPolygon's test, edge by edge; the crossings are counted the same, so their order does not matter.
  const inside = ({ r, tree }: (typeof rings)[number], p: Point) => {
    let yes = false;
    const px = p[0],
      py = p[1];
    for (const { i } of tree.search({ minX: 0, maxX: 0, minY: py, maxY: py })) {
      const pi = r[i],
        pj = r[(i + r.length - 1) % r.length],
        yi = pi[1],
        yj = pj[1];
      if (yi > py !== yj > py && px < ((pj[0] - pi[0]) * (py - yi)) / (yj - yi) + pi[0]) yes = !yes;
    }
    return yes;
  };
  return {
    contains: p => inside(rings[0], p) && !rings.slice(1).some(h => inside(h, p)),
    near: (p, d) =>
      rings.some(({ box }) => box().collides({ minX: p[0] - d, maxX: p[0] + d, minY: p[1] - d, maxY: p[1] + d }))
  };
}
const ringBox = (r: Point[]) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of r) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
};
/** True only when the outlines neither cross nor touch: each ring then lies wholly inside or outside the other. */
function outlinesApart(a: Point[], b: Point[]): boolean {
  const box = ringBox(a);
  for (let j = 0; j < b.length; j++) {
    const p = b[j],
      q = b[(j + 1) % b.length];
    if (
      Math.max(p[0], q[0]) < box.minX ||
      Math.min(p[0], q[0]) > box.maxX ||
      Math.max(p[1], q[1]) < box.minY ||
      Math.min(p[1], q[1]) > box.maxY
    )
      continue;
    for (let i = 0; i < a.length; i++) if (segmentsIntersect(a[i], a[(i + 1) % a.length], p, q)) return false;
  }
  return true;
}
/** A quick sufficient test that `inner` lies inside `outer`; false means unknown. It spares the clipping kernel the
 * common case of a difference that is certainly empty. */
export function ringSurelyInside(inner: Point[], outer: Point[]): boolean {
  return outlinesApart(inner, outer) && pointInPolygon(inner[0], outer);
}
/** A quick sufficient test that `ring` and `polygon` share no area; false means unknown. */
export function ringSurelyApart(ring: Point[], polygon: VectorPolygon): boolean {
  const a = ringBox(ring),
    b = ringBox(polygon.outer);
  if (a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY) return true;
  return (
    outlinesApart(ring, polygon.outer) &&
    !pointInPolygon(ring[0], polygon.outer) &&
    !pointInPolygon(polygon.outer[0], ring)
  );
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
      (!/^(Unable to (complete output ring|find segment|pop\(\) left SweepEvent)|Infinite loop when passing sweep line)/.test(
        error.message
      ) &&
        // A runaway recursion of the kernel (a ring walk, or a segment's state chain on a near-coincident edge).
        // The stack it leaves is cut at `Error.stackTraceLimit` frames (10 by default), so the frames that would
        // name the kernel's routine are usually gone: every stack overflow of the kernel is retried.
        !(error instanceof RangeError) &&
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
      try {
        result = run(rounded(a, 1e-7), rounded(b, 1e-7));
      } catch {
        try {
          // Still far below the sampling tolerance; reached only where both finer lattices fail.
          result = run(rounded(a, 1e-6), rounded(b, 1e-6));
        } catch (last) {
          // The kernel can also lose an edge whose ends round to within a few ulps of the origin (a town centred
          // on it): the same lattice shifted off the origin, and the result shifted back.
          if (!(last instanceof Error)) throw last;
          const shift = (polygons: MultiPolygon, dx: number, dy: number): MultiPolygon =>
            polygons.map(rings => rings.map(r => r.map(([x, y]) => [x + dx, y + dy] as Point)));
          const [sx, sy] = [97.125, 53.6875];
          result = shift(run(shift(rounded(a, 1e-6), sx, sy), shift(rounded(b, 1e-6), sx, sy)), -sx, -sy);
        }
      }
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
              // `+ 0` turns the kernel's -0 into 0, which a saved document reads back as.
              points.push([p[0] + 0, p[1] + 0]);
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
