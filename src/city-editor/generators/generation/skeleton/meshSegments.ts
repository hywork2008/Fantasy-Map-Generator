import type { Point } from "../../../types/geometry";
import type { SkeletonMeshLine } from "./contracts";

export interface MeshSegment {
  a: Point;
  b: Point;
}
export const meshSegments = (line: SkeletonMeshLine): MeshSegment[] =>
  line.points
    .slice(0, line.closed ? undefined : -1)
    .map((a, i) => ({ a, b: line.points[(i + 1) % line.points.length] }));

/** Clip segments to the frame; a river's offset banks can extend beyond it. */
export function clipMeshSegment({ a, b }: MeshSegment, half: number): MeshSegment | null {
  let lo = 0,
    hi = 1;
  for (const k of [0, 1] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(a[k]) > half) return null;
      continue;
    }
    const t0 = (-half - a[k]) / d,
      t1 = (half - a[k]) / d;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  if (hi - lo < 1e-12) return null;
  const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { a: at(lo), b: at(hi) };
}

export function segmentParameter(p: Point, { a, b }: MeshSegment): number {
  const x = b[0] - a[0],
    y = b[1] - a[1];
  return ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / (x * x + y * y);
}
export function segmentDistance(p: Point, s: MeshSegment): number {
  const t = Math.max(0, Math.min(1, segmentParameter(p, s)));
  return Math.hypot(p[0] - s.a[0] - (s.b[0] - s.a[0]) * t, p[1] - s.a[1] - (s.b[1] - s.a[1]) * t);
}

/** Uniform grid of segments, each stored in every cell its bounding box (grown by `margin`) overlaps.
 * `near(p)` returns a superset of the segments within `margin` of `p`. */
export class SegmentGrid {
  private readonly cells = new Map<string, MeshSegment[]>();
  constructor(
    segments: readonly MeshSegment[],
    private readonly size: number,
    margin: number
  ) {
    for (const s of segments) {
      const x1 = Math.floor((Math.min(s.a[0], s.b[0]) - margin) / size);
      const x2 = Math.floor((Math.max(s.a[0], s.b[0]) + margin) / size);
      const y1 = Math.floor((Math.min(s.a[1], s.b[1]) - margin) / size);
      const y2 = Math.floor((Math.max(s.a[1], s.b[1]) + margin) / size);
      for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
          const k = `${x},${y}`;
          const list = this.cells.get(k);
          if (list) list.push(s);
          else this.cells.set(k, [s]);
        }
    }
  }
  near(p: Point): readonly MeshSegment[] {
    return this.cells.get(`${Math.floor(p[0] / this.size)},${Math.floor(p[1] / this.size)}`) ?? [];
  }
}
