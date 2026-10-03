import type { Point } from "../types";
import type { Front, FrontageOptions } from "./frontageBuildings";
import { polygonArea, polygonCentroid } from "./geom";
import { clipHalfPlane, insetConvexKernel } from "./lotGeometry";
import type { Rng } from "./prng";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const area = (poly: Point[]) => Math.abs(polygonArea(poly));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Plan complete rows before creating houses. Shared cuts are the only interior
 * boundaries: a corner remnant is merged into its neighbour, never trimmed off
 * a house after the surrounding land has already been assigned. */
export function packPerimeter(block: Point[], fronts: Front[], options: FrontageOptions, rng: Rng): Point[][] {
  if (!fronts.length || options.coverage <= 0 || options.occupancy <= 0) return [];
  let low = 0,
    high = Math.sqrt(area(block));
  const yardArea = area(block) * (1 - Math.min(1, options.coverage));
  for (let i = 0; i < 24; i++) {
    const depth = (low + high) / 2;
    if (
      area(
        insetConvexKernel(
          block,
          block.map(() => depth)
        )
      ) > yardArea
    )
      low = depth;
    else high = depth;
  }
  const rowDepth = options.rowDepth === undefined ? high : Math.min(high, options.rowDepth);
  const ordered = fronts.slice().sort((a, b) => Number(b.primary) - Number(a.primary) || b.length - a.length);
  const first = ordered[0];
  const candidate = ordered.slice(1).sort((a, b) => dot(a.inward, first.inward) - dot(b.inward, first.inward))[0];
  const opposite = candidate && dot(candidate.inward, first.inward) < -0.35 ? candidate : undefined;
  if (opposite) {
    ordered.splice(ordered.indexOf(opposite), 1);
    ordered.splice(1, 0, opposite);
  }
  const span = Math.max(...block.map(p => dot(p, first.inward) - first.offset));
  const paired = Boolean(
    opposite && span <= (options.rowDepth === undefined ? 32 : options.rowDepth * 2 + 3) && options.coverage >= 0.82
  );
  const buildings: Point[][] = [];
  let unassigned = block;
  for (const front of ordered) {
    const pairedRow = paired && (front === first || front === opposite);
    // Both rows use one street-aligned frame and a straight shared spine.
    // Independent, angled ownership wedges create unnecessary diagonal walls.
    const frame = pairedRow ? first : front;
    const normal: Point = pairedRow && front === opposite ? [-first.inward[0], -first.inward[1]] : frame.inward;
    const offset = pairedRow ? (front === opposite ? -1 : 1) * (first.offset + span / 2) : front.offset + rowDepth;
    const band = cleanPolygon(clipHalfPlane(unassigned, normal, offset));
    if (band.length < 3 || area(band) < 12) continue;
    const local = band.map(p => [dot(p, frame.axis), dot(p, frame.inward)] as Point);
    const depth = Math.max(...local.map(p => p[1])) - Math.min(...local.map(p => p[1]));
    // A larger target plot widens its frontage as well as its depth. Capping
    // every row at ~5 m made large plots produce excessive narrow houses.
    const frontageLimit = options.lotArea <= 110 ? (front.primary ? 5.6 : 5.4) : 16;
    const width = Math.max(
      front.primary ? 4.2 : 3.8,
      Math.min(frontageLimit, depth * 0.75, Math.sqrt(options.lotArea) * 0.52)
    );
    const lots = planRow(band, frame.axis, width, fronts, rng);
    if (!lots.length) continue;
    // Reserve only rows that have a viable complete partition. Occupancy is
    // applied afterwards, so deliberate vacancies do not move other houses.
    unassigned = clipHalfPlane(unassigned, [-normal[0], -normal[1]], -offset);
    for (const lot of lots) {
      const occupied = rng() < options.occupancy;
      if (!occupied) continue;
      const center = polygonCentroid(lot);
      // Numerical clearance only; no geometric area is intentionally removed.
      buildings.push(lot.map(p => [p[0] + (center[0] - p[0]) * 1e-7, p[1] + (center[1] - p[1]) * 1e-7]));
    }
  }
  return buildings;
}

function cleanPolygon(poly: Point[]): Point[] {
  const distinct = poly.filter((p, i) => distance(p, poly[(i + 1) % poly.length]) > 1e-7);
  return distinct.filter((p, i) => {
    const a = distinct[(i + distinct.length - 1) % distinct.length],
      b = distinct[(i + 1) % distinct.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-7;
  });
}

function hasFrontage(poly: Point[], fronts: Front[]): boolean {
  let accessible = false;
  for (const front of fronts) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length];
      if (
        Math.abs(dot(p, front.inward) - front.offset) >= 1e-5 ||
        Math.abs(dot(q, front.inward) - front.offset) >= 1e-5
      )
        continue;
      const length = distance(p, q);
      if (front.primary && length > 1e-4 && length < 3.5) return false;
      if (length >= (front.primary ? 3.5 : 2.5)) accessible = true;
    }
  }
  return accessible;
}

function rowQuality(poly: Point[], axis: Point): number {
  if (poly.length < 4 || area(poly) < 12) return 0;
  const normal: Point = [-axis[1], axis[0]];
  const xs = poly.map(p => dot(p, axis)),
    ys = poly.map(p => dot(p, normal));
  const width = Math.max(...xs) - Math.min(...xs),
    depth = Math.max(...ys) - Math.min(...ys);
  if (Math.min(width, depth) < 2.5) return 0;
  // Only exterior bends can contribute extra vertices. Keeping those vertices
  // preserves land instead of replacing a five-sided corner with a diagonal.
  if (poly.length === 4) {
    const lengths = poly.map((p, i) => distance(p, poly[(i + 1) % 4]));
    if (lengths.some((n, i) => n < Math.min(lengths[(i + 2) % 4], Math.max(1, lengths[(i + 2) % 4] * 0.26)))) return 0;
  }
  return area(poly) / (width * depth);
}

function planRow(band: Point[], axis: Point, width: number, fronts: Front[], rng: Rng): Point[][] {
  const xs = band.map(p => dot(p, axis));
  const start = Math.min(...xs),
    end = Math.max(...xs);
  const count = Math.max(1, Math.min(256, Math.round((end - start) / width)));
  const weights = Array.from({ length: count }, () => rng.range(0.88, 1.12));
  const sum = weights.reduce((a, b) => a + b, 0);
  const cuts = [start];
  for (const w of weights) cuts.push(cuts[cuts.length - 1] + ((end - start) * w) / sum);
  cuts[cuts.length - 1] = end;
  const plot = (lo: number, hi: number) =>
    cleanPolygon(clipHalfPlane(clipHalfPlane(band, [-axis[0], -axis[1]], -lo), axis, hi));
  // Replan shared boundaries rather than clipping the individual buildings.
  // Absorbing a wedge into the next plot fills its entire area with one house.
  for (let i = 0; i < cuts.length - 1; ) {
    const lot = plot(cuts[i], cuts[i + 1]);
    if (rowQuality(lot, axis) >= 0.6 && hasFrontage(lot, fronts)) {
      i++;
      continue;
    }
    if (cuts.length === 2) return [];
    // First move a shared cut: a narrow corner and a normal neighbour can
    // often become two useful houses without reducing the house count.
    let adjustment: { boundary: number; position: number; score: number } | undefined;
    for (const boundary of [i, i + 1]) {
      if (boundary <= 0 || boundary >= cuts.length - 1) continue;
      const lo = cuts[boundary - 1],
        hi = cuts[boundary + 1];
      for (let step = 1; step < 24; step++) {
        const position = lo + ((hi - lo) * step) / 24;
        const a = plot(lo, position),
          b = plot(position, hi);
        const qa = rowQuality(a, axis),
          qb = rowQuality(b, axis);
        if (qa < 0.6 || qb < 0.6 || !hasFrontage(a, fronts) || !hasFrontage(b, fronts)) continue;
        const score = qa + qb - Math.abs(position - (lo + hi) / 2) / (hi - lo);
        if (!adjustment || score > adjustment.score) adjustment = { boundary, position, score };
      }
    }
    if (adjustment) {
      cuts[adjustment.boundary] = adjustment.position;
      i = Math.max(0, i - 1);
      continue;
    }
    const left = i > 0 ? rowQuality(plot(cuts[i - 1], cuts[i + 1]), axis) : -1;
    const right = i < cuts.length - 2 ? rowQuality(plot(cuts[i], cuts[i + 2]), axis) : -1;
    cuts.splice(left > right ? i : i + 1, 1);
    i = Math.max(0, i - 1);
  }
  return cuts.slice(1).map((hi, i) => plot(cuts[i], hi));
}
