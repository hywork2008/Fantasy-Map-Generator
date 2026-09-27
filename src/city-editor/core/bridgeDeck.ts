// A bridge is drawn as a straight deck the width of the river, not as the mesh
// edge that continues to the next street vertex. The same span is used for a
// generated gc:bridge-* and for any road, including one drawn by hand, that
// passes through a river vertex.

import { featureGroupVertices } from "./features";
import { nearestOnPolyline } from "./gen/geom";
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
    const a = line[i];
    const b = line[i + 1];
    const aIn = inChannel(a, ribbons);
    const bIn = inChannel(b, ribbons);
    if (!aIn && !bIn && !segmentHitsChannel(a, b, ribbons)) {
      push(a);
      push(b);
      continue;
    }
    if (aIn && bIn) {
      flush();
      continue;
    }
    if (!aIn && bIn) {
      push(a);
      push(channelExit(a, b, ribbons));
      flush();
      continue;
    }
    if (aIn && !bIn) {
      flush();
      push(channelExit(b, a, ribbons));
      push(b);
      continue;
    }
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    push(a);
    push(channelExit(a, mid, ribbons));
    flush();
    push(channelExit(b, mid, ribbons));
    push(b);
  }
  flush();
  return runs;
}

/** One deck per river vertex a road actually spans. Mesh vertices are not moved. */
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
  return [...decks.values()];
}

function inChannel(point: Point, ribbons: readonly RiverRibbon[]): boolean {
  for (const ribbon of ribbons) {
    if (nearestOnPolyline(point, ribbon.points).dist < ribbon.width / 2 - 0.05) return true;
  }
  return false;
}

function segmentHitsChannel(a: Point, b: Point, ribbons: readonly RiverRibbon[]): boolean {
  for (const ribbon of ribbons) {
    const limit = ribbon.width / 2 - 0.05;
    for (let i = 0; i + 1 < ribbon.points.length; i++) {
      if (segmentDistance(a, b, ribbon.points[i], ribbon.points[i + 1]) < limit) return true;
    }
  }
  return false;
}

/** Last point on `outside → toward` that is still on the bank. */
function channelExit(outside: Point, toward: Point, ribbons: readonly RiverRibbon[]): Point {
  let bank = outside;
  let inside = toward;
  for (let step = 0; step < 18; step++) {
    const mid: Point = [(bank[0] + inside[0]) / 2, (bank[1] + inside[1]) / 2];
    if (inChannel(mid, ribbons)) inside = mid;
    else bank = mid;
  }
  return bank;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  );
}

function pointSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq));
  return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t));
}

function unit(x: number, y: number): Point | null {
  const length = Math.hypot(x, y);
  return length > 1e-6 ? [x / length, y / length] : null;
}

function copyPoint(point: Point): Point {
  return [point[0], point[1]];
}
