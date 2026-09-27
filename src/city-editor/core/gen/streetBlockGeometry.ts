import type { Point } from "../types";
import { pointInPolygon, polygonArea } from "./geom";
import type { CityFabric } from "./localInfill";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const area = (p: Point[]) => Math.abs(polygonArea(p));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const key = (p: Point) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;

/** Remove only duplicate/collinear vertices, not meaningful bends in an edited boundary. */
export function cleanStreetRing(poly: Point[]): Point[] {
  const distinct = poly.filter((p, i) => distance(p, poly[(i + 1) % poly.length]) > 1e-6);
  return distinct.filter((p, i) => {
    const a = distinct[(i + distinct.length - 1) % distinct.length],
      b = distinct[(i + 1) % distinct.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
  });
}

/** Intervals of a line inside a simple (possibly concave) polygon. */
export function streetChords(poly: Point[], normal: Point, offset: number, insideOnly = false): [Point, Point][] {
  const hits = new Map<string, Point>();
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const da = signedDistance(a, normal, offset),
      db = signedDistance(b, normal, offset);
    if (Math.abs(da) < 1e-7) hits.set(key(a), a);
    if (da * db < 0) {
      const t = da / (da - db);
      const p: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      hits.set(key(p), p);
    }
  }
  const tangent: Point = [-normal[1], normal[0]];
  const ordered = [...hits.values()].sort((a, b) => dot(a, tangent) - dot(b, tangent));
  return ordered.slice(1).flatMap((b, i) => {
    const a = ordered[i];
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const left: Point = [middle[0] - normal[0] * 1e-6, middle[1] - normal[1] * 1e-6];
    const right: Point = [middle[0] + normal[0] * 1e-6, middle[1] + normal[1] * 1e-6];
    return distance(a, b) > 1e-6 && pointInPolygon(left, poly) && (insideOnly || pointInPolygon(right, poly))
      ? [[a, b] as [Point, Point]]
      : [];
  });
}

function signedDistance(p: Point, normal: Point, offset: number): number {
  const value = dot(p, normal) - offset;
  return Math.abs(value) < 1e-7 ? 0 : value;
}

/** Half-plane clipping that returns disconnected components separately.
 * Ordinary Sutherland-Hodgman clipping joins the arms of a U across its empty
 * centre. Keeping boundary runs separate prevents streets/buildings in parks
 * and avoids a triangulation fan around the original district vertices. */
export function clipStreetBlocks(poly: Point[], normal: Point, offset: number): Point[][] {
  const ring = polygonArea(poly) > 0 ? [...poly].reverse() : poly;
  if (ring.every(p => dot(p, normal) <= offset + 1e-7)) return [ring];
  if (ring.every(p => dot(p, normal) >= offset - 1e-7)) return [];
  const edges: [Point, Point][] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const da = signedDistance(a, normal, offset),
      db = signedDistance(b, normal, offset);
    // A boundary lying on the cut belongs to this half only when its interior
    // faces into the retained half-plane. Otherwise it is a dangling run.
    if (da === 0 && db === 0) {
      if ((b[0] - a[0]) * -normal[1] + (b[1] - a[1]) * normal[0] > 0) edges.push([a, b]);
    } else if (da <= 0 && db <= 0) edges.push([a, b]);
    else if (da * db < 0) {
      const t = da / (da - db);
      const p: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      edges.push(da < 0 ? [a, p] : [p, b]);
    }
  }
  edges.push(...streetChords(ring, normal, offset, true));
  const next = new Map(edges.filter(([a, b]) => key(a) !== key(b)).map(([a, b]) => [key(a), b]));
  const result: Point[][] = [];
  while (next.size) {
    const start = next.keys().next().value!;
    let current = start;
    const points: Point[] = [];
    while (next.has(current)) {
      const p = next.get(current)!;
      next.delete(current);
      points.push(p);
      current = key(p);
      if (current === start) break;
    }
    if (current !== start) continue;
    const cleaned = cleanStreetRing(points);
    if (cleaned.length >= 3 && area(cleaned) > 1e-5) result.push(cleaned);
  }
  return result;
}

export interface BlockBoundary {
  a: Point;
  b: Point;
  setback: number;
  /** Existing roads, walls and water already provide the perimeter corridor. */
  feature: boolean;
  /** Keep lane endpoints clear of walls and water, which cannot be used as access. */
  barrier?: boolean;
}

export interface PerimeterFabric extends CityFabric {
  /** Buildable block outlines after street, wall and bank setbacks. */
  blocks: Point[][];
}
