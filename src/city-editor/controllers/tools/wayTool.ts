import { editorText } from "../../../i18n/editorMessages";
import { commitWay } from "../../generators/freeform/commitWay";
import type { WayPreview, WayReject } from "../../generators/freeform/validateWay";
import { previewWay } from "../../generators/freeform/validateWay";
import type { InteractionState } from "../../state/editorSession";
import type { CityDocument, Point } from "../../types/document";

export const WAY_SLOPE_WIDTH_METERS = 4;
export const WAY_STEPPED_WIDTH_METERS = 2;
/** A click this close to the last vertex finishes a line of at least two points. */
export const WAY_CLOSE_METERS = 0.75;
const HOVER_GAP_METERS = 0.4;

export function wayRejectText(preview: Pick<WayPreview, "reason" | "skewDegrees" | "limitDegrees"> | null): string {
  return reasonText(preview?.reason, preview?.skewDegrees, preview?.limitDegrees);
}

export function entranceErrorText(error: "missing" | "footprint" | "way" | WayReject): string {
  if (error === "missing") return editorText("cityEditor.messages.wayNoBuilding");
  if (error === "footprint") return editorText("cityEditor.messages.wayNoFootprint");
  if (error === "way") return editorText("cityEditor.messages.wayNoWay");
  return reasonText(error);
}

export function wayStatusText(preview: WayPreview | null, pointCount: number): string {
  if (pointCount < 1) return "";
  if (!preview) return "";
  if (!preview.ok) return wayRejectText(preview);
  if (preview.stepped)
    return editorText("cityEditor.messages.wayLandings", { value0: preview.stepped.landings.length });
  return editorText("cityEditor.messages.waySlope");
}

/** Centre line including the cursor, snapped so the stair search does not run on every pixel. */
export function previewCenterline(interaction: InteractionState): Point[] {
  return withHover(interaction.wayPoints ?? [], interaction.wayHoverPoint, true);
}

/** Centre line drawn under the cursor, at the real pointer. */
export function rubberCenterline(interaction: InteractionState): Point[] {
  return withHover(interaction.wayPoints ?? [], interaction.wayHoverPoint, false);
}

let previewKey = "";
let previewDocument: CityDocument | null = null;
let previewCached: WayPreview | null = null;

export function currentWayPreview(document: CityDocument, interaction: InteractionState): WayPreview | null {
  const centerline = previewCenterline(interaction);
  if (centerline.length < 2) return null;
  const key = [
    interaction.wayProfile,
    interaction.waySurface,
    interaction.wayGrade,
    interaction.wayWidthMeters,
    centerline.map(point => point.join(",")).join(";")
  ].join("|");
  if (document === previewDocument && key === previewKey) return previewCached;
  previewDocument = document;
  previewKey = key;
  previewCached = previewWay(document, {
    id: "draft",
    centerline,
    widthMeters: interaction.wayWidthMeters,
    profile: interaction.wayProfile,
    surface: interaction.waySurface,
    grade: interaction.wayGrade
  });
  return previewCached;
}

export function clickWay(interaction: InteractionState, point: Point): "draw" | "finish" {
  const points = interaction.wayPoints ?? [];
  const last = points[points.length - 1];
  if (last && points.length >= 2 && distance(last, point) <= WAY_CLOSE_METERS) return "finish";
  if (last && distance(last, point) < 0.2) return "draw";
  interaction.wayPoints = [...points, [point[0], point[1]]];
  return "draw";
}

export function popWayPoint(interaction: InteractionState): void {
  interaction.wayPoints = (interaction.wayPoints ?? []).slice(0, -1);
}

export function cancelWay(interaction: InteractionState): void {
  interaction.wayPoints = [];
  interaction.wayHoverPoint = null;
}

export function commitDrawnWay(
  document: CityDocument,
  interaction: InteractionState
): { document: CityDocument; preview: WayPreview } | { error: WayReject; preview: WayPreview } {
  const centerline = (interaction.wayPoints ?? []).map(point => [point[0], point[1]] as Point);
  const preview = previewWay(document, {
    id: "draft",
    centerline,
    widthMeters: interaction.wayWidthMeters,
    profile: interaction.wayProfile,
    surface: interaction.waySurface,
    grade: interaction.wayGrade
  });
  if (!preview.ok) return { error: preview.reason ?? "short", preview };
  const committed = commitWay(document, {
    id: `way-${crypto.randomUUID()}`,
    centerline,
    widthMeters: interaction.wayWidthMeters,
    profile: interaction.wayProfile,
    surface: interaction.waySurface,
    grade: interaction.wayGrade
  });
  if (!committed.preview.ok) return { error: committed.preview.reason ?? "grade", preview: committed.preview };
  interaction.wayPoints = [];
  interaction.wayHoverPoint = null;
  return committed;
}

function reasonText(reason: WayReject | undefined, skew?: number, limit?: number): string {
  switch (reason) {
    case "short":
      return editorText("cityEditor.messages.wayRejectShort");
    case "skew":
      return editorText("cityEditor.messages.wayRejectSkew", {
        value0: (skew ?? 0).toFixed(1),
        value1: String(limit ?? 0)
      });
    case "bend":
      return editorText("cityEditor.messages.wayRejectBend");
    case "overlap":
      return editorText("cityEditor.messages.wayRejectOverlap");
    case "grade":
      return editorText("cityEditor.messages.wayRejectGrade");
    case "field":
      return editorText("cityEditor.messages.wayRejectField");
    default:
      return "";
  }
}

function withHover(points: readonly Point[], hover: Point | null, snap: boolean): Point[] {
  if (!hover || !points.length) return [...points];
  const next = snap ? ([Math.round(hover[0] * 2) / 2, Math.round(hover[1] * 2) / 2] as Point) : hover;
  if (distance(points[points.length - 1], next) < HOVER_GAP_METERS) return [...points];
  return [...points, next];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
