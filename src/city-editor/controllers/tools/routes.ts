import { editorText } from "../../../i18n/editorMessages";
import {
  appendEdge,
  appendRiverVertex,
  createGroup,
  featureGroupVertices,
  groupUsesEdge
} from "../../generators/features";
import type { DisplayState, DocumentsState, InteractionState } from "../../state/editorSession";
import type { CityDocument, FeatureGroup, Id, Point } from "../../types/document";
import type { RoutePaintKind, RouteStroke } from "../../types/editor";
import { pointToSegmentDistance } from "../editorGeometry";
import { targetId } from "./toolTypes";

export interface RoutesContext {
  commit: (next: CityDocument, label?: string) => void;
  scheduleRedraw: () => void;
  rememberFailureGenerationState: () => void;
  rebuildEditorIndexes: () => void;
  edgeIdsByVertex: Map<string, string[]>;
  map: HTMLDivElement;
  routeGroupsByEdge: Map<string, string[]>;
  routeEdgesByGroup: Map<string, string[]>;
  documents: Pick<DocumentsState, "documentState" | "history">;
  interaction: Pick<InteractionState, "activeGroupId" | "selection" | "routeStroke">;
  display: Pick<DisplayState, "halfView">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createRoutesController(ctx: RoutesContext) {
  function appendSelectedEdge(edgeId: Id, kind: "road" | "wall"): void {
    let next = ctx.documents.documentState;
    let groupId = ctx.interaction.activeGroupId;
    const active = groupId ? next.featureGroups.find(group => group.id === groupId) : null;
    if (!active || active.kind !== kind) {
      next = createGroup(next, kind);
      groupId = next.featureGroups.at(-1)?.id ?? null;
    }
    if (!groupId) return;
    const appended = appendEdge(next, groupId, edgeId);
    if (appended) {
      ctx.interaction.activeGroupId = groupId;
      ctx.interaction.selection.groupId = groupId;
      ctx.commit(
        appended,
        kind === "wall" ? editorText("cityEditor.messages.drawWall") : editorText("cityEditor.messages.drawRoad")
      );
    }
  }

  function appendSelectedRiverVertex(vertexId: Id): void {
    let next = ctx.documents.documentState;
    let groupId = ctx.interaction.activeGroupId;
    const active = groupId ? next.featureGroups.find(group => group.id === groupId) : null;
    if (active?.kind !== "river" || active.mouth) {
      next = createGroup(next, "river");
      groupId = next.featureGroups.at(-1)?.id ?? null;
    }
    if (!groupId) return;
    const appended = appendRiverVertex(next, groupId, vertexId);
    if (appended) {
      ctx.interaction.activeGroupId = groupId;
      ctx.interaction.selection = { ...ctx.interaction.selection, vertexId, groupId };
      ctx.commit(appended, editorText("cityEditor.messages.drawRiver"));
    }
  }

  function extendRouteStroke(point: Point): void {
    const stroke = ctx.interaction.routeStroke;
    if (!stroke) return;
    if (!stroke.initialized) initializeRouteStroke(stroke, point);
    if (!stroke.groupId || !stroke.endpointId) return;

    const edgeId = closestStrokeContinuation(stroke, point);
    const edge = edgeId ? ctx.documents.documentState.mesh.edges[edgeId] : null;
    if (edge && edgeId) {
      const nextEndpointId: Id = edge.a === stroke.endpointId ? edge.b : edge.a;
      const next =
        stroke.kind === "river"
          ? appendRiverVertex(ctx.documents.documentState, stroke.groupId, nextEndpointId)
          : appendEdge(ctx.documents.documentState, stroke.groupId, edgeId);
      if (next) {
        ctx.documents.documentState = next;
        stroke.endpointId = nextEndpointId;
        stroke.changed = true;
        ctx.interaction.selection.groupId = stroke.groupId;
        ctx.interaction.activeGroupId = stroke.groupId;
        commitRouteStrokeStep(stroke);
      }
    }
    stroke.lastPoint = point;
    if (stroke.changed) ctx.scheduleRedraw();
  }

  function initializeRouteStroke(stroke: RouteStroke, point: Point): void {
    const edge = ctx.documents.documentState.mesh.edges[stroke.initialEdgeId];
    if (!edge) return;
    if (stroke.groupId && stroke.endpointId) {
      const group = ctx.documents.documentState.featureGroups.find(candidate => candidate.id === stroke.groupId);
      if (!group || group.locked || group.kind !== stroke.kind || (group.kind === "river" && group.mouth)) return;
      stroke.initialized = true;
      if (groupUsesEdge(ctx.documents.documentState, group, stroke.initialEdgeId)) return;
      const nextEndpointId = edge.a === stroke.endpointId ? edge.b : edge.a;
      const next =
        stroke.kind === "river"
          ? appendRiverVertex(ctx.documents.documentState, stroke.groupId, nextEndpointId)
          : appendEdge(ctx.documents.documentState, stroke.groupId, stroke.initialEdgeId);
      if (!next) return;
      ctx.documents.documentState = next;
      stroke.endpointId = nextEndpointId;
      stroke.changed = true;
      ctx.interaction.selection.groupId = stroke.groupId;
      ctx.interaction.activeGroupId = stroke.groupId;
      commitRouteStrokeStep(stroke);
      return;
    }
    const a = ctx.documents.documentState.mesh.vertices[edge.a]?.point;
    const b = ctx.documents.documentState.mesh.vertices[edge.b]?.point;
    if (!a || !b) return;
    const movement: Point = [point[0] - stroke.startPoint[0], point[1] - stroke.startPoint[1]];
    const startsAtA = (b[0] - a[0]) * movement[0] + (b[1] - a[1]) * movement[1] >= 0;
    const startVertexId = startsAtA ? edge.a : edge.b;
    const endVertexId = startsAtA ? edge.b : edge.a;
    let next = createGroup(ctx.documents.documentState, stroke.kind);
    const groupId = next.featureGroups.at(-1)?.id;
    if (!groupId) return;

    if (stroke.kind === "river") {
      next = appendRiverVertex(next, groupId, startVertexId) ?? next;
      next = appendRiverVertex(next, groupId, endVertexId) ?? next;
    } else {
      next = appendEdge(next, groupId, stroke.initialEdgeId) ?? next;
      const group = next.featureGroups.find(candidate => candidate.id === groupId);
      if (group && group.kind !== "river" && group.segments[0]) group.segments[0].forward = startsAtA;
    }
    ctx.documents.documentState = next;
    stroke.groupId = groupId;
    stroke.endpointId = endVertexId;
    stroke.initialized = true;
    stroke.changed = true;
    ctx.interaction.selection.groupId = groupId;
    ctx.interaction.activeGroupId = groupId;
    commitRouteStrokeStep(stroke);
  }

  function finishRouteStroke(stroke: RouteStroke, point: Point): void {
    if (!stroke.initialized) initializeRouteStroke(stroke, point);
  }

  function commitRouteStrokeStep(stroke: RouteStroke): void {
    // One drag = one undo entry. The first step of the stroke pushes it; every
    // later step rewrites that same entry so the History panel and memory only
    // ever see a single "Draw wall/road/river" per gesture.
    if (!stroke.committed) {
      ctx.documents.history.commit(
        ctx.documents.documentState,
        editorText("cityEditor.messages.draw", { value0: stroke.kind })
      );
      stroke.committed = true;
    } else {
      ctx.documents.history.amendTop(
        ctx.documents.documentState,
        editorText("cityEditor.messages.draw", { value0: stroke.kind })
      );
    }
    ctx.rememberFailureGenerationState();
    ctx.rebuildEditorIndexes();
  }

  function closestStrokeContinuation(stroke: RouteStroke, point: Point): Id | null {
    const endpointId = stroke.endpointId;
    if (!endpointId) return null;
    const endpoint = ctx.documents.documentState.mesh.vertices[endpointId]?.point;
    if (!endpoint || Math.hypot(point[0] - endpoint[0], point[1] - endpoint[1]) < routeHitRadius() * 0.35) return null;
    const group = ctx.documents.documentState.featureGroups.find(candidate => candidate.id === stroke.groupId);
    if (!group || (group.kind === "river" && group.mouth)) return null;
    const direction: Point = [point[0] - stroke.lastPoint[0], point[1] - stroke.lastPoint[1]];
    const directionLength = Math.hypot(direction[0], direction[1]) || 1;
    let nearest: Id | null = null;
    let nearestScore = Number.POSITIVE_INFINITY;
    for (const edgeId of ctx.edgeIdsByVertex.get(endpointId) ?? []) {
      const edge = ctx.documents.documentState.mesh.edges[edgeId];
      if (!edge || groupUsesEdge(ctx.documents.documentState, group, edgeId)) continue;
      const otherId = edge.a === endpointId ? edge.b : edge.a;
      const other = ctx.documents.documentState.mesh.vertices[otherId]?.point;
      if (!other) continue;
      const distance = pointToSegmentDistance(point, endpoint, other);
      if (distance > routeHitRadius() * 1.75) continue;
      const edgeLength = Math.hypot(other[0] - endpoint[0], other[1] - endpoint[1]) || 1;
      const alignment =
        ((other[0] - endpoint[0]) * direction[0] + (other[1] - endpoint[1]) * direction[1]) /
        (edgeLength * directionLength);
      // The pointer trajectory is the user's branch choice. Never take a
      // backward or sideward edge just because it happens to pass closer to
      // the cursor than the intended forward edge.
      if (alignment < 0.15) continue;
      const score = distance + (1 - alignment) * routeHitRadius() * 4;
      if (score < nearestScore) {
        nearest = edgeId;
        nearestScore = score;
      }
    }
    return nearest;
  }

  function closestMeshEdgeId(point: Point, radiusPixels: number): Id | null {
    const radius = routeHitRadius(radiusPixels);
    let nearest: Id | null = null;
    let nearestDistance = radius;
    for (const edge of Object.values(ctx.documents.documentState.mesh.edges)) {
      const a = ctx.documents.documentState.mesh.vertices[edge.a]?.point;
      const b = ctx.documents.documentState.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const distance = pointToSegmentDistance(point, a, b);
      if (distance <= nearestDistance) {
        nearest = edge.id;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function routeEndpointOnEdge(kind: RoutePaintKind, edgeId: Id, point: Point): { groupId: Id; vertexId: Id } | null {
    const edge = ctx.documents.documentState.mesh.edges[edgeId];
    if (!edge) return null;
    let closest: { groupId: Id; vertexId: Id; distance: number } | null = null;
    for (const group of ctx.documents.documentState.featureGroups) {
      if (group.kind !== kind || group.locked || (group.kind === "river" && group.mouth)) continue;
      const vertices = featureGroupVertices(ctx.documents.documentState, group);
      const endpoints = group.kind === "river" ? [vertices.at(-1)] : [vertices[0], vertices.at(-1)];
      for (const vertexId of new Set(endpoints)) {
        if (!vertexId || (vertexId !== edge.a && vertexId !== edge.b)) continue;
        const vertex = ctx.documents.documentState.mesh.vertices[vertexId];
        if (!vertex) continue;
        const distance = Math.hypot(point[0] - vertex.point[0], point[1] - vertex.point[1]);
        const activeBonus = group.id === ctx.interaction.activeGroupId ? routeHitRadius() : 0;
        if (!closest || distance - activeBonus < closest.distance) {
          closest = { groupId: group.id, vertexId, distance: distance - activeBonus };
        }
      }
    }
    return closest;
  }

  function routeHitRadius(pixels = 18): number {
    return ((ctx.display.halfView * 2) / Math.max(ctx.map.getBoundingClientRect().width, 1)) * pixels;
  }

  function routeAtEvent(
    event: Event,
    point: Point,
    allowNearby: boolean,
    allowLocked = false
  ): { groupId: Id; edgeId: Id } | null {
    const directGroupId = targetId(event, "group");
    const directEdgeId = targetId(event, "edge");
    const activeGroup = ctx.interaction.activeGroupId
      ? ctx.documents.documentState.featureGroups.find(group => group.id === ctx.interaction.activeGroupId)
      : null;
    const directEdgeGroups = directEdgeId ? (ctx.routeGroupsByEdge.get(directEdgeId) ?? []) : [];
    const group = directGroupId
      ? ctx.documents.documentState.featureGroups.find(candidate => candidate.id === directGroupId)
      : directEdgeId && activeGroup && ctx.routeEdgesByGroup.get(activeGroup.id)?.includes(directEdgeId)
        ? activeGroup
        : directEdgeId
          ? ctx.documents.documentState.featureGroups.find(candidate => candidate.id === directEdgeGroups[0])
          : null;
    if (!group) return allowNearby ? closestRouteAtPoint(point, allowLocked) : null;
    if (group.locked && !allowLocked) return null;
    const edgeId =
      directEdgeId && ctx.routeEdgesByGroup.get(group.id)?.includes(directEdgeId)
        ? directEdgeId
        : closestGroupEdgeId(group, point);
    return edgeId ? { groupId: group.id, edgeId } : null;
  }

  function closestRouteAtPoint(point: Point, allowLocked = false): { groupId: Id; edgeId: Id } | null {
    const metersPerPixel = (ctx.display.halfView * 2) / Math.max(ctx.map.getBoundingClientRect().width, 1);
    let closest: { groupId: Id; edgeId: Id } | null = null;
    let nearestRatio = Number.POSITIVE_INFINITY;
    for (const group of ctx.documents.documentState.featureGroups) {
      if (group.locked && !allowLocked) continue;
      const hitRadius = Math.max(group.style.widthMeters / 2 + metersPerPixel * 8, metersPerPixel * 12);
      for (const edgeId of ctx.routeEdgesByGroup.get(group.id) ?? []) {
        const edge = ctx.documents.documentState.mesh.edges[edgeId];
        if (!edge) continue;
        const a = ctx.documents.documentState.mesh.vertices[edge.a]?.point;
        const b = ctx.documents.documentState.mesh.vertices[edge.b]?.point;
        if (!a || !b) continue;
        const ratio = pointToSegmentDistance(point, a, b) / hitRadius;
        if (ratio > 1 || ratio >= nearestRatio) continue;
        closest = { groupId: group.id, edgeId };
        nearestRatio = ratio;
      }
    }
    return closest;
  }

  function closestGroupEdgeId(group: FeatureGroup, point: Point): Id | null {
    let nearest: Id | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const edgeId of ctx.routeEdgesByGroup.get(group.id) ?? []) {
      const edge = ctx.documents.documentState.mesh.edges[edgeId];
      if (!edge) continue;
      const a = ctx.documents.documentState.mesh.vertices[edge.a]?.point;
      const b = ctx.documents.documentState.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const distance = pointToSegmentDistance(point, a, b);
      if (distance < nearestDistance) {
        nearest = edgeId;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  return {
    appendSelectedEdge,
    appendSelectedRiverVertex,
    extendRouteStroke,
    initializeRouteStroke,
    finishRouteStroke,
    commitRouteStrokeStep,
    closestStrokeContinuation,
    closestMeshEdgeId,
    routeEndpointOnEdge,
    routeHitRadius,
    routeAtEvent,
    closestRouteAtPoint,
    closestGroupEdgeId
  };
}
