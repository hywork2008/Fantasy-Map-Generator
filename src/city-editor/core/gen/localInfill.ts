// Local street/lot geometry. None of these subdivisions become mesh edges.
import { facePoints, indexMeshEdges } from "../mesh";
import type { CityDocument, DistrictParameters, EdgeRef, Face, Id, Point } from "../types";
import { type BuildingLot, buildingHitsCivicLandmark, laneHitsCivicLandmark } from "./buildingLots";
import { buildCirculadeBlocks } from "./circuladeFabric";
import { districtBoundary } from "./fabricDistricts";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { dwellingLotArea } from "./housing";
import { convexInfillParts, insetConvexKernel } from "./lotGeometry";
import type { OrganicBlockContext } from "./organicBlocks";
import { ORGANIC_LANE_FACADE_CLEARANCE } from "./organicBlocks";
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
  kind?: "open-field" | "kitchen-garden";
}
export interface CityFabric {
  parcels?: import("./parcelTypes").ParcelPlan[];
  openSpaces?: import("./parcelTypes").OpenSpace[];
  harbor?: import("./harborFabric").HarborPlan;
  farms?: FarmPlot[];
  parks?: import("./parkFabric").ParkLawn[];
  watermills?: import("./watermillFabric").WatermillPlan;
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
const onSegment = (p: Point, a: Point, b: Point) => nearestOnPolyline(p, [a, b]).dist < 1e-5;

export { convexInfillParts } from "./lotGeometry";

/** Reachable face portals form a forest rooted at real major-road frontages. */
export function buildLocalFabric(document: CityDocument, options?: InfillOptions): CityFabric {
  const fabric: CityFabric = { buildings: [], lanes: [], entrances: new Map() };
  const { mesh } = document;
  const edges = indexMeshEdges(mesh);
  const roads = new Set<Id>(),
    barriers = new Set<Id>(),
    walls = new Set<Id>();
  const clearance = new Map<Id, number>();
  const rivers: { points: Point[]; width: number }[] = [];
  const organicContext: OrganicBlockContext = {
    hub: options?.hub ?? document.elements.find(e => e.kind === "plaza")?.point ?? [0, 0],
    extentMeters: document.frame.extentMeters,
    walls: document.featureGroups.flatMap(g =>
      g.kind === "wall"
        ? g.segments.flatMap(ref => {
            const edge = mesh.edges[ref.edgeId];
            return edge ? [[mesh.vertices[edge.a].point, mesh.vertices[edge.b].point] as [Point, Point]] : [];
          })
        : []
    )
  };
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
      if (group.kind === "wall") walls.add(id);
      // Roads are represented by their centre line. Houses belong at the road
      // edge, whereas walls and rivers need their own protective clearance.
      const clearanceMeters =
        group.kind === "road" ? group.style.widthMeters / 2 + 0.35 : group.style.widthMeters / 2 + 3;
      clearance.set(id, Math.max(clearance.get(id) ?? 0, clearanceMeters));
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
      .filter(
        f =>
          f.properties.water === "land" &&
          f.properties.buildable &&
          f.properties.ward !== "farm" &&
          !(document.castles?.length && f.properties.ward === "castle")
      )
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
  const expandReachability = (startCursor: number) => {
    for (let cursor = startCursor; cursor < queue.length; cursor++) {
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
  };

  expandReachability(0);

  // Recover isolated pockets of buildable urban land within the settlement core
  // (e.g. across a river or within walls) that were not reached from the major road frontages.
  if (queue.length > 0) {
    const unreachedUrban = () =>
      [...land].filter(id => !reached.has(id) && mesh.faces[id].properties.settlement !== "outskirts");

    let unreached = unreachedUrban();
    while (unreached.length > 0) {
      let bestFaceId: Id | null = null;
      let bestEdgeId: Id | null = null;
      let bestPriority = -1;
      let bestDistToHub = Infinity;

      for (const fid of unreached) {
        const face = mesh.faces[fid];
        for (const ref of face.boundary) {
          const edge = mesh.edges[ref.edgeId];
          if (walls.has(edge.id) || edge.locked || face.properties.locked) continue;
          const other = edge.leftFace === fid ? edge.rightFace : edge.leftFace;
          if (other && mesh.faces[other].properties.locked) continue;
          let priority = 0;
          if (roads.has(edge.id)) {
            priority = 2;
          } else if (other && reached.has(other)) {
            priority = 1;
          } else {
            continue;
          }
          const m = edgeMid(edge.id);
          const d = distance(m, organicContext.hub);
          if (priority > bestPriority || (priority === bestPriority && d < bestDistToHub)) {
            bestPriority = priority;
            bestDistToHub = d;
            bestFaceId = fid;
            bestEdgeId = edge.id;
          }
        }
      }

      if (!bestFaceId || !bestEdgeId) {
        break;
      }

      add(bestFaceId, edgeMid(bestEdgeId));
      if (!barriers.has(bestEdgeId)) {
        const edge = mesh.edges[bestEdgeId];
        const other = edge.leftFace === bestFaceId ? edge.rightFace : edge.leftFace;
        if (other && land.has(other)) {
          add(other, edgeMid(bestEdgeId));
        }
      }
      reached.add(bestFaceId);
      const startCursor = queue.length;
      queue.push(bestFaceId);
      expandReachability(startCursor);
      unreached = unreachedUrban();
    }
  }
  const grouped = new Set<Id>();
  for (const ids of outskirtsComponents(
    queue.filter(id => mesh.faces[id].properties.settlement === "outskirts"),
    mesh,
    barriers,
    !document.fabric && options?.layout !== "classic"
  )) {
    if (
      options?.layout !== "classic" &&
      paintOutskirtsUnion(document, ids, fabric, {
        document,
        roads,
        barriers,
        clearance,
        rivers,
        options,
        organicContext
      })
    )
      for (const id of ids) grouped.add(id);
  }
  for (const id of queue) {
    if (grouped.has(id)) continue;
    paintFace(document, id, fabric, { document, roads, barriers, clearance, rivers, options, organicContext });
  }
  // Reserved squares need their public perimeter even when they are excluded
  // from the buildable-face reachability queue.
  if (options?.layout === "organic") {
    const plazas = new Set(document.elements.filter(e => e.kind === "plaza").flatMap(e => e.faceIds));
    for (const id of plazas) {
      if (reached.has(id) || !mesh.faces[id] || mesh.faces[id].properties.water !== "land") continue;
      paintFace(document, id, fabric, { document, roads, barriers, clearance, rivers, options, organicContext });
    }
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
  organicContext: OrganicBlockContext;
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
    return [ctx.roads.has(edge.id), ctx.barriers.has(edge.id), ctx.clearance.get(edge.id), other?.properties.water];
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
    .map(b => ({ ...b, faceId: owner(polygonCentroid(b.polygon)), polygon: cleanBuildingPolygon(b.polygon) }))
    .filter(
      b =>
        b.polygon.length >= 4 &&
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
  const boundaries = face.boundary.map((ref, i) => {
    const edge = mesh.edges[ref.edgeId];
    const other = mesh.faces[(edge.leftFace === id ? edge.rightFace : edge.leftFace) ?? ""];
    const plazaFront =
      ctx.options?.layout === "organic" &&
      !!other &&
      document.elements.some(e => e.kind === "plaza" && e.faceIds.includes(other.id));
    return {
      a: polygon[i],
      b: polygon[(i + 1) % polygon.length],
      setback: Math.max(
        (parameters?.laneWidth ?? 3) / 2 + 0.35,
        ctx.clearance.get(ref.edgeId) ?? 0,
        other && other.properties.water !== "land" ? 6 : 0
      ),
      // The square emits its own perimeter once. Adjacent houses still treat
      // it as public frontage, and internal seams of multi-face squares vanish.
      feature: ctx.roads.has(ref.edgeId) || ctx.barriers.has(ref.edgeId) || plazaFront,
      barrier: ctx.barriers.has(ref.edgeId) || (!!other && other.properties.water !== "land")
    };
  });
  const dependencies = face.boundary.map(ref => {
    const edge = mesh.edges[ref.edgeId];
    const other = mesh.faces[(edge.leftFace === id ? edge.rightFace : edge.leftFace) ?? ""];
    return [ctx.roads.has(edge.id), ctx.barriers.has(edge.id), ctx.clearance.get(edge.id), other?.properties.water];
  });
  const isCirculade = ctx.options?.layout === "circulade";
  const isClassic = ctx.options?.layout === "classic";
  const key = ctx.options
    ? JSON.stringify([
        isClassic
          ? "district-infill-classic-v3"
          : outskirts
            ? "outskirts-face-v3"
            : ["district-organic-network-v4", ORGANIC_LANE_FACADE_CLEARANCE],
        ctx.options.seed,
        id,
        face.properties,
        polygon,
        entries,
        parameters,
        dependencies,
        boundaries,
        nearbyRivers,
        reserved,
        !isClassic && !outskirts ? ctx.organicContext : null
      ])
    : "";
  if (reserved) {
    const plaza = document.elements.some(e => e.kind === "plaza" && e.faceIds.includes(id));
    const perimeter =
      plaza && !isClassic && !isCirculade
        ? buildPerimeterBlocks(
            face,
            polygon,
            boundaries,
            parameters,
            ctx.options?.seed ?? "plaza-infill",
            false,
            false,
            ctx.organicContext
          )
        : { buildings: [], lanes: [], entrances: new Map() };
    if (key) ctx.options?.cache.set(key, perimeter);
    fabric.lanes.push(...perimeter.lanes);
    return;
  }

  const cached = ctx.options?.cache.get(key);
  if (cached) {
    fabric.buildings.push(...cached.buildings);
    fabric.lanes.push(...cached.lanes);
    return;
  }
  const local: CityFabric =
    isClassic || (!outskirts && face.properties.ward !== "castle")
      ? isCirculade
        ? buildCirculadeBlocks(
            face,
            polygon,
            boundaries,
            parameters,
            ctx.options?.seed ?? "circulade-infill",
            buildableFace(face) && !reserved,
            ctx.options?.hub ?? [0, 0]
          )
        : buildPerimeterBlocks(
            face,
            polygon,
            boundaries,
            parameters,
            ctx.options?.seed ?? "block-infill",
            buildableFace(face) && !reserved,
            isClassic,
            ctx.organicContext
          )
      : { buildings: [], lanes: [], entrances: new Map() };
  if (!isClassic && (outskirts || face.properties.ward === "castle"))
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
  local.buildings = local.buildings
    .map(b => ({ ...b, polygon: cleanBuildingPolygon(b.polygon) }))
    .filter(
      b =>
        b.polygon.length >= 4 &&
        b.polygon.every(p => pointInPolygon(p, polygon)) &&
        !nearbyRivers.some(r => b.polygon.some(p => nearestOnPolyline(p, r.points).dist < r.width / 2 + 2))
    );
  ctx.options?.cache.set(key, local);
  fabric.buildings.push(...local.buildings);
  fabric.lanes.push(...local.lanes);
}

function cleanBuildingPolygon(polygon: Point[]): Point[] {
  const merged: Point[] = [];
  for (const p of polygon) {
    if (!merged.some(u => distance(u, p) < 0.35)) {
      merged.push(p);
    }
  }
  return merged.length >= 3 ? merged : polygon;
}

function buildableFace(face: Face): boolean {
  return !!face.properties.ward && !["park", "farm", "cemetery", "empty"].includes(face.properties.ward);
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
            ? 140
            : 110
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
