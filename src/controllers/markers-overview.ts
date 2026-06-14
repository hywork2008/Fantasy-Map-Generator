import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Markers } from "../modules/markers-generator";
import { drawMarkers } from "../renderers";
import { openDialog } from "../ui/dialogs/dialogService";
import { ensureEl, getLatitude, getLongitude } from "../utils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

function overviewMarkers(): void {
  if (customization) return;
  closeDialogs("#markersOverview, .stable");
  if (!layerIsOn("toggleMarkers")) toggleMarkers();

  const markerGroup = ensureEl("markers");
  const body = ensureEl("markersBody");
  const markersInverPin = ensureEl("markersInverPin");
  const markersInverLock = ensureEl("markersInverLock");
  const markersFooterNumberEl = ensureEl("markersFooterNumber");
  const markersOverviewRefresh = ensureEl("markersOverviewRefresh");
  const markersAddFromOverview = ensureEl("markersAddFromOverview");
  const markersGenerationConfig = ensureEl("markersGenerationConfig");
  const markersRemoveAll = ensureEl("markersRemoveAll");
  const markersExport = ensureEl("markersExport");
  const markerTypeInput = ensureEl("addedMarkerType") as HTMLInputElement;
  const markerTypeSelector = ensureEl("markerTypeSelector");
  const markersSearch = ensureEl("markersSearch") as HTMLInputElement;

  addLines();

  openDialog("markersOverview", {
    title: "Markers Overview",
    resizable: false,
    width: fitContent(),
    close: close,
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  const listeners = [
    listen(body, "click", handleLineClick as EventListener),
    listen(markersInverPin, "click", invertPin as EventListener),
    listen(markersInverLock, "click", invertLock as EventListener),
    listen(markersOverviewRefresh, "click", addLines as EventListener),
    listen(markersAddFromOverview, "click", toggleAddMarkerMode as EventListener),
    listen(markersGenerationConfig, "click", configMarkersGeneration as EventListener),
    listen(markersRemoveAll, "click", triggerRemoveAll as EventListener),
    listen(markersExport, "click", exportMarkers as EventListener),
    listen(markerTypeSelector, "click", toggleMarkerTypeMenu as EventListener),
    listen(markersSearch, "input", addLines as EventListener)
  ];

  const types = [{ type: "empty", icon: "❓" }, ...Markers.getConfig()];
  const menu = document.getElementById("markerTypeSelectMenu");
  types.forEach(({ icon, type }) => {
    const option = document.createElement("button");
    option.textContent = `${icon} ${type}`;
    menu?.appendChild(option);

    listeners.push(
      listen(option, "click", () => {
        markerTypeSelector.textContent = icon;
        markerTypeInput.value = type;
        changeMarkerType();
        toggleMarkerTypeMenu();
      })
    );
  });

  function handleLineClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement;
    const i = +el.parentElement!.dataset.i!;

    if (el.classList.contains("icon-pencil")) {
      openEditor(i);
      return;
    }
    if (el.classList.contains("icon-target")) {
      highlightMarker(i);
      return;
    }
    if (el.classList.contains("icon-pin")) {
      pinMarker(el, i);
      return;
    }
    if (el.classList.contains("locks")) {
      toggleLockStatus(el, i);
      return;
    }
    if (el.classList.contains("icon-trash-empty")) {
      triggerRemove(i);
      return;
    }
  }

  function addLines(): void {
    let markers = pack.markers;

    const searchText = markersSearch.value.toLowerCase().trim();
    if (searchText) {
      markers = markers.filter(marker => {
        const type = (marker.type || "").toLowerCase();
        return type.includes(searchText);
      });
    }

    const lines = markers
      .map(({ i, type, icon, pinned, lock }) => {
        return /* html */ `
          <div class="states" data-i=${i} data-type="${type}">
            ${
              icon.startsWith("http") || icon.startsWith("data:image")
                ? `<img src="${icon}" data-tip="Marker icon" style="width:1.2em; height:1.2em; vertical-align: middle;">`
                : `<span data-tip="Marker icon" style="width:1.2em">${icon}</span>`
            }
            <div data-tip="Marker type" style="width:10em">${type}</div>
            <span style="padding-right:.1em" data-tip="Edit marker" class="icon-pencil"></span>
            <span style="padding-right:.1em" data-tip="Locate the marker" class="icon-target"></span>
            <span style="padding-right:.1em" data-tip="Pin marker (display only pinned markers)" class="icon-pin ${
              pinned ? "" : "inactive"
            }" pointer"></span>
            <span style="padding-right:.1em" class="locks pointer ${
              lock ? "icon-lock" : "icon-lock-open inactive"
            }" onmouseover="showElementLockTip(event)"></span>
            <span data-tip="Remove marker" class="icon-trash-empty"></span>
          </div>`;
      })
      .join("");

    body.innerHTML = lines;
    markersFooterNumberEl.innerText = String(markers.length);
    markersFooterTotal.innerText = String(pack.markers.length);

    applySorting(ensureEl("markersHeader"));
  }

  function invertPin(): void {
    let anyPinned = false;

    pack.markers.forEach(marker => {
      const pinned = !marker.pinned;
      if (pinned) {
        marker.pinned = true;
        anyPinned = true;
      } else delete marker.pinned;
    });

    markerGroup.setAttribute("pinned", anyPinned ? "1" : "");
    if (!anyPinned) markerGroup.removeAttribute("pinned");
    drawMarkers(worldContext, viewContext, appServices);
    addLines();
  }

  function invertLock(): void {
    pack.markers = pack.markers.map(marker => ({ ...marker, lock: !marker.lock }));
    addLines();
  }

  function openEditor(i: number): void {
    const marker = pack.markers.find(marker => marker.i === i);
    if (!marker) return;

    const x = marker.x ?? 0;
    const y = marker.y ?? 0;
    zoomTo(x, y, 8, 2000);
    editMarker(i);
  }

  function highlightMarker(i: number): void {
    const marker = document.getElementById(`marker${i}`);
    if (!marker) return;
    highlightElement(marker, 2);
  }

  function pinMarker(el: HTMLElement, i: number): void {
    const marker = pack.markers.find(marker => marker.i === i);
    if (!marker) return;
    if (marker.pinned) {
      delete marker.pinned;
      const anyPinned = pack.markers.some(marker => marker.pinned);
      if (!anyPinned) markerGroup.removeAttribute("pinned");
    } else {
      marker.pinned = true;
      markerGroup.setAttribute("pinned", "1");
    }
    el.classList.toggle("inactive");
    drawMarkers(worldContext, viewContext, appServices);
  }

  function toggleLockStatus(el: HTMLElement, i: number): void {
    const marker = pack.markers.find(marker => marker.i === i);
    if (!marker) return;
    if (marker.lock) {
      delete marker.lock;
      el.className = "locks pointer icon-lock-open inactive";
    } else {
      marker.lock = true;
      el.className = "locks pointer icon-lock";
    }
  }

  function triggerRemove(i: number): void {
    confirmationDialog({
      title: "Remove marker",
      message: "Are you sure you want to remove this marker? The action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => removeMarkerById(i)
    });
  }

  function toggleMarkerTypeMenu(): void {
    document.getElementById("markerTypeSelectMenu")?.classList.toggle("visible");
  }

  function toggleAddMarkerMode(): void {
    markersAddFromOverview.classList.toggle("pressed");
    addMarker.click();
  }

  function changeMarkerType(): void {
    if (!markersAddFromOverview.classList.contains("pressed")) {
      toggleAddMarkerMode();
    }
  }

  function removeMarkerById(i: number): void {
    notes = notes.filter(note => note.id !== `marker${i}`);
    pack.markers = pack.markers.filter(marker => marker.i !== i);
    document.getElementById(`marker${i}`)?.remove();
    addLines();
  }

  function triggerRemoveAll(): void {
    confirmationDialog({
      title: "Remove all markers",
      message: "Are you sure you want to remove all non-locked markers? The action cannot be reverted",
      confirm: "Remove all",
      onConfirm: removeAllMarkers
    });
  }

  function removeAllMarkers(): void {
    pack.markers = pack.markers.filter(({ i, lock }) => {
      if (lock) return true;

      const id = `marker${i}`;
      document.getElementById(id)?.remove();
      notes = notes.filter(note => note.id !== id);
      return false;
    });

    addLines();
  }

  function exportMarkers(): void {
    const headers = "Id,Type,Icon,Name,Note,X,Y,Latitude,Longitude\n";
    const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;

    const bodyLines = pack.markers.map(marker => {
      const { i, type, icon } = marker;
      const x = marker.x ?? 0;
      const y = marker.y ?? 0;

      const note = notes.find(note => note.id === `marker${i}`);
      const name = note ? quote(note.name) : "Unknown";
      const legend = note ? quote(note.legend) : "";

      const lat = getLatitude(y, 2);
      const lon = getLongitude(x, 2);

      return [i, type, icon, name, legend, x, y, lat, lon].join(",");
    });

    const data = headers + bodyLines.join("\n");
    const fileName = `${getFileName("Markers")}.csv`;
    downloadFile(data, fileName);
  }

  function close(): void {
    for (const removeListener of listeners) removeListener();

    addMarker.classList.remove("pressed");
    markerAdd.classList.remove("pressed");
    restoreDefaultEvents?.();
    clearMainTip();
  }
}

window.overviewMarkers = overviewMarkers;

export function initMarkersOverview(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
