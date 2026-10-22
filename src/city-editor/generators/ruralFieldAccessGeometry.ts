import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea, polygonCentroid } from "./geom";
import { clipHalfPlane } from "./lotGeometry";
import { bounds, intersectConvex } from "./parcelGeometry";

import { straightenRuralMargins } from "./ruralFieldMargins";

type AccessNode = { x: number; y: number };
const signature = (p: Point) => p.map(n => Math.round(n * 1e6)).join(":");

/** Clip a convex envelope to the proved reachable cells. Internal cell edges
 * cancel exactly, leaving straight envelope edges and the safe outer margin.
 * An optional clearance callback recovers straight, checked outer margins. */
export function clipRuralAccess(
  polygon: Point[],
  nodes: Map<string, AccessNode>,
  q: number,
  clear?: (polygon: Point[]) => boolean,
  depth = 0
): Point[][] {
  if (polygon.length < 3) return [];
  const box = bounds(polygon);
  const edges = new Map<string, { a: Point; b: Point }>();
  for (let y = Math.floor(box[1] / q); y < Math.ceil(box[3] / q); y++)
    for (let x = Math.floor(box[0] / q); x < Math.ceil(box[2] / q); x++) {
      if (!nodes.has(`${x}:${y}`)) continue;
      const cell: Point[] = [
        [x * q, y * q],
        [(x + 1) * q, y * q],
        [(x + 1) * q, (y + 1) * q],
        [x * q, (y + 1) * q]
      ];
      const part = intersectConvex(cell, polygon);
      if (Math.abs(polygonArea(part)) < 1e-7) continue;
      part.forEach((a, i) => {
        const b = part[(i + 1) % part.length],
          from = signature(a),
          to = signature(b);
        if (from === to) return;
        if (!edges.delete(`${to}|${from}`)) edges.set(`${from}|${to}`, { a, b });
      });
    }
  const graph = new Map<string, { a: Point; b: Point }[]>();
  for (const edge of edges.values()) {
    const id = signature(edge.a);
    graph.set(id, [...(graph.get(id) ?? []), edge]);
  }
  const rings: Point[][] = [];
  while (graph.size) {
    let edge = graph.values().next().value![0];
    const start = signature(edge.a),
      ring: Point[] = [];
    let closed = false;
    for (let guard = 0; guard <= edges.size; guard++) {
      ring.push(edge.a);
      const id = signature(edge.a),
        rest = graph.get(id)!.filter(next => next !== edge);
      if (rest.length) graph.set(id, rest);
      else graph.delete(id);
      const end = signature(edge.b);
      if (end === start) {
        closed = true;
        break;
      }
      const next = graph.get(end);
      if (!next) break;
      const dx = edge.b[0] - edge.a[0],
        dy = edge.b[1] - edge.a[1];
      const turn = (e: typeof edge) =>
        Math.atan2(dx * (e.b[1] - e.a[1]) - dy * (e.b[0] - e.a[0]), dx * (e.b[0] - e.a[0]) + dy * (e.b[1] - e.a[1]));
      edge = [...next].sort((a, b) => turn(b) - turn(a))[0];
    }
    if (!closed) continue;
    const simplified = ring.filter((b, i) => {
      const a = ring[(i + ring.length - 1) % ring.length],
        c = ring[(i + 1) % ring.length];
      return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-7;
    });
    if (simplified.length >= 3) rings.push(simplified);
  }
  // FarmPlot has one ring. Split envelopes containing holes instead of filling
  // an inaccessible island or inventing a bridge across it.
  const hole = rings.find(ring => polygonArea(ring) > 0);
  if (hole) {
    if (depth >= 16) return [];
    const y = polygonCentroid(hole)[1];
    return [clipHalfPlane(polygon, [0, 1], y), clipHalfPlane(polygon, [0, -1], -y)].flatMap(part =>
      clipRuralAccess(part, nodes, q, clear, depth + 1)
    );
  }
  const valid = rings.filter(ring => isSimplePolygon(ring, 150));
  return clear ? straightenRuralMargins(valid, polygon, q, clear) : valid;
}
