// Draw-time land and water for the CE 3D view. Derived from the document.
// Nothing here is stored, and CityDocument.version is unchanged.

import type { CityDocument, Point, RiverGroup } from "../types/document";
import type { WaterKind } from "../types/primitives";
import { riverRibbons } from "./bridgeDeck";
import { boundaryEdges, boundaryRings, refPoints } from "./fortifications";
import { nearestOnPolyline, pointInPolygon, polygonArea } from "./geom";
import { convexInfillParts, triangularInfillParts } from "./lotGeometry";
import { facePoints } from "./mesh";
import { bounds, boundsOverlap, intersectConvex, plotArea, subtractConvex } from "./parcelGeometry";
import { regionalCoastalWaterPolygons } from "./regionalCoast";
import { fixedWaterPolygons } from "./waterGeometry";

export type TownWaterKind = "ocean" | "lake" | "channel" | "river";

/** Town-view class colors. Ocean and open water share ce-face--sea. */
export const TOWN_WATER_COLOR: Record<TownWaterKind, number> = {
  ocean: 0x456d7f,
  lake: 0x527f8b,
  channel: 0x456d7f,
  river: 0x527f8b
};

export interface TownWaterPart {
  kind: TownWaterKind;
  /** Closed ring shared by the surface, the bank test, and the land punch. */
  polygon: Point[];
  /** River only. Document centre line, upstream to downstream. Not used for coverage. */
  centerline?: Point[];
  /** River only. Full width in metres, matching riverRibbons. */
  widthMeters?: number;
}

export interface TownWater {
  /** Water that is drawn. */
  parts: TownWaterPart[];
  /** Rings that are not drawn but are cut out of later water. */
  reserved: Point[][];
  /**
   * Triangles of sea, lake, or open-water faces removed by a step 1–2 reservation.
   * townGroundPolygons adds them as land. The document water string is unchanged.
   */
  landRefill: Point[][];
}

const MIN_AREA = 0.001;

/** Draw-time classifier. Does not mutate the document and does not throw. */
export function classifyTownWater(document: CityDocument): TownWater {
  const parts: TownWaterPart[] = [];
  const reserved: Point[][] = [];
  const landRefill: Point[][] = [];

  for (const area of document.waterAreas ?? []) {
    commit(area.polygon, "channel", parts, reserved, drawn(parts), [], true);
  }
  for (const piece of surveyedPieces(document)) {
    commit(piece, "channel", parts, reserved, drawn(parts), [], true);
  }

  const drawn12 = drawn(parts);
  const reserved12 = reserved.map(copyRing);
  for (const face of Object.values(document.mesh.faces)) {
    const kind = faceWaterKind(face.properties.water);
    if (!kind) continue;
    const poly = facePoints(document.mesh, face);
    if (!usable(poly)) continue;
    if (triangularInfillParts(poly).length === 0) {
      reserved.push(copyRing(poly));
      continue;
    }
    const afterDrawn = subtractPolygons(poly, drawn12, []);
    landRefill.push(...intersectionTriangles(afterDrawn, reserved12));
    for (const piece of subtractPolygons(poly, drawn12, reserved12)) {
      if (triangularInfillParts(piece).length === 0) reserved.push(copyRing(piece));
      else parts.push({ kind, polygon: copyRing(piece) });
    }
  }

  for (const ribbon of riverRibbons(document)) {
    const ring = riverRibbonRing(ribbon.points, ribbon.width);
    if (!ring) continue;
    commit(ring, "river", parts, reserved, drawn(parts), [], false, {
      centerline: ribbon.points.map(copyPoint),
      widthMeters: ribbon.width
    });
  }

  const drawnBeforeSea = drawn(parts);
  const outside = surfacePieces(document);
  const sea = coreRing(document) ? regionalCoastalWaterPolygons(document) : [];
  for (const piece of sea) {
    commit(piece, "ocean", parts, reserved, drawn(parts), [...outside.land, ...outside.water], true);
  }
  for (const piece of outside.water) {
    commit(piece, "ocean", parts, reserved, drawnBeforeSea, [], true);
  }

  return { parts, reserved, landRefill };
}

/** Mitered river ring. Same degenerate cases as structureGeometry's private offsetSide. */
export function riverRibbonRing(centerline: Point[], widthMeters: number): Point[] | null {
  const half = widthMeters / 2;
  const left = offsetSide(centerline, half);
  const right = offsetSide(centerline, -half);
  if (!left || !right || left.length !== right.length || left.length < 2) return null;
  return [...left, ...[...right].reverse()];
}

/** Strict interior, plus a decomposed seam whose four probes are wet. */
export function strictWet(point: Point, polygons: readonly Point[][]): boolean {
  if (polygons.some(polygon => interior(point, polygon))) return true;
  const nearby = polygons.filter(polygon => nearestOnPolyline(point, [...polygon, polygon[0]]).dist <= 1e-6);
  return (
    nearby.length > 1 &&
    (
      [
        [1e-5, 0],
        [-1e-5, 0],
        [0, 1e-5],
        [0, -1e-5]
      ] as const
    ).every(([x, y]) => nearby.some(polygon => pointInPolygon([point[0] + x, point[1] + y], polygon)))
  );
}

/** Fields that change the water picture. coastalOceanFaceIds is intentionally absent. */
export function townWaterStamp(document: CityDocument): string {
  const faces = Object.values(document.mesh.faces)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(face => ({
      id: face.id,
      water: face.properties.water,
      ring: roundRing(facePoints(document.mesh, face))
    }));
  const areas = (document.waterAreas ?? []).map(area => roundRing(area.polygon));
  const regional = (document.regionalWaterAreas ?? []).map(roundRing);
  const surface = document.regionalSurface
    ? {
        features: document.regionalSurface.features.map(feature => ({
          kind: feature.kind,
          ring: roundRing(feature.ring)
        })),
        unknown: document.regionalSurface.unknown.map(ring => roundRing(ring))
      }
    : null;
  const rivers = document.featureGroups
    .filter((group): group is RiverGroup => group.kind === "river")
    .map(group => ({
      id: group.id,
      width: round(group.style.widthMeters),
      ring: group.vertices.flatMap(id => {
        const point = document.mesh.vertices[id]?.point;
        return point ? [roundRing([point])[0]] : [];
      })
    }));
  let fixed: { schemaVersion: number; revision: number; rings: number[][][] } | null = null;
  const crossings = document.importedFixedCrossings;
  if (crossings) {
    try {
      fixed = {
        schemaVersion: crossings.schemaVersion,
        revision: crossings.revision,
        rings: [...crossings.rivers, ...(crossings.obstacles ?? [])].flatMap(body =>
          body.rings.map(ring => roundRing(ring as Point[]))
        )
      };
    } catch {
      fixed = null;
    }
  }
  return JSON.stringify({
    extent: round(document.frame.extentMeters),
    faces,
    areas,
    regional,
    surface,
    rivers,
    fixed
  });
}

/** Land triangles: punched mesh faces, island remainder, landRefill, and the frame outside the mesh. */
export function townGroundPolygons(document: CityDocument, water: TownWater): { land: Point[][]; unknown: Point[][] } {
  if (Object.keys(document.mesh.faces).length === 0) {
    let remain = [frameSquare(document.frame.extentMeters)];
    for (const part of water.parts) remain = remain.flatMap(piece => subtractPolygons(piece, [part.polygon], []));
    return { land: remain.flatMap(trianglesOf), unknown: [] };
  }

  const land: Point[][] = [];
  const cutters = water.parts
    .filter(part => part.kind === "channel" || part.kind === "river")
    .map(part => part.polygon);
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land") continue;
    const poly = facePoints(document.mesh, face);
    if (!usable(poly)) continue;
    const remain = cutters.length ? subtractPolygons(poly, cutters, []) : [poly];
    for (const piece of remain) land.push(...trianglesOf(piece));
  }
  for (const tri of water.landRefill) land.push(...(tri.length === 3 ? [tri] : trianglesOf(tri)));

  const outside = surfacePieces(document);
  let island = outside.land.map(copyRing);
  for (const part of water.parts) {
    if (!outside.water.some(ring => polygonsOverlap(part.polygon, ring))) continue;
    island = island.flatMap(piece => subtractPolygons(piece, [part.polygon], []));
  }
  for (const piece of island) land.push(...trianglesOf(piece));

  const core = coreRing(document);
  if (core) {
    let frame = [frameSquare(document.frame.extentMeters)];
    const blockers = [core, ...outside.land, ...outside.water, ...outside.unknown, ...drawn(water.parts)];
    for (const block of blockers) frame = frame.flatMap(piece => subtractPolygons(piece, [block], []));
    for (const piece of frame) land.push(...trianglesOf(piece));
  }

  return { land, unknown: outside.unknown.flatMap(trianglesOf) };
}

/** 3-point rings of drawn parts. A ring that does not triangulate adds nothing. */
export function townWaterTriangles(parts: readonly TownWaterPart[]): Point[][] {
  return parts.flatMap(part => trianglesOf(part.polygon));
}

function commit(
  ring: Point[],
  kind: TownWaterKind,
  parts: TownWaterPart[],
  reserved: Point[][],
  drawnRings: readonly Point[][],
  blockers: readonly Point[][],
  reserveOrigin: boolean,
  extra?: { centerline: Point[]; widthMeters: number }
): void {
  if (!usable(ring)) return;
  if ((reserveOrigin && coversOrigin(ring)) || triangularInfillParts(ring).length === 0) {
    reserved.push(copyRing(ring));
    return;
  }
  for (const piece of subtractPolygons(ring, [...drawnRings, ...blockers], reserved)) {
    if (triangularInfillParts(piece).length === 0) {
      reserved.push(copyRing(piece));
      continue;
    }
    parts.push({
      kind,
      polygon: copyRing(piece),
      ...(extra ? { centerline: extra.centerline.map(copyPoint), widthMeters: extra.widthMeters } : {})
    });
  }
}

function surveyedPieces(document: CityDocument): Point[][] {
  const fixed = document.importedFixedCrossings;
  if (!fixed) return [];
  try {
    return fixedWaterPolygons(fixed);
  } catch {
    return [];
  }
}

function faceWaterKind(water: WaterKind): TownWaterKind | null {
  if (water === "lake") return "lake";
  if (water === "sea" || water === "openWater") return "ocean";
  return null;
}

function drawn(parts: readonly TownWaterPart[]): Point[][] {
  return parts.map(part => part.polygon);
}

function coversOrigin(ring: Point[]): boolean {
  return pointInPolygon([0, 0], ring);
}

function usable(ring: readonly Point[]): boolean {
  return ring.length >= 3 && ring.every(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function copyPoint(point: Point): Point {
  return [point[0], point[1]];
}

function copyRing(ring: readonly Point[]): Point[] {
  return ring.map(copyPoint);
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function roundRing(ring: readonly Point[]): number[][] {
  return ring.map(point => [round(point[0]), round(point[1])]);
}

function interior(point: Point, polygon: Point[]): boolean {
  return pointInPolygon(point, polygon) && nearestOnPolyline(point, [...polygon, polygon[0]]).dist > 1e-6;
}

function subtractPolygons(subject: Point[], clips: readonly Point[][], raw: readonly Point[][]): Point[][] {
  if (!usable(subject)) return [];
  const convexClips: Point[][] = [];
  const rawLeft: Point[][] = [];
  for (const clip of [...clips, ...raw]) {
    if (!usable(clip) || !boundsOverlap(bounds(subject), bounds(clip))) continue;
    const pieces = triangularInfillParts(clip);
    if (pieces.length) convexClips.push(...pieces);
    else rawLeft.push(clip);
  }
  if (!convexClips.length && !rawLeft.length) return plotArea(subject) >= MIN_AREA ? [copyRing(subject)] : [];

  let pieces = triangularInfillParts(subject);
  if (!pieces.length) return [];
  for (const clip of convexClips) {
    pieces = pieces.flatMap(piece =>
      boundsOverlap(bounds(piece), bounds(clip)) ? subtractConvex(piece, clip, MIN_AREA) : [piece]
    );
  }
  if (rawLeft.length) {
    pieces = pieces.flatMap(piece =>
      trianglesOf(piece).filter(tri => !rawLeft.some(ring => tri.every(vertex => pointInPolygon(vertex, ring))))
    );
  }
  return pieces.filter(piece => piece.length >= 3 && plotArea(piece) >= MIN_AREA);
}

function intersectionTriangles(subjects: readonly Point[][], clips: readonly Point[][]): Point[][] {
  const out: Point[][] = [];
  const subjectsFlat = subjects.flatMap(subject => triangularInfillParts(subject));
  for (const clip of clips) {
    if (!usable(clip)) continue;
    const clipParts = triangularInfillParts(clip);
    if (!clipParts.length) {
      for (const subject of subjectsFlat) {
        for (const tri of trianglesOf(subject)) {
          if (tri.every(vertex => pointInPolygon(vertex, clip))) out.push(tri);
        }
      }
      continue;
    }
    for (const subject of subjectsFlat) {
      for (const clipPart of clipParts) {
        if (!boundsOverlap(bounds(subject), bounds(clipPart))) continue;
        const hit = intersectConvex(subject, clipPart);
        if (hit.length >= 3 && plotArea(hit) >= MIN_AREA) out.push(...trianglesOf(hit));
      }
    }
  }
  return out;
}

function trianglesOf(polygon: Point[]): Point[][] {
  if (!usable(polygon)) return [];
  const tris: Point[][] = [];
  for (const part of triangularInfillParts(polygon)) {
    if (part.length === 3) tris.push(copyRing(part));
    else if (part.length > 3) {
      for (let i = 1; i + 1 < part.length; i++)
        tris.push([copyPoint(part[0]), copyPoint(part[i]), copyPoint(part[i + 1])]);
    }
  }
  return tris;
}

function polygonsOverlap(a: Point[], b: Point[]): boolean {
  if (!usable(a) || !usable(b) || !boundsOverlap(bounds(a), bounds(b))) return false;
  for (const left of triangularInfillParts(a)) {
    for (const right of triangularInfillParts(b)) {
      if (boundsOverlap(bounds(left), bounds(right)) && plotArea(intersectConvex(left, right)) >= MIN_AREA) return true;
    }
  }
  return false;
}

function coreRing(document: CityDocument): Point[] | null {
  if (!Object.keys(document.mesh.vertices).length || !Object.keys(document.mesh.faces).length) return null;
  const ring = boundaryRings(document.mesh, boundaryEdges(document.mesh, Object.keys(document.mesh.faces)))
    .map(refs => refPoints(document.mesh, refs))
    .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  return ring?.length ? ring : null;
}

function outsidePieces(document: CityDocument, rings: Point[][]): Point[][] {
  const core = coreRing(document);
  if (!core) return [];
  const coreParts = convexInfillParts(core);
  return rings.flatMap(ring => {
    let parts = triangularInfillParts(ring);
    for (const corePart of coreParts) parts = parts.flatMap(part => subtractConvex(part, corePart, MIN_AREA));
    return parts;
  });
}

function surfacePieces(document: CityDocument): { land: Point[][]; water: Point[][]; unknown: Point[][] } {
  const surface = document.regionalSurface;
  if (!surface) return { land: [], water: [], unknown: [] };
  return {
    land: outsidePieces(
      document,
      surface.features.filter(feature => feature.kind === "land").map(feature => feature.ring as Point[])
    ),
    water: outsidePieces(
      document,
      surface.features.filter(feature => feature.kind === "water").map(feature => feature.ring as Point[])
    ),
    unknown: outsidePieces(document, surface.unknown as Point[][])
  };
}

function frameSquare(extentMeters: number): Point[] {
  const half = extentMeters / 2;
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half]
  ];
}

function closedLine(points: readonly Point[]): boolean {
  return (
    points.length > 3 &&
    Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 0.05
  );
}

function segmentNormals(points: readonly Point[], closed: boolean): Point[] {
  const count = closed ? points.length : points.length - 1;
  const normals: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    normals.push(length < 1e-6 ? [0, 1] : [-dy / length, dx / length]);
  }
  return normals;
}

/** Left side of the centre line. A short segment or a 180° cusp keeps the run. */
function offsetSide(points: readonly Point[], distance: number): Point[] | null {
  if (points.length < 2 || !(Math.abs(distance) > 0)) return null;
  if (points.some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return null;
  const closed = closedLine(points);
  const ring = closed ? points.slice(0, -1) : points;
  if (ring.length < 2) return null;
  const normals = segmentNormals(ring, closed);
  const side: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const previous = closed || i > 0 ? normals[(i - 1 + normals.length) % normals.length] : null;
    const next = closed || i < ring.length - 1 ? normals[Math.min(i, normals.length - 1)] : null;
    const a = previous ?? next!;
    const b = next ?? previous!;
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const length = Math.hypot(mx, my);
    if (length < 1e-6) {
      mx = a[0];
      my = a[1];
    } else {
      mx /= length;
      my /= length;
    }
    const denom = mx * b[0] + my * b[1];
    const scale = Math.abs(denom) < 0.25 ? distance / 0.25 : distance / denom;
    const clamped = Math.max(-Math.abs(distance) * 4, Math.min(Math.abs(distance) * 4, scale));
    side.push([ring[i][0] + mx * clamped, ring[i][1] + my * clamped]);
  }
  return side;
}
