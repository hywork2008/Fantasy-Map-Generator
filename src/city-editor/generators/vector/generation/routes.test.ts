import { describe, expect, it } from "vitest";
import type { Point } from "../../../types/primitives";
import { segmentDistance } from "../geometry/network";
import { containsRegion, type VectorPolygon } from "../geometry/regions";
import { type RouteEdge, type RouteLink, skeletonRoutes } from "./routes";

const rectangle = (x: number, y: number, width: number, height = width): Point[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height]
];

// Independent exhaustive boundary checks serve as the oracle for lazy visibility.
function exhaustiveEdges(
  regions: VectorPolygon[],
  points: Point[],
  ports: Point[],
  links: RouteLink[],
  radius: number
) {
  const boundaries = regions.flatMap(r =>
    [r.outer, ...r.holes].flatMap(ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]] as const))
  );
  const visible = (a: Point, b: Point) =>
    [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point].every(p => containsRegion(regions, p)) &&
    boundaries.every(([c, d]) => segmentDistance(a, b, c, d) >= radius - 1e-7);
  const adjacency = points.map(() => [] as { to: number; cost: number; pathId?: string }[]);
  const put = (a: number, b: number, cost: number, pathId?: string) => {
    adjacency[a].push({ to: b, cost, pathId });
    adjacency[b].push({ to: a, cost, pathId });
  };
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++)
      if (visible(points[a], points[b]))
        put(a, b, Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]));
  for (const link of links)
    if (visible(link.from, link.from) && visible(link.to, link.to))
      put(
        points.findIndex(p => Math.hypot(p[0] - link.from[0], p[1] - link.from[1]) < 1e-7),
        points.findIndex(p => Math.hypot(p[0] - link.to[0], p[1] - link.to[1]) < 1e-7),
        link.cost,
        link.pathId
      );
  const costs = points.map(() => Infinity),
    previous: ({ from: number; pathId?: string } | undefined)[] = points.map(() => undefined);
  const visited = new Set<number>();
  costs[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let at = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (at < 0 || costs[i] < costs[at])) at = i;
    if (at < 0 || !Number.isFinite(costs[at])) break;
    visited.add(at);
    for (const edge of adjacency[at]) {
      const cost = costs[at] + edge.cost;
      if (cost < costs[edge.to] - 1e-8) {
        costs[edge.to] = cost;
        previous[edge.to] = { from: at, pathId: edge.pathId };
      }
    }
  }
  const edges = new Map<string, RouteEdge>(),
    unreachable: number[] = [];
  for (let destination = 1; destination < ports.length; destination++) {
    if (!Number.isFinite(costs[destination])) {
      unreachable.push(destination);
      continue;
    }
    for (let at = destination; at !== 0; ) {
      const p = previous[at]!;
      const edge = { a: p.from, b: at, pathId: p.pathId };
      edges.set(`${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}:${edge.pathId ?? "dry"}`, edge);
      at = p.from;
    }
  }
  return { edges: [...edges.values()], unreachable };
}

describe("skeleton visibility graph", () => {
  const separated: VectorPolygon[] = [
    { outer: rectangle(-60, -30, 50, 60), holes: [] },
    { outer: rectangle(10, -30, 50, 60), holes: [] }
  ];
  const ports: Point[] = [
    [-35, 0],
    [35, 0],
    [-20, -10],
    [20, 10]
  ];
  it.each([false, true])("matches exhaustive boundaries across disconnected banks with bridge=%s", bridge => {
    const links = bridge ? [{ from: ports[2], to: ports[3], cost: 100, pathId: "certified-bridge" }] : [];
    const route = skeletonRoutes(separated, ports, links, 2);
    expect({ edges: route.edges, unreachable: route.unreachable }).toEqual(
      exhaustiveEdges(separated, route.points, ports, links, 2)
    );
    expect(route.unreachable).toEqual(bridge ? [] : [1, 3]);
    expect(route.edges.filter(e => e.pathId).map(e => e.pathId)).toEqual(bridge ? ["certified-bridge"] : []);
  });
  it("matches exhaustive boundaries around a hole and concave outer boundary", () => {
    const regions: VectorPolygon[] = [
      {
        outer: [
          [-40, -40],
          [40, -40],
          [40, 40],
          [10, 40],
          [10, 10],
          [-10, 10],
          [-10, 40],
          [-40, 40]
        ],
        holes: [rectangle(-5, -25, 10)]
      }
    ];
    const ports: Point[] = [
      [-25, 25],
      [25, 25],
      [0, -30],
      [30, -30]
    ];
    const route = skeletonRoutes(regions, ports, [], 2);
    expect({ edges: route.edges, unreachable: route.unreachable }).toEqual(
      exhaustiveEdges(regions, route.points, ports, [], 2)
    );
    expect(route.unreachable).toEqual([]);
  });
  it.each([2 - 2e-7, 2, 2 + 2e-7])("preserves clearance at distance %s from a long boundary", distance => {
    const regions = [{ outer: rectangle(-100, -10, 200, 20), holes: [] }];
    const ports: Point[] = [
      [-80, -10 + distance],
      [80, -10 + distance]
    ];
    const route = skeletonRoutes(regions, ports, [], 2);
    expect({ edges: route.edges, unreachable: route.unreachable }).toEqual(
      exhaustiveEdges(regions, route.points, ports, [], 2)
    );
    expect(route.unreachable).toEqual(distance < 2 - 1e-7 ? [1] : []);
  });
});
