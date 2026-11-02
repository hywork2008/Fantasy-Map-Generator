import type { CityDocument, Point } from "../../types/document";
import type { LandZone } from "../../types/freeformCity";
import type { TerrainRiverCorridor } from "../../types/terrain";
import { pointInPolygon, polygonArea, segmentsIntersect } from "../geom";
import { terrainFieldForDocument } from "../terrainField/build";
import { offsetPolyline, SLOPE_BANK_RUN_METERS } from "../terrainField/corridor";
import { sampleField } from "../terrainField/sample";
import { riverCrossing } from "./validateWay";
import { offsetStrip } from "./wayGeometry";

const MIN_RIVER_METERS = 4;
const MIN_ZONE_AREA = 4;

export type RiverReject = "short" | "frame" | "plot" | "field" | "bridge";
export type ZoneReject = "short" | "frame";

export function previewRiver(
  document: CityDocument,
  centerline: readonly Point[],
  widthMeters: number
): { ok: boolean; reason?: RiverReject } {
  if (!document.freeform) return { ok: false, reason: "field" };
  if (lengthOf(centerline) < MIN_RIVER_METERS) return { ok: false, reason: "short" };
  if (centerline.some(point => !insideFrame(document, point))) return { ok: false, reason: "frame" };
  if (crossesPlot(document, centerline, widthMeters)) return { ok: false, reason: "plot" };
  if (!document.terrain?.field) return { ok: false, reason: "field" };
  const corridor: TerrainRiverCorridor = {
    kind: "riverCorridor",
    id: "preview",
    sourceId: "preview",
    centerline: centerline.map(point => [point[0], point[1]]),
    widthsMeters: centerline.map(() => widthMeters),
    bedMeters: centerline.map(() => 0),
    depthMeters: 1,
    bank: { kind: "slope", runMeters: 0 }
  };
  const crossingDocument = { ...document, terrain: { ...document.terrain, features: [corridor] } };
  if ((document.terrain.ways ?? []).some(way => riverCrossing(crossingDocument, way).reason))
    return { ok: false, reason: "bridge" };
  return { ok: true };
}

export function commitRiver(
  document: CityDocument,
  id: string,
  centerline: readonly Point[],
  widthMeters: number
): { document: CityDocument; reason?: RiverReject } {
  const preview = previewRiver(document, centerline, widthMeters);
  if (!preview.ok || !document.terrain) return { document, reason: preview.reason };
  const field = terrainFieldForDocument(document);
  if (!field) return { document, reason: "field" };
  const line = centerline.map(point => [point[0], point[1]] as Point);
  const depthMeters = Math.max(1.4, widthMeters * 0.1);
  const corridor: TerrainRiverCorridor = {
    kind: "riverCorridor",
    id,
    sourceId: id,
    centerline: line,
    widthsMeters: line.map(() => widthMeters),
    bedMeters: descendingBed(line, point => sampleField(field, point), depthMeters),
    depthMeters,
    bank: { kind: "slope", runMeters: SLOPE_BANK_RUN_METERS }
  };
  const features = document.terrain.features.filter(feature => feature.id !== id);
  return { document: { ...document, terrain: { ...document.terrain, features: [...features, corridor] } } };
}

export function removeRiver(document: CityDocument, id: string): CityDocument {
  if (!document.terrain?.features.some(feature => feature.id === id)) return document;
  return {
    ...document,
    terrain: { ...document.terrain, features: document.terrain.features.filter(feature => feature.id !== id) }
  };
}

export function previewZone(document: CityDocument, polygon: readonly Point[]): { ok: boolean; reason?: ZoneReject } {
  if (!document.freeform) return { ok: false, reason: "short" };
  if (polygon.length < 3 || Math.abs(polygonArea([...polygon])) < MIN_ZONE_AREA) return { ok: false, reason: "short" };
  if (polygon.some(point => !insideFrame(document, point))) return { ok: false, reason: "frame" };
  return { ok: true };
}

export function commitZone(
  document: CityDocument,
  id: string,
  kind: LandZone["kind"],
  polygon: readonly Point[]
): { document: CityDocument; reason?: ZoneReject } {
  const preview = previewZone(document, polygon);
  if (!preview.ok || !document.freeform) return { document, reason: preview.reason ?? "short" };
  const zone: LandZone = { id, kind, polygon: polygon.map(point => [point[0], point[1]]) };
  return {
    document: {
      ...document,
      freeform: {
        ...document.freeform,
        zones: [...document.freeform.zones.filter(item => item.id !== id), zone]
      }
    }
  };
}

export function removeZone(document: CityDocument, id: string): CityDocument {
  if (!document.freeform?.zones.some(zone => zone.id === id)) return document;
  return {
    ...document,
    freeform: { ...document.freeform, zones: document.freeform.zones.filter(zone => zone.id !== id) }
  };
}

/** Bed falls downstream, and stays at least `depth` under the sampled ground. */
function descendingBed(points: readonly Point[], groundAt: (point: Point) => number, depth: number): number[] {
  const bed: number[] = [];
  let height = groundAt(points[0]) - depth;
  bed.push(height);
  for (let i = 1; i < points.length; i++) {
    const run = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    height = Math.min(groundAt(points[i]) - depth, height - Math.max(0.05, run * 0.002));
    bed.push(height);
  }
  return bed;
}

function crossesPlot(document: CityDocument, centerline: readonly Point[], widthMeters: number): boolean {
  const plots = (document.terrain?.features ?? []).flatMap(feature =>
    feature.kind === "platform" && feature.role === "pad" && feature.summit.kind === "polygon"
      ? [feature.summit.points]
      : []
  );
  if (!plots.length || centerline.length < 2) return false;
  const half = widthMeters / 2;
  const ribbon = offsetStrip(centerline, half);
  const lines = [centerline, offsetPolyline(centerline, half), offsetPolyline(centerline, -half)];
  for (const plot of plots) {
    if (ribbon.length >= 3 && plot.some(point => pointInPolygon(point, ribbon))) return true;
    for (const line of lines) {
      if (line.some(point => pointInPolygon(point, plot))) return true;
      for (let index = 1; index < line.length; index++) {
        for (let edge = 0; edge < plot.length; edge++) {
          if (segmentsIntersect(line[index - 1], line[index], plot[edge], plot[(edge + 1) % plot.length])) return true;
        }
      }
    }
  }
  return false;
}

function insideFrame(document: CityDocument, point: Point): boolean {
  const half = document.frame.extentMeters / 2;
  return point[0] >= -half && point[0] <= half && point[1] >= -half && point[1] <= half;
}

function lengthOf(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}
