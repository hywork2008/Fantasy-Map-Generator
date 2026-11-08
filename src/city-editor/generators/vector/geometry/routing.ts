import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { pointInPolygon, polygonArea, segmentsIntersect } from "../../geom";
import { vectorOccupiedSites } from "../occupancy";
import { samplePath, simplifyFreehand } from "./sampling";
import { pathSurface, simpleContour } from "./surfaces";

type Boundary = { minX: number; minY: number; maxX: number; maxY: number; a: Point; b: Point };
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function edge(a: Point, b: Point): Boundary {
  return {
    a,
    b,
    minX: Math.min(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxY: Math.max(a[1], b[1])
  };
}
export function boundaryIndex(rings: Point[][]): RBush<Boundary> {
  const tree = new RBush<Boundary>();
  tree.load(rings.flatMap(r => r.map((a, i) => edge(a, r[(i + 1) % r.length]))));
  return tree;
}
function indexedInside(ring: Point[]): (point: Point) => boolean {
  const tree = boundaryIndex([ring]);
  return p => {
    let inside = false;
    for (const edge of tree.search({ minX: p[0], maxX: Infinity, minY: p[1], maxY: p[1] })) {
      const a = edge.a,
        b = edge.b;
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0])
        inside = !inside;
    }
    return inside;
  };
}
export function ringInside(inner: Point[], outer: Point[]): boolean {
  if (!pointInPolygon(inner[0], outer)) return false;
  const tree = boundaryIndex([outer]);
  return inner.every(
    (a, i) =>
      !tree
        .search(edge(a, inner[(i + 1) % inner.length]))
        .some(b => segmentsIntersect(a, inner[(i + 1) % inner.length], b.a, b.b))
  );
}
/** Signed physical offset; positive expands. Concave split/vanishing results are rejected. */
export function offsetRing(ring: Point[], meters: number): Point[] {
  const sign = polygonArea(ring) < 0 ? 1 : -1;
  const result = ring.map((p, i): Point => {
    const a = ring[(i + ring.length - 1) % ring.length],
      b = ring[(i + 1) % ring.length],
      u: Point = [p[0] - a[0], p[1] - a[1]],
      v: Point = [b[0] - p[0], b[1] - p[1]];
    const ul = Math.hypot(...u),
      vl = Math.hypot(...v);
    u[0] /= ul;
    u[1] /= ul;
    v[0] /= vl;
    v[1] /= vl;
    const n: Point = [sign * u[1], -sign * u[0]],
      m: Point = [sign * v[1], -sign * v[0]],
      den = 1 + n[0] * m[0] + n[1] * m[1];
    if (den < 1e-5) throw new Error("offset-split");
    return [p[0] + ((n[0] + m[0]) * meters) / den, p[1] + ((n[1] + m[1]) * meters) / den];
  });
  if (!simpleContour(result, true) || Math.sign(polygonArea(result)) !== Math.sign(polygonArea(ring)))
    throw new Error("offset-split");
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    if (
      (result[j][0] - result[i][0]) * (ring[j][0] - ring[i][0]) +
        (result[j][1] - result[i][1]) * (ring[j][1] - ring[i][1]) <=
      0
    )
      throw new Error("offset-split");
  }
  return result;
}
export function compactRing(ring: Point[], tolerance = 0.02): Point[] {
  const points = simplifyFreehand([...ring, ring[0]], tolerance);
  points.pop();
  if (points.length < 3) throw new Error("offset-split");
  return points;
}
const pointLineDistance = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    den = dx * dx + dy * dy,
    t = den ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const segmentDistance = (a: Point, b: Point, c: Point, d: Point) =>
  segmentsIntersect(a, b, c, d)
    ? 0
    : Math.min(
        pointLineDistance(a, c, d),
        pointLineDistance(b, c, d),
        pointLineDistance(c, a, b),
        pointLineDistance(d, a, b)
      );

/** Visibility graph of obstacle corners only: no Voronoi, hexes or spatial cells. */
export function wallGapRoute(
  document: VectorCityDocument,
  outerId: string,
  innerId: string,
  start: Point,
  end: Point,
  width: number,
  clearance: number
): Point[] {
  if (!(width > 0 && clearance >= 0 && Number.isFinite(width + clearance))) throw new Error("invalid-dimensions");
  const outerCircuit = document.connections.circuits[outerId],
    innerCircuit = document.connections.circuits[innerId];
  if (!outerCircuit || !innerCircuit || innerCircuit.parentCircuitId !== outerId)
    throw new Error("circuit-containment");
  const outer = pathSurface(document.paths[outerCircuit.pathId]).holes[0],
    inner = pathSurface(document.paths[innerCircuit.pathId]).outer;
  const obstacles = [
    inner,
    ...Object.values(document.paths)
      .filter(
        p => p.role === "river" || (p.role === "wall" && p.id !== outerCircuit.pathId && p.id !== innerCircuit.pathId)
      )
      .map(p => pathSurface(p).outer),
    ...Object.values(document.regions)
      .filter(r => r.kind === "reservation")
      .map(r => r.outer),
    ...vectorOccupiedSites(document, "site").map(p => p.outer)
  ];
  const radius = width / 2 + clearance + 0.011,
    tree = boundaryIndex([outer, ...obstacles]);
  const inOuter = indexedInside(outer),
    inObstacles = obstacles.map(indexedInside);
  const free = (p: Point) => inOuter(p) && !inObstacles.some(test => test(p));
  const visible = (a: Point, b: Point) => {
    if (!free(a) || !free(b) || !free([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return false;
    const box = edge(a, b);
    box.minX -= radius;
    box.minY -= radius;
    box.maxX += radius;
    box.maxY += radius;
    return !tree.search(box).some(e => segmentDistance(a, b, e.a, e.b) < radius - 1e-8);
  };
  if (!visible(start, start) || !visible(end, end)) throw new Error("road-clearance");
  if (visible(start, end)) return [start, end];
  const candidates = [
    start,
    end,
    ...offsetRing(compactRing(outer), -radius - 0.03),
    ...obstacles.flatMap(r => offsetRing(compactRing(r), radius + 0.03))
  ].filter((p, i) => i < 2 || visible(p, p));
  if (candidates.length > 600) throw new Error("route-budget");
  const costs = candidates.map(() => Infinity),
    previous = candidates.map(() => -1),
    done = new Set<number>();
  costs[0] = 0;
  for (let iteration = 0; iteration < candidates.length; iteration++) {
    let current = -1;
    for (let i = 0; i < candidates.length; i++)
      if (!done.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current === 1) break;
    done.add(current);
    for (let i = 0; i < candidates.length; i++)
      if (!done.has(i) && i !== current) {
        const cost = costs[current] + dist(candidates[current], candidates[i]);
        if (cost < costs[i] && visible(candidates[current], candidates[i])) {
          costs[i] = cost;
          previous[i] = current;
        }
      }
  }
  if (!Number.isFinite(costs[1])) throw new Error("road-clearance");
  const result: Point[] = [];
  for (let i = 1; i >= 0; i = previous[i]) {
    result.push(candidates[i]);
    if (i === 0) break;
  }
  return result.reverse();
}
export function sampledClosedRing(document: VectorCityDocument, pathId: string): Point[] {
  const points = samplePath(document.paths[pathId])
    .map(s => s.point)
    .filter((p, i, all) => i === 0 || dist(p, all[i - 1]) > 1e-8);
  if (dist(points[0], points.at(-1)!) < 1e-6) points.pop();
  return compactRing(points, 0.005);
}

/** Validate the whole road polygon, including joins, after every subsequent edit and import. */
export function verifyWallGapSurface(
  document: VectorCityDocument,
  outerId: string,
  innerId: string,
  surface: { outer: Point[] },
  clearance: number
): void {
  const outerCircuit = document.connections.circuits[outerId],
    innerCircuit = document.connections.circuits[innerId];
  if (!outerCircuit || !innerCircuit || innerCircuit.parentCircuitId !== outerId)
    throw new Error("circuit-containment");
  const outside = pathSurface(document.paths[outerCircuit.pathId]).holes[0],
    inside = pathSurface(document.paths[innerCircuit.pathId]).outer;
  if (
    !outside ||
    !ringInside(surface.outer, outside) ||
    pointInPolygon(surface.outer[0], inside) ||
    ringInside(inside, surface.outer)
  )
    throw new Error("road-clearance");
  const obstacles = [
    inside,
    ...Object.values(document.paths)
      .filter(
        p => p.role === "river" || (p.role === "wall" && p.id !== outerCircuit.pathId && p.id !== innerCircuit.pathId)
      )
      .map(p => pathSurface(p).outer),
    ...Object.values(document.regions)
      .filter(r => r.kind === "reservation")
      .map(r => r.outer),
    ...vectorOccupiedSites(document, "site").map(p => p.outer)
  ];
  for (const obstacle of obstacles)
    if (pointInPolygon(surface.outer[0], obstacle) || pointInPolygon(obstacle[0], surface.outer))
      throw new Error("road-clearance");
  const tree = boundaryIndex([outside, ...obstacles]),
    margin = clearance + 0.005;
  for (let i = 0; i < surface.outer.length; i++) {
    const a = surface.outer[i],
      b = surface.outer[(i + 1) % surface.outer.length],
      box = edge(a, b);
    box.minX -= margin;
    box.minY -= margin;
    box.maxX += margin;
    box.maxY += margin;
    if (tree.search(box).some(e => segmentDistance(a, b, e.a, e.b) < margin - 1e-8)) throw new Error("road-clearance");
  }
}
