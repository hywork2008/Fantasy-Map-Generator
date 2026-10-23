// Longitudinal road profiles over relief, and the corridor they grade into the ground.
// Roads no longer drape over cell-averaged terrain: the terrain is cut and filled to the road.

import type { RoadGradeClass, RoadRibbon } from "../../utils/roadSurface";
import type { Point } from "../types/primitives";

/** Steepest grade a profile may take. Loaded wagons preferred 5-8 %; wheel ruts survive on ~10 % Alpine stretches. */
export const MAX_ROAD_GRADE: Record<RoadGradeClass, number> = { cart: 0.1, lane: 0.15, path: 0.25 };
/** Horizontal run per metre of height on cut and fill side slopes (1:1.5). */
export const SIDE_SLOPE_RATIO = 1.5;

const SAMPLE_METERS = 4;
/** Length over which a profile is smoothed against the terrain it follows. */
const SMOOTH_METERS = 8;
const SMOOTH_ITERATIONS = 60;
const ATTACH_SLACK_METERS = 0.5;
const ACTIVE_DEVIATION_METERS = 0.05;
const BIN_METERS = 8;
const REFINE_EDGE_METERS = 2;

interface Link {
  to: number;
  length: number;
  grade: number;
}

interface Corridor {
  a: Point;
  b: Point;
  za: number;
  zb: number;
  halfWidth: number;
  level: string | null;
  reach: number;
  active: boolean;
}

export interface RoadGrading {
  /** Ribbons split where they would cross a cliff, so no road is drawn down a cliff face. */
  ribbons: RoadRibbon[];
  /** Where a road met a cliff and was stopped. */
  cliffBreaks: Point[];
  /** The graded height at a point, given the ungraded terrain height there. */
  apply(point: Point, terrain: number): number;
  /** True when a triangle is too coarse to follow a corridor that departs from the terrain. */
  needsRefinement(triangle: readonly Point[]): boolean;
}

const key = (point: Point) => `${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`;
const binKey = (x: number, y: number) => `${x},${y}`;

function resample(line: readonly (readonly [number, number])[]): Point[] {
  const out: Point[] = [[line[0][0], line[0][1]]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_METERS));
    for (let s = 1; s <= steps; s++) out.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
  }
  return out;
}

function nearestOnSegment(point: Point, a: Point, b: Point): { t: number; distance: number } {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
  return { t, distance: Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t) };
}

class SegmentBins<T extends { a: Point; b: Point }> {
  private readonly bins = new Map<string, T[]>();
  constructor(items: readonly T[], reach: (item: T) => number) {
    for (const item of items) {
      const r = reach(item);
      for (
        let x = Math.floor((Math.min(item.a[0], item.b[0]) - r) / BIN_METERS);
        x <= Math.floor((Math.max(item.a[0], item.b[0]) + r) / BIN_METERS);
        x++
      )
        for (
          let y = Math.floor((Math.min(item.a[1], item.b[1]) - r) / BIN_METERS);
          y <= Math.floor((Math.max(item.a[1], item.b[1]) + r) / BIN_METERS);
          y++
        ) {
          const id = binKey(x, y);
          const list = this.bins.get(id);
          if (list) list.push(item);
          else this.bins.set(id, [item]);
        }
    }
  }
  at(point: Point): readonly T[] {
    return this.bins.get(binKey(Math.floor(point[0] / BIN_METERS), Math.floor(point[1] / BIN_METERS))) ?? [];
  }
  /** Items whose reach box overlaps an axis-aligned box. */
  within(minX: number, minY: number, maxX: number, maxY: number): Set<T> {
    const found = new Set<T>();
    for (let x = Math.floor(minX / BIN_METERS); x <= Math.floor(maxX / BIN_METERS); x++)
      for (let y = Math.floor(minY / BIN_METERS); y <= Math.floor(maxY / BIN_METERS); y++)
        for (const item of this.bins.get(binKey(x, y)) ?? []) found.add(item);
    return found;
  }
}

/**
 * Grade-limited envelope by multi-source Dijkstra, where an edge allows a rise of grade × length.
 * `sign` 1 gives max_j(z_j − rise(i, j)), the smallest limited profile above z; −1 gives the largest one below.
 * NaN sources are skipped; nodes no source reaches stay at ∓Infinity.
 */
function limitedEnvelope(links: readonly Link[][], z: readonly number[], sign: 1 | -1): number[] {
  const value = z.map(v => (Number.isNaN(v) ? -sign * Number.POSITIVE_INFINITY : v));
  // Max-heap on sign × value.
  const heap: number[] = [];
  const better = (a: number, b: number) => sign * value[a] > sign * value[b];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (!better(heap[k], heap[parent])) break;
      [heap[k], heap[parent]] = [heap[parent], heap[k]];
      k = parent;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1,
          r = l + 1;
        let best = k;
        if (l < heap.length && better(heap[l], heap[best])) best = l;
        if (r < heap.length && better(heap[r], heap[best])) best = r;
        if (best === k) break;
        [heap[k], heap[best]] = [heap[best], heap[k]];
        k = best;
      }
    }
    return top;
  };
  const done = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) if (Number.isFinite(value[i])) push(i);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    for (const { to, length, grade } of links[i]) {
      const reached = value[i] - sign * grade * length;
      if (!done[to] && sign * reached > sign * value[to]) {
        value[to] = reached;
        push(to);
      }
    }
  }
  return value;
}

/**
 * Solve one height per road node: close to the terrain, smooth along the road, equal at junctions and never steeper
 * than the road's grade class. Ribbons stop where they would cross between levels separated by a cliff.
 * Pinned nodes (platform summits) keep the terrain height, so a ramp is built as fill outside the platform.
 */
export function gradeRoads(
  ribbons: readonly RoadRibbon[],
  terrainAt: (point: Point) => number,
  levelAt: (point: Point) => string | null,
  pinnedAt: (point: Point) => boolean = () => false
): RoadGrading {
  const points: Point[] = [];
  const levels: Array<string | null> = [];
  const links: Link[][] = [];
  const index = new Map<string, number>();
  const node = (point: Point) => {
    const id = key(point);
    let i = index.get(id);
    if (i === undefined) {
      i = points.length;
      index.set(id, i);
      points.push(point);
      levels.push(levelAt(point));
      links.push([]);
    }
    return i;
  };
  const link = (i: number, j: number, grade: number) => {
    if (i === j || links[i].some(item => item.to === j)) return;
    const length = Math.max(ATTACH_SLACK_METERS, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
    links[i].push({ to: j, length, grade });
    links[j].push({ to: i, length, grade });
  };

  const graded: RoadRibbon[] = [];
  const cliffBreaks: Point[] = [];
  const edges: Array<{ i: number; j: number; halfWidth: number; ribbon: number }> = [];
  const ends: Array<{ i: number; ribbon: number }> = [];
  ribbons.forEach((ribbon, r) => {
    if (ribbon.centerline.length < 2) return;
    const grade = MAX_ROAD_GRADE[ribbon.gradeClass ?? "cart"];
    const samples = resample(ribbon.centerline).map(node);
    let piece: number[] = [];
    const flush = () => {
      if (piece.length >= 2) {
        graded.push({ ...ribbon, centerline: piece.map(i => points[i]) });
        ends.push({ i: piece[0], ribbon: r }, { i: piece[piece.length - 1], ribbon: r });
      }
      piece = [];
    };
    for (let s = 0; s < samples.length; s++) {
      const i = samples[s];
      if (levels[i] === "cliff") {
        cliffBreaks.push(points[i]);
        flush();
        continue;
      }
      const previous = piece[piece.length - 1];
      if (previous !== undefined && levels[previous] !== levels[i]) {
        cliffBreaks.push([(points[previous][0] + points[i][0]) / 2, (points[previous][1] + points[i][1]) / 2]);
        flush();
      }
      if (previous !== undefined && previous !== i) {
        link(previous, i, grade);
        edges.push({ i: previous, j: i, halfWidth: ribbon.widthMeters / 2, ribbon: r });
      }
      if (previous !== i) piece.push(i);
    }
    flush();
  });

  // A lane ending inside another road joins that road's profile.
  const hosts = new SegmentBins(
    edges.map(edge => ({ ...edge, a: points[edge.i], b: points[edge.j] })),
    edge => edge.halfWidth + ATTACH_SLACK_METERS
  );
  for (const end of ends) {
    if (links[end.i].length !== 1) continue;
    let best: { node: number; distance: number; grade: number } | null = null;
    for (const host of hosts.at(points[end.i])) {
      if (host.ribbon === end.ribbon || levels[host.i] !== levels[end.i]) continue;
      const hit = nearestOnSegment(points[end.i], host.a, host.b);
      if (hit.distance > host.halfWidth + ATTACH_SLACK_METERS || (best && hit.distance >= best.distance)) continue;
      const grade = Math.min(
        MAX_ROAD_GRADE[ribbons[host.ribbon].gradeClass ?? "cart"],
        MAX_ROAD_GRADE[ribbons[end.ribbon].gradeClass ?? "cart"]
      );
      best = { node: hit.t < 0.5 ? host.i : host.j, distance: hit.distance, grade };
    }
    if (best) link(end.i, best.node, best.grade);
  }

  const targets = points.map(terrainAt);
  const pinned = points.map(pinnedAt);
  const z = [...targets];
  for (let iteration = 0; iteration < SMOOTH_ITERATIONS; iteration++)
    for (let i = 0; i < z.length; i++) {
      if (!links[i].length || pinned[i]) continue;
      let sum = targets[i],
        weight = 1;
      for (const { to, length } of links[i]) {
        const w = SMOOTH_METERS / length;
        sum += w * z[to];
        weight += w;
      }
      z[i] = sum / weight;
    }
  // The midpoint of the largest grade-limited profile below and the smallest above is grade-limited and departs
  // least from the smoothed profile. Pinned summits bound it the same way, so they keep their level.
  const above = limitedEnvelope(links, z, 1),
    below = limitedEnvelope(links, z, -1);
  const pins = pinned.map((pin, i) => (pin ? targets[i] : Number.NaN));
  const floor = limitedEnvelope(links, pins, 1),
    ceiling = limitedEnvelope(links, pins, -1);
  for (let i = 0; i < z.length; i++) {
    const mid = (above[i] + below[i]) / 2;
    z[i] = Math.min(ceiling[i], Math.max(floor[i], mid));
  }

  const corridors: Corridor[] = edges.map(({ i, j, halfWidth }) => {
    const a = points[i],
      b = points[j];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      zm = (z[i] + z[j]) / 2;
    const deviation = Math.max(
      Math.abs(z[i] - targets[i]),
      Math.abs(z[j] - targets[j]),
      ...[-1, 1].map(side =>
        Math.abs(zm - terrainAt([mid[0] + normal[0] * side * halfWidth, mid[1] + normal[1] * side * halfWidth]))
      )
    );
    return {
      a,
      b,
      za: z[i],
      zb: z[j],
      halfWidth,
      level: levels[i],
      reach: halfWidth + SIDE_SLOPE_RATIO * deviation + 0.5,
      active: deviation > ACTIVE_DEVIATION_METERS
    };
  });
  const bins = new SegmentBins(corridors, corridor => corridor.reach);
  const active = new SegmentBins(
    corridors.filter(corridor => corridor.active),
    corridor => corridor.reach
  );

  return {
    ribbons: graded,
    cliffBreaks,
    apply(point, terrain) {
      let best: { corridor: Corridor; slack: number; t: number } | null = null;
      for (const corridor of bins.at(point)) {
        const hit = nearestOnSegment(point, corridor.a, corridor.b);
        if (hit.distance > corridor.reach) continue;
        const slack = hit.distance - corridor.halfWidth;
        if (!best || slack < best.slack) best = { corridor, slack, t: hit.t };
      }
      if (!best) return terrain;
      // Corridors grade only the level they run on; a cliff face and the other level stay untouched.
      const level = levelAt(point);
      if (level !== best.corridor.level) return terrain;
      const road = best.corridor.za + (best.corridor.zb - best.corridor.za) * best.t;
      if (best.slack <= 0) return road;
      const rise = best.slack / SIDE_SLOPE_RATIO;
      return Math.max(road - rise, Math.min(road + rise, terrain));
    },
    needsRefinement(triangle) {
      let longest = 0;
      for (let k = 0; k < 3; k++) {
        const a = triangle[k],
          b = triangle[(k + 1) % 3];
        longest = Math.max(longest, Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
      if (longest <= REFINE_EDGE_METERS) return false;
      const xs = triangle.map(p => p[0]),
        ys = triangle.map(p => p[1]);
      for (const corridor of active.within(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) {
        const center: Point = [(xs[0] + xs[1] + xs[2]) / 3, (ys[0] + ys[1] + ys[2]) / 3];
        if (nearestOnSegment(center, corridor.a, corridor.b).distance <= corridor.reach + longest) return true;
      }
      return false;
    }
  };
}
