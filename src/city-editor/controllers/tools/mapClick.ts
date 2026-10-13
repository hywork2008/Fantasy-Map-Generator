import { editorText } from "../../../i18n/editorMessages";
import { appendEdge, groupUsesEdge } from "../../core/features";
import type { InfillLane } from "../../core/gen/blockInfill";
import { placeLandmark } from "../../core/landmarks";
import type { CityDocument, CityElement, Id, LandmarkAsset, Point } from "../../core/types";
import { SHIP_SPECS } from "../../render/shipSvg";
import { parsePickInfo, type RenderSelection } from "../../render/svg";
import type { DocumentsState, InteractionState } from "../../state/editorSession";
import { pointInPolygon } from "../editorGeometry";
import { targetId } from "./toolTypes";
export interface MapClickContext {
  scope: import("../../services/editorLifetime").EditorLifetime;
  map: HTMLDivElement;
  interaction: InteractionState;
  documents: DocumentsState;
  localPoint: (event: PointerEvent) => [number, number];
  selectedLandmarkAsset: () => LandmarkAsset | null;
  showNotice: (value: string, redraw?: boolean) => void;
  preservedLandmarkLanes: () => InfillLane[];
  commit: (next: CityDocument, label?: string) => void;
  routeAtEvent: (
    event: Event,
    point: Point,
    allowNearby: boolean,
    allowLocked?: boolean
  ) => { groupId: Id; edgeId: Id } | null;
  applySelection: (nextSelection: RenderSelection) => void;
  refresh: () => void;
  appendSelectedRiverVertex: (vertexId: Id) => void;
  appendSelectedEdge: (edgeId: Id, kind: "road" | "wall") => void;
}
export function bindMapClick(ctx: MapClickContext) {
  ctx.scope.listen(
    ctx.map,
    "click",
    event => {
      if (!ctx.interaction.suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      ctx.interaction.suppressNextClick = false;
    },
    true
  );
  ctx.scope.listen(ctx.map, "click", event => {
    if (
      ctx.documents.documentState.sceneRegions &&
      ctx.interaction.tool !== "select" &&
      !pointInPolygon(ctx.localPoint(event as PointerEvent), ctx.documents.documentState.sceneRegions.coreBoundary)
    )
      return;
    if (ctx.interaction.tool === "landmark") {
      const asset = ctx.selectedLandmarkAsset();
      if (!asset) {
        ctx.showNotice(editorText("cityEditor.messages.loadALandmarkAssetFirst"));
        return;
      }
      const result = placeLandmark(
        ctx.documents.documentState,
        asset,
        {
          id: `landmark-${crypto.randomUUID()}`,
          position: ctx.localPoint(event as PointerEvent),
          rotation: (ctx.interaction.landmarkRotationDegrees * Math.PI) / 180,
          scale: 1
        },
        ctx.preservedLandmarkLanes()
      );
      if (result.document) {
        ctx.commit(result.document, editorText("cityEditor.messages.placeCityEditorPage", { value0: asset.name }));
        ctx.interaction.landmarkHoverPoint = null;
      } else ctx.showNotice(result.reasons.join("; "));
      return;
    }
    if (ctx.interaction.tool === "ship") {
      const p = ctx.localPoint(event as PointerEvent);
      const newElement: CityElement = {
        id: `ship-${crypto.randomUUID()}`,
        kind: "ship",
        shipType: ctx.interaction.shipType,
        faceIds: [],
        point: p,
        sizeMeters: ctx.interaction.shipSizeMeters,
        rotation: (ctx.interaction.shipAngleDegrees * Math.PI) / 180,
        locked: false
      };
      ctx.commit(
        { ...ctx.documents.documentState, elements: [...ctx.documents.documentState.elements, newElement] },
        editorText("cityEditor.messages.placeCityEditorPage", { value0: SHIP_SPECS[ctx.interaction.shipType].label })
      );
      return;
    }
    let target = event.target instanceof Element ? event.target : null;
    if (target === ctx.map || target?.tagName.toLowerCase() === "svg") {
      const under =
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(event.clientX, event.clientY)
          : null;
      if (under && ctx.map.contains(under) && under !== ctx.map) {
        target = under;
      }
    }
    const pickHost = target?.closest<SVGElement>("[data-pick]");
    const selectedPick = pickHost && ctx.map.contains(pickHost) ? pickHost : null;

    if (ctx.interaction.tool === "select") {
      const point = ctx.localPoint(event as PointerEvent);
      const activeGroup = ctx.interaction.activeGroupId
        ? ctx.documents.documentState.featureGroups.find(group => group.id === ctx.interaction.activeGroupId)
        : null;
      const edgeId = targetId(event, "edge");
      if (
        edgeId &&
        activeGroup &&
        !activeGroup.locked &&
        activeGroup.kind !== "river" &&
        !groupUsesEdge(ctx.documents.documentState, activeGroup, edgeId)
      ) {
        const next = appendEdge(ctx.documents.documentState, activeGroup.id, edgeId);
        if (next) {
          ctx.commit(next, editorText("cityEditor.messages.extend", { value0: activeGroup.name }));
          return;
        }
      }

      // A building is an explicit district selection, even near a wide street.
      const pickedBuilding = selectedPick?.classList.contains("ce-building") ?? false;
      const route = ctx.routeAtEvent(event, point, !pickedBuilding, true);
      if (route) {
        const routeGroup = ctx.documents.documentState.featureGroups.find(g => g.id === route.groupId);
        if (routeGroup) {
          ctx.interaction.activeGroupId = routeGroup.id;
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
          ctx.applySelection({
            faceId: null,
            vertexId: null,
            groupId: routeGroup.id,
            edgeId: route.edgeId,
            inspectedId: routeGroup.id
          });
          return;
        }
      }

      if (selectedPick) {
        const rawPick = selectedPick.getAttribute("data-pick");
        const info = parsePickInfo(rawPick);
        if (info) {
          ctx.interaction.inspectedInfo = info;
          const infoId = (info.id ?? null) as Id | null;
          if (info.layer === "cells" || info.kind === "cell") {
            ctx.interaction.activeGroupId = null;
            ctx.applySelection({
              ...ctx.interaction.selection,
              faceId: infoId,
              edgeId: null,
              vertexId: null,
              groupId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "buildings" || info.kind === "building") {
            const faceId = (info.faceId as Id) ?? null;
            ctx.interaction.activeGroupId = null;
            ctx.applySelection({
              ...ctx.interaction.selection,
              faceId,
              edgeId: null,
              vertexId: null,
              groupId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "features") {
            ctx.interaction.activeGroupId = infoId;
            ctx.applySelection({
              ...ctx.interaction.selection,
              groupId: infoId,
              faceId: null,
              edgeId: null,
              vertexId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "edges" || info.kind === "edge") {
            ctx.applySelection({
              ...ctx.interaction.selection,
              edgeId: infoId,
              faceId: null,
              vertexId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "vertices" || info.kind === "vertex") {
            ctx.interaction.activeGroupId = null;
            ctx.applySelection({
              ...ctx.interaction.selection,
              vertexId: infoId,
              faceId: null,
              edgeId: null,
              groupId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "gates" || info.kind === "gate") {
            const vertexId = (info.vertexId as Id) ?? null;
            const wallId = (info.wallId as Id) ?? null;
            ctx.interaction.activeGroupId = wallId;
            ctx.applySelection({
              ...ctx.interaction.selection,
              vertexId,
              faceId: null,
              edgeId: null,
              groupId: wallId,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "fortifications" || info.kind === "tower") {
            const wallId = (info.wallId as Id) ?? null;
            ctx.interaction.activeGroupId = wallId;
            ctx.applySelection({
              ...ctx.interaction.selection,
              faceId: null,
              edgeId: null,
              vertexId: null,
              groupId: wallId,
              inspectedId: infoId
            });
            return;
          } else {
            ctx.applySelection({ ...ctx.interaction.selection, inspectedId: infoId });
            return;
          }
        }
      }

      ctx.interaction.inspectedInfo = null;
      ctx.interaction.activeGroupId = null;
      ctx.applySelection({ faceId: null, edgeId: null, vertexId: null, groupId: null, inspectedId: null });
      return;
    }

    const vertexId = targetId(event, "vertex");
    const edgeId = targetId(event, "edge");
    const faceId = targetId(event, "face");
    const groupId = targetId(event, "group");
    if (groupId) {
      ctx.interaction.selection.groupId = groupId;
      ctx.interaction.activeGroupId = groupId;
      ctx.interaction.tool = "select";
      ctx.refresh();
      return;
    }
    const activeGroup = ctx.interaction.activeGroupId
      ? ctx.documents.documentState.featureGroups.find(group => group.id === ctx.interaction.activeGroupId)
      : null;
    if (
      edgeId &&
      activeGroup &&
      !activeGroup.locked &&
      activeGroup.kind !== "plank" &&
      ctx.interaction.tool === activeGroup.kind
    ) {
      if (groupUsesEdge(ctx.documents.documentState, activeGroup, edgeId)) {
        ctx.interaction.selection = { ...ctx.interaction.selection, edgeId, faceId: null, vertexId: null };
        ctx.refresh();
        return;
      }
      if (activeGroup.kind !== "river") {
        const next = appendEdge(ctx.documents.documentState, activeGroup.id, edgeId);
        if (next) ctx.commit(next, editorText("cityEditor.messages.extend", { value0: activeGroup.name }));
        else ctx.showNotice(editorText("cityEditor.messages.chooseAnUnusedEdgeBesideARouteEndpoint"));
        return;
      }
    }
    if (ctx.interaction.tool === "river" && vertexId) {
      ctx.appendSelectedRiverVertex(vertexId);
      return;
    }
    if ((ctx.interaction.tool === "road" || ctx.interaction.tool === "wall") && edgeId) {
      ctx.appendSelectedEdge(edgeId, ctx.interaction.tool);
      return;
    }
    if (faceId) ctx.interaction.selection = { ...ctx.interaction.selection, faceId, edgeId: null, vertexId: null };
    else if (edgeId) ctx.interaction.selection = { ...ctx.interaction.selection, edgeId, faceId: null, vertexId: null };
    else if (vertexId)
      ctx.interaction.selection = { ...ctx.interaction.selection, vertexId, faceId: null, edgeId: null };
    ctx.refresh();
  });
}
