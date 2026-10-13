import { editorText } from "../../../i18n/editorMessages";
import { clone } from "../../generators/mesh";
import { parsePickInfo } from "../../renderers/pickInfo";
import type { DocumentsState, InteractionState } from "../../state/editorSession";
import type { Id, Point } from "../../types/document";
import type { RoutePaintKind } from "../../types/editor";
import { pointInPolygon } from "../editorGeometry";
import { isPaintBrushTool, isRoutePaintTool, targetId } from "./toolTypes";
export interface PointerDownContext {
  scope: import("../../services/editorLifetime").EditorLifetime;
  contextMenu: HTMLDivElement;
  map: HTMLDivElement;
  hideContextMenu: () => void;
  flushRedraw: () => void;
  interaction: InteractionState;
  localPoint: (event: PointerEvent) => [number, number];
  documents: DocumentsState;
  updateCircularWallPreview: (event?: PointerEvent) => void;
  canPaintAtPoint: (point: Point) => boolean;
  paintCellsAtPoint: (point: Point) => void;
  optimizeJunctionsAtPoint: (point: Point) => void;
  closestMeshEdgeId: (point: Point, radiusPixels: number) => Id | null;
  routeEndpointOnEdge: (kind: RoutePaintKind, edgeId: Id, point: Point) => { groupId: Id; vertexId: Id } | null;
  refresh: () => void;
  closestVertexId: (point: [number, number]) => Id | null;
  routeHitRadius: (pixels?: number) => number;
  routeAtEvent: (
    event: Event,
    point: Point,
    allowNearby: boolean,
    allowLocked?: boolean
  ) => { groupId: Id; edgeId: Id } | null;
}
export function bindPointerDown(ctx: PointerDownContext) {
  ctx.scope.listen(ctx.contextMenu, "pointerdown", event => event.stopPropagation());
  ctx.scope.listen(ctx.map, "pointerdown", event => {
    ctx.hideContextMenu();
    // A wheel-zoom just before this click may still be waiting on its frame;
    // hit-testing below reads the SVG, so settle it first.
    ctx.flushRedraw();
    if (event.button === 1 || (event.button === 0 && ctx.interaction.isSpacePressed)) {
      event.preventDefault();
      ctx.interaction.isPanning = true;
      ctx.interaction.hasPanned = false;
      ctx.interaction.lastPanX = event.clientX;
      ctx.interaction.lastPanY = event.clientY;
      ctx.map.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const point = ctx.localPoint(event);
    if (
      ctx.documents.documentState.sceneRegions &&
      !pointInPolygon(point, ctx.documents.documentState.sceneRegions.coreBoundary)
    )
      return;
    if (ctx.interaction.tool === "wardWall") {
      event.preventDefault();
      ctx.interaction.circularWallStroke = {
        center: point,
        centerClient: { clientX: event.clientX, clientY: event.clientY },
        radiusMeters: 0
      };
      ctx.updateCircularWallPreview(event);
      ctx.interaction.suppressNextClick = true;
      ctx.map.setPointerCapture(event.pointerId);
      return;
    }
    if (isPaintBrushTool(ctx.interaction.tool)) {
      if (!ctx.canPaintAtPoint(point)) return;
      event.preventDefault();
      ctx.interaction.isWardPainting = true;
      ctx.interaction.wardPaintChanged = false;
      ctx.interaction.edgePaintChanged = false;
      ctx.interaction.paintedWardFaceIds = new Set();
      ctx.interaction.paintedEdgeIds = new Set();
      ctx.paintCellsAtPoint(point);
      ctx.interaction.suppressNextClick = true;
      ctx.map.setPointerCapture(event.pointerId);
      return;
    }
    if (ctx.interaction.tool === "junction") {
      event.preventDefault();
      ctx.interaction.isJunctionPainting = true;
      ctx.interaction.junctionPaintChanged = false;
      ctx.optimizeJunctionsAtPoint(point);
      ctx.interaction.suppressNextClick = true;
      ctx.map.setPointerCapture(event.pointerId);
      return;
    }
    if (isRoutePaintTool(ctx.interaction.tool)) {
      const edgeId = ctx.closestMeshEdgeId(point, 18);
      if (edgeId) {
        const connection = ctx.routeEndpointOnEdge(ctx.interaction.tool, edgeId, point);
        event.preventDefault();
        ctx.interaction.routeStroke = {
          kind: ctx.interaction.tool,
          initialEdgeId: edgeId,
          groupId: connection?.groupId ?? null,
          endpointId: connection?.vertexId ?? null,
          initialized: false,
          startPoint: point,
          lastPoint: point,
          changed: false,
          committed: false
        };
        ctx.interaction.suppressNextClick = true;
        ctx.map.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (ctx.interaction.tool === "select") {
      const targetEl = event.target instanceof Element ? event.target : null;
      const shipHandle = targetEl?.closest<SVGElement>("[data-ship-handle='rotate']");
      if (shipHandle) {
        const shipId = shipHandle.getAttribute("data-ship-id");
        const ship = ctx.documents.documentState.elements.find(e => e.id === shipId && e.kind === "ship");
        if (ship?.point && !ship.locked) {
          event.preventDefault();
          ctx.interaction.shipDragBefore = clone(ctx.documents.documentState);
          ctx.interaction.shipDrag = {
            shipId: ship.id,
            mode: "rotate",
            startPoint: point,
            initialShipPoint: [...ship.point],
            initialRotation: ship.rotation ?? 0,
            moved: false
          };
          ctx.map.setPointerCapture(event.pointerId);
          ctx.interaction.suppressNextClick = true;
          return;
        }
      }

      const shipPick = targetEl?.closest<SVGElement>(".ce-ship[data-pick]");
      if (shipPick) {
        const rawPick = shipPick.getAttribute("data-pick");
        const info = parsePickInfo(rawPick);
        if (info && info.kind === "ship") {
          const shipId = String(info.id);
          const ship = ctx.documents.documentState.elements.find(e => e.id === shipId);
          if (ship?.point) {
            ctx.interaction.selection = {
              faceId: null,
              edgeId: null,
              vertexId: null,
              groupId: null,
              inspectedId: ship.id
            };
            ctx.interaction.inspectedInfo = info;
            ctx.interaction.activeGroupId = null;
            if (!ship.locked) {
              event.preventDefault();
              ctx.interaction.shipDragBefore = clone(ctx.documents.documentState);
              ctx.interaction.shipDrag = {
                shipId: ship.id,
                mode: "move",
                startPoint: point,
                initialShipPoint: [...ship.point],
                initialRotation: ship.rotation ?? 0,
                moved: false
              };
              ctx.map.setPointerCapture(event.pointerId);
              ctx.interaction.suppressNextClick = true;
            }
            ctx.refresh();
            return;
          }
        }
      }

      const nearestVertexId = ctx.closestVertexId(point);
      const v = nearestVertexId ? ctx.documents.documentState.mesh.vertices[nearestVertexId] : null;
      const vDist = v ? Math.hypot(v.point[0] - point[0], v.point[1] - point[1]) : Number.POSITIVE_INFINITY;
      const vertexGrabRadius = ctx.routeHitRadius(14);

      if (nearestVertexId && v && vDist <= vertexGrabRadius) {
        event.preventDefault();
        ctx.interaction.dragBefore = clone(ctx.documents.documentState);
        ctx.interaction.isVertexDragging = true;
        ctx.interaction.dragMergeCandidateId = null;
        ctx.interaction.selection = {
          faceId: null,
          edgeId: null,
          groupId: null,
          vertexId: nearestVertexId,
          inspectedId: nearestVertexId
        };
        ctx.interaction.activeGroupId = null;
        ctx.interaction.inspectedInfo = {
          layer: "vertices",
          kind: "vertex",
          id: nearestVertexId,
          label: editorText("cityEditor.messages.vertexIdentifier", { value0: nearestVertexId }),
          point: v.point
        };
        ctx.map.setPointerCapture(event.pointerId);
        return;
      }

      const route = ctx.routeAtEvent(event, point, true, true);
      if (route) {
        event.preventDefault();
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
          if (!routeGroup.locked) {
            ctx.interaction.routeDrag = { ...route, startX: event.clientX, startY: event.clientY, moved: false };
          }
          ctx.map.setPointerCapture(event.pointerId);
          return;
        }
      }
    }

    const vertexId =
      targetId(event, "vertex") ?? (ctx.interaction.tool === "vertex" ? ctx.closestVertexId(point) : null);
    if (vertexId && ctx.interaction.tool === "vertex") {
      event.preventDefault();
      ctx.interaction.selection = {
        ...ctx.interaction.selection,
        vertexId,
        faceId: null,
        edgeId: null,
        groupId: null,
        inspectedId: vertexId
      };
      ctx.interaction.activeGroupId = null;
      const v = ctx.documents.documentState.mesh.vertices[vertexId];
      if (v) {
        ctx.interaction.inspectedInfo = {
          layer: "vertices",
          kind: "vertex",
          id: vertexId,
          label: editorText("cityEditor.messages.vertexIdentifier", { value0: vertexId }),
          point: v.point
        };
      }
      ctx.interaction.suppressNextClick = true;
      ctx.refresh();
      return;
    }
  });
}
