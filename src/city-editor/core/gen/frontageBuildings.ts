import type { Point } from "../types";
import { polygonArea } from "./geom";
import { clipHalfPlane } from "./lotGeometry";
import type { Rng } from "./prng";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const area = (p: Point[]) => Math.abs(polygonArea(p));

export interface FrontageOptions {
  lotArea: number;
  coverage: number;
  occupancy: number;
  outskirts: boolean;
}

/** Pack a convex block from its accessible edges. Lot cuts never become roads.
 * Nearest-frontage half-planes allocate corners before placing buildings, so
 * opposing rows cannot overlap. The rear of each row opens onto shared yards. */
export function frontageBuildings(
  block: Point[],
  accessibleEdges: number[],
  options: FrontageOptions,
  rng: Rng
): Point[][] {
  const sign = -Math.sign(polygonArea(block));
  const fronts = accessibleEdges
    .map(i => {
      const a = block[i],
        b = block[(i + 1) % block.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      const inward: Point = [-sign * axis[1], sign * axis[0]];
      return { a, axis, inward, length, offset: dot(a, inward) };
    })
    .filter(f => f.length >= 5);
  const buildings: Point[][] = [];
  const rowDepth = Math.sqrt(options.lotArea) * (options.outskirts ? 1.15 : 1.65);
  for (const front of fronts) {
    let sector = block;
    for (const other of fronts) {
      if (other === front) continue;
      // distance to this supporting line <= distance to the other line.
      sector = clipHalfPlane(
        sector,
        [front.inward[0] - other.inward[0], front.inward[1] - other.inward[1]],
        front.offset - other.offset
      );
    }
    const local = sector.map(p => {
      const delta: Point = [p[0] - front.a[0], p[1] - front.a[1]];
      return [dot(delta, front.axis), dot(delta, front.inward)] as Point;
    });
    const band = clipHalfPlane(local, [0, 1], rowDepth);
    if (band.length < 3 || area(band) < 35) continue;
    const depth = Math.max(...band.map(p => p[1]));
    // Shared fronts have no per-house offset. A small uniform setback keeps
    // outline strokes clear of the road; density changes only the rear.
    const frontY = 0.15;
    const width = Math.max(5, options.lotArea / Math.max(6, depth));
    const count = Math.max(1, Math.min(256, Math.round(front.length / width)));
    const weights = Array.from({ length: count }, () => rng.range(0.8, 1.2));
    const total = weights.reduce((a, b) => a + b, 0);
    let start = 0;
    for (let i = 0; i < count; i++) {
      const end = start + (front.length * weights[i]) / total;
      const lo = start + 0.08,
        hi = end - 0.08;
      start = end;
      // Keep the random stream stable across coverage/occupancy edits.
      const occupied = rng() < options.occupancy;
      const shape = rng();
      if (!occupied || hi - lo < 3) continue;
      let lot = clipHalfPlane(band, [-1, 0], -lo);
      lot = clipHalfPlane(lot, [1, 0], hi);
      lot = clipHalfPlane(lot, [0, -1], -frontY);
      if (lot.length < 3 || area(lot) < 35) continue;
      // Open rear notches give L/U plans without holes or a convex inset of
      // a concave building. Neighbouring rows share the unbuilt courtyard.
      const rear = Math.max(...lot.map(p => p[1]));
      const span = hi - lo;
      const wing = Math.max(3, span * 0.24);
      const kind =
        span >= 12 && rear > 10 && shape < 0.18
          ? "u"
          : span >= 8 && rear > 9 && shape < 0.48
            ? i % 2
              ? "left"
              : "right"
            : "rect";
      const outline = (back: number): Point[] => {
        let template: Point[];
        if (kind === "rect")
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, back],
            [lo, back]
          ];
        else if (kind === "u")
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, rear],
            [hi - wing, rear],
            [hi - wing, back],
            [lo + wing, back],
            [lo + wing, rear],
            [lo, rear]
          ];
        else if (kind === "left")
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, back],
            [lo + wing, back],
            [lo + wing, rear],
            [lo, rear]
          ];
        else
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, rear],
            [hi - wing, rear],
            [hi - wing, back],
            [lo, back]
          ];
        // Clip the template to its convex ownership region, preserving the
        // street front and any angled corner rather than centering a rectangle.
        const winding = -Math.sign(polygonArea(lot));
        for (let j = 0; j < lot.length; j++) {
          const a = lot[j],
            b = lot[(j + 1) % lot.length];
          const normal: Point = [winding * (b[1] - a[1]), winding * (a[0] - b[0])];
          template = clipHalfPlane(template, normal, dot(a, normal));
        }
        return template;
      };
      const budget = area(lot) * options.coverage;
      let low = frontY,
        high = rear;
      // Wings alone can exceed very low coverage: fall back to a front strip.
      const useStrip = area(outline(frontY + 3)) > budget;
      const footprint = (back: number) => (useStrip ? clipHalfPlane(lot, [0, 1], back) : outline(back));
      for (let j = 0; j < 18; j++) {
        const back = (low + high) / 2;
        if (area(footprint(back)) <= budget) low = back;
        else high = back;
      }
      const shapePoints = footprint(low);
      if (shapePoints.length < 3 || area(shapePoints) < 30 || low - frontY < 3) continue;
      // Discard corner slivers which have lost their actual street frontage.
      const frontXs = shapePoints.filter(p => Math.abs(p[1] - frontY) < 1e-5).map(p => p[0]);
      if (frontXs.length < 2 || Math.max(...frontXs) - Math.min(...frontXs) < 3) continue;
      const distinct = shapePoints.filter((p, j) => {
        const next = shapePoints[(j + 1) % shapePoints.length];
        return Math.hypot(p[0] - next[0], p[1] - next[1]) > 1e-6;
      });
      const clean = distinct.filter((p, j) => {
        const prev = distinct[(j + distinct.length - 1) % distinct.length];
        const next = distinct[(j + 1) % distinct.length];
        const a: Point = [p[0] - prev[0], p[1] - prev[1]];
        const b: Point = [next[0] - p[0], next[1] - p[1]];
        return Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-7 || dot(a, b) < 0;
      });
      if (clean.length < 3) continue;
      buildings.push(
        clean.map(([x, y]) => [
          front.a[0] + x * front.axis[0] + y * front.inward[0],
          front.a[1] + x * front.axis[1] + y * front.inward[1]
        ])
      );
    }
  }
  return buildings;
}
