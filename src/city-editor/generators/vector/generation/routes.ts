import type { Point } from "../../../types/primitives";
import { type GenerationTimingObserver, generationTiming } from "../../generationTiming";
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
  /** A side street that joins the nearest existing road instead of running to the centre. */
  minor?: boolean;
}
/** Navigation vertices come from actual boundaries and ports, never a generated cell lattice. */
export function skeletonRoutes(
  regions: VectorPolygon[],
  ports: Point[],
  links: RouteLink[],
  radius: number,
  timings?: GenerationTimingObserver,
  /**
   * Ports before this index are main streets routed to port 0. Later ports are side streets joined
   * to the nearest point of the network built so far, so they meet it in T junctions instead of
   * converging on the centre.
   */
  mainCount = ports.length
) {
  const timed = generationTiming(timings);
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
  timed("boundary-index");
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
      let compact: Point[];
      try {
        compact = compactRing(ring, 0.02);
      } catch {
        // A sliver that simplifies to under three points (a wall shape grazing the site edge) holds no route.
        continue;
      }
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
  timed("navigation-points");
  const adjacency = new Map<number, { to: number; cost: number; pathId?: string }[]>();
  const put = (a: number, b: number, cost: number, pathId?: string) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), { to: b, cost, pathId }]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), { to: a, cost, pathId }]);
  };
  // Certified bridge links stay explicit; dry visibility is evaluated only when
  // an edge could improve the current shortest path, in the same point order.
  for (const link of linkEdges) put(link.a, link.b, link.cost, link.pathId);
  const search = (sources: number[]) => {
    const costs = points.map(() => Infinity),
      previous = points.map(() => undefined as { from: number; pathId?: string } | undefined),
      visited = new Set<number>();
    for (const i of sources) costs[i] = 0;
    for (let step = 0; step < points.length; step++) {
      let at = -1;
      for (let i = 0; i < points.length; i++) if (!visited.has(i) && (at < 0 || costs[i] < costs[at])) at = i;
      if (at < 0 || !Number.isFinite(costs[at])) break;
      visited.add(at);
      for (let to = 0; to < points.length; to++) {
        if (to === at) continue;
        const cost = costs[at] + Math.hypot(points[at][0] - points[to][0], points[at][1] - points[to][1]);
        if (cost < costs[to] - 1e-8 && visible(points[Math.min(at, to)], points[Math.max(at, to)])) {
          costs[to] = cost;
          previous[to] = { from: at };
        }
      }
      for (const edge of adjacency.get(at) ?? []) {
        const cost = costs[at] + edge.cost;
        if (cost < costs[edge.to] - 1e-8) {
          costs[edge.to] = cost;
          previous[edge.to] = { from: at, pathId: edge.pathId };
        }
      }
    }
    return { costs, previous };
  };
  const { costs, previous } = search([0]);
  timed("shortest-paths-and-visibility");
  const selected = new Map<string, RouteEdge>(),
    unreachable: number[] = [];
  const key = (edge: RouteEdge) => `${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}:${edge.pathId ?? "dry"}`;
  const select = (edge: RouteEdge) => selected.set(key(edge), edge);
  const trace = (destination: number, prev: typeof previous, minor: boolean) => {
    for (let at = destination; ; ) {
      const p = prev[at];
      if (!p) break;
      select({ a: p.from, b: at, pathId: p.pathId, ...(minor && !p.pathId ? { minor } : {}) });
      at = p.from;
    }
  };
  for (let destination = 1; destination < Math.min(mainCount, ports.length); destination++) {
    if (!Number.isFinite(costs[destination])) {
      unreachable.push(destination);
      continue;
    }
    trace(destination, previous, false);
  }
  timed("selected-edges");
  for (let port = mainCount; port < ports.length; port++) {
    const target = points[port],
      network = new Set<number>([0]);
    for (const edge of selected.values()) network.add(edge.a).add(edge.b);
    if (network.has(port)) continue;
    // The nearest visible point on a dry street: its foot splits that street into a T junction.
    let best: { edge?: RouteEdge; point: Point; distance: number } | undefined;
    for (const edge of selected.values()) {
      if (edge.pathId) continue;
      const a = points[edge.a],
        b = points[edge.b],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        t = Math.max(0, Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))),
        foot: Point = [a[0] + dx * t, a[1] + dy * t],
        d = Math.hypot(foot[0] - target[0], foot[1] - target[1]);
      if ((!best || d < best.distance) && visible(target, foot))
        best = {
          edge: t > 1e-6 && t < 1 - 1e-6 ? edge : undefined,
          point: t <= 1e-6 ? a : t >= 1 - 1e-6 ? b : foot,
          distance: d
        };
    }
    if (best) {
      if (best.distance < 1e-6) continue;
      const at = index(best.point);
      if (best.edge) {
        selected.delete(key(best.edge));
        select({ ...best.edge, b: at });
        select({ ...best.edge, a: at });
      }
      select({ a: at, b: port, minor: true });
      continue;
    }
    // Hidden behind an obstacle: route around it to whichever network point is closest.
    const around = search([...network]);
    if (!Number.isFinite(around.costs[port])) {
      unreachable.push(port);
      continue;
    }
    trace(port, around.previous, true);
  }
  return { points, edges: [...selected.values()], unreachable };
}
