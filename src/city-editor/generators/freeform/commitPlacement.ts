import {
  type FootprintBox,
  frontAxisOf,
  type PlanBox,
  planBox,
  planBoxCorners,
  rotationFromFacing
} from "../../../buildings/placementContract";
import type { CityDocument, CityElement, Point } from "../../types/document";
import type { TerrainPlatform } from "../../types/terrain";
import { pointInPolygon } from "../geom";
import { terrainFieldForDocument } from "../terrainField/build";
import { fieldFoundation } from "../terrainField/lots";
import { sampleField, slopeField } from "../terrainField/sample";
import { classifyTownWater } from "../townWater";
import { createPlotIndex, plotRecord } from "./plotIndex";
import { type PlacementReject, validatePlacement } from "./validatePlacement";

/** Gap between the building box and the next plot. The pad outline is the grown box. */
export const DEFAULT_PLOT_MARGIN_METERS = 1;

const PLOT_PREFIX = "plot:";

export type PlacementFailure = PlacementReject | "field";

export interface PlacementDraft {
  id: string;
  modelId: string;
  position: Point;
  facingDegrees: number;
  /** Building box, without the plot margin. */
  footprint: FootprintBox;
  marginMeters?: number;
}

export interface PlacementPreview {
  ok: boolean;
  reason?: PlacementFailure;
  level: number;
  edge: TerrainPlatform["edge"];
  facingDegrees: number;
  rotation: number;
  building: [Point, Point, Point, Point];
  plot: [Point, Point, Point, Point];
}

export function plotFeatureId(id: string): string {
  return `${PLOT_PREFIX}${id}`;
}

export function isPlotPlacement(document: CityDocument, id: string): boolean {
  return (document.terrain?.features ?? []).some(
    feature => feature.kind === "platform" && feature.id === plotFeatureId(id)
  );
}

export function previewPlacement(document: CityDocument, draft: PlacementDraft): PlacementPreview {
  const margin = draft.marginMeters ?? DEFAULT_PLOT_MARGIN_METERS;
  const rotation = rotationFromFacing(frontAxisOf(draft.modelId), draft.facingDegrees);
  const building = planBox(draft.position, draft.footprint, rotation);
  const plot = planBox(
    draft.position,
    { halfX: draft.footprint.halfX + margin, halfZ: draft.footprint.halfZ + margin },
    rotation
  );
  const field = terrainFieldForDocument(document);
  if (!field) {
    return {
      ok: false,
      reason: "field",
      level: 0,
      edge: { kind: "slope", runMeters: 0 },
      facingDegrees: draft.facingDegrees,
      rotation,
      building: planBoxCorners(building),
      plot: planBoxCorners(plot)
    };
  }
  const heightAt = (point: Point) => sampleField(field, point);
  const outline = planBoxCorners(plot);
  const level = fieldFoundation(outline, heightAt, heightAt);
  let edgeDrop = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    for (const t of [0, 0.5]) {
      const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      edgeDrop = Math.max(edgeDrop, Math.abs(heightAt(point) - level));
    }
  }
  const decision = validatePlacement(
    {
      id: draft.id,
      box: plot,
      slope: slopeField(field, draft.position),
      areaM2: 4 * draft.footprint.halfX * draft.footprint.halfZ,
      edgeDropMeters: edgeDrop,
      onWater: onWater(document, draft.position),
      onCliff: onCliff(document, draft.position, slopeField(field, draft.position)),
      onWay: false
    },
    plotIndex(document, draft.id)
  );
  return {
    ok: decision.ok,
    reason: decision.reason,
    level,
    edge: decision.edge,
    facingDegrees: draft.facingDegrees,
    rotation,
    building: planBoxCorners(building),
    plot: planBoxCorners(plot)
  };
}

export function commitPlacement(
  document: CityDocument,
  draft: PlacementDraft
): { document: CityDocument; preview: PlacementPreview } {
  const preview = previewPlacement(document, draft);
  if (!preview.ok || !document.terrain?.field) return { document, preview };
  const kept = (document.terrain.features ?? []).filter(feature => feature.id !== plotFeatureId(draft.id));
  const pad: TerrainPlatform = {
    kind: "platform",
    id: plotFeatureId(draft.id),
    ownerId: draft.id,
    role: "pad",
    summit: { kind: "polygon", points: preview.plot },
    levelMeters: preview.level,
    edge: preview.edge.kind === "wall" ? { kind: "wall" } : { kind: "slope", runMeters: preview.edge.runMeters }
  };
  const element: CityElement = {
    id: draft.id,
    kind: "object",
    faceIds: [],
    locked: false,
    point: draft.position,
    objectType: draft.modelId,
    objectScale: 1,
    rotation: preview.rotation
  };
  return {
    document: {
      ...document,
      elements: [...document.elements.filter(item => item.id !== draft.id), element],
      terrain: { ...document.terrain, features: [...kept, pad] }
    },
    preview
  };
}

export function removePlacement(document: CityDocument, id: string): CityDocument {
  if (!isPlotPlacement(document, id)) {
    return { ...document, elements: document.elements.filter(item => item.id !== id) };
  }
  return {
    ...document,
    elements: document.elements.filter(item => item.id !== id),
    terrain: document.terrain
      ? { ...document.terrain, features: document.terrain.features.filter(feature => feature.id !== plotFeatureId(id)) }
      : document.terrain
  };
}

function plotIndex(document: CityDocument, ignoreId: string) {
  const records = [];
  for (const feature of document.terrain?.features ?? []) {
    if (feature.kind !== "platform" || feature.role !== "pad" || !feature.id.startsWith(PLOT_PREFIX)) continue;
    const id = feature.ownerId ?? feature.id.slice(PLOT_PREFIX.length);
    if (id === ignoreId || feature.summit.kind !== "polygon" || feature.summit.points.length < 4) continue;
    records.push(plotRecord(id, boxFromCorners(feature.summit.points)));
  }
  const index = createPlotIndex();
  index.load(records);
  return index;
}

function boxFromCorners(points: readonly Point[]): PlanBox {
  const sw = points[0];
  const se = points[1];
  const nw = points[3] ?? points[2];
  const xLen = Math.hypot(se[0] - sw[0], se[1] - sw[1]) || 1;
  const zLen = Math.hypot(nw[0] - sw[0], nw[1] - sw[1]) || 1;
  return {
    center: [
      (points[0][0] + points[1][0] + points[2][0] + (points[3]?.[0] ?? points[2][0])) / 4,
      (points[0][1] + points[1][1] + points[2][1] + (points[3]?.[1] ?? points[2][1])) / 4
    ],
    axisX: [(se[0] - sw[0]) / xLen, (se[1] - sw[1]) / xLen],
    axisZ: [(nw[0] - sw[0]) / zLen, (nw[1] - sw[1]) / zLen],
    halfX: xLen / 2,
    halfZ: zLen / 2
  };
}

const waterCache = new WeakMap<CityDocument, Point[][]>();

function onWater(document: CityDocument, point: Point): boolean {
  let polygons = waterCache.get(document);
  if (!polygons) {
    polygons = classifyTownWater(document).parts.map(part => part.polygon);
    waterCache.set(document, polygons);
  }
  if (polygons.some(polygon => pointInPolygon(point, polygon))) return true;
  for (const feature of document.terrain?.features ?? []) {
    if (feature.kind !== "riverCorridor") continue;
    for (let i = 1; i < feature.centerline.length; i++) {
      const width = Math.max(feature.widthsMeters[i - 1] ?? 0, feature.widthsMeters[i] ?? 0) / 2;
      if (segmentDistance(point, feature.centerline[i - 1], feature.centerline[i]) <= width) return true;
    }
  }
  return false;
}

function onCliff(document: CityDocument, point: Point, slope: number): boolean {
  if (slope >= 1) return true;
  for (const feature of document.terrain?.features ?? []) {
    if (feature.kind !== "platform" || feature.edge.kind !== "cliff" || feature.role === "pad") continue;
    if (feature.summit.kind === "polygon" && pointInPolygon(point, feature.summit.points)) return true;
    if (
      feature.summit.kind === "circle" &&
      Math.hypot(point[0] - feature.summit.center[0], point[1] - feature.summit.center[1]) <=
        feature.summit.radiusMeters
    )
      return true;
  }
  return false;
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
}
