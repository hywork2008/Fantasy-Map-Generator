// Extra-mural collectors and stubs. These lines never become mesh edges: they
// only split a working polygon so frontage packing can treat the pieces as blocks.
import type { Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import { nearestOnPolyline, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { clipHalfPlane } from "./lotGeometry";
import type { Rng } from "./prng";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, s: number): Point => [a[0] * s, a[1] * s];
const unit = (a: Point): Point => {
  const n = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / n, a[1] / n];
};

export interface OutskirtsInfillOptions {
  lotArea: number;
  laneWidth: number;
  coverage: number;
  occupancy: number;
  build: boolean;
}

export interface OutskirtsInfill {
  lanes: Point[][];
  buildings: Point[][];
}

/** Street-to-street spacing: two house rows, a lane, and a shared yard. */
export function outskirtsBlockSpan(lotArea: number, laneWidth: number): number {
  const row = Math.sqrt(Math.max(80, lotArea)) * 1.15;
  return Math.min(88, Math.max(42, 2 * row + laneWidth + 20));
}

export function infillOutskirts(
  polygon: Point[],
  roadFrontages: Point[][],
  entries: Point[],
  options: OutskirtsInfillOptions,
  rng: Rng
): OutskirtsInfill {
  const { lotArea, laneWidth, coverage, occupancy, build } = options;
  if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 65) return { lanes: [], buildings: [] };
  const span = outskirtsBlockSpan(lotArea, laneWidth);
  const seeds = seedEdges(polygon, roadFrontages, entries);
  const lanes: Point[][] = [];
  const pushLane = (a: Point, b: Point): Point[] | null => {
    if (distance(a, b) < 8) return null;
    const sa = snap(a, lanes, laneWidth) ?? a;
    const sb = snap(b, lanes, laneWidth) ?? b;
    if (distance(sa, sb) < 8) return null;
    if (parallelDuplicate([sa, sb], lanes, span * 0.48)) return null;
    const lane = [sa, sb];
    lanes.push(lane);
    return lane;
  };

  let regions = [polygon];
  for (const seed of seeds) {
    const count = Math.max(1, Math.floor((seed.length - 8) / span));
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (i + 0.38 + rng.range(0, 0.24)) / count;
      const origin = add(seed.a, scale(sub(seed.b, seed.a), Math.min(0.86, Math.max(0.14, t))));
      const line = chord(polygon, seed.tangent, dot(origin, seed.tangent));
      if (!line) continue;
      const far = farther(line[0], line[1], origin, seed.inward);
      const start = nearer(line[0], line[1], origin);
      const hit = firstHit(start, far, lanes, 6);
      const end = hit && distance(start, hit) > 8 ? hit : far;
      if (pushLane(start, end)) regions = partition(regions, lanes[lanes.length - 1], laneWidth, lotArea);
    }
  }

  const collectors = lanes.slice();
  const strips = regions.slice();
  for (const region of strips) {
    const fronts = regionFronts(region, collectors, roadFrontages, laneWidth);
    if (!fronts.length) continue;
    const long = fronts.sort((a, b) => b.length - a.length)[0];
    const axis = unit(sub(long.b, long.a));
    const depth = Math.abs(polygonArea(region)) / Math.max(long.length, 1);
    if (depth < span * 0.55) continue;
    const stubCount = Math.max(0, Math.floor((long.length - 8) / span));
    for (let i = 1; i <= stubCount; i++) {
      const t = (i + rng.range(-0.12, 0.12)) / (stubCount + 1);
      if (t <= 0.08 || t >= 0.92) continue;
      const origin = add(long.a, scale(sub(long.b, long.a), t));
      const fromRoad = roadFrontages.length
        ? Math.min(...roadFrontages.map(r => nearestOnPolyline(origin, r).dist))
        : 0;
      const keep = 0.42 + 0.5 / (1 + Math.max(0, fromRoad - span) / (span * 3));
      if (rng() > keep) continue;
      const line = chord(region, axis, dot(origin, axis));
      if (!line || distance(line[0], line[1]) < 8) continue;
      const snapped = line.map(p => snap(p, [...collectors, ...roadFrontages], laneWidth + 0.4) ?? p) as [Point, Point];
      if (pushLane(snapped[0], snapped[1])) regions = partition(regions, lanes[lanes.length - 1], laneWidth, lotArea);
    }
  }

  if (!build) return { lanes, buildings: [] };
  const access = [
    ...roadFrontages.map(points => ({ points, widthMeters: 0 })),
    ...lanes.map(points => ({ points, widthMeters: laneWidth }))
  ];
  const buildings: Point[][] = [];
  for (const region of regions) {
    const fronts = accessibleFronts(region, access);
    if (!fronts.length) continue;
    const centroid = polygonCentroid(region);
    const far = roadFrontages.length ? Math.min(...roadFrontages.map(r => nearestOnPolyline(centroid, r).dist)) : 0;
    const fall = 1 / (1 + Math.max(0, far - span) / (span * 3.2));
    const localOccupancy = Math.max(0.22, occupancy * (0.38 + 0.62 * fall));
    buildings.push(
      ...frontageBuildings(region, fronts, { lotArea, coverage, occupancy: localOccupancy, outskirts: true }, rng)
    );
  }
  return { lanes, buildings };
}

function seedEdges(
  polygon: Point[],
  roadFrontages: Point[][],
  entries: Point[]
): { a: Point; b: Point; length: number; tangent: Point; inward: Point }[] {
  const fromRoads = roadFrontages
    .map(([a, b]) => edgeSeed(a, b, polygon))
    .filter((s): s is NonNullable<typeof s> => !!s && s.length >= 8);
  if (fromRoads.length) return fromRoads.sort((a, b) => b.length - a.length);
  const seen: typeof fromRoads = [];
  for (const entry of entries) {
    const hit = nearestOnPolyline(entry, [...polygon, polygon[0]]);
    const a = polygon[hit.segIndex];
    const b = polygon[(hit.segIndex + 1) % polygon.length];
    const seed = edgeSeed(a, b, polygon);
    if (!seed || seed.length < 8) continue;
    if (seen.some(s => distance(mid(s.a, s.b), mid(seed.a, seed.b)) < 4)) continue;
    seen.push(seed);
  }
  return seen.sort((a, b) => b.length - a.length);
}

function edgeSeed(a: Point, b: Point, polygon: Point[]) {
  const length = distance(a, b);
  if (length < 1e-6) return null;
  const tangent = unit(sub(b, a));
  const left: Point = [-tangent[1], tangent[0]];
  const right: Point = [tangent[1], -tangent[0]];
  const c = polygonCentroid(polygon);
  const m = mid(a, b);
  const inward = dot(sub(c, m), left) >= dot(sub(c, m), right) ? left : right;
  return { a, b, length, tangent, inward };
}

function chord(poly: Point[], normal: Point, offset: number): [Point, Point] | null {
  const hits: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = dot(a, normal) - offset,
      db = dot(b, normal) - offset;
    if (Math.abs(da) < 1e-6) hits.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      hits.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  let best: [Point, Point] | null = null;
  for (const a of hits) for (const b of hits) if (distance(a, b) > (best ? distance(...best) : 1e-5)) best = [a, b];
  return best;
}

function partition(regions: Point[][], lane: Point[], laneWidth: number, lotArea: number): Point[][] {
  const a = lane[0],
    b = lane[lane.length - 1];
  const len = distance(a, b);
  if (len < 8) return regions;
  const axis = unit(sub(b, a));
  const normal: Point = [-axis[1], axis[0]];
  const offset = dot(a, normal);
  const minArea = Math.max(65, lotArea * 2);
  const next: Point[][] = [];
  for (const region of regions) {
    const line = chord(region, normal, offset);
    if (!line) {
      next.push(region);
      continue;
    }
    const span = distance(line[0], line[1]);
    if (span < 8 || overlap(line, [a, b]) < span * 0.72) {
      next.push(region);
      continue;
    }
    const parts = [
      clipHalfPlane(region, normal, offset - laneWidth / 2 - 0.35),
      clipHalfPlane(region, [-normal[0], -normal[1]], -offset - laneWidth / 2 - 0.35)
    ].filter(p => p.length >= 3 && Math.abs(polygonArea(p)) >= 65);
    if (parts.length === 2 && parts.every(p => Math.abs(polygonArea(p)) >= minArea)) next.push(...parts);
    else next.push(region);
  }
  return next;
}

function overlap(a: [Point, Point], b: [Point, Point]): number {
  const axis = unit(sub(a[1], a[0]));
  const range = (p: Point[]) => {
    const values = p.map(q => dot(q, axis));
    return [Math.min(...values), Math.max(...values)] as const;
  };
  const [a0, a1] = range(a),
    [b0, b1] = range(b);
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function snap(p: Point, lanes: Point[][], limit: number): Point | null {
  let best: Point | null = null,
    bestDist = limit;
  for (const lane of lanes) {
    if (lane.length < 2) continue;
    const hit = nearestOnPolyline(p, lane);
    if (hit.dist < bestDist) {
      best = hit.point;
      bestDist = hit.dist;
    }
  }
  return best;
}

function firstHit(a: Point, b: Point, lanes: Point[][], skip: number): Point | null {
  let best: Point | null = null,
    bestDist = distance(a, b);
  for (const lane of lanes) {
    for (let i = 0; i < lane.length - 1; i++) {
      const hit = segmentSegmentHit(a, b, lane[i], lane[i + 1]);
      if (!hit) continue;
      const d = distance(a, hit.point);
      if (d > skip && d < bestDist) {
        best = hit.point;
        bestDist = d;
      }
    }
  }
  return best;
}

function parallelDuplicate(line: Point[], lanes: Point[][], minDist: number): boolean {
  const axis = unit(sub(line[1], line[0]));
  const m = mid(line[0], line[1]);
  return lanes.some(lane => {
    if (lane.length < 2) return false;
    const other = unit(sub(lane[lane.length - 1], lane[0]));
    if (Math.abs(dot(axis, other)) < 0.94) return false;
    return nearestOnPolyline(m, lane).dist < minDist;
  });
}

function farther(a: Point, b: Point, origin: Point, dir: Point): Point {
  return dot(sub(a, origin), dir) >= dot(sub(b, origin), dir) ? a : b;
}

function nearer(a: Point, b: Point, origin: Point): Point {
  return distance(a, origin) <= distance(b, origin) ? a : b;
}

function regionFronts(
  region: Point[],
  collectors: Point[][],
  roads: Point[][],
  laneWidth: number
): { a: Point; b: Point; length: number }[] {
  const access = [
    ...roads.map(points => ({ points, widthMeters: 0 })),
    ...collectors.map(points => ({ points, widthMeters: laneWidth }))
  ];
  return accessibleFronts(region, access).map(i => {
    const a = region[i],
      b = region[(i + 1) % region.length];
    return { a, b, length: distance(a, b) };
  });
}

function accessibleFronts(poly: Point[], roads: { points: Point[]; widthMeters: number }[]): number[] {
  const fronts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const length = distance(a, b);
    if (length < 1e-6) continue;
    const facing = roads.some(l => {
      const limit = l.widthMeters / 2 + 0.36;
      const hit = nearestOnPolyline(mid(a, b), l.points);
      const c = l.points[hit.segIndex],
        d = l.points[hit.segIndex + 1];
      const roadLength = distance(c, d);
      return (
        hit.dist <= limit &&
        roadLength > 1e-6 &&
        Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (length * roadLength) < 1e-5
      );
    });
    if (facing) fronts.push(i);
  }
  return fronts;
}
