"use strict";

import { Routes } from "@fmg/core/modules/routes-generator";
import type { FmgGlobalContext } from "@fmg/types";
import { getFmg } from "../runtime/get-fmg";
import { drawRoute, layerIsOn, toggleCells, toggleRoutes } from "./layers";
import { closeDialogs, restoreDefaultEvents } from "./editors";
import { clearMainTip, tip } from "./general";


type RoutePoint = [number, number, number];

type D3Chain = {
  attr: (name: string, value: unknown) => D3Chain;
  remove: () => void;
  append: (tag: string) => D3Chain;
};

type RoutesCreatorRuntime = {
  customization: number;
  modules: { createRoute?: boolean };
  pack: {
    cells: { f: ArrayLike<number>; routes: Record<number, Record<number, number>> };
    routes: Array<{ points: RoutePoint[]; group: string; feature: number; i: number }>;
  };
  routes: {
    selectAll: (selector: string) => { nodes: () => Array<{ id: string }> };
    select: (selector: string) => D3Chain;
  };
  debug: {
    append: (tag: string) => D3Chain;
    select: (selector: string) => {
      selectAll: (tag: string) => {
        data: (data: RoutePoint[]) => {
          join: (tagName: string) => D3Chain;
        };
      };
      remove: () => void;
    };
  };
  viewbox: { style: (name: string, value: string) => { on: (event: string, handler: (this: SVGElement) => void) => unknown } };
  d3: { mouse: (el: SVGElement) => [number, number] };
  $: (selector: string) => { dialog: (optionsOrAction: unknown) => unknown };
  ensureEl: (id: string) => HTMLElement;
  rn: (value: number, digits?: number) => number;
  findCell: (x: number, y: number) => number;
  getPackPolygon: (cellId: number) => string;
  closeDialogs: () => void;
  layerIsOn: (id: string) => boolean;
  toggleRoutes: () => void;
  toggleCells: () => void;
  tip: (message: string, autoHide?: boolean, type?: string) => void;
  editRouteGroups: () => void;
  editRoute: (routeId: string) => void;
  restoreDefaultEvents: () => void;
  createRoute?: (defaultGroup?: string) => void;
};

type RoutesCreatorFmgContext = FmgGlobalContext & { createRoute?: (defaultGroup?: string) => void };

const routesCreatorWindow = window as Window & { [key: string]: any; fmg?: RoutesCreatorFmgContext };
const asRuntime = <T>(runtimeWindow: Window & { [key: string]: any }) => runtimeWindow as T;
const routesCreatorRuntime = asRuntime<RoutesCreatorRuntime>(routesCreatorWindow);

class RouteCreator {
  private points: RoutePoint[] = [];

  public open(defaultGroup?: string) {
    const creator = this;

    if (routesCreatorRuntime.customization) return;
    closeDialogs();
    if (!layerIsOn("toggleRoutes")) toggleRoutes();

    const toggleCellsButton = routesCreatorRuntime.ensureEl("toggleCells") as HTMLElement;
    toggleCellsButton.dataset.forced = String(+!layerIsOn("toggleCells"));
    if (!layerIsOn("toggleCells")) toggleCells();

    tip("Click to add route point, click again to remove", true);
    routesCreatorRuntime.debug.append("g").attr("id", "controlCells");
    routesCreatorRuntime.debug.append("g").attr("id", "controlPoints");
    routesCreatorRuntime.viewbox.style("cursor", "crosshair").on("click", onClick);

    creator.points = [];
    const body = routesCreatorRuntime.ensureEl("routeCreatorBody") as HTMLElement;

    const groupSelect = routesCreatorRuntime.ensureEl("routeCreatorGroupSelect") as HTMLSelectElement;
    groupSelect.innerHTML = (routesCreatorRuntime.routes.selectAll("g").nodes() as Array<{id: string}>)
      .map(el => {
        const selected = defaultGroup || "roads";
        return `<option value="${el.id}" ${el.id === selected ? "selected" : ""}>${el.id}</option>`;
      })
      .join("");

    routesCreatorRuntime.$("#routeCreator").dialog({
      title: "Create Route",
      resizable: false,
      position: {my: "left top", at: "left+10 top+10", of: "#map"},
      close: closeRouteCreator
    });

    if (routesCreatorRuntime.modules.createRoute) return;
    routesCreatorRuntime.modules.createRoute = true;

    groupSelect.addEventListener("change", () => drawRoute(creator.points));
    routesCreatorRuntime.ensureEl("routeCreatorGroupEdit").addEventListener("click", routesCreatorRuntime.editRouteGroups);
    routesCreatorRuntime.ensureEl("routeCreatorComplete").addEventListener("click", completeCreation);
    routesCreatorRuntime
      .ensureEl("routeCreatorCancel")
      .addEventListener("click", () => routesCreatorRuntime.$("#routeCreator").dialog("close"));
    body.addEventListener("click", ev => {
      const target = ev.target as HTMLElement;
      if (target.classList.contains("icon-trash-empty")) {
        removePoint(target.parentElement?.dataset.point || "");
      }
    });

    function onClick(this: SVGElement) {
      const [x, y] = routesCreatorRuntime.d3.mouse(this);
      const cellId = routesCreatorRuntime.findCell(x, y);
      const point: RoutePoint = [routesCreatorRuntime.rn(x, 2), routesCreatorRuntime.rn(y, 2), cellId];
      creator.points.push(point);

      drawRoute(creator.points);

      body.innerHTML += `<div class="editorLine" style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 1em;" data-point="${point.join(
        "-"
      )}">
      <span><b>Cell</b>: ${cellId}</span>
      <span><b>X</b>: ${point[0]}</span>
      <span><b>Y</b>: ${point[1]}</span>
      <span data-tip="Remove the point" class="icon-trash-empty pointer"></span>
    </div>`;
    }

    function removePoint(pointString: string) {
      creator.points = creator.points.filter(p => p.join("-") !== pointString);
      drawRoute(creator.points);
      body.querySelector(`[data-point='${pointString}']`)?.remove();
    }

    function drawRoute(points: RoutePoint[]) {
      routesCreatorRuntime.debug
        .select("#controlCells")
        .selectAll("polygon")
        .data(points)
        .join("polygon")
        .attr("points", (p: RoutePoint) => routesCreatorRuntime.getPackPolygon(p[2]))
        .attr("class", "current");

      routesCreatorRuntime.debug
        .select("#controlPoints")
        .selectAll("circle")
        .data(points)
        .join("circle")
        .attr("cx", (d: RoutePoint) => d[0])
        .attr("cy", (d: RoutePoint) => d[1])
        .attr("r", 0.6);

      const group = (routesCreatorRuntime.ensureEl("routeCreatorGroupSelect") as HTMLSelectElement).value;

      routesCreatorRuntime.routes.select("#routeTemp").remove();
      routesCreatorRuntime.routes
        .select("#" + group)
        .append("path")
        .attr("d", Routes.getPath({group, points}))
        .attr("id", "routeTemp");
    }

    function completeCreation() {
      const points = creator.points;
      if (points.length < 2) return routesCreatorRuntime.tip("Add at least 2 points", false, "error");

      const routeId = Routes.getNextId();
      const group = (routesCreatorRuntime.ensureEl("routeCreatorGroupSelect") as HTMLSelectElement).value;
      const feature = routesCreatorRuntime.pack.cells.f[points[0][2]];
      const route = {points, group, feature, i: routeId};
      routesCreatorRuntime.pack.routes.push(route);

      const links = routesCreatorRuntime.pack.cells.routes;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const nextPoint = points[i + 1];

        if (nextPoint) {
          const cellId = point[2];
          const nextId = nextPoint[2];

          if (!links[cellId]) links[cellId] = {};
          links[cellId][nextId] = routeId;

          if (!links[nextId]) links[nextId] = {};
          links[nextId][cellId] = routeId;
        }
      }

      routesCreatorRuntime.routes.select("#routeTemp").attr("id", "route" + routeId);
      routesCreatorRuntime.editRoute("route" + routeId);
    }

    function closeRouteCreator() {
      body.innerHTML = "";
      routesCreatorRuntime.debug.select("#controlCells").remove();
      routesCreatorRuntime.debug.select("#controlPoints").remove();
      routesCreatorRuntime.routes.select("#routeTemp").remove();

      restoreDefaultEvents();
      clearMainTip();

      const forced = +toggleCellsButton.dataset.forced!;
      toggleCellsButton.dataset.forced = "0";
      if (forced && layerIsOn("toggleCells")) toggleCells();
    }
  }
}

const routeCreator = new RouteCreator();

function createRoute(defaultGroup?: string) {
  routeCreator.open(defaultGroup);
}

routesCreatorRuntime.createRoute = createRoute;
