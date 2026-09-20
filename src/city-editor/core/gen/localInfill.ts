// Local street/lot geometry. None of these subdivisions become mesh edges.
import { facePoints, indexMeshEdges } from "../mesh";
import type { CityDocument, DistrictParameters, EdgeRef, Face, Id, Point } from "../types";
import { type BuildingLot, buildingHitsCivicLandmark, laneHitsCivicLandmark } from "./buildingLots";
import { buildCirculadeBlocks } from "./circuladeFabric";
import { districtBoundary } from "./fabricDistricts";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { dwellingLotArea } from "./housing";
import { insetConvexKernel } from "./lotGeometry";
import { buildPerimeterBlocks } from "./perimeterBlocks";
import { makeRng } from "./prng";
import type { CityLayout } from "./site/siteConfig";
import { infillCore, infillOutskirts } from "./streetGrowth";

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
  layout?: CityLayout;
  hub?: Point;
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dot = (p: Point, n: Point) => p[0] * n[0] + p[1] * n[1];
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p: Point, a: Point, b: Point) => nearestOnPolyline(p, [a, b]).dist < 1e-5;

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
  const grouped = new Set<Id>();
  for (const ids of outskirtsComponents(
    queue.filter(id => mesh.faces[id].properties.settlement === "outskirts"),
    mesh,
    barriers,
    !document.fabric
  )) {
    if (paintOutskirtsUnion(document, ids, fabric, { document, roads, barriers, clearance, rivers, options }))
      for (const id of ids) grouped.add(id);
  }
  for (const id of queue) {
    if (grouped.has(id)) continue;
    paintFace(document, id, fabric, { document, roads, barriers, clearance, rivers, options });
  }
  fabric.buildings = fabric.buildings.filter(b => !buildingHitsCivicLandmark(document, b.polygon));
  fabric.lanes = fabric.lanes.filter(l => !laneHitsCivicLandmark(document, l.points));
  return fabric;
}

function outskirtsComponents(
  ids: Id[],
  mesh: CityDocument["mesh"],
  barriers: Set<Id>,
  mergeNeighbors: boolean
): Id[][] {
  const pending = new Set(ids);
  const groups: Id[][] = [];
  while (pending.size) {
    const first = pending.values().next().value as Id;
    const group = [first];
    pending.delete(first);
    if (mergeNeighbors) {
      for (let i = 0; i < group.length; i++) {
        for (const ref of mesh.faces[group[i]].boundary) {
          const edge = mesh.edges[ref.edgeId];
          const other = edge.leftFace === group[i] ? edge.rightFace : edge.leftFace;
          if (!other || !pending.has(other) || barriers.has(edge.id)) continue;
          if (edge.locked || mesh.faces[group[i]].properties.locked || mesh.faces[other].properties.locked) continue;
          pending.delete(other);
          group.push(other);
        }
      }
    }
    groups.push(group.sort());
  }
  return groups;
}

function unionRing(document: CityDocument, ids: Id[]): { points: Point[]; refs: EdgeRef[] } | null {
  const refs = districtBoundary(document, ids);
  if (!refs) return null;
  const points = refs.map(ref => {
    const e = document.mesh.edges[ref.edgeId];
    return document.mesh.vertices[ref.forward ? e.a : e.b].point;
  });
  return points.length >= 3 ? { points, refs } : null;
}

function nearbyRiversOf(
  polygon: Point[],
  rivers: { points: Point[]; width: number }[]
): { points: Point[]; width: number }[] {
  const xs = polygon.map(p => p[0]),
    ys = polygon.map(p => p[1]);
  return rivers.filter(r => {
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
}

interface PaintContext {
  document: CityDocument;
  roads: Set<Id>;
  barriers: Set<Id>;
  clearance: Map<Id, number>;
  rivers: { points: Point[]; width: number }[];
  options?: InfillOptions;
}

function paintOutskirtsUnion(document: CityDocument, ids: Id[], fabric: CityFabric, ctx: PaintContext): boolean {
  const ring = unionRing(document, ids);
  if (!ring) return false;
  const { mesh } = document;
  const polygons = new Map(ids.map(id => [id, facePoints(mesh, mesh.faces[id])]));
  const entries = ids.flatMap(id => fabric.entrances.get(id) ?? []);
  const outerEntries = entries.filter(p =>
    ring.points.some((a, i) => onSegment(p, a, ring.points[(i + 1) % ring.points.length]))
  );
  const parameters = pickParameters(ids, document, ctx.options);
  const nearbyRivers = nearbyRiversOf(ring.points, ctx.rivers);
  const reserved = new Set(
    ids.filter(id => document.elements.some(e => ["plaza", "temple"].includes(e.kind) && e.faceIds.includes(id)))
  );
  const dependencies = ring.refs.map(ref => {
    const edge = mesh.edges[ref.edgeId];
    const other = mesh.faces[(edge.leftFace && ids.includes(edge.leftFace) ? edge.rightFace : edge.leftFace) ?? ""];
    return [ctx.roads.has(edge.id), ctx.clearance.get(edge.id), other?.properties.water];
  });
  const key = ctx.options
    ? JSON.stringify([
        "outskirts-union-v3",
        ctx.options.seed,
        ids,
        ids.map(id => mesh.faces[id].properties),
        ring.points,
        outerEntries,
        parameters,
        dependencies,
        nearbyRivers,
        [...reserved]
      ])
    : "";
  const cached = ctx.options?.cache.get(key);
  if (cached) {
    fabric.buildings.push(...cached.buildings);
    fabric.lanes.push(...cached.lanes);
    return true;
  }
  const host = mesh.faces[ids[0]];
  const local: CityFabric = { buildings: [], lanes: [], entrances: new Map() };
  fillPolygon(
    host,
    ring.points,
    ring.refs,
    outerEntries,
    true,
    local,
    parameters,
    ctx,
    ids.some(id => buildableFace(mesh.faces[id]) && !reserved.has(id)),
    ids,
    ctx.options?.seed
  );
  const owner = (p: Point) => ids.find(id => pointInPolygon(p, polygons.get(id)!)) ?? ids[0];
  local.buildings = local.buildings
    .map(b => ({ ...b, faceId: owner(polygonCentroid(b.polygon)) }))
    .filter(
      b =>
        !reserved.has(b.faceId) &&
        buildableFace(mesh.faces[b.faceId]) &&
        b.polygon.every(p => pointInPolygon(p, ring.points)) &&
        !nearbyRivers.some(r => b.polygon.some(p => nearestOnPolyline(p, r.points).dist < r.width / 2 + 2))
    );
  local.lanes = local.lanes.map(l => ({ ...l, faceId: owner(l.points[0]) }));
  ctx.options?.cache.set(key, local);
  fabric.buildings.push(...local.buildings);
  fabric.lanes.push(...local.lanes);
  return true;
}

function paintFace(document: CityDocument, id: Id, fabric: CityFabric, ctx: PaintContext): void {
  const { mesh } = document;
  const face = mesh.faces[id];
  const polygon = facePoints(mesh, face);
  const parameters = ctx.options?.parameters.get(id);
  const nearbyRivers = nearbyRiversOf(polygon, ctx.rivers);
  const entries = fabric.entrances.get(id) ?? [];
  const reserved = document.elements.some(e => ["plaza", "temple"].includes(e.kind) && e.faceIds.includes(id));
  const outskirts = face.properties.settlement === "outskirts";
  const dependencies = face.boundary.map(ref => {
    const edge = mesh.edges[ref.edgeId];
    const other = mesh.faces[(edge.leftFace === id ? edge.rightFace : edge.leftFace) ?? ""];
    return [ctx.roads.has(edge.id), ctx.clearance.get(edge.id), other?.properties.water];
  });
  const isCirculade = ctx.options?.layout === "circulade";
  const isClassic = ctx.options?.layout === "classic";
  const key = ctx.options
    ? JSON.stringify([
        outskirts ? "outskirts-face-v3" : isClassic ? "district-infill-classic-v1" : "district-voronoi-perimeter-v3",
        ctx.options.seed,
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
  if (reserved) {
    if (key) ctx.options?.cache.set(key, { buildings: [], lanes: [], entrances: new Map() });
    return;
  }
  const cached = ctx.options?.cache.get(key);
  if (cached) {
    fabric.buildings.push(...cached.buildings);
    fabric.lanes.push(...cached.lanes);
    return;
  }
  const local: CityFabric =
    !outskirts && face.properties.ward !== "castle" && !isClassic
      ? isCirculade
        ? buildCirculadeBlocks(
            face,
            polygon,
            face.boundary.map((ref, i) => {
              const edge = mesh.edges[ref.edgeId];
              const other = mesh.faces[(edge.leftFace === id ? edge.rightFace : edge.leftFace) ?? ""];
              return {
                a: polygon[i],
                b: polygon[(i + 1) % polygon.length],
                setback: Math.max(
                  (parameters?.laneWidth ?? 3) / 2 + 0.35,
                  ctx.clearance.get(ref.edgeId) ?? 0,
                  other && other.properties.water !== "land" ? 6 : 0
                ),
                feature: ctx.roads.has(ref.edgeId) || ctx.barriers.has(ref.edgeId)
              };
            }),
            parameters,
            ctx.options?.seed ?? "circulade-infill",
            buildableFace(face) && !reserved,
            ctx.options?.hub ?? [0, 0]
          )
        : buildPerimeterBlocks(
            face,
            polygon,
            face.boundary.map((ref, i) => {
              const edge = mesh.edges[ref.edgeId];
              const other = mesh.faces[(edge.leftFace === id ? edge.rightFace : edge.leftFace) ?? ""];
              return {
                a: polygon[i],
                b: polygon[(i + 1) % polygon.length],
                setback: Math.max(
                  (parameters?.laneWidth ?? 3) / 2 + 0.35,
                  ctx.clearance.get(ref.edgeId) ?? 0,
                  other && other.properties.water !== "land" ? 6 : 0
                ),
                feature: ctx.roads.has(ref.edgeId) || ctx.barriers.has(ref.edgeId)
              };
            }),
            parameters,
            ctx.options?.seed ?? "block-infill",
            buildableFace(face) && !reserved
          )
      : { buildings: [], lanes: [], entrances: new Map() };
  if (outskirts || face.properties.ward === "castle" || isClassic)
    fillPolygon(
      face,
      polygon,
      face.boundary,
      entries,
      outskirts,
      local,
      parameters,
      ctx,
      buildableFace(face) && !reserved,
      [id],
      ctx.options?.seed,
      isClassic
    );
  local.buildings = local.buildings.filter(
    b =>
      b.polygon.every(p => pointInPolygon(p, polygon)) &&
      !nearbyRivers.some(r => b.polygon.some(p => nearestOnPolyline(p, r.points).dist < r.width / 2 + 2))
  );
  ctx.options?.cache.set(key, local);
  fabric.buildings.push(...local.buildings);
  fabric.lanes.push(...local.lanes);
}

function buildableFace(face: Face): boolean {
  return !!face.properties.ward && !["park", "farm", "empty"].includes(face.properties.ward);
}

function pickParameters(ids: Id[], document: CityDocument, options?: InfillOptions): DistrictParameters | undefined {
  let best: DistrictParameters | undefined;
  let bestArea = -1;
  for (const id of ids) {
    const area = Math.abs(polygonArea(facePoints(document.mesh, document.mesh.faces[id])));
    const parameters = options?.parameters.get(id);
    if (area > bestArea) {
      bestArea = area;
      best = parameters;
    }
  }
  return best;
}

function fillPolygon(
  face: Face,
  polygon: Point[],
  boundary: EdgeRef[],
  entries: Point[],
  outskirts: boolean,
  local: CityFabric,
  parameters: DistrictParameters | undefined,
  ctx: PaintContext,
  build: boolean,
  memberIds: Id[],
  seed?: string,
  classic = false
): void {
  const { mesh } = ctx.document;
  const members = new Set(memberIds);
  const parts = convexInfillParts(polygon);
  for (const part of parts) {
    const portals = entries.filter(p => part.some((a, i) => onSegment(p, a, part[(i + 1) % part.length])));
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
      const edge = boundary.find(
        (_, k) =>
          onSegment(a, polygon[k], polygon[(k + 1) % polygon.length]) &&
          onSegment(b, polygon[k], polygon[(k + 1) % polygon.length])
      );
      if (!edge) return 0;
      const shared = mesh.edges[edge.edgeId];
      const otherId = members.has(shared.leftFace ?? "") ? shared.rightFace : shared.leftFace;
      const other = otherId ? mesh.faces[otherId] : null;
      return Math.max(3, ctx.clearance.get(edge.edgeId) ?? 0, other && other.properties.water !== "land" ? 6 : 0);
    });
    const safe = insetConvexKernel(part, setbacks);
    if (safe.length < 3 || Math.abs(polygonArea(safe)) < 65) continue;
    const roadFrontages = boundary
      .filter(ref => ctx.roads.has(ref.edgeId))
      .map(ref => {
        const edge = mesh.edges[ref.edgeId];
        return [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point] as Point[];
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
    const rng = makeRng(
      `${seed ?? (outskirts ? "outskirts-v1" : "core-blocks-v1")}:${face.id}:${face.properties.ward}:${part[0].join(",")}`
    );
    const lotArea =
      parameters?.lotArea ??
      (classic
        ? face.properties.ward === "castle"
          ? 1200
          : face.properties.ward === "merchant"
            ? 220
            : 150
        : dwellingLotArea(face.properties.ward));
    const grown = (outskirts ? infillOutskirts : infillCore)(
      safe,
      frontageEdges,
      portals,
      {
        lotArea,
        laneWidth: parameters?.laneWidth ?? 3,
        coverage: parameters?.coverage ?? 0.75,
        occupancy: parameters?.occupancy ?? (outskirts ? 0.82 : 0.965),
        build,
        orientation: parameters?.orientation,
        classic
      },
      rng
    );
    for (const points of grown.lanes)
      local.lanes.push({ faceId: face.id, points, widthMeters: parameters?.laneWidth ?? 3 });
    const landmark = face.properties.ward === "castle";
    for (const outline of grown.buildings) local.buildings.push({ faceId: face.id, polygon: outline, landmark });
  }
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
