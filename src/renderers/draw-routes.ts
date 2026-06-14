import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Route } from "../modules/routes-generator";
import { Routes } from "../modules/routes-generator";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const RoutesRenderer: IRenderer = {
  id: "routes",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("drawRoutes");
    const { pack } = worldContext;
    const { routes } = viewContext;
    const routePaths: Record<string, string[]> = {};

    for (const route of pack.routes) {
      const { i, group, points } = route;
      if (!points || points.length < 2) continue;
      if (!routePaths[group]) routePaths[group] = [];
      routePaths[group].push(`<path id="route${i}" d="${Routes.getPath(route)}"/>`);
    }

    routes.attr("fill", "none").selectAll("path").remove();
    for (const group in routePaths) {
      routes.select<SVGGElement>(`#${group}`).html(routePaths[group].join(""));
    }

    TIME && console.timeEnd("drawRoutes");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    viewContext.routes.selectAll("path").remove();
  }
};

export const drawRoute = (
  _worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  _appServices: AppServices,
  route: Route
): void => {
  const { routes } = viewContext;
  routes.select(`#${route.group}`).append("path").attr("d", Routes.getPath(route)).attr("id", `route${route.i}`);
};
