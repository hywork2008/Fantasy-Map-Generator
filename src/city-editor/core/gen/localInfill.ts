// Local street/lot geometry. None of these subdivisions become mesh edges.
import { facePoints, indexMeshEdges } from "../mesh";
import type { CityDocument, DistrictParameters, Face, Id, Point } from "../types";
import type { BuildingLot } from "./buildingLots";
import { frontageBuildings } from "./frontageBuildings";
import { nearestOnPolyline, pointInPolygon, polygonArea } from "./geom";
import { clipHalfPlane, insetConvexKernel } from "./lotGeometry";
import { makeRng } from "./prng";

export interface InfillLane {
  faceId: Id;
  points: Point[];
  widthMeters: number;
}
export interface FarmPlot {
  faceId: Id;
  polygon: Point[];
  rows: Point[][];
}
export interface CityFabric {
  farms?: FarmPlot[];
  buildings: BuildingLot[];
  lanes: InfillLane[];
  /** Portals shared by adjacent faces, or opening onto a major road. */
  entrances: Map<Id, Point[]>;
}
/** Bounded content cache: independent documents and Undo share only identical derived geometry. */
export class FabricCache {
  private entries = new Map<string, CityFabric>();
  hits = 0;
  misses = 0;
  constructor(private readonly capacity = 256) {}
  get(key: string): CityFabric | undefined {
    const value = this.entries.get(key);
    if (value) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, value);
    } else this.misses++;
    return value;
  }
  set(key: string, value: CityFabric): void {
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
  clear(): void {
    this.entries.clear();
    this.hits = this.misses = 0;
  }
}
export interface InfillOptions {
  seed: string;
  parameters: Map<Id, DistrictParameters>;
  cache: FabricCache;
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dot = (p: Point, n: Point) => p[0] * n[0] + p[1] * n[1];
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p: Point, a: Point, b: Point) => nearestOnPolyline(p, [a, b]).dist < 1e-5;
const boundary = (poly: Point[]) => [...poly, poly[0]];

/** Convex pieces of a simple polygon; triangulation seams remain local to infill. */
export function convexInfillParts(polygon: Point[]): Point[][] {
  const sign = -Math.sign(polygonArea(polygon));
  if (!sign || polygon.length < 3) return [];
  const convex = (ids: number[]) =>
    ids.every(
      (v, i) =>
        sign * cross(polygon[ids[(i + ids.length - 1) % ids.length]], polygon[v], polygon[ids[(i + 1) % ids.length]]) >=
        -1e-7
    );
  const remaining = polygon.map((_, i) => i);
  if (convex(remaining)) return [polygon];
  const pieces: number[][] = [];
  while (remaining.length > 3) {
    const ear = remaining.findIndex((b, i) => {
      const a = remaining[(i + remaining.length - 1) % remaining.length],
        c = remaining[(i + 1) % remaining.length];
      if (sign * cross(polygon[a], polygon[b], polygon[c]) <= 1e-7) return false;
      return !remaining.some(
        v =>
          v !== a &&
          v !== b &&
          v !== c &&
          sign * cross(polygon[a], polygon[b], polygon[v]) >= -1e-7 &&
          sign * cross(polygon[b], polygon[c], polygon[v]) >= -1e-7 &&
          sign * cross(polygon[c], polygon[a], polygon[v]) >= -1e-7
      );
    });
    if (ear < 0) return []; // Invalid/degenerate edited polygon: don't draw across its exterior.
    pieces.push([
      remaining[(ear + remaining.length - 1) % remaining.length],
      remaining[ear],
      remaining[(ear + 1) % remaining.length]
    ]);
    remaining.splice(ear, 1);
  }
  pieces.push(remaining);
  // Merge triangles into broad convex regions rather than exposing triangulation in the buildings.
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < pieces.length; i++)
      for (let j = i + 1; j < pieces.length; j++) {
        const edges = [...pieces[i], ...pieces[j]];
        if (new Set(edges).size !== edges.length - 2) continue;
        const directed = [pieces[i], pieces[j]].flatMap(ids => ids.map((a, k) => [a, ids[(k + 1) % ids.length]]));
        const border = directed.filter(([a, b]) => !directed.some(([c, d]) => a === d && b === c));
        if (!border.length) continue;
        const ring = [border[0][0]];
        while (ring.length < border.length) {
          const edge = border.find(([a]) => a === ring.at(-1));
          if (!edge || ring.includes(edge[1])) break;
          ring.push(edge[1]);
        }
        if (ring.length !== border.length || !convex(ring)) continue;
        pieces[i] = ring;
        pieces.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  return pieces.map(ids => ids.map(i => polygon[i]));
}

/** Reachable face portals form a forest rooted at real major-road frontages. */
export function buildLocalFabric(document: CityDocument, options?: InfillOptions): CityFabric {
  const fabric: CityFabric = { buildings: [], lanes: [], entrances: new Map() };
  const { mesh } = document;
  const edges = indexMeshEdges(mesh);
  const roads = new Set<Id>(),
    barriers = new Set<Id>();
  const clearance = new Map<Id, number>();
  const rivers: { points: Point[]; width: number }[] = [];
  for (const group of document.featureGroups) {
    const ids =
      group.kind === "river"
        ? group.vertices.slice(1).flatMap((v, i) => {
            const edge = edges.between(group.vertices[i], v);
            return edge ? [edge.id] : [];
          })
        : group.segments.map(s => s.edgeId);
    for (const id of ids) {
      if (group.kind === "road") roads.add(id);
      if (group.kind === "river" || group.kind === "wall") barriers.add(id);
      clearance.set(id, Math.max(clearance.get(id) ?? 0, group.style.widthMeters / 2 + 3));
    }
    if (group.kind === "river")
      for (let i = 1; i < group.vertices.length; i++)
        rivers.push({
          points: [mesh.vertices[group.vertices[i - 1]].point, mesh.vertices[group.vertices[i]].point],
          width: group.style.widthMeters
        });
  }
  const land = new Set(
    Object.values(mesh.faces)
      .filter(f => f.properties.water === "land" && f.properties.buildable && f.properties.ward !== "farm")
      .map(f => f.id)
  );
  const edgeMid = (id: Id) => mid(mesh.vertices[mesh.edges[id].a].point, mesh.vertices[mesh.edges[id].b].point);
  const add = (id: Id, p: Point) => {
    const points = fabric.entrances.get(id) ?? [];
    if (!points.some(q => distance(p, q) < 1e-5)) points.push(p);
    fabric.entrances.set(id, points);
  };
  const queue: Id[] = [];
  for (const id of land) {
    const frontages = mesh.faces[id].boundary.filter(ref => roads.has(ref.edgeId) && !barriers.has(ref.edgeId));
    if (!frontages.length) continue;
    for (const ref of frontages) add(id, edgeMid(ref.edgeId));
    queue.push(id);
  }
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    for (const ref of mesh.faces[id].boundary) {
      const edge = mesh.edges[ref.edgeId],
        other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      if (!other || !land.has(other) || reached.has(other) || barriers.has(edge.id)) continue;
      // A locked boundary is not opened by procedural infill.
      if (edge.locked || mesh.faces[id].properties.locked || mesh.faces[other].properties.locked) continue;
      add(id, edgeMid(edge.id));
      add(other, edgeMid(edge.id));
      reached.add(other);
      queue.push(other);
    }
  }
  for (const id of queue) {
    const face = mesh.faces[id];
    const polygon = facePoints(mesh, face);
    const parts = convexInfillParts(polygon);
    const parameters = options?.parameters.get(id);
    const xs = polygon.map(p => p[0]),
      ys = polygon.map(p => p[1]);
    const nearbyRivers = rivers.filter(r => {
      const rx = r.points.map(p => p[0]),
        ry = r.points.map(p => p[1]),
        margin = r.width / 2 + 2;
      return (
        Math.min(...rx) <= Math.max(...xs) + margin &&
        Math.max(...rx) >= Math.min(...xs) - margin &&
        Math.min(...ry) <= Math.max(...ys) + margin &&
        Math.max(...ry) >= Math.min(...ys) - margin
      );
    });
    const dependencies = face.boundary.map(ref => {
      const edge = mesh.edges[ref.edgeId];
      const other = mesh.faces[(edge.leftFace === id ? edge.rightFace : edge.leftFace) ?? ""];
      return [roads.has(edge.id), clearance.get(edge.id), other?.properties.water];
    });
    const entries = fabric.entrances.get(id)!;
    const reserved = document.elements.some(e => ["plaza", "temple"].includes(e.kind) && e.faceIds.includes(id));
    const build = !!face.properties.ward && !["park", "farm", "empty"].includes(face.properties.ward) && !reserved;
    const key = options
      ? JSON.stringify([
          "district-infill-v3",
          options.seed,
          id,
          face.properties,
          polygon,
          entries,
          parameters,
          dependencies,
          nearbyRivers,
          reserved
        ])
      : "";
    const cached = options?.cache.get(key);
    if (cached) {
      fabric.buildings.push(...cached.buildings);
      fabric.lanes.push(...cached.lanes);
      continue;
    }
    const local: CityFabric = { buildings: [], lanes: [], entrances: new Map() };
    for (const part of parts) {
      const portals = entries.filter(p => part.some((a, i) => onSegment(p, a, part[(i + 1) % part.length])));
      // Shared convex-piece seams also carry access, without modifying the face.
      for (let i = 0; i < part.length; i++) {
        const a = part[i],
          b = part[(i + 1) % part.length];
        if (
          parts.some(
            other =>
              other !== part &&
              other.some((c, j) => distance(a, other[(j + 1) % other.length]) < 1e-5 && distance(b, c) < 1e-5)
          )
        )
          portals.push(mid(a, b));
      }
      if (!portals.length) continue;
      const setbacks = part.map((a, i) => {
        const b = part[(i + 1) % part.length];
        const edge = face.boundary.find(
          (_, k) =>
            onSegment(a, polygon[k], polygon[(k + 1) % polygon.length]) &&
            onSegment(b, polygon[k], polygon[(k + 1) % polygon.length])
        );
        if (!edge) return 0;
        const shared = mesh.edges[edge.edgeId];
        const other = mesh.faces[(shared.leftFace === id ? shared.rightFace : shared.leftFace) ?? ""];
        return Math.max(3, clearance.get(edge.edgeId) ?? 0, other && other.properties.water !== "land" ? 6 : 0);
      });
      const safe = insetConvexKernel(part, setbacks);
      if (safe.length < 3 || Math.abs(polygonArea(safe)) < 65) continue;
      const roadFrontages = face.boundary
        .filter(ref => roads.has(ref.edgeId))
        .map(ref => {
          const edge = mesh.edges[ref.edgeId];
          return [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point];
        });
      const frontageEdges = safe.flatMap((a, i) => {
        const b = safe[(i + 1) % safe.length];
        const length = distance(a, b);
        const facing = roadFrontages.some(([c, d]) => {
          const roadLength = distance(c, d);
          return (
            length > 1e-6 &&
            roadLength > 1e-6 &&
            Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (length * roadLength) < 1e-6 &&
            nearestOnPolyline(mid(a, b), [c, d]).dist <= Math.max(...setbacks) + 0.1
          );
        });
        return facing ? [[a, b]] : [];
      });
      fillPart(face, safe, portals, frontageEdges, build, local, parameters, options?.seed);
    }
    local.buildings = local.buildings.filter(
      b =>
        b.polygon.every(p => pointInPolygon(p, polygon)) &&
        !nearbyRivers.some(r => b.polygon.some(p => nearestOnPolyline(p, r.points).dist < r.width / 2 + 2))
    );
    options?.cache.set(key, local);
    fabric.buildings.push(...local.buildings);
    fabric.lanes.push(...local.lanes);
  }
  return fabric;
}

export function chord(poly: Point[], normal: Point, offset: number): [Point, Point] | null {
  const hits: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = dot(a, normal) - offset,
      db = dot(b, normal) - offset;
    if (Math.abs(da) < 1e-6) hits.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      hits.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  let best: [Point, Point] | null = null;
  for (const a of hits) for (const b of hits) if (distance(a, b) > (best ? distance(...best) : 1e-5)) best = [a, b];
  return best;
}

function fillPart(
  face: Face,
  polygon: Point[],
  entries: Point[],
  roadFrontages: Point[][],
  build: boolean,
  fabric: CityFabric,
  parameters?: DistrictParameters,
  seed?: string
): void {
  const rng = makeRng(`${seed ?? "block-infill-v3"}:${face.id}:${face.properties.ward}:${polygon[0].join(",")}`);
  const laneWidth = parameters?.laneWidth ?? 3;
  const landmark = face.properties.ward === "castle";
  const target = parameters?.lotArea ?? (landmark ? 1200 : face.properties.ward === "merchant" ? 220 : 150);
  const outskirts = face.properties.settlement === "outskirts";
  const access: InfillLane[] = roadFrontages.map(points => ({ faceId: face.id, points, widthMeters: 0 }));
  const lanes: InfillLane[] = [];
  const addLane = (points: Point[]) => {
    if (distance(points[0], points[points.length - 1]) < 1e-6) return;
    const lane = { faceId: face.id, points, widthMeters: laneWidth };
    lanes.push(lane);
    fabric.lanes.push(lane);
    access.push(lane);
  };
  const split = (poly: Point[], normal: Point, offset: number) =>
    [
      clipHalfPlane(poly, normal, offset - laneWidth / 2 - 0.35),
      clipHalfPlane(poly, [-normal[0], -normal[1]], -offset - laneWidth / 2 - 0.35)
    ].filter(p => p.length >= 3 && Math.abs(polygonArea(p)) >= 65);
  const preferredNormal = (tangent: Point): Point => {
    if (!parameters) return tangent;
    const axis: Point = [Math.cos(parameters.orientation), Math.sin(parameters.orientation)];
    const across: Point = [-axis[1], axis[0]];
    return Math.abs(dot(tangent, axis)) >= Math.abs(dot(tangent, across)) ? axis : across;
  };
  let regions = [polygon];
  // A trunk enters perpendicular to its frontage. Subsequent portals connect
  // to it, instead of drawing an unconditional road around the entire block.
  for (const entry of entries) {
    const hit = nearestOnPolyline(entry, boundary(polygon));
    const anchor = hit.point;
    const a = polygon[hit.segIndex],
      b = polygon[(hit.segIndex + 1) % polygon.length];
    const length = distance(a, b);
    if (length < 1e-6) continue;
    let normal = preferredNormal([(b[0] - a[0]) / length, (b[1] - a[1]) / length]);
    if (lanes.length) {
      const nearest = lanes.map(l => nearestOnPolyline(anchor, l.points)).sort((a, b) => a.dist - b.dist)[0];
      if (nearest.dist < 1e-5) {
        addLane([entry, anchor]);
        continue;
      }
      normal = [(nearest.point[1] - anchor[1]) / nearest.dist, (anchor[0] - nearest.point[0]) / nearest.dist];
    }
    const offset = dot(anchor, normal);
    const line = chord(polygon, normal, offset);
    if (!line) continue;
    addLane([entry, anchor]);
    addLane(line);
    regions = regions.flatMap(poly => split(poly, normal, offset));
  }
  if (!build) return;
  const frontages = (poly: Point[], roads: InfillLane[]) =>
    poly.flatMap((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const length = distance(a, b);
      if (length < 1e-6) return [];
      const lane = roads.find(l => {
        const limit = l.widthMeters / 2 + 0.36;
        // At an oblique junction, an offset edge's endpoint can extend past
        // the centreline endpoint. Test the parallel frontage at its midpoint
        // rather than rejecting the entire row because of that corner.
        const hit = nearestOnPolyline(mid(a, b), l.points);
        const c = l.points[hit.segIndex],
          d = l.points[hit.segIndex + 1];
        const roadLength = distance(c, d);
        return (
          hit.dist <= limit &&
          roadLength > 1e-6 &&
          Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (length * roadLength) < 1e-5
        );
      });
      return lane ? [{ i, a, b, length }] : [];
    });
  // Only coarse divisions create streets. Each resulting block is packed with
  // frontage lots without drawing roads between neighbouring houses.
  const subdivide = (poly: Point[], roads: InfillLane[], depth: number): void => {
    const fronts = frontages(poly, roads).sort((a, b) => b.length - a.length);
    if (!fronts.length) return;
    const area = Math.abs(polygonArea(poly));
    const front = fronts[0];
    if (depth < 12 && area > target * (outskirts ? 18 : 12) && front.length > Math.sqrt(target) * 2.5) {
      const normal = preferredNormal([
        (front.b[0] - front.a[0]) / front.length,
        (front.b[1] - front.a[1]) / front.length
      ]);
      const t = rng.range(0.4, 0.6);
      const offset = dot(
        [front.a[0] + (front.b[0] - front.a[0]) * t, front.a[1] + (front.b[1] - front.a[1]) * t],
        normal
      );
      const line = chord(poly, normal, offset);
      const parts = split(poly, normal, offset);
      if (line && parts.length === 2 && parts.every(p => Math.abs(polygonArea(p)) > target * 2)) {
        const points = line.map(p => {
          const near = roads.map(l => ({ l, ...nearestOnPolyline(p, l.points) })).sort((a, b) => a.dist - b.dist)[0];
          return near && near.dist <= near.l.widthMeters / 2 + 0.36 ? near.point : p;
        });
        addLane(points);
        const childAccess = [...roads, lanes[lanes.length - 1]];
        for (const part of parts) subdivide(part, childAccess, depth + 1);
        return;
      }
    }
    const footprints = frontageBuildings(
      poly,
      fronts.map(f => f.i),
      {
        lotArea: target,
        coverage: parameters?.coverage ?? 0.75,
        occupancy: landmark ? 1 : (parameters?.occupancy ?? (outskirts ? 0.82 : 0.965)),
        outskirts
      },
      rng
    );
    for (const footprint of footprints) fabric.buildings.push({ faceId: face.id, polygon: footprint, landmark });
  };
  const initialAccess = access.slice();
  for (const region of regions) subdivide(region, initialAccess, 0);
}
