import type { Point } from "../types/document";
import { nearestOnPolyline, polygonArea } from "./geom";
import { convexInfillParts } from "./lotGeometry";
import { bounds, corridor, intersectConvex, PlotIndex } from "./parcelGeometry";
import type { DetailedRuralFieldInput } from "./ruralFieldDetails";
import type { RuralFieldPlan } from "./ruralFieldPlan";
import { finishRuralTerritories } from "./ruralFieldTerritories";

const area = (p: Point[]) => Math.abs(polygonArea(p));
const hash = (s: string) => {
  let n = [...s].reduce((n, c) => (Math.imul(n, 33) + c.charCodeAt(0)) >>> 0, 5381);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return (n ^ (n >>> 16)) >>> 0;
};
const key = (x: number, y: number) => `${x}:${y}`;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
type AccessNode = { point: Point; x: number; y: number; parent?: string; road?: Point };

/** The lattice is a hidden access search. Reachable land is partitioned into
 * contiguous territories, with shared boundaries and local working directions. */
export function planRuralFieldGroups(input: DetailedRuralFieldInput): RuralFieldPlan {
  const result: RuralFieldPlan = {
    farms: [],
    lanes: [],
    diagnostics: {
      candidateAreaM2: 0,
      reachableAreaM2: 0,
      cultivatedAreaM2: 0,
      requestedAreaM2: input.areaBudgetM2,
      shortfallAreaM2: input.areaBudgetM2 ?? 0,
      unsuitableAreaM2: input.unsuitableAreaM2,
      profile: input.system,
      shortfallReason: input.areaBudgetM2 ? (input.unsuitableAreaM2 ? "terrain" : "space") : undefined,
      gridMeters: 8,
      orientationRadians: 0
    }
  };
  if (!input.land.length || !input.roads.length) return result;
  const timing = input.profiler?.stages("generation/layout");
  timing?.next("land-and-road-index");
  const land = new PlotIndex<{ polygon: Point[]; faceId: string }>();
  for (const face of input.land)
    for (const polygon of convexInfillParts(face.polygon)) land.add({ polygon, faceId: face.faceId }, bounds(polygon));
  const box = bounds(input.land.flatMap(face => face.polygon));
  const q = Math.max(4, Math.ceil(Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / 100000) / 2) * 2);
  result.diagnostics.gridMeters = q;
  const covered = (polygon: Point[]) =>
    land.query(bounds(polygon)).reduce((sum, part) => sum + area(intersectConvex(polygon, part.polygon)), 0) >=
    area(polygon) - 0.01;
  const clear = (polygon: Point[]) => polygon.length >= 3 && covered(polygon) && !input.blocked(polygon);
  const roads = new PlotIndex<{ a: Point; b: Point; width: number; band: Point[] }>();
  for (const road of input.roads)
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        band = corridor(a, b, road.widthMeters + 2);
      if (band.length) roads.add({ a, b, width: road.widthMeters, band }, bounds(band));
    }
  timing?.next("access-mask");
  const nodes = new Map<string, AccessNode>(),
    queue: string[] = [];
  for (let y = Math.floor(box[1] / q); y < Math.ceil(box[3] / q); y++)
    for (let x = Math.floor(box[0] / q); x < Math.ceil(box[2] / q); x++) {
      const polygon: Point[] = [
        [x * q, y * q],
        [(x + 1) * q, y * q],
        [(x + 1) * q, (y + 1) * q],
        [x * q, (y + 1) * q]
      ];
      if (!clear(polygon)) continue;
      const point: Point = [(x + 0.5) * q, (y + 0.5) * q];
      const node: AccessNode = { point, x, y };
      nodes.set(key(x, y), node);
      result.diagnostics.candidateAreaM2 += q * q;
      const nearby = roads.query([point[0] - q * 2, point[1] - q * 2, point[0] + q * 2, point[1] + q * 2]);
      const nearest = nearby
        .map(road => ({ road, hit: nearestOnPolyline(point, [road.a, road.b]) }))
        .sort((a, b) => a.hit.dist - b.hit.dist)[0];
      if (
        nearest &&
        nearest.hit.dist <= q + nearest.road.width / 2 &&
        (nearest.hit.dist < 0.01 || !input.blocked(corridor(point, nearest.hit.point, 3.8, 1.9)))
      ) {
        node.road = nearest.hit.point;
        queue.push(key(x, y));
      }
    }
  timing?.next("reachability");
  const reached = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const node = nodes.get(queue[i])!;
    for (const [x, y] of [
      [node.x - 1, node.y],
      [node.x + 1, node.y],
      [node.x, node.y - 1],
      [node.x, node.y + 1]
    ]) {
      const id = key(x, y),
        next = nodes.get(id);
      if (!next || reached.has(id)) continue;
      next.parent = queue[i];
      reached.add(id);
      queue.push(id);
    }
  }
  result.diagnostics.reachableAreaM2 = queue.length * q * q;
  const source = (polygon: Point[]) =>
    [
      ...new Set(
        land
          .query(bounds(polygon))
          .filter(part => area(intersectConvex(polygon, part.polygon)) > 0.01)
          .map(part => part.faceId)
      )
    ].sort();
  timing?.next("group-seeds");
  const candidates = queue
    .map(id => ({ id, rank: hash(`${input.seed}:group:${id}`) }))
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const groups: { id: string; center: Point; angle: number; seed: number }[] = [];
  const maxGroups = Math.min(240, Math.max(1, Math.ceil((queue.length * q * q) / 24000)));
  for (const candidate of candidates) {
    if (groups.length >= maxGroups) break;
    const node = nodes.get(candidate.id)!,
      seed = hash(`${input.seed}:shape:${candidate.id}`);
    const spacing = 140 + (seed % 71);
    if (groups.some(group => distance(group.center, node.point) < spacing)) continue;
    // Use the local physical road, rather than a city-wide compass direction.
    const road = input.roads
      .map(road => ({ road, hit: nearestOnPolyline(node.point, road.points) }))
      .sort((a, b) => a.hit.dist - b.hit.dist)[0];
    const roadPoints = road.road.points;
    let tangent = 0,
      nearest = Infinity;
    for (let i = 1; i < roadPoints.length; i++) {
      const hit = nearestOnPolyline(node.point, [roadPoints[i - 1], roadPoints[i]]);
      if (hit.dist < nearest) {
        nearest = hit.dist;
        tangent = Math.atan2(roadPoints[i][1] - roadPoints[i - 1][1], roadPoints[i][0] - roadPoints[i - 1][0]);
      }
    }
    const angle = tangent + (seed % 3 === 0 ? Math.PI / 2 : 0) + ((((seed >>> 8) % 51) - 25) * Math.PI) / 180;
    groups.push({ id: candidate.id, center: node.point, angle, seed });
  }
  // Establish the sparse approach network before allocating any fields.
  // A later group can join an actual earlier track endpoint; all other routes
  // follow the proved reachable tree and are shortened only after clearance.
  timing?.next("approach-tracks");
  const tracks: Point[][] = [],
    endpoints: Point[] = [];
  const trackIndex = new PlotIndex<Point[]>();
  const reserveTrack = (points: Point[]) => {
    if (distance(points[0], points[1]) < 0.001) return;
    tracks.push(points);
    endpoints.push(...points);
    const band = corridor(points[0], points[1], 3.8, 1.9);
    trackIndex.add(band, bounds(band));
  };
  for (const group of groups) {
    const joint = endpoints
      .filter(p => distance(p, group.center) < 240)
      .sort((a, b) => distance(a, group.center) - distance(b, group.center))
      .find(p => clear(corridor(group.center, p, 3.8, 1.9)));
    if (joint) {
      reserveTrack([group.center, joint]);
      continue;
    }
    const path: Point[] = [group.center];
    let node = nodes.get(group.id)!;
    while (node.parent) {
      node = nodes.get(node.parent)!;
      path.push(node.point);
    }
    for (let i = 0; i < path.length - 1; ) {
      let j = path.length - 1;
      while (j > i + 1 && !clear(corridor(path[i], path[j], 3.8, 1.9))) j--;
      reserveTrack([path[i], path[j]]);
      i = j;
    }
    if (node.road) reserveTrack([node.point, node.road]);
  }
  if (input.profiler)
    Object.assign(input.profiler.counts, {
      accessNodes: nodes.size,
      reachableNodes: queue.length,
      groups: groups.length,
      gridMeters: q
    });
  timing?.end();
  return finishRuralTerritories({ input, result, nodes, queue, groups, tracks, clear, source, q });
}
