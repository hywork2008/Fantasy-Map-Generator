import { gatePlazaDisks } from "../passages";
import type { CityDocument, Point } from "../types";
import type { BuildingLot } from "./buildingLots";
import { pointInPolygon, polygonArea, polygonCentroid } from "./geom";

interface Disk {
  center: Point;
  radius: number;
}

/** A house is caught by a plaza when more than a hair of it lies inside the disk. */
const BITE_METERS = 0.35;
/** Party walls of attached houses sit closer than a lane. */
const PARTY_GAP_METERS = 0.8;

function hypot(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function segmentDistance(a: Point, b: Point, p: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return hypot(a, p);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentsGap(a: Point, b: Point, c: Point, d: Point): number {
  return Math.min(
    segmentDistance(a, b, c),
    segmentDistance(a, b, d),
    segmentDistance(c, d, a),
    segmentDistance(c, d, b)
  );
}

function _polygonGap(a: Point[], b: Point[]): number {
  let gap = Infinity;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) gap = Math.min(gap, segmentsGap(a0, a1, b[j], b[(j + 1) % b.length]));
  }
  return gap;
}

/** True when the polygon takes a visible bite out of the open plaza disk. */
export function polygonBitesDisk(poly: Point[], disk: Disk, margin = BITE_METERS): boolean {
  const limit = disk.radius - margin;
  if (limit <= 0 || poly.length < 3) return false;
  if (poly.some(p => hypot(p, disk.center) < limit)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (segmentDistance(poly[i], poly[(i + 1) % poly.length], disk.center) < limit) return true;
  }
  return false;
}

function bitesAny(poly: Point[], disks: Disk[], margin = BITE_METERS): boolean {
  return disks.some(disk => polygonBitesDisk(poly, disk, margin));
}

/** Length of the collinear contact between one edge and the other footprint. */
function partyOverlap(a: Point, b: Point, other: Point[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return 0;
  const axis: Point = [dx / length, dy / length];
  const project = (point: Point) => point[0] * axis[0] + point[1] * axis[1];
  const lo = Math.min(project(a), project(b));
  const hi = Math.max(project(a), project(b));
  const marks: number[] = [];
  for (let i = 0; i < other.length; i++) {
    const c = other[i];
    const d = other[(i + 1) % other.length];
    if (segmentsGap(a, b, c, d) > PARTY_GAP_METERS) continue;
    marks.push(project(c), project(d));
  }
  if (!marks.length) return 0;
  return Math.max(0, Math.min(hi, Math.max(...marks)) - Math.max(lo, Math.min(...marks)));
}

function nearestPartyEdge(poly: Point[], other: Point[]): number {
  let best = -1;
  let bestOverlap = 0.5;
  for (let i = 0; i < poly.length; i++) {
    const overlap = partyOverlap(poly[i], poly[(i + 1) % poly.length], other);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = i;
    }
  }
  return best;
}

function edgeNormalToward(poly: Point[], edge: number, target: Point): Point | null {
  const a = poly[edge];
  const b = poly[(edge + 1) % poly.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  let normal: Point = [-dy / length, dx / length];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (normal[0] * (target[0] - mid[0]) + normal[1] * (target[1] - mid[1]) < 0) normal = [-normal[0], -normal[1]];
  return normal;
}

function slideEdge(poly: Point[], edge: number, normal: Point, distance: number): Point[] {
  const next = poly.map(point => [point[0], point[1]] as Point);
  for (const index of [edge, (edge + 1) % poly.length]) {
    next[index] = [next[index][0] + normal[0] * distance, next[index][1] + normal[1] * distance];
  }
  return next;
}

function intrudes(poly: Point[], other: Point[]): boolean {
  for (const point of poly) {
    if (!pointInPolygon(point, other)) continue;
    let gap = Infinity;
    for (let i = 0; i < other.length; i++)
      gap = Math.min(gap, segmentDistance(other[i], other[(i + 1) % other.length], point));
    if (gap > 0.25) return true;
  }
  return false;
}

/**
 * Houses that the gate plazas would slice are omitted. Each attached neighbour
 * grows across the part of that footprint which stays outside the plaza, so the
 * row keeps its frontage without a bitten outline.
 */
export function relieveGatePlazaBuildings(document: CityDocument, buildings: BuildingLot[]): BuildingLot[] {
  const disks = gatePlazaDisks(document);
  if (!disks.length || !buildings.length) return buildings;
  const lots = buildings.map(building => ({
    ...building,
    polygon: building.polygon.map(point => [...point] as Point)
  }));
  const drop = new Set<number>();
  for (let i = 0; i < lots.length; i++) if (!lots[i].landmark && bitesAny(lots[i].polygon, disks)) drop.add(i);
  if (!drop.size) return buildings;
  const pending = new Set(drop);
  const survivor = (index: number) => !drop.has(index);

  let grew = true;
  while (grew) {
    grew = false;
    for (const index of [...pending]) {
      const vacated = lots[index].polygon;
      const neighbours = lots
        .map((lot, neighbour) => ({ neighbour, edge: nearestPartyEdge(lot.polygon, vacated) }))
        .filter(item => survivor(item.neighbour) && item.edge >= 0 && !lots[item.neighbour].landmark);
      if (!neighbours.length) continue;
      const center = polygonCentroid(vacated);
      let absorbed = false;
      for (const { neighbour, edge } of neighbours) {
        const lot = lots[neighbour];
        const normal = edgeNormalToward(lot.polygon, edge, center);
        if (!normal) continue;
        const dot = (point: Point) => point[0] * normal[0] + point[1] * normal[1];
        const edgeDot = Math.max(dot(lot.polygon[edge]), dot(lot.polygon[(edge + 1) % lot.polygon.length]));
        const vacatedDots = vacated.map(dot);
        const limit = neighbours.length > 1 ? dot(center) : Math.max(...vacatedDots);
        const desired = limit - edgeDot;
        if (desired < 0.15) continue;
        const others = lots.filter((_, other) => other !== neighbour && other !== index && survivor(other));
        let low = 0;
        let high = desired;
        for (let step = 0; step < 14; step++) {
          const mid = (low + high) / 2;
          const moved = slideEdge(lot.polygon, edge, normal, mid);
          const blocked = bitesAny(moved, disks, 0.05) || others.some(other => intrudes(moved, other.polygon));
          if (blocked || Math.abs(polygonArea(moved)) < Math.abs(polygonArea(lot.polygon)) * 0.5) high = mid;
          else low = mid;
        }
        if (low < 0.15) continue;
        lot.polygon = slideEdge(lot.polygon, edge, normal, low);
        absorbed = true;
      }
      if (absorbed) {
        pending.delete(index);
        grew = true;
      }
    }
  }
  return lots.filter((_, index) => !drop.has(index));
}
