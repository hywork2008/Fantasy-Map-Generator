"use strict";
import { closeDialogs, listen, unselect } from "./editors";
import { requireFmgApi } from "../runtime/fmg-api";

const Markers = requireFmgApi("Markers") as {
  deleteMarker: (markerId: number) => void;
};

interface MarkerData {
  i: number;
  lock?: boolean;
  hidden?: boolean;
  pin?: string;
  fill?: string;
  stroke?: string;
  [key: string]: any;
}

class MarkersEditor {
  private element: HTMLElement | null = null;
  private marker: MarkerData | null = null;
  private listeners: Array<() => void> = [];

  public open(markerI?: number) {
    if (customization) return;
    closeDialogs(".stable");

    const [element, marker] = this.getElement(markerI, d3.event);
    if (!marker || !element) return;
    this.element = element;
    this.marker = marker;

    const editor = this;
    elSelected = d3
      .select(element)
      .raise()
      .call(
        d3.drag().on("start", function () {
          editor.dragMarker(this as SVGElement);
        })
      )
      .classed("draggable", true);

    if (ensureEl("notesEditor").offsetParent) editNotes(element.id, element.id);

    this.updateInputs();

    $("#markerEditor").dialog({
      title: "Edit Marker",
      resizable: false,
      position: {my: "left top", at: "left+10 top+10", of: "svg", collision: "fit"},
      close: () => this.closeMarkerEditor()
    });

    const markerType = ensureEl("markerType");
    const markerIconSelect = ensureEl("markerIconSelect");
    const markerIconSize = ensureEl("markerIconSize");
    const markerIconShiftX = ensureEl("markerIconShiftX");
    const markerIconShiftY = ensureEl("markerIconShiftY");
    const markerSize = ensureEl("markerSize");
    const markerPin = ensureEl("markerPin");
    const markerFill = ensureEl("markerFill");
    const markerStroke = ensureEl("markerStroke");
    const markerNotes = ensureEl("markerNotes");
    const markerLock = ensureEl("markerLock");
    const markerAdd = ensureEl("markerAdd");
    const markerRemove = ensureEl("markerRemove");

    this.listeners = [
      listen(markerType, "change", () => this.changeMarkerType()),
      listen(markerIconSelect, "click", () => this.changeMarkerIcon()),
      listen(markerIconSize, "input", () => this.changeIconSize()),
      listen(markerIconShiftX, "input", () => this.changeIconShiftX()),
      listen(markerIconShiftY, "input", () => this.changeIconShiftY()),
      listen(markerSize, "input", () => this.changeMarkerSize()),
      listen(markerPin, "change", () => this.changeMarkerPin()),
      listen(markerFill, "input", () => this.changePinFill()),
      listen(markerStroke, "input", () => this.changePinStroke()),
      listen(markerNotes, "click", () => this.editMarkerLegend()),
      listen(markerLock, "click", () => this.toggleMarkerLock()),
      listen(markerAdd, "click", () => this.toggleAddMarker()),
      listen(markerRemove, "click", () => this.confirmMarkerDeletion())
    ];
  }

  private getElement(markerI: number | undefined, event: any): [HTMLElement | null, MarkerData | null] {
    if (event) {
      const element = event.target?.closest("svg") as HTMLElement | null;
      const marker = element ? pack.markers.find(({i}) => Number(element.id.slice(6)) === i) : null;
      return [element, marker];
    }

    const element = ensureEl(`marker${markerI}`) as HTMLElement;
    const marker = pack.markers.find(({i}) => i === markerI);
    return [element, marker];
  }

  private getSameTypeMarkers() {
    const currentType = this.marker.type;
    if (!currentType) return [this.marker];
    return pack.markers.filter(({type}) => type === currentType);
  }

  private dragMarker(markerEl: SVGElement) {
    const marker = this.marker;
    const dx = +markerEl.getAttribute("x") - d3.event.x;
    const dy = +markerEl.getAttribute("y") - d3.event.y;

    d3.event.on("drag", function () {
      const {x, y} = d3.event;
      markerEl.setAttribute("x", String(dx + x));
      markerEl.setAttribute("y", String(dy + y));
    });

    d3.event.on("end", function () {
      const {x, y} = d3.event;
      markerEl.setAttribute("x", String(rn(dx + x, 2)));
      markerEl.setAttribute("y", String(rn(dy + y, 2)));

      const size = marker.size || 30;
      const zoomSize = Math.max(rn(size / 5 + 24 / scale, 2), 1);

      marker.x = rn(x + dx + zoomSize / 2, 1);
      marker.y = rn(y + dy + zoomSize, 1);
      marker.cell = findCell(marker.x, marker.y);
    });
  }

  private updateInputs() {
    const marker = this.marker;
    const markerType = ensureEl("markerType") as HTMLInputElement;
    const markerIconSize = ensureEl("markerIconSize") as HTMLInputElement;
    const markerIconShiftX = ensureEl("markerIconShiftX") as HTMLInputElement;
    const markerIconShiftY = ensureEl("markerIconShiftY") as HTMLInputElement;
    const markerSize = ensureEl("markerSize") as HTMLInputElement;
    const markerPin = ensureEl("markerPin") as HTMLInputElement;
    const markerFill = ensureEl("markerFill") as HTMLInputElement;
    const markerStroke = ensureEl("markerStroke") as HTMLInputElement;
    const markerLock = ensureEl("markerLock") as HTMLElement;

    ensureEl("markerIcon").innerHTML =
      marker.icon.startsWith("http") || marker.icon.startsWith("data:image")
        ? `<img src="${marker.icon}" style="width: 1em; height: 1em;">`
        : marker.icon;

    markerType.value = marker.type || "";
    markerIconSize.value = marker.px || 12;
    markerIconShiftX.value = marker.dx || 50;
    markerIconShiftY.value = marker.dy || 50;
    markerSize.value = marker.size || 30;
    markerPin.value = marker.pin || "bubble";
    markerFill.value = marker.fill || "#ffffff";
    markerStroke.value = marker.stroke || "#000000";

    markerLock.className = marker.lock ? "icon-lock" : "icon-lock-open";
  }

  private changeMarkerType() {
    this.marker.type = (ensureEl("markerType") as HTMLInputElement).value;
  }

  private changeMarkerIcon() {
    selectIcon(this.marker.icon, value => {
      const isExternal = value.startsWith("http") || value.startsWith("data:image");
      ensureEl("markerIcon").innerHTML = isExternal ? `<img src="${value}" style="width: 1em; height: 1em;">` : value;

      this.getSameTypeMarkers().forEach(marker => {
        marker.icon = value;
        this.redrawIcon(marker);
      });
    });
  }

  private changeIconSize() {
    const px = +(ensureEl("markerIconSize") as HTMLInputElement).value;
    this.getSameTypeMarkers().forEach(marker => {
      marker.px = px;
      this.redrawIcon(marker);
    });
  }

  private changeIconShiftX() {
    const dx = +(ensureEl("markerIconShiftX") as HTMLInputElement).value;
    this.getSameTypeMarkers().forEach(marker => {
      marker.dx = dx;
      this.redrawIcon(marker);
    });
  }

  private changeIconShiftY() {
    const dy = +(ensureEl("markerIconShiftY") as HTMLInputElement).value;
    this.getSameTypeMarkers().forEach(marker => {
      marker.dy = dy;
      this.redrawIcon(marker);
    });
  }

  private changeMarkerSize() {
    const size = +(ensureEl("markerSize") as HTMLInputElement).value;
    const rescale = +markers.attr("rescale");

    this.getSameTypeMarkers().forEach(marker => {
      marker.size = size;
      const {i, x, y, hidden} = marker;
      const el = !hidden && document.getElementById(`marker${i}`);
      if (!el) return;

      const zoomedSize = rescale ? Math.max(rn(size / 5 + 24 / scale, 2), 1) : size;
      el.setAttribute("width", String(zoomedSize));
      el.setAttribute("height", String(zoomedSize));
      el.setAttribute("x", String(rn(x - zoomedSize / 2, 1)));
      el.setAttribute("y", String(rn(y - zoomedSize, 1)));
    });
  }

  private changeMarkerPin() {
    const pin = (ensureEl("markerPin") as HTMLInputElement).value;
    this.getSameTypeMarkers().forEach(marker => {
      marker.pin = pin;
      this.redrawPin(marker);
    });
  }

  private changePinFill() {
    const fill = (ensureEl("markerFill") as HTMLInputElement).value;
    this.getSameTypeMarkers().forEach(marker => {
      marker.fill = fill;
      this.redrawPin(marker);
    });
  }

  private changePinStroke() {
    const stroke = (ensureEl("markerStroke") as HTMLInputElement).value;
    this.getSameTypeMarkers().forEach(marker => {
      marker.stroke = stroke;
      this.redrawPin(marker);
    });
  }

  private redrawIcon({i, hidden, icon, dx = 50, dy = 50, px = 12}) {
    const isExternal = icon.startsWith("http") || icon.startsWith("data:image");

    const iconText = !hidden && document.querySelector(`#marker${i} > text`);
    if (iconText) {
      iconText.innerHTML = isExternal ? "" : icon;
      iconText.setAttribute("x", dx + "%");
      iconText.setAttribute("y", dy + "%");
      iconText.setAttribute("font-size", px + "px");
    }

    const iconImage = !hidden && document.querySelector(`#marker${i} > image`);
    if (iconImage) {
      iconImage.setAttribute("x", dx / 2 + "%");
      iconImage.setAttribute("y", dy / 2 + "%");
      iconImage.setAttribute("width", px + "px");
      iconImage.setAttribute("height", px + "px");
      iconImage.setAttribute("href", isExternal ? icon : "");
    }
  }

  private redrawPin({i, hidden, pin = "bubble", fill = "#fff", stroke = "#000"}) {
    const pinGroup = !hidden && document.querySelector(`#marker${i} > g`);
    if (pinGroup) pinGroup.innerHTML = getPin(pin, fill, stroke);
  }

  private editMarkerLegend() {
    if (!this.element) return;
    const id = this.element.id;
    editNotes(id, id);
  }

  private toggleMarkerLock() {
    const markerLock = ensureEl("markerLock") as HTMLElement;
    this.marker.lock = !this.marker.lock;
    markerLock.classList.toggle("icon-lock-open");
    markerLock.classList.toggle("icon-lock");
  }

  private toggleAddMarker() {
    const addMarker = ensureEl("addMarker");
    const markerAdd = ensureEl("markerAdd");
    markerAdd.classList.toggle("pressed");
    addMarker.click();
  }

  private confirmMarkerDeletion() {
    confirmationDialog({
      title: "Remove marker",
      message: "Are you sure you want to remove this marker? The action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => this.deleteMarker()
    });
  }

  private deleteMarker() {
    if (!this.marker || !this.element) return;
    Markers.deleteMarker(this.marker.i);
    this.element.remove();
    $("#markerEditor").dialog("close");
    if (ensureEl("markersOverviewRefresh").offsetParent) markersOverviewRefresh.click();
  }

  private closeMarkerEditor() {
    this.listeners.forEach(removeListener => removeListener());
    this.listeners = [];

    unselect();
    ensureEl("addMarker").classList.remove("pressed");
    ensureEl("markerAdd").classList.remove("pressed");
    restoreDefaultEvents();
    clearMainTip();
  }
}

const markersEditor = new MarkersEditor();

export function editMarker(markerI?: number) {
  markersEditor.open(markerI);
}
