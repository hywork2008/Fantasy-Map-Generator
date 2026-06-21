import { zoomTo } from "../actions";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { MarkersRenderer } from "../renderers";
import { useMarkersOverviewState } from "../store/markersOverviewState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { getLatitude, getLongitude } from "../utils";
import { downloadFile, getFileName, highlightElement } from "./editors";
import { layerIsOn, toggleMarkers } from "./layers";

export function overviewMarkers(): void {
  if (viewContext.customization) return;
  closeDialogs("#markersOverview, .stable");
  if (!layerIsOn("toggleMarkers")) toggleMarkers();

  useMarkersOverviewState.getState().refresh();
  openDialog("markersOverview");
}

export function markerHighlightById(i: number): void {
  const marker = document.getElementById(`marker${i}`);
  if (!marker) return;
  highlightElement(marker, 2);
}

export function markerZoomTo(i: number): void {
  const marker = worldContext.pack.markers.find(m => m.i === i);
  if (!marker) return;
  zoomTo(marker.x ?? 0, marker.y ?? 0, 8, 2000);
}

export function markerTogglePin(i: number): void {
  const marker = worldContext.pack.markers.find(m => m.i === i);
  if (!marker) return;

  const markerGroup = document.getElementById("markers");
  if (marker.pinned) {
    delete marker.pinned;
    const anyPinned = worldContext.pack.markers.some(m => m.pinned);
    if (!anyPinned && markerGroup) markerGroup.removeAttribute("pinned");
  } else {
    marker.pinned = true;
    markerGroup?.setAttribute("pinned", "1");
  }
  MarkersRenderer.render(worldContext, viewContext, appServices);
}

export function markerToggleLock(i: number): void {
  const marker = worldContext.pack.markers.find(m => m.i === i);
  if (!marker) return;
  if (marker.lock) delete marker.lock;
  else marker.lock = true;
}

export function markerInvertPin(): void {
  let anyPinned = false;
  worldContext.pack.markers.forEach(marker => {
    if (!marker.pinned) {
      marker.pinned = true;
      anyPinned = true;
    } else delete marker.pinned;
  });
  const markerGroup = document.getElementById("markers");
  if (markerGroup) {
    if (anyPinned) markerGroup.setAttribute("pinned", "1");
    else markerGroup.removeAttribute("pinned");
  }
  MarkersRenderer.render(worldContext, viewContext, appServices);
}

export function markerInvertLock(): void {
  worldContext.pack.markers = worldContext.pack.markers.map(m => ({ ...m, lock: !m.lock }));
}

export function removeMarkerById(i: number): void {
  worldContext.notes = worldContext.notes.filter(note => note.id !== `marker${i}`);
  worldContext.pack.markers = worldContext.pack.markers.filter(m => m.i !== i);
  document.getElementById(`marker${i}`)?.remove();
}

export function removeAllUnlockedMarkers(): void {
  worldContext.pack.markers = worldContext.pack.markers.filter(({ i, lock }) => {
    if (lock) return true;
    const id = `marker${i}`;
    document.getElementById(id)?.remove();
    worldContext.notes = worldContext.notes.filter(note => note.id !== id);
    return false;
  });
}

export function exportMarkers(): void {
  const headers = "Id,Type,Icon,Name,Note,X,Y,Latitude,Longitude\n";
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;

  const bodyLines = worldContext.pack.markers.map(marker => {
    const { i, type, icon } = marker;
    const x = marker.x ?? 0;
    const y = marker.y ?? 0;

    const note = worldContext.notes.find(note => note.id === `marker${i}`);
    const name = note ? quote(note.name) : "Unknown";
    const legend = note ? quote(note.legend) : "";

    const lat = getLatitude(y, worldContext.mapCoordinates, worldContext.graphHeight, 2);
    const lon = getLongitude(x, worldContext.mapCoordinates, worldContext.graphWidth, 2);

    return [i, type, icon, name, legend, x, y, lat, lon].join(",");
  });

  const data = headers + bodyLines.join("\n");
  const fileName = `${getFileName("Markers")}.csv`;
  downloadFile(data, fileName);
}
