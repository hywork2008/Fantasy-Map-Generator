import type {
  BurgagePlot,
  RoadsideArm,
  RoadsideBlock,
  RoadsideLane,
  RoadsideVillagePlan
} from "../../types/contracts/burgage";
import type { Point } from "../../types/geometry";
import { pointInPolygon, polygonArea, simplifyPolyline } from "../geom";
import { makeRng, type Rng } from "../prng";
import { drawIn, fillLength } from "./frame";
import { VILLAGE_PERCH_METERS, VILLAGE_TOFT_PROFILE, type VillageToftProfile } from "./profiles";

/**
 * A village laid along its roads (docs/plan/ce-meshless-roadside-burgage-village.md §5.3–§5.6): rectangular blocks
 * of tofts fronting each arm out of the centre, a cross lane before every block, a back lane behind each row, and a
 * second row of blocks on the back lanes. Every place a plot could go is laid out first, centre outward; the plots
 * the village needs are then taken nearest the centre first by road distance, weighted by kind (§5.6): a first
 * reach of the roads, the roads beyond it, splitting tofts near the centre, and the second row.
 */
export interface RoadsideVillageInput {
  seed: string;
  /** Roads out of the centre, from the centre outward. */
  arms: readonly RoadsideArm[];
  plotsNeeded: number;
  /** Ground no block may touch: water, reserved sites, the village centre. */
  obstacles?: readonly Point[][];
  profile?: VillageToftProfile;
}

type Side = "left" | "right";

/** `s` along a chord of an arm, `t` away from the road on one side of it. */
interface Frame {
  origin: Point;
  u: Point;
  v: Point;
}

interface Chord {
  frame: Record<Side, Frame>;
  length: number;
  /** Road distance from the centre at the chord's start. */
  along: number;
}

interface Potential {
  id: string;
  armId: string;
  side: Side;
  tier: 1 | 2;
  frame: Frame;
  along: number;
  s0: number;
  /** Front offset from the chord. */
  t0: number;
  depth: number;
  /** Tier 1: the back lane behind it and the cross lane before it. */
  backLane: number;
  crossLane: number;
  widths: number[];
  parent?: Potential;
}

interface Candidate {
  cost: number;
  order: number;
  gain: number;
  potential: Potential;
  plot: number;
  kind: "plot" | "split" | "split2";
}

const EPS = 1e-6;
/** Steps a blocked block takes: shallower first, then further out. */
const DEPTH_STEP_METERS = 2.5;
const ADVANCE_STEP_METERS = 4;

const at = (f: Frame, s: number, t: number): Point => [
  f.origin[0] + f.u[0] * s + f.v[0] * t,
  f.origin[1] + f.u[1] * s + f.v[1] * t
];

const quad = (f: Frame, s0: number, s1: number, t0: number, t1: number): Point[] => {
  const ring = [at(f, s0, t0), at(f, s1, t0), at(f, s1, t1), at(f, s0, t1)];
  return polygonArea(ring) < 0 ? ring.reverse() : ring;
};

function chordsOf(arm: RoadsideArm, profile: VillageToftProfile): Chord[] {
  const line = simplifyPolyline(arm.points as Point[], profile.easeToleranceMeters),
    chords: Chord[] = [];
  let along = 0;
  for (let i = 1; i < line.length && along < profile.armMeters.max; i++) {
    const a = line[i - 1],
      b = line[i],
      full = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (full < EPS) continue;
    const u: Point = [(b[0] - a[0]) / full, (b[1] - a[1]) / full];
    chords.push({
      frame: { left: { origin: a, u, v: [-u[1], u[0]] }, right: { origin: a, u, v: [u[1], -u[0]] } },
      length: Math.min(full, profile.armMeters.max - along),
      along
    });
    along += full;
  }
  return chords;
}

/** Strict crossing of two segments: touching ends do not count. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = side(c, d, a),
    d2 = side(c, d, b),
    d3 = side(a, b, c),
    d4 = side(a, b, d);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

function pointSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy,
    k = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
}

const edges = (ring: Point[]) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as const);

/** Distance from a segment to a convex ring: zero when it enters the ring. */
function segmentRingDistance(a: Point, b: Point, ring: Point[]): number {
  if (pointInPolygon(a, ring) || pointInPolygon(b, ring)) return 0;
  let best = Infinity;
  for (const [c, d] of edges(ring)) {
    if (crosses(a, b, c, d)) return 0;
    best = Math.min(best, pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
  }
  return best;
}

/** Overlap of two convex rings with area in common; shared edges and corners do not count. */
function convexOverlap(a: Point[], b: Point[]): boolean {
  for (const ring of [a, b])
    for (const [p, q] of edges(ring)) {
      const n: Point = [q[1] - p[1], p[0] - q[0]],
        project = (r: Point[]) => r.map(x => x[0] * n[0] + x[1] * n[1]),
        pa = project(a),
        pb = project(b),
        scale = Math.hypot(...n) * 1e-6;
      if (Math.max(...pa) <= Math.min(...pb) + scale || Math.max(...pb) <= Math.min(...pa) + scale) return false;
    }
  return true;
}

/** Overlap of a convex ring and any simple polygon. */
function polygonOverlap(convex: Point[], other: readonly Point[]): boolean {
  const ring = other as Point[];
  if (ring.some(p => pointInPolygon(p, convex)) || convex.some(p => pointInPolygon(p, ring))) return true;
  return edges(convex).some(([a, b]) => edges(ring).some(([c, d]) => crosses(a, b, c, d)));
}

export function planRoadsideBlocks(input: RoadsideVillageInput): RoadsideVillagePlan {
  const profile = input.profile ?? VILLAGE_TOFT_PROFILE,
    perches = profile.toftPerches.map(n => n * VILLAGE_PERCH_METERS),
    shortestToft = Math.min(...perches),
    arms = input.arms.filter(a => a.points.length >= 2),
    half = new Map(
      arms.map(a => [a.id, drawIn(makeRng(`${input.seed}:roadside:${a.id}:street`), profile.streetMeters) / 2])
    ),
    claims: Point[][] = [],
    obstacles = input.obstacles ?? [];

  const free = (ring: Point[]) =>
    !claims.some(c => convexOverlap(ring, c)) &&
    !obstacles.some(o => polygonOverlap(ring, o)) &&
    arms.every(arm => {
      const h = half.get(arm.id)! - EPS;
      return arm.points.slice(1).every((p, i) => segmentRingDistance(arm.points[i], p, ring) >= h);
    });

  // Tier 1, laid round robin over the arm sides by road distance, so the centre's corners go to the nearest blocks.
  interface Cursor {
    arm: RoadsideArm;
    side: Side;
    chords: Chord[];
    chord: number;
    s: number;
    depth?: number;
    chordDepth?: number;
    rng: Rng;
    /** One back lane width along the whole side, so the lanes behind its blocks join. */
    lane: number;
    blocks: number;
  }
  const cursors: Cursor[] = arms.flatMap(arm =>
    (["left", "right"] as const).map(side => {
      const rng = makeRng(`${input.seed}:roadside:${arm.id}:${side}`);
      return {
        arm,
        side,
        chords: chordsOf(arm, profile),
        chord: 0,
        s: 0,
        rng,
        lane: drawIn(rng, profile.backLaneMeters),
        blocks: 0
      };
    })
  );
  const tier1: Potential[] = [];
  const step = (c: Cursor): boolean => {
    const chord = c.chords[c.chord];
    if (!chord) return false;
    const f = chord.frame[c.side],
      [dMin, dMax] = profile.depthMeters.tier1;
    if (c.chordDepth === undefined) {
      const prev = c.depth;
      c.chordDepth = drawIn(
        c.rng,
        prev === undefined
          ? [dMin, dMax]
          : [Math.max(dMin, prev * (1 - profile.rowDepthStep)), Math.min(dMax, prev * (1 + profile.rowDepthStep))]
      );
    }
    const next = () => {
      c.chord++;
      c.s = 0;
      c.chordDepth = undefined;
      return true;
    };
    const cross = drawIn(c.rng, profile.crossLane.widthMeters),
      lane = c.lane,
      length = drawIn(c.rng, profile.crossLane.spacingMeters);
    for (let s0 = c.s + cross; s0 + shortestToft <= chord.length; s0 += ADVANCE_STEP_METERS) {
      let s1 = Math.min(chord.length, s0 + length);
      // A tail too short for a toft joins the block.
      if (chord.length - s1 < shortestToft + cross) s1 = chord.length;
      // The road strays up to the ease tolerance from its chord: the front keeps the road's half width off it.
      const stray = Math.max(
        0,
        ...c.arm.points
          .map(p => [
            (p[0] - f.origin[0]) * f.u[0] + (p[1] - f.origin[1]) * f.u[1],
            (p[0] - f.origin[0]) * f.v[0] + (p[1] - f.origin[1]) * f.v[1]
          ])
          .filter(([s]) => s >= s0 - cross - EPS && s <= s1 + EPS)
          .map(([, t]) => t)
      );
      const t0 = half.get(c.arm.id)! + stray;
      for (
        let depth = c.chordDepth;
        depth >= Math.max(dMin, c.chordDepth * (1 - profile.rowDepthStep)) - EPS;
        depth -= DEPTH_STEP_METERS
      ) {
        const claim = quad(f, s0 - cross, s1, t0, t0 + depth + lane);
        if (!free(claim)) continue;
        const widths = fillLength(
          s1 - s0,
          () => ({ width: perches[c.rng.int(0, perches.length)] }),
          shortestToft * 0.8
        );
        if (!widths) break;
        claims.push(claim);
        tier1.push({
          id: `${c.arm.id}:${c.side}:t1:${c.blocks++}`,
          armId: c.arm.id,
          side: c.side,
          tier: 1,
          frame: f,
          along: chord.along,
          s0,
          t0,
          depth,
          backLane: lane,
          crossLane: cross,
          widths: widths.map(w => w.width)
        });
        c.depth = depth;
        c.s = s1;
        return s1 >= chord.length - EPS ? next() : true;
      }
    }
    return next();
  };
  const open = new Set(cursors);
  while (open.size) {
    const c = [...open].reduce((best, x) => {
      const da = (x.chords[x.chord]?.along ?? Infinity) + x.s,
        db = (best.chords[best.chord]?.along ?? Infinity) + best.s;
      return da < db ? x : best;
    });
    if (!step(c)) open.delete(c);
  }

  // Tier 2 on the back lanes, behind each tier-1 block, shallower and less regular (§5.5).
  const tier2: Potential[] = [];
  for (const p of tier1) {
    const rng = makeRng(`${input.seed}:roadside:${p.id}:t2`),
      [dMin, dMax] = profile.depthMeters.tier2,
      front = p.t0 + p.depth + p.backLane,
      length = p.widths.reduce((n, w) => n + w, 0);
    for (let depth = drawIn(rng, [dMin, dMax]); depth >= dMin - EPS; depth -= DEPTH_STEP_METERS) {
      const claim = quad(p.frame, p.s0, p.s0 + length, front, front + depth);
      if (!free(claim)) continue;
      const widths = fillLength(
        length,
        () => ({ width: drawIn(rng, profile.tier2FrontageMeters) }),
        profile.tier2FrontageMeters[0] * 0.8
      );
      if (!widths) break;
      claims.push(claim);
      tier2.push({
        ...p,
        id: p.id.replace(":t1:", ":t2:"),
        tier: 2,
        t0: front,
        depth,
        backLane: 0,
        crossLane: 0,
        widths: widths.map(w => w.width),
        parent: p
      });
      break;
    }
  }

  // Take the plots by weighted road distance (§5.6).
  const candidates: Candidate[] = [],
    cost = (kind: keyof VillageToftProfile["cost"], along: number) =>
      profile.cost[kind].weight * along + profile.cost[kind].base;
  let order = 0;
  for (const p of [...tier1, ...tier2]) {
    let s = p.s0;
    p.widths.forEach((w, k) => {
      const along = p.along + s + w / 2;
      s += w;
      if (p.tier === 2) {
        candidates.push({
          cost: cost("tier2", along + p.parent!.depth),
          order: order++,
          gain: 1,
          potential: p,
          plot: k,
          kind: "plot"
        });
        return;
      }
      candidates.push({
        cost: cost(along <= profile.armMeters.first ? "first" : "beyond", along),
        order: order++,
        gain: 1,
        potential: p,
        plot: k,
        kind: "plot"
      });
      if (w / 2 >= profile.minFrontageMeters)
        candidates.push({ cost: cost("split", along), order: order++, gain: 1, potential: p, plot: k, kind: "split" });
      if (w / 4 >= profile.minFrontageMeters)
        candidates.push({
          cost: cost("secondSplit", along),
          order: order++,
          gain: 2,
          potential: p,
          plot: k,
          kind: "split2"
        });
    });
  }
  candidates.sort((a, b) => a.cost - b.cost || a.order - b.order);
  /** Plots taken from the front of each potential, and each tier-1 plot's pieces. */
  const taken = new Map<Potential, number>(),
    pieces = new Map<string, number>();
  const extent = (p: Potential) => p.s0 + p.widths.slice(0, taken.get(p) ?? 0).reduce((n, w) => n + w, 0);
  let placed = 0;
  for (const c of candidates) {
    if (placed >= input.plotsNeeded) break;
    const p = c.potential,
      key = `${p.id}:${c.plot}`,
      count = taken.get(p) ?? 0;
    if (c.kind === "plot") {
      if (count !== c.plot) continue;
      if (p.parent) {
        const end = p.s0 + p.widths.slice(0, c.plot + 1).reduce((n, w) => n + w, 0);
        if (end > extent(p.parent) + EPS) continue;
      }
      taken.set(p, count + 1);
      pieces.set(key, 1);
    } else if (c.kind === "split") {
      if (pieces.get(key) !== 1) continue;
      pieces.set(key, 2);
    } else {
      if (pieces.get(key) !== 2) continue;
      pieces.set(key, 4);
    }
    placed += c.gain;
  }

  const blocks: RoadsideBlock[] = [],
    lanes: RoadsideLane[] = [],
    lastBack = new Map<string, RoadsideLane>();
  for (const p of [...tier1, ...tier2]) {
    const count = taken.get(p) ?? 0;
    if (!count) continue;
    const s1 = extent(p),
      f = p.frame,
      plots: BurgagePlot[] = [];
    let s = p.s0;
    for (let k = 0; k < count; k++) {
      const id = `${p.id}:p${k}`,
        n = pieces.get(`${p.id}:${k}`) ?? 1,
        w = p.widths[k] / n;
      for (let i = 0; i < n; i++, s += w)
        plots.push({
          id: n === 1 ? id : `${id}:${i}`,
          ring: quad(f, s, s + w, p.t0, p.t0 + p.depth),
          front: [at(f, s, p.t0), at(f, s + w, p.t0)],
          frontageMeters: w,
          depthMeters: p.depth,
          kind: "plot",
          parent: id,
          undivided: n === 1
        });
    }
    blocks.push({
      id: p.id,
      armId: p.armId,
      side: p.side,
      tier: p.tier,
      ring: quad(f, p.s0, s1, p.t0, p.t0 + p.depth),
      front: [at(f, p.s0, p.t0), at(f, s1, p.t0)],
      depthMeters: p.depth,
      plots
    });
    if (p.tier === 1) {
      const back = p.t0 + p.depth + p.backLane / 2,
        crossAt = p.s0 - p.crossLane / 2;
      lanes.push({
        id: `${p.id}:cross`,
        armId: p.armId,
        side: p.side,
        kind: "cross",
        widthMeters: p.crossLane,
        points: [at(f, crossAt, p.t0), at(f, crossAt, p.t0 + p.depth + p.backLane)]
      });
      // Joins the back lane of the block before it on the same chord when the two line up.
      const row = `${p.armId}:${p.side}`,
        prev = lastBack.get(row),
        start = at(f, p.s0 - p.crossLane, back),
        end = prev?.points.at(-1);
      if (prev && end && Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-6) prev.points.push(at(f, s1, back));
      else {
        const lane: RoadsideLane = {
          id: `${p.id}:back`,
          armId: p.armId,
          side: p.side,
          kind: "back",
          widthMeters: p.backLane,
          points: [start, at(f, s1, back)]
        };
        lanes.push(lane);
        lastBack.set(row, lane);
      }
    }
  }
  const shortfall = Math.max(0, input.plotsNeeded - placed);
  return { blocks, lanes, plots: placed, shortfall, reasons: shortfall ? ["village-capacity"] : [] };
}
