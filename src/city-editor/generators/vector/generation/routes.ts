import type { Point } from "../../../types/primitives";
import { segmentDistance } from "../geometry/network";
import { indexedContains, type VectorPolygon } from "../geometry/regions";
import { boundaryIndex, compactRing, offsetRing } from "../geometry/routing";
export interface RouteLink {
  from: Point;
  to: Point;
  cost: number;
  pathId: string;
}
export interface RouteEdge {
  a: number;
  b: number;
  pathId?: string;
}
/** Navigation vertices come from actual boundaries and ports, never a generated cell lattice. */
export function skeletonRoutes(regions: VectorPolygon[], ports: Point[], links: RouteLink[], radius: number) {
  const inside = indexedContains(regions),
    rings = regions.flatMap(r => [r.outer, ...r.holes]),
    tree = boundaryIndex(rings);
  const visible = (a: Point, b: Point) => {
    if (!inside(a) || !inside(b) || !inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return false;
    const box = {
      minX: Math.min(a[0], b[0]) - radius,
      maxX: Math.max(a[0], b[0]) + radius,
      minY: Math.min(a[1], b[1]) - radius,
      maxY: Math.max(a[1], b[1]) + radius
    };
    return !tree.search(box).some(e => segmentDistance(a, b, e.a, e.b) < radius - 1e-7);
  };
  const points = ports.map(p => [...p] as Point),
    linkEdges: { a: number; b: number; cost: number; pathId: string }[] = [];
  const index = (p: Point) => {
    const i = points.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7);
    if (i >= 0) return i;
    points.push([...p]);
    return points.length - 1;
  };
  for (const link of links)
    if (visible(link.from, link.from) && visible(link.to, link.to))
      linkEdges.push({ a: index(link.from), b: index(link.to), cost: link.cost, pathId: link.pathId });
  for (const polygon of regions)
    for (const [i, ring] of [polygon.outer, ...polygon.holes].entries()) {
      const compact = compactRing(ring, 0.02);
      let offset: Point[];
      try {
        offset = offsetRing(compact, i === 0 ? -radius - 0.04 : radius + 0.04);
      } catch {
        offset = compact.flatMap((p, k) => {
          const before = compact[(k + compact.length - 1) % compact.length],
            after = compact[(k + 1) % compact.length];
          return [before, after].flatMap(q => {
            const dx = q[0] - p[0],
              dy = q[1] - p[1],
              n = Math.hypot(dx, dy);
            return [-1, 1].map(
              side => [p[0] - ((side * dy) / n) * (radius + 0.05), p[1] + ((side * dx) / n) * (radius + 0.05)] as Point
            );
          });
        });
      }
      for (const p of offset) if (visible(p, p)) index(p);
    }
  if (points.length > 1600) throw new Error("route-budget");
  const adjacency = new Map<number, { to: number; cost: number; pathId?: string }[]>();
  const put = (a: number, b: number, cost: number, pathId?: string) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), { to: b, cost, pathId }]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), { to: a, cost, pathId }]);
  };
  // Build once for all destinations. Dry edges cannot substitute a diagonal for a certified bridge axis.
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++)
      if (visible(points[a], points[b]))
        put(a, b, Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]));
  for (const link of linkEdges) put(link.a, link.b, link.cost, link.pathId);
  const costs = points.map(() => Infinity),
    previous = points.map(() => undefined as { from: number; pathId?: string } | undefined),
    visited = new Set<number>();
  costs[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let at = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (at < 0 || costs[i] < costs[at])) at = i;
    if (at < 0 || !Number.isFinite(costs[at])) break;
    visited.add(at);
    for (const edge of adjacency.get(at) ?? []) {
      const cost = costs[at] + edge.cost;
      if (cost < costs[edge.to] - 1e-8) {
        costs[edge.to] = cost;
        previous[edge.to] = { from: at, pathId: edge.pathId };
      }
    }
  }
  const selected = new Map<string, RouteEdge>(),
    unreachable: number[] = [];
  for (let destination = 1; destination < ports.length; destination++) {
    if (!Number.isFinite(costs[destination])) {
      unreachable.push(destination);
      continue;
    }
    for (let at = destination; at !== 0; ) {
      const p = previous[at];
      if (!p) break;
      const edge = { a: p.from, b: at, pathId: p.pathId },
        key = `${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}:${edge.pathId ?? "dry"}`;
      selected.set(key, edge);
      at = p.from;
    }
  }
  return { points, edges: [...selected.values()], unreachable };
}
