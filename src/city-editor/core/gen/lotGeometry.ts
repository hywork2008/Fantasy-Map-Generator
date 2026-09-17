import type { Point } from "../types";
import { polygonArea } from "./geom";

/** Intersect inward offset half-planes. The result remains inside even a
 * concave edited face; an empty/narrow kernel simply receives no buildings. */
export function insetConvexKernel(poly: Point[], distances: number[]): Point[] {
  const sign = -Math.sign(polygonArea(poly));
  if (!sign || poly.length < 3) return [];
  const xs = poly.map(p => p[0]);
  const ys = poly.map(p => p[1]);
  let result: Point[] = [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
    [Math.min(...xs), Math.max(...ys)]
  ];
  for (let i = 0; i < poly.length && result.length >= 3; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    const normal: Point = [(sign * (b[1] - a[1])) / length, (sign * (a[0] - b[0])) / length];
    result = clipHalfPlane(result, normal, a[0] * normal[0] + a[1] * normal[1] - distances[i]);
  }
  return result;
}

export function clipHalfPlane(poly: Point[], normal: Point, offset: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = a[0] * normal[0] + a[1] * normal[1] - offset;
    const db = b[0] * normal[0] + b[1] * normal[1] - offset;
    if (da <= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

/** Align lots with the longest boundary, then cut along the longer dimension. */
export function longestFrame(poly: Point[]): { axis: Point; min: number; max: number; across: number } {
  let axis: Point = [1, 0];
  let longest = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) {
      longest = length;
      axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    }
  }
  const bounds = (n: Point) => {
    const values = poly.map(p => p[0] * n[0] + p[1] * n[1]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [min, max] = bounds(axis);
  const normal: Point = [-axis[1], axis[0]];
  const [lo, hi] = bounds(normal);
  if (hi - lo > max - min) return { axis: normal, min: lo, max: hi, across: max - min };
  return { axis, min, max, across: hi - lo };
}
