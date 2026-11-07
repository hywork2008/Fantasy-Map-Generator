import type { Point } from "../../../types/primitives";
import { segmentDistance } from "../geometry/network";
import { indexedContains, type VectorPolygon } from "../geometry/regions";
import { compactRing, offsetRing } from "../geometry/routing";
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
  const rawInside = indexedContains(regions);
  const insideCache = new WeakMap<Point, boolean>();
  const inside = (p: Point) => {
    const known = insideCache.get(p);
    if (known !== undefined) return known;
    const value = rawInside(p);
    insideCache.set(p, value);
    return value;
  };
  // Cells are wider than the clearance, so a 3×3 neighborhood contains every edge that can reject a sample.
  // Every boundary stays in the grid. A convex shore is clear along a chord only while both ends stay in
  // that same component; skipping it would bridge a gap to another shore.
  const cell = Math.max(radius * 2, 8);
  const pack = (ix: number, iy: number) => ix * 4294967296 + iy;
  type Edge = { a: Point; b: Point; id: number };
  const grid = new Map<number, Edge[]>();
  let boundaryEdges = 0;
  const add = (edge: Edge) => {
    const minX = Math.floor((Math.min(edge.a[0], edge.b[0]) - 1e-7) / cell);
    const maxX = Math.floor((Math.max(edge.a[0], edge.b[0]) + 1e-7) / cell);
    const minY = Math.floor((Math.min(edge.a[1], edge.b[1]) - 1e-7) / cell);
    const maxY = Math.floor((Math.max(edge.a[1], edge.b[1]) + 1e-7) / cell);
    for (let ix = minX; ix <= maxX; ix++)
      for (let iy = minY; iy <= maxY; iy++) {
        const key = pack(ix, iy);
        const list = grid.get(key);
        if (list) list.push(edge);
        else grid.set(key, [edge]);
      }
  };
  for (const region of regions)
    for (const ring of [region.outer, ...region.holes])
      for (let i = 0; i < ring.length; i++) add({ a: ring[i], b: ring[(i + 1) % ring.length], id: boundaryEdges++ });
  const seen = new Uint32Array(boundaryEdges);
  let stamp = 1;
  const limit = radius - 1e-7;
  // The expanded box contains every point within the clearance of the edge. Missing it cannot reject.
  const separated = (a: Point, b: Point, edge: Edge) => {
    const minX = Math.min(edge.a[0], edge.b[0]) - limit;
    const maxX = Math.max(edge.a[0], edge.b[0]) + limit;
    const minY = Math.min(edge.a[1], edge.b[1]) - limit;
    const maxY = Math.max(edge.a[1], edge.b[1]) + limit;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      p = [-dx, dx, -dy, dy],
      q = [a[0] - minX, maxX - a[0], a[1] - minY, maxY - a[1]];
    let t0 = 0,
      t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return true;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return true;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return true;
          if (t < t1) t1 = t;
        }
      }
    }
    return false;
  };
  const visible = (a: Point, b: Point) => {
    if (!inside(a) || !inside(b) || !inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return false;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / cell));
    let blocked = false;
    for (let step = 0; step <= steps && !blocked; step++) {
      const t = step / steps,
        ix = Math.floor((a[0] + dx * t) / cell),
        iy = Math.floor((a[1] + dy * t) / cell);
      for (let ox = -1; ox <= 1 && !blocked; ox++)
        for (let oy = -1; oy <= 1 && !blocked; oy++)
          for (const edge of grid.get(pack(ix + ox, iy + oy)) ?? []) {
            if (seen[edge.id] === stamp) continue;
            seen[edge.id] = stamp;
            if (separated(a, b, edge)) continue;
            if (segmentDistance(a, b, edge.a, edge.b) < limit) {
              blocked = true;
              break;
            }
          }
    }
    if (stamp === 0xffffffff) {
      seen.fill(0);
      stamp = 1;
    } else stamp++;
    return !blocked;
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
