import type * as d3 from "d3";
import { drag, pointer, select } from "d3";
import { Routes } from "../modules";
import type { Route } from "../modules/routes-generator";
import { ensureEl, getPackPolygon, getSegmentId, rn } from "../utils";
import { closeDialogs, confirmationDialog, fitContent, restoreDefaultEvents, unselect } from "./editors";
import { ElevationProfile } from "./elevation-profile";
import { layerIsOn, toggleCells, toggleRoutes } from "./layers";
import { editNotes } from "./notes-editor";
import { editRouteGroups } from "./route-group-editor";
import { editStyle } from "./style";

// ─── routes-editor ──────────────────────────────────────────────────────────

export function editRoute(id: string): void {
  if (customization) return;
  if (elSelected && id === elSelected.attr("id")) return;
  closeDialogs(".stable");

  if (!layerIsOn("toggleRoutes")) toggleRoutes();
  ensureEl("toggleCells").dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  elSelected = select(`#${id}`).on("click", addControlPoint as any) as any;

  tip(
    "Drag control points to change the route. Click on point to remove it. Click on the route to add additional control point. For major changes please create a new route instead",
    true
  );
  debug.append("g").attr("id", "controlCells");
  debug.append("g").attr("id", "controlPoints");

  {
    const route = getRoute();
    updateRouteData(route);
    drawControlPoints(route.points);
    drawRouteCells(route.points);
    updateLockIcon();
  }

  $("#routeEditor").dialog({
    title: "Edit Route",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    close: closeRouteEditor
  });

  if (modules.editRoute) return;
  modules.editRoute = true;

  // add listeners
  ensureEl("routeCreateSelectingCells").on("click", showCreationDialog);
  ensureEl("routeSplit").on("click", togglePressed);
  ensureEl("routeJoin").on("click", openJoinRoutesDialog);
  ensureEl("routeElevationProfile").on("click", showRouteElevationProfile);
  ensureEl("routeLegend").on("click", editRouteLegend);
  ensureEl("routeLock").on("click", toggleLockButton);
  ensureEl("routeRemove").on("click", removeRoute);
  ensureEl("routeName").on("input", changeName);
  ensureEl("routeGroup").on("input", changeGroup);
  ensureEl("routeGroupEdit").on("click", editRouteGroups);
  ensureEl("routeEditStyle").on("click", editRouteGroupStyle);
  ensureEl("routeGenerateName").on("click", generateName);

  function getRoute(): Route {
    const routeId = +elSelected!.attr("id").slice(5);
    return pack.routes.find((route: Route) => route.i === routeId)!;
  }

  function updateRouteData(route: Route): void {
    route.name = route.name || Routes.generateName(route);
    (ensureEl("routeName") as HTMLInputElement).value = route.name;

    const routeGroup = ensureEl<HTMLSelectElement>("routeGroup");
    routeGroup.options.length = 0;
    routes.selectAll<SVGGElement, unknown>("g").each(function (this: SVGGElement) {
      routeGroup.options.add(new Option(this.id, this.id, false, this.id === route.group));
    });

    updateRouteLength(route);

    const isWater = route.points.some(([, , cellId]) => pack.cells.h[cellId] < 20);
    ensureEl("routeElevationProfile").style.display = isWater ? "none" : "inline-block";
  }

  function updateRouteLength(route: Route): void {
    route.length = Routes.getLength(route.i);
    ensureEl("routeLength").textContent = `${rn(route.length * distanceScale)} ${distanceUnitInput.value}`;
  }

  function drawControlPoints(pts: [number, number, number][]): void {
    debug
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
    debug
      .select("#controlCells")
      .selectAll("polygon")
      .data(pts)
      .join("polygon")
      .attr("points", (p: [number, number, number]) => getPackPolygon(p[2], pack!) as unknown as string);
  }

  let _rcRoute: Route | null = null;
  let _rcInitCell = 0;
  let _rcPointIndex = 0;

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
    if ((ensureEl("elevationProfile") as HTMLElement).offsetParent) showRouteElevationProfile();
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
    const isSplitMode = ensureEl("routeSplit").classList.contains("pressed");
    if (isSplitMode) {
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
      pack.routes.push(newRoute);

      for (let i = 0; i < newRoute.points.length; i++) {
        const cellId = newRoute.points[i][2];
        const nextPoint = newRoute.points[i + 1];
        if (nextPoint) addConnection(cellId, nextPoint[2], newRoute.i);
      }

      routes
        .select(`#${newRoute.group}`)
        .append("path")
        .attr("d", Routes.getPath(newRoute))
        .attr("id", `route${newRoute.i}`);

      ensureEl("routeSplit").classList.remove("pressed");
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

  function openJoinRoutesDialog(): void {
    const route = getRoute();
    const firstCell = route.points.at(0)![2];
    const lastCell = route.points.at(-1)![2];

    const candidateRoutes = pack.routes.filter((r: Route) => {
      if (r.i === route.i) return false;
      if (r.group !== route.group) return false;
      if (r.points.at(0)![2] === lastCell) return true;
      if (r.points.at(-1)![2] === firstCell) return true;
      if (r.points.at(0)![2] === firstCell) return true;
      if (r.points.at(-1)![2] === lastCell) return true;
      return false;
    });

    if (candidateRoutes.length) {
      const options = candidateRoutes.map((r: Route) => {
        r.name = r.name || Routes.generateName(r);
        r.length = r.length || Routes.getLength(r.i);
        const length = `${rn(r.length * distanceScale)} ${distanceUnitInput.value}`;
        return `<option value="${r.i}">${r.name} (${length})</option>`;
      });
      alertMessage.innerHTML = /* html */ `<div>Route to join with:
        <select>${options.join("")}</select>
      </div>`;

      $("#alert").dialog({
        title: "Join routes",
        width: fitContent(),
        position: { my: "left top", at: "left+10 top+150", of: "#map" },
        buttons: {
          Cancel: () => {
            $("#alert").dialog("close");
          },
          Join: () => {
            const selectedRouteId = +(alertMessage.querySelector("select") as HTMLSelectElement).value;
            const selectedRoute = pack.routes.find((r: Route) => r.i === selectedRouteId)!;
            joinRoutes(route, selectedRoute);
            tip("Routes joined", false, "success", 5000);
            $("#alert").dialog("close");
          }
        }
      });
    } else {
      tip("No routes to join with. Route must start or end at current route's start or end cell", false, "error", 4000);
    }
  }

  function joinRoutes(route: Route, joinedRoute: Route): void {
    if (route.points.at(-1)![2] === joinedRoute.points.at(0)![2]) {
      route.points = [...route.points, ...joinedRoute.points.slice(1)];
    } else if (route.points.at(0)![2] === joinedRoute.points.at(-1)![2]) {
      route.points = [...joinedRoute.points, ...route.points.slice(1)];
    } else if (route.points.at(0)![2] === joinedRoute.points.at(0)![2]) {
      route.points = [...route.points.reverse(), ...joinedRoute.points.slice(1)];
    } else if (route.points.at(-1)![2] === joinedRoute.points.at(-1)![2]) {
      route.points = [...route.points, ...joinedRoute.points.reverse().slice(1)];
    }

    for (let i = 0; i < route.points.length; i++) {
      const pt = route.points[i];
      const nextPoint = route.points[i + 1];
      if (nextPoint) addConnection(pt[2], nextPoint[2], route.i);
    }

    Routes.remove(joinedRoute);
    drawControlPoints(route.points);
    redrawRoute(route);
    drawRouteCells(route.points);
  }

  function showCreationDialog(): void {
    const route = getRoute();
    createRoute(route.group);
  }

  function togglePressed(this: HTMLElement): void {
    this.classList.toggle("pressed");
  }

  function removeConnection(from: number, to: number): void {
    const routeMap = pack.cells.routes;
    if (routeMap[from]) delete routeMap[from][to];
    if (routeMap[to]) delete routeMap[to][from];
  }

  function addConnection(from: number, to: number, routeId: number): void {
    const routeMap = pack.cells.routes;

    if (!routeMap[from]) routeMap[from] = {};
    routeMap[from][to] = routeId;

    if (!routeMap[to]) routeMap[to] = {};
    routeMap[to][from] = routeId;
  }

  function changeName(this: HTMLInputElement): void {
    getRoute().name = this.value;
  }

  function changeGroup(this: HTMLInputElement): void {
    const group = this.value;
    ensureEl(group).appendChild(elSelected!.node()!);
    getRoute().group = group;
  }

  function generateName(): void {
    const route = getRoute();
    route.name = (ensureEl("routeName") as HTMLInputElement).value = Routes.generateName(route);
  }

  function showRouteElevationProfile(): void {
    const route = getRoute();
    const length = rn(route.length! * distanceScale);
    ElevationProfile.open(
      route.points.map(p => p[2]),
      length,
      false
    );
  }

  function editRouteLegend(): void {
    const rid = elSelected!.attr("id");
    const route = getRoute();
    editNotes(rid, route.name!);
  }

  function editRouteGroupStyle(): void {
    const { group } = getRoute();
    editStyle("routes", group);
  }

  function toggleLockButton(): void {
    const route = getRoute();
    route.lock = !route.lock;
    updateLockIcon();
  }

  function updateLockIcon(): void {
    const route = getRoute();
    if (route.lock) {
      ensureEl("routeLock").classList.remove("icon-lock-open");
      ensureEl("routeLock").classList.add("icon-lock");
    } else {
      ensureEl("routeLock").classList.remove("icon-lock");
      ensureEl("routeLock").classList.add("icon-lock-open");
    }
  }

  function removeRoute(): void {
    confirmationDialog({
      title: "Remove route",
      message: "Are you sure you want to remove the route? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        Routes.remove(getRoute());
        $("#routeEditor").dialog("close");
      }
    });
  }

  function closeRouteEditor(): void {
    debug.select("#controlPoints").remove();
    debug.select("#controlCells").remove();

    elSelected!.on("click", null);
    unselect();
    clearMainTip();

    const forced = +ensureEl("toggleCells").dataset.forced!;
    ensureEl("toggleCells").dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
}

// ─── routes-creator ──────────────────────────────────────────────────────────

let _createRoutePoints: [number, number, number][] = [];

export function createRoute(defaultGroup?: string): void {
  if (customization) return;
  closeDialogs();
  if (!layerIsOn("toggleRoutes")) toggleRoutes();

  ensureEl("toggleCells").dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  tip("Click to add route point, click again to remove", true);
  debug.append("g").attr("id", "controlCells");
  debug.append("g").attr("id", "controlPoints");
  viewbox.style("cursor", "crosshair").on("click", onClick);

  _createRoutePoints = [];
  const body = ensureEl("routeCreatorBody");

  ensureEl<HTMLSelectElement>("routeCreatorGroupSelect").innerHTML = Array.from(
    routes.selectAll<SVGGElement, unknown>("g").nodes()
  )
    .map(el => {
      const selected = defaultGroup || "roads";
      return `<option value="${el.id}" ${el.id === selected ? "selected" : ""}>${el.id}</option>`;
    })
    .join("");

  $("#routeCreator").dialog({
    title: "Create Route",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    close: closeRouteCreator
  });

  if (modules.createRoute) return;
  modules.createRoute = true;

  // add listeners
  ensureEl("routeCreatorGroupSelect").on("change", () => drawRoutePreview(_createRoutePoints));
  ensureEl("routeCreatorGroupEdit").on("click", editRouteGroups);
  ensureEl("routeCreatorComplete").on("click", completeCreation);
  ensureEl("routeCreatorCancel").on("click", () => $("#routeCreator").dialog("close"));
  body.on("click", (ev: Event) => {
    if ((ev.target as HTMLElement).classList.contains("icon-trash-empty"))
      removePoint((ev.target as HTMLElement).parentElement!.dataset.point!);
  });

  function onClick(event: MouseEvent): void {
    const [x, y] = pointer(event);
    const cellId = findCell(x, y);
    const point: [number, number, number] = [rn(x, 2), rn(y, 2), cellId];
    _createRoutePoints.push(point);

    drawRoutePreview(_createRoutePoints);

    body.innerHTML += `<div class="editorLine" style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 1em;" data-point="${point.join(
      "-"
    )}">
      <span><b>Cell</b>: ${cellId}</span>
      <span><b>X</b>: ${point[0]}</span>
      <span><b>Y</b>: ${point[1]}</span>
      <span data-tip="Remove the point" class="icon-trash-empty pointer"></span>
    </div>`;
  }

  function removePoint(pointString: string): void {
    _createRoutePoints = _createRoutePoints.filter(p => p.join("-") !== pointString);
    drawRoutePreview(_createRoutePoints);
    body.querySelector(`[data-point='${pointString}']`)?.remove();
  }

  function drawRoutePreview(pts: [number, number, number][]): void {
    debug
      .select("#controlCells")
      .selectAll("polygon")
      .data(pts)
      .join("polygon")
      .attr("points", (p: [number, number, number]) => getPackPolygon(p[2], pack!) as unknown as string)
      .attr("class", "current");

    debug
      .select("#controlPoints")
      .selectAll("circle")
      .data(pts)
      .join("circle")
      .attr("cx", d => d[0])
      .attr("cy", d => d[1])
      .attr("r", 0.6);

    const group = ensureEl<HTMLSelectElement>("routeCreatorGroupSelect").value;

    routes.select("#routeTemp").remove();
    routes
      .select(`#${group}`)
      .append("path")
      .attr("d", Routes.getPath({ group, points: pts, i: -1, feature: 0 } as Route))
      .attr("id", "routeTemp");
  }

  function completeCreation(): void {
    const pts = _createRoutePoints;
    if (pts.length < 2) {
      tip("Add at least 2 points", false, "error");
      return;
    }

    const routeId = Routes.getNextId();
    const group = ensureEl<HTMLSelectElement>("routeCreatorGroupSelect").value;
    const feature = pack.cells.f[pts[0][2]];
    const route: Route = { points: pts, group, feature, i: routeId };
    pack.routes.push(route);

    const links = pack.cells.routes;
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

    routes.select("#routeTemp").attr("id", `route${routeId}`);
    editRoute(`route${routeId}`);
  }

  function closeRouteCreator(): void {
    body.innerHTML = "";
    debug.select("#controlCells").remove();
    debug.select("#controlPoints").remove();
    routes.select("#routeTemp").remove();

    restoreDefaultEvents?.();
    clearMainTip();

    const forced = +ensureEl("toggleCells").dataset.forced!;
    ensureEl("toggleCells").dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
}
