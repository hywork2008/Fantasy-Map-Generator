import i18n from "../../../i18n";
import { editorText } from "../../../i18n/editorMessages";
import { rn } from "../../../utils/numberUtils";
import {
  encloseWardComponentWithWalls,
  groupUsesEdge,
  removeEdgeFromGroup,
  toggleGate,
  vertexHasWallPassage
} from "../../core/features";
import { edgeBetween, faceNeighbors, faceVertices, mergeFaces, mergeVertices, splitFace } from "../../core/mesh";
import type { CityDocument, FeatureGroup, Id, Point } from "../../core/types";
import type { DocumentsState, InteractionState } from "../../state/editorSession";
import type { ContextMenuAction } from "../../types/editor";
import { pointInPolygon } from "../editorGeometry";
import { targetId } from "./toolTypes";
export interface MapContextContext {
  scope: import("../../services/editorLifetime").EditorLifetime;
  contextMenu: HTMLDivElement;
  map: HTMLDivElement;
  flushRedraw: () => void;
  documents: DocumentsState;
  localPoint: (event: PointerEvent) => [number, number];
  interaction: InteractionState;
  faceAtPoint: (point: Point) => Id | null;
  closestVertexId: (point: [number, number]) => Id | null;
  refresh: () => void;
  runContextAction: (operation: () => CityDocument | null, label?: string) => void;
  closestGroupEdgeId: (group: FeatureGroup, point: Point) => Id | null;
  localPointAt: (clientX: number, clientY: number) => [number, number];
  setDistanceFromHere: (point: [number, number]) => void;
  setDistanceToHere: (point: [number, number]) => void;
  clearMeasurement: () => void;
  showContextMenu: (event: MouseEvent, actions: ContextMenuAction[]) => void;
}
export function bindMapContext(ctx: MapContextContext) {
  ctx.scope.listen(ctx.contextMenu, "contextmenu", event => event.preventDefault());
  ctx.scope.listen(ctx.map, "contextmenu", event => {
    event.preventDefault();
    ctx.flushRedraw();
    if (
      ctx.documents.documentState.sceneRegions &&
      !pointInPolygon(ctx.localPoint(event), ctx.documents.documentState.sceneRegions.coreBoundary)
    )
      return;
    const isSelectTool = ctx.interaction.tool === "select";
    const faceId = targetId(event, "face") ?? ctx.faceAtPoint(ctx.localPoint(event));
    const vertexId = targetId(event, "vertex") ?? (isSelectTool ? ctx.closestVertexId(ctx.localPoint(event)) : null);
    const edgeId = targetId(event, "edge");
    const groupId = targetId(event, "group");
    const actions: ContextMenuAction[] = [];

    // A vertex context click is also an explicit vertex selection. Without
    // this, the Inspector keeps a previous face or route selection and cannot
    // offer the wall-gate action for the vertex under the pointer.
    if (vertexId) {
      ctx.interaction.selection = { ...ctx.interaction.selection, vertexId, faceId: null, edgeId: null, groupId: null };
      ctx.interaction.activeGroupId = null;
      if (!isSelectTool) ctx.interaction.tool = "vertex";
      ctx.refresh();
    }

    if (isSelectTool && vertexId && vertexHasWallPassage(ctx.documents.documentState, vertexId)) {
      const gate = ctx.documents.documentState.gates.find(candidate => candidate.vertexId === vertexId);
      actions.push({
        label: gate ? editorText("cityEditor.messages.deleteGate") : editorText("cityEditor.messages.drawGate"),
        run: () =>
          ctx.runContextAction(
            () => toggleGate(ctx.documents.documentState, vertexId),
            gate ? editorText("cityEditor.messages.deleteGate") : editorText("cityEditor.messages.drawGate")
          )
      });
    }

    const activeGroup = ctx.interaction.activeGroupId
      ? ctx.documents.documentState.featureGroups.find(group => group.id === ctx.interaction.activeGroupId)
      : null;
    const routeGroup = groupId
      ? ctx.documents.documentState.featureGroups.find(group => group.id === groupId)
      : activeGroup;
    const routeEdgeId =
      routeGroup && edgeId && groupUsesEdge(ctx.documents.documentState, routeGroup, edgeId)
        ? edgeId
        : routeGroup && groupId
          ? ctx.closestGroupEdgeId(routeGroup, ctx.localPointAt(event.clientX, event.clientY))
          : null;
    if (routeGroup) {
      ctx.interaction.activeGroupId = routeGroup.id;
      ctx.interaction.selection.groupId = routeGroup.id;
      ctx.interaction.selection.edgeId = routeEdgeId;
      ctx.interaction.tool = "select";
    }
    if (routeEdgeId && routeGroup && !routeGroup.locked) {
      actions.push({
        label: editorText("cityEditor.messages.deleteEdge", { value0: routeGroup.name }),
        run: () =>
          ctx.runContextAction(
            () => {
              const next = removeEdgeFromGroup(ctx.documents.documentState, routeGroup.id, routeEdgeId);
              if (next && !next.featureGroups.some(group => group.id === routeGroup.id)) {
                ctx.interaction.activeGroupId = null;
                ctx.interaction.selection.groupId = null;
              }
              ctx.interaction.selection.edgeId = null;
              return next;
            },
            editorText("cityEditor.messages.deleteEdge", { value0: routeGroup.name })
          )
      });
    }

    const wardFace = faceId ? ctx.documents.documentState.mesh.faces[faceId] : null;
    if (wardFace?.properties.ward) {
      actions.push({
        label: editorText("cityEditor.messages.encloseConnectedWardWithWalls", { value0: wardFace.properties.ward }),
        run: () =>
          ctx.runContextAction(
            () => encloseWardComponentWithWalls(ctx.documents.documentState, wardFace.id),
            editorText("cityEditor.messages.encloseWard", { value0: wardFace.properties.ward })
          )
      });
    }

    if (
      faceId &&
      ctx.interaction.selection.faceId &&
      faceId !== ctx.interaction.selection.faceId &&
      faceNeighbors(ctx.documents.documentState.mesh, ctx.interaction.selection.faceId).includes(faceId)
    ) {
      actions.push({
        label: editorText("cityEditor.messages.mergeWith", {
          value0: ctx.interaction.selection.faceId,
          value1: faceId
        }),
        run: () =>
          ctx.runContextAction(
            () => mergeFaces(ctx.documents.documentState, ctx.interaction.selection.faceId as Id, faceId),
            editorText("cityEditor.messages.mergeCells")
          )
      });
    }

    if (vertexId && ctx.interaction.selection.vertexId && vertexId !== ctx.interaction.selection.vertexId) {
      if (edgeBetween(ctx.documents.documentState.mesh, ctx.interaction.selection.vertexId, vertexId)) {
        actions.push({
          label: editorText("cityEditor.messages.mergeInto", {
            value0: vertexId,
            value1: ctx.interaction.selection.vertexId
          }),
          run: () =>
            ctx.runContextAction(
              () => mergeVertices(ctx.documents.documentState, ctx.interaction.selection.vertexId as Id, vertexId),
              editorText("cityEditor.messages.mergeVertices")
            ),
          highlight: {
            vertexId,
            edgeId:
              edgeBetween(ctx.documents.documentState.mesh, ctx.interaction.selection.vertexId, vertexId)?.id ?? ""
          }
        });
      } else {
        for (const face of Object.values(ctx.documents.documentState.mesh.faces)) {
          const vertices = faceVertices(ctx.documents.documentState.mesh, face);
          if (!vertices.includes(ctx.interaction.selection.vertexId) || !vertices.includes(vertexId)) continue;
          actions.push({
            label: editorText("cityEditor.messages.splitFromTo", {
              value0: face.id,
              value1: ctx.interaction.selection.vertexId,
              value2: vertexId
            }),
            run: () =>
              ctx.runContextAction(
                () =>
                  splitFace(ctx.documents.documentState, face.id, ctx.interaction.selection.vertexId as Id, vertexId),
                editorText("cityEditor.messages.splitCell")
              )
          });
        }
      }
    }

    const clickPoint: [number, number] = [rn(ctx.localPoint(event)[0], 1), rn(ctx.localPoint(event)[1], 1)];
    const hasPriorActions = actions.length > 0;

    actions.push({
      label: i18n.t("mapContextMenu.distanceFromHere") || editorText("cityEditor.messages.distanceFromHere"),
      isSeparator: hasPriorActions,
      run: () => ctx.setDistanceFromHere(clickPoint)
    });

    actions.push({
      label: i18n.t("mapContextMenu.distanceToHere") || editorText("cityEditor.messages.distanceToHere"),
      disabled: !ctx.interaction.measureFrom,
      title: !ctx.interaction.measureFrom
        ? i18n.t("mapContextMenu.distanceToHereDisabled") ||
          editorText("cityEditor.messages.setAStartingPointWithDistanceFromHereFirst")
        : undefined,
      run: () => ctx.setDistanceToHere(clickPoint)
    });

    if (ctx.interaction.measureFrom || ctx.interaction.measureTo) {
      actions.push({
        label: editorText("cityEditor.messages.clearMeasurement"),
        run: () => ctx.clearMeasurement()
      });
    }

    ctx.showContextMenu(event, actions);
  });
}
