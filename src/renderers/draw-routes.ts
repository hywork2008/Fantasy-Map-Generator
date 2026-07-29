import type { AppServices } from "../context/appServices";
import type { FocusFields, InfrastructureLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Routes } from "../generators/routes-generator";
import type { Route } from "../types/models";
import { TIME } from "../utils/debug";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const RoutesRenderer: IRenderer = {
  id: "routes",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<InfrastructureLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    TIME && console.time("drawRoutes");
    const { pack } = worldContext;
    const { routes, focusScope } = viewContext;
    const routePaths: Record<string, string[]> = {};

    for (const route of pack.routes) {
      const { i, group, points, cells } = route;
      if (!points || points.length < 2) continue;
      if (focusScope && !(cells ?? []).some(c => isCellInScope(focusScope, c))) continue;
      if (!routePaths[group]) routePaths[group] = [];
      routePaths[group].push(`<path id="route${i}" d="${Routes.getPath(route, pack)}"/>`);
    }

    routes.attr("fill", "none").selectAll("path").remove();
    for (const group in routePaths) {
      routes.select<SVGGElement>(`#${group}`).html(routePaths[group].join(""));
    }

    TIME && console.timeEnd("drawRoutes");
  },

  clear(viewContext: Readonly<InfrastructureLayers>): void {
    viewContext.routes.selectAll("path").remove();
  }
};

export const drawRoute = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<InfrastructureLayers>,
  _appServices: AppServices,
  route: Route
): void => {
  const { routes } = viewContext;
  routes
    .select(`#${route.group}`)
    .append("path")
    .attr("d", Routes.getPath(route, worldContext.pack))
    .attr("id", `route${route.i}`);
};

export const removeRoute = (viewContext: Readonly<InfrastructureLayers>, routeId: number): void => {
  viewContext.routes.select(`#route${routeId}`).remove();
};
