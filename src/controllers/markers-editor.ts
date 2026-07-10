import { type D3DragEvent, drag, type Selection, select } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

import { getPin } from "../renderers/index";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { setElSelected } from "../store/editorState";
import { getMarkersEditorState, setMarkersEditorState } from "../store/markersEditorState";
import { useMarkersOverviewState } from "../store/markersOverviewState";
import { useNotesEditorState } from "../store/notesEditorState";
import type { Marker } from "../types/models";
import { closeDialog, closeDialogs } from "../ui/dialogs/dialogService";
import { findCell, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog } from "../utils/editorHelpers";
import { drawLayers } from "./layers";
import { editNotes } from "./notes-editor";

let worldContext: WorldContext;
let appServices: AppServices;

let _mdx = 0;
let _mdy = 0;

let _webglDragOffsetX = 0;
let _webglDragOffsetY = 0;

export function editMarker(markerI?: number): void {
  if (view.customization) return;
  if (markerI === undefined) return;
  closeDialogs(".stable");

  const marker = getMarker(markerI);
  if (!marker) return;

  const element = getElement(markerI);
  if (element) {
    setElSelected(select(element as Element))
      .raise()
      .call(drag<Element, unknown>().on("start", dragMarkerStart).on("drag", dragMarkerDrag).on("end", dragMarkerEnd))
      .classed("draggable", true);
  } else {
    setElSelected(null);
  }

  if (element && useNotesEditorState.getState().isOpen) editNotes(element.id, element.id);

  setMarkersEditorState({
    isOpen: true,
    selectedId: markerI!,
    type: marker.type || "",
    icon: marker.icon || "👑",
    iconSize: marker.px || 12,
    iconShiftX: marker.dx || 50,
    iconShiftY: marker.dy || 50,
    size: marker.size || 30,
    pin: marker.pin || "bubble",
    fill: marker.fill || "#ffffff",
    stroke: marker.stroke || "#000000",
    isLocked: !!marker.lock,
    isAdding: false
  });
}

function getElement(idx: number): SVGElement | null {
  return view.markers.select<SVGElement>(`#marker${idx}`).node();
}

function getMarker(idx: number): Marker | undefined {
  return worldContext.pack.markers.find(({ i }) => i === idx);
}

function getSameTypeMarkers(): Marker[] {
  const { selectedId } = getMarkersEditorState();
  if (selectedId === null) return [];
  const m = worldContext.pack.markers.find(({ i }) => i === selectedId);
  if (!m) return [];
  const currentType = m.type;
  if (!currentType) return [m];
  return worldContext.pack.markers.filter(({ type }) => type === currentType);
}

function dragMarkerStart(this: Element, event: D3DragEvent<Element, unknown, unknown>): void {
  _mdx = +this.getAttribute("x")! - event.x;
  _mdy = +this.getAttribute("y")! - event.y;
}

function dragMarkerDrag(this: Element, event: D3DragEvent<Element, unknown, unknown>): void {
  const { x, y } = event;
  this.setAttribute("x", String(_mdx + x));
  this.setAttribute("y", String(_mdy + y));
}

function dragMarkerEnd(this: Element, event: D3DragEvent<Element, unknown, unknown>): void {
  const { selectedId } = getMarkersEditorState();
  if (selectedId === null) return;
  const marker = worldContext.pack.markers.find(({ i }) => i === selectedId);
  if (!marker) return;

  const { x, y } = event;
  this.setAttribute("x", String(rn(_mdx + x, 2)));
  this.setAttribute("y", String(rn(_mdy + y, 2)));
  const size = marker.size || 30;
  const zoomSize = Math.max(rn(size / 5 + 24 / view.scale, 2), 1);
  marker.x = rn(x + _mdx + zoomSize / 2, 1);
  marker.y = rn(y + _mdy + zoomSize, 1);
  marker.cell = findCell(marker.x, marker.y);
}

/** Whether `markerI` is the currently open/selected marker, i.e. eligible for a WebGL pick-driven drag. */
export function isDragTarget(markerI: number): boolean {
  const { isOpen, selectedId } = getMarkersEditorState();
  return isOpen && selectedId === markerI;
}

/** Cheap "is any marker drag-eligible at all right now" check; see `registerWebglDragAvailability`. */
export function hasDragTarget(): boolean {
  return getMarkersEditorState().isOpen;
}

/**
 * WebGL hybrid equivalent of `dragMarkerStart` / `dragMarkerDrag` / `dragMarkerEnd`: there is no
 * SVG `#marker{id}` element to attach a d3-drag behavior to (markers render via deck.gl), so
 * `controllers/editors.ts` drives this directly from the `fmg:webgl-map-drag-*` events dispatched
 * by `deckRenderer.ts`. `coordinate` is already map-space (see `WebglDragDetail`).
 */
export function beginWebglMarkerDrag(markerI: number, coordinate: [number, number]): void {
  const marker = getMarker(markerI);
  if (!marker) return;
  _webglDragOffsetX = (marker.x ?? coordinate[0]) - coordinate[0];
  _webglDragOffsetY = (marker.y ?? coordinate[1]) - coordinate[1];
}

export function updateWebglMarkerDrag(markerI: number, coordinate: [number, number], commit: boolean): void {
  const marker = getMarker(markerI);
  if (!marker) return;

  const x = rn(coordinate[0] + _webglDragOffsetX, 2);
  const y = rn(coordinate[1] + _webglDragOffsetY, 2);
  marker.x = x;
  marker.y = y;
  if (commit) marker.cell = findCell(x, y);
  // WebGL markers are deck.gl data, not SVG attributes, so unlike the SVG drag above there is no
  // single-node update to make — the marker layer's data must be rebuilt for the move to render.
  drawLayers();
}

function changeMarkerType(newType: string): void {
  const { selectedId } = getMarkersEditorState();
  if (selectedId === null) return;
  const marker = worldContext.pack.markers.find(({ i }) => i === selectedId);
  if (!marker) return;
  marker.type = newType;
  setMarkersEditorState({ type: newType });
}

function changeMarkerIcon(): void {
  const { icon } = getMarkersEditorState();
  EditorBus.selectIcon(icon, value => {
    setMarkersEditorState({ icon: value });
    getSameTypeMarkers().forEach(m => {
      m.icon = value;
      redrawIcon(m);
    });
  });
}

function changeIconSize(px: number): void {
  setMarkersEditorState({ iconSize: px });
  getSameTypeMarkers().forEach(m => {
    m.px = px;
    redrawIcon(m);
  });
}

function changeIconShiftX(dx: number): void {
  setMarkersEditorState({ iconShiftX: dx });
  getSameTypeMarkers().forEach(m => {
    m.dx = dx;
    redrawIcon(m);
  });
}

function changeIconShiftY(dy: number): void {
  setMarkersEditorState({ iconShiftY: dy });
  getSameTypeMarkers().forEach(m => {
    m.dy = dy;
    redrawIcon(m);
  });
}

function changeMarkerSize(size: number): void {
  setMarkersEditorState({ size });
  const rescale = +(view.markers as Selection<SVGGElement, unknown, null, undefined>).attr("rescale");

  getSameTypeMarkers().forEach(m => {
    m.size = size;
    const { i, x, y, hidden } = m;
    const el = !hidden ? view.markers.select<SVGElement>(`#marker${i}`).node() : null;
    if (!el) return;

    const zoomedSize = rescale ? Math.max(rn(size / 5 + 24 / view.scale, 2), 1) : size;
    el.setAttribute("width", String(zoomedSize));
    el.setAttribute("height", String(zoomedSize));
    el.setAttribute("x", String(rn((x ?? 0) - zoomedSize / 2, 1)));
    el.setAttribute("y", String(rn((y ?? 0) - zoomedSize, 1)));
  });
}

function changeMarkerPin(pin: string): void {
  setMarkersEditorState({ pin });
  getSameTypeMarkers().forEach(m => {
    m.pin = pin;
    redrawPin(m);
  });
}

function changePinFill(fill: string): void {
  setMarkersEditorState({ fill });
  getSameTypeMarkers().forEach(m => {
    m.fill = fill;
    redrawPin(m);
  });
}

function changePinStroke(stroke: string): void {
  setMarkersEditorState({ stroke });
  getSameTypeMarkers().forEach(m => {
    m.stroke = stroke;
    redrawPin(m);
  });
}

function redrawIcon({ i, hidden, icon, dx = 50, dy = 50, px = 12 }: Marker): void {
  const isExternal = icon.startsWith("http") || icon.startsWith("data:image");

  const iconText = !hidden ? view.markers.select<SVGTextElement>(`#marker${i} > text`).node() : null;
  if (iconText) {
    iconText.textContent = isExternal ? "" : icon;
    iconText.setAttribute("x", `${dx}%`);
    iconText.setAttribute("y", `${dy}%`);
    iconText.setAttribute("font-size", `${px}px`);
  }

  const iconImage = !hidden ? view.markers.select<SVGImageElement>(`#marker${i} > image`).node() : null;
  if (iconImage) {
    iconImage.setAttribute("x", `${dx / 2}%`);
    iconImage.setAttribute("y", `${dy / 2}%`);
    iconImage.setAttribute("width", `${px}px`);
    iconImage.setAttribute("height", `${px}px`);
    iconImage.setAttribute("href", isExternal ? icon : "");
  }
}

function redrawPin({ i, hidden, pin = "bubble", fill = "#fff", stroke = "#000" }: Marker): void {
  const pinGroup = !hidden ? view.markers.select<SVGGElement>(`#marker${i} > g`).node() : null;
  /* ignore-legacy-dom */ if (pinGroup) {
    pinGroup.replaceChildren();
    pinGroup.insertAdjacentHTML("beforeend", getPin(worldContext, viewContext, appServices, pin, fill, stroke));
  }
}

function editMarkerLegend(): void {
  const { selectedId } = getMarkersEditorState();
  if (selectedId === null) return;
  const id = `marker${selectedId}`;
  editNotes(id, id);
}

function toggleMarkerLock(): void {
  const { selectedId, isLocked } = getMarkersEditorState();
  if (selectedId === null) return;
  const marker = worldContext.pack.markers.find(({ i }) => i === selectedId);
  if (!marker) return;
  marker.lock = !isLocked;
  setMarkersEditorState({ isLocked: !isLocked });
}

function toggleAddMarker(): void {
  const { isAdding } = getMarkersEditorState();
  setMarkersEditorState({ isAdding: !isAdding });
  document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "addMarker" } }));
}

function confirmMarkerDeletion(): void {
  confirmationDialog({
    title: "Remove marker",
    message: "Are you sure you want to remove this marker? The action cannot be reverted",
    confirm: "Remove",
    onConfirm: deleteMarker
  });
}

function deleteMarker(): void {
  const { selectedId } = getMarkersEditorState();
  if (selectedId === null) return;
  GenerationPipeline.Markers.deleteMarker(selectedId);
  view.markers.select<Element>(`#marker${selectedId}`).node()?.remove();
  closeMarkerEditor();
  useMarkersOverviewState.getState().refresh();
}

export function closeMarkerEditor(): void {
  setMarkersEditorState({ isOpen: false });
  EditorBus.unselect();
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  closeDialog("markerEditor");
}

export const markersEditorActions = {
  changeMarkerType,
  changeMarkerIcon,
  changeIconSize,
  changeIconShiftX,
  changeIconShiftY,
  changeMarkerSize,
  changeMarkerPin,
  changePinFill,
  changePinStroke,
  editMarkerLegend,
  toggleMarkerLock,
  toggleAddMarker,
  confirmMarkerDeletion
};

export function initMarkersEditor(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}
