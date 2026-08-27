// Small 2D polygon helpers. No external deps.

import type { Point } from "./types";

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Signed area (positive when the ring is counter-clockwise). */
export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return a / 2;
}

/** Area-weighted centroid. Falls back to the vertex mean for degenerate rings. */
export function polygonCentroid(poly: Point[]): Point {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    twiceArea += cross;
    cx += (poly[j][0] + poly[i][0]) * cross;
    cy += (poly[j][1] + poly[i][1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const mean = poly.reduce<Point>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [mean[0] / poly.length, mean[1] / poly.length];
  }
  const f = 1 / (3 * twiceArea);
  return [cx * f, cy * f];
}

/** Sutherland–Hodgman clip of a convex-ish polygon against an axis-aligned rect. */
export function clipPolygonToRect(poly: Point[], rect: Rect): Point[] {
  const edges: ((p: Point) => boolean)[] = [
    p => p[0] >= rect.minX,
    p => p[0] <= rect.maxX,
    p => p[1] >= rect.minY,
    p => p[1] <= rect.maxY
  ];
  const intersect: ((a: Point, b: Point) => Point)[] = [
    (a, b) => lerpX(a, b, rect.minX),
    (a, b) => lerpX(a, b, rect.maxX),
    (a, b) => lerpY(a, b, rect.minY),
    (a, b) => lerpY(a, b, rect.maxY)
  ];

  let out = poly;
  for (let e = 0; e < 4 && out.length > 0; e++) {
    const inside = edges[e];
    const clip = intersect[e];
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(clip(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(clip(prev, cur));
      }
    }
  }
  return out;
}

/** True when any vertex sits on a rect edge (within eps) — the "on border" test. */
export function polygonTouchesRectEdge(poly: Point[], rect: Rect, eps = 1e-6): boolean {
  return poly.some(
    p =>
      Math.abs(p[0] - rect.minX) < eps ||
      Math.abs(p[0] - rect.maxX) < eps ||
      Math.abs(p[1] - rect.minY) < eps ||
      Math.abs(p[1] - rect.maxY) < eps
  );
}

function lerpX(a: Point, b: Point, x: number): Point {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}

function lerpY(a: Point, b: Point, y: number): Point {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}
