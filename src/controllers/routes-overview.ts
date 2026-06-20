import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { createRoute, editRoute } from "../editors/routes-editor";
import { Routes } from "../modules/routes-generator";
import { modules } from "../store/editorState";
import { closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { ensureEl, rn } from "../utils";
import { applySorting, fitContent, tip } from "../utils/uiHelpers";
import { confirmationDialog, downloadFile, getFileName, highlightElement } from "./editors";
import { layerIsOn, toggleRoutes } from "./layers";

export function overviewRoutes(): void {
  if (viewContext.customization) return;
  closeDialogs("#routesOverview, .stable");
  if (!layerIsOn("toggleRoutes")) toggleRoutes();

  const body = ensureEl("routesBody");
  routesOverviewAddLines();
  openDialog("routesOverview");

  if (modules.overviewRoutes) return;
  modules.overviewRoutes = true;

  openDialog("routesOverview", {
    title: "Routes Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  ensureEl("routesOverviewRefresh").addEventListener("click", routesOverviewAddLines);
  ensureEl("routesCreateNew").addEventListener("click", () => createRoute());
  ensureEl("routesExport").addEventListener("click", downloadRoutesData);
  ensureEl("routesLockAll").addEventListener("click", toggleLockAll);
  ensureEl("routesRemoveAll").addEventListener("click", triggerAllRoutesRemove);
  ensureEl("routesSearch").addEventListener("input", routesOverviewAddLines);

  function routesOverviewAddLines(): void {
    body.innerHTML = "";
    let lines = "";

    let filteredRoutes = worldContext.pack.routes;

    const searchText = (ensureEl("routesSearch") as HTMLInputElement).value.toLowerCase().trim();
    if (searchText) {
      filteredRoutes = filteredRoutes.filter(route => {
        const name = (route.name || "").toLowerCase();
        const group = (route.group || "").toLowerCase();
        return name.includes(searchText) || group.includes(searchText);
      });
    }

    for (const route of filteredRoutes) {
      if (!route.points || route.points.length < 2) continue;
      route.name = route.name || Routes.generateName(route);
      route.length = route.length || Routes.getLength(route.i);
      const length = `${rn(route.length * worldContext.distanceScale)} ${distanceUnitInput.value}`;

      lines += /* html */ `<div
        class="states"
        data-id="${route.i}"
        data-name="${route.name}"
        data-group="${route.group}"
        data-length="${route.length}"
      >
        <span data-tip="Locate the route" class="icon-target"></span>
        <div data-tip="Route name" style="width: 15em; margin-left: 0.4em;">${route.name}</div>
        <div data-tip="Route group" style="width: 8em;">${route.group}</div>
        <div data-tip="Route length" style="width: 6em;">${length}</div>
        <span data-tip="Edit route" class="icon-pencil"></span>
        <span class="locks pointer ${
          route.lock ? "icon-lock" : "icon-lock-open inactive"
        }" onmouseover="showElementLockTip(event)"></span>
        <span data-tip="Remove route" class="icon-trash-empty"></span>
      </div>`;
    }
    body.insertAdjacentHTML("beforeend", lines);

    ensureEl("routesFooterNumber").innerHTML = `${filteredRoutes.length} of ${worldContext.pack.routes.length}`;
    const averageLength =
      rn(
        filteredRoutes.length
          ? filteredRoutes.map(r => r.length).reduce((a, b) => (a || 0) + (b || 0), 0)! / filteredRoutes.length
          : 0
      ) || 0;
    ensureEl("routesFooterLength").innerHTML =
      `${averageLength * worldContext.distanceScale} ${distanceUnitInput.value}`;

    for (const el of body.querySelectorAll("div.states")) el.addEventListener("mouseenter", routeHighlightOn);
    for (const el of body.querySelectorAll("div.states")) el.addEventListener("mouseleave", routeHighlightOff);
    for (const el of body.querySelectorAll("div > span.icon-target")) el.addEventListener("click", zoomToRoute);
    for (const el of body.querySelectorAll("div > span.icon-pencil")) el.addEventListener("click", openRouteEditor);
    for (const el of body.querySelectorAll("div > span.locks")) el.addEventListener("click", toggleLockStatus);
    for (const el of body.querySelectorAll("div > span.icon-trash-empty"))
      el.addEventListener("click", triggerRouteRemove);

    applySorting(ensureEl("routesHeader"));
  }

  function routeHighlightOn(this: HTMLElement): void {
    if (!layerIsOn("toggleRoutes")) toggleRoutes();
    const routeId = +this.dataset.id!;
    viewContext.routes
      .select(`#route${routeId}`)
      .attr("stroke", "red")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "none");
  }

  function routeHighlightOff(this: HTMLElement): void {
    const routeId = +this.dataset.id!;
    viewContext.routes
      .select(`#route${routeId}`)
      .attr("stroke", null)
      .attr("stroke-width", null)
      .attr("stroke-dasharray", null);
  }

  function zoomToRoute(this: HTMLElement): void {
    const routeId = +this.parentElement!.dataset.id!;
    const route = viewContext.routes.select(`#route${routeId}`).node() as Element;
    highlightElement(route, 3);
  }

  function downloadRoutesData(): void {
    let data = "Id,Route,Group,Length\n";

    body.querySelectorAll(":scope > div").forEach(el => {
      const d = (el as HTMLElement).dataset;
      const length = `${rn(+(d.length || 0) * worldContext.distanceScale)} ${distanceUnitInput.value}`;
      data += `${[d.id, d.name, d.group, length].join(",")}\n`;
    });

    const name = `${getFileName("Routes")}.csv`;
    downloadFile(data, name);
  }

  function openRouteEditor(this: HTMLElement): void {
    const routeId = `route${this.parentElement!.dataset.id!}`;
    editRoute(routeId);
  }

  function toggleLockStatus(this: HTMLElement): void {
    const routeId = +this.parentElement!.dataset.id!;
    const route = worldContext.pack.routes.find(route => route.i === routeId);
    if (!route) return;

    route.lock = !route.lock;
    if (this.classList.contains("icon-lock")) {
      this.classList.remove("icon-lock");
      this.classList.add("icon-lock-open");
      this.classList.add("inactive");
    } else {
      this.classList.remove("icon-lock-open");
      this.classList.add("icon-lock");
      this.classList.remove("inactive");
    }
  }

  function toggleLockAll(): void {
    const allLocked = worldContext.pack.routes.every(route => route.lock);

    worldContext.pack.routes.forEach(route => {
      route.lock = !allLocked;
    });

    routesOverviewAddLines();
    ensureEl("routesLockAll").className = allLocked ? "icon-lock" : "icon-lock-open";
  }

  function triggerRouteRemove(this: HTMLElement): void {
    const routeId = +this.parentElement!.dataset.id!;
    confirmationDialog({
      title: "Remove route",
      message: "Are you sure you want to remove the route? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        const route = worldContext.pack.routes.find(r => r.i === routeId);
        Routes.remove(route!);
        routesOverviewAddLines();
      }
    });
  }

  function triggerAllRoutesRemove(): void {
    const toRemove = worldContext.pack.routes.filter(route => !route.lock);
    if (!toRemove.length) {
      if (!worldContext.pack.routes.length) {
        tip("There are no routes to remove", false, "error");
      } else {
        tip("All routes are locked. Unlock routes to remove them, or use Lock all to unlock first.", false, "error");
      }
      return;
    }

    const lockedCount = worldContext.pack.routes.length - toRemove.length;
    openConfirm(
      lockedCount > 0
        ? /* html */ `Remove all <b>unlocked</b> routes (${toRemove.length})? <b>${lockedCount}</b> locked route(s) will be kept. This cannot be undone.`
        : /* html */ `Are you sure you want to remove all routes? This action can't be undone`,
      {
        title: lockedCount > 0 ? "Remove unlocked routes" : "Remove all routes",
        confirm: "Remove",
        onConfirm: () => {
          const routesToRemove = worldContext.pack.routes.filter(route => !route.lock);
          if (!routesToRemove.length) {
            if (!worldContext.pack.routes.length) {
              tip("There are no routes to remove", false, "error");
            } else {
              tip("All routes are now locked; nothing was removed.", false, "error");
            }
            return;
          }
          for (const route of routesToRemove) {
            Routes.remove(route);
          }
          worldContext.pack.cells.routes = Routes.buildLinks(worldContext.pack.routes);
          routesOverviewAddLines();
        }
      }
    );
  }
}
