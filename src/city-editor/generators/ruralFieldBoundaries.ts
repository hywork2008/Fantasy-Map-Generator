import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea } from "./geom";
import { convexInfillParts, triangularInfillParts } from "./lotGeometry";
import { bounds, intersectConvex, PlotIndex } from "./parcelGeometry";

const signature = (p: Point) => p.map(n => n.toFixed(5)).join(":");
const area = (p: Point[]) => Math.abs(polygonArea(p));

/** Reconstruct shared boundary chains from the raster, then replace staircase
 * runs with checked chords. Both neighbours use the same replacement. A local
 * obstruction subdivides that run rather than reverting an entire field. */
export function reconstructRuralBoundaries(
  rings: Point[][],
  quantum: number,
  clear: (polygon: Point[]) => boolean,
  profiler?: import("../utils/ruralFieldProfiler").RuralFieldProfiler
): Point[][] {
  const timing = profiler?.stages("generation/layout/reconstruct-boundaries");
  timing?.next("graph-and-index");
  const points = new Map<string, Point>();
  const graph = new Map<string, Set<string>>();
  const members = new Map<string, Set<number>>();
  const keys = rings.map((ring, index) =>
    ring.map((point, i) => {
      const a = signature(point),
        b = signature(ring[(i + 1) % ring.length]);
      points.set(a, point);
      graph.set(a, new Set([...(graph.get(a) ?? []), b]));
      graph.set(b, new Set([...(graph.get(b) ?? []), a]));
      members.set(a, new Set([...(members.get(a) ?? []), index]));
      return a;
    })
  );
  const current = rings.map(ring => ring);
  const index = new PlotIndex<number>();
  rings.forEach((ring, i) => {
    index.add(i, bounds(ring));
  });
  const simple = profiler?.wrap("simple-polygon", isSimplePolygon) ?? isSimplePolygon;
  const triangulate = profiler?.wrap("convex-decomposition", convexInfillParts) ?? convexInfillParts;
  const boundaryClear = profiler?.wrap("clearance", clear) ?? clear;
  const intersectionParts = new WeakMap<Point[], { polygon: Point[]; box: ReturnType<typeof bounds> }[]>();
  const intersectionTriangles =
    profiler?.wrap("intersection-triangulation", triangularInfillParts) ?? triangularInfillParts;
  const overlapArea = (pieces: Point[][], ring: Point[]) => {
    let other = intersectionParts.get(ring);
    if (!other) {
      // Intersection only needs triangles; maximal convex-piece merging is unnecessary.
      other = intersectionTriangles(ring).map(polygon => ({ polygon, box: bounds(polygon) }));
      intersectionParts.set(ring, other);
    }
    let total = 0;
    for (const piece of pieces) {
      const box = bounds(piece);
      for (const part of other) {
        if (box[0] >= part.box[2] || box[2] <= part.box[0] || box[1] >= part.box[3] || box[3] <= part.box[1]) continue;
        total += area(intersectConvex(piece, part.polygon));
      }
    }
    return total;
  };
  const overlap = profiler?.wrap("overlap", overlapArea) ?? overlapArea;
  const parts = new WeakMap<Point[], Point[][]>();
  const convex = (ring: Point[]) => {
    let value = parts.get(ring);
    if (!value) {
      value = triangulate(ring);
      parts.set(ring, value);
    }
    return value;
  };
  timing?.next("simplify-and-validate");
  const remove = (interior: string[]): boolean => {
    if (!interior.length) return true;
    const deleted = new Set(interior);
    const affected = new Set(interior.flatMap(id => [...(members.get(id) ?? [])]));
    const replacements = new Map<number, { ids: string[]; ring: Point[]; parts: Point[][] }>();
    for (const i of affected) {
      const ids = keys[i].filter(id => !deleted.has(id));
      const ring = ids.map(id => points.get(id)!);
      if (ring.length === keys[i].length) continue;
      if (!simple(ring, 150) || Math.sign(polygonArea(ring)) !== Math.sign(polygonArea(current[i]))) return false;
      const pieces = convex(ring);
      if (!pieces.length || pieces.some(piece => !boundaryClear(piece))) return false;
      replacements.set(i, { ids, ring, parts: pieces });
    }
    for (const { ring, parts: pieces } of replacements.values()) {
      const [x0, y0, x1, y1] = bounds(ring);
      for (const other of index.query([x0 - quantum * 2, y0 - quantum * 2, x1 + quantum * 2, y1 + quantum * 2])) {
        if (replacements.has(other)) continue;
        const sharedArea = overlap(pieces, current[other]);
        if (sharedArea > 0.01) return false;
      }
    }
    for (const [i, value] of replacements) {
      keys[i] = value.ids;
      current[i] = value.ring;
    }
    return true;
  };
  const simplify = (chain: string[], first: number, last: number) => {
    if (last - first < 2) return;
    const a = points.get(chain[first])!,
      b = points.get(chain[last])!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    let far = first + 1,
      deviation = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points.get(chain[i])!;
      const d = length
        ? Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length
        : Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (d > deviation) {
        deviation = d;
        far = i;
      }
    }
    if (deviation <= quantum * 1.25 && remove(chain.slice(first + 1, last))) return;
    simplify(chain, first, far);
    simplify(chain, far, last);
  };
  const edges = new Set<string>();
  const edge = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const walk = (start: string, next: string) => {
    const chain = [start];
    let previous = start,
      id = next;
    while (!edges.has(edge(previous, id))) {
      edges.add(edge(previous, id));
      chain.push(id);
      const adjacent = graph.get(id)!;
      if (adjacent.size !== 2 || id === start) break;
      const following = [...adjacent].find(k => k !== previous)!;
      previous = id;
      id = following;
    }
    if (chain.at(-1) === start) {
      let far = 1,
        dist = 0;
      const p = points.get(start)!;
      for (let i = 1; i < chain.length - 1; i++) {
        const q = points.get(chain[i])!,
          d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d > dist) {
          dist = d;
          far = i;
        }
      }
      simplify(chain, 0, far);
      simplify(chain, far, chain.length - 1);
    } else simplify(chain, 0, chain.length - 1);
  };
  for (const [id, adjacent] of graph)
    if (adjacent.size !== 2) for (const next of adjacent) if (!edges.has(edge(id, next))) walk(id, next);
  for (const [id, adjacent] of graph) for (const next of adjacent) if (!edges.has(edge(id, next))) walk(id, next);
  timing?.end();
  return current;
}
