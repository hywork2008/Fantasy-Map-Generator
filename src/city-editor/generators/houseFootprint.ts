import type { Point } from "../types/primitives";
import type { Front } from "./frontageBuildings.types";
import { polygonArea } from "./geom";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const MIN_SPAN = 2.5;
const MAX_ASPECT = 5;

/** Ordinary town houses use a rectangular roofed range. A parcel's skewed
 * boundary, bevels and acute tips are not copied into the building corners.
 * Fit inside the parcel, keeping an actual street facade and leaving only the
 * unusable remainder open. This never allocates a long rear garden. */
export function houseFootprint(lot: Point[], fronts: Front[]): Point[] {
  if (lot.length < 3) return [];
  const lengths = lot.map((p, i) => distance(p, lot[(i + 1) % lot.length]));
  if (
    lot.length === 4 &&
    Math.min(...lengths) >= MIN_SPAN &&
    Math.max(...lengths) / Math.min(...lengths) <= MAX_ASPECT &&
    lot.every((p, i) => {
      const a = lot[(i + 3) % 4],
        b = lot[(i + 1) % 4];
      const cosine =
        ((a[0] - p[0]) * (b[0] - p[0]) + (a[1] - p[1]) * (b[1] - p[1])) / (lengths[(i + 3) % 4] * lengths[i]);
      return Math.abs(cosine) <= 1e-6;
    })
  )
    return lot;

  let best: Point[] = [];
  let bestArea = 0;
  const sign = -Math.sign(polygonArea(lot));
  for (let i = 0; i < lot.length; i++) {
    const a = lot[i],
      b = lot[(i + 1) % lot.length];
    const length = lengths[i];
    if (length < MIN_SPAN) continue;
    const street = fronts.find(
      f => Math.abs(dot(a, f.inward) - f.offset) < 1e-5 && Math.abs(dot(b, f.inward) - f.offset) < 1e-5
    );
    if (!street) continue;
    const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const inward: Point = [-sign * axis[1], sign * axis[0]];
    const local = lot.map(p => {
      const delta: Point = [p[0] - a[0], p[1] - a[1]];
      return [dot(delta, axis), dot(delta, inward)] as Point;
    });
    const constraints = local.map((p, j) => {
      const q = local[(j + 1) % local.length];
      // The inward frame always maps the parcel to counterclockwise order.
      const n: Point = [q[1] - p[1], p[0] - q[0]];
      return { n, offset: dot(p, n) };
    });
    // Search independent end trims: the best rectangle at a taper is usually
    // asymmetric. A fixed inset or a centred rectangle wastes the usable end.
    for (let left = 0; left <= 12; left++) {
      for (let right = 0; right <= 12 - left; right++) {
        const lo = (length * left) / 16,
          hi = length * (1 - right / 16);
        const width = hi - lo;
        if (width < (street.primary ? 3.5 : MIN_SPAN)) continue;
        let depth = width * MAX_ASPECT;
        for (const { n, offset } of constraints) {
          if (n[1] <= 1e-8) continue;
          depth = Math.min(depth, (offset - Math.max(n[0] * lo, n[0] * hi)) / n[1]);
        }
        if (depth < MIN_SPAN || width > depth * MAX_ASPECT || width * depth <= bestArea) continue;
        bestArea = width * depth;
        best = [
          [lo, 0],
          [hi, 0],
          [hi, depth],
          [lo, depth]
        ].map(([x, y]): Point => [a[0] + axis[0] * x + inward[0] * y, a[1] + axis[1] * x + inward[1] * y]);
      }
    }
  }
  return best;
}
