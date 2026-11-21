import type { Point } from "../../../types/primitives";
import type { VectorPath } from "../../../types/vector/document";
import { pointInPolygon, polygonArea, segmentsIntersect } from "../../geom";
import { pathIsClosed } from "./curves";
import { sampledWidth, samplePath } from "./sampling";

export interface PathSurface {
  outer: Point[];
  holes: Point[][];
}
const cache = new Map<string, PathSurface>();
export function clearVectorGeometryCache(): void {
  cache.clear();
}
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const distance = (a: Point, b: Point) => Math.hypot(...sub(a, b));

/**
 * Broad phase by a sweep along x (the pairs whose boxes meet), then exact segment tests; adjacent edges may share
 * endpoints. Most rings are small and tested once, so a sort beats building a spatial index.
 */
export function simpleContour(points: Point[], closed: boolean): boolean {
  const count = points.length - (closed ? 0 : 1);
  if (count <= 0) return true;
  const minX = new Float64Array(count),
    minY = new Float64Array(count),
    maxX = new Float64Array(count),
    maxY = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (distance(a, b) < 1e-9) return false;
    minX[i] = Math.min(a[0], b[0]);
    minY[i] = Math.min(a[1], b[1]);
    maxX[i] = Math.max(a[0], b[0]);
    maxY[i] = Math.max(a[1], b[1]);
  }
  const order = Array.from({ length: count }, (_, i) => i).sort((i, j) => minX[i] - minX[j]);
  for (let s = 0; s < count; s++) {
    const i = order[s];
    for (let t = s + 1; t < count; t++) {
      const j = order[t];
      if (minX[j] > maxX[i]) break;
      if (minY[j] > maxY[i] || maxY[j] < minY[i]) continue;
      // The later edge first, as it was tested against those before it.
      const hi = Math.max(i, j),
        lo = Math.min(i, j);
      if (lo === hi - 1 || (closed && hi === count - 1 && lo === 0)) continue;
      if (segmentsIntersect(points[hi], points[(hi + 1) % points.length], points[lo], points[(lo + 1) % points.length]))
        return false;
    }
  }
  return true;
}

/** Bevel outer joins and exact inner offset intersections; no cell topology is created. */
export function pathSurface(path: VectorPath): PathSurface {
  const key = JSON.stringify(["surface-v2", path.source, path.width]);
  const previous = cache.get(key);
  if (previous) return previous;
  const result = buildPathSurface(path);
  for (const ring of [result.outer, ...result.holes]) {
    for (const p of ring) Object.freeze(p);
    Object.freeze(ring);
  }
  Object.freeze(result.holes);
  Object.freeze(result);
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

function buildPathSurface(path: VectorPath): PathSurface {
  const raw = samplePath(path, true),
    widths = sampledWidth(path, raw),
    closed = pathIsClosed(path);
  const vertices = raw
    .map((p, i) => ({ p: p.point, w: widths[i] }))
    .filter((v, i, all) => i === 0 || distance(v.p, all[i - 1].p) > 1e-9);
  if (closed && distance(vertices[0].p, vertices.at(-1)!.p) < 1e-6) vertices.pop();
  const points = vertices.map(v => v.p);
  if (!simpleContour(points, closed)) throw new Error("self-intersection");
  const offsets = (side: 1 | -1) =>
    vertices.map((v, i) => {
      const prev = points[(i + points.length - 1) % points.length],
        next = points[(i + 1) % points.length];
      const direction = (a: Point, b: Point): Point => {
        const d = sub(b, a),
          n = Math.hypot(...d);
        return [d[0] / n, d[1] / n];
      };
      const before = !closed && i === 0 ? direction(v.p, next) : direction(prev, v.p);
      const after = !closed && i === points.length - 1 ? before : direction(v.p, next);
      const width = side === 1 ? v.w.left : v.w.right;
      const a: Point = [v.p[0] - before[1] * width * side, v.p[1] + before[0] * width * side];
      const b: Point = [v.p[0] - after[1] * width * side, v.p[1] + after[0] * width * side];
      if (Math.abs(cross(before, after)) < 1e-10) {
        if (dot(before, after) <= 0) throw new Error("width-fold");
        return [a];
      }
      if (cross(before, after) * side < 0) return [a, b];
      const t = cross(sub(b, a), after) / cross(before, after);
      if (Math.abs(t) > width * 8) throw new Error("width-fold");
      return [[a[0] + before[0] * t, a[1] + before[1] * t] as Point];
    });
  const left = offsets(1),
    right = offsets(-1);
  for (const outline of [left, right])
    for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
      const j = (i + 1) % points.length;
      if (dot(sub(outline[j][0], outline[i].at(-1)!), sub(points[j], points[i])) <= 0) throw new Error("width-fold");
    }
  if (!closed) {
    const outer = [...left.flat(), ...right.flat().reverse()];
    if (!simpleContour(outer, true)) throw new Error("width-fold");
    return { outer, holes: [] };
  }
  const [inner, outer] = polygonArea(points) < 0 ? [left.flat(), right.flat()] : [right.flat(), left.flat()];
  if (!simpleContour(inner, true) || !simpleContour(outer, true) || !pointInPolygon(inner[0], outer))
    throw new Error("width-fold");
  return { outer, holes: [inner] };
}

export function surfacesOverlap(a: PathSurface, b: PathSurface): boolean {
  const inRegion = (p: Point, r: PathSurface) => pointInPolygon(p, r.outer) && !r.holes.some(h => pointInPolygon(p, h));
  if (a.outer.some(p => inRegion(p, b)) || b.outer.some(p => inRegion(p, a))) return true;
  return [a.outer, ...a.holes].some(ring =>
    [b.outer, ...b.holes].some(other =>
      ring.some((p, i) =>
        other.some((q, j) => segmentsIntersect(p, ring[(i + 1) % ring.length], q, other[(j + 1) % other.length]))
      )
    )
  );
}
