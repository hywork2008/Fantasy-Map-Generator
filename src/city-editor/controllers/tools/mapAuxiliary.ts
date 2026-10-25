import { clamp } from "../../components/editorControls";
import type { DisplayState, DocumentsState, InteractionState } from "../../state/editorSession";
export interface MapAuxiliaryContext {
  scope: import("../../services/editorLifetime").EditorLifetime;
  interaction: InteractionState;
  documents: DocumentsState;
  display: DisplayState;
  updateWardBrushPreview: (event?: PointerEvent) => void;
  map: HTMLDivElement;
  importMapFile: (file: File | undefined) => Promise<void>;
  hideWardBrushPreview: () => void;
  hideCircularWallPreview: () => void;
  finishDrag: (event: PointerEvent) => void;
  scheduleRedraw: () => void;
  updateViewport: (zoomChanged?: boolean) => void;
  updateCircularWallPreview: (event?: PointerEvent) => void;
  refreshScaleBar: () => void;
}
export function bindMapAuxiliary(ctx: MapAuxiliaryContext) {
  ctx.scope.listen(ctx.map, "dragover", event => {
    event.preventDefault();
    ctx.map.classList.add("ce-map--drop-target");
  });
  ctx.scope.listen(ctx.map, "dragleave", () => ctx.map.classList.remove("ce-map--drop-target"));
  ctx.scope.listen(ctx.map, "drop", event => {
    event.preventDefault();
    ctx.map.classList.remove("ce-map--drop-target");
    void ctx.importMapFile(event.dataTransfer?.files[0]);
  });
  ctx.scope.listen(ctx.map, "pointerleave", () => {
    if (ctx.interaction.tool === "object") {
      ctx.interaction.shipHoverPoint = null;
      ctx.map.querySelector(".ce-ship-preview")?.remove();
    }
    if (!ctx.interaction.isWardPainting && !ctx.interaction.isJunctionPainting) ctx.hideWardBrushPreview();
    if (!ctx.interaction.circularWallStroke) ctx.hideCircularWallPreview();
  });
  ctx.scope.listen(ctx.map, "pointerup", ctx.finishDrag);
  ctx.scope.listen(ctx.map, "pointercancel", ctx.finishDrag);
  ctx.scope.listen(
    ctx.map,
    "wheel",
    event => {
      event.preventDefault();
      ctx.display.halfView = clamp(
        ctx.display.halfView * Math.exp(event.deltaY * 0.0012),
        ctx.documents.documentState.frame.extentMeters / 40,
        ctx.documents.documentState.frame.extentMeters / 2
      );
      if (ctx.display.showSelectionLabels) ctx.scheduleRedraw();
      else ctx.updateViewport(true);
      ctx.updateWardBrushPreview();
      ctx.updateCircularWallPreview();
      ctx.refreshScaleBar();
    },
    { passive: false }
  );
}
