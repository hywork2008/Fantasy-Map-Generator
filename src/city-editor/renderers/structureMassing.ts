import basilicaRecord from "../../buildings/catalogue/basilica-temple.json";
import { validateBuildingRecord } from "../../buildings/validate";
import { catalogueMassing } from "../../city3d/core/catalogueMassing";
import { withinBridgeSkewLimit } from "../../utils/bridgeSkewPolicy";
import { bridgeDecks, documentBridgeSkewLimit, riverRibbons } from "../generators/bridgeDeck";
import type { BuildingLot } from "../generators/buildingLots.types";
import { featureGroupVertices } from "../generators/features";
import { boundaryEdges, boundaryRings, castleWallIds } from "../generators/fortifications";
import { nearestOnPolyline, polygonArea } from "../generators/geom";
import { templeFootprintMeters } from "../generators/housing";
import { transformLandmarkPolygons } from "../generators/landmarks";
import { edgeEnd } from "../generators/mesh";
import {
  GATE_TOWER_SCALE,
  type GateCrossingFrame,
  gateCrossingFrame,
  gateRoadDeviationDegrees
} from "../generators/passages";
import { defaultRoadWidthMeters, townExtentMeters } from "../generators/settlementExtent";
import type { StructureMassing, StructureMaterial, StructureRoof } from "../types/contracts/structureMassing";
import type {
  CastlePart,
  CityDocument,
  CityGate,
  EdgeFeatureGroup,
  Id,
  LandmarkPolygon,
  Point
} from "../types/document";
import { buildFortressPlan, createRotatedRect, type TowerGeometry } from "./castleLayoutBuilder";
import { resolveCastleStyle } from "./castlePatterns";
import { isNewStyleCastleCircuit, isNewStyleCastleGate, isNewStyleCastleWall } from "./castleStyle";
import { fortSiteStructures } from "./fortSiteMassing";
import { modularFortressOwnsCircuit, modularFortressOwnsWall, modularFortressStructures } from "./modularFortress";
import { resolveWallGeometry } from "./wallSvg";

const STONE_WALK = 8;
const STONE_BARE = 5;
const WOOD_WALK = 4.5;
const WOOD_BARE = 3.2;
const STONE_LIP = 1.1;
const WOOD_LIP = 0.8;
const SACRED = /church|cathedral|basilica|chapel|shrine|abbey|mosque|temple|stupa|minster/i;
const BASILICA_LENGTH = 54;
const BASILICA_WIDTH = 28;
const basilica = validateBuildingRecord(basilicaRecord);
if (!basilica.ok) throw new Error(`Invalid basilica catalogue record: ${basilica.errors.join("; ")}`);
const BASILICA_PARTS = catalogueMassing(basilica.record);
// The BV record is centred on its full bounds; CE anchors the nominal nave length.
const BASILICA_ORIGIN_X =
  Math.min(...BASILICA_PARTS.flatMap(part => part.footprint!.map(point => point[0]))) + BASILICA_LENGTH / 2;

function blank(
  values: Omit<
    StructureMassing,
    "parapet" | "parapetMeters" | "parapetWidthMeters" | "spire" | "baseElevationMeters" | "roof" | "material"
  > &
    Partial<StructureMassing>
): StructureMassing {
  return {
    material: "stone",
    baseElevationMeters: 0,
    roof: "none",
    parapet: "none",
    parapetMeters: 0,
    parapetWidthMeters: 0,
    spire: false,
    ...values
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function arcOf(points: Point[]): { ring: Point[]; cum: number[]; total: number; closed: boolean } {
  const closed = points.length > 3 && distance(points[0], points[points.length - 1]) < 0.05;
  const ring = closed ? points.slice(0, -1) : points.slice();
  const cum = [0];
  for (let i = 1; i < ring.length; i++) cum.push(cum[i - 1] + distance(ring[i - 1], ring[i]));
  const total = cum[cum.length - 1] + (closed ? distance(ring[ring.length - 1], ring[0]) : 0);
  return { ring, cum, total, closed };
}

function pointAlong(ring: Point[], cum: number[], total: number, closed: boolean, s: number): Point {
  const length = Math.max(total, 1e-6);
  let target = closed ? ((s % length) + length) % length : Math.max(0, Math.min(length, s));
  if (closed && target < 1e-6 && s > length * 0.5) target = length;
  const count = closed ? ring.length : ring.length - 1;
  for (let i = 0; i < count; i++) {
    const start = cum[i];
    const end = i + 1 < cum.length ? cum[i + 1] : total;
    if (target > end + 1e-4) continue;
    const span = end - start;
    const t = span < 1e-8 ? 0 : (target - start) / span;
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return ring[ring.length - 1] ?? ring[0];
}

function mergeIntervals(raw: [number, number][], total: number, closed: boolean): [number, number][] {
  const parts: [number, number][] = [];
  for (const [start, end] of raw) {
    if (end - start >= total - 1e-3) return [[0, total]];
    if (!closed) {
      const lo = Math.max(0, start);
      const hi = Math.min(total, end);
      if (hi > lo + 1e-4) parts.push([lo, hi]);
      continue;
    }
    const lo = ((start % total) + total) % total;
    const hi = ((end % total) + total) % total;
    if (Math.abs(lo - hi) < 1e-4) continue;
    if (hi < lo) parts.push([lo, total], [0, hi]);
    else parts.push([lo, hi]);
  }
  parts.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && part[0] <= last[1] + 1e-3) last[1] = Math.max(last[1], part[1]);
    else merged.push([part[0], part[1]]);
  }
  return merged;
}

function keptSpans(gaps: [number, number][], total: number, closed: boolean): [number, number][] {
  if (!gaps.length) return [[0, total]];
  const spans: [number, number][] = [];
  if (!closed) {
    let cursor = 0;
    for (const [lo, hi] of gaps) {
      if (lo > cursor + 1e-3) spans.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    }
    if (total > cursor + 1e-3) spans.push([cursor, total]);
    return spans;
  }
  for (let i = 0; i < gaps.length; i++) {
    const start = gaps[i][1];
    const end = i + 1 < gaps.length ? gaps[i + 1][0] : gaps[0][0] + total;
    if (end > start + 1e-3) spans.push([start, end]);
  }
  return spans;
}

function sampleSpan(ring: Point[], cum: number[], total: number, closed: boolean, start: number, end: number): Point[] {
  const run: Point[] = [pointAlong(ring, cum, total, closed, start)];
  // Keep arc distances increasing when a closed span crosses the ring origin.
  const laps = closed && end > total ? 2 : 1;
  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < ring.length; i++) {
      const s = cum[i] + lap * total;
      if (s > start + 1e-3 && s < end - 1e-3) run.push(ring[i]);
    }
  }
  const finish = pointAlong(ring, cum, total, closed, end);
  if (distance(run[run.length - 1], finish) > 0.05) run.push(finish);
  return run;
}

/** Centre line with gate openings removed. `index` is a vertex of `points`. */
export function cutWallOpenings(points: Point[], gaps: { index: number; half: number }[]): Point[][] {
  if (points.length < 2) return [];
  const { ring, cum, total, closed } = arcOf(points);
  if (!(total > 1)) return [];
  const raw: [number, number][] = [];
  for (const gap of gaps) {
    let index = gap.index;
    if (index < 0) continue;
    if (closed && index >= ring.length) index = 0;
    if (index >= ring.length) continue;
    raw.push([cum[index] - gap.half, cum[index] + gap.half]);
  }
  const intervals = mergeIntervals(raw, total, closed);
  return keptSpans(intervals, total, closed)
    .map(([start, end]) => sampleSpan(ring, cum, total, closed, start, end))
    .filter(
      run => run.length >= 2 && run.reduce((sum, point, i) => (i ? sum + distance(run[i - 1], point) : 0), 0) >= 0.8
    );
}

function wallPoints(document: CityDocument, group: EdgeFeatureGroup): Point[] {
  if (!group.segments.length) return [];
  const first = document.mesh.edges[group.segments[0].edgeId];
  if (!first) return [];
  const start = first[group.segments[0].forward ? "a" : "b"];
  if (!document.mesh.vertices[start]) return [];
  const points = [document.mesh.vertices[start].point];
  for (const segment of group.segments) {
    const endId = edgeEnd(document.mesh, segment);
    const end = document.mesh.vertices[endId]?.point;
    if (!end) return points.length >= 2 ? points : [];
    points.push(end);
  }
  return points;
}

function standing(document: CityDocument, wallId: Id): boolean {
  const circuits = (document.defenseCircuits ?? []).filter(circuit => circuit.wallGroupIds.includes(wallId));
  if (!circuits.length) return true;
  return circuits.some(circuit => circuit.state !== "razed");
}

function nearestVertex(points: Point[], point: Point): number {
  let index = -1;
  let best = 2;
  for (let i = 0; i < points.length; i++) {
    const gap = distance(points[i], point);
    if (gap < best) {
      best = gap;
      index = i;
    }
  }
  return index;
}

function openingWidth(document: CityDocument, gate: CityGate, wallWidth: number): number {
  let roadWidth = defaultRoadWidthMeters(townExtentMeters(document.frame));
  for (const group of document.featureGroups) {
    if (group.kind === "road" && featureGroupVertices(document, group).includes(gate.vertexId))
      roadWidth = Math.max(roadWidth, group.style.widthMeters);
  }
  const side = wallWidth * GATE_TOWER_SCALE;
  const deviation = gateRoadDeviationDegrees(document, gate.vertexId) ?? 0;
  const slant = Math.tan((Math.min(deviation, 20) * Math.PI) / 180);
  return (gate.passageWidthMeters ?? Math.max(roadWidth + 2.2, wallWidth * 0.9)) + side * slant;
}

function square(center: Point, along: Point, across: Point, side: number): Point[] {
  const half = side / 2;
  const corner = (sx: number, sy: number): Point => [
    center[0] + along[0] * sx + across[0] * sy,
    center[1] + along[1] * sx + across[1] * sy
  ];
  return [corner(-half, -half), corner(half, -half), corner(half, half), corner(-half, half)];
}

function circle(center: Point, radius: number): Point[] {
  const ring: Point[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ring.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return ring;
}

function inRiver(document: CityDocument, point: Point, wallWidth: number): boolean {
  return riverRibbons(document).some(
    river => nearestOnPolyline(point, river.points).dist < river.width / 2 + wallWidth
  );
}

function nearGate(document: CityDocument, point: Point, clearance: number): boolean {
  return (document.gates ?? []).some(gate => {
    const gatePoint = document.mesh.vertices[gate.vertexId]?.point;
    return !!gatePoint && distance(gatePoint, point) < clearance;
  });
}

function curtainTowers(
  document: CityDocument,
  group: EdgeFeatureGroup,
  points: Point[],
  height: number,
  out: StructureMassing[]
): void {
  if (isNewStyleCastleWall(document, group.id)) return;
  const spacing = castleWallIds(document).has(group.id) ? 32 : Math.max(45, document.frame.blockSizeMeters * 1.4);
  const radius = group.style.widthMeters * 0.8;
  const material: StructureMaterial = group.wallMaterial === "wood" ? "wood" : "stone";
  let until = spacing / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = distance(a, b);
    while (until < length) {
      const t = until / length;
      const position: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      until += spacing;
      if (inRiver(document, position, group.style.widthMeters)) continue;
      if (nearGate(document, position, group.style.widthMeters * 3)) continue;
      out.push(
        blank({
          id: `tower-${group.id}-${i}-${Math.round(until)}`,
          kind: "tower",
          material,
          footprint: circle(position, radius),
          heightMeters: height + 4,
          roof: material === "wood" ? "flat" : "pyramid"
        })
      );
    }
    until -= length;
  }
}

function cornerTowers(document: CityDocument, out: StructureMassing[]): void {
  const seen = new Set<Id>();
  for (const circuit of document.defenseCircuits ?? []) {
    if (
      circuit.scope !== "castle" ||
      circuit.state === "razed" ||
      isNewStyleCastleCircuit(document, circuit.id) ||
      modularFortressOwnsCircuit(document, circuit.id)
    )
      continue;
    const refs = boundaryRings(document.mesh, boundaryEdges(document.mesh, circuit.areaFaceIds))[0] ?? [];
    const points = refs.map(ref => {
      const edge = document.mesh.edges[ref.edgeId];
      return document.mesh.vertices[ref.forward ? edge.a : edge.b]?.point;
    });
    for (let i = 0; i < refs.length; i++) {
      const point = points[i];
      const edge = document.mesh.edges[refs[i].edgeId];
      const id = refs[i].forward ? edge?.a : edge?.b;
      if (!point || !id || seen.has(id)) continue;
      const previous = points[(i + points.length - 1) % points.length];
      const next = points[(i + 1) % points.length];
      if (!previous || !next) continue;
      const u: Point = [point[0] - previous[0], point[1] - previous[1]];
      const v: Point = [next[0] - point[0], next[1] - point[1]];
      const turn = Math.acos(
        Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1)))
      );
      if (turn < Math.PI / 6 || nearGate(document, point, 14)) continue;
      if (
        out.some(item => {
          if (item.kind !== "tower" || !item.footprint?.length) return false;
          const centre = item.footprint.reduce<Point>(
            (sum, corner) => [sum[0] + corner[0], sum[1] + corner[1]],
            [0, 0]
          );
          return distance([centre[0] / item.footprint.length, centre[1] / item.footprint.length], point) < 12;
        })
      )
        continue;
      const wall = document.featureGroups.find(
        group => group.kind === "wall" && group.segments.some(segment => segment.edgeId === refs[i].edgeId)
      );
      if (wall?.kind !== "wall" || !standing(document, wall.id)) continue;
      const material: StructureMaterial = wall.wallMaterial === "wood" ? "wood" : "stone";
      const profile = resolveWallGeometry(wall.style.widthMeters, material, wall.walkway);
      const body =
        (material === "wood"
          ? profile.hasWalkway
            ? WOOD_WALK
            : WOOD_BARE
          : profile.hasWalkway
            ? STONE_WALK
            : STONE_BARE) + 2;
      seen.add(id);
      out.push(
        blank({
          id: `castle-tower-${id}`,
          kind: "tower",
          material,
          footprint: circle(point, wall.style.widthMeters * 1.05),
          heightMeters: body + 4,
          roof: material === "wood" ? "flat" : "pyramid"
        })
      );
    }
  }
}

function shapeOf(ring: Point[]): { roof: StructureRoof; azimuth: number } {
  let longest = 0;
  let shortest = Infinity;
  let azimuth = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length > longest) {
      longest = length;
      azimuth = Math.atan2(dy, dx);
    }
    if (length > 0.05) shortest = Math.min(shortest, length);
  }
  const ratio = shortest < Infinity && shortest > 0 ? longest / shortest : 1;
  return { roof: ratio >= 1.45 ? "gable" : "hip", azimuth };
}

function footprintHeight(ring: Point[]): number {
  return Math.min(22, Math.max(7, Math.sqrt(Math.abs(polygonArea(ring))) * 0.55));
}

function pushFootprint(
  out: StructureMassing[],
  values: {
    id: string;
    kind: StructureMassing["kind"];
    name?: string;
    material?: StructureMaterial;
    ring: Point[];
    height: number;
    roof: StructureRoof;
    azimuth?: number;
    spire?: boolean;
  }
): void {
  if (values.ring.length < 3) return;
  out.push(
    blank({
      id: values.id,
      kind: values.kind,
      name: values.name,
      material: values.material ?? "stone",
      footprint: values.ring,
      heightMeters: values.height,
      roof: values.roof,
      ridgeAzimuth: values.azimuth ?? shapeOf(values.ring).azimuth,
      spire: values.spire ?? false
    })
  );
}

function addLandmarkPolygons(
  out: StructureMassing[],
  id: string,
  name: string | undefined,
  parts: LandmarkPolygon[],
  sacred: boolean
): void {
  let largest = -1;
  let largestArea = 0;
  parts.forEach((part, index) => {
    const area = Math.abs(polygonArea(part.outer));
    if (area > largestArea) {
      largestArea = area;
      largest = index;
    }
  });
  parts.forEach((part, index) => {
    const shape = shapeOf(part.outer);
    pushFootprint(out, {
      id: `${id}:${index}`,
      kind: "landmark",
      name,
      ring: part.outer,
      height: footprintHeight(part.outer),
      roof: shape.roof,
      azimuth: shape.azimuth,
      spire: sacred && index === largest
    });
  });
}

function addTemples(document: CityDocument, out: StructureMassing[]): void {
  const preset = templeFootprintMeters(townExtentMeters(document.frame));
  for (const element of document.elements ?? []) {
    if (element.kind !== "temple" || !element.point) continue;
    const length = element.sizeMeters && element.sizeMeters > 0 ? element.sizeMeters : preset.length;
    const width = length * (preset.width / preset.length);
    const type = element.templeType ?? (length < 24 ? "chapel" : "basilica");
    if (type === "basilica") {
      const scaleX = length / BASILICA_LENGTH;
      const scaleY = width / BASILICA_WIDTH;
      const rotation = element.rotation ?? 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const transform = ([x, y]: Point): Point => {
        const localX = (x - BASILICA_ORIGIN_X) * scaleX;
        const localY = y * scaleY;
        return [element.point![0] + localX * cos - localY * sin, element.point![1] + localX * sin + localY * cos];
      };
      for (const part of BASILICA_PARTS) {
        const ridge = part.ridgeAzimuth ?? 0;
        out.push({
          ...part,
          id: `temple:${element.id}:${part.id}`,
          footprint: part.footprint!.map(transform),
          holes: part.holes?.map(ring => ring.map(transform)),
          heightMeters: part.heightMeters * scaleX,
          baseElevationMeters: part.baseElevationMeters * scaleX,
          ridgeAzimuth: rotation + Math.atan2(Math.sin(ridge) * scaleY, Math.cos(ridge) * scaleX)
        });
      }
      continue;
    }
    const ring = createRotatedRect(element.point, length, width, element.rotation ?? 0);
    if (type === "megalith") {
      pushFootprint(out, { id: `temple:${element.id}`, kind: "landmark", ring, height: 2.2, roof: "flat" });
      continue;
    }
    if (type === "shrine") {
      pushFootprint(out, {
        id: `temple:${element.id}`,
        kind: "landmark",
        material: "wood",
        ring,
        height: 5.5,
        roof: "gable",
        azimuth: element.rotation ?? 0
      });
      continue;
    }
    pushFootprint(out, {
      id: `temple:${element.id}`,
      kind: "landmark",
      ring,
      height: 7,
      roof: "gable",
      azimuth: element.rotation ?? 0,
      spire: true
    });
  }
}

function addClassicPart(out: StructureMassing[], castleId: Id, part: CastlePart): void {
  const roof: StructureRoof = part.role === "keep" ? "pyramid" : "gable";
  const height = part.role === "keep" ? 16 : part.role === "chapel" ? 9 : 7;
  pushFootprint(out, { id: `castle:${castleId}:${part.id}`, kind: "landmark", ring: part.footprint, height, roof });
}

function planBuildingHeight(kind: string): { height: number; roof: StructureRoof } {
  if (kind === "main_keep") return { height: 18, roof: "pyramid" };
  if (kind === "small_keep") return { height: 12, roof: "pyramid" };
  if (kind === "great_hall" || kind === "palace_wing" || kind === "chapel") return { height: 9, roof: "gable" };
  return { height: 6, roof: "gable" };
}

function addFortress(document: CityDocument, out: StructureMassing[]): void {
  for (const castle of document.castles ?? []) {
    if (document.fortSite?.castleId === castle.id) continue;
    const modular = modularFortressStructures(document, castle);
    if (modular) {
      out.push(...modular);
      continue;
    }
    const profile = resolveCastleStyle(document, castle);
    const circuit = document.defenseCircuits?.find(item => item.id === castle.circuitId);
    if (profile.style === "classic") {
      if (circuit?.state === "razed") continue;
      for (const part of castle.parts) addClassicPart(out, castle.id, part);
      continue;
    }
    if (!circuit && !castle.siteFaceIds?.length && castle.courtyards.length === 0) continue;
    let plan: ReturnType<typeof buildFortressPlan>;
    try {
      plan = buildFortressPlan(document, castle, profile);
    } catch {
      continue;
    }
    const wallHeight = (plan.wallWidthMeters ?? 4.2) >= 2 ? STONE_WALK : STONE_BARE;
    plan.towers.forEach((tower, index) => {
      addPlanTower(out, tower, castle.id, index, wallHeight);
    });
    plan.buildings.forEach((building, index) => {
      const body = planBuildingHeight(building.kind);
      pushFootprint(out, {
        id: `castle:${castle.id}:${building.id || index}`,
        kind: "landmark",
        ring: building.polygon,
        height: body.height,
        roof: body.roof
      });
    });
  }
}

function addPlanTower(
  out: StructureMassing[],
  tower: TowerGeometry,
  castleId: Id,
  index: number,
  wallHeight: number
): void {
  const material: StructureMaterial = tower.kind === "wood_watchtower" ? "wood" : "stone";
  const low = tower.kind === "star_bastion";
  const height = low ? 6 : wallHeight + (tower.kind === "drum_tower" ? 6 : 4);
  const roof: StructureRoof = material === "wood" || low ? "flat" : "pyramid";
  const ring =
    tower.polygon && tower.polygon.length >= 3
      ? tower.polygon
      : tower.radius
        ? circle(tower.point, tower.radius)
        : null;
  if (!ring) return;
  pushFootprint(out, { id: `tower:${castleId}:${index}`, kind: "tower", material, ring, height, roof });
}

function addGates(
  document: CityDocument,
  walls: Map<Id, { group: EdgeFeatureGroup; points: Point[]; height: number }>,
  out: StructureMassing[]
): Map<Id, { index: number; half: number }[]> {
  const gaps = new Map<Id, { index: number; half: number }[]>();
  for (const gate of document.gates ?? []) {
    const frame = gateCrossingFrame(document, gate.vertexId);
    if (!frame) continue;
    const wall = document.featureGroups.find(
      group => group.kind === "wall" && featureGroupVertices(document, group).includes(gate.vertexId)
    );
    if (wall?.kind !== "wall" || !standing(document, wall.id)) continue;
    const known = walls.get(wall.id);
    if (!known) continue;
    const opening = openingWidth(document, gate, wall.style.widthMeters);
    const index = nearestVertex(known.points, frame.point);
    if (index < 0) continue;
    const list = gaps.get(wall.id) ?? [];
    list.push({ index, half: opening / 2 });
    gaps.set(wall.id, list);
    if (isNewStyleCastleGate(document, gate)) continue;
    addGateMasses(out, gate, frame, wall, known.height, opening);
  }
  return gaps;
}

function addGateMasses(
  out: StructureMassing[],
  gate: CityGate,
  frame: GateCrossingFrame,
  wall: EdgeFeatureGroup,
  wallHeight: number,
  opening: number
): void {
  const material: StructureMaterial = wall.wallMaterial === "wood" ? "wood" : "stone";
  const side = wall.style.widthMeters * GATE_TOWER_SCALE;
  const along = frame.tangent;
  const across = frame.inward;
  for (const sign of [-1, 1]) {
    const center: Point = [
      frame.point[0] + along[0] * sign * (opening / 2 + side / 2),
      frame.point[1] + along[1] * sign * (opening / 2 + side / 2)
    ];
    pushFootprint(out, {
      id: `gate:${gate.id}:flank:${sign < 0 ? 0 : 1}`,
      kind: "gate",
      material,
      ring: square(center, along, across, side),
      height: wallHeight + 2.5,
      roof: "pyramid"
    });
  }
  const half = opening / 2;
  out.push(
    blank({
      id: `gate:${gate.id}:lintel`,
      kind: "gate",
      material,
      centerline: [
        [frame.point[0] - along[0] * half, frame.point[1] - along[1] * half],
        [frame.point[0] + along[0] * half, frame.point[1] + along[1] * half]
      ],
      widthMeters: wall.style.widthMeters,
      heightMeters: 1.2,
      baseElevationMeters: Math.max(0, wallHeight - 1.2),
      roof: "none"
    })
  );
}

function addBridges(document: CityDocument, out: StructureMassing[]): void {
  const limit = documentBridgeSkewLimit(document);
  for (const deck of bridgeDecks(document)) {
    if (!withinBridgeSkewLimit(deck.skewDegrees, limit)) continue;
    if (distance(deck.points[0], deck.points[1]) < 1) continue;
    out.push(
      blank({
        id: `bridge:${deck.groupId}`,
        kind: "bridge",
        name: deck.name,
        material: "stone",
        centerline: deck.points,
        widthMeters: deck.widthMeters,
        heightMeters: 0.55,
        baseElevationMeters: 0.4,
        parapet: "both",
        parapetMeters: 0.9,
        parapetWidthMeters: 0.35
      })
    );
  }
}

function addLandmarks(document: CityDocument, out: StructureMassing[]): void {
  for (const instance of document.landmarks ?? []) {
    const asset = document.landmarkAssets?.find(
      item => item.id === instance.assetId && item.revision === instance.assetRevision
    );
    const parts = asset ? transformLandmarkPolygons(asset.footprint, instance) : instance.site;
    addLandmarkPolygons(out, `landmark:${instance.id}`, asset?.name, parts, SACRED.test(asset?.name ?? ""));
  }
}

/** Walls, towers, gates, bridges, and landmarks for the CE 3D view. Not saved. */
export function collectCityStructures(document: CityDocument): StructureMassing[] {
  const anchor = document.elements?.find(element => element.kind === "plaza" && element.point)?.point ?? [0, 0];
  const castle = castleWallIds(document);
  const prepared = new Map<Id, { group: EdgeFeatureGroup; points: Point[]; height: number }>();
  const out: StructureMassing[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "wall" || !standing(document, group.id) || modularFortressOwnsWall(document, group.id)) continue;
    const points = wallPoints(document, group);
    if (points.length < 2) continue;
    const material: StructureMaterial = group.wallMaterial === "wood" ? "wood" : "stone";
    const profile = resolveWallGeometry(group.style.widthMeters, material, group.walkway);
    const body =
      (material === "wood"
        ? profile.hasWalkway
          ? WOOD_WALK
          : WOOD_BARE
        : profile.hasWalkway
          ? STONE_WALK
          : STONE_BARE) + (castle.has(group.id) ? 2 : 0);
    prepared.set(group.id, { group, points, height: body });
    curtainTowers(document, group, points, body, out);
  }
  cornerTowers(document, out);
  const gaps = addGates(document, prepared, out);
  for (const [id, item] of prepared) {
    const runs = cutWallOpenings(item.points, gaps.get(id) ?? []);
    const material: StructureMaterial = item.group.wallMaterial === "wood" ? "wood" : "stone";
    const profile = resolveWallGeometry(item.group.style.widthMeters, material, item.group.walkway);
    runs.forEach((centerline, index) => {
      out.push(
        blank({
          id: `wall:${id}:${index}`,
          kind: "wall",
          name: item.group.name,
          material,
          centerline,
          widthMeters: item.group.style.widthMeters,
          heightMeters: item.height,
          anchor,
          parapet: profile.hasWalkway ? "outer" : "none",
          parapetMeters: profile.hasWalkway ? (material === "wood" ? WOOD_LIP : STONE_LIP) : 0,
          parapetWidthMeters: profile.hasWalkway ? profile.parapetWidth : 0
        })
      );
    });
  }
  addBridges(document, out);
  addLandmarks(document, out);
  addTemples(document, out);
  addFortress(document, out);
  out.push(...fortSiteStructures(document));
  return out;
}

/** Lots marked as landmarks stay out of building massing and are drawn as structures. */
export function landmarkLotStructures(lots: readonly BuildingLot[]): StructureMassing[] {
  const out: StructureMassing[] = [];
  lots.forEach((lot, index) => {
    if (!lot.landmark || lot.polygon.length < 3) return;
    const shape = shapeOf(lot.polygon);
    pushFootprint(out, {
      id: `landmark-lot:${lot.id ?? index}`,
      kind: "landmark",
      ring: lot.polygon,
      height: 12,
      roof: "gable",
      azimuth: shape.azimuth
    });
  });
  return out;
}
