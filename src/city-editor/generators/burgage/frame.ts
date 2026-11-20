import type { Point } from "../../types/geometry";
import { clipPolygonHalfPlane, inwardNormal, isSimplePolygon, polygonArea } from "../geom";
import type { Rng } from "../prng";

/** Plots keep this far off a lane's surface, as compact lots do (`ORGANIC_LANE_FACADE_CLEARANCE`): rounded to the
 * centimetre, a plot touching the surface would overlap it. */
export const LANE_CLEARANCE_METERS = 0.05;

/** A block's frame on one of its edges: `s` along the edge, `t` inward from it. */
export interface PlotFrame {
  origin: Point;
  u: Point;
  v: Point;
}

export function edgeFrame(ring: Point[], edge: number): PlotFrame {
  const a = ring[edge],
    b = ring[(edge + 1) % ring.length],
    length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return {
    origin: a,
    u: [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
    v: inwardNormal(a, b, ring)
  };
}

export const toLocal = (f: PlotFrame, p: Point): Point => {
  const x = p[0] - f.origin[0],
    y = p[1] - f.origin[1];
  return [x * f.u[0] + y * f.u[1], x * f.v[0] + y * f.v[1]];
};

export const toWorld = (f: PlotFrame, s: number, t: number): Point => [
  f.origin[0] + f.u[0] * s + f.v[0] * t,
  f.origin[1] + f.u[1] * s + f.v[1] * t
];

export function extent(f: PlotFrame, ring: Point[]): { s0: number; s1: number; t0: number; t1: number } {
  const local = ring.map(p => toLocal(f, p));
  return {
    s0: Math.min(...local.map(p => p[0])),
    s1: Math.max(...local.map(p => p[0])),
    t0: Math.min(...local.map(p => p[1])),
    t1: Math.max(...local.map(p => p[1]))
  };
}

/** `ring` cut to `s0 <= s <= s1, t0 <= t <= t1` of the frame. The window is convex, so the clip is exact for any
 * simple ring whose cut stays in one piece; a ring that falls apart is caught by `usablePlot`. */
export function clipToBox(
  ring: Point[],
  f: PlotFrame,
  s0: number,
  s1: number,
  t0: number,
  t1: number,
  /** False keeps a probing sliver whole: tidying would drop its millimetre-apart points. */
  tidy = true
): Point[] {
  let out = ring;
  if (Number.isFinite(s0)) out = clipPolygonHalfPlane(out, toWorld(f, s0, 0), f.u);
  if (Number.isFinite(s1)) out = clipPolygonHalfPlane(out, toWorld(f, s1, 0), [-f.u[0], -f.u[1]]);
  if (Number.isFinite(t0)) out = clipPolygonHalfPlane(out, toWorld(f, 0, t0), f.v);
  if (Number.isFinite(t1)) out = clipPolygonHalfPlane(out, toWorld(f, 0, t1), [-f.v[0], -f.v[1]]);
  return tidy ? tidyRing(out) : out;
}

/** Points closer than this to the previous one go: rounded to the centimetre they would repeat. */
const TIDY_METERS = 0.02;

/** The ring without near-repeated points, points on a straight run and spikes, which polygon clipping downstream
 * can stumble on. A ring that falls below three points is empty. */
export function tidyRing(ring: Point[]): Point[] {
  let out = ring.filter((p, i) => {
    const q = ring[(i + ring.length - 1) % ring.length];
    return i === 0 || Math.hypot(p[0] - q[0], p[1] - q[1]) >= TIDY_METERS;
  });
  if (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)![0], out[0][1] - out.at(-1)![1]) < TIDY_METERS) out.pop();
  out = out.filter((p, i) => {
    const a = out[(i + out.length - 1) % out.length],
      b = out[(i + 1) % out.length],
      u: Point = [p[0] - a[0], p[1] - a[1]],
      v: Point = [b[0] - p[0], b[1] - p[1]];
    // A straight run or a spike back on itself alike.
    return Math.abs(u[0] * v[1] - u[1] * v[0]) > 1e-6 * Math.hypot(...u) * Math.hypot(...v);
  });
  return out.length >= 3 ? out : [];
}

/** The ring's edge on the line `t = at` of the frame (`axis` 1), or `s = at` (`axis` 0): its two extreme points. */
export function edgeOnLine(f: PlotFrame, ring: Point[], axis: 0 | 1, at: number): [Point, Point] | undefined {
  const on = ring.filter(p => Math.abs(toLocal(f, p)[axis] - at) < 1e-6);
  if (on.length < 2) return undefined;
  const other = axis === 1 ? 0 : 1;
  on.sort((p, q) => toLocal(f, p)[other] - toLocal(f, q)[other]);
  const a = on[0],
    b = on.at(-1)!;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6 ? [a, b] : undefined;
}

export function usablePlot(ring: Point[], minimumArea: number): boolean {
  return ring.length >= 3 && Math.abs(polygonArea(ring)) >= minimumArea && isSimplePolygon(ring, minimumArea);
}

/** The line `s = at` of the frame through the ring, as a two-point centre line. */
export function lineAcross(ring: Point[], f: PlotFrame, at: number): Point[] | undefined {
  const sliver = clipToBox(ring, f, at - 1e-3, at + 1e-3, -Infinity, Infinity, false);
  if (sliver.length < 3) return undefined;
  const ts = sliver.map(p => toLocal(f, p)[1]);
  return [toWorld(f, at, Math.min(...ts)), toWorld(f, at, Math.max(...ts))];
}

/** A run of widths drawn from `draw` that fills `length` exactly: the widths are drawn until they pass the
 * length, then the last width is either kept and all are shrunk, or dropped and all are widened, whichever
 * stretches them less. Undefined when `length` is shorter than `shortest`. */
export function fillLength<T extends { width: number }>(
  length: number,
  draw: () => T,
  shortest: number
): T[] | undefined {
  if (length < shortest) return undefined;
  const items: T[] = [];
  let sum = 0;
  while (sum < length) {
    const item = draw();
    items.push(item);
    sum += item.width;
  }
  const last = items.at(-1)!.width,
    shrink = length / sum,
    widen = items.length > 1 ? length / (sum - last) : Infinity;
  if (Math.abs(Math.log(widen)) < Math.abs(Math.log(shrink))) {
    items.pop();
    for (const item of items) item.width *= widen;
  } else for (const item of items) item.width *= shrink;
  return items;
}

export const drawIn = (rng: Rng, [min, max]: readonly [number, number]) => rng.range(min, max);
