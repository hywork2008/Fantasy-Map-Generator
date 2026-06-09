import type { Route } from "../modules/routes-generator";

declare global {
  var drawRoutes: () => void;
  var drawRoute: (route: Route) => void;
}

const routesRenderer = (): void => {
  TIME && console.time("drawRoutes");
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

const routeRenderer = (route: Route): void => {
  routes.select(`#${route.group}`).append("path").attr("d", Routes.getPath(route)).attr("id", `route${route.i}`);
};

window.drawRoutes = routesRenderer;
window.drawRoute = routeRenderer;
