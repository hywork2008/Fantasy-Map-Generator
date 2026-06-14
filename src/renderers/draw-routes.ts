import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import type { Route } from "../modules/routes-generator";
import { Routes } from "../modules/routes-generator";
import { TIME } from "../utils/debug";

export const drawRoutes = (): void => {
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
    routes.select(`#${group}`).html(routePaths[group].join(""));
  }

  TIME && console.timeEnd("drawRoutes");
};

export const drawRoute = (route: Route): void => {
  const { routes } = viewContext;
  routes.select(`#${route.group}`).append("path").attr("d", Routes.getPath(route)).attr("id", `route${route.i}`);
};
