import type { DocumentsState, GenerationState, InteractionState } from "../../state/editorSession";
import type { CityDocument } from "../../types/document";
import { cancelBuildingGesture } from "./buildingTool";
import { cancelLedger, ledgerActive, popLedgerPoint } from "./ledgerTool";
import { emptySelection } from "./toolTypes";
import { cancelWay, popWayPoint } from "./wayTool";
export interface KeyboardContext {
  scope: import("../../services/editorLifetime").EditorLifetime;
  generation: GenerationState;
  interaction: InteractionState;
  restore: (next: CityDocument | null) => void;
  documents: DocumentsState;
  clearFailurePreview: () => void;
  finishButton: HTMLButtonElement;
  hideContextMenu: () => void;
  clearMeasurement: () => void;
  refresh: () => void;
  contextMenu: HTMLDivElement;
  refreshScaleBar: () => void;
  updateBuildingPreview: () => void;
  updateWayPreview: () => void;
  finishWay: () => void;
  updateLedgerPreview: () => void;
  finishLedger: () => void;
}
function typingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}

export function bindKeyboard(ctx: KeyboardContext) {
  ctx.scope.listen(window, "keydown", event => {
    if (ctx.generation.generationJob) return;
    if (event.code === "Space") ctx.interaction.isSpacePressed = true;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      ctx.restore(
        event.shiftKey
          ? ctx.documents.history.redo(ctx.documents.documentState)
          : ctx.documents.history.undo(ctx.documents.documentState)
      );
    }
    if (ctx.interaction.tool === "building" && !typingTarget(event)) {
      if (event.key === "Tab") {
        event.preventDefault();
        if (ctx.interaction.buildingGesture === "rotate") ctx.interaction.buildingGesture = "move";
        else {
          ctx.interaction.buildingAnchor = ctx.interaction.buildingHoverPoint;
          ctx.interaction.buildingGesture = "rotate";
        }
        ctx.updateBuildingPreview();
      } else if (event.key === "Shift" && !event.ctrlKey && !event.metaKey && !event.repeat) {
        ctx.interaction.buildingShift = true;
        if (ctx.interaction.buildingGesture !== "rotate") {
          ctx.interaction.buildingAnchor = ctx.interaction.buildingHoverPoint;
          ctx.interaction.buildingGesture = "rotate";
        }
        ctx.updateBuildingPreview();
      } else if (event.key === "Control" || event.key === "Meta") {
        ctx.interaction.buildingCtrl = true;
        ctx.updateBuildingPreview();
      }
    }
    if (ctx.generation.failurePreview && event.key === "Escape") {
      ctx.clearFailurePreview();
      return;
    }
    if (ctx.interaction.tool === "way" && !typingTarget(event)) {
      if (event.key === "Enter") {
        event.preventDefault();
        ctx.finishWay();
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        popWayPoint(ctx.interaction);
        ctx.updateWayPreview();
        return;
      }
    }
    if (ledgerActive(ctx.documents.documentState, ctx.interaction) && !typingTarget(event)) {
      if (event.key === "Enter") {
        event.preventDefault();
        ctx.finishLedger();
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        popLedgerPoint(ctx.interaction);
        ctx.updateLedgerPreview();
        return;
      }
    }
    if (event.key === "Enter") ctx.finishButton.click();
    if (event.key === "Escape") {
      ctx.interaction.routeStroke = null;
      ctx.interaction.selection = emptySelection();
      ctx.interaction.activeGroupId = null;
      ctx.hideContextMenu();
      ctx.clearMeasurement();
      if (ctx.interaction.tool === "building") cancelBuildingGesture(ctx.interaction);
      if (ctx.interaction.tool === "way") cancelWay(ctx.interaction);
      if (ledgerActive(ctx.documents.documentState, ctx.interaction)) cancelLedger(ctx.interaction);
      ctx.refresh();
    }
  });
  ctx.scope.listen(window, "keyup", event => {
    if (event.code === "Space") ctx.interaction.isSpacePressed = false;
    if (event.key === "Shift") {
      ctx.interaction.buildingShift = false;
      if (ctx.interaction.tool === "building") {
        ctx.interaction.buildingGesture = "move";
        ctx.updateBuildingPreview();
      }
    }
    if ((event.key === "Control" || event.key === "Meta") && ctx.interaction.tool === "building") {
      ctx.interaction.buildingCtrl = false;
      ctx.updateBuildingPreview();
    }
  });
  ctx.scope.listen(window, "blur", () => {
    ctx.interaction.isSpacePressed = false;
  });
  ctx.scope.listen(window, "pointerdown", event => {
    if (event.target instanceof Node && !ctx.contextMenu.contains(event.target)) ctx.hideContextMenu();
  });
  ctx.scope.listen(window, "pointermove", () => {
    if (ctx.interaction.closeContextMenuOnPointerMove) ctx.hideContextMenu();
  });
  ctx.scope.listen(window, "resize", ctx.refreshScaleBar);
}
