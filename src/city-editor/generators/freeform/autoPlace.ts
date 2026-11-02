import type { FootprintBox } from "../../../buildings/placementContract";
import { placementFootprint } from "../../../buildings/placementModels";
import type { CityDocument, Point } from "../../types/document";
import { domeTemplateSize } from "../terrainField/templates";
import { commitPlacement, DEFAULT_PLOT_MARGIN_METERS, type PlacementDraft } from "./commitPlacement";
import { RETAINING_WALL_THICKNESS_METERS } from "./validatePlacement";

/** One pass stops at this many plots so the click stays on the editor thread. */
export const AUTO_PLACE_CAP = 48;

/**
 * Houses sit on the dome, inside this share of its radius.
 * The flat ground outside the dome is left open.
 */
const CROWN_SHARE = 0.92;

export type AutoPlaceReason = "ledger" | "model" | "full" | "ground";

export interface AutoPlaceResult {
  document: CityDocument;
  placed: number;
  reason?: AutoPlaceReason;
}

/** Centre spacing that keeps rotated plots and their retaining edges apart. */
export function placeStepMeters(footprint: FootprintBox): number {
  const reach = Math.hypot(footprint.halfX + DEFAULT_PLOT_MARGIN_METERS, footprint.halfZ + DEFAULT_PLOT_MARGIN_METERS);
  return Math.ceil(reach * 2 + RETAINING_WALL_THICKNESS_METERS * 2 + 2);
}

/** How many houses the dome crown can take at `stepMeters`, capped for one pass. */
export function autoPlaceCount(extentMeters: number, stepMeters: number): number {
  const radius = domeTemplateSize(extentMeters).radiusMeters * CROWN_SHARE;
  const across = Math.floor((radius * 2) / Math.max(stepMeters, 1));
  const disk = Math.round((Math.PI / 4) * across * across);
  return Math.max(1, Math.min(AUTO_PLACE_CAP, disk));
}

/**
 * Write buildings onto a freeform city through the same check and commit as the manual tool.
 * Opening a saved ledger does not call this. An FMG street or wall descriptor is not read.
 */
export function placeFreeformBuildings(
  document: CityDocument,
  options?: { count?: number; modelId?: string; seed?: number }
): AutoPlaceResult {
  if (!document.freeform || !document.terrain?.field) return { document, placed: 0, reason: "ledger" };
  const modelId = options?.modelId ?? "house:mediterranean";
  const footprint = placementFootprint(modelId);
  if (!footprint) return { document, placed: 0, reason: "model" };
  const step = placeStepMeters(footprint);
  const goal = options?.count ?? autoPlaceCount(document.frame.extentMeters, step);
  if (padCount(document) >= goal) return { document, placed: 0, reason: "full" };
  const need = goal - padCount(document);
  const inset = Math.hypot(footprint.halfX + DEFAULT_PLOT_MARGIN_METERS, footprint.halfZ + DEFAULT_PLOT_MARGIN_METERS);
  const offset = ((options?.seed ?? document.terrain.field.seed) >>> 0) % 360;
  const used = new Set(document.elements.map(element => element.id));
  let serial = 1;
  let current = document;
  let placed = 0;
  for (const position of candidates(document.frame.extentMeters, step, inset)) {
    if (placed >= need) break;
    while (used.has(`auto-${serial}`)) serial += 1;
    const id = `auto-${serial}`;
    serial += 1;
    used.add(id);
    const draft: PlacementDraft = {
      id,
      modelId,
      position,
      facingDegrees: facingOf(position, offset),
      footprint
    };
    const result = commitPlacement(current, draft);
    if (!result.preview.ok) continue;
    current = result.document;
    placed += 1;
  }
  if (placed === 0) return { document, placed: 0, reason: "ground" };
  return { document: current, placed };
}

function padCount(document: CityDocument): number {
  return (document.terrain?.features ?? []).filter(feature => feature.kind === "platform" && feature.role === "pad")
    .length;
}

function candidates(extent: number, step: number, inset: number): Point[] {
  const crown = domeTemplateSize(extent).radiusMeters * CROWN_SHARE;
  const limit = extent / 2 - inset;
  const rings = Math.max(0, Math.floor(Math.min(crown, Math.max(0, limit)) / step));
  const points: Point[] = [];
  for (let iz = -rings; iz <= rings; iz++) {
    for (let ix = -rings; ix <= rings; ix++) {
      const point: Point = [ix * step, iz * step];
      if (Math.hypot(point[0], point[1]) > crown) continue;
      if (Math.abs(point[0]) > limit || Math.abs(point[1]) > limit) continue;
      points.push(point);
    }
  }
  points.sort((a, b) => {
    const da = a[0] * a[0] + a[1] * a[1];
    const db = b[0] * b[0] + b[1] * b[1];
    if (da !== db) return da - db;
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[0] - b[0];
  });
  return points;
}

/** North is 0° and angles grow clockwise. Houses look toward the origin, then turn by `offset`. */
function facingOf(point: Point, offset: number): number {
  if (point[0] === 0 && point[1] === 0) return compass(offset);
  const towardCenter = (Math.atan2(-point[0], -point[1]) * 180) / Math.PI;
  return compass(towardCenter + offset);
}

function compass(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}
