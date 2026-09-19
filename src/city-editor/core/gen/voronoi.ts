// Bounded Voronoi from a Delaunay triangulation.
//
// A decoupled, trimmed rewrite of src/generators/voronoi.ts (same repo, MIT) —
// no worldContext / viewContext / appServices coupling, so the city page imports
// nothing from the world map's module graph. `delaunator` is a plain npm dep.

import Delaunator from "delaunator";
import type { Point } from "./types";

export interface RawCell {
  /** Voronoi vertices (triangle circumcenters) around this site, in fan order. */
  polygon: Point[];
  /** Site indices of adjacent cells. */
  neighbors: number[];
  /** True for sites on the convex hull — their raw polygon is unbounded. */
  onHull: boolean;
}

/** One `RawCell` per input point, index-aligned with `points`. */
export function computeVoronoiCells(points: Point[]): RawCell[] {
  const d = Delaunator.from(points);
  const { triangles, halfedges, hull } = d;
  const hullSet = new Set<number>(hull);

  const triCount = triangles.length / 3;
  const circ: Point[] = new Array(triCount);
  for (let t = 0; t < triCount; t++) {
    circ[t] = circumcenter(points[triangles[3 * t]], points[triangles[3 * t + 1]], points[triangles[3 * t + 2]]);
  }

  // Prefer a border half-edge as the walk start so hull fans are not truncated.
  const startEdge = new Map<number, number>();
  for (let e = 0; e < triangles.length; e++) {
    const endpoint = triangles[nextHalfedge(e)];
    if (!startEdge.has(endpoint) || halfedges[e] === -1) startEdge.set(endpoint, e);
  }

  const cells: RawCell[] = points.map(() => ({ polygon: [], neighbors: [], onHull: false }));
  for (const [p, e] of startEdge) {
    const incident = edgesAroundPoint(e, halfedges);
    cells[p] = {
      polygon: incident.map(edge => circ[triangleOfEdge(edge)]),
      neighbors: incident.map(edge => triangles[edge]),
      onHull: hullSet.has(p)
    };
  }
  return cells;
}

/**
 * The Delaunay triangulation edges over `points`, as de-duplicated `[i, j]` site
 * index pairs (`i < j`). For the "2.1 Delaunay / Voronoi" grid-evolution overlay
 * (docs/city-editor/実装計画.md Phase G1) — added here in G1; not used by the
 * frozen `src/city-generator/` copy.
 */
export function computeDelaunayEdges(points: Point[]): [number, number][] {
  const { triangles } = Delaunator.from(points);
  const seen = new Set<number>();
  const edges: [number, number][] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    for (const [u, v] of [
      [t, t + 1],
      [t + 1, t + 2],
      [t + 2, t]
    ] as const) {
      const a = triangles[u];
      const b = triangles[v];
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      const key = lo * points.length + hi;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([lo, hi]);
    }
  }
  return edges;
}

const nextHalfedge = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);
const triangleOfEdge = (e: number): number => Math.floor(e / 3);

function edgesAroundPoint(start: number, halfedges: Int32Array): number[] {
  const result: number[] = [];
  let incoming = start;
  do {
    result.push(incoming);
    const outgoing = nextHalfedge(incoming);
    incoming = halfedges[outgoing];
  } while (incoming !== -1 && incoming !== start && result.length < 100);
  return result;
}

function circumcenter(a: Point, b: Point, c: Point): Point {
  const [ax, ay] = a;
  const [bx, by] = b;
  const [cx, cy] = c;
  const ad = ax * ax + ay * ay;
  const bd = bx * bx + by * by;
  const cd = cx * cx + cy * cy;
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-12) return [(ax + bx + cx) / 3, (ay + by + cy) / 3];
  return [
    (1 / D) * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)),
    (1 / D) * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax))
  ];
}
