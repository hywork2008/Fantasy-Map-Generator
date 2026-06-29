import { type D3DragEvent, drag, type Selection, select } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Markers } from "../generators/markers-generator";
import { getPin } from "../renderers/index";
import { setElSelected } from "../store/editorState";
import { getMarkersEditorState, setMarkersEditorState } from "../store/markersEditorState";
import { useMarkersOverviewState } from "../store/markersOverviewState";
import { useNotesEditorState } from "../store/notesEditorState";
import type { Marker } from "../types/models";
import { closeDialog, closeDialogs } from "../ui/dialogs/dialogService";
import { findCell, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog } from "../utils/editorHelpers";
import { clearMainTip } from "../utils/uiHelpers";
import { editNotes } from "./notes-editor";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

let _mdx = 0;
let _mdy = 0;

export function editMarker(markerI?: number): void {
  if (viewContext.customization) return;
  closeDialogs(".stable");

  const result = getElement(markerI!);
  if (!result) return;
  const { element, marker } = result;

  setElSelected(select(element as Element))
    .raise()
    .call(drag<Element, unknown>().on("start", dragMarkerStart).on("drag", dragMarkerDrag).on("end", dragMarkerEnd))
    .classed("draggable", true);

  if (useNotesEditorState.getState().isOpen) editNotes(element.id, element.id);

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

function getElement(idx: number): { element: SVGElement; marker: Marker } | null {
  const el = viewContext.markers.select<SVGElement>(`#marker${idx}`).node();
  const m = worldContext.pack.markers.find(({ i }) => i === idx);
  if (!el || !m) return null;
  return { element: el, marker: m };
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
  const zoomSize = Math.max(rn(size / 5 + 24 / viewContext.scale, 2), 1);
  marker.x = rn(x + _mdx + zoomSize / 2, 1);
  marker.y = rn(y + _mdy + zoomSize, 1);
  marker.cell = findCell(marker.x, marker.y);
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
  const rescale = +(viewContext.markers as Selection<SVGGElement, unknown, null, undefined>).attr("rescale");

  getSameTypeMarkers().forEach(m => {
    m.size = size;
    const { i, x, y, hidden } = m;
    const el = !hidden ? viewContext.markers.select<SVGElement>(`#marker${i}`).node() : null;
    if (!el) return;

    const zoomedSize = rescale ? Math.max(rn(size / 5 + 24 / viewContext.scale, 2), 1) : size;
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

  const iconText = !hidden ? viewContext.markers.select<SVGTextElement>(`#marker${i} > text`).node() : null;
  if (iconText) {
    iconText.textContent = isExternal ? "" : icon;
    iconText.setAttribute("x", `${dx}%`);
    iconText.setAttribute("y", `${dy}%`);
    iconText.setAttribute("font-size", `${px}px`);
  }

  const iconImage = !hidden ? viewContext.markers.select<SVGImageElement>(`#marker${i} > image`).node() : null;
  if (iconImage) {
    iconImage.setAttribute("x", `${dx / 2}%`);
    iconImage.setAttribute("y", `${dy / 2}%`);
    iconImage.setAttribute("width", `${px}px`);
    iconImage.setAttribute("height", `${px}px`);
    iconImage.setAttribute("href", isExternal ? icon : "");
  }
}

function redrawPin({ i, hidden, pin = "bubble", fill = "#fff", stroke = "#000" }: Marker): void {
  const pinGroup = !hidden ? viewContext.markers.select<SVGGElement>(`#marker${i} > g`).node() : null;
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
  Markers.deleteMarker(selectedId);
  viewContext.markers.select<Element>(`#marker${selectedId}`).node()?.remove();
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

export function initMarkersEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
