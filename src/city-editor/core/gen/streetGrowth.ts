// Collector and stub streets. These lines never become mesh edges: they only
// split a working polygon so frontage packing can treat the pieces as blocks.
import type { Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import { nearestOnPolyline, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { intramuralBlockSpan } from "./housing";
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

export interface BlockInfillOptions {
  lotArea: number;
  laneWidth: number;
  coverage: number;
  occupancy: number;
  build: boolean;
  kind?: "core" | "outskirts";
  orientation?: number;
  classic?: boolean;
}

export type OutskirtsInfillOptions = BlockInfillOptions;

export interface OutskirtsInfill {
  lanes: Point[][];
  buildings: Point[][];
}

/** Street-to-street spacing: two house rows, a lane, and a shared yard. */
export function blockSpan(
  lotArea: number,
  laneWidth: number,
  kind: "core" | "outskirts" = "outskirts",
  classic = false
): number {
  if (classic) {
    const row = Math.sqrt(Math.max(60, lotArea)) * (kind === "core" ? 1.25 : 1.15);
    return kind === "core"
      ? Math.min(50, Math.max(30, 2 * row + laneWidth + 6))
      : Math.min(72, Math.max(38, 2 * row + laneWidth + 16));
  }
  if (kind === "core") return intramuralBlockSpan(lotArea, laneWidth);
  const row = Math.sqrt(Math.max(40, lotArea)) * 1.15;
  return Math.min(56, Math.max(32, 2 * row + laneWidth + 16));
}

export function outskirtsBlockSpan(lotArea: number, laneWidth: number): number {
  return blockSpan(lotArea, laneWidth, "outskirts");
}

export function infillOutskirts(
  polygon: Point[],
  roadFrontages: Point[][],
  entries: Point[],
  options: BlockInfillOptions,
  rng: Rng
): OutskirtsInfill {
  return infillBlocks(polygon, roadFrontages, entries, { ...options, kind: "outskirts" }, rng);
}

export function infillCore(
  polygon: Point[],
  roadFrontages: Point[][],
  entries: Point[],
  options: BlockInfillOptions,
  rng: Rng
): OutskirtsInfill {
  return infillBlocks(polygon, roadFrontages, entries, { ...options, kind: "core" }, rng);
}

function infillBlocks(
  polygon: Point[],
  roadFrontages: Point[][],
  entries: Point[],
  options: BlockInfillOptions,
  rng: Rng
): OutskirtsInfill {
  const { lotArea, laneWidth, coverage, occupancy, build, orientation } = options;
  const core = options.kind === "core";
  if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 65) return { lanes: [], buildings: [] };
  const span = blockSpan(lotArea, laneWidth, core ? "core" : "outskirts", options.classic);
  const seeds = seedEdges(polygon, roadFrontages, entries);
  const lanes: Point[][] = [];
  const pushLane = (a: Point, b: Point): Point[] | null => {
    if (distance(a, b) < 8) return null;
    const sa = snap(a, lanes, laneWidth) ?? a;
    const sb = snap(b, lanes, laneWidth) ?? b;
    if (distance(sa, sb) < 8) return null;
    if (parallelDuplicate([sa, sb], lanes, span * 0.36)) return null;
    const lane = [sa, sb];
    lanes.push(lane);
    return lane;
  };
  const gridTangent = (tangent: Point): Point => {
    if (orientation === undefined) return tangent;
    const axis: Point = [Math.cos(orientation), Math.sin(orientation)];
    const across: Point = [-axis[1], axis[0]];
    return Math.abs(dot(tangent, axis)) >= Math.abs(dot(tangent, across)) ? axis : across;
  };
  const rotate = (tangent: Point, angle: number): Point => {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return [tangent[0] * c - tangent[1] * s, tangent[0] * s + tangent[1] * c];
  };
  const biasTangent = (tangent: Point): Point => {
    if (orientation === undefined) return tangent;
    const snapped = gridTangent(tangent);
    return unit(add(scale(tangent, 0.72), scale(snapped, 0.28)));
  };

  let regions = [polygon];
  const cutFrom = (origin: Point, tangent: Point, inward: Point): void => {
    const line = chord(polygon, tangent, dot(origin, tangent));
    if (!line) return;
    const far = farther(line[0], line[1], origin, inward);
    const start = nearer(line[0], line[1], origin);
    const hit = firstHit(start, far, lanes, 6);
    const end = hit && distance(start, hit) > 8 ? hit : far;
    if (pushLane(start, end)) regions = partition(regions, lanes[lanes.length - 1], laneWidth, lotArea);
  };
  // One grain street follows the inspector axis; the rest wander so the cell
  // does not become a regular lattice.
  let grain = true;
  for (const seed of seeds) {
    const stops: number[] = [];
    for (
      let x = rng.range(span * 0.38, span * 0.92);
      x < seed.length - span * 0.32;
      x += rng.range(span * 0.58, span * 1.42)
    )
      stops.push(Math.min(0.86, Math.max(0.14, x / seed.length)));
    if (!stops.length) stops.push(0.5);
    for (const t of stops) {
      const origin = add(seed.a, scale(sub(seed.b, seed.a), t));
      const tangent = grain ? gridTangent(seed.tangent) : rotate(biasTangent(seed.tangent), rng.range(-0.08, 0.08));
      grain = false;
      cutFrom(origin, tangent, seed.inward);
    }
  }

  const ring = [...polygon, polygon[0]];
  const onRoad = (p: Point) => roadFrontages.some(r => nearestOnPolyline(p, r).dist < 2);
  const interior = entries.filter(e => !onRoad(nearestOnPolyline(e, ring).point));
  // A part reached only through seams has no road-seeded grid. One street along
  // the long axis lets multiple portals share a collector instead of two short
  // perpendicular stubs that never meet.
  if (!roadFrontages.length && interior.length >= 2) {
    const xs = polygon.map(p => p[0]),
      ys = polygon.map(p => p[1]);
    const axis = rotate(
      gridTangent(Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? [0, 1] : [1, 0]),
      rng.range(-0.12, 0.12)
    );
    const line = chord(polygon, axis, dot(polygonCentroid(polygon), axis));
    if (line && distance(line[0], line[1]) >= 8 && pushLane(line[0], line[1]))
      regions = partition(regions, lanes[lanes.length - 1], laneWidth, lotArea);
  }

  // Seam portals join the local grid and keep the shared midpoint as an endpoint
  // so neighbouring convex pieces meet. Road-frontage entries already open onto
  // a major road and must not add a dangling setback stub.
  const grid = seeds[0] ? gridTangent(seeds[0].tangent) : undefined;
  for (const entry of interior) {
    const hit = nearestOnPolyline(entry, ring);
    const a = polygon[hit.segIndex],
      b = polygon[(hit.segIndex + 1) % polygon.length];
    const along = edgeSeed(a, b, polygon);
    const tangent = grid ?? (along ? gridTangent(along.tangent) : undefined);
    if (tangent && along && !lanes.some(l => nearestOnPolyline(hit.point, l).dist < 8))
      cutFrom(hit.point, tangent, along.inward);
    const attach =
      snap(hit.point, lanes, 8) ??
      snap(entry, lanes, span) ??
      (lanes.length ? nearestOnPolyline(entry, lanes[0]).point : hit.point);
    if (distance(entry, attach) >= 1e-5 && !lanes.some(l => nearestOnPolyline(entry, l).dist < 1e-5))
      lanes.push([entry, attach]);
  }

  const collectors = lanes.slice();
  const strips = regions.slice();
  let stripIndex = 0;
  for (const region of strips) {
    const fronts = regionFronts(region, collectors, roadFrontages, laneWidth);
    if (!fronts.length) continue;
    const long = fronts.sort((a, b) => b.length - a.length)[0];
    const axis = rotate(unit(sub(long.b, long.a)), rng.range(-0.06, 0.06));
    const depth = Math.abs(polygonArea(region)) / Math.max(long.length, 1);
    if (depth < span * (core ? 0.58 : 0.5)) continue;
    const stubCount = Math.max(0, Math.floor((long.length - 8) / (span * rng.range(0.7, 1.25))));
    const stagger = stripIndex++ % 2 === 1 ? 0.5 : 0;
    for (let i = 1; i <= stubCount; i++) {
      const t = (i + stagger + rng.range(-0.28, 0.28)) / (stubCount + 1);
      if (t <= 0.08 || t >= 0.92) continue;
      const origin = add(long.a, scale(sub(long.b, long.a), t));
      if (!core) {
        const fromRoad = roadFrontages.length
          ? Math.min(...roadFrontages.map(r => nearestOnPolyline(origin, r).dist))
          : 0;
        const keep = 0.42 + 0.5 / (1 + Math.max(0, fromRoad - span) / (span * 3));
        if (rng() > keep) continue;
      }
      const line = chord(region, axis, dot(origin, axis));
      if (!line || distance(line[0], line[1]) < 8) continue;
      const snapped = line.map(p => snap(p, [...collectors, ...roadFrontages], laneWidth + 0.4) ?? p) as [Point, Point];
      if (pushLane(snapped[0], snapped[1])) regions = partition(regions, lanes[lanes.length - 1], laneWidth, lotArea);
    }
  }

  for (const lane of lanes) {
    const a0 = lane[0],
      a1 = lane[lane.length - 1];
    const axis = unit(sub(a1, a0));
    for (const i of [0, lane.length - 1]) {
      let best: Point | null = null,
        bestDist = 6;
      for (const other of lanes) {
        if (other === lane || other.length < 2) continue;
        const otherAxis = unit(sub(other[other.length - 1], other[0]));
        if (Math.abs(dot(axis, otherAxis)) > 0.92) continue;
        if (distance(a0, a1) > distance(other[0], other[other.length - 1]) + 4) continue;
        const hit = nearestOnPolyline(lane[i], other);
        if (hit.dist < bestDist) {
          best = hit.point;
          bestDist = hit.dist;
        }
      }
      if (best) lane[i] = best;
    }
    if (distance(lane[0], lane[lane.length - 1]) < 6) {
      lane[0] = a0;
      lane[lane.length - 1] = a1;
    }
  }
  for (let i = lanes.length - 1; i >= 0; i--)
    if (distance(lanes[i][0], lanes[i][lanes[i].length - 1]) < 1) lanes.splice(i, 1);
  joinStreetComponents(lanes, span);
  regions = [polygon];
  for (const lane of lanes) regions = partition(regions, lane, laneWidth, lotArea);

  if (!build) return { lanes, buildings: [] };
  const access = [
    ...roadFrontages.map(points => ({ points, widthMeters: 0 })),
    ...lanes.map(points => ({ points, widthMeters: laneWidth }))
  ];
  const buildings: Point[][] = [];
  const roadAccess = access.filter(l => l.widthMeters === 0);
  for (const region of regions) {
    const fronts = accessibleFronts(region, access);
    if (!fronts.length) continue;
    const isRoadFacing = (idx: number) => {
      const a = region[idx],
        b = region[(idx + 1) % region.length];
      const len = distance(a, b);
      if (len < 1e-6) return false;
      return roadAccess.some(l => {
        const hit = nearestOnPolyline(mid(a, b), l.points);
        const c = l.points[hit.segIndex],
          d = l.points[hit.segIndex + 1];
        const rlen = distance(c, d);
        return (
          hit.dist <= 1.5 &&
          rlen > 1e-6 &&
          Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (len * rlen) < 1e-4
        );
      });
    };
    const prioritizedFronts = fronts.slice().sort((a, b) => (isRoadFacing(b) ? 1 : 0) - (isRoadFacing(a) ? 1 : 0));
    let localOccupancy = occupancy;
    if (!core) {
      const centroid = polygonCentroid(region);
      const far = roadFrontages.length ? Math.min(...roadFrontages.map(r => nearestOnPolyline(centroid, r).dist)) : 0;
      const fall = 1 / (1 + Math.max(0, far - span) / (span * 3.2));
      localOccupancy = Math.max(0.22, occupancy * (0.38 + 0.62 * fall));
    }
    for (const footprint of frontageBuildings(
      region,
      prioritizedFronts,
      { lotArea, coverage, occupancy: localOccupancy, outskirts: !core },
      rng
    )) {
      if (!streetFront(footprint, access)) continue;
      if (
        access.some(
          l => l.widthMeters > 0 && footprint.some(p => nearestOnPolyline(p, l.points).dist < l.widthMeters / 2 - 1e-4)
        )
      )
        continue;
      buildings.push(footprint);
    }
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

function joinStreetComponents(lanes: Point[][], limit: number): void {
  const linked = (a: Point[], b: Point[]) =>
    !!segmentSegmentHit(a[0], a[a.length - 1], b[0], b[b.length - 1]) ||
    a.some(p => nearestOnPolyline(p, b).dist < 1e-5) ||
    b.some(p => nearestOnPolyline(p, a).dist < 1e-5);
  const components = () => {
    const seen = new Set<number>();
    const groups: number[][] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (seen.has(i) || lanes[i].length < 2) continue;
      const q = [i];
      seen.add(i);
      for (let k = 0; k < q.length; k++)
        for (let j = 0; j < lanes.length; j++)
          if (!seen.has(j) && lanes[j].length >= 2 && linked(lanes[q[k]], lanes[j])) {
            seen.add(j);
            q.push(j);
          }
      groups.push(q);
    }
    return groups;
  };
  for (let n = 0; n < 12; n++) {
    const groups = components();
    if (groups.length <= 1) return;
    let best: { a: Point; b: Point; dist: number } | null = null;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++)
        for (const ia of groups[i])
          for (const ib of groups[j])
            for (const p of [lanes[ia][0], lanes[ia][lanes[ia].length - 1]]) {
              const hit = nearestOnPolyline(p, lanes[ib]);
              if (hit.dist > 1e-5 && hit.dist < (best ? best.dist : limit) && distance(p, hit.point) >= 1)
                best = { a: p, b: hit.point, dist: hit.dist };
            }
    if (!best) return;
    lanes.push([best.a, best.b]);
  }
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
  const fronts: { a: Point; b: Point; length: number }[] = [];
  for (let i = 0; i < region.length; i++) {
    const a = region[i],
      b = region[(i + 1) % region.length];
    const length = distance(a, b);
    if (length < 8) continue;
    const facing = access.some(l => {
      const hit = nearestOnPolyline(mid(a, b), l.points);
      const c = l.points[hit.segIndex],
        d = l.points[hit.segIndex + 1];
      const roadLength = distance(c, d);
      if (hit.dist > l.widthMeters / 2 + 1.2 || roadLength < 1e-6) return false;
      return Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (length * roadLength) < 0.08;
    });
    if (facing) fronts.push({ a, b, length });
  }
  return fronts;
}

function streetFront(poly: Point[], roads: { points: Point[]; widthMeters: number }[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (distance(a, b) < 3) continue;
    if (
      roads.some(l => {
        const limit = l.widthMeters / 2 + 0.6;
        const hit = nearestOnPolyline(mid(a, b), l.points);
        const c = l.points[hit.segIndex],
          d = l.points[hit.segIndex + 1];
        const roadLength = distance(c, d);
        if (hit.dist > limit || roadLength < 1e-6) return false;
        const parallel =
          Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (distance(a, b) * roadLength) <
          1e-4;
        return parallel;
      })
    )
      return true;
  }
  return false;
}

function accessibleFronts(poly: Point[], roads: { points: Point[]; widthMeters: number }[]): number[] {
  const fronts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const length = distance(a, b);
    if (length < 1e-6) continue;
    const facing = roads.some(l => {
      const limit = l.widthMeters > 0 ? l.widthMeters / 2 + 0.36 : 1.2;
      const hit = nearestOnPolyline(mid(a, b), l.points);
      const c = l.points[hit.segIndex],
        d = l.points[hit.segIndex + 1];
      const roadLength = distance(c, d);
      return (
        hit.dist <= limit &&
        roadLength > 1e-6 &&
        Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (length * roadLength) < 1e-4
      );
    });
    if (facing) fronts.push(i);
  }
  return fronts;
}
