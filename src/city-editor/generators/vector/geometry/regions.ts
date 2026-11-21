import * as ClipperTypes from "clipper-lib";
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import { isSimplePolygon, pointInPolygon, polygonArea, segmentsIntersect } from "../../geom";
import type { PathSurface } from "./surfaces";

// clipper-lib is a CommonJS module: its namespace comes as the default export under Node, as named exports elsewhere.
const ClipperLib: typeof ClipperTypes =
  (ClipperTypes as unknown as { default?: typeof ClipperTypes }).default ?? ClipperTypes;

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
/** Distance from p to the segment ab. */
function pointSegmentGap(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy,
    t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}
/** Where the lines through ab and cd cross, or undefined when they run (nearly) parallel. */
function lineCrossing(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const rx = b[0] - a[0],
    ry = b[1] - a[1],
    sx = d[0] - c[0],
    sy = d[1] - c[1],
    det = rx * sy - ry * sx;
  if (Math.abs(det) < 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return undefined;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / det;
  return [a[0] + rx * t, a[1] + ry * t];
}
/**
 * The integer kernel (Clipper 1, clipper-lib) on a power-of-two lattice: below 2^25 its arithmetic stays in doubles
 * and is exact. Each operand is the union of its polygons (outlines one way, holes the other, non-zero fill), as in
 * the sweep kernel it replaced. The result keeps the input's exact coordinates: a lattice vertex that was an input
 * vertex is given back, one the kernel made where input edges cross is put on their exact crossing. Rings are returned
 * in the sweep kernel's form.
 */
function clipperBoolean(
  a: VectorPolygon[],
  b: VectorPolygon[],
  operation: "union" | "difference" | "intersection"
): MultiPolygon {
  let extent = 1;
  for (const p of [...a, ...b])
    for (const r of [p.outer, ...p.holes]) for (const [x, y] of r) extent = Math.max(extent, Math.abs(x), Math.abs(y));
  const scale = 2 ** Math.floor(Math.log2(2 ** 25 / extent)),
    latticeKey = (x: number, y: number) => (x + 2 ** 25) * 2 ** 26 + (y + 2 ** 25),
    origin = new Map<number, Point>(),
    rings: Point[][] = [];
  const paths = (polygons: VectorPolygon[]) => {
    const out: ClipperTypes.Paths = [];
    for (const p of polygons)
      [p.outer, ...p.holes].forEach((ring, k) => {
        if (ring.length < 3) return;
        // Outlines clockwise in this module's sign (positive), holes the other way.
        const path = ring.map(([x, y]) => ({ X: Math.round(x * scale), Y: Math.round(y * scale) }));
        for (let i = 0; i < ring.length; i++) origin.set(latticeKey(path[i].X, path[i].Y), ring[i]);
        rings.push(ring);
        out.push(polygonArea(ring) > 0 !== (k === 0) ? path.reverse() : path);
      });
    return out;
  };
  const clipper = new ClipperLib.Clipper(),
    tree = new ClipperLib.PolyTree();
  if (operation === "union") clipper.AddPaths(paths([...a, ...b]), ClipperLib.PolyType.ptSubject, true);
  else {
    clipper.AddPaths(paths(a), ClipperLib.PolyType.ptSubject, true);
    clipper.AddPaths(paths(b), ClipperLib.PolyType.ptClip, true);
  }
  const type =
    operation === "union"
      ? ClipperLib.ClipType.ctUnion
      : operation === "difference"
        ? ClipperLib.ClipType.ctDifference
        : ClipperLib.ClipType.ctIntersection;
  const nonZero = ClipperLib.PolyFillType.pftNonZero;
  if (!clipper.Execute(type, tree, nonZero, nonZero)) throw new Error("clipper-failed");
  // A vertex the kernel made where input edges cross lies within a few lattice steps of their exact crossing; where
  // the edges near it run parallel, it is put on the nearest.
  type Edge = { minX: number; minY: number; maxX: number; maxY: number; a: Point; b: Point };
  let index: RBush<Edge> | undefined;
  const reach = 3 / scale;
  const crossing = (q: Point): Point => {
    index ??= new RBush<Edge>().load(
      rings.flatMap(ring =>
        ring.map((p, i) => {
          const q = ring[(i + 1) % ring.length];
          return {
            minX: Math.min(p[0], q[0]),
            minY: Math.min(p[1], q[1]),
            maxX: Math.max(p[0], q[0]),
            maxY: Math.max(p[1], q[1]),
            a: p,
            b: q
          };
        })
      )
    );
    const near = index
      .search({ minX: q[0] - reach, minY: q[1] - reach, maxX: q[0] + reach, maxY: q[1] + reach })
      .filter(e => pointSegmentGap(q, e.a, e.b) < reach);
    let best: Point | undefined,
      gap = 2 * reach;
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        const p = lineCrossing(near[i].a, near[i].b, near[j].a, near[j].b);
        if (!p) continue;
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < gap) {
          gap = d;
          best = p;
        }
      }
    if (best) return best;
    // A vertex on no input edge is a kernel error: the sweep kernel takes over.
    if (!near.length) throw new Error("clipper-vertex");
    const { a, b } = near.reduce((m, e) => (pointSegmentGap(q, e.a, e.b) < pointSegmentGap(q, m.a, m.b) ? e : m)),
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy);
    return [a[0] + dx * t, a[1] + dy * t];
  };
  // The sweep kernel's form: rings closed, outlines counter-clockwise (negative here) and holes clockwise, each ring
  // starting at its lowest leftmost vertex, holes and polygons in the order of those vertices.
  const before = (p: Point, q: Point) => p[0] - q[0] || p[1] - q[1];
  const ring = (points: Point[], outer: boolean): Point[] => {
    if (polygonArea(points) < 0 !== outer) points.reverse();
    let start = 0;
    points.forEach((p, i) => {
      if (before(p, points[start]) < 0) start = i;
    });
    const turned = [...points.slice(start), ...points.slice(0, start)];
    return [...turned, turned[0]];
  };
  // A contour in exact coordinates, cut into simple loops where it passes one point twice. Clipper 1 returns a ring
  // that touches itself as one contour through the touching vertex twice (its strictly simple mode can misplace
  // edges), and a vertex it rounded off another's edge is given back onto that vertex; the sweep kernel returned
  // simple rings.
  const loops = (path: ClipperTypes.Path): Point[][] => {
    const seen = new Map<string, number>(),
      stack: Point[] = [],
      out: Point[][] = [];
    for (const q of path) {
      const p = origin.get(latticeKey(q.X, q.Y)) ?? crossing([q.X / scale, q.Y / scale]),
        k = `${p[0]},${p[1]}`,
        j = seen.get(k);
      if (j === undefined) {
        seen.set(k, stack.length);
        stack.push(p);
        continue;
      }
      const loop = [stack[j], ...stack.splice(j + 1)];
      for (const v of loop.slice(1)) seen.delete(`${v[0]},${v[1]}`);
      if (loop.length >= 3) out.push(loop);
    }
    if (stack.length >= 3) out.push(stack);
    return out.filter(loop => polygonArea(loop) !== 0);
  };
  const turn = (points: Point[]) => Math.sign(polygonArea(points));
  const result: MultiPolygon = [];
  const walk = (node: ClipperTypes.PolyNode) => {
    for (const contour of node.Childs()) {
      const parts = loops(contour.Contour()),
        // The contour's own way: that of its largest loop.
        way = turn(
          parts.reduce((m, p) => (Math.abs(polygonArea(p)) > Math.abs(polygonArea(m)) ? p : m), parts[0] ?? [])
        ),
        // A loop turning the contour's way is an outline of its own, one turning the other way a hole in it.
        outlines = parts.filter(p => turn(p) === way).map(p => ring(p, true)),
        holes = parts.filter(p => turn(p) !== way).map(p => ring(p, false));
      for (const child of contour.Childs()) {
        const childParts = loops(child.Contour());
        // A hole's loop turning the other way is an island in it, an outline of its own.
        for (const loop of childParts)
          if (turn(loop) !== way) holes.push(ring(loop, false));
          else result.push([ring(loop, true)] as MultiPolygon[number]);
      }
      const owned: Point[][][] = outlines.map(() => []);
      for (const hole of holes) {
        let owner = 0;
        if (outlines.length > 1) {
          // The outline round most of the hole's vertices (it may touch one at a vertex).
          const votes = outlines.map(o => hole.filter(q => pointInPolygon(q, o)).length);
          owner = votes.indexOf(Math.max(...votes));
        }
        owned[owner]?.push(hole);
      }
      outlines.forEach((o, i) => {
        result.push([o, ...owned[i].sort((p, q) => before(p[0], q[0]))] as MultiPolygon[number]);
      });
      for (const child of contour.Childs()) walk(child);
    }
  };
  walk(tree);
  return result.sort((p, q) => before(p[0][0], q[0][0]));
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
    result = clipperBoolean(a, b, operation);
  } catch {
    result = sweepBoolean();
  }
  // The former kernel: kept for the rare input the integer kernel refuses.
  function sweepBoolean(): MultiPolygon {
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
    return result;
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

/** Outline pairs above this many edge pairs are left to the clipping kernel rather than tested edge by edge. */
const QUICK_PAIR_BUDGET = 20000;
const boxesApart = (a: ReturnType<typeof ringBox>, b: ReturnType<typeof ringBox>) =>
  a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY;
/** Whether `p` and `q` surely share no area (false: unknown). */
function surelyApart(
  p: VectorPolygon,
  q: VectorPolygon,
  pb: ReturnType<typeof ringBox>,
  qb: ReturnType<typeof ringBox>
) {
  if (boxesApart(pb, qb)) return true;
  return p.outer.length * q.outer.length <= QUICK_PAIR_BUDGET && ringSurelyApart(p.outer, q);
}
/** Whether `p` surely lies inside `q`'s area (false: unknown). */
function surelyWithin(p: VectorPolygon, q: VectorPolygon) {
  if (p.outer.length * q.outer.length > QUICK_PAIR_BUDGET || !ringSurelyInside(p.outer, q.outer)) return false;
  // Inside `q`'s outline and clear of each of its holes.
  return q.holes.every(h => {
    const hb = ringBox(h);
    return (
      boxesApart(ringBox(p.outer), hb) ||
      (p.outer.length * h.length <= QUICK_PAIR_BUDGET && ringSurelyApart(h, { outer: p.outer, holes: [] }))
    );
  });
}

/**
 * Whether `a` and `b` overlap by more than `minArea` m²: the answer of
 * `regionBoolean(a, b, "intersection").some(r => regionArea(r) > minArea)` without building the overlap where the
 * outlines alone decide it. Pieces that surely meet nothing are left out of the kernel; it runs only when unsure.
 */
export function regionsOverlap(a: VectorPolygon[], b: VectorPolygon[], minArea: number): boolean {
  if (!a.length || !b.length) return false;
  const ab = a.map(p => ringBox(p.outer)),
    bb = b.map(q => ringBox(q.outer)),
    meets = a.map((p, i) => b.map((q, j) => !surelyApart(p, q, ab[i], bb[j])));
  for (const [i, p] of a.entries())
    for (const [j, q] of b.entries()) {
      if (!meets[i][j]) continue;
      // One wholly inside the other: their overlap is at least its area.
      if ((surelyWithin(p, q) && regionArea(p) > minArea) || (surelyWithin(q, p) && regionArea(q) > minArea))
        return true;
    }
  const left = a.filter((_, i) => meets[i].some(Boolean)),
    right = b.filter((_, j) => meets.some(row => row[j]));
  if (!left.length || !right.length) return false;
  return regionBoolean(left, right, "intersection").some(r => regionArea(r) > minArea);
}

/**
 * Whether more than `minArea` m² of `a` lies outside `b`: the answer of
 * `regionBoolean(a, b, "difference").some(r => regionArea(r) > minArea)`, decided from the outlines where they
 * settle it.
 */
export function regionsExceed(a: VectorPolygon[], b: VectorPolygon[], minArea: number): boolean {
  if (!a.length) return false;
  const ab = a.map(p => ringBox(p.outer)),
    bb = b.map(q => ringBox(q.outer)),
    meets = a.map((p, i) => b.map((q, j) => !surelyApart(p, q, ab[i], bb[j])));
  // A piece clear of all of `b` lies wholly outside it.
  for (const [i, p] of a.entries()) if (!meets[i].some(Boolean) && regionArea(p) > minArea) return true;
  // Every piece inside one of `b`'s: nothing lies outside.
  if (a.every((p, i) => b.some((q, j) => meets[i][j] && surelyWithin(p, q)))) return false;
  const right = b.filter((_, j) => meets.some(row => row[j]));
  return regionBoolean(a, right, "difference").some(r => regionArea(r) > minArea);
}

/** Whether `inner` surely lies inside one of `regions` (false: unknown). */
export function regionSurelyWithin(inner: VectorPolygon, regions: VectorPolygon[]): boolean {
  const box = ringBox(inner.outer);
  return regions.some(q => !boxesApart(box, ringBox(q.outer)) && surelyWithin(inner, q));
}

/**
 * `regionBoolean([{ outer: subject, holes: [] }], [{ outer: convex, holes: [] }], "intersection")` for a convex clip
 * ring, by clipping the subject against each edge (Sutherland–Hodgman), without the sweep kernel. Undefined where
 * the answer may be in several pieces (the clipped outline is then not simple): the caller falls back to the kernel.
 */
export function convexIntersection(subject: Point[], convex: Point[]): VectorPolygon[] | undefined {
  const sb = ringBox(subject),
    cb = ringBox(convex);
  if (boxesApart(sb, cb)) return [];
  // `polygonArea` is negative for a counter-clockwise ring (x right, y up).
  const turn = polygonArea(convex) < 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < convex.length && out.length; i++) {
    const a = convex[i],
      b = convex[(i + 1) % convex.length],
      side = (p: Point) => turn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])),
      next: Point[] = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j],
        q = out[(j + 1) % out.length],
        sp = side(p),
        sq = side(q);
      if (sp >= 0) next.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    out = next;
  }
  // The kernel's clean-up: no repeated points, no collinear or reversing vertices.
  const points: Point[] = [];
  for (const p of out)
    if (!points.length || Math.hypot(p[0] - points.at(-1)![0], p[1] - points.at(-1)![1]) > 1e-7)
      points.push([p[0] + 0, p[1] + 0]);
  if (points.length > 1 && Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) <= 1e-7)
    points.pop();
  for (let i = points.length - 1; i >= 0 && points.length > 3; i--) {
    const a = points[(i + points.length - 1) % points.length],
      b = points[i],
      c = points[(i + 1) % points.length],
      length = Math.hypot(c[0] - a[0], c[1] - a[1]),
      height =
        length > 1e-9
          ? Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / length
          : Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (height < 1e-7) points.splice(i, 1);
  }
  if (points.length < 3 || Math.abs(polygonArea(points)) <= 1e-8) return [];
  // Pieces joined along the clip edge leave a contour that touches itself: not decided here.
  if (!isSimplePolygon(points, 0)) return undefined;
  // Counter-clockwise, as the kernel returns an outline.
  return [{ outer: polygonArea(points) > 0 ? points.reverse() : points, holes: [] }];
}
