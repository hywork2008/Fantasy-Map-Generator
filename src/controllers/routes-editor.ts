import type * as d3 from "d3";
import { drag, pointer, select } from "d3";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

import { removeRoute } from "../renderers/draw-routes";
import { createRouteCommand, patchRoute, removeRouteCommand, replaceRoutePoints } from "../runtime/worldRuntime";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { dialogStore } from "../store/dialogState";
import { elSelected, modules, setElSelected } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import { routeJoinDialogStore } from "../store/routeJoinDialogState";
import { getRoutesEditorState, setRoutesEditorState } from "../store/routesEditorState";
import type { Route } from "../types/models";
import { closeDialogs } from "../ui/dialogs/dialogService";
import { findCell, getSegmentId, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog } from "../utils/editorHelpers";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { openElevationProfile } from "./elevation-profile";
import { interactionManager } from "./interactionManager";
import { scheduleWebglUpdate, toggleCells, toggleRoutes } from "./layers";
import { editNotes } from "./notes-editor";
import { editRouteGroups } from "./route-group-editor";
import { editStyle } from "./style";

let worldContext: WorldContext;
let routeEditorCellsForced = false;
let routeCreatorCellsForced = false;

let _rcRoute: Route | null = null;
let _rcPointIndex = 0;
let _createRoutePoints: { x: number; y: number; cellId: number }[] = [];
let isRouteControlPointDragging = false;

const ROUTE_DRAG_PREVIEW_ID = "routeDragPreview";
const ROUTE_DRAG_PREVIEW_PATH_ID = "routeDragPreviewPath";

export function initRoutesEditor(wc: WorldContext) {
  worldContext = wc;
}

export function editRoute(id: string): void {
  if (view.customization) return;
  if (elSelected && id === elSelected.attr("id")) return;
  closeDialogs(".stable");

  if (!layerIsOn("toggleRoutes")) toggleRoutes();
  routeEditorCellsForced = !layerIsOn("toggleCells");
  if (routeEditorCellsForced) toggleCells();

  setElSelected(select<SVGPathElement, unknown>(`#${id}`).on("click", addControlPoint) as typeof elSelected);

  tip(
    "Drag control points to change the route. Click on point to remove it. Click on the route to add additional control point. For major changes please create a new route instead",
    true
  );
  view.debug.append("g").attr("id", "controlCells");
  view.debug.append("g").attr("id", "controlPoints");

  const route = getRoute();
  drawControlPoints(route.points);
  drawRouteCells(route.points);

  setRoutesEditorState({ isOpen: true, isCreatorOpen: false });
  updateRouteData(route);

  if (modules.editRoute) return;
  modules.editRoute = true;
}

function getRoute(): Route {
  const routeId = +elSelected!.attr("id").slice(5);
  return worldContext.pack.routes.find((route: Route) => route.i === routeId)!;
}

function updateRouteData(route: Route): void {
  route.name = route.name || GenerationPipeline.Routes.generateName(route);
  route.length = route.length || GenerationPipeline.Routes.getLength(route.i);

  const allGroups = Array.from(view.routes.selectAll<SVGGElement, unknown>("g").nodes()).map(n => n.id);
  const distanceUnit = useOptionsState.getState().distanceUnit || "km";
  const lengthStr = `${rn(route.length * worldContext.distanceScale)} ${distanceUnit}`;

  const isWaterRoute = route.points.some(([, , cellId]) => worldContext.pack.cells.h[cellId] < 20);

  setRoutesEditorState({
    routeId: `route${route.i}`,
    routeName: route.name,
    routeGroup: route.group,
    routeLength: lengthStr,
    isWaterRoute,
    isLocked: !!route.lock,
    allGroups
  });
}

function updateRouteLength(route: Route): void {
  route.length = GenerationPipeline.Routes.getLength(route.i);
  const distanceUnit = useOptionsState.getState().distanceUnit || "km";
  const lengthStr = `${rn(route.length * worldContext.distanceScale)} ${distanceUnit}`;
  setRoutesEditorState({ routeLength: lengthStr });
}

function drawControlPoints(pts: [number, number, number][]): void {
  view.debug
    .select("#controlPoints")
    .selectAll<SVGCircleElement, [number, number, number]>("circle")
    .data(pts)
    .join<SVGCircleElement>("circle")
    .attr("cx", d => d[0])
    .attr("cy", d => d[1])
    .attr("r", 0.6)
    // Route mutations clone every point tuple. Keep the control-point identity in the DOM so
    // circles that were not just dragged do not retain an obsolete tuple reference.
    .attr("data-point-index", (_d, index) => String(index))
    .call(
      drag<SVGCircleElement, [number, number, number]>()
        .on("start", dragControlPointStart)
        .on("drag", dragControlPointDrag)
        .on("end", dragControlPointEnd)
    )
    .on("click", handleControlPointClick);
}

function drawRouteCells(pts: [number, number, number][]): void {
  view.debug
    .select("#controlCells")
    .selectAll("polygon")
    .data(pts)
    .join("polygon")
    .attr("points", (p: [number, number, number]) =>
      getPackPolygon(p[2], worldContext.pack)
        .map(pt => pt.join(","))
        .join(" ")
    );
}

function dragControlPointStart(
  this: SVGCircleElement,
  _event: d3.D3DragEvent<SVGCircleElement, [number, number, number], [number, number, number]>
): void {
  _rcRoute = getRoute();
  _rcPointIndex = getControlPointIndex(this);
  isRouteControlPointDragging = true;
}

function dragControlPointDrag(
  this: SVGCircleElement,
  event: d3.D3DragEvent<SVGCircleElement, [number, number, number], [number, number, number]>
): void {
  if (!_rcRoute) return;
  this.setAttribute("cx", String(event.x));
  this.setAttribute("cy", String(event.y));

  const x = rn(event.x, 2);
  const y = rn(event.y, 2);
  const cellId = findCell(x, y);

  const updatedPoints = _rcRoute.points.map((point, index) =>
    index === _rcPointIndex ? ([x, y, cellId] as [number, number, number]) : ([...point] as [number, number, number])
  );
  if (!replaceRoutePoints({ routeId: _rcRoute.i, points: updatedPoints })) return;
  redrawRoute(_rcRoute);
  drawRouteCells(_rcRoute.points);
}

function dragControlPointEnd(): void {
  _rcRoute = null;
  isRouteControlPointDragging = false;
  removeRouteDragPreview();
  // Ensure the final pointer position is rendered even when the last drag event was already
  // coalesced into a pending animation-frame update.
  scheduleWebglUpdate();
}

function redrawRoute(route: Route): void {
  elSelected!.attr("d", GenerationPipeline.Routes.getPath(route));
  updateRouteLength(route);
  if (dialogStore.getState().openDialogs.has("elevationProfile")) routesEditorActions.showRouteElevationProfile();

  if (viewContext.renderMode !== "webglHybrid") return;

  // Keep an SVG copy of just the edited route above the canvas so it follows the pointer on
  // every d3 drag event. The deck.gl refresh is deliberately coalesced to one per animation
  // frame; calling drawLayers() here rebuilt all hybrid overlays for every mousemove.
  if (isRouteControlPointDragging) updateRouteDragPreview();
  scheduleWebglUpdate();
}

function updateRouteDragPreview(): void {
  const sourcePath = elSelected?.node();
  const sourceGroup = sourcePath?.parentElement;
  const debug = view.debug.node();
  if (!sourcePath || !(sourceGroup instanceof SVGGElement) || !debug) return;

  let preview = view.debug.select<SVGGElement>(`#${ROUTE_DRAG_PREVIEW_ID}`);
  if (!preview.size()) {
    // Route paints are normally inherited from roads / trails / searoutes. Copy their computed
    // presentation attributes because the preview must use a distinct id outside #routes.
    const previewGroup = sourceGroup.cloneNode(false) as SVGGElement;
    previewGroup.id = ROUTE_DRAG_PREVIEW_ID;
    previewGroup.setAttribute("pointer-events", "none");
    copyRouteGroupPaint(sourceGroup, previewGroup);
    const previewPath = sourcePath.cloneNode(false) as SVGPathElement;
    previewPath.id = ROUTE_DRAG_PREVIEW_PATH_ID;
    previewGroup.append(previewPath);
    debug.append(previewGroup);
    preview = select(previewGroup);
  }

  preview.select<SVGPathElement>(`#${ROUTE_DRAG_PREVIEW_PATH_ID}`).attr("d", sourcePath.getAttribute("d") ?? "");
}

function removeRouteDragPreview(): void {
  view.debug.select(`#${ROUTE_DRAG_PREVIEW_ID}`).remove();
}

function copyRouteGroupPaint(source: SVGGElement, target: SVGGElement): void {
  const paint = getComputedStyle(source);
  const attributes = [
    ["fill", "fill"],
    ["opacity", "opacity"],
    ["stroke", "stroke"],
    ["stroke-width", "stroke-width"],
    ["stroke-dasharray", "stroke-dasharray"],
    ["stroke-linecap", "stroke-linecap"],
    ["filter", "filter"],
    ["mask", "mask"]
  ] as const;
  for (const [attribute, property] of attributes) target.setAttribute(attribute, paint.getPropertyValue(property));
}

function addControlPoint(this: SVGPathElement, event: MouseEvent): void {
  const route = getRoute();
  const [x, y] = pointer(event, this);
  const cellId = findCell(x, y);

  const point: [number, number, number] = [rn(x, 2), rn(y, 2), cellId];
  const isNewCell = !route.points.some(p => p[2] === cellId);

  const index = getSegmentId(route.points as unknown as [number, number][], point as unknown as [number, number], 2);
  const updatedPoints = [...route.points.slice(0, index), point, ...route.points.slice(index)];
  if (!replaceRoutePoints({ routeId: route.i, points: updatedPoints })) return;

  if (isNewCell) drawRouteCells(route.points);

  drawControlPoints(route.points);
  redrawRoute(route);
}

function handleControlPointClick(this: SVGCircleElement, _event: MouseEvent): void {
  const controlPoint = select(this);
  const route = getRoute();
  if (route.points.length < 3) return;

  const index = getControlPointIndex(this);

  if (getRoutesEditorState().isSplitMode) {
    splitRoute();
  } else {
    removeControlPoint(controlPoint);
  }

  function splitRoute(): void {
    const oldRoutePoints = route.points.slice(0, index + 1);
    const newRoutePoints = route.points.slice(index);

    if (!replaceRoutePoints({ routeId: route.i, points: oldRoutePoints })) return;
    drawControlPoints(route.points);
    drawRouteCells(route.points);
    redrawRoute(route);

    const newRoute: Route = {
      i: GenerationPipeline.Routes.getNextId(),
      group: route.group,
      feature: route.feature,
      name: route.name,
      points: newRoutePoints
    };
    if (!createRouteCommand({ route: newRoute })) return;

    view.routes
      .select(`#${newRoute.group}`)
      .append("path")
      .attr("d", GenerationPipeline.Routes.getPath(newRoute))
      .attr("id", `route${newRoute.i}`);

    setRoutesEditorState({ isSplitMode: false });
  }

  function removeControlPoint(cp: d3.Selection<SVGCircleElement, unknown, null, undefined>): void {
    cp.remove();
    if (
      !replaceRoutePoints({
        routeId: route.i,
        points: route.points.filter((_point, pointIndex) => pointIndex !== index)
      })
    )
      return;

    drawRouteCells(route.points);
    redrawRoute(route);
  }
}

function getControlPointIndex(element: SVGCircleElement): number {
  const index = Number(element.dataset.pointIndex);
  if (!Number.isInteger(index) || index < 0) throw new Error("Route control point is missing its index");
  return index;
}

export function createRoute(defaultGroup?: string): void {
  if (view.customization) return;
  closeDialogs();
  if (!layerIsOn("toggleRoutes")) toggleRoutes();

  routeCreatorCellsForced = !layerIsOn("toggleCells");
  if (routeCreatorCellsForced) toggleCells();

  tip("Click to add route point, click again to remove", true);
  view.debug.append("g").attr("id", "controlCells");
  view.debug.append("g").attr("id", "controlPoints");
  view.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(onCreatorClick);

  _createRoutePoints = [];
  const allGroups = Array.from(view.routes.selectAll<SVGGElement, unknown>("g").nodes()).map(n => n.id);

  setRoutesEditorState({
    isOpen: false,
    isCreatorOpen: true,
    creatorGroup: defaultGroup || "roads",
    creatorPoints: [],
    allGroups
  });

  if (modules.createRoute) return;
  modules.createRoute = true;
}

function onCreatorClick(event: MouseEvent): void {
  const [x, y] = pointer(event);
  const cellId = findCell(x, y);
  _createRoutePoints.push({ x: rn(x, 2), y: rn(y, 2), cellId });

  setRoutesEditorState({ creatorPoints: [..._createRoutePoints] });
  drawRoutePreview();
}

function drawRoutePreview(): void {
  const pts = _createRoutePoints.map(p => [p.x, p.y, p.cellId] as [number, number, number]);

  view.debug
    .select("#controlCells")
    .selectAll("polygon")
    .data(pts)
    .join("polygon")
    .attr("points", (p: [number, number, number]) =>
      getPackPolygon(p[2], worldContext.pack)
        .map(pt => pt.join(","))
        .join(" ")
    )
    .attr("class", "current");

  view.debug
    .select("#controlPoints")
    .selectAll("circle")
    .data(pts)
    .join("circle")
    .attr("cx", d => d[0])
    .attr("cy", d => d[1])
    .attr("r", 0.6);

  const group = getRoutesEditorState().creatorGroup;

  view.routes.select("#routeTemp").remove();
  view.routes
    .select(`#${group}`)
    .append("path")
    .attr("d", GenerationPipeline.Routes.getPath({ group, points: pts, i: -1, feature: 0 } as Route))
    .attr("id", "routeTemp");
}

export const routesEditorActions = {
  closeRouteEditor(): void {
    setRoutesEditorState({ isOpen: false });
    modules.editRoute = false;
    isRouteControlPointDragging = false;
    removeRouteDragPreview();
    view.debug.select("#controlPoints").remove();
    view.debug.select("#controlCells").remove();

    elSelected?.on("click", null);
    EditorBus.unselect();
    clearMainTip();

    if (routeEditorCellsForced && layerIsOn("toggleCells")) toggleCells();
    routeEditorCellsForced = false;
  },

  changeName(name: string): void {
    if (patchRoute({ routeId: getRoute().i, name })) setRoutesEditorState({ routeName: name });
  },

  generateName(): void {
    const route = getRoute();
    const name = GenerationPipeline.Routes.generateName(route);
    if (patchRoute({ routeId: route.i, name })) setRoutesEditorState({ routeName: name });
  },

  changeGroup(group: string): void {
    if (!patchRoute({ routeId: getRoute().i, group })) return;
    view.routes.select<SVGGElement>(`#${group}`).node()!.appendChild(elSelected!.node()!);
    setRoutesEditorState({ routeGroup: group });
  },

  editRouteGroups(): void {
    editRouteGroups();
  },

  editRouteGroupStyle(): void {
    const { group } = getRoute();
    editStyle("routes", group);
  },

  showCreationDialog(): void {
    const route = getRoute();
    createRoute(route.group);
  },

  toggleSplitMode(): void {
    setRoutesEditorState({ isSplitMode: !getRoutesEditorState().isSplitMode });
  },

  openJoinRoutesDialog(): void {
    const route = getRoute();
    const firstCell = route.points.at(0)![2];
    const lastCell = route.points.at(-1)![2];

    const candidateRoutes = worldContext.pack.routes.filter((r: Route) => {
      if (r.i === route.i) return false;
      if (r.group !== route.group) return false;
      if (r.points.at(0)![2] === lastCell) return true;
      if (r.points.at(-1)![2] === firstCell) return true;
      if (r.points.at(0)![2] === firstCell) return true;
      if (r.points.at(-1)![2] === lastCell) return true;
      return false;
    });

    if (candidateRoutes.length) {
      const distanceUnit = useOptionsState.getState().distanceUnit || "km";
      const options = candidateRoutes.map((r: Route) => {
        r.name = r.name || GenerationPipeline.Routes.generateName(r);
        r.length = r.length || GenerationPipeline.Routes.getLength(r.i);
        const length = `${rn(r.length * worldContext.distanceScale)} ${distanceUnit}`;
        return { id: r.i, name: r.name!, length };
      });

      routeJoinDialogStore.getState().open({
        options,
        onJoin: (selectedRouteId: number) => {
          const selectedRoute = worldContext.pack.routes.find((r: Route) => r.i === selectedRouteId)!;
          let joinedPoints: [number, number, number][] | null = null;

          if (route.points.at(-1)![2] === selectedRoute.points.at(0)![2]) {
            joinedPoints = [...route.points, ...selectedRoute.points.slice(1)];
          } else if (route.points.at(0)![2] === selectedRoute.points.at(-1)![2]) {
            joinedPoints = [...selectedRoute.points, ...route.points.slice(1)];
          } else if (route.points.at(0)![2] === selectedRoute.points.at(0)![2]) {
            joinedPoints = [...[...route.points].reverse(), ...selectedRoute.points.slice(1)];
          } else if (route.points.at(-1)![2] === selectedRoute.points.at(-1)![2]) {
            joinedPoints = [...route.points, ...[...selectedRoute.points].reverse().slice(1)];
          }

          if (!joinedPoints || !replaceRoutePoints({ routeId: route.i, points: joinedPoints })) return;

          if (!removeRouteCommand({ routeId: selectedRoute.i })) return;
          removeRoute(viewContext, selectedRoute.i);
          drawControlPoints(route.points);
          redrawRoute(route);
          drawRouteCells(route.points);
          updateRouteData(route);

          tip("GenerationPipeline.Routes joined", false, "success", 5000);
        }
      });
    } else {
      tip("No routes to join with. Route must start or end at current route's start or end cell", false, "error", 4000);
    }
  },

  showRouteElevationProfile(): void {
    const route = getRoute();
    const length = rn(route.length! * worldContext.distanceScale);
    // Use window.ElevationProfile if it's imported that way in original, wait it might be a global
    // Fallback: we can just call any function that does it. Let's see if ElevationProfile is globally available.
    // In original it just called `ElevationProfile.open(...)`.
    openElevationProfile(
      route.points.map(p => p[2]),
      length,
      false
    );
  },

  editRouteLegend(): void {
    const rid = elSelected!.attr("id");
    const route = getRoute();
    editNotes(rid, route.name!);
  },

  toggleLockButton(): void {
    const route = getRoute();
    const lock = !route.lock;
    if (patchRoute({ routeId: route.i, lock })) setRoutesEditorState({ isLocked: lock });
  },

  removeRoute(): void {
    confirmationDialog({
      title: "Remove route",
      message: "Are you sure you want to remove the route? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        const route = getRoute();
        if (!removeRouteCommand({ routeId: route.i })) return;
        removeRoute(viewContext, route.i);
        routesEditorActions.closeRouteEditor();
      }
    });
  },

  // Creator actions
  changeCreatorGroup(group: string): void {
    setRoutesEditorState({ creatorGroup: group });
    setTimeout(drawRoutePreview, 0);
  },

  removeCreatorPoint(pointString: string): void {
    _createRoutePoints = _createRoutePoints.filter(p => `${p.x}-${p.y}-${p.cellId}` !== pointString);
    setRoutesEditorState({ creatorPoints: [..._createRoutePoints] });
    drawRoutePreview();
  },

  completeCreation(): void {
    const pts = _createRoutePoints.map(p => [p.x, p.y, p.cellId] as [number, number, number]);
    if (pts.length < 2) {
      tip("Add at least 2 points", false, "error");
      return;
    }

    const routeId = GenerationPipeline.Routes.getNextId();
    const group = getRoutesEditorState().creatorGroup;
    const feature = worldContext.pack.cells.f[pts[0][2]];
    const route: Route = { points: pts, group, feature, i: routeId };
    if (!createRouteCommand({ route })) return;

    view.routes.select("#routeTemp").attr("id", `route${routeId}`);

    // Auto switch to edit mode
    routesEditorActions.closeRouteCreator();
    editRoute(`route${routeId}`);
  },

  closeRouteCreator(): void {
    setRoutesEditorState({ isCreatorOpen: false });
    view.debug.select("#controlCells").remove();
    view.debug.select("#controlPoints").remove();
    view.routes.select("#routeTemp").remove();

    EditorBus.restoreDefaultEvents();
    clearMainTip();

    if (routeCreatorCellsForced && layerIsOn("toggleCells")) toggleCells();
    routeCreatorCellsForced = false;
  }
};
