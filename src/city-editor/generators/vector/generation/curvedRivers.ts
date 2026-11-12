import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { RiverShape, SiteConfig } from "../../../types/contracts/siteConfig";
import type { Point } from "../../../types/primitives";
import { azimuthToVec } from "../../geom";
import { makeRng, type Rng } from "../../prng";

/**
 * Smooth meandering courses for a synthesized meshless site. The synthesized descriptor's corridor is a coarse
 * sine-sum polyline kept to one bank of the town (the mesh walk snaps it to cell edges); a meshless town has no
 * cells, so a `meander` river is laid as a Kinoshita curve instead: the channel's heading swings as
 * θ(s) = θ0·sin(ks) + θ0³·(Js·cos(3ks) − Jf·sin(3ks)) along its own length, which gives the broad, skewed lowland
 * loops of a real meandering river. The course runs through the town (both banks built up) but clear of its centre,
 * and is drawn as a smooth curve through the course points (`smoothCourse`).
 */

/** Effective river shapes in descriptor order, as `synthSite` resolves them. */
function effectiveShapes(config: SiteConfig): RiverShape[] {
  return config.rivers.map(s => (s === "toCoast" && config.coast === "none" ? "through" : s));
}

/** Rewrites the course of every synthesized `meander` river in place. */
export function curveSynthesizedRivers(descriptor: BurgSiteDescriptor, config: SiteConfig, seed: string): void {
  const shapes = effectiveShapes(config),
    // Two rivers share the site: the second keeps a wide berth from the first.
    laid: Point[][] = [];
  descriptor.rivers.forEach((river, i) => {
    if (shapes[i] !== "meander") {
      laid.push(river.segments.flatMap(s => s.points));
      return;
    }
    const course = meanderCourse(
      makeRng(`meshless-meander:${seed}:${river.riverId}`),
      river.downstream.bearingDeg,
      descriptor.frame.cityRadiusMeters,
      descriptor.frame.extentMeters / 2,
      laid
    );
    if (!course) {
      laid.push(river.segments.flatMap(s => s.points));
      return;
    }
    const w0 = course.width * 0.8,
      w1 = course.width * 1.2;
    river.segments = [
      {
        points: course.points,
        widthsMeters: course.points.map((_, k) => round(w0 + ((w1 - w0) * k) / Math.max(1, course.points.length - 1)))
      }
    ];
    river.widthMeters = round(course.width);
    river.leftBankSegments = [];
    river.rightBankSegments = [];
    river.crossesSite = true;
    river.throughBurgCell = true;
    laid.push(course.points);
  });
}

/** Points a course is sampled at per meander wavelength before `smoothCourse` rounds it. */
const SAMPLES_PER_WAVELENGTH = 16;

interface MeanderCourse {
  points: Point[];
  width: number;
}

function meanderCourse(
  rng: Rng,
  flowAzimuthDeg: number,
  R: number,
  half: number,
  others: Point[][]
): MeanderCourse | undefined {
  // A meandering lowland river: broad, about 6% of the town radius.
  const width = Math.min(32, Math.max(14, R * 0.06));
  const flow = azimuthToVec(flowAzimuthDeg),
    perp: Point = [-flow[1], flow[0]];
  for (let attempt = 0; attempt < 40; attempt++) {
    // Later attempts tame the loops so a cramped site still gets a meander.
    const tame = 1 - Math.min(0.35, attempt * 0.012),
      theta0 = rng.range(1.35, 1.8) * tame,
      skew = rng.range(-0.03, 0.03),
      flat = rng.range(0, 1 / 32),
      // Meander wavelength measured along the valley: a bend and a counter-bend across the town, however wide the
      // frame around it.
      valleyWavelength = rng.range(1.8, 2.6) * R,
      phase = rng.range(0, Math.PI * 2),
      lateral = rng.range(-0.3, 0.3) * R,
      // A gentle valley swing so the meander belt itself is not ruler-straight.
      drift = rng.range(-0.12, 0.12);
    const unit = kinoshita(theta0, skew, flat, phase, 1, SAMPLES_PER_WAVELENGTH * 8, 4);
    const advance = unit.at(-1)![0] - unit[0][0];
    if (!(advance > 0)) continue;
    // Arc length per wavelength so one wavelength advances `valleyWavelength` down the valley.
    const lambda = valleyWavelength / (advance / 8),
      count = Math.ceil((half * 2.9) / valleyWavelength) + 1,
      local = kinoshita(theta0, skew, flat, phase, lambda, SAMPLES_PER_WAVELENGTH * count, count);
    const mid = local[Math.floor(local.length / 2)],
      points = local.map(([u, v]): Point => {
        const along = u - mid[0],
          side = v - mid[1] + lateral + (drift * (along * along)) / Math.max(1, half);
        return [flow[0] * along + perp[0] * side, flow[1] * along + perp[1] * side];
      });
    const clipped = clipToWindow(points, half);
    if (!clipped) continue;
    // The town centre stays dry with room for its market; the course still runs through the town.
    const centreGap = polylineDistance([0, 0], clipped);
    if (centreGap < width / 2 + Math.max(30, R * 0.14) || centreGap > R * 0.55) continue;
    // Neighbouring loops stay a street block apart, and a second river keeps clear of the first.
    if (neckGap(clipped, lambda * 0.35) < width + 40) continue;
    if (others.some(o => o.length && clipped.some(p => polylineDistance(p, o) < width + 60))) continue;
    return { points: clipped, width };
  }
  return undefined;
}

/** Kinoshita curve sampled `samples` times over `waves` wavelengths of arc length `lambda`, starting at the origin. */
function kinoshita(
  theta0: number,
  skew: number,
  flat: number,
  phase: number,
  lambda: number,
  samples: number,
  waves: number
): Point[] {
  const ds = (lambda * waves) / samples,
    k = (2 * Math.PI) / lambda,
    cube = theta0 ** 3,
    heading = (s: number) =>
      theta0 * Math.sin(k * s + phase) +
      cube * (skew * Math.cos(3 * (k * s + phase)) - flat * Math.sin(3 * (k * s + phase)));
  const points: Point[] = [[0, 0]];
  // Midpoint rule on a fine sub-step keeps the integrated course faithful at the coarse output spacing.
  const sub = 8;
  let x = 0,
    y = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < sub; j++) {
      const s = (i + (j + 0.5) / sub) * ds,
        a = heading(s);
      x += (Math.cos(a) * ds) / sub;
      y += (Math.sin(a) * ds) / sub;
    }
    points.push([x, y]);
  }
  return points;
}

/** The run of the course through the window that passes nearest the centre, one point past each edge. */
function clipToWindow(points: Point[], half: number): Point[] | undefined {
  const inside = (p: Point) => Math.abs(p[0]) < half && Math.abs(p[1]) < half;
  let nearest = 0;
  for (let i = 1; i < points.length; i++) if (Math.hypot(...points[i]) < Math.hypot(...points[nearest])) nearest = i;
  if (!inside(points[nearest])) return undefined;
  let first = nearest,
    last = nearest;
  while (first > 0 && inside(points[first])) first--;
  while (last < points.length - 1 && inside(points[last])) last++;
  // Both ends must leave the window: a course that ends inside it would be a river that stops in a field.
  if (inside(points[first]) || inside(points[last])) return undefined;
  // The course ends exactly on the edge. An inside point crowding that end would leave a stub segment whose spline
  // handles kink the channel, so it gives way to the edge point.
  const spacing = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]),
    start = edgeCrossing(points[first + 1], points[first], half),
    end = edgeCrossing(points[last - 1], points[last], half),
    middle = points.slice(first + 1, last);
  while (middle.length > 2 && Math.hypot(middle[0][0] - start[0], middle[0][1] - start[1]) < spacing * 0.4)
    middle.shift();
  while (middle.length > 2 && Math.hypot(middle.at(-1)![0] - end[0], middle.at(-1)![1] - end[1]) < spacing * 0.4)
    middle.pop();
  return [start, ...middle, end];
}

/** Where the segment from inside point `a` to outside point `b` crosses the window edge. */
function edgeCrossing(a: Point, b: Point, half: number): Point {
  let t = 1;
  for (const axis of [0, 1])
    if (b[axis] !== a[axis]) {
      const at = ((b[axis] > a[axis] ? half : -half) - a[axis]) / (b[axis] - a[axis]);
      if (at >= 0 && at < t) t = at;
    }
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function polylineDistance(p: Point, line: Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) best = Math.min(best, segmentDistance(p, line[i - 1], line[i]));
  return best;
}

/** Closest approach between two stretches of the course at least `apart` metres apart along it. */
function neckGap(points: Point[], apart: number): number {
  const along = [0];
  for (let i = 1; i < points.length; i++)
    along.push(along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length - 1; j++)
      if (along[j] - along[i] >= apart) best = Math.min(best, segmentDistance(points[i], points[j], points[j + 1]));
  return best;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const angleBetween = (a: Point, b: Point) => Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));

/** Largest change of heading between two vertices of a smoothed course. */
const SMOOTH_TURN_RADIANS = (5 * Math.PI) / 180;

/**
 * A course resampled along a (chord-length scaled) Catmull-Rom spline through its points, so it reads as a curve (as a surveyed river
 * drawn from many points does) yet stays a polyline: a cubic channel is sampled to a tenth of a degree for its
 * surface, thousands of vertices that every bank, bridge and lot test would pay for. Each span is halved until
 * its heading swings at most five degrees between vertices; widths are interpolated along the spans.
 */
export function smoothCourse(points: Point[], widths: number[]): { points: Point[]; widths: number[] } {
  if (points.length < 3) return { points, widths };
  const out: Point[] = [points[0]],
    outWidths = [widths[0]],
    length = (i: number) => Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]),
    // The tangent at vertex `i` for the span `span` that touches it, scaled to that span's length so unevenly spaced
    // points (an end cut at the window edge) do not overshoot; an end vertex follows its own span.
    tangent = (i: number, span: number): Point => {
      if (i === 0 || i === points.length - 1)
        return [points[span + 1][0] - points[span][0], points[span + 1][1] - points[span][1]];
      const scale = length(span) / (length(i - 1) + length(i));
      return [(points[i + 1][0] - points[i - 1][0]) * scale, (points[i + 1][1] - points[i - 1][1]) * scale];
    };
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i],
      p1 = points[i + 1],
      m0 = tangent(i, i),
      m1 = tangent(i + 1, i),
      at = (t: number): Point => {
        const t2 = t * t,
          t3 = t2 * t,
          h00 = 2 * t3 - 3 * t2 + 1,
          h10 = t3 - 2 * t2 + t,
          h01 = -2 * t3 + 3 * t2,
          h11 = t3 - t2;
        return [
          h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
          h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1]
        ];
      },
      slope = (t: number): Point => {
        const t2 = t * t;
        return [0, 1].map(
          j =>
            (6 * t2 - 6 * t) * p0[j] +
            (3 * t2 - 4 * t + 1) * m0[j] +
            (-6 * t2 + 6 * t) * p1[j] +
            (3 * t2 - 2 * t) * m1[j]
        ) as Point;
      },
      // A stretch is split until the heading swings less than the limit across it.
      split = (lo: number, hi: number, depth: number) => {
        const a = at(lo),
          b = at(hi),
          chord: Point = [b[0] - a[0], b[1] - a[1]];
        if (depth < 8 && angleBetween(slope(lo), chord) + angleBetween(chord, slope(hi)) > SMOOTH_TURN_RADIANS) {
          split(lo, (lo + hi) / 2, depth + 1);
          split((lo + hi) / 2, hi, depth + 1);
          return;
        }
        out.push(b);
        outWidths.push(widths[i] + (widths[i + 1] - widths[i]) * hi);
      };
    split(0, 1, 0);
  }
  return { points: out, widths: outWidths };
}

const round = (v: number) => Math.round(v * 10) / 10;
