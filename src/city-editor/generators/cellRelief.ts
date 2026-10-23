// Ground from cell elevations: every cell is level at its elevation, and the step to a neighbouring cell is either an
// earth bank that fits between the two cells or, where it would not, a retaining wall.

import type { CityDocument, Id, Point } from "../types/document";
import { pointInPolygon, polygonCentroid } from "./geom";
import { facePoints } from "./mesh";
import { CLIFF_BAND_METERS } from "./terrainModel";

/** Grade of an earth bank between two cell levels: 1:3, about the steepest grassed bank that is still walked and mown. */
export const BANK_GRADE = 1 / 3;
/** A bank may take up at most this share of the distance from the shared edge to either cell's centre. */
export const BANK_SHARE = 0.5;

const BIN_METERS = 8;
const NUDGE_METERS = 0.01;

/** One edge between two land cells at different elevations, heights relative to the datum. */
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

/**
 * Cell elevations as level cells joined by banks and walls. A step becomes a 1:3 bank when the bank fits within
 * BANK_SHARE of the distance from the edge to both cell centres, and a retaining wall otherwise.
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

  const steps: CellStep[] = [];
  if (relief)
    for (const edge of Object.values(mesh.edges)) {
      if (!edge.leftFace || !edge.rightFace) continue;
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

  const heightAt = (point: Point): number => {
    if (!relief) return 0;
    const cell = cellAt(point);
    const own = cell === null ? undefined : level.get(cell);
    if (own === undefined) return 0;
    // The step whose bank or wall reaches deepest into this cell at the point shapes the ground there.
    let best: { share: number; height: number } | null = null;
    for (const step of near(point)) {
      if (step.low !== cell && step.high !== cell) continue;
      if (step.kind === "wall" && step.high !== cell) continue;
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
