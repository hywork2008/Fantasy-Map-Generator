import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { confirmationDialog } from "../controllers/editors";
import { layerIsOn, toggleRoutes } from "../controllers/layers";
import { editStyle } from "../controllers/style";
import { Routes } from "../modules/routes-generator";
import { openDialog } from "../ui/dialogs/dialogService";
import { ensureEl, showPrompt } from "../utils";
import { tip } from "../utils/uiHelpers";

export function editRouteGroups(): void {
  if (viewContext.customization) return;
  if (!layerIsOn("toggleRoutes")) toggleRoutes();

  addLines();

  openDialog("routeGroupsEditor", {
    title: "Edit Route groups",
    resizable: false,
    position: { my: "left top", at: "left+10 top+140", of: "#map" }
  });

  if (modules.editRouteGroups) return;
  modules.editRouteGroups = true;

  ensureEl("routeGroupsEditorAdd").addEventListener("click", addGroup);
  ensureEl("routeGroupsEditorBody").addEventListener("click", (ev: Event) => {
    const group = (ev.target as Element).closest(".states")?.getAttribute("data-id");
    if (!group) return;
    if ((ev.target as Element).classList.contains("editStyle")) editStyle("routes", group);
    else if ((ev.target as Element).classList.contains("removeGroup")) removeGroup(group);
  });

  function addLines(): void {
    ensureEl("routeGroupsEditorBody").innerHTML = "";

    const lines = viewContext.routes
      .selectAll<SVGGElement, unknown>("g")
      .nodes()
      .map(el => {
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

  const DEFAULT_GROUPS = ["roads", "trails", "searoutes"];

  function addGroup(): void {
    showPrompt("Type group name", { default: "route-group-new" }, value => {
      let group = String(value)
        .toLowerCase()
        .replace(/ /g, "_")
        .replace(/[^\w\s]/gi, "");

      if (!group) return tip("Invalid group name", false, "error");
      if (!group.startsWith("route-")) group = `route-${group}`;
      if (document.getElementById(group))
        return tip("Element with this name already exists. Provide a unique name", false, "error");
      if (Number.isFinite(+group.charAt(0))) return tip("Group name should start with a letter", false, "error");

      viewContext.routes
        .append("g")
        .attr("id", group)
        .attr("stroke", "#000000")
        .attr("stroke-width", 0.5)
        .attr("stroke-dasharray", "1 0.5")
        .attr("stroke-linecap", "butt");
      routeGroup.options.add(new Option(group, group));
      addLines();

      routeCreatorGroupSelect.options.add(new Option(group, group));
    });
  }

  function removeGroup(group: string): void {
    confirmationDialog({
      title: "Remove route group",
      message:
        "Are you sure you want to remove the entire route group? All routes in this group will be removed.<br>This action can't be reverted",
      confirm: "Remove",
      onConfirm: () => {
        worldContext.pack.routes.filter(r => r.group === group).forEach(Routes.remove);
        if (!DEFAULT_GROUPS.includes(group)) viewContext.routes.select(`#${group}`).remove();
        addLines();
      }
    });
  }
}
