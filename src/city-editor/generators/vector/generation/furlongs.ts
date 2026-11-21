import { Delaunay } from "d3";
import type { Point } from "../../../types/primitives";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { VectorFurlong, VectorFurlongCourse } from "../../../types/vector/landUse";
import { pointInPolygon, polygonArea } from "../../geom";
import { makeRng } from "../../prng";
import { containsRegion, convexIntersection, regionArea, regionBoolean, regionSurelyWithin } from "../geometry/regions";
import { simpleContour } from "../geometry/surfaces";

/**
 * Spacing of the furlong seeds. A selion was nominally a furlong (220 yd, about 200 m) long (Wikipedia "Selion";
 * Slater 1907 on Laxton: "a normal length of one furlong"), and a furlong held up to forty selions side by side
 * (Rackham, quoted in "Selion"): some tens of metres to some 280 m across. Hypothesis within those bounds.
 */
const FURLONG_SPACING = 180;
/**
 * Selion width in metres. Ridge and furrow runs "from about 5 yards (4.6 m) up to a chain wide (22 yards, about
 * 20 metres)" (Wikipedia "Ridge and furrow"); Laxton's lands are "a pretty uniform width of 5½ yards" (Slater 1907).
 * Drawn from 4.6–14.6 m, mostly near the narrow end.
 */
const SELION_MIN_METERS = 4.6;
const SELION_SPREAD_METERS = 10;
/** Half the headland left round every bundle, where the plough team turns; it doubles as the field track. */
const HEADLAND_HALF_METERS = 4;
/** A bundle smaller than this stays unstripped arable (a gore, a corner by the road). */
const MIN_FURLONG_M2 = 2500;
/** Strips narrower than this after clipping are slivers at the bundle's edge. */
const MIN_STRIP_M2 = 150;
/** Samples along each strip, enough for a smooth reversed S. */
const STRIP_SAMPLES = 12;

/**
 * A convex ring moved in by `d` on every side (the Voronoi cells are convex), as the ring clipped by each side's
 * half-plane moved inward; undefined when it closes up.
 */
function insetConvex(ring: Point[], d: number): Point[] | undefined {
  const n = ring.length,
    sign = ring.reduce((s, p, i) => s + p[0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * p[1], 0) > 0 ? 1 : -1;
  let out = ring;
  for (let i = 0; i < n && out.length >= 3; i++) {
    const a = ring[i],
      b = ring[(i + 1) % n],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    // Signed distance inside the side, less d.
    const side = (p: Point) => (sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))) / l - d,
      next: Point[] = [];
    out.forEach((p, k) => {
      const q = out[(k + 1) % out.length],
        sp = side(p),
        sq = side(q);
      if (sp >= 0) next.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    out = next;
  }
  if (out.length < 3) return undefined;
  const area = Math.abs(
    out.reduce((s, p, i) => s + p[0] * out[(i + 1) % out.length][1] - out[(i + 1) % out.length][0] * p[1], 0)
  );
  return area > 1 && simpleContour(out, true) ? out : undefined;
}

/** Direction of the road segment nearest `p`, or undefined with no road. */
function nearestRoadAngle(p: Point, roads: Point[][]): number | undefined {
  let best = Number.POSITIVE_INFINITY,
    angle: number | undefined;
  for (const line of roads)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)),
        d = Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
      if (d < best) {
        best = d;
        angle = Math.atan2(dy, dx);
      }
    }
  return angle;
}

/** Whether the ring turns one way only (collinear runs allowed). */
function isConvexRing(ring: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      c = ring[(i + 2) % ring.length],
      cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return sign !== 0;
}
const ok = (r: VectorPolygon) =>
  r.outer.length >= 3 && simpleContour(r.outer, true) && r.holes.every(h => simpleContour(h, true));

/**
 * The open fields of the arable (pre-acceptance U5c): the arable is cut into furlongs, bundles of a few to some tens
 * of parallel strips about a furlong long, each bundle turned its own way, square to or along the road nearest it.
 * Every bundle keeps a headland round it, where the plough team turns and the carts go; the strips bend in a gentle
 * reversed S. Corners and gores too small for a bundle stay plain arable.
 */
export function vectorFurlongs(
  arable: VectorPolygon[],
  roads: Point[][],
  seed: string,
  centre: Point,
  /** 3: winter corn, spring corn, fallow; 2: corn and fallow (the dry south). */
  fields: 2 | 3 = 3
): VectorFurlong[] {
  if (!arable.length) return [];
  const rng = makeRng(`${seed}:furlongs`),
    // The great fields as sectors round the town, each in one course of the rotation this year.
    turn = rng() * Math.PI * 2,
    courses: VectorFurlongCourse[] = fields === 3 ? ["winter", "spring", "fallow"] : ["winter", "fallow"],
    fieldOf = (p: Point) => {
      const a = (Math.atan2(p[1] - centre[1], p[0] - centre[0]) - turn + Math.PI * 4) % (Math.PI * 2);
      return Math.min(fields - 1, Math.floor((a / (Math.PI * 2)) * fields));
    };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const r of arable)
    for (const [x, y] of r.outer) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  const seeds: Point[] = [];
  for (let y = y0 + FURLONG_SPACING / 2; y < y1; y += FURLONG_SPACING * 0.87)
    for (let x = x0 + FURLONG_SPACING / 2; x < x1; x += FURLONG_SPACING) {
      const p: Point = [x + rng.range(-0.35, 0.35) * FURLONG_SPACING, y + rng.range(-0.35, 0.35) * FURLONG_SPACING];
      if (containsRegion(arable, p)) seeds.push(p);
    }
  if (seeds.length < 2) return [];
  const voronoi = Delaunay.from(seeds).voronoi([x0 - 1, y0 - 1, x1 + 1, y1 + 1]),
    furlongs: VectorFurlong[] = [];
  seeds.forEach((s, i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell) return;
    const ring = insetConvex(
      cell.slice(0, -1).map(([x, y]) => [x, y] as Point),
      HEADLAND_HALF_METERS
    );
    if (!ring) return;
    // Most bundles lie wholly in the arable: their outline is the (convex) ring itself.
    const whole = regionSurelyWithin({ outer: ring, holes: [] }, arable),
      outline = (
        whole
          ? [{ outer: polygonArea(ring) > 0 ? [...ring].reverse() : ring, holes: [] }]
          : regionBoolean([{ outer: ring, holes: [] }], arable, "intersection")
      ).filter(r => ok(r) && regionArea(r) >= MIN_FURLONG_M2);
    if (!outline.length) return;
    // A convex outline (the ring itself, or the ring cut by one straight edge of the arable) clips strips directly.
    const convexClip = whole
      ? ring
      : outline.length === 1 && !outline[0].holes.length && isConvexRing(outline[0].outer)
        ? outline[0].outer
        : undefined;
    const road = nearestRoadAngle(s, roads),
      angle = (road ?? rng() * Math.PI) + (rng() < 0.5 ? 0 : Math.PI / 2),
      ux = Math.cos(angle),
      uy = Math.sin(angle);
    // The bundle in its own frame: u along the strips, v across them.
    let u0 = Infinity,
      u1 = -Infinity,
      v0 = Infinity,
      v1 = -Infinity;
    for (const [x, y] of ring) {
      const u = (x - s[0]) * ux + (y - s[1]) * uy,
        v = -(x - s[0]) * uy + (y - s[1]) * ux;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const width = SELION_MIN_METERS + SELION_SPREAD_METERS * rng() ** 2,
      bend = Math.min(7, (u1 - u0) * 0.035) * (rng() < 0.5 ? -1 : 1),
      // A reversed S: the plough swings out at the start of the strip and back at its end.
      shift = (u: number) => bend * Math.sin(Math.PI * ((u - u0) / (u1 - u0) - 0.5)),
      at = (u: number, v: number): Point => [s[0] + u * ux - v * uy, s[1] + u * uy + v * ux],
      strips: VectorPolygon[] = [];
    const pad = Math.abs(bend) + 1;
    for (let v = v0 - pad; v < v1 + pad; v += width) {
      const us = Array.from({ length: STRIP_SAMPLES + 1 }, (_, k) => u0 + ((u1 - u0) * k) / STRIP_SAMPLES),
        strip: Point[] = [...us.map(u => at(u, v + shift(u))), ...us.reverse().map(u => at(u, v + width + shift(u)))];
      // Skip strips wholly off the bundle before clipping.
      if (!strip.some(p => pointInPolygon(p, ring)) && !ring.some(p => pointInPolygon(p, strip))) continue;
      // Within a convex outline a strip is clipped edge by edge; elsewhere, or in pieces, by the kernel.
      const pieces =
        (convexClip ? convexIntersection(strip, convexClip) : undefined) ??
        regionBoolean([{ outer: strip, holes: [] }], outline, "intersection");
      strips.push(...pieces.filter(r => ok(r) && regionArea(r) >= MIN_STRIP_M2));
    }
    if (strips.length >= 2) {
      const field = fieldOf(s);
      furlongs.push({
        id: `furlong-${furlongs.length}`,
        angle,
        field,
        course: courses[field],
        outline,
        strips
      });
    }
  });
  return furlongs;
}
