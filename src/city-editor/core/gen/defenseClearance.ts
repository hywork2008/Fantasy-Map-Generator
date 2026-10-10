// Glacis in front of the curtain (docs/city-editor/plan/suburban-landuse-redesign.md).
// A plain gate measures the approach profile from the wall. A barbican gate measures
// the same profile from the outer face of the outwork. The barbican is the defense.
import type { CityDocument, HistoricalPeriod, Id, Point } from "../types";
import { nearestOnPolyline, segmentsIntersect } from "./geom";

/** Trade and granary approaches. Rural is 30 m and a frontier road is 70 m. */
export const STANDARD_GLACIS_METERS = 25;

/**
 * Room kept in the roadside window until the real barbican is known.
 * A 12 m wall, a 40 m moat and the longest front tower still land inside this.
 */
export const MAX_BARBICAN_REACH_METERS = 90;

const PERIOD_ORDER: HistoricalPeriod[] = [
  "classicalAntiquity",
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
];

/** Same default as barbican placement: an unset period is the age of exploration. */
export function barbicanEra(period: HistoricalPeriod | undefined): boolean {
  const at = PERIOD_ORDER.indexOf(period ?? "ageOfExploration");
  return at >= PERIOD_ORDER.indexOf("highMedieval");
}

export interface GlacisBarbican {
  gateId: Id;
  curtain: [Point[], Point[]];
  frontTowers: Point[][];
}

export interface GlacisBand {
  points: Point[];
  clearance: number;
  gateVertexId?: Id;
}

export interface GlacisOutwork {
  gateId: Id;
  gateVertexId: Id;
  lines: Point[][];
  /** Metres from the gate point to the outermost tower or curtain face. */
  reachMeters: number;
  clearance: number;
}

export interface GlacisField {
  active: boolean;
  walls: Point[][];
  bands: readonly GlacisBand[];
  outworks: readonly GlacisOutwork[];
}

export function curtainSegments(document: CityDocument): Point[][] {
  return document.featureGroups.flatMap(group =>
    group.kind === "wall"
      ? group.segments.flatMap(ref => {
          const edge = document.mesh.edges[ref.edgeId];
          const a = edge && document.mesh.vertices[edge.a]?.point;
          const b = edge && document.mesh.vertices[edge.b]?.point;
          return a && b ? [[a, b] as Point[]] : [];
        })
      : []
  );
}

function pointSeg(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

function segmentGap(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}

/** Smallest gap between a polygon's boundary and a set of polylines. */
export function gapToLines(polygon: Point[], lines: readonly Point[][]): number {
  let gap = Infinity;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const c = line[i - 1];
      const d = line[i];
      for (let j = 0; j < polygon.length; j++) {
        const next = segmentGap(polygon[j], polygon[(j + 1) % polygon.length], c, d);
        if (next < gap) gap = next;
        if (gap === 0) return 0;
      }
    }
  }
  return gap;
}

function centroid(points: Point[]): Point {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length
  ];
}

function clearanceAt(point: Point, bands: readonly GlacisBand[]): number {
  if (!bands.length) return STANDARD_GLACIS_METERS;
  let best = bands[0];
  let dist = nearestOnPolyline(point, best.points).dist;
  for (let i = 1; i < bands.length; i++) {
    const next = nearestOnPolyline(point, bands[i].points).dist;
    if (next < dist) {
      dist = next;
      best = bands[i];
    }
  }
  return best.clearance;
}

function requiredClearance(polygon: Point[], bands: readonly GlacisBand[]): number {
  let required = clearanceAt(centroid(polygon), bands);
  for (const point of polygon) required = Math.max(required, clearanceAt(point, bands));
  return required;
}

function outwardReach(origin: Point, lines: readonly Point[][]): number {
  let reach = 0;
  for (const line of lines)
    for (const point of line) reach = Math.max(reach, Math.hypot(point[0] - origin[0], point[1] - origin[1]));
  return reach;
}

/** Outer curtain and front towers of each barbican, with that gate's profile clearance. */
export function glacisOutworks(
  document: CityDocument,
  barbicans: readonly GlacisBarbican[],
  bands: readonly GlacisBand[]
): GlacisOutwork[] {
  const out: GlacisOutwork[] = [];
  for (const barbican of barbicans) {
    const gate = (document.gates ?? []).find(item => item.id === barbican.gateId && !item.ownerCastleId);
    const origin = gate && document.mesh.vertices[gate.vertexId]?.point;
    if (!gate || !origin) continue;
    const lines = [
      ...barbican.curtain.filter(line => line.length >= 2),
      ...barbican.frontTowers.filter(tower => tower.length >= 2).map(tower => [...tower, tower[0]] as Point[])
    ];
    if (!lines.length) continue;
    const band = bands.find(item => item.gateVertexId === gate.vertexId);
    out.push({
      gateId: barbican.gateId,
      gateVertexId: gate.vertexId,
      lines,
      reachMeters: outwardReach(origin, lines),
      clearance: band?.clearance ?? STANDARD_GLACIS_METERS
    });
  }
  return out;
}

/**
 * True when `polygon` stays outside the glacis.
 * `minClearance` raises the wall distance for a building tied to one approach,
 * so a nearer quiet road cannot pull it into that approach's field of fire.
 */
export function polygonClearsGlacis(polygon: Point[], field: GlacisField, minClearance = 0): boolean {
  if (!field.active || polygon.length < 3) return true;
  const need = Math.max(minClearance, requiredClearance(polygon, field.bands));
  if (gapToLines(polygon, field.walls) + 1e-6 < need) return false;
  return polygonClearsOutworks(polygon, field.outworks);
}

/** True when `polygon` is at least the outwork's own profile beyond every barbican. */
export function polygonClearsOutworks(polygon: Point[], outworks: readonly GlacisOutwork[]): boolean {
  if (polygon.length < 3) return true;
  return outworks.every(work => gapToLines(polygon, work.lines) + 1e-6 >= work.clearance);
}
