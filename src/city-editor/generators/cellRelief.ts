// Ground from cell elevations.
// An empty land cell (no ward, or the empty ward, and no road, wall, plank, or element) is a slope: its centre
// stays at the cell elevation and every vertex has one height, so the ground meets its neighbours without a step.
// A cell with a ward, a road, a wall, a plank, or an element stays level. A step between two level cells is a 1:3
// bank where the bank fits, and a retaining wall otherwise. Levelling only those cells keeps a building or a
// street off the cone that a single raised cell used to leave.

import type { CityDocument, Id, Point } from "../types/document";
import { pointInPolygon, polygonCentroid } from "./geom";
import { triangularInfillParts } from "./lotGeometry";
import { facePoints, faceVertices } from "./mesh";
import { CLIFF_BAND_METERS } from "./terrainModel";

/** Grade of an earth bank between two cell levels: 1:3, about the steepest grassed bank that is still walked and mown. */
export const BANK_GRADE = 1 / 3;
/** A bank may take up at most this share of the distance from the shared edge to either cell's centre. */
export const BANK_SHARE = 0.5;

const BIN_METERS = 8;
const NUDGE_METERS = 0.01;

/** One edge between two level land cells at different elevations, heights relative to the datum. */
export interface CellStep {
  a: Point;
  b: Point;
  low: Id;
  high: Id;
  lowLevel: number;
  highLevel: number;
  kind: "bank" | "wall";
  /** Unit normal pointing into the higher cell. */
  towardHigh: Point;
  /** Half the bank width on each side of the edge, or the wall band inside the higher cell. */
  reach: number;
}

export interface CellRelief {
  datumMeters: number;
  relief: boolean;
  steps: CellStep[];
  /** True when any step is a retaining wall. */
  walled: boolean;
  /** Height relative to the datum. */
  heightAt(point: Point): number;
  /** True inside the band where a wall falls from a cell to its lower neighbour. */
  onWall(faceId: Id, point: Point): boolean;
  /** Lines along which the ground creases: both sides of a bank, and the top of a wall. */
  creases: Array<{ segment: { a: Point; b: Point }; normal: Point; offsetMeters: number }>;
}

interface SlopeTriangle {
  points: [Point, Point, Point];
  heights: [number, number, number];
}

const triCross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Land cells that stay level: a built ward, or a road, wall, plank, or element on the cell. */
function platformCellIds(document: CityDocument): Set<Id> {
  const { mesh } = document;
  const ids = new Set<Id>();
  for (const face of Object.values(mesh.faces)) {
    if (face.properties.water !== "land") continue;
    const ward = face.properties.ward;
    if (ward && ward !== "empty") ids.add(face.id);
  }
  const structured = new Set<Id>();
  for (const group of document.featureGroups) {
    if (group.kind !== "road" && group.kind !== "wall" && group.kind !== "plank") continue;
    for (const segment of group.segments) structured.add(segment.edgeId);
  }
  if (structured.size)
    for (const edge of Object.values(mesh.edges)) {
      if (!structured.has(edge.id)) continue;
      for (const faceId of [edge.leftFace, edge.rightFace]) {
        const face = faceId ? mesh.faces[faceId] : undefined;
        if (face?.properties.water === "land") ids.add(face.id);
      }
    }
  for (const element of document.elements)
    for (const id of element.faceIds) if (mesh.faces[id]?.properties.water === "land") ids.add(id);
  return ids;
}

/** The cell containing a point, through a grid of cell bounding boxes. */
export function faceLocator(document: CityDocument): (point: Point) => Id | null {
  const size = Math.max(10, document.frame.blockSizeMeters || 50);
  const bins = new Map<string, Array<{ id: Id; ring: Point[] }>>();
  for (const face of Object.values(document.mesh.faces)) {
    const ring = facePoints(document.mesh, face);
    if (ring.length < 3) continue;
    const xs = ring.map(p => p[0]),
      ys = ring.map(p => p[1]);
    for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++)
      for (let y = Math.floor(Math.min(...ys) / size); y <= Math.floor(Math.max(...ys) / size); y++) {
        const key = `${x},${y}`;
        const list = bins.get(key);
        if (list) list.push({ id: face.id, ring });
        else bins.set(key, [{ id: face.id, ring }]);
      }
  }
  return point => {
    for (const { id, ring } of bins.get(`${Math.floor(point[0] / size)},${Math.floor(point[1] / size)}`) ?? [])
      if (pointInPolygon(point, ring)) return id;
    return null;
  };
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
}

function lineDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  return Math.abs((point[0] - a[0]) * dy - (point[1] - a[1]) * dx) / length;
}

function fanHeight(triangles: readonly SlopeTriangle[], point: Point): number | null {
  for (const tri of triangles) {
    const [a, b, c] = tri.points;
    const area = triCross(a, b, c);
    if (Math.abs(area) < 1e-8) continue;
    const u = triCross(point, b, c) / area,
      v = triCross(a, point, c) / area,
      w = 1 - u - v;
    if (Math.min(u, v, w) >= -1e-6) return u * tri.heights[0] + v * tri.heights[1] + w * tri.heights[2];
  }
  return null;
}

/**
 * Cell elevations as slopes on empty land and level cells elsewhere. A step between two level cells becomes a
 * 1:3 bank when the bank fits within BANK_SHARE of the distance from the edge to both cell centres, and a
 * retaining wall otherwise. Empty cells carry the rise themselves, so that step is not a wall.
 */
export function cellRelief(document: CityDocument, locate = faceLocator(document)): CellRelief {
  const { mesh } = document;
  const land = Object.values(mesh.faces).filter(
    face => face.properties.water === "land" && Number.isFinite(face.properties.elevation)
  );
  const elevations = land.map(face => face.properties.elevation);
  const datumMeters = elevations.length ? Math.min(...elevations) : 1;
  const relief = elevations.some(height => Math.abs(height - datumMeters) > 1e-6);
  const level = new Map(land.map(face => [face.id, face.properties.elevation - datumMeters]));
  const centers = new Map(land.map(face => [face.id, polygonCentroid(facePoints(mesh, face))]));
  const platforms = platformCellIds(document);

  const steps: CellStep[] = [];
  if (relief)
    for (const edge of Object.values(mesh.edges)) {
      if (!edge.leftFace || !edge.rightFace) continue;
      if (!platforms.has(edge.leftFace) || !platforms.has(edge.rightFace)) continue;
      const left = level.get(edge.leftFace),
        right = level.get(edge.rightFace);
      if (left === undefined || right === undefined || Math.abs(left - right) < 1e-6) continue;
      const [low, high] = left < right ? [edge.leftFace, edge.rightFace] : [edge.rightFace, edge.leftFace];
      const a = mesh.vertices[edge.a].point,
        b = mesh.vertices[edge.b].point;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-9) continue;
      let towardHigh: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      const highCenter = centers.get(high)!;
      if ((highCenter[0] - a[0]) * towardHigh[0] + (highCenter[1] - a[1]) * towardHigh[1] < 0)
        towardHigh = [-towardHigh[0], -towardHigh[1]];
      const rise = Math.abs(left - right);
      const room = BANK_SHARE * Math.min(lineDistance(centers.get(low)!, a, b), lineDistance(highCenter, a, b));
      const half = rise / BANK_GRADE / 2;
      const bank = half <= room;
      steps.push({
        a,
        b,
        low,
        high,
        lowLevel: level.get(low)!,
        highLevel: level.get(high)!,
        kind: bank ? "bank" : "wall",
        towardHigh,
        reach: bank ? half : CLIFF_BAND_METERS
      });
    }

  const bins = new Map<string, CellStep[]>();
  for (const step of steps)
    for (
      let x = Math.floor((Math.min(step.a[0], step.b[0]) - step.reach) / BIN_METERS);
      x <= Math.floor((Math.max(step.a[0], step.b[0]) + step.reach) / BIN_METERS);
      x++
    )
      for (
        let y = Math.floor((Math.min(step.a[1], step.b[1]) - step.reach) / BIN_METERS);
        y <= Math.floor((Math.max(step.a[1], step.b[1]) + step.reach) / BIN_METERS);
        y++
      ) {
        const key = `${x},${y}`;
        const list = bins.get(key);
        if (list) list.push(step);
        else bins.set(key, [step]);
      }
  const near = (point: Point) =>
    bins.get(`${Math.floor(point[0] / BIN_METERS)},${Math.floor(point[1] / BIN_METERS)}`) ?? [];

  // A point on a cell edge or corner belongs to no cell; a step aside finds one, and either side gives the same height.
  const cellAt = (point: Point): Id | null => {
    const found = locate(point);
    if (found !== null) return found;
    for (const [dx, dy] of [
      [NUDGE_METERS, 0],
      [-NUDGE_METERS, 0],
      [0, NUDGE_METERS],
      [0, -NUDGE_METERS]
    ]) {
      const id = locate([point[0] + dx, point[1] + dy]);
      if (id !== null) return id;
    }
    return null;
  };

  const heightOnPlatform = (cellId: Id, point: Point): number => {
    const own = level.get(cellId)!;
    // The step whose bank or wall reaches deepest into this cell at the point shapes the ground there.
    let best: { share: number; height: number } | null = null;
    for (const step of near(point)) {
      if (step.low !== cellId && step.high !== cellId) continue;
      if (step.kind === "wall" && step.high !== cellId) continue;
      const d = segmentDistance(point, step.a, step.b);
      if (d >= step.reach) continue;
      const share = d / step.reach;
      if (best && share >= best.share) continue;
      const height =
        step.kind === "bank"
          ? (step.lowLevel + step.highLevel) / 2 + (own - (step.lowLevel + step.highLevel) / 2) * share
          : step.lowLevel + (own - step.lowLevel) * share;
      best = { share, height };
    }
    return best ? best.height : own;
  };

  const fans = new Map<Id, SlopeTriangle[]>();
  if (relief) {
    const incident = new Map<Id, Id[]>();
    for (const faceId of level.keys())
      for (const vertexId of faceVertices(mesh, mesh.faces[faceId])) {
        const list = incident.get(vertexId);
        if (list) list.push(faceId);
        else incident.set(vertexId, [faceId]);
      }
    const vertexHeight = new Map<Id, number>();
    for (const [vertexId, faceIds] of incident) {
      const platformId = faceIds.find(id => platforms.has(id));
      if (platformId) {
        vertexHeight.set(vertexId, heightOnPlatform(platformId, mesh.vertices[vertexId].point));
        continue;
      }
      let sum = 0;
      for (const id of faceIds) sum += level.get(id)!;
      vertexHeight.set(vertexId, sum / faceIds.length);
    }
    for (const [faceId, centerHeight] of level) {
      if (platforms.has(faceId)) continue;
      const ids = faceVertices(mesh, mesh.faces[faceId]);
      const points = ids.map(id => mesh.vertices[id].point);
      if (points.length < 3) continue;
      const heightOf = (index: number) => vertexHeight.get(ids[index]) ?? centerHeight;
      const triangles: SlopeTriangle[] = [];
      const center = centers.get(faceId)!;
      const signs = points
        .map((point, i) => Math.sign(triCross(center, point, points[(i + 1) % points.length])))
        .filter(sign => sign !== 0);
      if (signs.length && signs.every(sign => sign === signs[0]))
        points.forEach((point, i) => {
          const next = (i + 1) % points.length;
          const tri: [Point, Point, Point] = [center, point, points[next]];
          if (Math.abs(triCross(...tri)) < 1e-8) return;
          triangles.push({ points: tri, heights: [centerHeight, heightOf(i), heightOf(next)] });
        });
      else
        for (const part of triangularInfillParts(points))
          for (let i = 1; i < part.length - 1; i++) {
            const ia = points.indexOf(part[0]),
              ib = points.indexOf(part[i]),
              ic = points.indexOf(part[i + 1]);
            if (ia < 0 || ib < 0 || ic < 0) continue;
            const tri: [Point, Point, Point] = [part[0], part[i], part[i + 1]];
            if (Math.abs(triCross(...tri)) < 1e-8) continue;
            triangles.push({ points: tri, heights: [heightOf(ia), heightOf(ib), heightOf(ic)] });
          }
      if (triangles.length) fans.set(faceId, triangles);
    }
  }

  const heightAt = (point: Point): number => {
    if (!relief) return 0;
    const cell = cellAt(point);
    const own = cell === null ? undefined : level.get(cell);
    if (own === undefined) return 0;
    const fan = fans.get(cell);
    if (fan) return fanHeight(fan, point) ?? own;
    return heightOnPlatform(cell, point);
  };

  return {
    datumMeters,
    relief,
    steps,
    walled: steps.some(step => step.kind === "wall"),
    heightAt,
    onWall(faceId, point) {
      return near(point).some(
        step =>
          step.kind === "wall" &&
          step.high === faceId &&
          segmentDistance(point, step.a, step.b) < CLIFF_BAND_METERS - 1e-6
      );
    },
    creases: steps.flatMap(step =>
      step.kind === "bank"
        ? [
            { segment: step, normal: step.towardHigh, offsetMeters: step.reach },
            { segment: step, normal: step.towardHigh, offsetMeters: -step.reach }
          ]
        : [{ segment: step, normal: step.towardHigh, offsetMeters: CLIFF_BAND_METERS }]
    )
  };
}
