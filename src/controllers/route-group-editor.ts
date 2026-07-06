import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";

import { removeRoute } from "../renderers/draw-routes";
import { GenerationPipeline } from "../services/generationPipeline";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import { useRouteGroupsEditorStore } from "../store/routeGroupsEditorStore";
import { openDialog, openPrompt } from "../ui/dialogs/dialogService";
import { confirmationDialog } from "../utils/editorHelpers";
import { getElementById, layerIsOn } from "../utils/nodeUtils";
import { toggleRoutes } from "./layers";

export function refreshRouteGroups(): void {
  const groups = view.routes
    .selectAll<SVGGElement, unknown>("g")
    .nodes()
    .map(el => ({
      id: el.id,
      count: el.children.length
    }));
  useRouteGroupsEditorStore.getState().setGroups(groups);
}

export function editRouteGroups(): void {
  if (view.customization) return;
  if (!layerIsOn("toggleRoutes")) toggleRoutes();

  refreshRouteGroups();

  openDialog("routeGroupsEditor", {
    title: "Edit Route groups",
    resizable: false,
    position: { my: "left top", at: "left+10 top+140", of: "#map" },
    onClose: () => {
      modules.editRouteGroups = false;
    }
  });
}

export const DEFAULT_ROUTE_GROUPS = ["roads", "trails", "searoutes"];

export function routeGroupsAddGroup(): void {
  openPrompt({
    message: "Type group name",
    default: "route-group-new",
    onConfirm: value => {
      let group = String(value)
        .toLowerCase()
        .replace(/ /g, "_")
        .replace(/[^\w\s]/gi, "");

      if (!group) return tip("Invalid group name", false, "error");
      if (!group.startsWith("route-")) group = `route-${group}`;
      if (getElementById(group))
        return tip("Element with this name already exists. Provide a unique name", false, "error");
      if (Number.isFinite(+group.charAt(0))) return tip("Group name should start with a letter", false, "error");

      view.routes
        .append("g")
        .attr("id", group)
        .attr("stroke", "#000000")
        .attr("stroke-width", 0.5)
        .attr("stroke-dasharray", "1 0.5")
        .attr("stroke-linecap", "butt");

      const routeGroupEl = getElementById<HTMLSelectElement>("routeGroup");
      if (routeGroupEl) routeGroupEl.options.add(new Option(group, group));

      const routeCreatorGroupSelectEl = getElementById<HTMLSelectElement>("routeCreatorGroupSelect");
      if (routeCreatorGroupSelectEl) routeCreatorGroupSelectEl.options.add(new Option(group, group));

      refreshRouteGroups();
    }
  });
}

export function routeGroupsRemoveGroup(group: string): void {
  confirmationDialog({
    title: "Remove route group",
    message:
      "Are you sure you want to remove the entire route group? All routes in this group will be removed.<br>This action can't be reverted",
    confirm: "Remove",
    onConfirm: () => {
      worldContext.pack.routes
        .filter(r => r.group === group)
        .forEach(route => {
          GenerationPipeline.Routes.remove(route);
          removeRoute(viewContext, route.i);
        });
      if (!DEFAULT_ROUTE_GROUPS.includes(group)) view.routes.select(`#${group}`).remove();
      refreshRouteGroups();
    }
  });
}
