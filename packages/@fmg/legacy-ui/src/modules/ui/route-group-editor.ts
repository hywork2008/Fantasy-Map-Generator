import { confirmationDialog } from "./editors";
"use strict";
import { Routes } from "@fmg/core/modules/routes-generator";
import { layerIsOn, toggleRoutes } from "./layers";
import { editStyle } from "./style";
import { tip } from "./general";


type RouteGroupNode = HTMLElement & {id: string; children: HTMLCollection};

const DEFAULT_ROUTE_GROUPS = ["roads", "trails", "searoutes"];

class RouteGroupEditor {
  public open() {
    if (customization) return;
    if (!layerIsOn("toggleRoutes")) toggleRoutes();

    this.addLines();

    $("#routeGroupsEditor").dialog({
      title: "Edit Route groups",
      resizable: false,
      position: {my: "left top", at: "left+10 top+140", of: "#map"}
    });

    if (modules.editRouteGroups) return;
    modules.editRouteGroups = true;

    ensureEl("routeGroupsEditorAdd").addEventListener("click", () => this.addGroup());
    ensureEl("routeGroupsEditorBody").addEventListener("click", ev => {
      const target = ev.target as HTMLElement;
      const group = target.closest(".states")?.getAttribute("data-id") || "";
      if (target.classList.contains("editStyle")) editStyle("routes", group);
      else if (target.classList.contains("removeGroup")) this.removeGroup(group);
    });
  }

  private addLines() {
    ensureEl("routeGroupsEditorBody").innerHTML = "";

    const lines = (routes.selectAll("g").nodes() as RouteGroupNode[]).map(el => {
      const count = el.children.length;
      return /* html */ `<div data-id="${el.id}" class="states" style="display: flex; justify-content: space-between;">
          <span>${el.id} (${count})</span>
          <div style="width: auto; display: flex; gap: 0.4em;">
            <span data-tip="Edit style" class="editStyle icon-brush pointer" style="font-size: smaller;"></span>
            <span data-tip="Remove group" class="removeGroup icon-trash pointer"></span>
          </div>
        </div>`;
    });

    ensureEl("routeGroupsEditorBody").innerHTML = lines.join("");
  }

  private addGroup() {
    prompt("Type group name", {default: "route-group-new"}, (v: string) => {
      let group = v
        .toLowerCase()
        .replace(/ /g, "_")
        .replace(/[^\w\s]/gi, "");

      if (!group) return tip("Invalid group name", false, "error");
      if (!group.startsWith("route-")) group = "route-" + group;
      if (document.getElementById(group))
        return tip("Element with this name already exists. Provide a unique name", false, "error");
      if (Number.isFinite(+group.charAt(0))) return tip("Group name should start with a letter", false, "error");

      routes
        .append("g")
        .attr("id", group)
        .attr("stroke", "#000000")
        .attr("stroke-width", 0.5)
        .attr("stroke-dasharray", "1 0.5")
        .attr("stroke-linecap", "butt");
      ensureEl("routeGroup").options.add(new Option(group, group));
      this.addLines();

      ensureEl("routeCreatorGroupSelect").options.add(new Option(group, group));
    });
  }

  private removeGroup(group: string) {
    confirmationDialog({
      title: "Remove route group",
      message:
        "Are you sure you want to remove the entire route group? All routes in this group will be removed.<br>This action can't be reverted",
      confirm: "Remove",
      onConfirm: () => {
        const packData = pack as {routes: Array<{group: string}>};
        packData.routes.filter(r => r.group === group).forEach(Routes.remove);
        if (!DEFAULT_ROUTE_GROUPS.includes(group)) routes.select(`#${group}`).remove();
        this.addLines();
      }
    });
  }
}

const routeGroupEditor = new RouteGroupEditor();

export function editRouteGroups() {
  routeGroupEditor.open();
}
