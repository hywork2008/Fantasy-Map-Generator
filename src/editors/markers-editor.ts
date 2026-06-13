import { type D3DragEvent, drag, type Selection, select } from "d3";
import type { Marker } from "../modules/markers-generator";
import { Markers } from "../modules/markers-generator";
import { getPin } from "../renderers/index";
import { ensureEl, findCell, rn } from "../utils";
import { editNotes } from "./notes-editor";

export function editMarker(markerI?: number): void {
  if (customization) return;
  closeDialogs(".stable");

  const result = getElement(markerI!);
  if (!result) return;
  const { element, marker } = result;

  elSelected = select(element)
    .raise()
    .call(drag<SVGElement, unknown>().on("start", dragMarkerStart).on("drag", dragMarkerDrag).on("end", dragMarkerEnd))
    .classed("draggable", true);

  if (ensureEl("notesEditor").offsetParent) editNotes(element.id, element.id);

  const markerType = ensureEl<HTMLInputElement>("markerType");
  const markerIconSelect = ensureEl("markerIconSelect");
  const markerIconSize = ensureEl<HTMLInputElement>("markerIconSize");
  const markerIconShiftX = ensureEl<HTMLInputElement>("markerIconShiftX");
  const markerIconShiftY = ensureEl<HTMLInputElement>("markerIconShiftY");
  const markerSize = ensureEl<HTMLInputElement>("markerSize");
  const markerPin = ensureEl<HTMLSelectElement>("markerPin");
  const markerFill = ensureEl<HTMLInputElement>("markerFill");
  const markerStroke = ensureEl<HTMLInputElement>("markerStroke");

  const markerNotes = ensureEl("markerNotes");
  const markerLock = ensureEl("markerLock");
  const addMarker = ensureEl("addMarker");
  const markerAdd = ensureEl("markerAdd");
  const markerRemove = ensureEl("markerRemove");

  updateInputs();

  $("#markerEditor").dialog({
    title: "Edit Marker",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "svg", collision: "fit" },
    close: closeMarkerEditor
  });

  const listeners = [
    listen(markerType, "change", changeMarkerType as EventListener),
    listen(markerIconSelect, "click", changeMarkerIcon as EventListener),
    listen(markerIconSize, "input", changeIconSize as EventListener),
    listen(markerIconShiftX, "input", changeIconShiftX as EventListener),
    listen(markerIconShiftY, "input", changeIconShiftY as EventListener),
    listen(markerSize, "input", changeMarkerSize as EventListener),
    listen(markerPin, "change", changeMarkerPin as EventListener),
    listen(markerFill, "input", changePinFill as EventListener),
    listen(markerStroke, "input", changePinStroke as EventListener),
    listen(markerNotes, "click", editMarkerLegend as EventListener),
    listen(markerLock, "click", toggleMarkerLock as EventListener),
    listen(markerAdd, "click", toggleAddMarker as EventListener),
    listen(markerRemove, "click", confirmMarkerDeletion as EventListener)
  ];

  function getElement(idx: number): { element: SVGElement; marker: Marker } | null {
    const el = document.getElementById(`marker${idx}`) as SVGElement | null;
    const m = pack.markers.find(({ i }) => i === idx);
    if (!el || !m) return null;
    return { element: el, marker: m };
  }

  function getSameTypeMarkers(): Marker[] {
    const currentType = marker.type;
    if (!currentType) return [marker];
    return pack.markers.filter(({ type }) => type === currentType);
  }

  let _mdx = 0,
    _mdy = 0;

  function dragMarkerStart(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    _mdx = +this.getAttribute("x")! - event.x;
    _mdy = +this.getAttribute("y")! - event.y;
  }

  function dragMarkerDrag(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    const { x, y } = event;
    this.setAttribute("x", String(_mdx + x));
    this.setAttribute("y", String(_mdy + y));
  }

  function dragMarkerEnd(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    const { x, y } = event;
    this.setAttribute("x", String(rn(_mdx + x, 2)));
    this.setAttribute("y", String(rn(_mdy + y, 2)));
    const size = marker.size || 30;
    const zoomSize = Math.max(rn(size / 5 + 24 / scale, 2), 1);
    marker.x = rn(x + _mdx + zoomSize / 2, 1);
    marker.y = rn(y + _mdy + zoomSize, 1);
    marker.cell = findCell(marker.x, marker.y);
  }

  function updateInputs(): void {
    ensureEl("markerIcon").innerHTML =
      marker.icon.startsWith("http") || marker.icon.startsWith("data:image")
        ? `<img src="${marker.icon}" style="width: 1em; height: 1em;">`
        : marker.icon;

    markerType.value = marker.type || "";
    markerIconSize.value = String(marker.px || 12);
    markerIconShiftX.value = String(marker.dx || 50);
    markerIconShiftY.value = String(marker.dy || 50);
    markerSize.value = String(marker.size || 30);
    markerPin.value = marker.pin || "bubble";
    markerFill.value = marker.fill || "#ffffff";
    markerStroke.value = marker.stroke || "#000000";

    markerLock.className = marker.lock ? "icon-lock" : "icon-lock-open";
  }

  function changeMarkerType(this: HTMLInputElement): void {
    marker.type = this.value;
  }

  function changeMarkerIcon(): void {
    selectIcon(marker.icon, value => {
      const isExternal = value.startsWith("http") || value.startsWith("data:image");
      ensureEl("markerIcon").innerHTML = isExternal ? `<img src="${value}" style="width: 1em; height: 1em;">` : value;

      getSameTypeMarkers().forEach(m => {
        m.icon = value;
        redrawIcon(m);
      });
    });
  }

  function changeIconSize(this: HTMLInputElement): void {
    const px = +this.value;
    getSameTypeMarkers().forEach(m => {
      m.px = px;
      redrawIcon(m);
    });
  }

  function changeIconShiftX(this: HTMLInputElement): void {
    const dx = +this.value;
    getSameTypeMarkers().forEach(m => {
      m.dx = dx;
      redrawIcon(m);
    });
  }

  function changeIconShiftY(this: HTMLInputElement): void {
    const dy = +this.value;
    getSameTypeMarkers().forEach(m => {
      m.dy = dy;
      redrawIcon(m);
    });
  }

  function changeMarkerSize(this: HTMLInputElement): void {
    const size = +this.value;
    const rescale = +(markers as Selection<SVGGElement, unknown, null, undefined>).attr("rescale");

    getSameTypeMarkers().forEach(m => {
      m.size = size;
      const { i, x, y, hidden } = m;
      const el = !hidden ? document.getElementById(`marker${i}`) : null;
      if (!el) return;

      const zoomedSize = rescale ? Math.max(rn(size / 5 + 24 / scale, 2), 1) : size;
      el.setAttribute("width", String(zoomedSize));
      el.setAttribute("height", String(zoomedSize));
      el.setAttribute("x", String(rn((x ?? 0) - zoomedSize / 2, 1)));
      el.setAttribute("y", String(rn((y ?? 0) - zoomedSize, 1)));
    });
  }

  function changeMarkerPin(this: HTMLSelectElement): void {
    const pin = this.value;
    getSameTypeMarkers().forEach(m => {
      m.pin = pin;
      redrawPin(m);
    });
  }

  function changePinFill(this: HTMLInputElement): void {
    const fill = this.value;
    getSameTypeMarkers().forEach(m => {
      m.fill = fill;
      redrawPin(m);
    });
  }

  function changePinStroke(this: HTMLInputElement): void {
    const stroke = this.value;
    getSameTypeMarkers().forEach(m => {
      m.stroke = stroke;
      redrawPin(m);
    });
  }

  function redrawIcon({ i, hidden, icon, dx = 50, dy = 50, px = 12 }: Marker): void {
    const isExternal = icon.startsWith("http") || icon.startsWith("data:image");

    const iconText = !hidden ? document.querySelector<SVGTextElement>(`#marker${i} > text`) : null;
    if (iconText) {
      iconText.innerHTML = isExternal ? "" : icon;
      iconText.setAttribute("x", `${dx}%`);
      iconText.setAttribute("y", `${dy}%`);
      iconText.setAttribute("font-size", `${px}px`);
    }

    const iconImage = !hidden ? document.querySelector<SVGImageElement>(`#marker${i} > image`) : null;
    if (iconImage) {
      iconImage.setAttribute("x", `${dx / 2}%`);
      iconImage.setAttribute("y", `${dy / 2}%`);
      iconImage.setAttribute("width", `${px}px`);
      iconImage.setAttribute("height", `${px}px`);
      iconImage.setAttribute("href", isExternal ? icon : "");
    }
  }

  function redrawPin({ i, hidden, pin = "bubble", fill = "#fff", stroke = "#000" }: Marker): void {
    const pinGroup = !hidden ? document.querySelector<SVGGElement>(`#marker${i} > g`) : null;
    if (pinGroup) pinGroup.innerHTML = getPin(pin, fill, stroke);
  }

  function editMarkerLegend(): void {
    const id = element!.id;
    editNotes(id, id);
  }

  function toggleMarkerLock(): void {
    marker.lock = !marker.lock;
    markerLock.classList.toggle("icon-lock-open");
    markerLock.classList.toggle("icon-lock");
  }

  function toggleAddMarker(): void {
    markerAdd.classList.toggle("pressed");
    addMarker.click();
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
    Markers.deleteMarker(marker.i);
    element!.remove();
    $("#markerEditor").dialog("close");
    const refreshEl = ensureEl("markersOverviewRefresh") as HTMLElement;
    if (refreshEl.offsetParent) refreshEl.click();
  }

  function closeMarkerEditor(): void {
    listeners.forEach(removeListener => {
      removeListener();
    });

    unselect();
    addMarker.classList.remove("pressed");
    markerAdd.classList.remove("pressed");
    restoreDefaultEvents?.();
    clearMainTip();
  }
}
