// A bridge is drawn as a straight deck the width of the river, not as the mesh
// edge that continues to the next street vertex. The same span is used for a
// generated gc:bridge-* and for any road, including one drawn by hand, that
// passes through a river vertex.

import { featureGroupVertices } from "./features";
import { nearestOnPolyline, segmentSegmentHit } from "./gen/geom";
import type { CityDocument, Id, Point } from "./types";

/** Extra length so the square ends of the deck sit on both banks. */
export const BRIDGE_BANK_SEAT = 1.4;

export interface RiverRibbon {
  points: Point[];
  width: number;
}

export interface BridgeDeck {
  /** Road group that owns the crossing. A generated bridge id wins over the through-road. */
  groupId: Id;
  name: string;
  points: [Point, Point];
  widthMeters: number;
}

export function riverRibbons(document: CityDocument): RiverRibbon[] {
  const ribbons: RiverRibbon[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "river" || group.vertices.length < 2) continue;
    const points = group.vertices.flatMap(id => {
      const point = document.mesh.vertices[id]?.point;
      return point ? [point] : [];
    });
    if (points.length >= 2) ribbons.push({ points, width: Math.max(1, group.style.widthMeters) });
  }
  return ribbons;
}

/** Drop the part of a road that runs inside a river channel. The cut is the bank. */
export function clipPolylineOutsideRivers(line: Point[], ribbons: readonly RiverRibbon[]): Point[][] {
  if (line.length < 2 || ribbons.length === 0) return line.length >= 2 ? [line.map(copyPoint)] : [];
  const runs: Point[][] = [];
  let current: Point[] = [];
  const push = (point: Point) => {
    const last = current[current.length - 1];
    if (!last || Math.hypot(last[0] - point[0], last[1] - point[1]) > 1e-3) current.push(copyPoint(point));
  };
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i],
      b = line[i + 1];
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let cursor = 0;
    for (const [start, end] of channelIntervals(a, b, ribbons)) {
      if (start > cursor + 1e-9) {
        push(at(cursor));
        push(at(start));
      }
      flush();
      cursor = end;
    }
    if (cursor < 1 - 1e-9) {
      push(at(cursor));
      push(b);
    }
  }
  flush();
  return runs;
}

/** Keep same-bank roads continuous when smoothing has cut a corner into the
 * drawn river ribbon. True crossings remain separate runs for bridge decks. */
export function roadRunsOutsideRivers(line: Point[], ribbons: readonly RiverRibbon[], roadWidth: number): Point[][] {
  const runs = clipPolylineOutsideRivers(line, ribbons);
  const result: Point[][] = [];
  for (const run of runs) {
    const previous = result.at(-1);
    if (!previous) {
      result.push(run);
      continue;
    }
    const a = previous.at(-1)!,
      b = run[0];
    if (crossesRiverCenterline(a, b, ribbons)) {
      result.push(run);
      continue;
    }
    const detour: Point[] = [a, b];
    let valid = false;
    for (let pass = 0; pass < 64; pass++) {
      const index = detour.slice(1).findIndex((q, i) => channelIntervals(detour[i], q, ribbons).length > 0);
      if (index < 0) {
        valid = true;
        break;
      }
      const p = detour[index],
        q = detour[index + 1];
      const [start, end] = channelIntervals(p, q, ribbons)[0];
      const t = (start + end) / 2;
      const mid: Point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      const closest = ribbons
        .map(ribbon => ({ ribbon, hit: nearestOnPolyline(mid, ribbon.points) }))
        .sort((x, y) => x.hit.dist - x.ribbon.width / 2 - (y.hit.dist - y.ribbon.width / 2))[0];
      const { hit, ribbon } = closest;
      const direction = unit(mid[0] - hit.point[0], mid[1] - hit.point[1]);
      if (!direction) break;
      const radius = ribbon.width / 2 + roadWidth / 2 + BRIDGE_BANK_SEAT / 2;
      const waypoint: Point = [hit.point[0] + direction[0] * radius, hit.point[1] + direction[1] * radius];
      if (crossesRiverCenterline(p, waypoint, ribbons) || crossesRiverCenterline(waypoint, q, ribbons)) break;
      detour.splice(index + 1, 0, waypoint);
    }
    if (valid) previous.push(...detour.slice(1), ...run.slice(1));
    else result.push(run);
  }
  return result;
}

function crossesRiverCenterline(a: Point, b: Point, ribbons: readonly RiverRibbon[]): boolean {
  return ribbons.some(ribbon => ribbon.points.slice(1).some((q, j) => segmentSegmentHit(a, b, ribbon.points[j], q)));
}

/** Perpendicular decks at mesh crossings, plus bank-to-bank decks for geometric
 * crossings between vertices. Mesh vertices are not moved. */
export function bridgeDecks(document: CityDocument): BridgeDeck[] {
  const rivers = new Map<Id, { tangent: Point; width: number }>();
  for (const group of document.featureGroups) {
    if (group.kind !== "river") continue;
    const width = Math.max(1, group.style.widthMeters);
    for (let index = 0; index < group.vertices.length; index++) {
      const id = group.vertices[index];
      const mid = document.mesh.vertices[id]?.point;
      if (!mid || rivers.has(id)) continue;
      const prev = index > 0 ? document.mesh.vertices[group.vertices[index - 1]]?.point : null;
      const next = index + 1 < group.vertices.length ? document.mesh.vertices[group.vertices[index + 1]]?.point : null;
      let tx = 0;
      let ty = 0;
      if (prev) {
        const toward = unit(mid[0] - prev[0], mid[1] - prev[1]);
        if (toward) {
          tx += toward[0];
          ty += toward[1];
        }
      }
      if (next) {
        const toward = unit(next[0] - mid[0], next[1] - mid[1]);
        if (toward) {
          tx += toward[0];
          ty += toward[1];
        }
      }
      const length = Math.hypot(tx, ty);
      if (length < 1e-6) continue;
      rivers.set(id, { tangent: [tx / length, ty / length], width });
    }
  }
  if (rivers.size === 0) return [];

  const decks = new Map<Id, BridgeDeck>();
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    const ids = featureGroupVertices(document, group);
    for (let index = 1; index + 1 < ids.length; index++) {
      const frame = rivers.get(ids[index]);
      const origin = document.mesh.vertices[ids[index]]?.point;
      const before = document.mesh.vertices[ids[index - 1]]?.point;
      const after = document.mesh.vertices[ids[index + 1]]?.point;
      if (!frame || !origin || !before || !after) continue;
      const normal: Point = [-frame.tangent[1], frame.tangent[0]];
      const across = (point: Point) => (point[0] - origin[0]) * normal[0] + (point[1] - origin[1]) * normal[1];
      if (across(before) * across(after) >= 0) continue;
      const half = (frame.width + BRIDGE_BANK_SEAT) / 2;
      const points: [Point, Point] = [
        [origin[0] - normal[0] * half, origin[1] - normal[1] * half],
        [origin[0] + normal[0] * half, origin[1] + normal[1] * half]
      ];
      const previous = decks.get(ids[index]);
      const keepBridge = previous?.groupId.startsWith("gc:bridge-") && !group.id.startsWith("gc:bridge-");
      decks.set(ids[index], {
        groupId: keepBridge && previous ? previous.groupId : group.id,
        name: keepBridge && previous ? previous.name : group.name,
        points,
        widthMeters: Math.max(previous?.widthMeters ?? 0, group.style.widthMeters)
      });
    }
  }
  const result = [...decks.values()];
  const ribbons = riverRibbons(document);
  // Roads can cross between mesh vertices, or use a bent/shared river span.
  // Connect every genuine bank-to-bank gap, including crossings the vertex
  // detector above cannot represent. Grazing a bank never creates a bridge.
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || group.id.startsWith("gc:bridge-")) continue;
    const points = featureGroupVertices(document, group).map(id => document.mesh.vertices[id].point);
    const runs = clipPolylineOutsideRivers(points, ribbons);
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1].at(-1)!,
        b = runs[i][0];
      if (!crossesRiverCenterline(a, b, ribbons)) continue;
      if (result.some(deck => [a, b].every(p => nearestOnPolyline(p, deck.points).dist < group.style.widthMeters / 2)))
        continue;
      const direction = unit(b[0] - a[0], b[1] - a[1]);
      if (!direction) continue;
      const seat = BRIDGE_BANK_SEAT / 2;
      result.push({
        groupId: group.id,
        name: group.name,
        widthMeters: group.style.widthMeters,
        points: [
          [a[0] - direction[0] * seat, a[1] - direction[1] * seat],
          [b[0] + direction[0] * seat, b[1] + direction[1] * seat]
        ]
      });
    }
  }
  return result;
}

/** Intersect a road segment with the union of river capsules (strip plus
 * round end caps). No midpoint assumption: narrow or multiple crossings and
 * bends are clipped at their actual banks. */
function channelIntervals(a: Point, b: Point, ribbons: readonly RiverRibbon[]): [number, number][] {
  const intervals: [number, number][] = [];
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const add = (lo: number, hi: number) => {
    lo = Math.max(0, lo);
    hi = Math.min(1, hi);
    if (hi > lo + 1e-10) intervals.push([lo, hi]);
  };
  const range = (value: number, delta: number, lo: number, hi: number): [number, number] => {
    if (Math.abs(delta) < 1e-12) return value >= lo && value <= hi ? [0, 1] : [1, 0];
    const t0 = (lo - value) / delta,
      t1 = (hi - value) / delta;
    return [Math.min(t0, t1), Math.max(t0, t1)];
  };
  for (const ribbon of ribbons) {
    const radius = ribbon.width / 2;
    for (const p of ribbon.points) {
      const x = a[0] - p[0],
        y = a[1] - p[1];
      if (lengthSq < 1e-12) {
        if (x * x + y * y < radius * radius) add(0, 1);
        continue;
      }
      const dot = x * dx + y * dy;
      const disc = dot * dot - lengthSq * (x * x + y * y - radius * radius);
      if (disc > 0) add((-dot - Math.sqrt(disc)) / lengthSq, (-dot + Math.sqrt(disc)) / lengthSq);
    }
    for (let i = 1; i < ribbon.points.length; i++) {
      const p = ribbon.points[i - 1],
        q = ribbon.points[i];
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (length < 1e-9) continue;
      const ux = (q[0] - p[0]) / length,
        uy = (q[1] - p[1]) / length;
      const x = a[0] - p[0],
        y = a[1] - p[1];
      const along = range(x * ux + y * uy, dx * ux + dy * uy, 0, length);
      const across = range(-x * uy + y * ux, -dx * uy + dy * ux, -radius, radius);
      add(Math.max(along[0], across[0]), Math.min(along[1], across[1]));
    }
  }
  intervals.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

function unit(x: number, y: number): Point | null {
  const length = Math.hypot(x, y);
  return length > 1e-6 ? [x / length, y / length] : null;
}

function copyPoint(point: Point): Point {
  return [point[0], point[1]];
}
