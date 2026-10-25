import { editorText } from "../../../i18n/editorMessages";
import { settleRiverGrades } from "../../generators/elevationPreset";
import { encloseCircleWithWalls, rerouteGroupAcrossFace } from "../../generators/features";
import { mergeVertices } from "../../generators/mesh";
import type { DocumentsState, InteractionState } from "../../state/editorSession";
import type { CityDocument, Id, Point } from "../../types/document";
import type { RouteStroke } from "../../types/editor";
export interface DragCompletionContext {
  interaction: InteractionState;
  map: HTMLDivElement;
  commit: (next: CityDocument, label?: string) => void;
  documents: DocumentsState;
  refresh: () => void;
  updateRoutePreview: () => void;
  rememberFailureGenerationState: () => void;
  rebuildEditorIndexes: () => void;
  paintHistoryLabel: () => string;
  showNotice: (value: string, redraw?: boolean) => void;
  finishRouteStroke: (stroke: RouteStroke, point: Point) => void;
  localPoint: (event: PointerEvent) => [number, number];
  routeAtEvent: (
    event: Event,
    point: Point,
    allowNearby: boolean,
    allowLocked?: boolean
  ) => { groupId: Id; edgeId: Id } | null;
  refreshUiOnly: () => void;
}
export function createDragCompletionController(ctx: DragCompletionContext) {
  const finishDrag = (event: PointerEvent): void => {
    if (ctx.interaction.shipDrag) {
      const wasMoved = ctx.interaction.shipDrag.moved;
      const dragMode = ctx.interaction.shipDrag.mode;
      const before = ctx.interaction.shipDragBefore;
      ctx.interaction.shipDrag = null;
      ctx.interaction.shipDragBefore = null;
      if (ctx.map.hasPointerCapture(event.pointerId)) ctx.map.releasePointerCapture(event.pointerId);
      if (wasMoved && before) {
        // Live dragging updates the displayed document; commit against its pre-drag state.
        const next = ctx.documents.documentState;
        ctx.documents.documentState = before;
        ctx.commit(
          next,
          dragMode === "move"
            ? editorText(
                before.elements.find(e => e.id === ctx.interaction.selection.inspectedId)?.kind === "object"
                  ? "cityEditor.messages.moveObject"
                  : "cityEditor.messages.moveShip"
              )
            : editorText(
                before.elements.find(e => e.id === ctx.interaction.selection.inspectedId)?.kind === "object"
                  ? "cityEditor.messages.rotateObject"
                  : "cityEditor.messages.rotateShip"
              )
        );
      } else {
        ctx.refresh();
      }
      return;
    }
    if (
      !ctx.interaction.isVertexDragging &&
      !ctx.interaction.isWardPainting &&
      !ctx.interaction.isJunctionPainting &&
      !ctx.interaction.circularWallStroke &&
      !ctx.interaction.isPanning &&
      !ctx.interaction.routeDrag &&
      !ctx.interaction.routeStroke
    )
      return;
    const wasVertexDragging = ctx.interaction.isVertexDragging;
    const vertexMoved = Boolean(
      wasVertexDragging &&
        ctx.interaction.dragBefore &&
        JSON.stringify(ctx.interaction.dragBefore) !== JSON.stringify(ctx.documents.documentState)
    );
    const wasWardPainting = ctx.interaction.isWardPainting;
    const wasJunctionPainting = ctx.interaction.isJunctionPainting;
    const circle = ctx.interaction.circularWallStroke;
    const mergeCandidateId = ctx.interaction.dragMergeCandidateId;
    const stroke = ctx.interaction.routeStroke;
    const draggedRoute = ctx.interaction.routeDrag;
    const preview = ctx.interaction.routePreview;
    const previewFaceId = ctx.interaction.routePreviewFaceId;
    ctx.interaction.isVertexDragging = false;
    ctx.interaction.isWardPainting = false;
    ctx.interaction.isJunctionPainting = false;
    ctx.interaction.circularWallStroke = null;
    ctx.interaction.routeStroke = null;
    ctx.interaction.routeDrag = null;
    ctx.interaction.routePreview = null;
    ctx.interaction.routePreviewFaceId = null;
    ctx.updateRoutePreview();
    ctx.interaction.isPanning = false;
    ctx.interaction.hasPanned = false;
    ctx.interaction.dragMergeCandidateId = null;
    ctx.map.classList.remove("ce-map--panning");
    if (ctx.map.hasPointerCapture(event.pointerId)) ctx.map.releasePointerCapture(event.pointerId);
    if (event.type !== "pointercancel" && wasVertexDragging && ctx.interaction.selection.vertexId && mergeCandidateId) {
      const merged = mergeVertices(ctx.documents.documentState, ctx.interaction.selection.vertexId, mergeCandidateId);
      if (merged) ctx.documents.documentState = merged;
    }
    if (wasVertexDragging && vertexMoved) {
      ctx.documents.history.commit(
        ctx.documents.documentState,
        mergeCandidateId
          ? editorText("cityEditor.messages.mergeVertices")
          : editorText("cityEditor.messages.moveVertex")
      );
      ctx.rememberFailureGenerationState();
      ctx.rebuildEditorIndexes();
    }
    ctx.interaction.selection.hoverVertexId = null;
    if (wasWardPainting && ctx.interaction.wardPaintChanged) {
      if (ctx.interaction.tool === "elevation")
        ctx.documents.documentState = settleRiverGrades(ctx.documents.documentState);
      ctx.documents.history.commit(ctx.documents.documentState, ctx.paintHistoryLabel());
      ctx.rememberFailureGenerationState();
      if (ctx.interaction.tool === "elevation") ctx.refresh();
      else if (ctx.interaction.edgePaintChanged) ctx.rebuildEditorIndexes();
    }
    if (wasJunctionPainting && ctx.interaction.junctionPaintChanged) {
      ctx.documents.history.commit(ctx.documents.documentState, editorText("cityEditor.messages.cleanJunctions"));
      ctx.rememberFailureGenerationState();
      ctx.rebuildEditorIndexes();
    }
    if (circle && event.type !== "pointercancel") {
      const next = encloseCircleWithWalls(ctx.documents.documentState, circle.center, circle.radiusMeters);
      if (next) ctx.commit(next, editorText("cityEditor.messages.circularWardWall"));
      else ctx.showNotice(editorText("cityEditor.messages.drawACircleOverAtLeastOneCityCellTo"));
    }
    if (stroke) {
      if (event.type !== "pointercancel") ctx.finishRouteStroke(stroke, ctx.localPoint(event));
    }
    ctx.interaction.dragBefore = null;
    ctx.interaction.paintedWardFaceIds.clear();
    ctx.interaction.paintedEdgeIds.clear();
    if (draggedRoute) {
      ctx.interaction.suppressNextClick = true;
      if (event.type !== "pointercancel" && draggedRoute.moved && preview && previewFaceId) {
        ctx.interaction.selection.vertexId = null;
        ctx.interaction.selection.edgeId = null;
        const next = rerouteGroupAcrossFace(ctx.documents.documentState, draggedRoute.groupId, previewFaceId, {
          edgeId: draggedRoute.edgeId
        });
        if (next) ctx.commit(next, editorText("cityEditor.messages.rerouteAcrossCell"));
      }
      if (draggedRoute.moved) {
        ctx.interaction.selection.vertexId = null;
        ctx.interaction.selection.edgeId = null;
      }
    }
    if (wasVertexDragging) {
      ctx.interaction.suppressNextClick = true;
      if (!vertexMoved) {
        const point = ctx.localPoint(event);
        const route = ctx.routeAtEvent(event, point, true, true);
        if (route) {
          const routeGroup = ctx.documents.documentState.featureGroups.find(g => g.id === route.groupId);
          if (routeGroup) {
            ctx.interaction.activeGroupId = routeGroup.id;
            ctx.interaction.selection = {
              faceId: null,
              vertexId: null,
              groupId: routeGroup.id,
              edgeId: route.edgeId,
              inspectedId: routeGroup.id
            };
            ctx.interaction.inspectedInfo = {
              layer: "features",
              kind: routeGroup.kind,
              id: routeGroup.id,
              label: `${routeGroup.kind} (${routeGroup.name})`,
              name: routeGroup.name,
              selectedEdgeId: route.edgeId,
              locked: routeGroup.locked,
              widthMeters: routeGroup.style.widthMeters,
              color: routeGroup.style.color,
              segmentCount: routeGroup.kind === "river" ? routeGroup.vertices.length : routeGroup.segments.length
            };
          }
        }
      }
    }
    if (event.type === "pointercancel") ctx.interaction.suppressNextClick = false;
    // Cell-only painting patches its faces live. Edge erasing changes route
    // groups, so it needs one full redraw once the stroke is complete.
    if (wasWardPainting) {
      if (ctx.interaction.edgePaintChanged || ctx.documents.documentState.fixedCrossingApproaches !== undefined)
        ctx.refresh();
      else ctx.refreshUiOnly();
    } else if (wasVertexDragging || wasJunctionPainting || circle || stroke || draggedRoute) ctx.refresh();
  };
  return { finishDrag };
}
