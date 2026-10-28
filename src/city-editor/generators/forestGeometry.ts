import type { ForestRegion } from "../types/contracts/forest";
import type { Id, Point } from "../types/document";
import { pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { bounds, PlotIndex } from "./parcelGeometry";

const EPSILON = 1e-5;
const key = (p: Point) => `${Math.round(p[0] / EPSILON)},${Math.round(p[1] / EPSILON)}`;
const snap = (p: Point): Point => [Math.round(p[0] / EPSILON) * EPSILON, Math.round(p[1] / EPSILON) * EPSILON];
export interface ForestPart {
  faceId: Id;
  polygon: Point[];
}

export function forestContains(region: ForestRegion, point: Point): boolean {
  const [x, y] = point,
    b = region.bounds;
  return (
    x >= b[0] &&
    y >= b[1] &&
    x <= b[2] &&
    y <= b[3] &&
    pointInPolygon(point, region.outer) &&
    !region.holes.some(hole => pointInPolygon(point, hole))
  );
}

function canonical(ring: Point[]): Point[] {
  ring = ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length],
      b = ring[(i + 1) % ring.length];
    return (
      Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) >
      EPSILON * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))
    );
  });
  let first = 0;
  ring.forEach((p, i) => {
    if (p[0] < ring[first][0] || (p[0] === ring[first][0] && p[1] < ring[first][1])) first = i;
  });
  return [...ring.slice(first), ...ring.slice(0, first)];
}

/** Dissolves disjoint convex pieces, splitting T junctions before cancelling shared edges. */
export function forestRegions(parts: ForestPart[]): ForestRegion[] {
  const vertices = new Map<string, Point>();
  const polygons = parts.map(part => {
    let polygon = part.polygon.map(p => {
      const point = snap(p),
        id = key(point);
      if (!vertices.has(id)) vertices.set(id, point);
      return vertices.get(id)!;
    });
    // geom.polygonArea has the opposite sign to the usual shoelace convention.
    if (polygonArea(polygon) > 0) polygon = polygon.reverse();
    return polygon;
  });
  const index = new PlotIndex<Point>(32);
  for (const point of vertices.values()) index.add(point, [point[0], point[1], point[0], point[1]]);
  const edges = new Map<string, { a: Point; b: Point }>();
  for (const polygon of polygons)
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length2 = dx * dx + dy * dy;
      if (length2 < EPSILON * EPSILON) continue;
      const box = bounds([a, b]);
      const splits = index
        .query([box[0] - EPSILON, box[1] - EPSILON, box[2] + EPSILON, box[3] + EPSILON])
        .map(point => ({ point, t: ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2 }))
        .filter(
          ({ point, t }) =>
            t >= -1e-9 &&
            t <= 1 + 1e-9 &&
            Math.abs((point[0] - a[0]) * dy - (point[1] - a[1]) * dx) <= EPSILON * Math.sqrt(length2)
        )
        .sort((x, y) => x.t - y.t);
      for (let j = 1; j < splits.length; j++) {
        const p = splits[j - 1].point,
          q = splits[j].point;
        if (key(p) === key(q)) continue;
        const forward = `${key(p)}>${key(q)}`,
          reverse = `${key(q)}>${key(p)}`;
        if (edges.has(reverse)) edges.delete(reverse);
        else edges.set(forward, { a: p, b: q });
      }
    }
  const outgoing = new Map<string, string[]>();
  for (const [id, edge] of edges) {
    const list = outgoing.get(key(edge.a)) ?? [];
    list.push(id);
    outgoing.set(key(edge.a), list);
  }
  const rings: Point[][] = [];
  for (const first of [...edges.keys()].sort()) {
    const initial = edges.get(first);
    if (!initial) continue;
    const ring: Point[] = [];
    let id = first;
    while (true) {
      const edge = edges.get(id);
      if (!edge) throw new Error("Forest boundary is not closed");
      ring.push(edge.a);
      edges.delete(id);
      if (key(edge.b) === key(initial.a)) break;
      const next = (outgoing.get(key(edge.b)) ?? []).filter(candidate => edges.has(candidate));
      const angle = (candidate: string) => {
        const c = edges.get(candidate)!.b;
        const x = edge.b[0] - edge.a[0],
          y = edge.b[1] - edge.a[1];
        const u = c[0] - edge.b[0],
          v = c[1] - edge.b[1];
        return Math.atan2(x * v - y * u, x * u + y * v);
      };
      next.sort((a, b) => angle(b) - angle(a) || a.localeCompare(b));
      if (!next.length) throw new Error("Forest boundary is not closed");
      id = next[0];
    }
    const cleaned = canonical(ring);
    if (cleaned.length >= 3 && Math.abs(polygonArea(cleaned)) > 0.001) rings.push(cleaned);
  }
  const outers = rings.filter(ring => polygonArea(ring) < 0);
  const holes = rings.filter(ring => polygonArea(ring) > 0);
  return outers
    .map(outer => {
      const insideHoles = holes.filter(
        hole =>
          pointInPolygon(hole[0], outer) &&
          !outers.some(
            other =>
              other !== outer &&
              Math.abs(polygonArea(other)) < Math.abs(polygonArea(outer)) &&
              pointInPolygon(hole[0], other)
          )
      );
      const contains = (p: Point) => pointInPolygon(p, outer) && !insideHoles.some(hole => pointInPolygon(p, hole));
      const sourceFaceIds = [
        ...new Set(parts.filter(part => contains(polygonCentroid(part.polygon))).map(part => part.faceId))
      ].sort();
      let hash = 0x811c9dc5;
      for (const c of JSON.stringify(outer)) hash = Math.imul(hash ^ c.charCodeAt(0), 0x01000193);
      return {
        id: `forest-${(hash >>> 0).toString(36)}`,
        outer,
        holes: insideHoles.sort((a, b) => key(a[0]).localeCompare(key(b[0]))),
        sourceFaceIds,
        areaM2: Math.abs(polygonArea(outer)) - insideHoles.reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0),
        bounds: bounds(outer)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
