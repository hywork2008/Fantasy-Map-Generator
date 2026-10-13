import { facePoints } from "../../core/mesh";
import type { Id, Point } from "../../core/types";
import type { RenderSelection } from "../../render/svg";
import type { DisplayState, DocumentsState, InteractionState } from "../../state/editorSession";
import { pointInPolygon } from "../editorGeometry";
import { isRoutePaintTool } from "./toolTypes";

export interface SelectionContext {
  map: HTMLDivElement;
  faceBucketSize: number;
  vertexBuckets: Map<string, string[]>;
  edgeIdsByVertex: Map<string, string[]>;
  faceBuckets: Map<string, string[]>;
  routeAtEvent: (
    event: Event,
    point: Point,
    allowNearby: boolean,
    allowLocked?: boolean
  ) => { groupId: Id; edgeId: Id } | null;
  updateHoverOverlay: () => void;
  patchSelectionRender: () => boolean;
  redrawMap: () => void;
  refreshUiOnly: () => void;
  documents: Pick<DocumentsState, "documentState">;
  interaction: Pick<InteractionState, "tool" | "selection">;
  display: Pick<DisplayState, "halfView">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createSelectionController(ctx: SelectionContext) {
  function localPoint(event: PointerEvent): [number, number] {
    return localPointAt(event.clientX, event.clientY);
  }

  function closestVertexId(point: [number, number]): Id | null {
    // Accept a roughly 12 px drop target regardless of the current zoom.
    const radius = (ctx.display.halfView * 24) / Math.max(ctx.map.getBoundingClientRect().width, 1);
    const span = Math.max(1, Math.ceil(radius / ctx.faceBucketSize));
    const originX = Math.floor(point[0] / ctx.faceBucketSize);
    const originY = Math.floor(point[1] / ctx.faceBucketSize);
    let nearest: Id | null = null;
    let nearestDistance = radius;
    for (let x = originX - span; x <= originX + span; x++) {
      for (let y = originY - span; y <= originY + span; y++) {
        for (const vertexId of ctx.vertexBuckets.get(`${x},${y}`) ?? []) {
          const vertex = ctx.documents.documentState.mesh.vertices[vertexId];
          if (!vertex) continue;
          const distance = Math.hypot(vertex.point[0] - point[0], vertex.point[1] - point[1]);
          if (distance <= nearestDistance) {
            nearest = vertex.id;
            nearestDistance = distance;
          }
        }
      }
    }
    return nearest;
  }

  function closestMergeCandidate(vertexId: Id): Id | null {
    const vertex = ctx.documents.documentState.mesh.vertices[vertexId];
    if (!vertex) return null;
    const radius = (ctx.display.halfView * 26) / Math.max(ctx.map.getBoundingClientRect().width, 1);
    let candidate: Id | null = null;
    let distance = radius;
    for (const edgeId of ctx.edgeIdsByVertex.get(vertexId) ?? []) {
      const edge = ctx.documents.documentState.mesh.edges[edgeId];
      if (!edge) continue;
      const otherId = edge.a === vertexId ? edge.b : edge.a;
      const other = ctx.documents.documentState.mesh.vertices[otherId];
      if (!other) continue;
      const candidateDistance = Math.hypot(vertex.point[0] - other.point[0], vertex.point[1] - other.point[1]);
      if (candidateDistance <= distance) {
        candidate = otherId;
        distance = candidateDistance;
      }
    }
    return candidate;
  }

  function faceAtPoint(point: Point): Id | null {
    const key = `${Math.floor(point[0] / ctx.faceBucketSize)},${Math.floor(point[1] / ctx.faceBucketSize)}`;
    for (const faceId of ctx.faceBuckets.get(key) ?? []) {
      const face = ctx.documents.documentState.mesh.faces[faceId];
      if (face && pointInPolygon(point, facePoints(ctx.documents.documentState.mesh, face))) return face.id;
    }
    return null;
  }

  function updateHover(event: PointerEvent): void {
    // Only Select, Edit-vertices, and the route tools show a hover highlight
    // (route glow / nearest-vertex handle). The brush tools (ward, sea,
    // junction, circular wall) track the cursor with a lightweight CSS ring, so
    // recomputing hover for them here is pure waste.
    const usesHover =
      ctx.interaction.tool === "select" || ctx.interaction.tool === "vertex" || isRoutePaintTool(ctx.interaction.tool);
    const point = usesHover ? localPoint(event) : null;
    const route = point ? ctx.routeAtEvent(event, point, false) : null;
    const nextGroupId = route?.groupId ?? null;
    const nextVertexId = point && ctx.interaction.tool === "select" ? closestVertexId(point) : null;
    // Compare against the normalised value: without this, an idle pointer over
    // empty canvas (route === null → groupId undefined) never matches the
    // stored null and forces a repaint on every move.
    if (
      ctx.interaction.selection.hoverGroupId === nextGroupId &&
      ctx.interaction.selection.hoverVertexId === nextVertexId
    )
      return;
    ctx.interaction.selection.hoverGroupId = nextGroupId;
    ctx.interaction.selection.hoverVertexId = nextVertexId;
    // Hover marks live in their own layer now, so this never rebuilds the mesh.
    ctx.updateHoverOverlay();
  }

  function applySelection(nextSelection: RenderSelection): void {
    ctx.interaction.selection = nextSelection;
    if (!ctx.patchSelectionRender()) {
      ctx.redrawMap();
    }
    ctx.refreshUiOnly();
  }

  function localPointAt(clientX: number, clientY: number): [number, number] {
    const svg = ctx.map.querySelector("svg");
    if (!svg) return [0, 0];
    if (typeof DOMPoint !== "undefined" && typeof svg.getScreenCTM === "function") {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return [point.x, -point.y];
      }
    }
    return [clientX, -clientY];
  }

  return { localPoint, closestVertexId, closestMergeCandidate, faceAtPoint, updateHover, applySelection, localPointAt };
}
