import { pointInPolygon, segmentIntersection } from "../geometry";
import type { Point } from "../types";
export function signedArea(poly: Point[]): number {
  return (
    poly.reduce((s, p, i) => {
      const q = poly[(i + 1) % poly.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}
export const polygonArea = (poly: Point[]) => Math.abs(signedArea(poly));
/** Sutherland-Hodgman for convex Voronoi cells and rectangular tiles. */
export function clipConvex(subject: Point[], clip: Point[]): Point[] {
  let output = subject;
  const orientation = signedArea(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const side = (p: Point) => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        sp = side(p),
        sq = side(q);
      if (sp >= -1e-9) output.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return output;
}
/** Includes containment and edge crossings, including narrow water crossing a whole parcel. */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  if (!a.length || !b.length) return false;
  if (a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return true;
  return a.some((p, i) =>
    b.some((q, j) => segmentIntersection(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length]).intersects)
  );
}
export function rectangle(x: number, y: number, w: number, h: number): Point[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ];
}
/** Cut a partial parcel to exactly the remaining physical area rather than just changing its label. */
export function trimToArea(poly: Point[], target: number): Point[] {
  if (polygonArea(poly) <= target) return poly;
  const xs = poly.map(p => p[0]),
    ys = poly.map(p => p[1]);
  const left = Math.min(...xs),
    bottom = Math.min(...ys) - 1,
    top = Math.max(...ys) + 1;
  let lo = left,
    hi = Math.max(...xs),
    result = poly;
  for (let i = 0; i < 45; i++) {
    const cut = (lo + hi) / 2;
    result = clipConvex(poly, rectangle(left - 1, bottom, cut - left + 1, top - bottom));
    if (polygonArea(result) > target) hi = cut;
    else lo = cut;
  }
  return result;
}
export function lineBuffer(a: Point, b: Point, width: number): Point[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!length) return rectangle(a[0] - width / 2, a[1] - width / 2, width, width);
  const nx = (-(b[1] - a[1]) * width) / 2 / length,
    ny = ((b[0] - a[0]) * width) / 2 / length;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny]
  ];
}
/** Spatially correlated world noise. Adjacent cells and province windows share phases. */
export function landscapeNoise(x: number, y: number, seed: string): number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const phase = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  return (Math.sin(x / 3.7 + phase) + Math.cos(y / 4.3 - phase) + Math.sin((x + y) / 6.1 + phase * 2)) / 6 + 0.5;
}

/** Coarse heightfield gradient, used as an explicitly approximate slope constraint. */
export function approximateSlope(
  poly: Point[],
  terrain: { cols: number; rows: number; elevationsMeters: number[] } | undefined,
  widthUnits: number,
  heightUnits: number,
  metersPerUnit: number
): number | undefined {
  if (!terrain || terrain.cols < 2 || terrain.rows < 2) return undefined;
  const samples = poly.map(p => {
    if (p[0] < -1e-7 || p[1] < -1e-7 || p[0] > widthUnits + 1e-7 || p[1] > heightUnits + 1e-7) return undefined;
    const x = (Math.max(0, Math.min(widthUnits, p[0])) / widthUnits) * (terrain.cols - 1),
      y = (Math.max(0, Math.min(heightUnits, p[1])) / heightUnits) * (terrain.rows - 1);
    const ix = Math.min(terrain.cols - 2, Math.floor(x)),
      iy = Math.min(terrain.rows - 2, Math.floor(y)),
      tx = x - ix,
      ty = y - iy;
    const a = terrain.elevationsMeters[iy * terrain.cols + ix],
      b = terrain.elevationsMeters[iy * terrain.cols + ix + 1],
      c = terrain.elevationsMeters[(iy + 1) * terrain.cols + ix],
      d = terrain.elevationsMeters[(iy + 1) * terrain.cols + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  });
  let result = 0,
    found = false;
  for (let i = 0; i < poly.length; i++)
    for (let j = i + 1; j < poly.length; j++) {
      if (samples[i] === undefined || samples[j] === undefined) continue;
      const distance = Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]) * metersPerUnit;
      if (distance > 0) {
        result = Math.max(result, Math.abs(samples[i]! - samples[j]!) / distance);
        found = true;
      }
    }
  return found ? result : undefined;
}
