import type React from "react";
import { useMemo } from "react";
import { worldContext } from "../../context/worldContext";
import { confirmationDialog, downloadFile, getFileName, highlightElement } from "../../controllers/editors";
import { toggleRoutes } from "../../controllers/layers";
import { createRoute, editRoute } from "../../controllers/routes-editor";
import { Routes } from "../../generators/routes-generator";
import { viewLayerService as view } from "../../services/viewLayerService";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { useRoutesOverviewState } from "../../store/routesOverviewState";
import { rn } from "../../utils";
import { layerIsOn } from "../../utils/nodeUtils";
import { tip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";

export const RoutesOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("routesOverview"));
  const { search, sortBy, sortOrder, refreshCounter, setSearch, toggleSortBy, refresh } = useRoutesOverviewState();
  const distanceUnit = useOptionsState(s => s.distanceUnit);

  const { filteredRoutes, averageLength } = useMemo(() => {
    void refreshCounter;
    let routes = worldContext.pack?.routes || [];

    const searchText = search.toLowerCase().trim();
    if (searchText) {
      routes = routes.filter(route => {
        const name = (route.name || "").toLowerCase();
        const group = (route.group || "").toLowerCase();
        return name.includes(searchText) || group.includes(searchText);
      });
    }

    // pre-calculate lengths and names
    routes.forEach(route => {
      route.name = route.name || Routes.generateName(route);
      route.length = route.length || Routes.getLength(route.i);
    });

    // sort
    routes = [...routes].sort((a, b) => {
      let valA: string | number = a[sortBy as keyof typeof a] as string | number;
      let valB: string | number = b[sortBy as keyof typeof b] as string | number;

      if (sortBy === "name" || sortBy === "group") {
        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();
      } else if (sortBy === "length") {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const averageLength =
      rn(routes.length > 0 ? routes.map(r => r.length || 0).reduce((a, b) => a + b, 0) / routes.length : 0) || 0;

    return { filteredRoutes: routes, averageLength };
  }, [search, sortBy, sortOrder, refreshCounter]);

  const handleCreateNew = () => createRoute();

  const handleExport = () => {
    let data = "Id,Route,Group,Length\n";
    filteredRoutes.forEach(route => {
      const length = `${rn((route.length || 0) * worldContext.distanceScale)} ${distanceUnit}`;
      data += `${[route.i, route.name, route.group, length].join(",")}\n`;
    });
    downloadFile(data, `${getFileName("Routes")}.csv`);
  };

  const handleLockAll = () => {
    const allLocked = worldContext.pack.routes.every(route => route.lock);
    worldContext.pack.routes.forEach(route => {
      route.lock = !allLocked;
    });
    refresh();
  };

  const handleRemoveAll = () => {
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
        ? `Remove all <b>unlocked</b> routes (${toRemove.length})? <b>${lockedCount}</b> locked route(s) will be kept. This cannot be undone.`
        : `Are you sure you want to remove all routes? This action can't be undone`,
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
          refresh();
        }
      }
    );
  };

  const routeHighlightOn = (routeId: number) => {
    if (!layerIsOn("toggleRoutes")) toggleRoutes();
    view.routes
      .select(`#route${routeId}`)
      .attr("stroke", "red")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "none");
  };

  const routeHighlightOff = (routeId: number) => {
    view.routes
      .select(`#route${routeId}`)
      .attr("stroke", null)
      .attr("stroke-width", null)
      .attr("stroke-dasharray", null);
  };

  const handleZoomToRoute = (routeId: number) => {
    const route = view.routes.select(`#route${routeId}`).node() as Element;
    highlightElement(route, 3);
  };

  const handleOpenEditor = (routeId: number) => {
    editRoute(`route${routeId}`);
  };

  const handleToggleLock = (routeId: number) => {
    const route = worldContext.pack.routes.find(r => r.i === routeId);
    if (route) {
      route.lock = !route.lock;
      refresh();
    }
  };

  const handleRemoveRoute = (routeId: number) => {
    confirmationDialog({
      title: "Remove route",
      message: "Are you sure you want to remove the route? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        const route = worldContext.pack.routes.find(r => r.i === routeId);
        if (route) {
          Routes.remove(route);
          refresh();
        }
      }
    });
  };

  const allLocked = worldContext.pack?.routes?.length > 0 && worldContext.pack.routes.every(r => r.lock);

  return (
    <Dialog
      isOpen={isOpen}
      title="Routes Overview"
      onClose={() => closeDialog("routesOverview")}
      className="fmg-dialog--overflow-hidden"
    >
      <div id="routesOverviewContainer">
        <div id="routesHeader" className="header" style={{ gridTemplateColumns: "17em 8em 8em" }}>
          <div
            data-tip="Click to sort by route name"
            className={`sortable alphabetically ${sortBy === "name" ? (sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down") : ""}`}
            onClick={() => toggleSortBy("name")}
          >
            Route&nbsp;
          </div>
          <div
            data-tip="Click to sort by route group"
            className={`sortable alphabetically ${sortBy === "group" ? (sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down") : ""}`}
            onClick={() => toggleSortBy("group")}
          >
            Group&nbsp;
          </div>
          <div
            data-tip="Click to sort by route length"
            className={`sortable ${sortBy === "length" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : "icon-sort-number-down"}`}
            onClick={() => toggleSortBy("length")}
          >
            Length&nbsp;
          </div>
        </div>
        <div id="routesBody" className="table">
          {filteredRoutes.map(route => {
            if (!route.points || route.points.length < 2) return null;
            const lengthStr = `${rn((route.length || 0) * worldContext.distanceScale)} ${distanceUnit}`;
            return (
              <div
                key={route.i}
                className="states"
                data-id={route.i}
                onMouseEnter={() => routeHighlightOn(route.i)}
                onMouseLeave={() => routeHighlightOff(route.i)}
              >
                <span data-tip="Locate the route" className="icon-target" onClick={() => handleZoomToRoute(route.i)} />
                <div data-tip="Route name" style={{ width: "15em", marginLeft: "0.4em" }}>
                  {route.name}
                </div>
                <div data-tip="Route group" style={{ width: "8em" }}>
                  {route.group}
                </div>
                <div data-tip="Route length" style={{ width: "6em" }}>
                  {lengthStr}
                </div>
                <span data-tip="Edit route" className="icon-pencil" onClick={() => handleOpenEditor(route.i)} />
                <span
                  className={`locks pointer ${route.lock ? "icon-lock" : "icon-lock-open inactive"}`}
                  data-tip="Toggle lock status"
                  onClick={() => handleToggleLock(route.i)}
                />
                <span data-tip="Remove route" className="icon-trash-empty" onClick={() => handleRemoveRoute(route.i)} />
              </div>
            );
          })}
        </div>
        <div id="routesTotal" className="totalLine">
          <div data-tip="Routes number" style={{ marginLeft: 4 }}>
            Routes:&nbsp;
            <span id="routesFooterNumber">{`${filteredRoutes.length} of ${worldContext.pack?.routes?.length || 0}`}</span>
          </div>
          <div data-tip="Average length" style={{ marginLeft: 12 }}>
            Average length:&nbsp;
            <span id="routesFooterLength">{`${averageLength * worldContext.distanceScale} ${distanceUnit}`}</span>
          </div>
        </div>
        <div id="routesFooter" className="fmg-dialog-footer">
          <button
            type="button"
            id="routesOverviewRefresh"
            data-tip="Refresh the Editor"
            className="icon-cw"
            onClick={refresh}
          />
          <button
            type="button"
            id="routesCreateNew"
            data-tip="Create a new route selecting route cells"
            className="icon-map-pin"
            onClick={handleCreateNew}
          />
          <button
            type="button"
            id="routesExport"
            data-tip="Save routes-related data as a text file (.csv)"
            className="icon-download"
            onClick={handleExport}
          />
          <button
            type="button"
            id="routesLockAll"
            data-tip="Lock or unlock all routes"
            className={allLocked ? "icon-lock" : "icon-lock-open"}
            onClick={handleLockAll}
          />
          <button
            type="button"
            id="routesRemoveAll"
            data-tip="Remove all unlocked routes (locked routes are kept)"
            className="icon-trash"
            onClick={handleRemoveAll}
          />
          <label htmlFor="routesSearch" data-tip="Filter by name or group" style={{ marginLeft: "0.2em" }}>
            Search: <input id="routesSearch" type="search" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
        </div>
      </div>
    </Dialog>
  );
};
