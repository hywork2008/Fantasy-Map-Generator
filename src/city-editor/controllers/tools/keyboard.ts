import type { DocumentsState, GenerationState, InteractionState } from "../../state/editorSession";
import type { CityDocument } from "../../types/document";
import { emptySelection } from "./toolTypes";
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
    if (ctx.generation.failurePreview && event.key === "Escape") {
      ctx.clearFailurePreview();
      return;
    }
    if (event.key === "Enter") ctx.finishButton.click();
    if (event.key === "Escape") {
      ctx.interaction.routeStroke = null;
      ctx.interaction.selection = emptySelection();
      ctx.interaction.activeGroupId = null;
      ctx.hideContextMenu();
      ctx.clearMeasurement();
      ctx.refresh();
    }
  });
  ctx.scope.listen(window, "keyup", event => {
    if (event.code === "Space") ctx.interaction.isSpacePressed = false;
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
