import type { AppServices } from "../context/appServices";
import type { FocusFields, InfrastructureLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Routes } from "../generators/routes-generator";
import { getWorldLandConnectionCurrent } from "../services/worldLandConnectionRuntime";
import { useOptionsState } from "../store/optionsState";
import type { Route } from "../types/models";
import { TIME } from "../utils/debug";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";
import { drawRegisteredLandRoutes } from "./draw-registered-land-routes";

function drawPhysicalRoutes(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<InfrastructureLayers & FocusFields>
): void {
  const { routes, focusScope } = viewContext;
  const { pack } = worldContext;
  routes.selectAll("[data-registered-land]").remove();
  const physical = getWorldLandConnectionCurrent(worldContext, useOptionsState.getState().distanceUnit);
  if (physical) {
    const owned = routes.select<SVGGElement>("#roads").append("g").attr("data-registered-land", "true").node();
    if (owned) {
      const connectionIds = pack.routes
        .filter(
          r =>
            r.registeredConnectionId !== undefined &&
            (!focusScope || (r.cells ?? []).some(c => isCellInScope(focusScope, c)))
        )
        .map(r => r.registeredConnectionId!);
      drawRegisteredLandRoutes(owned, physical.snapshot, physical.current, { ...physical.scene, connectionIds });
      for (const path of owned.querySelectorAll("path")) path.setAttribute("stroke", "inherit");
    }
  }
}

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
      if (
        route.registeredConnectionId !== undefined ||
        (worldContext.options.landConnectionGeneration && route.group !== "searoutes")
      )
        continue;
      const { i, group, points, cells } = route;
      if (!points || points.length < 2) continue;
      if (focusScope && !(cells ?? []).some(c => isCellInScope(focusScope, c))) continue;
      if (!routePaths[group]) routePaths[group] = [];
      const crossingKinds = [...new Set((route.riverCrossings ?? []).map(c => c.plan.kind))].join(", ");
      routePaths[group].push(
        `<path id="route${i}" d="${Routes.getPath(route, pack)}" data-crossings="${crossingKinds}">${crossingKinds ? `<title>River crossings: ${crossingKinds}</title>` : ""}</path>`
      );
    }

    routes.attr("fill", "none").selectAll("path").remove();
    for (const group in routePaths) {
      routes.select<SVGGElement>(`#${group}`).html(routePaths[group].join(""));
    }
    drawPhysicalRoutes(worldContext, viewContext);

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
  if (
    route.registeredConnectionId !== undefined ||
    (worldContext.options.landConnectionGeneration && route.group !== "searoutes")
  ) {
    drawPhysicalRoutes(worldContext, { ...viewContext, focusScope: null });
    return;
  }
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
