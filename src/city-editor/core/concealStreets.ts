import { circuitRing } from "./fortifications";
// Stage ⑩ view geometry. The document keeps every road and lane; the town
// drawing drops the stretches that sit inside the outer wall, and the block
// lanes are omitted entirely by the renderer.

import { featureGroupVertices } from "./features";
import {
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  segmentInteriorInPolygon,
  segmentSegmentHit
} from "./gen/geom";
import type { CityDocument, Point } from "./types";

const SAME_POINT_METERS = 0.05;

/** Join wall runs into the outer curtain and return that ring. Null when the
 * town has no wall. A coastal gap is closed with a chord; a river gap is
 * bridged only when the open ends sit within `maxGapMeters`. */
export function outerWallRing(document: CityDocument): Point[] | null {
  if (document.defenseCircuits) {
    const town = document.defenseCircuits.find(c => c.scope === "town");
    return town ? circuitRing(document, town) : null;
  }
  const lines: Point[][] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "wall") continue;
    const ids = featureGroupVertices(document, group);
    const points = ids.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
    if (points.length >= 2) lines.push(points);
  }
  if (!lines.length) return null;
  const plaza = document.elements.find(element => element.kind === "plaza" && element.point)?.point;
  const center = plaza ?? polygonCentroid(lines.flatMap(line => line));
  const maxGap = Math.max(60, document.frame.blockSizeMeters * 4);
  return outerWallRingFromPolylines(lines, center, maxGap);
}

/** Largest wall ring that contains `center`. Closed runs stay closed; open
 * runs are stitched at shared endpoints, then across short gaps. */
export function outerWallRingFromPolylines(lines: Point[][], center: Point, maxGapMeters: number): Point[] | null {
  const closed: Point[][] = [];
  const open: Point[][] = [];
  for (const line of lines) {
    const copy = line.map(copyPoint);
    if (copy.length < 2) continue;
    if (isClosed(copy)) closed.push(copy);
    else open.push(copy);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < open.length && !changed; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const joined = joinTouching(open[i], open[j]);
        if (!joined) continue;
        open.splice(j, 1);
        open.splice(i, 1);
        if (isClosed(joined)) closed.push(joined);
        else open.push(joined);
        changed = true;
        break;
      }
    }
  }

  while (open.length >= 2) {
    const pair = closestEnds(open);
    if (!pair || pair.dist > maxGapMeters) break;
    const joined = joinOriented(open[pair.i], pair.iAtEnd, open[pair.j], pair.jAtStart);
    const next = open.filter((_, index) => index !== pair.i && index !== pair.j);
    if (isClosed(joined)) closed.push(joined);
    else next.push(joined);
    open.length = 0;
    open.push(...next);
  }

  for (const chain of open) closed.push(closeRing(chain));

  const rings = closed.filter(ring => ring.length >= 3 && Math.abs(polygonArea(ring)) > 1);
  if (!rings.length) return null;
  const containing = rings.filter(ring => pointInPolygon(center, ring));
  const pool = containing.length ? containing : rings;
  pool.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return pool[0];
}

/** Parts of `line` that lie outside `poly`. A vertex on the curtain stays, so
 * an approach road still meets its gate. A street that never leaves the wall
 * disappears. */
export function clipPolylineToExterior(line: Point[], poly: Point[]): Point[][] {
  if (line.length < 2) return [];
  if (poly.length < 3) return [line.map(copyPoint)];
  const ring = isClosed(poly) ? poly : closeRing(poly);
  const outside = (point: Point): boolean => {
    if (nearestOnPolyline(point, ring).dist <= SAME_POINT_METERS) return true;
    return !pointInPolygon(point, poly);
  };

  const runs: Point[][] = [];
  let current: Point[] = [];
  const push = (point: Point) => {
    const last = current[current.length - 1];
    if (!last || Math.hypot(last[0] - point[0], last[1] - point[1]) > 1e-4) current.push(copyPoint(point));
  };
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const aOut = outside(a);
    const bOut = outside(b);
    if (aOut && bOut) {
      if (!segmentInteriorInPolygon(a, b, poly)) {
        push(a);
        push(b);
        continue;
      }
      const hits = segmentRingHits(a, b, ring);
      push(a);
      if (hits[0]) push(hits[0]);
      flush();
      if (hits.length >= 2) {
        push(hits[hits.length - 1]);
        push(b);
      }
      continue;
    }
    if (!aOut && !bOut) {
      flush();
      continue;
    }
    const hit = segmentRingHits(a, b, ring)[0];
    if (aOut) {
      push(a);
      if (hit) push(hit);
      flush();
    } else {
      flush();
      if (hit) push(hit);
      push(b);
    }
  }
  flush();
  return runs;
}

function segmentRingHits(a: Point, b: Point, ring: Point[]): Point[] {
  const hits: { point: Point; t: number }[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const hit = segmentSegmentHit(a, b, ring[i], ring[i + 1]);
    if (!hit) continue;
    if (hits.some(other => Math.hypot(other.point[0] - hit.point[0], other.point[1] - hit.point[1]) < 1e-4)) continue;
    hits.push(hit);
  }
  hits.sort((p, q) => p.t - q.t);
  return hits.map(hit => hit.point);
}

function joinTouching(a: Point[], b: Point[]): Point[] | null {
  if (same(a[a.length - 1], b[0])) return appendChain(a, b);
  if (same(a[a.length - 1], b[b.length - 1])) return appendChain(a, [...b].reverse());
  if (same(a[0], b[0])) return appendChain([...a].reverse(), b);
  if (same(a[0], b[b.length - 1])) return appendChain(b, a);
  return null;
}

function joinOriented(a: Point[], aAtEnd: boolean, b: Point[], bAtStart: boolean): Point[] {
  const left = aAtEnd ? a : [...a].reverse();
  const right = bAtStart ? b : [...b].reverse();
  return appendChain(left, right);
}

function closestEnds(
  chains: Point[][]
): { i: number; j: number; iAtEnd: boolean; jAtStart: boolean; dist: number } | null {
  let best: { i: number; j: number; iAtEnd: boolean; jAtStart: boolean; dist: number } | null = null;
  for (let i = 0; i < chains.length; i++) {
    for (let j = i + 1; j < chains.length; j++) {
      const endsI = [chains[i][0], chains[i][chains[i].length - 1]];
      const endsJ = [chains[j][0], chains[j][chains[j].length - 1]];
      for (let ii = 0; ii < 2; ii++) {
        for (let jj = 0; jj < 2; jj++) {
          const dist = Math.hypot(endsI[ii][0] - endsJ[jj][0], endsI[ii][1] - endsJ[jj][1]);
          if (best && dist >= best.dist) continue;
          // Orient so chain i contributes its chosen end and chain j contributes its chosen start.
          best = { i, j, iAtEnd: ii === 1, jAtStart: jj === 0, dist };
        }
      }
    }
  }
  return best;
}

function appendChain(base: Point[], extra: Point[]): Point[] {
  const out = base.map(copyPoint);
  for (const point of extra) {
    const last = out[out.length - 1];
    if (!last || !same(last, point)) out.push(copyPoint(point));
  }
  return out;
}

function closeRing(line: Point[]): Point[] {
  const ring = line.map(copyPoint);
  if (!isClosed(ring)) ring.push(copyPoint(ring[0]));
  return ring;
}

function isClosed(line: Point[]): boolean {
  return line.length >= 4 && same(line[0], line[line.length - 1]);
}

function same(a: Point, b: Point): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= SAME_POINT_METERS;
}

function copyPoint(point: Point): Point {
  return [point[0], point[1]];
}
