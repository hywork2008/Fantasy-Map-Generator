// Access ramps up cliff-edged platforms: a walled deck hugging the cliff foot, folding back in switchbacks
// when one run along the cliff is too short, with its top landing at the platform gate.

import type { CityDocument, Id, Point } from "../types/document";
import type { TerrainPlatform, TerrainRamp } from "../types/terrain";
import { reservedCastleFaces } from "./fortifications";
import { pointInPolygon, segmentsIntersect } from "./geom";
import { facePoints } from "./mesh";
import { cityTerrain, platformOutline } from "./terrainElevation";
import type { OutlineSegment } from "./terrainModel";

/** Upper end of the 5-8 % that loaded wagons could manage, so the ramp stays below the 10 % cart limit. */
export const RAMP_GRADE = 0.08;
export const RAMP_WIDTH_METERS = 4;
/** Space between the cliff foot and the ramp, and between stacked switchback runs. */
const CLEARANCE_METERS = 0.5;
const RUN_GAP_METERS = 1;
/** The top landing reaches this far onto the platform, across the cliff face. */
const LANDING_METERS = 1.5;
const MAX_RUNS = 6;
const SAMPLE_METERS = 2;
const CONNECT_METERS = 80;
const MIN_RISE_METERS = 0.5;

export type RampFailure = "no-rise" | "no-room";

interface Loop {
  points: Point[];
  /** Outward unit normal of edge i, from points[i] to points[i + 1]. */
  normals: Point[];
}

const key = (point: Point) => `${point[0]},${point[1]}`;
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const len = (v: Point) => Math.hypot(v[0], v[1]);
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Chains outline segments into closed loops. Holes and islands become loops of their own. */
function outlineLoops(segments: readonly OutlineSegment[]): Loop[] {
  const byPoint = new Map<string, number[]>();
  segments.forEach((segment, i) => {
    for (const end of [segment.a, segment.b]) byPoint.set(key(end), [...(byPoint.get(key(end)) ?? []), i]);
  });
  const used = new Set<number>();
  const loops: Loop[] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    const points: Point[] = [segments[start].a],
      normals: Point[] = [];
    let current = start,
      at = segments[start].b;
    for (;;) {
      used.add(current);
      const segment = segments[current];
      normals.push([-segment.inward[0], -segment.inward[1]]);
      if (key(at) === key(points[0])) break;
      points.push(at);
      const next = (byPoint.get(key(at)) ?? []).find(i => !used.has(i));
      if (next === undefined) break;
      current = next;
      at = key(segments[next].a) === key(at) ? segments[next].b : segments[next].a;
    }
    if (points.length >= 3 && normals.length === points.length) loops.push({ points, normals });
  }
  return loops;
}

/** The loop moved outward by `distance`, with mitred corners capped at three times the distance. */
function offsetLoop(loop: Loop, distance: number): Point[] {
  const n = loop.points.length;
  return loop.points.map((point, i) => {
    const before = loop.normals[(i - 1 + n) % n],
      after = loop.normals[i];
    const sum: Point = [before[0] + after[0], before[1] + after[1]];
    const denominator = 1 + before[0] * after[0] + before[1] * after[1];
    let shift: Point = denominator > 1e-6 ? [sum[0] / denominator, sum[1] / denominator] : after;
    const scale = len(shift);
    if (scale > 3) shift = [(shift[0] / scale) * 3, (shift[1] / scale) * 3];
    return [point[0] + shift[0] * distance, point[1] + shift[1] * distance];
  });
}

/** Position on a loop by edge parameter u in [0, n): edge floor(u), fraction u - floor(u). */
function atParameter(ring: readonly Point[], u: number): Point {
  const n = ring.length,
    wrapped = ((u % n) + n) % n;
  const i = Math.floor(wrapped);
  return lerp(ring[i], ring[(i + 1) % n], wrapped - i);
}

/** Walk `length` metres along a ring from parameter u in direction ±1; returns the points passed and the end. */
function walk(ring: readonly Point[], u: number, direction: 1 | -1, length: number): { points: Point[]; end: number } {
  const n = ring.length;
  const edges = ring.map((point, i) => len(sub(ring[(i + 1) % n], point)) || 1e-9);
  const starts: number[] = [];
  let total = 0;
  for (const edge of edges) {
    starts.push(total);
    total += edge;
  }
  const toArc = (param: number) => {
    const wrapped = ((param % n) + n) % n,
      i = Math.floor(wrapped);
    return starts[i] + (wrapped - i) * edges[i];
  };
  const toParam = (arc: number) => {
    const wrapped = ((arc % total) + total) % total;
    let i = n - 1;
    while (i > 0 && starts[i] > wrapped) i--;
    return i + (wrapped - starts[i]) / edges[i];
  };
  const from = toArc(u);
  const points: Point[] = [atParameter(ring, u)];
  // Vertices passed, in walking order.
  const passed: number[] = [];
  for (let k = 0; k < n; k++) {
    const arc = starts[k];
    const ahead = direction > 0 ? (((arc - from) % total) + total) % total : (((from - arc) % total) + total) % total;
    if (ahead > 1e-9 && ahead < length) passed.push(ahead);
  }
  passed.sort((a, b) => a - b);
  for (const ahead of passed) points.push(atParameter(ring, toParam(from + direction * ahead)));
  const end = toParam(from + direction * length);
  points.push(atParameter(ring, end));
  return { points, end };
}

function ringLength(ring: readonly Point[]): number {
  return ring.reduce((sum, point, i) => sum + len(sub(ring[(i + 1) % ring.length], point)), 0);
}

function polylineLength(line: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += len(sub(line[i], line[i - 1]));
  return total;
}

/** Nearest point of a loop to `point`, as an edge parameter. */
function project(loop: Loop, point: Point): { u: number; distance: number } {
  let best = { u: 0, distance: Number.POSITIVE_INFINITY };
  const n = loop.points.length;
  for (let i = 0; i < n; i++) {
    const a = loop.points[i],
      b = loop.points[(i + 1) % n];
    const d = sub(b, a);
    const lengthSq = d[0] * d[0] + d[1] * d[1];
    const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * d[0] + (point[1] - a[1]) * d[1]) / lengthSq)) : 0;
    const distance = len(sub(point, lerp(a, b, t)));
    if (distance < best.distance) best = { u: i + t, distance };
  }
  return best;
}

/** What a ramp may stand on: dry land outside every castle and platform, inside the frame, crossing no wall. */
function siteChecker(document: CityDocument, platformFaces: ReadonlySet<Id>) {
  const blocked = new Set([...reservedCastleFaces(document), ...platformFaces]);
  for (const feature of document.terrain?.features ?? [])
    if (feature.summit.kind === "faces") for (const id of feature.summit.faceIds) blocked.add(id);
  const faces = Object.values(document.mesh.faces).map(face => {
    const ring = facePoints(document.mesh, face);
    const xs = ring.map(p => p[0]),
      ys = ring.map(p => p[1]);
    return {
      ring,
      open: face.properties.water === "land" && !blocked.has(face.id),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    };
  });
  const walls = document.featureGroups
    .filter(group => group.kind === "wall")
    .flatMap(group =>
      group.kind === "river"
        ? []
        : group.segments.map(ref => {
            const edge = document.mesh.edges[ref.edgeId];
            return edge ? [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point] : null;
          })
    )
    .filter((wall): wall is Point[] => !!wall);
  const half = document.frame.extentMeters / 2;
  const standable = (point: Point) =>
    Math.abs(point[0]) < half &&
    Math.abs(point[1]) < half &&
    faces.some(
      face =>
        point[0] >= face.box[0] &&
        point[0] <= face.box[2] &&
        point[1] >= face.box[1] &&
        point[1] <= face.box[3] &&
        pointInPolygon(point, face.ring) &&
        face.open
    );
  return (line: readonly Point[], halfWidth: number): boolean => {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i];
      if (walls.some(([c, d]) => segmentsIntersect(a, b, c, d))) return false;
      const d = sub(b, a),
        length = len(d);
      if (length < 1e-9) continue;
      const normal: Point = [-d[1] / length, d[0] / length];
      for (let s = 0; s <= length; s += SAMPLE_METERS) {
        const center = lerp(a, b, s / length);
        for (const side of [-1, 0, 1])
          if (!standable([center[0] + normal[0] * side * halfWidth, center[1] + normal[1] * side * halfWidth]))
            return false;
      }
    }
    return true;
  };
}

/** True when two non-neighbouring stretches of a ramp come closer than one ramp width plus the run gap. */
function selfOverlaps(path: readonly Point[]): boolean {
  // Resample so that "neighbouring" means close along the ramp, not merely consecutive vertices.
  const samples: Array<{ point: Point; along: number }> = [];
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const length = len(sub(b, a));
    for (let s = 0; s < length; s += SAMPLE_METERS / 2)
      samples.push({ point: lerp(a, b, s / length), along: along + s });
    along += length;
  }
  const clearance = RAMP_WIDTH_METERS + RUN_GAP_METERS - 0.05;
  for (let i = 0; i < samples.length; i++)
    for (let j = i + 1; j < samples.length; j++) {
      const apart = samples[j].along - samples[i].along;
      if (apart <= 2 * clearance + RAMP_WIDTH_METERS) continue;
      if (len(sub(samples[i].point, samples[j].point)) < clearance) return true;
    }
  return false;
}

/** True when every stretch of the deck stays within the ramp grade. */
function withinGrade(path: readonly Point[], levels: readonly number[]): boolean {
  for (let i = 1; i < path.length; i++)
    if (Math.abs(levels[i] - levels[i - 1]) > RAMP_GRADE * len(sub(path[i], path[i - 1])) * (1 + 1e-3) + 1e-6)
      return false;
  return true;
}

/** True when rising ground would bury the deck anywhere across its width: that is a cutting, not a ramp. */
function sinks(
  path: readonly Point[],
  levels: readonly number[],
  halfWidth: number,
  ground: (point: Point) => number
): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const d = sub(b, a),
      length = len(d);
    if (length < 1e-9) continue;
    const normal: Point = [-d[1] / length, d[0] / length];
    for (let s = 0; s <= length; s += SAMPLE_METERS) {
      const center = lerp(a, b, s / length),
        deck = levels[i - 1] + ((levels[i] - levels[i - 1]) * s) / length;
      for (const side of [-1, 0, 1])
        if (deck < ground([center[0] + normal[0] * side * halfWidth, center[1] + normal[1] * side * halfWidth]) - 0.3)
          return true;
    }
  }
  return false;
}

/** Mesh road vertices outside the platform, where a ramp foot can join the street network. */
function roadPoints(document: CityDocument, platformFaces: ReadonlySet<Id>): Point[] {
  const points: Point[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments) {
      const edge = document.mesh.edges[ref.edgeId];
      if (
        !edge ||
        (edge.leftFace && platformFaces.has(edge.leftFace)) ||
        (edge.rightFace && platformFaces.has(edge.rightFace))
      )
        continue;
      points.push(document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point);
    }
  }
  return points;
}

/**
 * Plan a ramp from the ground up to `landing` on the edge of a cliff-edged cell platform. The deck runs along the
 * cliff foot at RAMP_GRADE, turning back in stacked switchbacks when the cliff is too short, and its foot joins the
 * nearest road when one is close. Both walking directions and several run lengths are tried; the shortest
 * connection wins.
 */
export function planPlatformRamp(
  document: CityDocument,
  platform: TerrainPlatform,
  options: { id: Id; ownerId?: Id; landing?: Point }
): TerrainRamp | RampFailure {
  if (platform.summit.kind !== "faces" || platform.edge.kind !== "cliff") return "no-rise";
  const faces = new Set(platform.summit.faceIds);
  const loops = outlineLoops(platformOutline(document, platform.summit.faceIds));
  if (!loops.length) return "no-room";
  const roads = roadPoints(document, faces);
  const target =
    options.landing ??
    (() => {
      // Without a gate, land where the nearest road comes up to the platform.
      let best: { point: Point; distance: number } | null = null;
      for (const loop of loops)
        for (const point of loop.points)
          for (const road of roads) {
            const distance = len(sub(point, road));
            if (!best || distance < best.distance) best = { point, distance };
          }
      return best?.point ?? ([0, 0] as Point);
    })();
  const located = loops.map(loop => ({ loop, ...project(loop, target) })).sort((a, b) => a.distance - b.distance)[0];
  const { loop } = located;
  const terrain = cityTerrain(document);
  const ground = (point: Point) => terrain.heightAt(point) + terrain.datumMeters;
  const fits = siteChecker(document, faces);
  const halfWidth = RAMP_WIDTH_METERS / 2;
  const offsets = Array.from(
    { length: MAX_RUNS },
    (_, k) => halfWidth + CLEARANCE_METERS + k * (RAMP_WIDTH_METERS + RUN_GAP_METERS)
  );
  const rings = offsets.map(offset => offsetLoop(loop, offset));
  const edgePoint = atParameter(loop.points, located.u);
  const n = loop.points.length;
  const normal = loop.normals[Math.floor(((located.u % n) + n) % n)];
  const inside: Point = [edgePoint[0] - normal[0] * LANDING_METERS, edgePoint[1] - normal[1] * LANDING_METERS];
  const outside = atParameter(rings[0], located.u);
  if (platform.levelMeters - ground(outside) < MIN_RISE_METERS) return "no-rise";

  // Top down: landing, then runs along the cliff, each further out and turning back on the one above.
  const build = (direction: 1 | -1, runLimit: number) => {
    let required = (platform.levelMeters - ground(outside)) / RAMP_GRADE;
    let path: Point[] = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      path = [outside];
      let remaining = required,
        u = located.u,
        heading = direction;
      for (let run = 0; run < MAX_RUNS && remaining > 1e-6; run++) {
        if (run > 0) {
          const turn = atParameter(rings[run], u);
          remaining -= len(sub(turn, path[path.length - 1]));
          path.push(turn);
          if (remaining <= 0) break;
        }
        const leg = walk(rings[run], u, heading, Math.min(runLimit, remaining));
        path.push(...leg.points.slice(1));
        remaining -= Math.min(runLimit, remaining);
        u = leg.end;
        heading = heading > 0 ? -1 : 1;
      }
      if (remaining > 1e-6) return null;
      const foot = path[path.length - 1];
      const next = (platform.levelMeters - ground(foot)) / RAMP_GRADE;
      if (Math.abs(next - required) < 0.05) break;
      required = next;
    }
    return path;
  };

  let best: { line: Point[]; levels: number[]; score: number } | null = null;
  const perimeter = ringLength(rings[0]);
  for (const direction of [1, -1] as const)
    for (const share of [1, 0.6, 0.4, 0.3]) {
      const runLimit = Math.max(RAMP_WIDTH_METERS * 3, share * (perimeter - 4 * RAMP_WIDTH_METERS));
      const path = build(direction, runLimit);
      if (!path || path.length < 2 || !fits(path, halfWidth) || selfOverlaps(path)) continue;
      const total = polylineLength(path);
      // Deck levels fall at the ramp grade from the landing; the foot meets the ground.
      const levels: number[] = [];
      let along = 0;
      path.forEach((point, i) => {
        if (i) along += len(sub(point, path[i - 1]));
        levels.push(platform.levelMeters - (platform.levelMeters - ground(path[path.length - 1])) * (along / total));
      });
      if (!withinGrade(path, levels) || sinks(path, levels, halfWidth, ground)) continue;
      const foot = path[path.length - 1];
      let joint: Point | null = null;
      for (const road of roads) {
        const distance = len(sub(road, foot));
        if (distance <= CONNECT_METERS && (!joint || distance < len(sub(joint, foot))) && fits([foot, road], halfWidth))
          joint = road;
      }
      const line = [inside, ...path, ...(joint ? [joint] : [])];
      const deck = [platform.levelMeters, ...levels, ...(joint ? [ground(joint)] : [])];
      const score = (joint ? len(sub(joint, foot)) : CONNECT_METERS * 2) + 0.05 * total;
      if (!best || score < best.score) best = { line, levels: deck, score };
    }
  if (!best) return "no-room";
  // Stored foot first, landing last.
  return {
    kind: "ramp",
    id: options.id,
    ...(options.ownerId ? { ownerId: options.ownerId } : {}),
    platformId: platform.id,
    centerline: [...best.line].reverse(),
    elevationsMeters: [...best.levels].reverse(),
    widthMeters: RAMP_WIDTH_METERS
  };
}
