// Draw-time land and water for the CE 3D view. Derived from the document.
// Nothing here is stored, and CityDocument.version is unchanged.

import type { CityDocument, Point, RiverGroup } from "../types/document";
import type { WaterKind } from "../types/primitives";
import { cutDitchGround } from "./bastionedTown/ditchGeometry";
import { riverRibbons } from "./bridgeDeck";
import { boundaryEdges, boundaryRings, refPoints } from "./fortifications";
import {
  isSimplePolygon,
  nearestOnPolyline,
  perpDistanceToLine,
  pointInPolygon,
  polygonArea,
  segmentPolylineIntersection
} from "./geom";
import { convexInfillParts, triangularInfillParts } from "./lotGeometry";
import { facePoints } from "./mesh";
import { bounds, boundsOverlap, intersectConvex, plotArea, subtractConvex } from "./parcelGeometry";
import { regionalCoastalWaterPolygons } from "./regionalCoast";
import { closedLine, riverRibbonRing } from "./riverRibbonRing";
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

  const outside = surfacePieces(document);
  const sea = coreRing(document) ? regionalCoastalWaterPolygons(document) : [];
  const receivingWater = [
    ...parts.filter(part => part.kind === "ocean" || part.kind === "lake").map(part => part.polygon),
    ...sea,
    ...outside.water
  ];
  for (const ribbon of riverRibbons(document)) {
    const channel = riverChannelRing(ribbon.points, ribbon.width, receivingWater);
    if (!channel) continue;
    commit(
      channel.ring,
      "river",
      parts,
      reserved,
      drawn(parts),
      [],
      false,
      {
        centerline: ribbon.points.map(copyPoint),
        widthMeters: ribbon.width
      },
      channel.drawable
    );
  }

  const drawnBeforeSea = drawn(parts);
  for (const piece of sea) {
    commit(piece, "ocean", parts, reserved, drawn(parts), [...outside.land, ...outside.water], true);
  }
  for (const piece of outside.water) {
    commit(piece, "ocean", parts, reserved, drawnBeforeSea, [], true);
  }

  return { parts, reserved, landRefill };
}

/**
 * The document centre line is kept. A mesh chain can stair-step inside the
 * river's own width, and the mitered ribbon then crosses itself. Ear clipping
 * gives up on that whole ring, so 3D would draw no water. Straighten only the
 * draw-time line, and only until the ribbon is a simple channel again.
 */
function riverChannelRing(
  points: Point[],
  width: number,
  receivingWater: Point[][]
): { ring: Point[]; drawable: boolean } | null {
  const exact = riverMouthRing(points, width, receivingWater);
  if (!exact) return null;
  if (drawableRing(exact)) return { ring: exact, drawable: true };
  const cap = Math.max(width / 2, 0.25);
  for (let epsilon = 0.25; epsilon <= cap + 1e-9; epsilon *= 2) {
    const simplified = riverMouthRing(simplifyPolyline(points, epsilon), width, receivingWater);
    if (drawableRing(simplified)) return { ring: simplified, drawable: true };
  }
  return { ring: exact, drawable: false };
}

function drawableRing(ring: Point[] | null): ring is Point[] {
  if (!ring) return false;
  const pieces = triangularInfillParts(ring);
  if (pieces.length === 0) return false;
  // A self-crossing ribbon can still look convex to the ear test and would fill
  // the land inside the bends. Require a simple outline before accepting that.
  if (pieces.length === 1 && pieces[0].length === ring.length) return isSimplePolygon(ring, MIN_AREA);
  return true;
}

/** Douglas–Peucker. Endpoints stay. A closed line stays closed. */
function simplifyPolyline(points: readonly Point[], epsilon: number): Point[] {
  const closed = closedLine(points);
  const open = closed ? points.slice(0, -1) : points;
  if (open.length < 3) return points.map(copyPoint);
  const keep = open.map(() => false);
  keep[0] = true;
  keep[open.length - 1] = true;
  const stack: [number, number][] = [[0, open.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let far = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const gap = perpDistanceToLine(open[i], open[start], open[end]);
      if (gap > far) {
        far = gap;
        index = i;
      }
    }
    if (index >= 0 && far > epsilon) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  const line = open.filter((_, i) => keep[i]).map(copyPoint);
  return closed ? [...line, copyPoint(line[0])] : line;
}

/** A centreline ending on shore leaves a dry wedge when its square cap meets
 * the coast obliquely. Extend only that cap until both banks reach water.
 * The existing water polygons clip the extension at the actual shoreline. */
function riverMouthRing(points: Point[], width: number, receivingWater: Point[][]): Point[] | null {
  const ring = riverRibbonRing(points, width);
  if (!ring || closedLine(points) || !receivingWater.length) return ring;
  const count = points.length;
  const closedWater = receivingWater.map(polygon => [...polygon, polygon[0]]);
  const wet = (point: Point) => strictWet(point, receivingWater);
  const extend = (tip: Point, previous: Point, left: Point, right: Point): Point[] => {
    const length = Math.hypot(tip[0] - previous[0], tip[1] - previous[1]);
    if (length < 1e-6 || !closedWater.some(polygon => nearestOnPolyline(tip, polygon).dist < 1e-4)) return [];
    const direction: Point = [(tip[0] - previous[0]) / length, (tip[1] - previous[1]) / length];
    const ahead = (point: Point, distance: number): Point => [
      point[0] + direction[0] * distance,
      point[1] + direction[1] * distance
    ];
    if (!wet(ahead(tip, 0.01))) return [];
    const reach =
      Math.max(
        ...receivingWater.flatMap(polygon => polygon.map(point => Math.hypot(point[0] - tip[0], point[1] - tip[1])))
      ) + width;
    let extension = 0;
    for (const bank of [left, right]) {
      if (wet(bank)) continue;
      const hits = closedWater.flatMap(polygon => {
        const hit = segmentPolylineIntersection(bank, ahead(bank, reach), polygon);
        return hit && wet(ahead(hit, 0.01)) ? [Math.hypot(hit[0] - bank[0], hit[1] - bank[1])] : [];
      });
      if (!hits.length) return [];
      extension = Math.max(extension, Math.min(...hits));
    }
    return extension > 1e-6 ? [ahead(left, extension + 0.01), ahead(right, extension + 0.01)] : [];
  };
  const end = extend(points[count - 1], points[count - 2], ring[count - 1], ring[count]);
  const start = extend(points[0], points[1], ring[0], ring[ring.length - 1]);
  return [
    ...(start.length ? [start[0]] : []),
    ...ring.slice(0, count),
    ...end,
    ...ring.slice(count),
    ...(start.length ? [start[1]] : [])
  ];
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
      elevation: face.properties.elevation,
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
export function townGroundPolygons(
  document: CityDocument,
  water: TownWater,
  landTriangles?: ReadonlyMap<string, Point[][]>,
  cutExcavations = true
): { land: Point[][]; unknown: Point[][] } {
  if (Object.keys(document.mesh.faces).length === 0) {
    let remain = [frameSquare(document.frame.extentMeters)];
    for (const part of water.parts) remain = remain.flatMap(piece => subtractPolygons(piece, [part.polygon], []));
    return {
      land: remain
        .flatMap(p => cutDitchGround(cutExcavations ? document.bastionedTown : undefined, p))
        .flatMap(trianglesOf),
      unknown: []
    };
  }

  const land: Point[][] = [];
  const cutters = water.parts
    .filter(part => part.kind === "channel" || part.kind === "river")
    .map(part => part.polygon);
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land") continue;
    const poly = facePoints(document.mesh, face);
    if (!usable(poly)) continue;
    for (const surface of landTriangles?.get(face.id) ?? [poly]) {
      const remain = cutters.length ? subtractPolygons(surface, cutters, []) : [surface];
      for (const piece of remain) land.push(...trianglesOf(piece));
    }
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

  return {
    land:
      cutExcavations && document.bastionedTown
        ? land.flatMap(p => cutDitchGround(document.bastionedTown, p)).flatMap(trianglesOf)
        : land,
    unknown: outside.unknown.flatMap(trianglesOf)
  };
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
  extra?: { centerline: Point[]; widthMeters: number },
  drawable?: boolean
): void {
  if (!usable(ring)) return;
  if (
    (reserveOrigin && coversOrigin(ring)) ||
    drawable === false ||
    (drawable === undefined && triangularInfillParts(ring).length === 0)
  ) {
    reserved.push(copyRing(ring));
    return;
  }
  for (const piece of subtractPolygons(ring, [...drawnRings, ...blockers], reserved)) {
    const unchanged =
      piece.length === ring.length && piece.every((point, i) => point[0] === ring[i][0] && point[1] === ring[i][1]);
    if (!unchanged && triangularInfillParts(piece).length === 0) {
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

export { riverRibbonRing };
