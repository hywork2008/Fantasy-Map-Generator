import { zoomTo } from "../actions";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { MarkersRenderer } from "../renderers";
import { invertMarkerFlags, patchMarker, removeMarker, removeUnlockedMarkers } from "../runtime/worldRuntime";
import { viewLayerService as view } from "../services/viewLayerService";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { getLatitude, getLongitude } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { layerIsOn } from "../utils/nodeUtils";
import { toggleMarkers } from "./layers";

export function overviewMarkers(): void {
  if (view.customization) return;
  closeDialogs("#markersOverview, .stable");
  if (!layerIsOn("toggleMarkers")) toggleMarkers();

  openDialog("markersOverview");
}

export function markerHighlightById(i: number): void {
  const marker = view.markers.select<SVGElement>(`#marker${i}`).node();
  if (!marker) return;
  EditorBus.highlightElement(marker, 2);
}

export function markerZoomTo(i: number): void {
  const marker = worldContext.pack.markers.find(m => m.i === i);
  if (!marker) return;
  zoomTo(marker.x ?? 0, marker.y ?? 0, 8, 2000);
}

export function markerTogglePin(i: number): void {
  const marker = worldContext.pack.markers.find(m => m.i === i);
  if (!marker) return;

  const commit = patchMarker({ markerId: i, pinned: !marker.pinned });
  if (!commit) return;
  const markerGroup = view.markers.node();
  if (marker.pinned) {
    const anyPinned = worldContext.pack.markers.some(m => m.pinned);
    if (!anyPinned && markerGroup) markerGroup.removeAttribute("pinned");
  } else {
    markerGroup?.setAttribute("pinned", "1");
  }
  MarkersRenderer.render(worldContext, viewContext, appServices);
}

export function markerToggleLock(i: number): void {
  const marker = worldContext.pack.markers.find(m => m.i === i);
  if (!marker) return;
  patchMarker({ markerId: i, lock: !marker.lock });
}

export function markerInvertPin(): void {
  const commit = invertMarkerFlags({ field: "pinned" });
  if (!commit) return;
  const anyPinned = worldContext.pack.markers.some(marker => marker.pinned);
  const markerGroup = view.markers.node();
  if (markerGroup) {
    if (anyPinned) markerGroup.setAttribute("pinned", "1");
    else markerGroup.removeAttribute("pinned");
  }
  MarkersRenderer.render(worldContext, viewContext, appServices);
}

export function markerInvertLock(): void {
  invertMarkerFlags({ field: "lock" });
}

export function removeMarkerById(i: number): void {
  const commit = removeMarker({ markerId: i });
  if (!commit) return;
  view.markers.select(`#marker${i}`).remove();
}

export function removeAllUnlockedMarkers(): void {
  const commit = removeUnlockedMarkers();
  if (!commit) return;
  for (const markerId of commit.result.removedMarkerIds) {
    view.markers.select(`#marker${markerId}`).remove();
  }
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
