import { rn } from "../utils/numberUtils";
export type WeightedPoint = { x: number; y: number; w: number };

/** Liang-Barsky segment/box clip. Returns [t0, t1] of the visible sub-segment, or null. */
function clipSegmentToBox(x1: number, y1: number, x2: number, y2: number, half: number): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 + half, half - x1, y1 + half, half - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [t0, t1];
}

/** Clip a polyline (with per-vertex widths) to the centered box, splitting into visible runs. */
export function clipWeightedPolylineToBox(
  points: WeightedPoint[],
  half: number,
  preservePrecision = false
): { points: [number, number][]; widthsMeters: number[] }[] {
  const runs: { points: [number, number][]; widthsMeters: number[] }[] = [];
  let current: { points: [number, number][]; widthsMeters: number[] } | null = null;

  const pushPoint = (x: number, y: number, w: number) => {
    if (!current) current = { points: [], widthsMeters: [] };
    const last = current.points.at(-1);
    const tolerance = preservePrecision ? 1e-7 : 0.01;
    if (last && Math.abs(last[0] - x) < tolerance && Math.abs(last[1] - y) < tolerance) return;
    current.points.push(preservePrecision ? [x, y] : [rn(x, 1), rn(y, 1)]);
    current.widthsMeters.push(w);
  };

  const closeRun = () => {
    if (current && current.points.length >= 2) runs.push(current);
    current = null;
  };

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const clip = clipSegmentToBox(a.x, a.y, b.x, b.y, half);
    if (!clip) {
      closeRun();
      continue;
    }
    const [t0, t1] = clip;
    const lerp = (t: number): WeightedPoint => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      w: rn(a.w + (b.w - a.w) * t, 1)
    });
    const start = lerp(t0);
    const end = lerp(t1);
    if (t0 > 0) closeRun(); // segment enters the box afresh
    pushPoint(start.x, start.y, start.w);
    pushPoint(end.x, end.y, end.w);
    if (t1 < 1) closeRun(); // segment leaves the box
  }
  closeRun();
  return runs;
}

export function clipPolylineToBox(
  points: [number, number][],
  half: number,
  preservePrecision = false
): [number, number][][] {
  const weighted = points.map(([x, y]) => ({ x, y, w: 0 }));
  return clipWeightedPolylineToBox(weighted, half, preservePrecision).map(run => run.points);
}
