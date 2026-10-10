import { featureGroupVertices } from "../features";
import { facePoints } from "../mesh";
import type { CityDocument, Point } from "../types";
import type { BuildingLot } from "./buildingLots";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { economyOnDocument } from "./guildFacilities";

/**
 * Cellars have no yard. Their ground area (0.2 m² per barrel) lengthens the
 * rear of houses that still have room inside the block. A house that would
 * cross a street, leave its face, or enter a neighbour stays as it was.
 */

const SCALES = [1, 0.5, 0.25, 0.1];

function ringLength(polygon: Point[]): number {
  let length = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function roadDistance(point: Point, roads: readonly Point[][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const road of roads) {
    const hit = nearestOnPolyline(point, road);
    if (hit.dist < best) best = hit.dist;
  }
  return best;
}

function outwardNormal(polygon: Point[], index: number, centre: Point): Point | null {
  const a = polygon[index];
  const b = polygon[(index + 1) % polygon.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  let nx = dy / length;
  let ny = -dx / length;
  const midX = (a[0] + b[0]) / 2;
  const midY = (a[1] + b[1]) / 2;
  if (nx * (midX - centre[0]) + ny * (midY - centre[1]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/** Push the edge farthest from the streets further into the block. */
function growRear(polygon: Point[], delta: number, roads: readonly Point[][]): Point[] | null {
  if (polygon.length < 3 || !(delta > 0) || roads.length === 0) return null;
  const centre = polygonCentroid(polygon);
  let front = -1;
  let frontDist = Number.POSITIVE_INFINITY;
  let rear = -1;
  let rearDist = -1;
  const mids: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    mids.push(mid);
    const dist = roadDistance(mid, roads);
    if (dist < frontDist) {
      frontDist = dist;
      front = i;
    }
    if (dist > rearDist) {
      rearDist = dist;
      rear = i;
    }
  }
  if (front < 0 || rear < 0 || front === rear) return null;
  const normal = outwardNormal(polygon, rear, centre);
  if (!normal) return null;
  const awayX = mids[rear][0] - mids[front][0];
  const awayY = mids[rear][1] - mids[front][1];
  if (normal[0] * awayX + normal[1] * awayY <= 0) return null;
  const nextIndex = (rear + 1) % polygon.length;
  const next = polygon.map((point, index) =>
    index === rear || index === nextIndex
      ? ([point[0] + normal[0] * delta, point[1] + normal[1] * delta] as Point)
      : point
  );
  if (Math.abs(polygonArea(next)) <= Math.abs(polygonArea(polygon)) + 0.25) return null;
  const oldClear = Math.min(...polygon.map(point => roadDistance(point, roads)));
  const newClear = Math.min(...next.map(point => roadDistance(point, roads)));
  if (newClear + 0.05 < oldClear) return null;
  return next;
}

function insideFace(document: CityDocument, faceId: string, polygon: Point[]): boolean {
  const face = document.mesh.faces[faceId];
  if (!face) return false;
  const ring = facePoints(document.mesh, face);
  if (ring.length < 3) return false;
  const closed = [...ring, ring[0]];
  return polygon.every(point => pointInPolygon(point, ring) || nearestOnPolyline(point, closed).dist <= 0.05);
}

function intrudes(moved: Point[], other: Point[]): boolean {
  const closed = [...other, other[0]];
  return moved.some(point => pointInPolygon(point, other) && nearestOnPolyline(point, closed).dist > 0.05);
}

function growAll(
  document: CityDocument,
  buildings: readonly BuildingLot[],
  roads: readonly Point[][],
  delta: number
): BuildingLot[] {
  const next = buildings.slice();
  for (let i = 0; i < buildings.length; i++) {
    const lot = buildings[i];
    if (lot.landmark) continue;
    const grown = growRear(lot.polygon, delta, roads);
    if (!grown || !insideFace(document, lot.faceId, grown)) continue;
    const moved = grown.filter(
      (point, index) => point[0] !== lot.polygon[index]?.[0] || point[1] !== lot.polygon[index]?.[1]
    );
    const hitsNeighbour = next.some((other, index) => index !== i && intrudes(moved, other.polygon));
    if (hitsNeighbour) continue;
    next[i] = { ...lot, polygon: grown };
  }
  return next;
}

function coveredArea(buildings: readonly BuildingLot[]): number {
  return buildings.reduce((sum, lot) => sum + Math.abs(polygonArea(lot.polygon)), 0);
}

/** Same array when the profile has no cellar area to absorb. */
export function absorbCellars(
  document: CityDocument,
  buildings: BuildingLot[],
  lanes: readonly { points: Point[] }[]
): BuildingLot[] {
  const area = (economyOnDocument(document)?.storage ?? [])
    .filter(yard => yard.form === "cellar")
    .reduce((sum, yard) => sum + yard.areaM2, 0);
  if (!(area >= 1) || buildings.length === 0) return buildings;
  const roads: Point[][] = [];
  for (const lane of lanes) if (lane.points.length >= 2) roads.push(lane.points);
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    const points = featureGroupVertices(document, group)
      .map(id => document.mesh.vertices[id]?.point)
      .filter((point): point is Point => !!point);
    if (points.length >= 2) roads.push(points);
  }
  if (!roads.length) return buildings;
  const perimeter = buildings.reduce((sum, lot) => sum + ringLength(lot.polygon), 0);
  if (!(perimeter > 0)) return buildings;
  const delta = area / perimeter;
  const before = coveredArea(buildings);
  for (const scale of SCALES) {
    const grown = growAll(document, buildings, roads, delta * scale);
    if (coveredArea(grown) > before + 0.5) return grown;
  }
  return buildings;
}
