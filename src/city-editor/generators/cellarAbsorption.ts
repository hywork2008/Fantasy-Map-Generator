import type { CityDocument } from "../types/document";
import type { Point } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";
import { featureGroupVertices } from "./features";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { economyOnDocument } from "./guildFacilities";
import { facePoints } from "./mesh";

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

const GRID_CELL_METERS = 40;

/**
 * Nearest distance to a set of polylines. Segments go into a uniform grid by bounding box and the
 * search widens ring by ring until no unexplored cell can hold a closer segment, so the result is
 * the same minimum a full scan with the nearestOnPolyline arithmetic gives.
 */
class RoadIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly ax: number[] = [];
  private readonly ay: number[] = [];
  private readonly bx: number[] = [];
  private readonly by: number[] = [];
  private minX = Number.POSITIVE_INFINITY;
  private minY = Number.POSITIVE_INFINITY;
  private cols = 0;
  private rows = 0;

  constructor(roads: readonly Point[][]) {
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const road of roads)
      for (const [x, y] of road) {
        this.minX = Math.min(this.minX, x);
        this.minY = Math.min(this.minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    this.cols = Math.floor((maxX - this.minX) / GRID_CELL_METERS) + 1;
    this.rows = Math.floor((maxY - this.minY) / GRID_CELL_METERS) + 1;
    for (const road of roads)
      for (let i = 0; i + 1 < road.length; i++) {
        const a = road[i];
        const b = road[i + 1];
        const id = this.ax.length;
        this.ax.push(a[0]);
        this.ay.push(a[1]);
        this.bx.push(b[0]);
        this.by.push(b[1]);
        const c0 = this.col(Math.min(a[0], b[0]));
        const c1 = this.col(Math.max(a[0], b[0]));
        const r0 = this.row(Math.min(a[1], b[1]));
        const r1 = this.row(Math.max(a[1], b[1]));
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const key = r * this.cols + c;
            const list = this.cells.get(key);
            if (list) list.push(id);
            else this.cells.set(key, [id]);
          }
      }
  }

  private col(x: number): number {
    return Math.floor((x - this.minX) / GRID_CELL_METERS);
  }

  private row(y: number): number {
    return Math.floor((y - this.minY) / GRID_CELL_METERS);
  }

  distance(point: Point): number {
    let best = Number.POSITIVE_INFINITY;
    const pc = this.col(point[0]);
    const pr = this.row(point[1]);
    const reach = Math.max(this.cols, this.rows, Math.abs(pc), Math.abs(pr)) + this.cols + this.rows;
    for (let ring = 0; ring <= reach; ring++) {
      if (best <= (ring - 1) * GRID_CELL_METERS) break;
      for (let r = pr - ring; r <= pr + ring; r++) {
        if (r < 0 || r >= this.rows) continue;
        const edgeRow = r === pr - ring || r === pr + ring;
        for (let c = pc - ring; c <= pc + ring; c += edgeRow || ring === 0 ? 1 : 2 * ring) {
          if (c < 0 || c >= this.cols) continue;
          const list = this.cells.get(r * this.cols + c);
          if (!list) continue;
          for (const id of list) {
            const dx = this.bx[id] - this.ax[id];
            const dy = this.by[id] - this.ay[id];
            const lenSq = dx * dx + dy * dy;
            let t = lenSq === 0 ? 0 : ((point[0] - this.ax[id]) * dx + (point[1] - this.ay[id]) * dy) / lenSq;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dist = Math.hypot(point[0] - (this.ax[id] + dx * t), point[1] - (this.ay[id] + dy * t));
            if (dist < best) best = dist;
          }
        }
      }
    }
    return best;
  }
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

/** What growRear needs about a house that does not depend on how far it grows. */
interface RearPlan {
  centre: Point;
  rear: number;
  normal: Point;
  vertexClear: number[];
  oldClear: number;
  area: number;
}

function rearPlan(polygon: Point[], roads: RoadIndex): RearPlan | null {
  if (polygon.length < 3) return null;
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
    const dist = roads.distance(mid);
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
  const vertexClear = polygon.map(point => roads.distance(point));
  return {
    centre,
    rear,
    normal,
    vertexClear,
    oldClear: Math.min(...vertexClear),
    area: Math.abs(polygonArea(polygon))
  };
}

/** Push the edge farthest from the streets further into the block. */
function growRear(polygon: Point[], delta: number, roads: RoadIndex, plan: RearPlan | null): Point[] | null {
  if (!plan || !(delta > 0)) return null;
  const { rear, normal } = plan;
  const nextIndex = (rear + 1) % polygon.length;
  const next = polygon.map((point, index) =>
    index === rear || index === nextIndex
      ? ([point[0] + normal[0] * delta, point[1] + normal[1] * delta] as Point)
      : point
  );
  if (Math.abs(polygonArea(next)) <= plan.area + 0.25) return null;
  // Only the two moved corners can have a new distance to the streets.
  const newClear = Math.min(
    ...next.map((point, index) =>
      index === rear || index === nextIndex ? roads.distance(point) : plan.vertexClear[index]
    )
  );
  if (newClear + 0.05 < plan.oldClear) return null;
  return next;
}

type FaceRing = { ring: Point[]; closed: Point[] } | null;

function insideFace(face: FaceRing, polygon: Point[]): boolean {
  if (!face) return false;
  const { ring, closed } = face;
  return polygon.every(point => pointInPolygon(point, ring) || nearestOnPolyline(point, closed).dist <= 0.05);
}

type Box = [number, number, number, number];
const BOX_EPS = 1e-6;

function boxOf(polygon: Point[]): Box {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of polygon) {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
  }
  return box;
}

/** A point inside `other` lies in its bounding box, so other points skip the polygon tests. */
function intrudes(moved: Point[], other: Point[], box: Box): boolean {
  let closed: Point[] | undefined;
  return moved.some(point => {
    if (
      point[0] < box[0] - BOX_EPS ||
      point[0] > box[2] + BOX_EPS ||
      point[1] < box[1] - BOX_EPS ||
      point[1] > box[3] + BOX_EPS
    )
      return false;
    if (!pointInPolygon(point, other)) return false;
    closed ??= [...other, other[0]];
    return nearestOnPolyline(point, closed).dist > 0.05;
  });
}

function growAll(
  document: CityDocument,
  buildings: readonly BuildingLot[],
  roads: RoadIndex,
  delta: number,
  plans: Map<BuildingLot, RearPlan | null>,
  faces: Map<string, FaceRing>
): BuildingLot[] {
  const next = buildings.slice();
  const boxes = buildings.map(lot => boxOf(lot.polygon));
  for (let i = 0; i < buildings.length; i++) {
    const lot = buildings[i];
    if (lot.landmark) continue;
    if (!plans.has(lot)) plans.set(lot, rearPlan(lot.polygon, roads));
    const grown = growRear(lot.polygon, delta, roads, plans.get(lot)!);
    if (!grown) continue;
    if (!faces.has(lot.faceId)) {
      const face = document.mesh.faces[lot.faceId];
      const ring = face ? facePoints(document.mesh, face) : [];
      faces.set(lot.faceId, ring.length < 3 ? null : { ring, closed: [...ring, ring[0]] });
    }
    if (!insideFace(faces.get(lot.faceId)!, grown)) continue;
    const moved = grown.filter(
      (point, index) => point[0] !== lot.polygon[index]?.[0] || point[1] !== lot.polygon[index]?.[1]
    );
    const hitsNeighbour = next.some((other, index) => index !== i && intrudes(moved, other.polygon, boxes[index]));
    if (hitsNeighbour) continue;
    next[i] = { ...lot, polygon: grown };
    boxes[i] = boxOf(grown);
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
  const index = new RoadIndex(roads);
  // The four scales regrow the same houses, so their street distances and face rings are shared.
  const plans = new Map<BuildingLot, RearPlan | null>();
  const faces = new Map<string, FaceRing>();
  for (const scale of SCALES) {
    const grown = growAll(document, buildings, index, delta * scale, plans, faces);
    if (coveredArea(grown) > before + 0.5) return grown;
  }
  return buildings;
}
