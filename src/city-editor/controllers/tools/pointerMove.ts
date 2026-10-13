import { previewRouteAcrossFace } from "../../core/features";
import { moveVertex } from "../../core/mesh";
import type { Id, Point } from "../../core/types";
import { getShipAngleFromPoint } from "../../render/shipSvg";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../../state/editorSession";
import { isBrushTool } from "./toolTypes";
export interface PointerMoveContext {
  scope: import("../../services/editorLifetime").EditorLifetime;
  map: HTMLDivElement;
  interaction: InteractionState;
  localPoint: (event: PointerEvent) => [number, number];
  documents: DocumentsState;
  scheduleRedraw: () => void;
  updateLandmarkPreview: () => void;
  updateShipPreview: () => void;
  updateCircularWallPreview: (event?: PointerEvent) => void;
  updateWardBrushPreview: (event?: PointerEvent) => void;
  paintCellsAtPoint: (point: Point) => void;
  optimizeJunctionsAtPoint: (point: Point) => void;
  extendRouteStroke: (point: Point) => void;
  faceAtPoint: (point: Point) => Id | null;
  updateRoutePreview: () => void;
  generation: GenerationState;
  closestMergeCandidate: (vertexId: Id) => Id | null;
  updateHover: (event: PointerEvent) => void;
  localPointAt: (clientX: number, clientY: number) => [number, number];
  display: DisplayState;
  updateViewport: (zoomChanged?: boolean) => void;
}
export function bindPointerMove(ctx: PointerMoveContext) {
  ctx.scope.listen(ctx.map, "pointermove", event => {
    if (ctx.interaction.shipDrag) {
      const point = ctx.localPoint(event);
      if (
        Math.hypot(
          point[0] - ctx.interaction.shipDrag.startPoint[0],
          point[1] - ctx.interaction.shipDrag.startPoint[1]
        ) > 0.5
      ) {
        ctx.interaction.shipDrag.moved = true;
        ctx.interaction.suppressNextClick = true;
      }
      if (ctx.interaction.shipDrag.mode === "move") {
        const dx = point[0] - ctx.interaction.shipDrag.startPoint[0];
        const dy = point[1] - ctx.interaction.shipDrag.startPoint[1];
        const nextPoint: Point = [
          ctx.interaction.shipDrag.initialShipPoint[0] + dx,
          ctx.interaction.shipDrag.initialShipPoint[1] + dy
        ];
        ctx.documents.documentState = {
          ...ctx.documents.documentState,
          elements: ctx.documents.documentState.elements.map(e =>
            e.id === ctx.interaction.shipDrag!.shipId ? { ...e, point: nextPoint } : e
          )
        };
      } else if (ctx.interaction.shipDrag.mode === "rotate") {
        const nextAngle = getShipAngleFromPoint(ctx.interaction.shipDrag.initialShipPoint, point);
        ctx.documents.documentState = {
          ...ctx.documents.documentState,
          elements: ctx.documents.documentState.elements.map(e =>
            e.id === ctx.interaction.shipDrag!.shipId ? { ...e, rotation: nextAngle } : e
          )
        };
        ctx.interaction.shipAngleDegrees = Math.round((nextAngle * 180) / Math.PI);
      }
      ctx.scheduleRedraw();
      return;
    }
    if (ctx.interaction.tool === "landmark" && !ctx.interaction.isPanning) {
      ctx.interaction.landmarkHoverPoint = ctx.localPoint(event);
      ctx.updateLandmarkPreview();
      return;
    }
    if (ctx.interaction.tool === "ship" && !ctx.interaction.isPanning) {
      ctx.interaction.shipHoverPoint = ctx.localPoint(event);
      ctx.updateShipPreview();
      return;
    }
    if (ctx.interaction.tool === "wardWall" || ctx.interaction.circularWallStroke) ctx.updateCircularWallPreview(event);
    if (ctx.interaction.circularWallStroke) return;
    if (isBrushTool(ctx.interaction.tool)) ctx.updateWardBrushPreview(event);
    if (ctx.interaction.isWardPainting) {
      ctx.paintCellsAtPoint(ctx.localPoint(event));
      return;
    }
    if (ctx.interaction.isJunctionPainting) {
      ctx.optimizeJunctionsAtPoint(ctx.localPoint(event));
      return;
    }
    if (ctx.interaction.routeStroke) {
      ctx.extendRouteStroke(ctx.localPoint(event));
      return;
    }
    if (ctx.interaction.routeDrag) {
      if (
        Math.abs(event.clientX - ctx.interaction.routeDrag.startX) > 2 ||
        Math.abs(event.clientY - ctx.interaction.routeDrag.startY) > 2
      )
        ctx.interaction.routeDrag.moved = true;
      const faceId = ctx.faceAtPoint(ctx.localPoint(event));
      if (faceId !== ctx.interaction.routePreviewFaceId) {
        ctx.interaction.routePreviewFaceId = faceId;
        ctx.interaction.routePreview = faceId
          ? previewRouteAcrossFace(ctx.documents.documentState, ctx.interaction.routeDrag.groupId, faceId, {
              edgeId: ctx.interaction.routeDrag.edgeId
            })
          : null;
        ctx.updateRoutePreview();
      }
      return;
    }
    if (ctx.interaction.isVertexDragging && ctx.interaction.selection.vertexId) {
      const point = ctx.localPoint(event);
      const next = moveVertex(
        ctx.documents.documentState,
        ctx.interaction.selection.vertexId,
        point,
        !!ctx.generation.failureRenderContext
      );
      if (!next) return;
      ctx.documents.documentState = next;
      if (ctx.interaction.inspectedInfo?.kind === "vertex")
        ctx.interaction.inspectedInfo = {
          ...ctx.interaction.inspectedInfo,
          point: next.mesh.vertices[ctx.interaction.selection.vertexId].point
        };
      ctx.interaction.dragMergeCandidateId = ctx.closestMergeCandidate(ctx.interaction.selection.vertexId);
      ctx.interaction.selection.hoverVertexId = ctx.interaction.dragMergeCandidateId;
      ctx.scheduleRedraw();
      ctx.interaction.suppressNextClick = true;
      return;
    }
    if (!ctx.interaction.isPanning) ctx.updateHover(event);
    if (!ctx.interaction.isPanning) return;
    const dx = event.clientX - ctx.interaction.lastPanX;
    const dy = event.clientY - ctx.interaction.lastPanY;
    if (!ctx.interaction.hasPanned && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      ctx.interaction.hasPanned = true;
      ctx.interaction.suppressNextClick = true;
      ctx.map.classList.add("ce-map--panning");
      ctx.map.setPointerCapture(event.pointerId);
    }
    if (!ctx.interaction.hasPanned) return;
    const point = ctx.localPoint(event);
    const previous = ctx.localPointAt(ctx.interaction.lastPanX, ctx.interaction.lastPanY);
    ctx.display.viewCenter = [
      ctx.display.viewCenter[0] - (point[0] - previous[0]),
      ctx.display.viewCenter[1] - (point[1] - previous[1])
    ];
    ctx.interaction.lastPanX = event.clientX;
    ctx.interaction.lastPanY = event.clientY;
    ctx.updateViewport();
  });
}
