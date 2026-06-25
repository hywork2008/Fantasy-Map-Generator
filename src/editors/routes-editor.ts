import type * as d3 from "d3";
import { drag, pointer, select } from "d3";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { confirmationDialog, restoreDefaultEvents, unselect } from "../controllers/editors";
import { openElevationProfile } from "../controllers/elevation-profile";
import { interactionManager } from "../controllers/interactionManager";
import { toggleCells, toggleRoutes } from "../controllers/layers";
import { editStyle } from "../controllers/style";
import { Routes } from "../modules/routes-generator";
import { dialogStore } from "../store/dialogState";
import { elSelected, modules, setElSelected } from "../store/editorState";
import { getRoutesEditorState, setRoutesEditorState } from "../store/routesEditorState";
import type { Route } from "../types/models";
import { closeDialog, closeDialogs, openRichDialog } from "../ui/dialogs/dialogService";
import { findCell, getSegmentId, rn } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { ERROR } from "../utils/debug";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, fitContent, tip } from "../utils/uiHelpers";
import { editNotes } from "./notes-editor";
import { editRouteGroups } from "./route-group-editor";

let worldContext: WorldContext;

let _rcRoute: Route | null = null;
let _rcInitCell = 0;
let _rcPointIndex = 0;
let _isSplitMode = false;
let _createRoutePoints: { x: number; y: number; cellId: number }[] = [];

export function initRoutesEditor(wc: WorldContext) {
  worldContext = wc;
}

export function editRoute(id: string): void {
  if (viewContext.customization) return;
  if (elSelected && id === elSelected.attr("id")) return;
  closeDialogs(".stable");

  if (!layerIsOn("toggleRoutes")) toggleRoutes();
  document.getElementById("toggleCells")!.dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  setElSelected(select<SVGPathElement, unknown>(`#${id}`).on("click", addControlPoint) as unknown as typeof elSelected);

  tip(
    "Drag control points to change the route. Click on point to remove it. Click on the route to add additional control point. For major changes please create a new route instead",
    true
  );
  viewContext.debug.append("g").attr("id", "controlCells");
  viewContext.debug.append("g").attr("id", "controlPoints");

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
  route.name = route.name || Routes.generateName(route);
  route.length = route.length || Routes.getLength(route.i);

  const allGroups = Array.from(viewContext.routes.selectAll<SVGGElement, unknown>("g").nodes()).map(n => n.id);
  const distanceUnitInput = document.getElementById("distanceUnitInput") as HTMLInputElement | null;
  const lengthStr = `${rn(route.length * worldContext.distanceScale)} ${distanceUnitInput?.value || "km"}`;

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
  route.length = Routes.getLength(route.i);
  const distanceUnitInput = document.getElementById("distanceUnitInput") as HTMLInputElement | null;
  const lengthStr = `${rn(route.length * worldContext.distanceScale)} ${distanceUnitInput?.value || "km"}`;
  setRoutesEditorState({ routeLength: lengthStr });
}

function drawControlPoints(pts: [number, number, number][]): void {
  viewContext.debug
    .select("#controlPoints")
    .selectAll<SVGCircleElement, [number, number, number]>("circle")
    .data(pts)
    .join<SVGCircleElement>("circle")
    .attr("cx", d => d[0])
    .attr("cy", d => d[1])
    .attr("r", 0.6)
    .call(
      drag<SVGCircleElement, [number, number, number]>()
        .on("start", dragControlPointStart)
        .on("drag", dragControlPointDrag)
        .on("end", dragControlPointEnd)
    )
    .on("click", handleControlPointClick);
}

function drawRouteCells(pts: [number, number, number][]): void {
  viewContext.debug
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
  event: d3.D3DragEvent<SVGCircleElement, [number, number, number], [number, number, number]>
): void {
  _rcRoute = getRoute();
  _rcInitCell = event.subject[2] as number;
  _rcPointIndex = _rcRoute.points.indexOf(event.subject);
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

  _rcRoute.points[_rcPointIndex] = [x, y, cellId];
  select(this).datum(_rcRoute.points[_rcPointIndex]);
  redrawRoute(_rcRoute);
  drawRouteCells(_rcRoute.points);
}

function dragControlPointEnd(
  event: d3.D3DragEvent<SVGCircleElement, [number, number, number], [number, number, number]>
): void {
  if (!_rcRoute) return;
  const movedToCell = findCell(event.x, event.y);

  if (movedToCell !== _rcInitCell) {
    const prev = _rcRoute.points[_rcPointIndex - 1];
    if (prev) {
      removeConnection(_rcInitCell, prev[2]);
      addConnection(movedToCell, prev[2], _rcRoute.i);
    }

    const next = _rcRoute.points[_rcPointIndex + 1];
    if (next) {
      removeConnection(_rcInitCell, next[2]);
      addConnection(movedToCell, next[2], _rcRoute.i);
    }
  }
}

function redrawRoute(route: Route): void {
  elSelected!.attr("d", Routes.getPath(route));
  updateRouteLength(route);
  if (dialogStore.getState().openDialogs.has("elevationProfile")) routesEditorActions.showRouteElevationProfile();
}

function addControlPoint(this: SVGPathElement, event: MouseEvent): void {
  const route = getRoute();
  const [x, y] = pointer(event, this);
  const cellId = findCell(x, y);

  const point: [number, number, number] = [rn(x, 2), rn(y, 2), cellId];
  const isNewCell = !route.points.some(p => p[2] === cellId);

  const index = getSegmentId(route.points as unknown as [number, number][], point as unknown as [number, number], 2);
  route.points.splice(index, 0, point);

  if (isNewCell) {
    const prev = route.points[index - 1];
    const next = route.points[index + 1];

    if (!prev) ERROR && console.error("Can't add control point to the start of the route");
    if (!next) ERROR && console.error("Can't add control point to the end of the route");
    if (!prev || !next) return;

    removeConnection(prev[2], next[2]);
    addConnection(prev[2], cellId, route.i);
    addConnection(cellId, next[2], route.i);

    drawRouteCells(route.points);
  }

  drawControlPoints(route.points);
  redrawRoute(route);
}

function handleControlPointClick(this: SVGCircleElement, _event: MouseEvent): void {
  const controlPoint = select(this);
  const pt = controlPoint.datum() as [number, number, number];
  const route = getRoute();
  if (route.points.length < 3) return;

  const index = route.points.indexOf(pt);

  if (_isSplitMode) {
    splitRoute();
  } else {
    removeControlPoint(controlPoint);
  }

  function splitRoute(): void {
    const oldRoutePoints = route.points.slice(0, index + 1);
    const newRoutePoints = route.points.slice(index);

    route.points = oldRoutePoints;
    drawControlPoints(route.points);
    drawRouteCells(route.points);
    redrawRoute(route);

    const newRoute: Route = {
      i: Routes.getNextId(),
      group: route.group,
      feature: route.feature,
      name: route.name,
      points: newRoutePoints
    };
    worldContext.pack.routes.push(newRoute);

    for (let i = 0; i < newRoute.points.length; i++) {
      const cellId = newRoute.points[i][2];
      const nextPoint = newRoute.points[i + 1];
      if (nextPoint) addConnection(cellId, nextPoint[2], newRoute.i);
    }

    viewContext.routes
      .select(`#${newRoute.group}`)
      .append("path")
      .attr("d", Routes.getPath(newRoute))
      .attr("id", `route${newRoute.i}`);

    _isSplitMode = false;
  }

  function removeControlPoint(cp: d3.Selection<SVGCircleElement, unknown, null, undefined>): void {
    const isOnlyPointInCell = route.points.filter(p => p[2] === pt[2]).length === 1;
    if (isOnlyPointInCell) {
      const prev = route.points[index - 1];
      const next = route.points[index + 1];
      if (prev) removeConnection(prev[2], pt[2]);
      if (next) removeConnection(pt[2], next[2]);
      if (prev && next) addConnection(prev[2], next[2], route.i);
    }

    cp.remove();
    route.points = route.points.filter(p => p !== pt);

    drawRouteCells(route.points);
    redrawRoute(route);
  }
}

function removeConnection(from: number, to: number): void {
  const routeMap = worldContext.pack.cells.routes;
  if (routeMap[from]) delete routeMap[from][to];
  if (routeMap[to]) delete routeMap[to][from];
}

function addConnection(from: number, to: number, routeId: number): void {
  const routeMap = worldContext.pack.cells.routes;

  if (!routeMap[from]) routeMap[from] = {};
  routeMap[from][to] = routeId;

  if (!routeMap[to]) routeMap[to] = {};
  routeMap[to][from] = routeId;
}

export function createRoute(defaultGroup?: string): void {
  if (viewContext.customization) return;
  closeDialogs();
  if (!layerIsOn("toggleRoutes")) toggleRoutes();

  document.getElementById("toggleCells")!.dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  tip("Click to add route point, click again to remove", true);
  viewContext.debug.append("g").attr("id", "controlCells");
  viewContext.debug.append("g").attr("id", "controlPoints");
  viewContext.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(onCreatorClick);

  _createRoutePoints = [];
  const allGroups = Array.from(viewContext.routes.selectAll<SVGGElement, unknown>("g").nodes()).map(n => n.id);

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

  viewContext.debug
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

  viewContext.debug
    .select("#controlPoints")
    .selectAll("circle")
    .data(pts)
    .join("circle")
    .attr("cx", d => d[0])
    .attr("cy", d => d[1])
    .attr("r", 0.6);

  const group = getRoutesEditorState().creatorGroup;

  viewContext.routes.select("#routeTemp").remove();
  viewContext.routes
    .select(`#${group}`)
    .append("path")
    .attr("d", Routes.getPath({ group, points: pts, i: -1, feature: 0 } as Route))
    .attr("id", "routeTemp");
}

export const routesEditorActions = {
  closeRouteEditor(): void {
    setRoutesEditorState({ isOpen: false });
    viewContext.debug.select("#controlPoints").remove();
    viewContext.debug.select("#controlCells").remove();

    elSelected?.on("click", null);
    unselect();
    clearMainTip();

    const toggleCellsEl = document.getElementById("toggleCells")!;
    const forced = +toggleCellsEl.dataset.forced!;
    toggleCellsEl.dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  },

  changeName(name: string): void {
    getRoute().name = name;
    setRoutesEditorState({ routeName: name });
  },

  generateName(): void {
    const route = getRoute();
    const name = Routes.generateName(route);
    route.name = name;
    setRoutesEditorState({ routeName: name });
  },

  changeGroup(group: string): void {
    document.getElementById(group)!.appendChild(elSelected!.node()!);
    getRoute().group = group;
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
    _isSplitMode = !_isSplitMode;
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
      const distanceUnitInput = document.getElementById("distanceUnitInput") as HTMLInputElement | null;
      const options = candidateRoutes.map((r: Route) => {
        r.name = r.name || Routes.generateName(r);
        r.length = r.length || Routes.getLength(r.i);
        const length = `${rn(r.length * worldContext.distanceScale)} ${distanceUnitInput?.value || "km"}`;
        return `<option value="${r.i}">${r.name} (${length})</option>`;
      });
      alertMessage.innerHTML = /* html */ `<div>Route to join with:
        <select>${options.join("")}</select>
      </div>`;

      openRichDialog({
        content: alertMessage.innerHTML,
        title: "Join routes",
        width: fitContent(),
        position: { my: "left top", at: "left+10 top+150", of: "#map" },
        buttons: {
          Cancel: () => {
            closeDialog("alert");
          },
          Join: () => {
            const selectedRouteId = +(alertMessage.querySelector("select") as HTMLSelectElement).value;
            const selectedRoute = worldContext.pack.routes.find((r: Route) => r.i === selectedRouteId)!;

            if (route.points.at(-1)![2] === selectedRoute.points.at(0)![2]) {
              route.points = [...route.points, ...selectedRoute.points.slice(1)];
            } else if (route.points.at(0)![2] === selectedRoute.points.at(-1)![2]) {
              route.points = [...selectedRoute.points, ...route.points.slice(1)];
            } else if (route.points.at(0)![2] === selectedRoute.points.at(0)![2]) {
              route.points = [...route.points.reverse(), ...selectedRoute.points.slice(1)];
            } else if (route.points.at(-1)![2] === selectedRoute.points.at(-1)![2]) {
              route.points = [...route.points, ...selectedRoute.points.reverse().slice(1)];
            }

            for (let i = 0; i < route.points.length; i++) {
              const pt = route.points[i];
              const nextPoint = route.points[i + 1];
              if (nextPoint) addConnection(pt[2], nextPoint[2], route.i);
            }

            Routes.remove(selectedRoute);
            drawControlPoints(route.points);
            redrawRoute(route);
            drawRouteCells(route.points);
            updateRouteData(route);

            tip("Routes joined", false, "success", 5000);
            closeDialog("alert");
          }
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
    route.lock = !route.lock;
    setRoutesEditorState({ isLocked: !!route.lock });
  },

  removeRoute(): void {
    confirmationDialog({
      title: "Remove route",
      message: "Are you sure you want to remove the route? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        Routes.remove(getRoute());
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

    const routeId = Routes.getNextId();
    const group = getRoutesEditorState().creatorGroup;
    const feature = worldContext.pack.cells.f[pts[0][2]];
    const route: Route = { points: pts, group, feature, i: routeId };
    worldContext.pack.routes.push(route);

    const links = worldContext.pack.cells.routes;
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const nextPoint = pts[i + 1];

      if (nextPoint) {
        const cellId = pt[2];
        const nextId = nextPoint[2];

        if (!links[cellId]) links[cellId] = {};
        links[cellId][nextId] = routeId;

        if (!links[nextId]) links[nextId] = {};
        links[nextId][cellId] = routeId;
      }
    }

    viewContext.routes.select("#routeTemp").attr("id", `route${routeId}`);

    // Auto switch to edit mode
    routesEditorActions.closeRouteCreator();
    editRoute(`route${routeId}`);
  },

  closeRouteCreator(): void {
    setRoutesEditorState({ isCreatorOpen: false });
    viewContext.debug.select("#controlCells").remove();
    viewContext.debug.select("#controlPoints").remove();
    viewContext.routes.select("#routeTemp").remove();

    restoreDefaultEvents?.();
    clearMainTip();

    const toggleCellsEl = document.getElementById("toggleCells")!;
    const forced = +toggleCellsEl.dataset.forced!;
    toggleCellsEl.dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
};
