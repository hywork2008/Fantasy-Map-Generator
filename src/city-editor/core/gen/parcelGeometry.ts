import type { Point } from "../types";
import { polygonArea } from "./geom";
import { clipHalfPlane } from "./lotGeometry";

export const plotArea = (p: Point[]) => Math.abs(polygonArea(p));
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export type Bounds = [number, number, number, number];
export function bounds(poly: Point[]): Bounds {
  return [
    Math.min(...poly.map(p => p[0])),
    Math.min(...poly.map(p => p[1])),
    Math.max(...poly.map(p => p[0])),
    Math.max(...poly.map(p => p[1]))
  ];
}
export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;
}
export function intersectConvex(subject: Point[], clip: Point[]): Point[] {
  let p = subject;
  const sign = -Math.sign(polygonArea(clip));
  for (let i = 0; i < clip.length && p.length >= 3; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const n: Point = [sign * (b[1] - a[1]), sign * (a[0] - b[0])];
    p = clipHalfPlane(p, n, dot(a, n));
  }
  return p;
}
/** Disjoint convex components of subject minus a convex reserved space. */
export function subtractConvex(subject: Point[], reserved: Point[], minimumArea = 1): Point[][] {
  if (!boundsOverlap(bounds(subject), bounds(reserved)) || plotArea(intersectConvex(subject, reserved)) < 1e-6)
    return [subject];
  const sign = -Math.sign(polygonArea(reserved));
  let inside = subject;
  const outside: Point[][] = [];
  for (let i = 0; i < reserved.length && inside.length >= 3; i++) {
    const a = reserved[i],
      b = reserved[(i + 1) % reserved.length];
    const n: Point = [sign * (b[1] - a[1]), sign * (a[0] - b[0])];
    const off = dot(a, n);
    const part = clipHalfPlane(inside, [-n[0], -n[1]], -off);
    if (part.length >= 3 && plotArea(part) >= minimumArea) outside.push(part);
    inside = clipHalfPlane(inside, n, off);
  }
  return outside;
}
export function corridor(a: Point, b: Point, width: number, extension = 0): Point[] {
  const len = distance(a, b);
  if (len < 1e-6) return [];
  const x: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const y: Point = [-x[1], x[0]];
  return [
    [-extension, -width / 2],
    [len + extension, -width / 2],
    [len + extension, width / 2],
    [-extension, width / 2]
  ].map(([u, v]) => [a[0] + x[0] * u + y[0] * v, a[1] + x[1] * u + y[1] * v]);
}
/** Spatial buckets avoid scanning every street / face in a large city for each lot. */
export class PlotIndex<T> {
  private buckets = new Map<string, Set<T>>();
  constructor(private readonly size = 80) {}
  add(item: T, box: Bounds): void {
    for (const key of this.keys(box)) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new Set();
        this.buckets.set(key, bucket);
      }
      bucket.add(item);
    }
  }
  query(box: Bounds): T[] {
    const found = new Set<T>();
    for (const key of this.keys(box)) for (const item of this.buckets.get(key) ?? []) found.add(item);
    return [...found];
  }
  private *keys([x0, y0, x1, y1]: Bounds): Generator<string> {
    for (let x = Math.floor(x0 / this.size); x <= Math.floor(x1 / this.size); x++)
      for (let y = Math.floor(y0 / this.size); y <= Math.floor(y1 / this.size); y++) yield `${x}:${y}`;
  }
}
