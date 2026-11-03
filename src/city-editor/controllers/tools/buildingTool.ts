import {
  placementCatalog,
  placementFootprint,
  placementPalette,
  placementQuality
} from "../../../buildings/placementModels";
import { editorText } from "../../../i18n/editorMessages";
import {
  commitPlacement,
  type PlacementDraft,
  type PlacementFailure,
  type PlacementPreview,
  previewPlacement
} from "../../generators/freeform/commitPlacement";
import { facingToward, normalizeDegrees, snapFacing } from "../../generators/freeform/facing";
import type { InteractionState } from "../../state/editorSession";
import type { CityDocument, Point } from "../../types/document";

export function placementFailureText(reason: PlacementFailure | undefined): string {
  switch (reason) {
    case "overlap":
      return editorText("cityEditor.messages.buildingRejectOverlap");
    case "slope":
      return editorText("cityEditor.messages.buildingRejectSlope");
    case "retaining":
      return editorText("cityEditor.messages.buildingRejectRetaining");
    case "water":
      return editorText("cityEditor.messages.buildingRejectWater");
    case "cliff":
      return editorText("cityEditor.messages.buildingRejectCliff");
    case "way":
      return editorText("cityEditor.messages.buildingRejectWay");
    case "field":
      return editorText("cityEditor.messages.buildingNeedsField");
    default:
      return "";
  }
}

export function placementLabel(preview: PlacementPreview): string {
  if (!preview.ok) return placementFailureText(preview.reason);
  const edge =
    preview.edge.kind === "wall"
      ? editorText("cityEditor.messages.buildingEdgeWall")
      : editorText("cityEditor.messages.buildingEdgeSlope", { value0: preview.edge.runMeters.toFixed(1) });
  return `${editorText("cityEditor.messages.buildingLevel", { value0: preview.level.toFixed(1) })} · ${edge}`;
}

export function buildingDraft(_document: CityDocument, interaction: InteractionState): PlacementDraft | null {
  const position =
    interaction.buildingGesture === "rotate" ? interaction.buildingAnchor : interaction.buildingHoverPoint;
  if (!position) return null;
  const footprint = placementFootprint(interaction.buildingModelId, interaction.buildingQuality);
  if (!footprint) return null;
  const facing =
    interaction.buildingGesture === "rotate"
      ? snapFacing(interaction.buildingFacingDegrees, interaction.buildingCtrl ? 15 : null, !interaction.buildingFine)
      : normalizeDegrees(interaction.buildingFacingDegrees);
  return {
    id: interaction.buildingEditId ?? "preview",
    modelId: interaction.buildingModelId,
    quality: placementQuality(interaction.buildingModelId, interaction.buildingQuality),
    palette: placementPalette(interaction.buildingModelId, interaction.buildingPalette),
    position,
    facingDegrees: facing,
    footprint
  };
}

export function previewBuilding(document: CityDocument, interaction: InteractionState): PlacementPreview | null {
  const draft = buildingDraft(document, interaction);
  return draft ? previewPlacement(document, draft) : null;
}

export function commitBuilding(document: CityDocument, interaction: InteractionState, id: string) {
  const draft = buildingDraft(document, interaction);
  if (!draft) return null;
  return commitPlacement(document, { ...draft, id });
}

export function buildingModelName(id: string): string {
  return placementCatalog().find(item => item.id === id)?.name ?? id;
}

/** Move follows the cursor. Rotate keeps the anchor and aims the front at the cursor. */
export function aimBuilding(interaction: InteractionState, point: Point | null, ctrl: boolean): void {
  interaction.buildingCtrl = ctrl;
  interaction.buildingFine = false;
  if (interaction.buildingGesture === "rotate") {
    if (point && !interaction.buildingAnchor) interaction.buildingAnchor = point;
    if (point && interaction.buildingAnchor)
      interaction.buildingFacingDegrees = facingToward(interaction.buildingAnchor, point);
    return;
  }
  interaction.buildingHoverPoint = point;
}

export function cancelBuildingGesture(interaction: InteractionState): void {
  interaction.buildingHoverPoint = null;
  interaction.buildingAnchor = null;
  interaction.buildingEditId = null;
  interaction.buildingGesture = "move";
  interaction.buildingShift = false;
  interaction.buildingCtrl = false;
  interaction.buildingFine = false;
}

/** Commit the armed pose. A rejected pose leaves the document and the gesture unchanged. */
export function applyBuildingPlace(
  document: CityDocument,
  interaction: InteractionState
): { document: CityDocument; preview: PlacementPreview; editing: boolean } | { error: string } | null {
  const editing = Boolean(interaction.buildingEditId);
  const id = interaction.buildingEditId ?? `building-${crypto.randomUUID()}`;
  const result = commitBuilding(document, interaction, id);
  if (!result) return null;
  if (!result.preview.ok) return { error: placementFailureText(result.preview.reason) };
  interaction.buildingFacingDegrees = result.preview.facingDegrees;
  interaction.buildingEditId = null;
  return { document: result.document, preview: result.preview, editing };
}
