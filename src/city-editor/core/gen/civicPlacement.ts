import {
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polylineCrossesSegment,
  polylineTangent,
  segmentsIntersect
} from "./geom";
import { civicYardMeters, plazaFootprintMeters, templeCellCount, templeFootprintMeters } from "./housing";
import type { Cell, Point } from "./types";

const MAX_CIVIC_CELLS = 12;

export interface OrientedRect {
  center: Point;
  length: number;
  width: number;
  rotation: number;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function closeRing(points: Point[]): Point[] {
  return points.length ? [...points, points[0]] : [];
}

function foldAxis(angle: number): number {
  let a = angle;
  while (a <= -Math.PI / 2) a += Math.PI;
  while (a > Math.PI / 2) a -= Math.PI;
  return a;
}

/** Long-axis angle (CCW from +X) matching the nearest guide polyline. */
export function civicOrientation(point: Point, guides: Point[][]): number {
  let bestDist = Number.POSITIVE_INFINITY;
  let tangent: Point = [1, 0];
  for (const line of guides) {
    if (line.length < 2) continue;
    const hit = nearestOnPolyline(point, line);
    if (hit.dist < bestDist) {
      bestDist = hit.dist;
      tangent = polylineTangent(line, hit.segIndex);
    }
  }
  if (!Number.isFinite(bestDist) || bestDist === Number.POSITIVE_INFINITY) return 0;
  return foldAxis(Math.atan2(tangent[1], tangent[0]));
}

export function orientedRectCorners(rect: OrientedRect): Point[] {
  const hx = rect.length / 2;
  const hy = rect.width / 2;
  const c = Math.cos(rect.rotation);
  const s = Math.sin(rect.rotation);
  const corners: Point[] = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy]
  ];
  return corners.map(([x, y]) => [rect.center[0] + x * c - y * s, rect.center[1] + x * s + y * c] as Point);
}

export function pointInOrientedRect(point: Point, rect: OrientedRect): boolean {
  const dx = point[0] - rect.center[0];
  const dy = point[1] - rect.center[1];
  const c = Math.cos(-rect.rotation);
  const s = Math.sin(-rect.rotation);
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return Math.abs(x) <= rect.length / 2 && Math.abs(y) <= rect.width / 2;
}

export function orientedRectBoundarySamples(rect: OrientedRect, perEdge = 8): Point[] {
  const corners = orientedRectCorners(rect);
  const samples = [...corners];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let k = 1; k < perEdge; k++) {
      const t = k / perEdge;
      samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return samples;
}

/** Distance from the rectangle to an open polyline. 0 when they intersect. */
export function orientedRectPolylineDistance(rect: OrientedRect, line: Point[]): number {
  if (line.length < 2) return Number.POSITIVE_INFINITY;
  const corners = orientedRectCorners(rect);
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    if (pointInOrientedRect(a, rect)) return 0;
    for (let k = 0; k < corners.length; k++) {
      if (segmentsIntersect(a, b, corners[k], corners[(k + 1) % corners.length])) return 0;
    }
  }
  let min = Number.POSITIVE_INFINITY;
  for (const p of orientedRectBoundarySamples(rect)) min = Math.min(min, nearestOnPolyline(p, line).dist);
  return min;
}

export interface PolylineHazard {
  points: Point[];
  clearance: number;
}

function hazardGap(rect: OrientedRect, hazards: PolylineHazard[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const hazard of hazards) {
    if (hazard.points.length < 2) continue;
    min = Math.min(min, orientedRectPolylineDistance(rect, hazard.points) - hazard.clearance);
  }
  return min;
}

/** Slide a rectangle off nearby polylines along the local outward normal. */
export function nudgeRectOffPolylines(rect: OrientedRect, hazards: PolylineHazard[], maxShift = 48): OrientedRect {
  let current: OrientedRect = { ...rect, center: [rect.center[0], rect.center[1]] };
  const origin = current.center;
  for (let iter = 0; iter < 24; iter++) {
    let worst: { gap: number; nx: number; ny: number } | null = null;
    for (const hazard of hazards) {
      if (hazard.points.length < 2) continue;
      const dist = orientedRectPolylineDistance(current, hazard.points);
      const samples = [current.center, ...orientedRectBoundarySamples(current, dist < hazard.clearance ? 16 : 8)];
      for (const p of samples) {
        const hit = nearestOnPolyline(p, hazard.points);
        const sampleGap = (dist === 0 ? 0 : hit.dist) - hazard.clearance;
        if (worst !== null && sampleGap >= worst.gap) continue;
        let dx = current.center[0] - hit.point[0];
        let dy = current.center[1] - hit.point[1];
        let len = Math.hypot(dx, dy);
        if (len < 1e-6) {
          const tangent = polylineTangent(hazard.points, hit.segIndex);
          dx = -tangent[1];
          dy = tangent[0];
          len = 1;
        } else {
          dx /= len;
          dy /= len;
        }
        worst = { gap: sampleGap, nx: dx, ny: dy };
      }
    }
    if (!worst || worst.gap >= -0.05) return current;
    const step = Math.min(8, Math.max(1.2, -worst.gap + 0.8));
    const candidates: Point[] = [
      [current.center[0] + worst.nx * step, current.center[1] + worst.ny * step],
      [current.center[0] - worst.nx * step, current.center[1] - worst.ny * step]
    ];
    let best = current;
    let bestGap = hazardGap(current, hazards);
    for (const center of candidates) {
      if (Math.hypot(center[0] - origin[0], center[1] - origin[1]) > maxShift) continue;
      const trial = { ...current, center };
      const trialGap = hazardGap(trial, hazards);
      if (trialGap > bestGap) {
        bestGap = trialGap;
        best = trial;
      }
    }
    if (best.center[0] === current.center[0] && best.center[1] === current.center[1]) return current;
    current = best;
  }
  return current;
}

export function polygonHitsOrientedRect(polygon: Point[], rect: OrientedRect): boolean {
  if (polygon.length < 3) return false;
  const corners = orientedRectCorners(rect);
  if (corners.some(p => pointInPolygon(p, polygon))) return true;
  if (polygon.some(p => pointInOrientedRect(p, rect))) return true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (let k = 0; k < corners.length; k++) {
      if (segmentsIntersect(a, b, corners[k], corners[(k + 1) % corners.length])) return true;
    }
  }
  return false;
}

export function cellTouchesPolyline(cell: Cell, line: Point[], margin: number): boolean {
  if (line.length < 2) return false;
  if (nearestOnPolyline(cell.centroid, line).dist <= margin) return true;
  const ring = closeRing(cell.polygon);
  for (let i = 0; i < cell.polygon.length; i++) {
    const a = cell.polygon[i];
    const b = cell.polygon[(i + 1) % cell.polygon.length];
    if (nearestOnPolyline(a, line).dist <= margin) return true;
    if (polylineCrossesSegment(line, a, b)) return true;
  }
  for (const p of line) {
    if (pointInPolygon(p, cell.polygon) && nearestOnPolyline(p, ring).dist > 0.5) return true;
  }
  return false;
}

export function polylineThroughCellInterior(cell: Cell, line: Point[], eps = 1.5): boolean {
  if (line.length < 2 || cell.polygon.length < 3) return false;
  const ring = closeRing(cell.polygon);
  for (let i = 0; i + 1 < line.length; i++) {
    const mid: Point = [(line[i][0] + line[i + 1][0]) / 2, (line[i][1] + line[i + 1][1]) / 2];
    if (pointInPolygon(mid, cell.polygon) && nearestOnPolyline(mid, ring).dist > eps) return true;
  }
  return false;
}

export function clusterCentroid(ids: number[], byId: Map<number, Cell>): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  for (const id of ids) {
    const cell = byId.get(id);
    if (!cell) continue;
    const a = Math.abs(polygonArea(cell.polygon));
    area += a;
    x += cell.centroid[0] * a;
    y += cell.centroid[1] * a;
  }
  if (area <= 0) {
    const fallback = byId.get(ids[0]);
    return fallback?.centroid ?? [0, 0];
  }
  return [x / area, y / area];
}

export function clusterArea(ids: number[], byId: Map<number, Cell>): number {
  return ids.reduce((sum, id) => sum + Math.abs(polygonArea(byId.get(id)?.polygon ?? [])), 0);
}

export function growCluster(
  seedId: number,
  byId: Map<number, Cell>,
  eligible: (cell: Cell) => boolean,
  done: (ids: number[]) => boolean,
  maxCells = MAX_CIVIC_CELLS
): number[] {
  const seed = byId.get(seedId);
  if (!seed) return [];
  const ids = [seedId];
  const taken = new Set(ids);
  while (!done(ids) && ids.length < maxCells) {
    let best: Cell | null = null;
    let bestKey = Number.POSITIVE_INFINITY;
    for (const id of ids) {
      for (const n of byId.get(id)?.neighbors ?? []) {
        const cell = byId.get(n);
        if (!cell || taken.has(n) || !eligible(cell)) continue;
        const key = dist(cell.centroid, seed.centroid) * 1e6 + cell.id;
        if (key < bestKey) {
          bestKey = key;
          best = cell;
        }
      }
    }
    if (!best) break;
    taken.add(best.id);
    ids.push(best.id);
  }
  return ids;
}

export function placePlazaCluster(
  cells: Cell[],
  urban: Set<number>,
  sea: Set<number>,
  occupied: Set<number>,
  rivers: Point[][],
  extentMeters: number,
  cellSize: number,
  capital: boolean
): { cellIds: number[]; anchor: Point } | null {
  const byId = new Map(cells.map(c => [c.id, c]));
  const side = plazaFootprintMeters(extentMeters);
  const yard = civicYardMeters(extentMeters);
  const targetArea = side * side;
  const margin = Math.max(yard, cellSize * 0.35);
  const wet = (c: Cell): boolean => rivers.some(line => cellTouchesPolyline(c, line, margin));
  const eligible = (c: Cell): boolean => urban.has(c.id) && !sea.has(c.id) && !occupied.has(c.id) && !wet(c);
  const R = Math.max(1, extentMeters * 0.165);
  const inner = cells.filter(c => urban.has(c.id) && Math.hypot(...c.centroid) <= R * 1.7);
  const dry = (inner.length ? inner : cells.filter(c => urban.has(c.id))).filter(eligible);
  const pool = dry.length
    ? dry
    : (inner.length ? inner : cells.filter(c => urban.has(c.id))).filter(
        c => urban.has(c.id) && !sea.has(c.id) && !occupied.has(c.id)
      );
  if (!pool.length) return null;
  const seed = pool.slice().sort((a, b) => {
    const areaRank = Math.sqrt(Math.abs(polygonArea(b.polygon))) - Math.sqrt(Math.abs(polygonArea(a.polygon)));
    return Math.hypot(...a.centroid) - Math.hypot(...b.centroid) || areaRank || a.id - b.id;
  })[0];
  const minCells = capital ? 2 : 1;
  const cellIds = growCluster(
    seed.id,
    byId,
    c => urban.has(c.id) && !sea.has(c.id) && !occupied.has(c.id) && (dry.length ? !wet(c) : true),
    ids => ids.length >= minCells && clusterArea(ids, byId) >= targetArea
  );
  return { cellIds, anchor: clusterCentroid(cellIds, byId) };
}

function streetClearanceMeters(extentMeters: number): number {
  return Math.max(6, civicYardMeters(extentMeters) * 0.75);
}

export function templeHazards(streets: Point[][], rivers: Point[][], extentMeters: number): PolylineHazard[] {
  const street = streetClearanceMeters(extentMeters);
  const water = civicYardMeters(extentMeters);
  return [
    ...streets.filter(line => line.length >= 2).map(points => ({ points, clearance: street })),
    ...rivers.filter(line => line.length >= 2).map(points => ({ points, clearance: water }))
  ];
}

export function placeAndClearTempleRect(
  center: Point,
  extentMeters: number,
  guides: Point[][],
  hazards: PolylineHazard[]
): OrientedRect {
  const footprint = templeFootprintMeters(extentMeters);
  let rect: OrientedRect = {
    center: [center[0], center[1]],
    length: footprint.length,
    width: footprint.width,
    rotation: civicOrientation(center, guides)
  };
  rect = nudgeRectOffPolylines(rect, hazards);
  rect = { ...rect, rotation: civicOrientation(rect.center, guides) };
  return nudgeRectOffPolylines(rect, hazards);
}

export function fitsCluster(rect: OrientedRect, cellIds: number[], byId: Map<number, Cell>): boolean {
  const polys = cellIds.map(id => byId.get(id)?.polygon).filter((p): p is Point[] => !!p && p.length >= 3);
  if (!polys.length) return false;
  const samples = orientedRectBoundarySamples(rect, 4);
  samples.push(rect.center);
  return samples.every(p =>
    polys.some(poly => pointInPolygon(p, poly) || nearestOnPolyline(p, closeRing(poly)).dist <= 0.6)
  );
}

export function placeTempleFootprint(
  cells: Cell[],
  urban: Set<number>,
  occupied: Set<number>,
  plaza: { cellIds: number[]; anchor: Point } | null,
  citadelIds: Set<number>,
  extentMeters: number,
  cellSize: number,
  capital: boolean,
  streets: Point[][],
  rivers: Point[][]
): { cellIds: number[]; anchor: Point; rotation: number } | null {
  const byId = new Map(cells.map(c => [c.id, c]));
  const plazaIds = new Set(plaza?.cellIds ?? []);
  const plazaAnchor = plaza?.anchor ?? ([0, 0] as Point);
  const yard = civicYardMeters(extentMeters);
  const margin = Math.max(yard, cellSize * 0.35);
  const wet = (c: Cell): boolean => rivers.some(line => cellTouchesPolyline(c, line, margin));
  const streeted = (c: Cell): boolean => streets.some(line => polylineThroughCellInterior(c, line));
  const eligible = (c: Cell): boolean =>
    urban.has(c.id) && !occupied.has(c.id) && !plazaIds.has(c.id) && !citadelIds.has(c.id);
  const R = Math.max(1, extentMeters * 0.165);
  const inBand = (c: Cell): boolean => {
    const d = Math.hypot(...c.centroid);
    return d >= R * 0.12 && d <= R * 0.65;
  };
  const dry = cells.filter(c => eligible(c) && !wet(c));
  const dryPool = dry.length ? dry : cells.filter(eligible);
  if (!dryPool.length) return null;

  const plazaRings = [...plazaIds]
    .map(id => byId.get(id)?.polygon)
    .filter((p): p is Point[] => !!p && p.length >= 3)
    .map(closeRing);
  const guides = [...streets.filter(l => l.length >= 2), ...plazaRings];
  const hazards = templeHazards(streets, rivers, extentMeters);

  const score = (c: Cell): number => {
    let s = dist(c.centroid, plazaAnchor);
    if (c.neighbors.some(n => citadelIds.has(n))) s += cellSize;
    if (wet(c)) s += cellSize * 8;
    if (streeted(c)) s += cellSize * 4;
    if (c.neighbors.some(n => plazaIds.has(n))) s -= cellSize * 0.6;
    s -= Math.sqrt(Math.abs(polygonArea(c.polygon))) * 0.12;
    return s;
  };

  const ranked = dryPool.slice().sort((a, b) => {
    const inA = inBand(a) ? 0 : 1;
    const inB = inBand(b) ? 0 : 1;
    return inA - inB || score(a) - score(b) || a.id - b.id;
  });
  const minCells = templeCellCount(extentMeters, capital);
  const maxCells = Math.min(MAX_CIVIC_CELLS, minCells + 3);
  const footprint = templeFootprintMeters(extentMeters);
  const minArea = footprint.length * footprint.width;

  const clears = (rect: OrientedRect, ids: number[]): boolean =>
    hazards.every(h => orientedRectPolylineDistance(rect, h.points) >= h.clearance - 0.2) &&
    fitsCluster(rect, ids, byId);

  for (const pick of ranked.slice(0, Math.min(32, ranked.length))) {
    const growEligible = (c: Cell): boolean => eligible(c) && !wet(c) && !streeted(c);
    const fallbackEligible = (c: Cell): boolean => eligible(c) && !wet(c);
    for (const accept of [growEligible, fallbackEligible]) {
      if (!accept(pick)) continue;
      const cellIds = growCluster(
        pick.id,
        byId,
        accept,
        ids => ids.length >= minCells && clusterArea(ids, byId) >= minArea,
        maxCells
      );
      if (cellIds.length < minCells) continue;
      const rect = placeAndClearTempleRect(clusterCentroid(cellIds, byId), extentMeters, guides, hazards);
      if (!clears(rect, cellIds)) continue;
      return { cellIds, anchor: rect.center, rotation: rect.rotation };
    }
  }

  for (const pick of ranked) {
    const cellIds = growCluster(
      pick.id,
      byId,
      eligible,
      ids => ids.length >= minCells && clusterArea(ids, byId) >= minArea,
      maxCells
    );
    const rect = placeAndClearTempleRect(clusterCentroid(cellIds, byId), extentMeters, guides, hazards);
    if (hazards.every(h => orientedRectPolylineDistance(rect, h.points) >= h.clearance - 0.2)) {
      return { cellIds, anchor: rect.center, rotation: rect.rotation };
    }
  }

  const pick = ranked[0];
  const cellIds = growCluster(pick.id, byId, eligible, ids => ids.length >= minCells, maxCells);
  const rect = placeAndClearTempleRect(clusterCentroid(cellIds, byId), extentMeters, guides, hazards);
  return { cellIds, anchor: rect.center, rotation: rect.rotation };
}

export function templeRectForElement(
  point: Point,
  sizeMeters: number | undefined,
  rotation: number | undefined,
  extentMeters: number
): OrientedRect {
  const footprint = templeFootprintMeters(extentMeters);
  const length = sizeMeters && sizeMeters > 0 ? sizeMeters : footprint.length;
  const width = length * (footprint.width / footprint.length);
  return { center: point, length, width, rotation: rotation ?? 0 };
}

export function polygonHitsTempleYard(polygon: Point[], rect: OrientedRect, yard: number): boolean {
  return polygonHitsOrientedRect(polygon, {
    ...rect,
    length: rect.length + yard * 2,
    width: rect.width + yard * 2
  });
}
