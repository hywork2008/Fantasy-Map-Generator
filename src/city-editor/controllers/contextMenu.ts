import { editorText } from "../../i18n/editorMessages";
import type { createEditorControls } from "../components/editorControls";
import { text } from "../components/editorControls";
import type { CityDocument, Id } from "../core/types";
import { renderMeasureOverlay } from "../render/svg";
import type { DisplayState, InteractionState } from "../state/editorSession";
import type { ContextMenuAction } from "../types/editor";
import { formatDistance } from "./editorGeometry";

export interface ContextMenuContext {
  controls: ReturnType<typeof createEditorControls>;
  commit: (next: CityDocument, label?: string) => void;
  showNotice: (value: string, redraw?: boolean) => void;
  scope: import("../services/editorLifetime").EditorLifetime;
  contextMenu: HTMLDivElement;
  updateHoverOverlay: () => void;
  map: HTMLDivElement;
  interaction: Pick<InteractionState, "closeContextMenuOnPointerMove" | "selection" | "measureFrom" | "measureTo">;
  display: Pick<DisplayState, "halfView">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createContextMenuController(ctx: ContextMenuContext) {
  const { makeButton } = ctx.controls;
  function runContextAction(
    operation: () => CityDocument | null,
    label = editorText("cityEditor.messages.edit")
  ): void {
    const next = operation();
    hideContextMenu();
    if (next) {
      ctx.commit(next, label);
      return;
    }
    ctx.showNotice(editorText("cityEditor.messages.thisOperationCannotBeAppliedToTheSelectedGeometry"));
  }

  function showContextMenu(event: MouseEvent, actions: ContextMenuAction[]): void {
    showContextMenuAt(event.clientX, event.clientY, actions);
  }

  function showContextMenuAt(clientX: number, clientY: number, actions: ContextMenuAction[]): void {
    ctx.scope.replaceChildren(ctx.contextMenu);
    if (actions.length) {
      for (const action of actions) {
        if (action.isSeparator) {
          const hr = document.createElement("hr");
          ctx.contextMenu.appendChild(hr);
        }
        const button = makeButton(action.label, () => {
          if (!action.disabled) action.run();
        });
        if (action.disabled) {
          button.disabled = true;
          if (action.title) button.title = action.title;
        }
        const highlight = action.highlight;
        if (highlight) {
          ctx.scope.listen(button, "pointerenter", () => setContextHighlight(highlight));
          ctx.scope.listen(button, "pointerleave", clearContextHighlight);
        }
        ctx.contextMenu.appendChild(button);
      }
    } else {
      ctx.contextMenu.appendChild(text(editorText("cityEditor.messages.noActionAvailableHere")));
    }
    ctx.interaction.closeContextMenuOnPointerMove = actions.length === 0;
    ctx.contextMenu.hidden = false;
    ctx.contextMenu.style.left = `${clientX}px`;
    ctx.contextMenu.style.top = `${clientY}px`;
    const bounds = ctx.contextMenu.getBoundingClientRect();
    ctx.contextMenu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - bounds.width - 8))}px`;
    ctx.contextMenu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - bounds.height - 8))}px`;
  }

  function hideContextMenu(): void {
    ctx.contextMenu.hidden = true;
    ctx.interaction.closeContextMenuOnPointerMove = false;
    clearContextHighlight();
  }

  function setContextHighlight(highlight: { vertexId: Id; edgeId: Id }): void {
    ctx.interaction.selection.hoverVertexId = highlight.vertexId;
    ctx.interaction.selection.hoverEdgeId = highlight.edgeId;
    ctx.updateHoverOverlay();
  }

  function clearContextHighlight(): void {
    if (!ctx.interaction.selection.hoverVertexId && !ctx.interaction.selection.hoverEdgeId) return;
    ctx.interaction.selection.hoverVertexId = null;
    ctx.interaction.selection.hoverEdgeId = null;
    ctx.updateHoverOverlay();
  }

  function setDistanceFromHere(point: [number, number]): void {
    ctx.interaction.measureFrom = point;
    ctx.interaction.measureTo = null;
    hideContextMenu();
    updateMeasureOverlay();
    ctx.showNotice(editorText("cityEditor.messages.startingPointSet"));
  }

  function setDistanceToHere(point: [number, number]): void {
    if (!ctx.interaction.measureFrom) {
      hideContextMenu();
      return;
    }
    ctx.interaction.measureTo = point;
    hideContextMenu();
    updateMeasureOverlay();
    const dist = Math.hypot(
      ctx.interaction.measureTo[0] - ctx.interaction.measureFrom[0],
      ctx.interaction.measureTo[1] - ctx.interaction.measureFrom[1]
    );
    ctx.showNotice(editorText("cityEditor.messages.distance", { value0: formatDistance(dist) }));
  }

  function clearMeasurement(): void {
    ctx.interaction.measureFrom = null;
    ctx.interaction.measureTo = null;
    hideContextMenu();
    updateMeasureOverlay();
  }

  function updateMeasureOverlay(): void {
    const layer = ctx.map.querySelector<SVGGElement>(".ce-measure-layer");
    if (!layer) return;
    const width = Math.max(ctx.map.getBoundingClientRect().width, 1);
    const metersPerPixel = (ctx.display.halfView * 2) / width;
    const dist =
      ctx.interaction.measureFrom && ctx.interaction.measureTo
        ? Math.hypot(
            ctx.interaction.measureTo[0] - ctx.interaction.measureFrom[0],
            ctx.interaction.measureTo[1] - ctx.interaction.measureFrom[1]
          )
        : 0;
    const label = ctx.interaction.measureFrom && ctx.interaction.measureTo ? formatDistance(dist) : "";
    const nodes = renderMeasureOverlay(ctx.interaction.measureFrom, ctx.interaction.measureTo, metersPerPixel, label);
    ctx.scope.replaceChildren(layer, ...nodes);
    const textEl = layer.querySelector<SVGTextElement>(".ce-measure-label");
    if (textEl) {
      textEl.style.cursor = "pointer";
      textEl.setAttribute("role", "button");
      textEl.setAttribute("title", editorText("cityEditor.messages.clickToClearMeasurement"));
      ctx.scope.listen(textEl, "click", () => {
        clearMeasurement();
      });
    }
  }

  return {
    runContextAction,
    showContextMenu,
    showContextMenuAt,
    hideContextMenu,
    setContextHighlight,
    clearContextHighlight,
    setDistanceFromHere,
    setDistanceToHere,
    clearMeasurement,
    updateMeasureOverlay
  };
}
