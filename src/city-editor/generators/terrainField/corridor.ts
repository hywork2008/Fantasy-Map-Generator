// River corridors: a saved bed profile and banks, independent of cell elevation.

import type { CityDocument, EdgeFeatureGroup, Point } from "../../types/document";
import type { TerrainField, TerrainRiverCorridor } from "../../types/terrain";
import { polygonArea } from "../geom";
import { triangularInfillParts } from "../lotGeometry";
import { plotArea, corridor as segmentCorridor, subtractConvex } from "../parcelGeometry";
import { riverRibbonRing } from "../riverRibbonRing";
import { terrainFieldForDocument } from "./build";
import { sampleField } from "./sample";

/** Earth bank outside the water, in metres. Town quays have no slope. */
export const SLOPE_BANK_RUN_METERS = 6;

/** Pad and lot edges stop this far outside a quay, so the wall has a seat. */
const QUAY_SEAT_METERS = 0.4;

const MIN_PIECE_AREA = 4;

export interface RiverCourse {
  sourceId: string;
  points: Point[];
  widthMeters: number;
}

/** Same choice as the height-field carve: surveyed flows, otherwise drawn river groups. */
export function riverCourses(document: CityDocument): RiverCourse[] {
  if (document.riverFlows?.length)
    return document.riverFlows
      .filter(flow => flow.points.length >= 2)
      .map(flow => ({
        sourceId: `flow:${flow.riverId}`,
        points: flow.points.map(point => [point[0], point[1]] as Point),
        widthMeters: flow.widthMeters
      }));
  const courses: RiverCourse[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "river") continue;
    const points = group.vertices.flatMap(id => {
      const point = document.mesh.vertices[id]?.point;
      return point ? [[point[0], point[1]] as Point] : [];
    });
    if (points.length >= 2) courses.push({ sourceId: group.id, points, widthMeters: group.style.widthMeters });
  }
  return courses;
}

function bedProfile(field: TerrainField, points: readonly Point[], depth: number): number[] {
  const bed: number[] = [];
  let height = sampleField(field, points[0]) - depth;
  bed.push(height);
  for (let i = 1; i < points.length; i++) {
    const run = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const ground = sampleField(field, points[i]) - depth;
    height = Math.min(ground, height - Math.max(0.05, run * 0.002));
    bed.push(height);
  }
  return bed;
}

function urban(document: CityDocument, point: Point): boolean {
  const radius =
    document.frame.cityRadiusMeters > 0 ? document.frame.cityRadiusMeters : document.frame.extentMeters * 0.33;
  return Math.hypot(point[0], point[1]) <= radius;
}

/** One corridor per river. The bed falls downstream. A town reach is a quay; the rest is an earth bank. */
export function buildRiverCorridors(document: CityDocument, field: TerrainField): TerrainRiverCorridor[] {
  return riverCourses(document).map(course => {
    const depthMeters = Math.max(1.4, course.widthMeters * 0.1);
    const bedMeters = bedProfile(field, course.points, depthMeters);
    const mid = course.points[Math.floor(course.points.length / 2)];
    const rise = bedMeters.map((bed, index) => sampleField(field, course.points[index]) - bed);
    const quayHeight = Math.max(0.5, rise.reduce((sum, value) => sum + value, 0) / rise.length);
    return {
      kind: "riverCorridor" as const,
      id: `corridor:${course.sourceId}`,
      sourceId: course.sourceId,
      centerline: course.points,
      widthsMeters: course.points.map(() => course.widthMeters),
      bedMeters,
      depthMeters,
      bank: urban(document, mid)
        ? { kind: "quay" as const, heightMeters: quayHeight }
        : { kind: "slope" as const, runMeters: SLOPE_BANK_RUN_METERS }
    };
  });
}

/** Force a saved bed to fall downstream. Structural mistakes are left for validation. */
export function repairRiverBeds(document: CityDocument): void {
  const features = document.terrain?.features;
  if (!features) return;
  for (const feature of features) {
    if (feature.kind !== "riverCorridor") continue;
    for (let i = 1; i < feature.bedMeters.length; i++)
      if (feature.bedMeters[i] > feature.bedMeters[i - 1]) feature.bedMeters[i] = feature.bedMeters[i - 1];
  }
}

function sameLine(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => Math.hypot(point[0] - b[index][0], point[1] - b[index][1]) < 0.05);
}

/**
 * Replace corridors whose centre line no longer matches the document.
 * Unchanged lines, widths and depths keep their saved beds and manually edited banks. Returns true when the layer changed.
 */
export function syncRiverCorridors(document: CityDocument, field: TerrainField): boolean {
  if (!document.terrain?.field) return false;
  const previous = document.terrain.features.filter(feature => feature.kind === "riverCorridor");
  const next = buildRiverCorridors(document, field).map(fresh => {
    const kept = previous.find(
      feature =>
        feature.sourceId === fresh.sourceId &&
        sameLine(feature.centerline, fresh.centerline) &&
        feature.widthsMeters.length === fresh.widthsMeters.length &&
        feature.widthsMeters.every((width, index) => Math.abs(width - fresh.widthsMeters[index]) < 0.05) &&
        Math.abs(feature.depthMeters - fresh.depthMeters) < 1e-6
    );
    return kept ?? fresh;
  });
  const changed = next.length !== previous.length || next.some((feature, index) => feature !== previous[index]);
  if (!changed) return false;
  document.terrain.features = [
    ...document.terrain.features.filter(feature => feature.kind !== "riverCorridor"),
    ...next
  ];
  return true;
}

export interface CorridorStation {
  distance: number;
  bed: number;
  width: number;
  /** Unit normal of the nearest segment, pointing left of the downstream direction. */
  normal: Point;
  /** Point on the centre line. */
  at: Point;
}

/** Nearest centre-line station. Bed and width are interpolated along the segment and do not depend on the lateral offset. */
export function corridorStation(corridor: TerrainRiverCorridor, point: Point): CorridorStation | null {
  const line = corridor.centerline;
  if (line.length < 2) return null;
  let best: CorridorStation | null = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
    const at: Point = [a[0] + dx * t, a[1] + dy * t];
    const distance = Math.hypot(point[0] - at[0], point[1] - at[1]);
    if (best && best.distance <= distance) continue;
    const length = Math.hypot(dx, dy) || 1;
    const bed = corridor.bedMeters[i - 1] + (corridor.bedMeters[i] - corridor.bedMeters[i - 1]) * t;
    const width = corridor.widthsMeters[i - 1] + (corridor.widthsMeters[i] - corridor.widthsMeters[i - 1]) * t;
    best = { distance, bed, width, normal: [-dy / length, dx / length], at };
  }
  return best;
}

/** Ground height inside the corridor, or null outside its banks. Slope banks blend; a quay is vertical. */
export function corridorGround(corridor: TerrainRiverCorridor, natural: number, point: Point): number | null {
  const station = corridorStation(corridor, point);
  if (!station) return null;
  const half = station.width / 2;
  const reach = corridor.bank.kind === "slope" ? corridor.bank.runMeters : 0;
  if (station.distance > half + reach) return null;
  if (station.distance <= half || reach <= 0) return station.bed;
  const blend = (station.distance - half) / reach;
  return station.bed + blend * (natural - station.bed);
}

/** Absolute water surface where the point is inside the water width. Constant across that width. */
export function corridorWaterAt(corridors: readonly TerrainRiverCorridor[], point: Point): number | null {
  let level: number | null = null;
  for (const corridor of corridors) {
    const station = corridorStation(corridor, point);
    if (!station || station.distance > station.width / 2 + 0.05) continue;
    const surface = station.bed + corridor.depthMeters;
    level = level === null ? surface : Math.min(level, surface);
  }
  return level;
}

export function bankReach(corridor: TerrainRiverCorridor): number {
  return corridor.bank.kind === "slope" ? corridor.bank.runMeters : QUAY_SEAT_METERS;
}

/** Rings covering the water and its bank. A bent centre line may need one ring per segment. */
export function corridorRings(corridor: TerrainRiverCorridor): Point[][] {
  const width = Math.max(...corridor.widthsMeters) + bankReach(corridor) * 2;
  const ring = riverRibbonRing(corridor.centerline, width);
  if (ring && ring.length >= 3) return [ring];
  const pieces: Point[][] = [];
  for (let i = 1; i < corridor.centerline.length; i++) {
    const band = segmentCorridor(corridor.centerline[i - 1], corridor.centerline[i], width);
    if (band.length >= 3) pieces.push(band);
  }
  return pieces;
}

/** Closed ring covering the water and its bank. Null when the centre line cannot be offset as one ring. */
export function corridorFootprint(corridor: TerrainRiverCorridor): Point[] | null {
  const rings = corridorRings(corridor);
  return rings.length === 1 ? rings[0] : null;
}

/** Road ribbons as convex bands, so a pad can be cut back from the street. */
export function roadBands(document: CityDocument): Point[][] {
  const bands: Point[][] = [];
  for (const group of document.featureGroups) {
    if (group.kind === "river") continue;
    const road = group as EdgeFeatureGroup;
    if (road.kind !== "road") continue;
    for (const segment of road.segments) {
      const edge = document.mesh.edges[segment.edgeId];
      const a = edge ? document.mesh.vertices[edge.a]?.point : undefined;
      const b = edge ? document.mesh.vertices[edge.b]?.point : undefined;
      if (!a || !b) continue;
      const band = segmentCorridor(a, b, road.style.widthMeters);
      if (band.length >= 3) bands.push(band);
    }
  }
  return bands;
}

/** Largest remaining piece after cutting corridors and other convex clips out of a ring. */
export function clipRing(subject: readonly Point[], clips: readonly Point[][]): Point[] | null {
  const pieces = clipPieces(subject, clips).filter(piece => Math.abs(polygonArea(piece)) >= MIN_PIECE_AREA);
  if (!pieces.length) return null;
  pieces.sort((a, b) => plotArea(b) - plotArea(a));
  return pieces[0];
}

/** Every remaining piece of `subject` outside the clips. */
export function clipPieces(subject: readonly Point[], clips: readonly Point[][]): Point[][] {
  let pieces = triangularInfillParts([...subject]);
  if (!pieces.length && subject.length >= 3) pieces = [[...subject]];
  for (const clip of clips) {
    if (clip.length < 3) continue;
    const cutters = triangularInfillParts(clip);
    const parts = cutters.length ? cutters : [clip];
    for (const cutter of parts)
      pieces = pieces.flatMap(piece => (piece.length >= 3 ? subtractConvex(piece, cutter, 0.05) : []));
  }
  return pieces.filter(piece => piece.length >= 3 && plotArea(piece) >= 0.05);
}

/** Rebuild corridors after a river edit. Unchanged lines, widths and depths keep their saved beds and banks. */
export function refreshRiverCorridors(document: CityDocument): void {
  if (!document.terrain?.field) return;
  const field = terrainFieldForDocument(document);
  if (field) syncRiverCorridors(document, field);
}

/** Offset a polyline to one side. `distance` is positive to the left of travel. */
export function offsetPolyline(points: readonly Point[], distance: number): Point[] {
  if (points.length < 2 || distance === 0) return points.map(point => [point[0], point[1]]);
  const normals: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const length = Math.hypot(dx, dy) || 1;
    normals.push([-dy / length, dx / length]);
  }
  return points.map((point, index) => {
    const normal =
      index === 0
        ? normals[0]
        : index === points.length - 1
          ? normals[normals.length - 1]
          : [normals[index - 1][0] + normals[index][0], normals[index - 1][1] + normals[index][1]];
    const length = Math.hypot(normal[0], normal[1]) || 1;
    return [point[0] + (normal[0] / length) * distance, point[1] + (normal[1] / length) * distance] as Point;
  });
}
