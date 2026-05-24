"use strict";

import { clearLegend, closeDialogs, drawLegend, getArea, getAreaUnit, restoreDefaultEvents, fog, unfog, fitContent, moveCircle, removeCircle } from "./editors";
import { tip, clearMainTip, showMainTip } from "./general";
import { layerIsOn, togglePopulation, toggleZones } from "./layers";
import { ensureEl, rn } from "@fmg/shared";
import { editStyle } from "./style";

declare const zones: any;
declare function drawZones(): void;
declare const zonesEditor: HTMLElement;
declare const zonesFooter: HTMLElement;
declare const zonesFooterCells: HTMLElement;
declare const zonesFooterArea: HTMLElement;
declare const zonesFooterPopulation: HTMLElement;
declare const areaUnit: HTMLSelectElement;

class ZonesEditor {
  public open() {
    closeDialogs("#zonesEditor, .stable");
    if (!layerIsOn("toggleZones")) toggleZones();

    this.updateFilters();
    this.zonesEditorAddLines();

    if (modules.editZones) return;
    modules.editZones = true;

    $("#zonesEditor").dialog({
      title: "Zones Editor",
      resizable: false,
      close: () => this.exitZonesManualAssignment(true),
      position: {my: "right top", at: "right-10 top+10", of: "svg", collision: "fit"}
    });

    ensureEl("zonesFilterType").on("click", () => this.updateFilters());
    ensureEl("zonesFilterType").on("change", () => this.filterZonesByType());
    ensureEl("zonesEditorRefresh").on("click", () => this.zonesEditorAddLines());
    ensureEl("zonesEditStyle").on("click", () => editStyle("zones"));
    ensureEl("zonesLegend").on("click", () => this.toggleLegend());
    ensureEl("zonesPercentage").on("click", () => this.togglePercentageMode());
    ensureEl("zonesManually").on("click", () => this.enterZonesManualAssignent());
    ensureEl("zonesManuallyApply").on("click", () => this.applyZonesManualAssignent());
    ensureEl("zonesManuallyCancel").on("click", () => this.cancelZonesManualAssignent());
    ensureEl("zonesAdd").on("click", () => this.addZonesLayer());
    ensureEl("zonesExport").on("click", () => this.downloadZonesData());
    ensureEl("zonesRemove").on("click", (e: MouseEvent) => (e.target as HTMLElement).classList.toggle("pressed"));

    const body = ensureEl("zonesBodySection");
    body.on("click", (ev: MouseEvent) => {
      const line = (ev.target as HTMLElement).closest("div.states") as HTMLElement;
      const zone = pack.zones.find((z: any) => z.i === +line.dataset.id);
      if (!zone) return;

      if (customization) {
        if (zone.hidden) return;
        body.querySelector("div.selected")!.classList.remove("selected");
        line.classList.add("selected");
        return;
      }

      const fillBox = (ev.target as HTMLElement).closest("fill-box");
      if (fillBox) this.changeFill(fillBox.getAttribute("fill"), zone);
      else if ((ev.target as HTMLElement).classList.contains("zonePopulation")) this.changePopulation(zone);
      else if ((ev.target as HTMLElement).classList.contains("zoneRemove")) this.zoneRemove(zone);
      else if ((ev.target as HTMLElement).classList.contains("zoneHide")) this.toggleVisibility(zone);
      else if ((ev.target as HTMLElement).classList.contains("zoneFog")) this.toggleFog(zone, (ev.target as HTMLElement).classList);
    });

    body.on("input", (ev: InputEvent) => {
      const line = (ev.target as HTMLElement).closest("div.states") as HTMLElement;
      const zone = pack.zones.find((z: any) => z.i === +line.dataset.id);
      if (!zone) return;

      if ((ev.target as HTMLElement).classList.contains("zoneName")) this.changeDescription(zone, (ev.target as HTMLInputElement).value);
      else if ((ev.target as HTMLElement).classList.contains("zoneType")) this.changeType(zone, (ev.target as HTMLInputElement).value);
    });

    $(body).sortable({
      items: "div.states",
      handle: ".icon-resize-vertical",
      containment: "parent",
      axis: "y",
      update: (_ev: any, ui: any) => this.moveZone(ui)
    });
  }

  private updateFilters() {
    const filterSelect = ensureEl("zonesFilterType") as HTMLSelectElement;
    const types = unique(pack.zones.map((zone: any) => zone.type));
    const typeToFilterBy = types.includes(filterSelect.value) ? filterSelect.value : "all";

    filterSelect.innerHTML =
      "<option value='all'>all</option>" + (types as string[]).map(type => `<option value="${type}">${type}</option>`).join("");
    filterSelect.value = typeToFilterBy;
  }

  private zonesEditorAddLines() {
    const body = ensureEl("zonesBodySection");
    const typeToFilterBy = (ensureEl("zonesFilterType") as HTMLSelectElement).value;
    const filteredZones =
      typeToFilterBy === "all" ? pack.zones : pack.zones.filter((zone: any) => zone.type === typeToFilterBy);

    const lines = filteredZones.map(({i, name, type, cells, color, hidden}: any) => {
      const area = getArea(d3.sum(cells.map((i: number) => pack.cells.area[i])));
      const rural = d3.sum(cells.map((i: number) => pack.cells.pop[i])) * populationRate;
      const urban =
        d3.sum(cells.map((i: number) => pack.cells.burg[i]).map((b: number) => pack.burgs[b].population)) * populationRate * urbanization;
      const population = rn(rural + urban);
      const populationTip = `Total population: ${si(population)}; Rural population: ${si(
        rural
      )}; Urban population: ${si(urban)}. Click to change`;
      const focused = defs.select("#fog #focusZone" + i).size();

      return /* html */ `<div class="states" data-id="${i}" data-color="${color}" data-description="${name}"
        data-type="${type}" data-cells=${cells.length} data-area=${area} data-population=${population} style="${
        hidden && "opacity: 0.5"
      }">
        <fill-box fill="${color}"></fill-box>
        <input data-tip="Zone description. Click and type to change" style="width: 11em" class="zoneName" value="${name}" autocorrect="off" spellcheck="false">
        <input data-tip="Zone type. Click and type to change" class="zoneType" value="${type}">
        <span data-tip="Cells count" class="icon-check-empty hide"></span>
        <div data-tip="Cells count" class="stateCells hide">${cells.length}</div>
        <span data-tip="Zone area" style="padding-right:4px" class="icon-map-o hide"></span>
        <div data-tip="Zone area" class="biomeArea hide">${si(area) + " " + getAreaUnit()}</div>
        <span data-tip="${populationTip}" class="icon-male hide"></span>
        <div data-tip="${populationTip}" class="zonePopulation hide pointer">${si(population)}</div>
        <span data-tip="Drag to raise or lower the zone" class="icon-resize-vertical hide"></span>
        <span data-tip="Toggle zone focus" class="zoneFog icon-pin ${focused ? "" : "inactive"} hide ${
        cells.length ? "" : "placeholder"
      }"></span>
        <span data-tip="Toggle zone visibility" class="zoneHide icon-eye hide ${
          cells.length ? "" : " placeholder"
        }"></span>
        <span data-tip="Remove zone" class="zoneRemove icon-trash-empty hide"></span>
      </div>`;
    });

    body.innerHTML = lines.join("");

    const totalArea = getArea(graphWidth * graphHeight);
    zonesFooterArea.dataset.area = String(totalArea);
    const totalPop =
      (d3.sum(pack.cells.pop) + d3.sum(pack.burgs.filter((b: any) => !b.removed).map((b: any) => b.population)) * urbanization) *
      populationRate;
    zonesFooterPopulation.dataset.population = String(totalPop);
    zonesFooterNumber.innerHTML = `${filteredZones.length} of ${pack.zones.length}`;
    zonesFooterCells.innerHTML = String(pack.cells.i.length);
    zonesFooterArea.innerHTML = si(totalArea) + " " + getAreaUnit();
    zonesFooterPopulation.innerHTML = si(totalPop);

    body.querySelectorAll("div.states").forEach((el: Element) => el.addEventListener("mouseenter", (e: Event) => this.zoneHighlightOn(e as MouseEvent)));
    body.querySelectorAll("div.states").forEach((el: Element) => el.addEventListener("mouseleave", (e: Event) => this.zoneHighlightOff(e as MouseEvent)));

    if (body.dataset.type === "percentage") {
      body.dataset.type = "absolute";
      this.togglePercentageMode();
    }
    $("#zonesEditor").dialog({width: fitContent()});
  }

  private zoneHighlightOn(event: MouseEvent) {
    const zoneId = (event.target as HTMLElement).dataset.id;
    zones.select("#zone" + zoneId).style("outline", "1px solid red");
  }

  private zoneHighlightOff(event: MouseEvent) {
    const zoneId = (event.target as HTMLElement).dataset.id;
    zones.select("#zone" + zoneId).style("outline", null);
  }

  private filterZonesByType() {
    drawZones();
    this.zonesEditorAddLines();
  }

  private moveZone(ui: any) {
    const zone = pack.zones.find((z: any) => z.i === +ui.item[0].dataset.id);
    const oldIndex = pack.zones.indexOf(zone);
    const newIndex = ui.item.index();
    if (oldIndex === newIndex) return;

    pack.zones.splice(oldIndex, 1);
    pack.zones.splice(newIndex, 0, zone);
    drawZones();
  }

  private enterZonesManualAssignent() {
    const body = ensureEl("zonesBodySection");
    if (!layerIsOn("toggleZones")) toggleZones();
    customization = 10;

    document.querySelectorAll("#zonesBottom > *").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("zonesManuallyButtons") as HTMLElement).style.display = "inline-block";
    zonesEditor.querySelectorAll(".hide").forEach((el: Element) => el.classList.add("hidden"));
    zonesFooter.style.display = "none";
    body.querySelectorAll("div > input, select, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "none"));
    $("#zonesEditor").dialog({position: {my: "right top", at: "right-10 top+10", of: "svg", collision: "fit"}});

    tip("Click to select a zone, drag to paint a zone", true);
    viewbox
      .style("cursor", "crosshair")
      .on("click", () => this.selectZoneOnMapClick())
      .call(d3.drag().on("start", () => this.dragZoneBrush()))
      .on("touchmove mousemove", () => this.moveZoneBrush());

    body.querySelector("div")!.classList.add("selected");

    zones.selectAll("*").remove();

    const filterBy = (ensureEl("zonesFilterType") as HTMLSelectElement).value;
    const isFiltered = filterBy && filterBy !== "all";
    const visibleZones = pack.zones.filter((zone: any) => !zone.hidden && (!isFiltered || zone.type === filterBy));
    const data = visibleZones.map(({i, cells, color}: any) => cells.map((cell: number) => ({cell, zoneId: i, fill: color}))).flat();
    zones
      .selectAll("polygon")
      .data(data, (d: any) => `${d.zoneId}-${d.cell}`)
      .enter()
      .append("polygon")
      .attr("points", (d: any) => getPackPolygon(d.cell))
      .attr("fill", (d: any) => d.fill)
      .attr("data-zone", (d: any) => d.zoneId)
      .attr("data-cell", (d: any) => d.cell);
  }

  private selectZoneOnMapClick() {
    const body = ensureEl("zonesBodySection");
    if (d3.event.target.parentElement.id !== "zones") return;
    const zoneId = d3.event.target.dataset.zone;
    const el = body.querySelector("div[data-id='" + zoneId + "']") as HTMLElement;

    body.querySelector("div.selected")!.classList.remove("selected");
    el.classList.add("selected");
  }

  private dragZoneBrush() {
    const body = ensureEl("zonesBodySection");
    const radius = +(ensureEl("zonesBrush") as HTMLInputElement).value;
    const eraseMode = ensureEl("zonesRemove").classList.contains("pressed");
    const landOnly = (ensureEl("zonesBrushLandOnly") as HTMLInputElement).checked;

    d3.event.on("drag", () => {
      if (!d3.event.dx && !d3.event.dy) return;
      const [x, y] = d3.mouse(viewbox.node());
      moveCircle(x, y, radius);

      let selection: number[] = radius > 5 ? findAll(x, y, radius) : [findCell(x, y)];
      if (landOnly) selection = selection.filter((i: number) => pack.cells.h[i] >= 20);
      if (!selection.length) return;

      const zoneId = +(body.querySelector("div.selected") as HTMLElement)?.dataset.id;
      const zone = pack.zones.find((z: any) => z.i === zoneId);
      if (!zone) return;

      if (eraseMode) {
        const data = zones
          .selectAll("polygon")
          .data()
          .filter((d: any) => !(d.zoneId === zoneId && selection.includes(d.cell)));
        zones
          .selectAll("polygon")
          .data(data, (d: any) => `${d.zoneId}-${d.cell}`)
          .exit()
          .remove();
      } else {
        const data = selection.map((cell: number) => ({cell, zoneId, fill: zone.color}));
        zones
          .selectAll("polygon")
          .data(data, (d: any) => `${d.zoneId}-${d.cell}`)
          .enter()
          .append("polygon")
          .attr("points", (d: any) => getPackPolygon(d.cell))
          .attr("fill", (d: any) => d.fill)
          .attr("data-zone", (d: any) => d.zoneId)
          .attr("data-cell", (d: any) => d.cell);
      }
    });
  }

  private moveZoneBrush() {
    showMainTip();
    const point = d3.mouse(viewbox.node());
    const radius = +(zonesBrush as unknown as HTMLInputElement).value;
    moveCircle(point[0], point[1], radius);
  }

  private applyZonesManualAssignent() {
    const data = zones.selectAll("polygon").data();
    const zoneCells = data.reduce((acc: Record<number, number[]>, d: any) => {
      if (!acc[d.zoneId]) acc[d.zoneId] = [];
      acc[d.zoneId].push(d.cell);
      return acc;
    }, {});

    const filterBy = (ensureEl("zonesFilterType") as HTMLSelectElement).value;
    const isFiltered = filterBy && filterBy !== "all";
    const visibleZones = pack.zones.filter((zone: any) => !zone.hidden && (!isFiltered || zone.type === filterBy));
    visibleZones.forEach((zone: any) => (zone.cells = zoneCells[zone.i] || []));

    drawZones();
    this.zonesEditorAddLines();
    this.exitZonesManualAssignment();
  }

  private cancelZonesManualAssignent() {
    drawZones();
    this.exitZonesManualAssignment();
  }

  private exitZonesManualAssignment(close = false) {
    const body = ensureEl("zonesBodySection");
    customization = 0;
    removeCircle();
    document.querySelectorAll("#zonesBottom > *").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("zonesManuallyButtons") as HTMLElement).style.display = "none";

    zonesEditor.querySelectorAll(".hide:not(.show)").forEach((el: Element) => el.classList.remove("hidden"));
    zonesFooter.style.display = "block";
    body.querySelectorAll("div > input, select, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "all"));
    if (!close)
      $("#zonesEditor").dialog({position: {my: "right top", at: "right-10 top+10", of: "svg", collision: "fit"}});

    restoreDefaultEvents();
    clearMainTip();

    const selected = body.querySelector("div.selected");
    if (selected) selected.classList.remove("selected");
  }

  private changeFill(fill: string | null, zone: any) {
    const callback = (newFill: string) => {
      zone.color = newFill;
      drawZones();
      this.zonesEditorAddLines();
    };

    openPicker(fill, callback);
  }

  private toggleVisibility(zone: any) {
    const isHidden = Boolean(zone.hidden);
    if (isHidden) delete zone.hidden;
    else zone.hidden = true;

    drawZones();
    this.zonesEditorAddLines();
  }

  private toggleFog(zone: any, cl: DOMTokenList) {
    const inactive = cl.contains("inactive");
    cl.toggle("inactive");

    if (inactive) {
      const path = zones.select("#zone" + zone.i).attr("d");
      fog("focusZone" + zone.i, path);
    } else {
      unfog("focusZone" + zone.i);
    }
  }

  private toggleLegend() {
    if (legend.selectAll("*").size()) return clearLegend();

    const filterBy = (ensureEl("zonesFilterType") as HTMLSelectElement).value;
    const isFiltered = filterBy && filterBy !== "all";
    const visibleZones = pack.zones.filter((zone: any) => !zone.hidden && (!isFiltered || zone.type === filterBy));
    const data = visibleZones.map(({i, name, color}: any) => ["zone" + i, color, name]);
    drawLegend("Zones", data);
  }

  private togglePercentageMode() {
    const body = ensureEl("zonesBodySection");
    if (body.dataset.type === "absolute") {
      body.dataset.type = "percentage";
      const totalCells = +zonesFooterCells.innerHTML;
      const totalArea = +zonesFooterArea.dataset.area;
      const totalPopulation = +zonesFooterPopulation.dataset.population;

      body.querySelectorAll(":scope > div").forEach(function (el) {
        (el.querySelector(".stateCells") as HTMLElement).innerHTML = rn((+(el as HTMLElement).dataset.cells! / totalCells) * 100, 2) + "%";
        (el.querySelector(".biomeArea") as HTMLElement).innerHTML = rn((+(el as HTMLElement).dataset.area! / totalArea) * 100, 2) + "%";
        (el.querySelector(".zonePopulation") as HTMLElement).innerHTML = rn((+(el as HTMLElement).dataset.population! / totalPopulation) * 100, 2) + "%";
      });
    } else {
      body.dataset.type = "absolute";
      this.zonesEditorAddLines();
    }
  }

  private addZonesLayer() {
    const zoneId = pack.zones.length ? Math.max(...pack.zones.map((z: any) => z.i)) + 1 : 0;
    const name = "Unknown zone";
    const type = "Unknown";
    const color = "url(#hatch" + (zoneId % 42) + ")";
    pack.zones.push({i: zoneId, name, type, color, cells: []});

    this.zonesEditorAddLines();
    drawZones();
  }

  private downloadZonesData() {
    const body = ensureEl("zonesBodySection");
    const unit = areaUnit.value === "square" ? distanceUnitInput.value + "2" : areaUnit.value;
    let data = "Id,Color,Description,Type,Cells,Area " + unit + ",Population\n";

    body.querySelectorAll(":scope > div").forEach(function (el) {
      const d = (el as HTMLElement).dataset;
      data += d.id + ",";
      data += d.color + ",";
      data += d.description + ",";
      data += d.type + ",";
      data += d.cells + ",";
      data += d.area + ",";
      data += d.population + "\n";
    });

    const name = getFileName("Zones") + ".csv";
    downloadFile(data, name);
  }

  private changeDescription(zone: any, value: string) {
    zone.name = value;
    zones.select("#zone" + zone.i).attr("data-description", value);
  }

  private changeType(zone: any, value: string) {
    zone.type = value;
    zones.select("#zone" + zone.i).attr("data-type", value);
  }

  private changePopulation(zone: any) {
    const landCells = zone.cells.filter((i: number) => pack.cells.h[i] >= 20);
    if (!landCells.length) return tip("Zone does not have any land cells, cannot change population", false, "error");

    const burgs = pack.burgs.filter((b: any) => !b.removed && landCells.includes(b.cell));
    const rural = rn(d3.sum(landCells.map((i: number) => pack.cells.pop[i])) * populationRate);
    const urban = rn(
      d3.sum(landCells.map((i: number) => pack.cells.burg[i]).map((b: number) => pack.burgs[b].population)) * populationRate * urbanization
    );
    const total = rural + urban;
    const l = (n: number) => Number(n).toLocaleString();

    alertMessage.innerHTML = /* html */ `Rural: <input type="number" min="0" step="1" id="ruralPop" value=${rural} style="width:6em" /> Urban:
      <input type="number" min="0" step="1" id="urbanPop" value=${urban} style="width:6em" ${
      burgs.length ? "" : "disabled"
    } />
      <p>Total population: ${l(total)} ⇒ <span id="totalPop">${l(
      total
    )}</span> (<span id="totalPopPerc">100</span>%)</p>`;

    const update = function () {
      const totalNew = (ruralPop as HTMLInputElement).valueAsNumber + (urbanPop as HTMLInputElement).valueAsNumber;
      if (isNaN(totalNew)) return;
      totalPop.innerHTML = l(totalNew);
      totalPopPerc.innerHTML = String(rn((totalNew / total) * 100));
    };

    (ruralPop as HTMLInputElement).oninput = () => update();
    (urbanPop as HTMLInputElement).oninput = () => update();

    $("#alert").dialog({
      resizable: false,
      title: "Change zone population",
      width: "24em",
      buttons: {
        Apply: () => {
          this.applyPopulationChange(landCells, burgs, rural, urban);
          $("#alert").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      },
      position: {my: "center", at: "center", of: "svg"}
    });
  }

  private applyPopulationChange(landCells: number[], burgs: any[], rural: number, urban: number) {
    const ruralChange = +(ruralPop as HTMLInputElement).value / rural;
    if (isFinite(ruralChange) && ruralChange !== 1) {
      landCells.forEach((i: number) => (pack.cells.pop[i] *= ruralChange));
    }
    if (!isFinite(ruralChange) && +(ruralPop as HTMLInputElement).value > 0) {
      const points = +(ruralPop as HTMLInputElement).value / populationRate;
      const pop = rn(points / landCells.length);
      landCells.forEach((i: number) => (pack.cells.pop[i] = pop));
    }

    const urbanChange = +(urbanPop as HTMLInputElement).value / urban;
    if (isFinite(urbanChange) && urbanChange !== 1) {
      burgs.forEach((b: any) => (b.population = rn(b.population * urbanChange, 4)));
    }
    if (!isFinite(urbanChange) && +(urbanPop as HTMLInputElement).value > 0) {
      const points = +(urbanPop as HTMLInputElement).value / populationRate / urbanization;
      const population = rn(points / burgs.length, 4);
      burgs.forEach((b: any) => (b.population = population));
    }

    if (layerIsOn("togglePopulation")) drawPopulation();
    this.zonesEditorAddLines();
  }

  private zoneRemove(zone: any) {
    confirmationDialog({
      title: "Remove zone",
      message: "Are you sure you want to remove the zone? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        pack.zones = pack.zones.filter((z: any) => z.i !== zone.i);
        zones.select("#zone" + zone.i).remove();
        unfog("focusZone" + zone.i);
        this.zonesEditorAddLines();
      }
    });
  }
}

const zonesEditorController = new ZonesEditor();

export function editZones() {
  zonesEditorController.open();
}
