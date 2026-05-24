"use strict";
import { Routes } from "@fmg/core/modules/routes-generator";
import { closeDialogs, fitContent, unselect, confirmationDialog } from "./editors";
import { clearMainTip, tip } from "./general";
import { drawRoutes, layerIsOn, toggleCells, toggleRoutes } from "./layers";
import { editNotes } from "./notes-editor";
import { editRouteGroups } from "./route-group-editor";
import { editStyle } from "./style";

// File-local declarations for legacy globals
declare let customization: boolean;
declare let ensureEl: (id: string) => HTMLElement;
declare let routes: any;
declare let pack: any;
declare let updateRouteLength: (route: any) => any;
declare let refreshAllEditors: () => any;
declare let routeName: HTMLElement;
declare let routeGroup: HTMLElement;
declare let routesHeader: HTMLElement;
declare let routesFooterNumber: HTMLElement;
declare let routesFooterLength: HTMLElement;
declare let regimentsFilter: HTMLElement;
declare let regimentsHeader: HTMLElement;
declare let regimentAdd: HTMLElement;
declare let Military: any;
declare let unselectElements: () => any;
declare let viewbox: any;

class RoutesEditor {
  public open(id: string) {
    if (customization) return;
    if (elSelected && id === elSelected.attr("id")) return;
    closeDialogs(".stable");

    if (!layerIsOn("toggleRoutes")) toggleRoutes();
    ensureEl("toggleCells").dataset.forced = String(+!layerIsOn("toggleCells"));
    if (!layerIsOn("toggleCells")) toggleCells();

    elSelected = d3.select("#" + id).on("click", function (this: SVGPathElement) {
      routesEditorSelf.addControlPoint(this);
    });

    tip(
      "Drag control points to change the route. Click on point to remove it. Click on the route to add additional control point. For major changes please create a new route instead",
      true
    );
    debug.append("g").attr("id", "controlCells");
    debug.append("g").attr("id", "controlPoints");

    {
      const route = this.getRoute();
      this.updateRouteData(route);
      this.drawControlPoints(route.points);
      this.drawCells(route.points);
      this.updateLockIcon();
    }

    $("#routeEditor").dialog({
      title: "Edit Route",
      resizable: false,
      position: {my: "left top", at: "left+10 top+10", of: "#map"},
      close: () => this.closeRouteEditor()
    });

    if (modules.editRoute) return;
    modules.editRoute = true;

    ensureEl("routeCreateSelectingCells").on("click", () => this.showCreationDialog());
    ensureEl("routeSplit").on("click", () => this.toggleSplitMode());
    ensureEl("routeJoin").on("click", () => this.openJoinRoutesDialog());
    ensureEl("routeElevationProfile").on("click", () => this.showRouteElevationProfile());
    ensureEl("routeLegend").on("click", () => this.editRouteLegend());
    ensureEl("routeLock").on("click", () => this.toggleLockButton());
    ensureEl("routeRemove").on("click", () => this.removeRoute());
    ensureEl("routeName").on("input", () => this.changeName());
    ensureEl("routeGroup").on("input", () => this.changeGroup());
    ensureEl("routeGroupEdit").on("click", editRouteGroups);
    ensureEl("routeEditStyle").on("click", () => this.editRouteGroupStyle());
    ensureEl("routeGenerateName").on("click", () => this.generateName());
  }

  private getRoute(): any {
    const routeId = +elSelected.attr("id").slice(5);
    return pack.routes.find((route: any) => route.i === routeId);
  }

  private updateRouteData(route: any) {
    route.name = route.name || Routes.generateName(route);
    (ensureEl("routeName") as HTMLInputElement).value = route.name;

    const routeGroupEl = ensureEl("routeGroup") as HTMLSelectElement;
    routeGroupEl.options.length = 0;
    routes.selectAll("g").each(function (this: SVGGElement) {
      routeGroupEl.options.add(new Option(this.id, this.id, false, this.id === route.group));
    });

    this.updateRouteLength(route);

    const isWater = route.points.some(([x, y, cellId]: [number, number, number]) => pack.cells.h[cellId] < 20);
    (ensureEl("routeElevationProfile") as HTMLElement).style.display = isWater ? "none" : "inline-block";
  }

  private updateRouteLength(route: any) {
    route.length = Routes.getLength(route.i);
    (ensureEl("routeLength") as HTMLInputElement).value =
      rn(route.length * distanceScale) + " " + distanceUnitInput.value;
  }

  private drawControlPoints(points: any[]) {
    const self = this;
    debug
      .select("#controlPoints")
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (d: any) => d[0])
      .attr("cy", (d: any) => d[1])
      .attr("r", 0.6)
      .call(d3.drag().on("start", () => self.dragControlPoint()))
      .on("click", function (this: SVGCircleElement) {
        routesEditorSelf.handleControlPointClick(this);
      });
  }

  private drawCells(points: any[]) {
    debug
      .select("#controlCells")
      .selectAll("polygon")
      .data(points)
      .join("polygon")
      .attr("points", (p: any) => getPackPolygon(p[2]));
  }

  private dragControlPoint() {
    const route = this.getRoute();
    const initCell = d3.event.subject[2];
    const pointIndex = route.points.indexOf(d3.event.subject);

    d3.event.on("drag", function (this: SVGCircleElement) {
      this.setAttribute("cx", String(d3.event.x));
      this.setAttribute("cy", String(d3.event.y));

      const x = rn(d3.event.x, 2);
      const y = rn(d3.event.y, 2);
      const cellId = findCell(x, y);

      (this as any).__data__ = route.points[pointIndex] = [x, y, cellId];
      routesEditorSelf.redrawRoute(route);
      routesEditorSelf.drawCells(route.points);
    });

    d3.event.on("end", () => {
      const movedToCell = findCell(d3.event.x, d3.event.y);

      if (movedToCell !== initCell) {
        const prev = route.points[pointIndex - 1];
        if (prev) {
          this.removeConnection(initCell, prev[2]);
          this.addConnection(movedToCell, prev[2], route.i);
        }

        const next = route.points[pointIndex + 1];
        if (next) {
          this.removeConnection(initCell, next[2]);
          this.addConnection(movedToCell, next[2], route.i);
        }
      }
    });
  }

  public redrawRoute(route: any) {
    elSelected.attr("d", Routes.getPath(route));
    this.updateRouteLength(route);
    if ((ensureEl("elevationProfile") as HTMLElement).offsetParent) this.showRouteElevationProfile();
  }

  public addControlPoint(element: SVGPathElement) {
    const route = this.getRoute();
    const [x, y] = d3.mouse(element);
    const cellId = findCell(x, y);

    const point = [rn(x, 2), rn(y, 2), cellId];
    const isNewCell = !route.points.some((p: any) => p[2] === cellId);

    const index = getSegmentId(route.points, point, 2);
    route.points.splice(index, 0, point);

    if (isNewCell) {
      const prev = route.points[index - 1];
      const next = route.points[index + 1];

      if (!prev) ERROR && console.error("Can't add control point to the start of the route");
      if (!next) ERROR && console.error("Can't add control point to the end of the route");
      if (!prev || !next) return;

      this.removeConnection(prev[2], next[2]);
      this.addConnection(prev[2], cellId, route.i);
      this.addConnection(cellId, next[2], route.i);

      this.drawCells(route.points);
    }

    this.drawControlPoints(route.points);
    this.redrawRoute(route);
  }

  public handleControlPointClick(element: SVGCircleElement) {
    const controlPoint = d3.select(element);
    const point = controlPoint.datum() as any;
    const route = this.getRoute();
    if (route.points.length < 3) return;

    const index = route.points.indexOf(point);
    const isSplitMode = ensureEl("routeSplit").classList.contains("pressed");

    if (isSplitMode) {
      this.splitRoute(route, index, point);
    } else {
      this.removeControlPoint(controlPoint, route, point, index);
    }
  }

  private splitRoute(route: any, index: number, _point: any) {
    const oldRoutePoints = route.points.slice(0, index + 1);
    const newRoutePoints = route.points.slice(index);

    route.points = oldRoutePoints;
    this.drawControlPoints(route.points);
    this.drawCells(route.points);
    this.redrawRoute(route);

    const newRoute = {
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
      if (nextPoint) this.addConnection(cellId, nextPoint[2], newRoute.i);
    }

    routes
      .select("#" + newRoute.group)
      .append("path")
      .attr("d", Routes.getPath(newRoute))
      .attr("id", "route" + newRoute.i);

    ensureEl("routeSplit").classList.remove("pressed");
  }

  private removeControlPoint(controlPoint: any, route: any, point: any, index: number) {
    const isOnlyPointInCell = route.points.filter((p: any) => p[2] === point[2]).length === 1;
    if (isOnlyPointInCell) {
      const prev = route.points[index - 1];
      const next = route.points[index + 1];
      if (prev) this.removeConnection(prev[2], point[2]);
      if (next) this.removeConnection(point[2], next[2]);
      if (prev && next) this.addConnection(prev[2], next[2], route.i);
    }

    controlPoint.remove();
    route.points = route.points.filter((p: any) => p !== point);

    this.drawCells(route.points);
    this.redrawRoute(route);
  }

  private openJoinRoutesDialog() {
    const route = this.getRoute();
    const firstCell = route.points.at(0)[2];
    const lastCell = route.points.at(-1)[2];

    const candidateRoutes = pack.routes.filter((r: any) => {
      if (r.i === route.i) return false;
      if (r.group !== route.group) return false;
      if (r.points.at(0)[2] === lastCell) return true;
      if (r.points.at(-1)[2] === firstCell) return true;
      if (r.points.at(0)[2] === firstCell) return true;
      if (r.points.at(-1)[2] === lastCell) return true;
      return false;
    });

    if (candidateRoutes.length) {
      const options = candidateRoutes.map((r: any) => {
        r.name = r.name || Routes.generateName(r);
        r.length = r.length || Routes.getLength(r.i);
        const length = rn(r.length * distanceScale) + " " + distanceUnitInput.value;
        return `<option value="${r.i}">${r.name} (${length})</option>`;
      });
      alertMessage.innerHTML = /* html */ `<div>Route to join with:
        <select>${options.join("")}</select>
      </div>`;

      $("#alert").dialog({
        title: "Join routes",
        width: fitContent(),
        position: {my: "left top", at: "left+10 top+150", of: "#map"},
        buttons: {
          Cancel: () => {
            $("#alert").dialog("close");
          },
          Join: () => {
            const selectedRouteId = +(alertMessage.querySelector("select") as HTMLSelectElement).value;
            const selectedRoute = pack.routes.find((r: any) => r.i === selectedRouteId);
            this.joinRoutes(route, selectedRoute);
            tip("Routes joined", false, "success", 5000);
            $("#alert").dialog("close");
          }
        }
      });
    } else {
      tip("No routes to join with. Route must start or end at current route's start or end cell", false, "error", 4000);
    }
  }

  private joinRoutes(route: any, joinedRoute: any) {
    if (route.points.at(-1)[2] === joinedRoute.points.at(0)[2]) {
      route.points = [...route.points, ...joinedRoute.points.slice(1)];
    } else if (route.points.at(0)[2] === joinedRoute.points.at(-1)[2]) {
      route.points = [...joinedRoute.points, ...route.points.slice(1)];
    } else if (route.points.at(0)[2] === joinedRoute.points.at(0)[2]) {
      route.points = [...route.points.reverse(), ...joinedRoute.points.slice(1)];
    } else if (route.points.at(-1)[2] === joinedRoute.points.at(-1)[2]) {
      route.points = [...route.points, ...joinedRoute.points.reverse().slice(1)];
    }

    for (let i = 0; i < route.points.length; i++) {
      const point = route.points[i];
      const nextPoint = route.points[i + 1];
      if (nextPoint) this.addConnection(point[2], nextPoint[2], route.i);
    }

    Routes.remove(joinedRoute);
    this.drawControlPoints(route.points);
    this.redrawRoute(route);
    this.drawCells(route.points);
  }

  private showCreationDialog() {
    const route = this.getRoute();
    createRoute(route.group);
  }

  private toggleSplitMode() {
    (ensureEl("routeSplit") as HTMLElement).classList.toggle("pressed");
  }

  private removeConnection(from: number, to: number) {
    const cellRoutes = pack.cells.routes;
    if (cellRoutes[from]) delete cellRoutes[from][to];
    if (cellRoutes[to]) delete cellRoutes[to][from];
  }

  private addConnection(from: number, to: number, routeId: number) {
    const cellRoutes = pack.cells.routes;
    if (!cellRoutes[from]) cellRoutes[from] = {};
    cellRoutes[from][to] = routeId;
    if (!cellRoutes[to]) cellRoutes[to] = {};
    cellRoutes[to][from] = routeId;
  }

  private changeName() {
    this.getRoute().name = (ensureEl("routeName") as HTMLInputElement).value;
  }

  private changeGroup() {
    const group = (ensureEl("routeGroup") as HTMLSelectElement).value;
    ensureEl(group).appendChild(elSelected.node());
    this.getRoute().group = group;
  }

  private generateName() {
    const route = this.getRoute();
    route.name = (ensureEl("routeName") as HTMLInputElement).value = Routes.generateName(route);
  }

  private showRouteElevationProfile() {
    const route = this.getRoute();
    const length = rn(route.length * distanceScale);
    ElevationProfile.open(
      route.points.map((p: any) => p[2]),
      length,
      false
    );
  }

  private editRouteLegend() {
    const id = elSelected.attr("id");
    const route = this.getRoute();
    editNotes(id, route.name);
  }

  private editRouteGroupStyle() {
    const {group} = this.getRoute();
    editStyle("routes", group);
  }

  private toggleLockButton() {
    const route = this.getRoute();
    route.lock = !route.lock;
    this.updateLockIcon();
  }

  private updateLockIcon() {
    const route = this.getRoute();
    if (route.lock) {
      ensureEl("routeLock").classList.remove("icon-lock-open");
      ensureEl("routeLock").classList.add("icon-lock");
    } else {
      ensureEl("routeLock").classList.remove("icon-lock");
      ensureEl("routeLock").classList.add("icon-lock-open");
    }
  }

  private removeRoute() {
    confirmationDialog({
      title: "Remove route",
      message: "Are you sure you want to remove the route? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        Routes.remove(this.getRoute());
        $("#routeEditor").dialog("close");
      }
    });
  }

  private closeRouteEditor() {
    debug.select("#controlPoints").remove();
    debug.select("#controlCells").remove();

    elSelected.on("click", null);
    unselect();
    clearMainTip();

    const forced = +(ensureEl("toggleCells").dataset.forced ?? "0");
    (ensureEl("toggleCells") as HTMLElement).dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
}

const routesEditor = new RoutesEditor();
const routesEditorSelf = routesEditor;

export function editRoute(id: string) {
  routesEditor.open(id);
}
