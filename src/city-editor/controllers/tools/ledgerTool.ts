import { editorText } from "../../../i18n/editorMessages";
import {
  commitRiver,
  commitZone,
  previewRiver,
  previewZone,
  type RiverReject,
  type ZoneReject
} from "../../generators/freeform/commitLedger";
import type { InteractionState } from "../../state/editorSession";
import type { CityDocument, Point } from "../../types/document";
import type { LandZone } from "../../types/freeformCity";
import { WAY_CLOSE_METERS } from "./wayTool";

const HOVER_GAP_METERS = 0.4;

export function ledgerRejectText(reason: RiverReject | ZoneReject | undefined): string {
  switch (reason) {
    case "short":
      return editorText("cityEditor.messages.freeformRejectShort");
    case "frame":
      return editorText("cityEditor.messages.freeformRejectFrame");
    case "plot":
      return editorText("cityEditor.messages.freeformRejectPlot");
    case "bridge":
      return editorText("cityEditor.messages.freeformRejectBridge");
    case "field":
      return editorText("cityEditor.messages.freeformNeedsCity");
    default:
      return "";
  }
}

export function ledgerPreviewOk(document: CityDocument, interaction: InteractionState): boolean {
  const points = ledgerPreviewLine(interaction);
  if (interaction.tool === "zone") return previewZone(document, points).ok;
  if (interaction.tool === "river" && document.freeform)
    return previewRiver(document, points, interaction.riverWidthMeters).ok;
  return false;
}

export function ledgerStatusText(document: CityDocument, interaction: InteractionState): string {
  const points = ledgerPreviewLine(interaction);
  if (points.length < 1) return "";
  if (interaction.tool === "zone") {
    const preview = previewZone(document, points);
    return preview.ok
      ? editorText("cityEditor.messages.zoneReady")
      : points.length < 3
        ? ""
        : ledgerRejectText(preview.reason);
  }
  if (interaction.tool !== "river" || !document.freeform) return "";
  if (points.length < 2) return "";
  const preview = previewRiver(document, points, interaction.riverWidthMeters);
  return preview.ok ? editorText("cityEditor.messages.freeRiverReady") : ledgerRejectText(preview.reason);
}

export function ledgerPreviewLine(interaction: InteractionState): Point[] {
  return withHover(interaction.ledgerPoints ?? [], interaction.ledgerHover);
}

export function clickLedger(interaction: InteractionState, point: Point): "draw" | "finish" {
  const points = interaction.ledgerPoints ?? [];
  const last = points[points.length - 1];
  const minimum = interaction.tool === "zone" ? 3 : 2;
  if (last && points.length >= minimum && distance(last, point) <= WAY_CLOSE_METERS) return "finish";
  if (last && distance(last, point) < 0.2) return "draw";
  interaction.ledgerPoints = [...points, [point[0], point[1]]];
  return "draw";
}

export function popLedgerPoint(interaction: InteractionState): void {
  interaction.ledgerPoints = (interaction.ledgerPoints ?? []).slice(0, -1);
}

export function cancelLedger(interaction: InteractionState): void {
  interaction.ledgerPoints = [];
  interaction.ledgerHover = null;
}

export function ledgerActive(document: CityDocument, interaction: InteractionState): boolean {
  return interaction.tool === "zone" || (interaction.tool === "river" && Boolean(document.freeform));
}

export function commitDrawnLedger(
  document: CityDocument,
  interaction: InteractionState
): { document: CityDocument } | { error: RiverReject | ZoneReject } {
  const centerline = (interaction.ledgerPoints ?? []).map(point => [point[0], point[1]] as Point);
  if (interaction.tool === "zone") {
    const placed = commitZone(document, `zone-${crypto.randomUUID()}`, interaction.zoneKind, centerline);
    if (placed.reason) return { error: placed.reason };
    cancelLedger(interaction);
    return placed;
  }
  const placed = commitRiver(document, `river-${crypto.randomUUID()}`, centerline, interaction.riverWidthMeters);
  if (placed.reason) return { error: placed.reason };
  cancelLedger(interaction);
  return placed;
}

function withHover(points: readonly Point[], hover: Point | null): Point[] {
  if (!hover || !points.length) return [...points];
  if (distance(points[points.length - 1], hover) < HOVER_GAP_METERS) return [...points];
  return [...points, hover];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function zoneKindOf(value: string): LandZone["kind"] {
  return value === "farm" || value === "forest" ? value : "park";
}
