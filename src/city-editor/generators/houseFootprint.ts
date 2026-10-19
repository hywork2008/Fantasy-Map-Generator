import type { Point } from "../types/primitives";
import type { Front } from "./frontageBuildings.types";
import { polygonArea } from "./geom";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const MIN_SPAN = 2.5;
const MAX_ASPECT = 5;

/** Remove only shallow boundary kinks. Chords of a convex parcel stay inside
 * its ownership, preserving shared row cuts without expanding into neighbours. */
function simplifyBoundary(lot: Point[]): Point[] {
  let poly = lot;
  const budget = Math.abs(polygonArea(lot)) * 0.02;
  let removedArea = 0;
  while (poly.length > 4) {
    let bestIndex = -1,
      bestLoss = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i + poly.length - 1) % poly.length],
        p = poly[i],
        b = poly[(i + 1) % poly.length];
      const incoming: Point = [p[0] - a[0], p[1] - a[1]],
        outgoing: Point = [b[0] - p[0], b[1] - p[1]];
      const scale = Math.hypot(...incoming) * Math.hypot(...outgoing);
      if (scale < 1e-12 || dot(incoming, outgoing) / scale < Math.cos((20 * Math.PI) / 180)) continue;
      const loss = Math.abs(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]) / 2;
      const chord = distance(a, b);
      if (chord < 1e-6 || (2 * loss) / chord > 0.25 || removedArea + loss > budget || loss >= bestLoss) continue;
      bestIndex = i;
      bestLoss = loss;
    }
    if (bestIndex < 0) break;
    removedArea += bestLoss;
    poly = poly.filter((_, i) => i !== bestIndex);
  }
  return poly;
}

function isHouseQuad(poly: Point[]): boolean {
  const lengths = poly.map((p, i) => distance(p, poly[(i + 1) % poly.length]));
  return (
    poly.length === 4 &&
    Math.min(...lengths) >= MIN_SPAN &&
    Math.max(...lengths) / Math.min(...lengths) <= MAX_ASPECT &&
    lengths.every((length, i) => length >= lengths[(i + 2) % 4] * 0.4) &&
    poly.every((p, i) => {
      const a = poly[(i + 3) % 4],
        b = poly[(i + 1) % 4];
      const cosine =
        ((a[0] - p[0]) * (b[0] - p[0]) + (a[1] - p[1]) * (b[1] - p[1])) / (lengths[(i + 3) % 4] * lengths[i]);
      return Math.abs(cosine) <= Math.cos((60 * Math.PI) / 180);
    })
  );
}

/** Ordinary town houses keep modest four-wall skew to fill their parcels.
 * Bevels and acute tips are not copied into the building corners.
 * Fit inside the parcel, keeping an actual street facade and leaving only the
 * unusable remainder open. This never allocates a long rear garden. */
export function houseFootprint(lot: Point[], fronts: Front[], preferredAxis?: Point): Point[] {
  if (lot.length < 3) return [];
  if (isHouseQuad(lot)) return lot;
  const simplified = simplifyBoundary(lot);
  if (isHouseQuad(simplified)) return simplified;
  const lengths = lot.map((p, i) => distance(p, lot[(i + 1) % lot.length]));

  let best: Point[] = [];
  let bestScore = 0;
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
    // Retain the row's wall direction when several street-aligned rectangles
    // fit. Quarter turns describe the same rectangular wall axes.
    const alignment = preferredAxis ? Math.min(1, Math.abs(dot(axis, preferredAxis))) : 1;
    const rowAlignment = Math.max(alignment, Math.sqrt(Math.max(0, 1 - alignment * alignment)));
    const orientationWeight = 0.5 + 0.5 * rowAlignment ** 12;
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
        const score = width * depth * orientationWeight;
        if (depth < MIN_SPAN || width > depth * MAX_ASPECT || score <= bestScore) continue;
        bestScore = score;
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
