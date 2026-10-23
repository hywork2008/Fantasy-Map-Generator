// Wearing-course ribbons for the CE 3D view. The surface is derived at draw
// time. three.js stays out of this file, and Route.surface is not read.

import {
  classifyRoadSurface,
  type RoadGradeClass,
  type RoadPlace,
  type RoadRibbon,
  roadMeans,
  roadSphere
} from "../../utils/roadSurface";
import type { InfillLane } from "../types/contracts/localInfill";
import type { CityDocument, Edge, Face, Id, Point } from "../types/document";
import { riverConnectionFacts } from "./approachFacts";
import { riverRibbons, roadRunsOutsideRivers } from "./bridgeDeck";
import { clipPolylineToExterior, clipPolylineToInterior, outerWallRing } from "./concealStreets";
import { featureGroupVertices } from "./features";
import { frameRoadTownConnection } from "./generation/routing/frameRoadConnection";
import { pointInPolygon, polygonCentroid } from "./geom";
import { facePoints, incidentFaces } from "./mesh";
import { MoatRoadSplitter } from "./moatRoadFacts";
import { physicalRoadRuns, roadPathVertices } from "./roadNetwork";
import { defaultRoadWidthMeters, townExtentMeters } from "./settlementExtent";
import { dryRuns, waterPolygons } from "./waterGeometry";

const MIN_RUN_METERS = 0.4;
const TRAIL_WIDTH_SCALE = 0.65;
const SAMPLE_METERS = 2;
const MESH_HIT_METERS = 0.05;
const CIVIC_RADIUS_METERS = 40;
const CELL_METERS = 1;
const FACE_CELL_METERS = 16;

type LineGroup = "roads" | "trails" | "local";
type LandRank = "none" | "outskirts" | "inland" | "core";

interface Part {
  points: Point[];
  place: RoadPlace;
}

interface SurfaceContext {
  period: NonNullable<CityDocument["historicalPeriod"]>;
  sphere: ReturnType<typeof roadSphere>;
  means: ReturnType<typeof roadMeans>;
  wetland: boolean;
  upland: boolean;
  dry: boolean;
  population: number;
  commerceRank: number | null;
  capital: boolean;
  marketCenter: boolean;
}

const RANK_VALUE: Record<LandRank, number> = { none: 0, outskirts: 1, inland: 2, core: 3 };
const WETLAND_KEYS = new Set(["wetland", "mangrove", "borealPeatland", "floodedForest"]);
const UPLAND_KEYS = new Set(["montaneForest", "alpineTundra", "cloudForest"]);
const DRY_KEYS = new Set(["hotDesert", "coldDesert"]);

/** Mesh roads, dry frame arms, dry river approaches, and fabric lanes. */
export function collectTownRoads(document: CityDocument, lanes: readonly InfillLane[]): RoadRibbon[] {
  const context = surfaceContext(document);
  const wall = outerWallRing(document);
  const anchors = civicAnchors(document);
  const land = new LandIndex(document);
  const water = waterPolygons(document);
  const rivers = riverRibbons(document);
  const splitter = new MoatRoadSplitter(document);
  const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
  const ribbons: RoadRibbon[] = [];

  const emit = (parts: Part[], group: LineGroup, meters: number, grade: RoadGradeClass = "cart") => {
    for (const part of applyCivic(parts, anchors)) {
      if (polylineLength(part.points) < MIN_RUN_METERS) continue;
      const draw = part.place === "trail" ? meters * TRAIL_WIDTH_SCALE : meters;
      if (!(draw >= MIN_RUN_METERS)) continue;
      ribbons.push({
        centerline: part.points.map(point => [point[0], point[1]]),
        widthMeters: draw,
        gradeClass: part.place === "trail" ? "path" : grade,
        surface: classifyRoadSurface({
          period: context.period,
          sphere: context.sphere,
          means: context.means,
          place: part.place,
          group,
          wetland: context.wetland,
          upland: context.upland,
          dry: context.dry,
          stoneRoads: "unknown"
        }).id
      });
    }
  };

  const emitLine = (line: Point[], group: LineGroup, meters: number, moat: boolean) => {
    if (!(meters > 0) || !Number.isFinite(meters) || line.length < 2) return;
    let runs = moat && rivers.length ? roadRunsOutsideRivers(line, rivers, meters) : [line];
    runs = runs.flatMap(run => dryRuns(run, water));
    if (moat) runs = splitter.dryRuns(runs, meters);
    for (const run of runs) {
      if (run.length < 2) continue;
      emit(placesFor(run, group, wall, land), group, meters);
    }
  };

  for (const { group, segments } of physicalRoadRuns(document, group => !group.id.startsWith("gc:bridge-"))) {
    const line = roadPathVertices(document.mesh, segments).map(id => document.mesh.vertices[id].point);
    const lineGroup = group.sourceRoad
      ? importedGroup(document, group.sourceRoad.index, group.sourceRoad.routeId)
      : "local";
    emitLine(line, lineGroup, group.style.widthMeters, true);
  }

  for (const leg of document.frameRoads ?? []) {
    const lineGroup = importedGroup(document, leg.sourceIndex, leg.routeId);
    const stub = frameRoadTownConnection(document, leg);
    if (stub) emitLine(stub, lineGroup, width, false);
    for (const piece of leg.pieces) {
      if (piece.kind !== "road") continue;
      emitLine(piece.points, lineGroup, width, false);
    }
  }

  for (const fact of riverConnectionFacts(document, false)) {
    const lineGroup = importedGroup(
      document,
      fact.connection.sourceIndex,
      routeIdForSource(document, fact.connection.sourceIndex)
    );
    emitLine(fact.townRoad, lineGroup, width, false);
    emitLine(fact.farRoad, lineGroup, width, false);
  }

  for (const lane of lanes) {
    if (!(lane.widthMeters > 0) || !Number.isFinite(lane.widthMeters)) continue;
    const face = document.mesh.faces[lane.faceId];
    const place: RoadPlace = face?.properties.settlement === "outskirts" ? "trail" : "street";
    for (const run of dryRuns(lane.points, water)) {
      if (run.length < 2) continue;
      emit([{ points: run, place }], "local", lane.widthMeters, "lane");
    }
  }

  return ribbons;
}

/**
 * Inputs that change a ribbon: centre lines, and the clip and place inputs
 * from the road-surface plan. Coordinates are rounded to 1 m. Widths and
 * frame sizes stay raw. This string is not townWaterStamp.
 */
export function townRoadStamp(
  document: CityDocument,
  lanes: readonly { points: readonly (readonly [number, number])[]; widthMeters: number }[]
): string {
  const context = surfaceContext(document);
  const roads = document.featureGroups.flatMap(group => {
    if (group.kind !== "road") return [];
    return [
      {
        width: group.style.widthMeters,
        sourceRoad: group.sourceRoad
          ? {
              index: group.sourceRoad.index,
              routeId: group.sourceRoad.routeId,
              terminal: group.sourceRoad.terminal ?? null
            }
          : null,
        line: roundLine(resolvedPoints(document, group))
      }
    ];
  });
  const frameRoads = (document.frameRoads ?? []).map(leg => ({
    sourceIndex: leg.sourceIndex,
    routeId: leg.routeId,
    pieces: leg.pieces.map(piece => ({ kind: piece.kind, points: roundLine(piece.points) }))
  }));
  const riverConnections = (document.riverConnections ?? []).map(connection => ({
    town: roundLine(connection.townRoad),
    far: roundLine(connection.farRoad)
  }));
  const laneLines = lanes.map(lane => ({ width: lane.widthMeters, points: roundLine(lane.points) }));
  const rivers = document.featureGroups
    .filter(group => group.kind === "river")
    .map(group => ({ width: group.style.widthMeters, line: roundLine(resolvedPoints(document, group)) }));
  const water = waterPolygons(document).map(ring => roundLine(ring));
  const moats = (document.defenseCircuits ?? []).map(circuit => ({
    enabled: circuit.moat?.enabled ?? false,
    widthMeters: circuit.moat?.widthMeters ?? null,
    scope: circuit.scope,
    ownerCastleId: circuit.ownerCastleId ?? null,
    areaFaceIds: circuit.areaFaceIds,
    wallGroupIds: circuit.wallGroupIds,
    areaRings: circuit.areaFaceIds.map(id => {
      const face = document.mesh.faces[id];
      return face ? roundLine(facePoints(document.mesh, face)) : [];
    })
  }));
  const gates = document.gates.map(gate => ({
    vertexId: gate.vertexId,
    passageWidthMeters: gate.passageWidthMeters ?? null,
    ownerCastleId: gate.ownerCastleId ?? null
  }));
  const walls = document.featureGroups
    .filter(group => group.kind === "wall")
    .map(group => ({ width: group.style.widthMeters, line: roundLine(resolvedPoints(document, group)) }));
  const land = Object.values(document.mesh.faces)
    .filter(face => face.properties.water === "land")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(face => ({
      id: face.id,
      settlement: face.properties.settlement ?? null,
      water: face.properties.water,
      ring: roundLine(facePoints(document.mesh, face))
    }));
  const descriptorRoads = (document.fabric?.generation?.settings?.descriptor?.roads ?? []).map((entry, index) => ({
    index,
    routeId: entry.routeId,
    group: entry.group
  }));
  return JSON.stringify({
    roads,
    frameRoads,
    riverConnections,
    lanes: laneLines,
    rivers,
    water,
    moats,
    gates,
    walls,
    extentMeters: document.frame.extentMeters,
    settlementExtentMeters: document.frame.settlementExtentMeters ?? null,
    blockSizeMeters: document.frame.blockSizeMeters,
    land,
    period: context.period,
    tradition: document.civilization?.tradition ?? null,
    faith: document.civilization?.faith ?? null,
    fortification: document.civilization?.fortification ?? null,
    population: context.population,
    commerceRank: context.commerceRank,
    capital: context.capital,
    marketCenter: context.marketCenter,
    biomeKey: document.biome?.key ?? null,
    biomeTags: [...(document.biome?.tags ?? [])],
    descriptorRoads,
    anchors: civicAnchors(document).map(point => [Math.round(point[0]), Math.round(point[1])])
  });
}

function placesFor(line: Point[], group: LineGroup, wall: Point[] | null, land: LandIndex): Part[] {
  if (group === "trails") return [{ points: line, place: "trail" }];
  if (wall) {
    const parts: Part[] = [];
    for (const points of clipPolylineToExterior(line, wall))
      if (points.length >= 2) parts.push({ points, place: "highway" });
    for (const points of clipPolylineToInterior(line, wall))
      if (points.length >= 2) parts.push({ points, place: "arterial" });
    return parts;
  }
  return samplePlaces(line, land);
}

function samplePlaces(line: Point[], land: LandIndex): Part[] {
  const parts: Part[] = [];
  let current: Point[] | null = null;
  let place: RoadPlace | null = null;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4) continue;
    const next: RoadPlace = segmentArterial(a, b, land) ? "arterial" : "highway";
    if (current && place === next) current.push(b);
    else {
      if (current && place && current.length >= 2) parts.push({ points: current, place });
      current = [a, b];
      place = next;
    }
  }
  if (current && place && current.length >= 2) parts.push({ points: current, place });
  return parts;
}

function segmentArterial(a: Point, b: Point, land: LandIndex): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const samples: Point[] = [a];
  if (length >= SAMPLE_METERS) {
    for (let distance = SAMPLE_METERS; distance < length - 1e-6; distance += SAMPLE_METERS)
      samples.push([a[0] + (dx * distance) / length, a[1] + (dy * distance) / length]);
  }
  samples.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b);
  return samples.some(sample => {
    const rank = land.rankAt(sample);
    return rank === "core" || rank === "inland";
  });
}

function applyCivic(parts: Part[], anchors: readonly Point[]): Part[] {
  if (!anchors.length) return parts;
  const out: Part[] = [];
  for (const part of parts) {
    if (part.place !== "arterial" && part.place !== "street") {
      out.push(part);
      continue;
    }
    out.push(...splitCivic(part, anchors));
  }
  return mergeParts(out);
}

function splitCivic(part: Part, anchors: readonly Point[]): Part[] {
  const pieces: Part[] = [];
  let chain: Point[] | null = null;
  let chainPlace: RoadPlace | null = null;
  const flush = () => {
    if (chain && chainPlace && chain.length >= 2) pieces.push({ points: chain, place: chainPlace });
    chain = null;
    chainPlace = null;
  };
  for (let i = 0; i + 1 < part.points.length; i++) {
    const a = part.points[i];
    const b = part.points[i + 1];
    const marks = [0, ...civicCuts(a, b, anchors), 1];
    for (let k = 0; k + 1 < marks.length; k++) {
      const t0 = marks[k];
      const t1 = marks[k + 1];
      if (t1 - t0 < 1e-8) continue;
      const start = t0 === 0 ? a : lerp(a, b, t0);
      const end = t1 === 1 ? b : lerp(a, b, t1);
      const mid = lerp(a, b, (t0 + t1) / 2);
      const place: RoadPlace = nearest(mid, anchors) <= CIVIC_RADIUS_METERS ? "civic" : part.place;
      if (chain && chainPlace === place) chain.push(end);
      else {
        flush();
        chain = [start, end];
        chainPlace = place;
      }
    }
  }
  flush();
  return pieces;
}

function civicCuts(a: Point, b: Point, anchors: readonly Point[]): number[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const qa = dx * dx + dy * dy;
  if (qa < 1e-12) return [];
  const ts: number[] = [];
  for (const anchor of anchors) {
    const ex = a[0] - anchor[0];
    const ey = a[1] - anchor[1];
    const qb = 2 * (ex * dx + ey * dy);
    const qc = ex * ex + ey * ey - CIVIC_RADIUS_METERS * CIVIC_RADIUS_METERS;
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    for (const t of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  const unique: number[] = [];
  for (const t of ts) if (!unique.length || t - unique[unique.length - 1] > 1e-4) unique.push(t);
  return unique;
}

function mergeParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const part of parts) {
    if (part.points.length < 2) continue;
    const previous = out[out.length - 1];
    const join = previous?.points[previous.points.length - 1];
    if (previous && previous.place === part.place && join && samePoint(join, part.points[0]))
      previous.points.push(...part.points.slice(1));
    else out.push({ place: part.place, points: [...part.points] });
  }
  return out;
}

/** A passed index that fails to match is a trail, never a local street. */
function importedGroup(document: CityDocument, index: number, routeId: number | undefined): "roads" | "trails" {
  const entry = document.fabric?.generation?.settings?.descriptor?.roads?.[index];
  if (!entry) return "trails";
  if (routeId !== undefined && entry.routeId !== routeId) return "trails";
  return entry.group === "roads" ? "roads" : "trails";
}

function routeIdForSource(document: CityDocument, sourceIndex: number): number | undefined {
  const ids = new Set<number>();
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || group.sourceRoad?.index !== sourceIndex) continue;
    ids.add(group.sourceRoad.routeId);
  }
  if (ids.size !== 1) return undefined;
  return [...ids][0];
}

function surfaceContext(document: CityDocument): SurfaceContext {
  const period = document.historicalPeriod ?? "ageOfExploration";
  const civilization = document.civilization;
  const population = resolvedPopulation(document);
  const economy = document.siteEconomy;
  const commerceRank = economy && Number.isFinite(economy.commerce.rank) ? economy.commerce.rank : null;
  const capital = document.fabric?.generation?.settings?.descriptor?.burg?.capital === true;
  const marketCenter = economy?.commerce.marketCenter === true;
  const tags = new Set(document.biome?.tags ?? []);
  const key = document.biome?.key;
  return {
    period,
    sphere: roadSphere(
      civilization?.tradition ?? null,
      civilization?.fortification ?? null,
      civilization?.faith ?? null,
      period
    ),
    means: roadMeans({ population, commerceRank, capital, marketCenter }),
    wetland: tags.has("wetland") || (key !== undefined && WETLAND_KEYS.has(key)),
    upland: tags.has("mountain") || tags.has("snow") || (key !== undefined && UPLAND_KEYS.has(key)),
    dry: tags.has("desert") || (key !== undefined && DRY_KEYS.has(key)),
    population,
    commerceRank,
    capital,
    marketCenter
  };
}

function resolvedPopulation(document: CityDocument): number {
  const burg = document.fabric?.generation?.settings?.descriptor?.burg?.population;
  if (typeof burg === "number" && Number.isFinite(burg)) return burg;
  const baseline = document.urbanMorphology?.baselinePopulation;
  if (typeof baseline === "number" && Number.isFinite(baseline)) return baseline;
  const target = document.populationPlan?.settings.targetPopulation;
  if (typeof target === "number" && Number.isFinite(target)) return target;
  return 0;
}

function civicAnchors(document: CityDocument): Point[] {
  const anchors: Point[] = [];
  for (const element of document.elements) {
    if (element.kind !== "plaza" && element.kind !== "temple") continue;
    if (element.point && Number.isFinite(element.point[0]) && Number.isFinite(element.point[1])) {
      anchors.push([element.point[0], element.point[1]]);
      continue;
    }
    const centers: Point[] = [];
    for (const id of element.faceIds) {
      const face = document.mesh.faces[id];
      if (!face) continue;
      const ring = facePoints(document.mesh, face);
      if (ring.length >= 3) centers.push(polygonCentroid(ring));
    }
    if (!centers.length) continue;
    anchors.push([
      centers.reduce((sum, point) => sum + point[0], 0) / centers.length,
      centers.reduce((sum, point) => sum + point[1], 0) / centers.length
    ]);
  }
  return anchors;
}

function resolvedPoints(document: CityDocument, group: CityDocument["featureGroups"][number]): Point[] {
  if (group.kind === "river") {
    return group.vertices.flatMap(id => {
      const point = document.mesh.vertices[id]?.point;
      return point ? [point] : [];
    });
  }
  return featureGroupVertices(document, group).flatMap(id => {
    const point = document.mesh.vertices[id]?.point;
    return point ? [point] : [];
  });
}

class LandIndex {
  private readonly vertices = new Map<string, Id[]>();
  private readonly edges = new Map<string, Edge[]>();
  private readonly faces = new Map<
    string,
    { face: Face; ring: Point[]; minX: number; minY: number; maxX: number; maxY: number }[]
  >();

  constructor(private readonly document: CityDocument) {
    for (const vertex of Object.values(document.mesh.vertices)) this.push(this.vertices, vertex.point, vertex.id);
    for (const edge of Object.values(document.mesh.edges)) {
      const a = document.mesh.vertices[edge.a]?.point;
      const b = document.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const seen = new Set<string>();
      visitSegmentCells(a, b, (ix, iy) => {
        const key = `${ix},${iy}`;
        if (seen.has(key)) return;
        seen.add(key);
        const list = this.edges.get(key);
        if (list) list.push(edge);
        else this.edges.set(key, [edge]);
      });
    }
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water !== "land") continue;
      const ring = facePoints(document.mesh, face);
      if (ring.length < 3) continue;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const point of ring) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
      const record = { face, ring, minX, minY, maxX, maxY };
      const x0 = Math.floor(minX / FACE_CELL_METERS);
      const x1 = Math.floor(maxX / FACE_CELL_METERS);
      const y0 = Math.floor(minY / FACE_CELL_METERS);
      const y1 = Math.floor(maxY / FACE_CELL_METERS);
      for (let iy = y0; iy <= y1; iy++) {
        for (let ix = x0; ix <= x1; ix++) {
          const key = `${ix},${iy}`;
          const list = this.faces.get(key);
          if (list) list.push(record);
          else this.faces.set(key, [record]);
        }
      }
    }
  }

  rankAt(point: Point): LandRank {
    const vertices = this.nearby(this.vertices, point).filter(id => {
      const vertex = this.document.mesh.vertices[id];
      return vertex && Math.hypot(vertex.point[0] - point[0], vertex.point[1] - point[1]) <= MESH_HIT_METERS;
    });
    if (vertices.length) {
      let rank: LandRank = "none";
      for (const id of vertices)
        for (const face of incidentFaces(this.document.mesh, id)) rank = higher(rank, rankOf(face));
      return rank;
    }
    const edges = this.nearby(this.edges, point).filter(edge => {
      const a = this.document.mesh.vertices[edge.a]?.point;
      const b = this.document.mesh.vertices[edge.b]?.point;
      return a && b && distanceToSegment(point, a, b) <= MESH_HIT_METERS;
    });
    if (edges.length) {
      let rank: LandRank = "none";
      for (const edge of edges) {
        rank = higher(rank, rankOf(edge.leftFace ? this.document.mesh.faces[edge.leftFace] : undefined));
        rank = higher(rank, rankOf(edge.rightFace ? this.document.mesh.faces[edge.rightFace] : undefined));
      }
      return rank;
    }
    const ix = Math.floor(point[0] / FACE_CELL_METERS);
    const iy = Math.floor(point[1] / FACE_CELL_METERS);
    let rank: LandRank = "none";
    for (const record of this.faces.get(`${ix},${iy}`) ?? []) {
      if (point[0] < record.minX || point[0] > record.maxX || point[1] < record.minY || point[1] > record.maxY)
        continue;
      if (!pointInPolygon(point, record.ring)) continue;
      rank = higher(rank, rankOf(record.face));
      if (rank === "core") break;
    }
    return rank;
  }

  private nearby<T>(grid: Map<string, T[]>, point: Point): T[] {
    const ix = Math.floor(point[0] / CELL_METERS);
    const iy = Math.floor(point[1] / CELL_METERS);
    const hits: T[] = [];
    for (let y = iy - 1; y <= iy + 1; y++)
      for (let x = ix - 1; x <= ix + 1; x++) hits.push(...(grid.get(`${x},${y}`) ?? []));
    return hits;
  }

  private push(grid: Map<string, Id[]>, point: Point, id: Id): void {
    const key = `${Math.floor(point[0] / CELL_METERS)},${Math.floor(point[1] / CELL_METERS)}`;
    const list = grid.get(key);
    if (list) list.push(id);
    else grid.set(key, [id]);
  }
}

function rankOf(face: Face | undefined): LandRank {
  if (!face) return "none";
  if (face.properties.water !== "land") return "none";
  if (face.properties.settlement === "core") return "core";
  if (face.properties.settlement === "outskirts") return "outskirts";
  return "inland";
}

function higher(a: LandRank, b: LandRank): LandRank {
  return RANK_VALUE[a] >= RANK_VALUE[b] ? a : b;
}

function visitSegmentCells(a: Point, b: Point, visit: (ix: number, iy: number) => void): void {
  let ix = Math.floor(a[0]);
  let iy = Math.floor(a[1]);
  const x1 = Math.floor(b[0]);
  const y1 = Math.floor(b[1]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Number.POSITIVE_INFINITY : (dx > 0 ? ix + 1 - a[0] : a[0] - ix) * tDeltaX;
  let tMaxY = dy === 0 ? Number.POSITIVE_INFINITY : (dy > 0 ? iy + 1 - a[1] : a[1] - iy) * tDeltaY;
  const limit = Math.abs(x1 - ix) + Math.abs(y1 - iy) + 1;
  for (let n = 0; n <= limit; n++) {
    visit(ix, iy);
    if (ix === x1 && iy === y1) return;
    if (tMaxX < tMaxY) {
      ix += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      iy += stepY;
      tMaxY += tDeltaY;
    } else {
      ix += stepX;
      iy += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
  }
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-12) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

function nearest(point: Point, anchors: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) best = Math.min(best, Math.hypot(point[0] - anchor[0], point[1] - anchor[1]));
  return best;
}

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function samePoint(a: Point, b: Point): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-4;
}

function roundLine(points: readonly (readonly [number, number])[]): number[][] {
  return points.map(point => [Math.round(point[0]), Math.round(point[1])]);
}
