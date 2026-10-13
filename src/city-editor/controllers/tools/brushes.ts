import { editorText } from "../../../i18n/editorMessages";
import { syncDocumentCemeteries } from "../../generators/cemeteryLayout";
import { removeEdgesFromGroups } from "../../generators/features";
import { facePoints, optimizeJunctions } from "../../generators/mesh";
import { renderCemeteries } from "../../renderers/cemeterySvg";
import type { DisplayState, DocumentsState, InteractionState } from "../../state/editorSession";
import type { CityDocument, Id, Point } from "../../types/document";
import { formatDistance } from "../../utils/editorUnits";
import { circleIntersectsPolygon, pointToSegmentDistance } from "../editorGeometry";
import { isBrushTool } from "./toolTypes";

export interface BrushesContext {
  faceAtPoint: (point: Point) => Id | null;
  faceBucketSize: number;
  faceBuckets: Map<string, string[]>;
  map: HTMLDivElement;
  patchFaceRender: (faceId: Id) => void;
  scheduleRedraw: () => void;
  canvas: HTMLDivElement;
  wardBrushPreview: HTMLDivElement;
  circularWallCenter: HTMLDivElement;
  circularWallPreview: HTMLDivElement;
  localPoint: (event: PointerEvent) => [number, number];
  documents: Pick<DocumentsState, "documentState">;
  interaction: Pick<
    InteractionState,
    | "tool"
    | "wardBrush"
    | "eraseTarget"
    | "paintedWardFaceIds"
    | "selection"
    | "wardPaintChanged"
    | "paintedEdgeIds"
    | "edgePaintChanged"
    | "brushSizeCells"
    | "junctionMaxGapMeters"
    | "junctionPaintChanged"
    | "wardBrushPointer"
    | "circularWallPointer"
    | "circularWallStroke"
  >;
  display: Pick<DisplayState, "halfView">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createBrushesController(ctx: BrushesContext) {
  function faceIdsWithinWardBrush(center: Point): Id[] {
    return faceIdsWithinBrush(center, paintBrushRadiusMeters());
  }

  function faceIdsWithinBrush(center: Point, radius: number): Id[] {
    if (radius <= 0) {
      const faceId = ctx.faceAtPoint(center);
      return faceId ? [faceId] : [];
    }
    const faceIds = new Set<Id>();
    const minX = Math.floor((center[0] - radius) / ctx.faceBucketSize);
    const maxX = Math.floor((center[0] + radius) / ctx.faceBucketSize);
    const minY = Math.floor((center[1] - radius) / ctx.faceBucketSize);
    const maxY = Math.floor((center[1] + radius) / ctx.faceBucketSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (const faceId of ctx.faceBuckets.get(`${x},${y}`) ?? []) faceIds.add(faceId);
      }
    }
    return [...faceIds].filter(faceId => {
      const face = ctx.documents.documentState.mesh.faces[faceId];
      return !!face && circleIntersectsPolygon(center, radius, facePoints(ctx.documents.documentState.mesh, face));
    });
  }

  function paintCellsAtPoint(point: Point): void {
    const erasing = ctx.interaction.tool === "ward" && ctx.interaction.wardBrush === null;
    const eraseCells = !erasing || ctx.interaction.eraseTarget !== "edges";
    const eraseEdges = erasing && ctx.interaction.eraseTarget !== "cells";
    const faceIds = eraseCells ? faceIdsWithinWardBrush(point) : [];
    // Copy-on-write: a stroke fires this on every pointermove, so cloning the
    // whole document (all vertices/edges plus every face's boundary) here
    // would scale with total mesh size instead of the handful of cells the
    // brush actually touches — on a Large mesh that's ~16x the work of Small
    // for the same brush. Only the faces map is shallow-copied, and only the
    // faces the brush actually changes get a fresh object; every untouched
    // face keeps its original reference.
    let faces: CityDocument["mesh"]["faces"] | null = null;
    const touched: Id[] = [];
    let cemeteryChanged = false;
    for (const faceId of faceIds) {
      if (ctx.interaction.paintedWardFaceIds.has(faceId)) continue;
      ctx.interaction.paintedWardFaceIds.add(faceId);
      const face = ctx.documents.documentState.mesh.faces[faceId];
      if (!face || face.properties.locked) continue;
      if (ctx.interaction.tool === "sea") {
        if (face.properties.water === "sea" && face.properties.elevation === 0) continue;
      } else if (face.properties.ward === ctx.interaction.wardBrush) continue;
      if (!faces) faces = { ...ctx.documents.documentState.mesh.faces };
      const properties = { ...face.properties };
      if (ctx.interaction.tool === "sea") {
        // Match the Inspector's Water = sea operation exactly.
        properties.water = "sea";
        properties.elevation = 0;
      } else {
        if (properties.ward === "cemetery" || ctx.interaction.wardBrush === "cemetery") cemeteryChanged = true;
        properties.ward = ctx.interaction.wardBrush;
      }
      faces[faceId] = { ...face, properties };
      touched.push(faceId);
    }
    if (faces) {
      ctx.documents.documentState = {
        ...ctx.documents.documentState,
        mesh: { ...ctx.documents.documentState.mesh, faces }
      };
      if (cemeteryChanged) {
        ctx.documents.documentState.cemeteries = [...(ctx.documents.documentState.cemeteries ?? [])];
        syncDocumentCemeteries(ctx.documents.documentState, touched);
        ctx.map
          .querySelector(".ce-cemeteries")
          ?.replaceWith(renderCemeteries(ctx.documents.documentState, ctx.interaction.selection.inspectedId));
      }
      ctx.interaction.wardPaintChanged = true;
      // Patch just the touched faces' <path>/landmark directly, rather than
      // scheduling a full redrawMap() pass over the whole mesh next frame — on
      // a Large mesh a 1-cell brush touches one face out of ~9,000.
      for (const faceId of touched) ctx.patchFaceRender(faceId);
      if (ctx.documents.documentState.fixedCrossingApproaches !== undefined) {
        // Face-only painting can change support/passage without changing mesh edges.
        for (const path of ctx.map.querySelectorAll("[data-fixed-approach-id]")) path.remove();
        ctx.map.querySelector("svg")?.setAttribute("data-fixed-approach-status", "unvalidated");
        ctx.scheduleRedraw();
      }
    }
    if (eraseEdges) eraseEdgesAtPoint(point);
  }

  function canPaintAtPoint(point: Point): boolean {
    if (ctx.interaction.tool !== "ward" || ctx.interaction.wardBrush !== null)
      return faceIdsWithinWardBrush(point).length > 0;
    return (
      (ctx.interaction.eraseTarget !== "edges" && faceIdsWithinWardBrush(point).length > 0) ||
      (ctx.interaction.eraseTarget !== "cells" && edgeIdsWithinEraseBrush(point).length > 0)
    );
  }

  function edgeIdsWithinEraseBrush(point: Point): Id[] {
    const radius = brushSizeMeters() / 2;
    const edgeIds = new Set<Id>();
    for (const faceId of faceIdsWithinBrush(point, radius)) {
      const face = ctx.documents.documentState.mesh.faces[faceId];
      if (face) for (const ref of face.boundary) edgeIds.add(ref.edgeId);
    }
    return [...edgeIds].filter(edgeId => {
      const edge = ctx.documents.documentState.mesh.edges[edgeId];
      const a = edge && ctx.documents.documentState.mesh.vertices[edge.a]?.point;
      const b = edge && ctx.documents.documentState.mesh.vertices[edge.b]?.point;
      return !!a && !!b && pointToSegmentDistance(point, a, b) <= radius;
    });
  }

  function eraseEdgesAtPoint(point: Point): void {
    const edgeIds = edgeIdsWithinEraseBrush(point).filter(edgeId => !ctx.interaction.paintedEdgeIds.has(edgeId));
    if (!edgeIds.length) return;
    for (const edgeId of edgeIds) ctx.interaction.paintedEdgeIds.add(edgeId);
    const next = removeEdgesFromGroups(ctx.documents.documentState, edgeIds);
    if (!next) return;
    ctx.documents.documentState = next;
    ctx.interaction.wardPaintChanged = true;
    ctx.interaction.edgePaintChanged = true;
    // Route groups cannot be patched face-by-face, so coalesce redraws while
    // dragging and finish with one final redraw on pointerup.
    ctx.scheduleRedraw();
  }

  function paintHistoryLabel(): string {
    if (ctx.interaction.tool === "sea") return editorText("cityEditor.messages.paintSea");
    if (ctx.interaction.wardBrush)
      return editorText("cityEditor.messages.paintWard", { value0: ctx.interaction.wardBrush });
    return ctx.interaction.eraseTarget === "cells"
      ? editorText("cityEditor.messages.eraseCells")
      : ctx.interaction.eraseTarget === "edges"
        ? editorText("cityEditor.messages.eraseEdges")
        : editorText("cityEditor.messages.eraseCellsAndEdges");
  }

  function paintBrushRadiusMeters(): number {
    return Math.max(0, (brushSizeMeters() - ctx.documents.documentState.frame.blockSizeMeters) / 2);
  }

  function brushSizeMeters(): number {
    return ctx.interaction.brushSizeCells * ctx.documents.documentState.frame.blockSizeMeters;
  }

  function brushSizeText(): string {
    const unit = ctx.interaction.brushSizeCells === 1 ? "cell" : "cells";
    return `${ctx.interaction.brushSizeCells} ${unit} · ${formatDistance(brushSizeMeters())}`;
  }

  function optimizeJunctionsAtPoint(point: Point): void {
    const next = optimizeJunctions(
      ctx.documents.documentState,
      point,
      brushSizeMeters() / 2,
      ctx.interaction.junctionMaxGapMeters
    );
    if (!next) return;
    ctx.documents.documentState = next;
    ctx.interaction.junctionPaintChanged = true;
    ctx.scheduleRedraw();
  }

  function updateWardBrushPreview(event?: PointerEvent): void {
    if (event) ctx.interaction.wardBrushPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!isBrushTool(ctx.interaction.tool) || !ctx.interaction.wardBrushPointer) {
      hideWardBrushPreview();
      return;
    }
    const bounds = ctx.canvas.getBoundingClientRect();
    const metersPerPixel = (ctx.display.halfView * 2) / Math.max(ctx.map.getBoundingClientRect().width, 1);
    const radiusPixels = Math.max(5, brushSizeMeters() / 2 / metersPerPixel);
    ctx.wardBrushPreview.style.width = `${radiusPixels * 2}px`;
    ctx.wardBrushPreview.style.height = `${radiusPixels * 2}px`;
    ctx.wardBrushPreview.style.left = `${ctx.interaction.wardBrushPointer.clientX - bounds.left}px`;
    ctx.wardBrushPreview.style.top = `${ctx.interaction.wardBrushPointer.clientY - bounds.top}px`;
    ctx.wardBrushPreview.hidden = false;
  }

  function hideWardBrushPreview(): void {
    ctx.wardBrushPreview.hidden = true;
    ctx.interaction.wardBrushPointer = null;
  }

  function updateCircularWallPreview(event?: PointerEvent): void {
    if (event) ctx.interaction.circularWallPointer = { clientX: event.clientX, clientY: event.clientY };
    if (ctx.interaction.tool !== "wardWall" || !ctx.interaction.circularWallPointer) {
      hideCircularWallPreview();
      return;
    }
    const bounds = ctx.canvas.getBoundingClientRect();
    const stroke = ctx.interaction.circularWallStroke;
    const centerClient = stroke?.centerClient ?? ctx.interaction.circularWallPointer;
    ctx.circularWallCenter.style.left = `${centerClient.clientX - bounds.left}px`;
    ctx.circularWallCenter.style.top = `${centerClient.clientY - bounds.top}px`;
    ctx.circularWallCenter.hidden = false;
    if (!stroke) {
      ctx.circularWallPreview.hidden = true;
      return;
    }
    const pointer = event ? ctx.localPoint(event) : stroke.center;
    stroke.radiusMeters = Math.hypot(pointer[0] - stroke.center[0], pointer[1] - stroke.center[1]);
    const metersPerPixel = (ctx.display.halfView * 2) / Math.max(ctx.map.getBoundingClientRect().width, 1);
    const radiusPixels = stroke.radiusMeters / metersPerPixel;
    ctx.circularWallPreview.style.width = `${radiusPixels * 2}px`;
    ctx.circularWallPreview.style.height = `${radiusPixels * 2}px`;
    ctx.circularWallPreview.style.left = `${centerClient.clientX - bounds.left}px`;
    ctx.circularWallPreview.style.top = `${centerClient.clientY - bounds.top}px`;
    ctx.circularWallPreview.hidden = radiusPixels < 1;
  }

  function hideCircularWallPreview(): void {
    ctx.circularWallPreview.hidden = true;
    ctx.circularWallCenter.hidden = true;
    ctx.interaction.circularWallPointer = null;
  }

  return {
    faceIdsWithinWardBrush,
    faceIdsWithinBrush,
    paintCellsAtPoint,
    canPaintAtPoint,
    edgeIdsWithinEraseBrush,
    eraseEdgesAtPoint,
    paintHistoryLabel,
    paintBrushRadiusMeters,
    brushSizeMeters,
    brushSizeText,
    optimizeJunctionsAtPoint,
    updateWardBrushPreview,
    hideWardBrushPreview,
    updateCircularWallPreview,
    hideCircularWallPreview
  };
}
