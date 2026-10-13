import { editorText } from "../../i18n/editorMessages";
import type { createEditorControls, FloatingWindow } from "../components/editorControls";
import { div, text } from "../components/editorControls";
import { approachBeyondLabel } from "../generators/approachBeyond";
import { removeGroup, smoothFeatureGroup } from "../generators/features";
import type { DocumentsState, InteractionState } from "../state/editorSession";
import type { CityDocument } from "../types/document";

export interface LayersContext {
  controls: ReturnType<typeof createEditorControls>;
  scope: import("../services/editorLifetime").EditorLifetime;
  groups: FloatingWindow;
  refresh: () => void;
  commit: (next: CityDocument, label?: string) => void;
  showNotice: (value: string, redraw?: boolean) => void;
  documents: Pick<DocumentsState, "documentState">;
  interaction: Pick<InteractionState, "activeGroupId" | "selection" | "inspectedInfo" | "tool">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createLayersController(ctx: LayersContext) {
  const { makeIconButton } = ctx.controls;
  function renderGroups(): void {
    ctx.scope.replaceChildren(ctx.groups.content);
    let selectedRowEl: HTMLElement | null = null;
    for (const group of ctx.documents.documentState.featureGroups) {
      const isSelected = group.id === ctx.interaction.activeGroupId;
      const row = div(`ce-group-row${isSelected ? " is-active ce-group-selected" : ""}`);
      row.setAttribute("data-group-row", group.id);
      if (isSelected) selectedRowEl = row;
      const choose = makeIconButton(
        group.kind === "river" ? "〰" : group.kind === "road" ? "╱" : "▥",
        editorText("cityEditor.messages.select", { value0: group.name }),
        () => {
          ctx.interaction.activeGroupId = group.id;
          ctx.interaction.selection.groupId = group.id;
          ctx.interaction.selection.inspectedId = group.id;
          const beyondLabel = group.kind === "road" ? approachBeyondLabel(group.beyond) : null;
          ctx.interaction.inspectedInfo = {
            layer: "features",
            kind: group.kind,
            id: group.id,
            label: beyondLabel ? `${group.kind} (${group.name} · ${beyondLabel})` : `${group.kind} (${group.name})`,
            name: group.name,
            locked: group.locked,
            widthMeters: group.style.widthMeters,
            color: group.style.color,
            segmentCount: group.kind === "river" ? group.vertices.length : group.segments.length,
            ...(beyondLabel ? { beyond: group.kind === "road" ? group.beyond : undefined, beyondLabel } : {})
          };
          ctx.interaction.tool = "select";
          ctx.refresh();
        }
      );
      choose.classList.toggle("is-active", isSelected);
      row.append(
        choose,
        text(
          `${group.kind === "river" ? editorText("cityEditor.messages.vertexCount", { count: group.vertices.length }) : editorText("cityEditor.messages.edgeCount", { count: group.segments.length })}${
            group.kind === "road" && approachBeyondLabel(group.beyond) ? ` · ${approachBeyondLabel(group.beyond)}` : ""
          }${group.kind === "wall" ? ` · ${group.wallMaterial === "wood" ? editorText("cityEditor.messages.woodenWall") : editorText("cityEditor.messages.masonryWall")}` : ""}`
        )
      );
      const smooth = makeIconButton("⌁", editorText("cityEditor.messages.smooth", { value0: group.name }), () => {
        const next = smoothFeatureGroup(ctx.documents.documentState, group.id);
        if (next) ctx.commit(next, editorText("cityEditor.messages.smooth", { value0: group.name }));
        else ctx.showNotice(editorText("cityEditor.messages.hasNoMovableVerticesToSmooth", { value0: group.name }));
      });
      smooth.disabled = group.locked || (group.kind !== "river" && group.kind !== "road" && group.kind !== "wall");
      smooth.title = editorText("cityEditor.messages.smoothThisGroupIncludingItsSharedVerticesAndClosedLoops");
      row.appendChild(smooth);
      row.appendChild(
        makeIconButton("×", editorText("cityEditor.messages.delete", { value0: group.name }), () => {
          const name = group.name;
          if (ctx.interaction.activeGroupId === group.id) {
            ctx.interaction.activeGroupId = null;
            ctx.interaction.selection.groupId = null;
            if (ctx.interaction.inspectedInfo?.id === group.id) ctx.interaction.inspectedInfo = null;
          }
          ctx.commit(
            removeGroup(ctx.documents.documentState, group.id),
            editorText("cityEditor.messages.delete", { value0: name })
          );
        })
      );
      ctx.groups.content.appendChild(row);
    }
    if (selectedRowEl && typeof selectedRowEl.scrollIntoView === "function") {
      selectedRowEl.scrollIntoView({ block: "nearest" });
    }
    if (ctx.interaction.activeGroupId)
      ctx.groups.content.appendChild(
        text(editorText("cityEditor.messages.inSelectModeLeftDragAHighlightedRouteEdgeThrough"))
      );
  }

  return { renderGroups };
}
