import type { BurgageCellPlan, BurgagePlot, BurgageProfileId, BurgageSetting } from "../../types/contracts/burgage";
import type { Point } from "../../types/geometry";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "../geom";
import { insetConvexKernel } from "../lotGeometry";
import { makeRng } from "../prng";
import type { BlockBoundary } from "../streetBlockGeometry";
import { regionBoolean } from "../vector/geometry/regions";
import { planBinaireCell } from "./binaireCell";
import { clipToBox } from "./frame";
import { BURGAGE_PROFILES } from "./profiles";
import { planBurgageCell } from "./stripCell";

/** What a CE street plan needs to lay burgage plots (docs/plan/ce-burgage-plot-fabric.md §5): plain data, so it
 * crosses to a worker unchanged. */
export interface BurgagePlanContext {
  profile: BurgageProfileId;
  /** Town wall rings: a street block inside one is intramural. */
  wallRings: Point[][];
  /** Upland towns keep the shallower intramural depths everywhere (plan §5.1, a game adjustment). */
  shallow?: boolean;
}

/** Street-block size of the CE street plan for this plot type: two plot depths, or a binaire block's length. */
export function burgageStreetCellMeters(burgage: BurgagePlanContext, setting: BurgageSetting): number {
  const profile = BURGAGE_PROFILES[burgage.profile];
  if (profile.kind === "binaire") return (profile.blockLengthMeters[0] + profile.blockLengthMeters[1]) / 2;
  const [min, max] = profile.depthMeters[burgage.shallow ? "intramural" : setting];
  return min + max;
}

export function burgageSetting(burgage: BurgagePlanContext, point: Point): BurgageSetting {
  return burgage.shallow || burgage.wallRings.some(ring => pointInPolygon(point, ring)) ? "intramural" : "extramural";
}

/** House depth on a strip plot, behind its front (plan §5.4). */
const HOUSE_DEPTH: readonly [number, number] = [8, 12];
/** Lanes are carried out to the street block's edge, the street's centre line, at most this far. */
const LANE_REACH_METERS = 12;

export interface BurgagePerimeterCell {
  lanes: { points: Point[]; widthMeters: number }[];
  plots: { ring: Point[]; front: [Point, Point]; kind: BurgagePlot["kind"] }[];
  open: Point[][];
  /** Binaire venelles between the house backs (plan §5.7). */
  drains: { points: Point[]; widthMeters: number }[];
  /** House footprints: the front of each strip plot, or the whole binaire house plot. */
  houses: Point[][];
  /** Rear houses of deep strip plots, behind a yard (plan §5.4, B5). */
  rearHouses: Point[][];
}

/**
 * One CE street block laid out as burgage plots. The block's ring runs on the street centre lines and the district
 * outline; it is inset by each edge's setback as the compact fill does, the edges on a street become the plots'
 * fronts, and the plots' lanes are carried out to the streets they open on.
 */
export function burgagePerimeterCell(
  burgage: BurgagePlanContext,
  cell: { id: string; ring: Point[]; boundaries: BlockBoundary[] },
  seed: string,
  laneWidthMeters: number,
  /** District streets near the block: an edge on one keeps off its surface. */
  streets: readonly { points: Point[]; widthMeters: number }[] = []
): BurgagePerimeterCell {
  const result: BurgagePerimeterCell = { lanes: [], plots: [], open: [], houses: [], rearHouses: [], drains: [] };
  const ring = cell.ring;
  const sides: Side[] = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length],
      mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      matches = cell.boundaries.filter(e => nearestOnPolyline(mid, [e.a, e.b]).dist < 1e-3 && parallel(a, b, e.a, e.b)),
      street = streets.filter(s => nearestOnPolyline(mid, s.points).dist < 1e-3);
    // As the compact fill: at least a lane's setback; any edge but a wall or a bank opens on a street or lane.
    return {
      setback: Math.max(
        laneWidthMeters / 2 + 0.05,
        ...matches.map(e => e.setback),
        ...street.map(s => s.widthMeters / 2 + 0.05)
      ),
      front: !matches.some(e => e.barrier)
    };
  });
  const profile = BURGAGE_PROFILES[burgage.profile];
  const cellSeed = `${seed}:${cell.id}`;
  const setting = burgageSetting(burgage, polygonCentroid(ring));
  const plans = convexPieces(ring, sides).flatMap((piece, k) => {
    const block = insetConvexKernel(
      piece.ring,
      piece.sides.map(s => s.setback)
    );
    if (block.length < 3 || Math.abs(polygonArea(block)) < 1) return [];
    // An inset edge lies on the offset line of the piece edge it came from.
    const fronts = block.flatMap((a, j) => {
      const b = block[(j + 1) % block.length],
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const i = piece.ring.findIndex((p, n) => {
        const q = piece.ring[(n + 1) % piece.ring.length];
        return parallel(a, b, p, q) && Math.abs(lineDistance(mid, p, q) - piece.sides[n].setback) < 1e-4;
      });
      return i >= 0 && piece.sides[i].front ? [j] : [];
    });
    if (!fronts.length) return [{ profile: burgage.profile, plots: [], lanes: [], open: [block] } as BurgageCellPlan];
    const pieceSeed = `${cellSeed}:${k}`;
    return [
      profile.kind === "binaire"
        ? planBinaireCell(block, profile, { seed: pieceSeed, fronts })
        : planBurgageCell(block, profile, { seed: pieceSeed, fronts, setting })
    ];
  });
  // The binaire venelle is a drain between house backs, not a lane a door opens on (plan §5.7).
  for (const lane of plans.flatMap(p => p.lanes))
    if (lane.kind === "venelle") result.drains.push({ points: lane.points, widthMeters: lane.widthMeters });
    else result.lanes.push({ points: reachRing(lane.points, ring), widthMeters: lane.widthMeters });
  const rng = makeRng(`${cellSeed}:burgage-houses-v1`);
  for (const plot of plans.flatMap(p => p.plots)) {
    result.plots.push({ ring: plot.ring, front: plot.front, kind: plot.kind });
    if (plot.kind !== "plot") {
      result.houses.push(plot.ring);
      continue;
    }
    const depth = rng.range(...HOUSE_DEPTH),
      house = frontHouse(plot.ring, plot.front, depth);
    if (!house) continue;
    result.houses.push(house);
    // The burgage cycle (plan R6, B5): a deep plot can take a rear house across its back yard. The town adopts it only
    // when its front houses fall short, nearest the centre first.
    const rear = rearHouse(plot.ring, plot.front, depth, rng);
    if (rear) result.rearHouses.push(rear);
  }
  result.open.push(...plans.flatMap(p => p.open));
  return result;
}

/** Reflex corners sharper than this (15°) are cut into convex pieces. */
const REFLEX_SIN = Math.sin((15 * Math.PI) / 180);

interface Side {
  setback: number;
  front: boolean;
}

/** A concave street block cut at its reflex corners into convex pieces, each laid out on its own. A cut edge is no
 * street: plots back onto it, with no setback. */
function convexPieces(ring: Point[], sides: Side[], depth = 0): { ring: Point[]; sides: Side[] }[] {
  // With `polygonArea`'s sign convention, a reflex corner turns with the sign of the area.
  const sign = Math.sign(polygonArea(ring));
  const reflex = ring.findIndex((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length],
      b = ring[(i + 1) % ring.length],
      cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
    // Slight bends of a sampled curve are left to the inset; only a real corner is cut.
    return cross * sign > REFLEX_SIN * Math.hypot(p[0] - a[0], p[1] - a[1]) * Math.hypot(b[0] - p[0], b[1] - p[1]);
  });
  if (reflex < 0 || depth >= 8) return [{ ring, sides }];
  const p = ring[reflex];
  // Cut along either edge at the reflex corner, carried on through the block.
  for (const other of [ring[(reflex + ring.length - 1) % ring.length], ring[(reflex + 1) % ring.length]]) {
    const length = Math.hypot(p[0] - other[0], p[1] - other[1]);
    if (length < 1e-9) continue;
    const u: Point = [(p[0] - other[0]) / length, (p[1] - other[1]) / length],
      reach = 1e4,
      half: Point[] = [
        [p[0] - u[0] * reach, p[1] - u[1] * reach],
        [p[0] + u[0] * reach, p[1] + u[1] * reach],
        [p[0] + u[0] * reach - u[1] * reach, p[1] + u[1] * reach + u[0] * reach],
        [p[0] - u[0] * reach - u[1] * reach, p[1] - u[1] * reach + u[0] * reach]
      ];
    let parts: Point[][];
    try {
      const block = [{ outer: ring, holes: [] }],
        cut = [{ outer: half, holes: [] }];
      parts = [...regionBoolean(block, cut, "intersection"), ...regionBoolean(block, cut, "difference")].flatMap(r =>
        r.holes.length ? [] : [r.outer]
      );
    } catch {
      continue;
    }
    parts = parts.filter(part => Math.abs(polygonArea(part)) >= 1);
    if (parts.length < 2 || !parts.every(part => isSimplePolygon(part, 1))) continue;
    return parts.flatMap(part => convexPieces(part, sidesOf(part, ring, sides), depth + 1));
  }
  return [{ ring, sides }];
}

/** Each edge of a piece keeps the sides of the ring edges it runs along: the largest setback, and a front when any
 * is one. A cut edge, or the part of an edge a cut carried on, has none. */
function sidesOf(piece: Point[], ring: Point[], sides: Side[]): Side[] {
  return piece.map((a, j) => {
    const b = piece[(j + 1) % piece.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = ring.flatMap((p, n) => {
      const q = ring[(n + 1) % ring.length];
      if (length < 1e-9 || !parallel(a, b, p, q) || lineDistance(p, a, b) > 1e-3) return [];
      const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
        s0 = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1],
        s1 = (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1];
      return Math.min(length, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1)) > 1e-3 ? [sides[n]] : [];
    });
    return along.length
      ? { setback: Math.max(...along.map(s => s.setback)), front: along.some(s => s.front) }
      : { setback: 0, front: false };
  });
}

/** The plot's front band, `depth` deep and never more than half the plot. */
function frontHouse(ring: Point[], front: [Point, Point], depth: number) {
  const [a, b] = front,
    length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const c = polygonCentroid(ring);
  let v: Point = [-u[1], u[0]];
  if ((c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] < 0) v = [-v[0], -v[1]];
  const frame = { origin: a, u, v };
  const plotDepth = Math.max(...ring.map(p => (p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]));
  const house = clipToBox(ring, frame, -Infinity, Infinity, 0, Math.min(depth, plotDepth / 2));
  return house.length >= 3 && Math.abs(polygonArea(house)) >= 12 ? house : undefined;
}

/** Yard between a front house and its rear house, and the rear house's depth (plan §5.4; Freiburg's Vorderhaus and
 * Hinterhaus, Löbbecke S. 13). A rear house leaves the plot's back strip and, on a wide plot, a passage along one side
 * from the yard to the back. */
const REAR_YARD_METERS: readonly [number, number] = [5, 8];
const REAR_DEPTH_METERS: readonly [number, number] = [6, 9];
const REAR_BACK_METERS = 2;
const REAR_PASSAGE_METERS = 1.2;
/** Plots narrower than this keep the rear house across their full width. */
const REAR_PASSAGE_MIN_FRONTAGE = 5;

function rearHouse(ring: Point[], front: [Point, Point], frontDepth: number, rng: () => number): Point[] | undefined {
  const [a, b] = front,
    length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const c = polygonCentroid(ring);
  let v: Point = [-u[1], u[0]];
  if ((c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] < 0) v = [-v[0], -v[1]];
  const frame = { origin: a, u, v };
  const plotDepth = Math.max(...ring.map(p => (p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]));
  const from = frontDepth + REAR_YARD_METERS[0] + (REAR_YARD_METERS[1] - REAR_YARD_METERS[0]) * rng(),
    to = Math.min(
      from + REAR_DEPTH_METERS[0] + (REAR_DEPTH_METERS[1] - REAR_DEPTH_METERS[0]) * rng(),
      plotDepth - REAR_BACK_METERS
    );
  if (to - from < REAR_DEPTH_METERS[0]) return;
  const passage = length >= REAR_PASSAGE_MIN_FRONTAGE ? REAR_PASSAGE_METERS : 0,
    left = rng() < 0.5;
  const house = clipToBox(ring, frame, left ? passage : -Infinity, left ? Infinity : length - passage, from, to);
  return house.length >= 3 && Math.abs(polygonArea(house)) >= 12 ? house : undefined;
}

/** A lane carried out from the inset block to the street block's ring along its own direction. */
function reachRing(points: Point[], ring: Point[]): Point[] {
  const out = points.map(p => [p[0], p[1]] as Point);
  for (const end of [0, 1] as const) {
    const p = end === 0 ? out[0] : out.at(-1)!,
      q = end === 0 ? out[1] : out.at(-2)!,
      length = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (length < 1e-9) continue;
    const d: Point = [(p[0] - q[0]) / length, (p[1] - q[1]) / length];
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const t = rayHit(p, d, ring[i], ring[(i + 1) % ring.length]);
      if (t !== undefined && t < best) best = t;
    }
    if (best <= LANE_REACH_METERS) {
      const hit: Point = [p[0] + d[0] * best, p[1] + d[1] * best];
      if (end === 0) out[0] = hit;
      else out[out.length - 1] = hit;
    }
  }
  return out;
}

function rayHit(p: Point, d: Point, a: Point, b: Point): number | undefined {
  const e: Point = [b[0] - a[0], b[1] - a[1]],
    denominator = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(denominator) < 1e-12) return;
  const w: Point = [a[0] - p[0], a[1] - p[1]],
    t = (w[0] * e[1] - w[1] * e[0]) / denominator,
    s = (w[0] * d[1] - w[1] * d[0]) / denominator;
  return t >= 0 && s >= -1e-9 && s <= 1 + 1e-9 ? t : undefined;
}

function parallel(a: Point, b: Point, p: Point, q: Point): boolean {
  const u: Point = [b[0] - a[0], b[1] - a[1]],
    v: Point = [q[0] - p[0], q[1] - p[1]],
    lu = Math.hypot(...u),
    lv = Math.hypot(...v);
  return lu > 1e-9 && lv > 1e-9 && Math.abs(u[0] * v[1] - u[1] * v[0]) / (lu * lv) < 1e-3;
}

function lineDistance(m: Point, p: Point, q: Point): number {
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return Math.abs((m[0] - p[0]) * (q[1] - p[1]) - (m[1] - p[1]) * (q[0] - p[0])) / l;
}
