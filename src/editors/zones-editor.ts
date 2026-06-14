import { type D3DragEvent, drag, pointer, type Selection, sum } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Zone } from "../modules/zones-generator";
import { PopulationRenderer, ZonesRenderer } from "../renderers";
import { openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { ensureEl, findCell, rn, si, unique } from "../utils";
import { getPackPolygon } from "../utils/graphUtils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

type ZoneCellDatum = { cell: number; zoneId: number; fill: string };

export function editZones(): void {
  closeDialogs("#zonesEditor, .stable");
  if (!layerIsOn("toggleZones")) toggleZones();
  const body = ensureEl("zonesBodySection");

  updateFilters();
  zonesEditorAddLines();

  if (modules.editZones) return;
  modules.editZones = true;

  openDialog("zonesEditor", {
    title: "Zones Editor",
    resizable: false,
    close: () => exitZonesManualAssignment("close"),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  // add listeners
  ensureEl("zonesFilterType").addEventListener("click", updateFilters);
  ensureEl("zonesFilterType").addEventListener("change", filterZonesByType);
  ensureEl("zonesEditorRefresh").addEventListener("click", zonesEditorAddLines);
  ensureEl("zonesEditStyle").addEventListener("click", () => editStyle("zones"));
  ensureEl("zonesLegend").addEventListener("click", toggleLegend);
  ensureEl("zonesPercentage").addEventListener("click", togglePercentageMode);
  ensureEl("zonesManually").addEventListener("click", enterZonesManualAssignent);
  ensureEl("zonesManuallyApply").addEventListener("click", applyZonesManualAssignent);
  ensureEl("zonesManuallyCancel").addEventListener("click", cancelZonesManualAssignent);
  ensureEl("zonesAdd").addEventListener("click", addZonesLayer);
  ensureEl("zonesExport").addEventListener("click", downloadZonesData);
  ensureEl("zonesRemove").addEventListener("click", (e: Event) =>
    (e.target as HTMLElement).classList.toggle("pressed")
  );

  body.addEventListener("click", (ev: Event) => {
    const line = (ev.target as HTMLElement).closest("div.states") as HTMLElement | null;
    if (!line) return;
    const zone = pack.zones.find(z => z.i === +line.dataset.id!);
    if (!zone) return;

    if (customization) {
      if (zone.hidden) return;
      body.querySelector("div.selected")?.classList.remove("selected");
      line.classList.add("selected");
      return;
    }

    const fillBox = (ev.target as HTMLElement).closest("fill-box");
    if (fillBox) changeFill(fillBox.getAttribute("fill")!, zone);
    else if ((ev.target as HTMLElement).classList.contains("zonePopulation")) changePopulation(zone);
    else if ((ev.target as HTMLElement).classList.contains("zoneRemove")) zoneRemove(zone);
    else if ((ev.target as HTMLElement).classList.contains("zoneHide")) toggleVisibility(zone);
    else if ((ev.target as HTMLElement).classList.contains("zoneFog"))
      toggleFog(zone, (ev.target as HTMLElement).classList);
  });

  body.addEventListener("input", (ev: Event) => {
    const line = (ev.target as HTMLElement).closest("div.states") as HTMLElement | null;
    if (!line) return;
    const zone = pack.zones.find(z => z.i === +line.dataset.id!);
    if (!zone) return;

    if ((ev.target as HTMLElement).classList.contains("zoneName"))
      changeDescription(zone, (ev.target as HTMLInputElement).value);
    else if ((ev.target as HTMLElement).classList.contains("zoneType"))
      changeType(zone, (ev.target as HTMLInputElement).value);
  });

  function updateFilters(): void {
    const filterSelect = ensureEl<HTMLSelectElement>("zonesFilterType");
    const types = unique(pack.zones.map((zone: Zone) => zone.type));
    const typeToFilterBy = types.includes(filterSelect.value) ? filterSelect.value : "all";

    filterSelect.innerHTML = `<option value='all'>all</option>${types.map((type: string) => `<option value="${type}">${type}</option>`).join("")}`;
    filterSelect.value = typeToFilterBy;
  }

  function zonesEditorAddLines(): void {
    const typeToFilterBy = ensureEl<HTMLSelectElement>("zonesFilterType").value;
    const filteredZones =
      typeToFilterBy === "all" ? pack.zones : pack.zones.filter((zone: Zone) => zone.type === typeToFilterBy);

    const lines = filteredZones.map(({ i, name, type, cells, color, hidden }: Zone) => {
      const area = getArea(sum(cells.map((idx: number) => pack.cells.area[idx])));
      const rural = sum(cells.map((idx: number) => pack.cells.pop[idx])) * populationRate;
      const urban =
        sum(cells.map((idx: number) => pack.cells.burg[idx]).map((b: number) => pack.burgs[b].population)) *
        populationRate *
        urbanization;
      const population = rn(rural + urban);
      const populationTip = `Total population: ${si(population)}; Rural population: ${si(
        rural
      )}; Urban population: ${si(urban)}. Click to change`;
      const focused = defs.select(`#fog #focusZone${i}`).size();

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
        <div data-tip="Zone area" class="biomeArea hide">${`${si(area)} ${getAreaUnit()}`}</div>
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
    const zonesFooterArea = document.getElementById("zonesFooterArea") as HTMLElement;
    const zonesFooterPopulation = document.getElementById("zonesFooterPopulation") as HTMLElement;
    const zonesFooterNumber = document.getElementById("zonesFooterNumber") as HTMLElement;
    const zonesFooterCells = document.getElementById("zonesFooterCells") as HTMLElement;

    zonesFooterArea.dataset.area = String(totalArea);
    const totalPop =
      (sum(pack.cells.pop) +
        sum(pack.burgs.filter((b: { removed?: boolean }) => !b.removed).map(b => b.population ?? 0)) * urbanization) *
      populationRate;
    zonesFooterPopulation.dataset.population = String(totalPop);
    zonesFooterNumber.innerHTML = `${filteredZones.length} of ${pack.zones.length}`;
    zonesFooterCells.innerHTML = String(pack.cells.i.length);
    zonesFooterArea.innerHTML = `${si(totalArea)} ${getAreaUnit()}`;
    zonesFooterPopulation.innerHTML = si(totalPop);

    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseenter", zoneHighlightOn);
    });
    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseleave", zoneHighlightOff);
    });

    if (body.dataset.type === "percentage") {
      body.dataset.type = "absolute";
      togglePercentageMode();
    }
    openDialog("zonesEditor", { width: fitContent() });
  }

  function zoneHighlightOn(event: Event): void {
    const zoneId = (event.target as HTMLElement).dataset.id;
    zones.select(`#zone${zoneId}`).style("outline", "1px solid red");
  }

  function zoneHighlightOff(event: Event): void {
    const zoneId = (event.target as HTMLElement).dataset.id;
    zones.select(`#zone${zoneId}`).style("outline", null);
  }

  function filterZonesByType(): void {
    ZonesRenderer.render(worldContext, viewContext, appServices);
    zonesEditorAddLines();
  }

  /* sortable removed */

  // function movezone(_ev: Event, ui: any): void {
  //  const zone = pack.zones.find((z: Zone) => z.i === +(ui.item[0] as HTMLElement).dataset.id!);
  //  if (!zone) return;
  //  const oldIndex = pack.zones.indexOf(zone);
  //  const newIndex = ui.item.index();
  //  if (oldIndex === newIndex) return;

  //  pack.zones.splice(oldIndex, 1);
  //  pack.zones.splice(newIndex, 0, zone);
  //  ZonesRenderer.render(worldContext, viewContext, appServices);
  // }

  function enterZonesManualAssignent(): void {
    if (!layerIsOn("toggleZones")) toggleZones();
    customization = 10;

    document.querySelectorAll("#zonesBottom > *").forEach(el => {
      (el as HTMLElement).style.display = "none";
    });
    ensureEl("zonesManuallyButtons").style.display = "inline-block";
    document
      .getElementById("zonesEditor")!
      .querySelectorAll(".hide")
      .forEach(el => {
        el.classList.add("hidden");
      });
    (document.getElementById("zonesFooter") as HTMLElement).style.display = "none";
    body.querySelectorAll("div > input, select, svg").forEach(e => {
      (e as HTMLElement).style.pointerEvents = "none";
    });
    openDialog("zonesEditor", { position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" } });

    tip("Click to select a zone, drag to paint a zone", true);
    viewbox
      .style("cursor", "crosshair")
      .on("click", selectZoneOnMapClick)
      .call(drag<SVGGElement, unknown>().on("drag", dragZoneBrush))
      .on("touchmove mousemove", moveZoneBrush);

    body.querySelector("div")?.classList.add("selected");

    zones.selectAll("*").remove();

    const filterBy = ensureEl<HTMLSelectElement>("zonesFilterType").value;
    const isFiltered = filterBy && filterBy !== "all";
    const visibleZones = pack.zones.filter((zone: Zone) => !zone.hidden && (!isFiltered || zone.type === filterBy));
    const data = visibleZones.flatMap(({ i, cells, color }: Zone) =>
      cells.map((cell: number) => ({ cell, zoneId: i, fill: color }))
    );
    zones
      .selectAll<SVGPolygonElement, ZoneCellDatum>("polygon")
      .data(data, d => `${d.zoneId}-${d.cell}`)
      .enter()
      .append("polygon")
      .attr("points", d => getPackPolygon(d.cell, worldContext.pack).join(" "))
      .attr("fill", d => d.fill)
      .attr("data-zone", d => d.zoneId)
      .attr("data-cell", d => d.cell);
  }

  function selectZoneOnMapClick(event: MouseEvent): void {
    if ((event.target as SVGElement).parentElement?.id !== "zones") return;
    const zoneId = (event.target as SVGElement).dataset?.zone;
    const el = body.querySelector(`div[data-id='${zoneId}']`) as HTMLElement | null;
    if (!el) return;

    body.querySelector("div.selected")?.classList.remove("selected");
    el.classList.add("selected");
  }

  function dragZoneBrush(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    if (!event.dx && !event.dy) return;
    const radius = +ensureEl<HTMLInputElement>("zonesBrush").value;
    const eraseMode = ensureEl("zonesRemove").classList.contains("pressed");
    const landOnly = ensureEl<HTMLInputElement>("zonesBrushLandOnly").checked;
    const [x, y] = pointer(event, this);
    moveCircle(x, y, radius);

    let selection = radius > 5 ? findAll(x, y, radius) : [findCell(x, y)];
    if (landOnly) selection = selection.filter(i => pack.cells.h[i] >= 20);
    if (!selection.length) return;

    const zoneId = +((body.querySelector("div.selected") as HTMLElement | null)?.dataset.id ?? "0");
    const zone = pack.zones.find((z: Zone) => z.i === zoneId);
    if (!zone) return;

    if (eraseMode) {
      const data = zones
        .selectAll<SVGPolygonElement, ZoneCellDatum>("polygon")
        .data()
        .filter(d => !(d.zoneId === zoneId && selection.includes(d.cell)));
      zones
        .selectAll<SVGPolygonElement, ZoneCellDatum>("polygon")
        .data(data, d => `${d.zoneId}-${d.cell}`)
        .exit()
        .remove();
    } else {
      const data = selection.map(cell => ({ cell, zoneId, fill: zone.color }));
      zones
        .selectAll<SVGPolygonElement, ZoneCellDatum>("polygon")
        .data(data, d => `${d.zoneId}-${d.cell}`)
        .enter()
        .append("polygon")
        .attr("points", d => getPackPolygon(d.cell, worldContext.pack).join(" "))
        .attr("fill", d => d.fill)
        .attr("data-zone", d => d.zoneId)
        .attr("data-cell", d => d.cell);
    }
  }

  function moveZoneBrush(event: MouseEvent): void {
    showMainTip();
    const [px, py] = pointer(event);
    const radius = +ensureEl<HTMLInputElement>("zonesBrush").value;
    moveCircle(px, py, radius);
  }

  function applyZonesManualAssignent(): void {
    const data = zones.selectAll<SVGPolygonElement, ZoneCellDatum>("polygon").data();
    const zoneCells: Record<number, number[]> = data.reduce((acc: Record<number, number[]>, d) => {
      if (!acc[d.zoneId]) acc[d.zoneId] = [];
      acc[d.zoneId].push(d.cell);
      return acc;
    }, {});

    const filterBy = ensureEl<HTMLSelectElement>("zonesFilterType").value;
    const isFiltered = filterBy && filterBy !== "all";
    const visibleZones = pack.zones.filter((zone: Zone) => !zone.hidden && (!isFiltered || zone.type === filterBy));
    visibleZones.forEach((zone: Zone) => {
      zone.cells = zoneCells[zone.i] || [];
    });

    ZonesRenderer.render(worldContext, viewContext, appServices);
    zonesEditorAddLines();
    exitZonesManualAssignment();
  }

  function cancelZonesManualAssignent(): void {
    ZonesRenderer.render(worldContext, viewContext, appServices);
    exitZonesManualAssignment();
  }

  function exitZonesManualAssignment(close?: string): void {
    customization = 0;
    removeCircle();
    document.querySelectorAll("#zonesBottom > *").forEach(el => {
      (el as HTMLElement).style.display = "inline-block";
    });
    ensureEl("zonesManuallyButtons").style.display = "none";

    document
      .getElementById("zonesEditor")!
      .querySelectorAll(".hide:not(.show)")
      .forEach(el => {
        el.classList.remove("hidden");
      });
    (document.getElementById("zonesFooter") as HTMLElement).style.display = "block";
    body.querySelectorAll("div > input, select, svg").forEach(e => {
      (e as HTMLElement).style.pointerEvents = "all";
    });
    if (!close)
      openDialog("zonesEditor", { position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" } });

    restoreDefaultEvents?.();
    clearMainTip();

    const selected = body.querySelector("div.selected");
    if (selected) selected.classList.remove("selected");
  }

  function changeFill(fill: string, zone: Zone): void {
    const callback = (newFill: string) => {
      zone.color = newFill;
      ZonesRenderer.render(worldContext, viewContext, appServices);
      zonesEditorAddLines();
    };

    openPicker(fill, callback);
  }

  function toggleVisibility(zone: Zone): void {
    const isHidden = Boolean(zone.hidden);
    if (isHidden) delete zone.hidden;
    else zone.hidden = true;

    ZonesRenderer.render(worldContext, viewContext, appServices);
    zonesEditorAddLines();
  }

  function toggleFog(zone: Zone, cl: DOMTokenList): void {
    const inactive = cl.contains("inactive");
    cl.toggle("inactive");

    if (inactive) {
      const path = zones.select(`#zone${zone.i}`).attr("d");
      fog(`focusZone${zone.i}`, path);
    } else {
      unfog(`focusZone${zone.i}`);
    }
  }

  function toggleLegend(): void {
    if ((legend as Selection<SVGGElement, unknown, null, undefined>).selectAll("*").size()) {
      clearLegend();
      return;
    }

    const filterBy = ensureEl<HTMLSelectElement>("zonesFilterType").value;
    const isFiltered = filterBy && filterBy !== "all";
    const visibleZones = pack.zones.filter((zone: Zone) => !zone.hidden && (!isFiltered || zone.type === filterBy));
    const data = visibleZones.map(({ i, name, color }: Zone) => [`zone${i}`, color, name] as [string, string, string]);
    drawLegend("Zones", data);
  }

  function togglePercentageMode(): void {
    const zonesFooterCells = document.getElementById("zonesFooterCells") as HTMLElement;
    const zonesFooterArea = document.getElementById("zonesFooterArea") as HTMLElement;
    const zonesFooterPopulation = document.getElementById("zonesFooterPopulation") as HTMLElement;

    if (body.dataset.type === "absolute") {
      body.dataset.type = "percentage";
      const totalCells = +zonesFooterCells.innerHTML;
      const totalArea = +zonesFooterArea.dataset.area!;
      const totalPopulation = +zonesFooterPopulation.dataset.population!;

      body.querySelectorAll(":scope > div").forEach(el => {
        const div = el as HTMLElement;
        (div.querySelector(".stateCells") as HTMLElement).innerHTML =
          `${rn((+div.dataset.cells! / totalCells) * 100, 2)}%`;
        (div.querySelector(".biomeArea") as HTMLElement).innerHTML =
          `${rn((+div.dataset.area! / totalArea) * 100, 2)}%`;
        (div.querySelector(".zonePopulation") as HTMLElement).innerHTML =
          `${rn((+div.dataset.population! / totalPopulation) * 100, 2)}%`;
      });
    } else {
      body.dataset.type = "absolute";
      zonesEditorAddLines();
    }
  }

  function addZonesLayer(): void {
    const zoneId = pack.zones.length ? Math.max(...pack.zones.map((z: Zone) => z.i)) + 1 : 0;
    const name = "Unknown zone";
    const type = "Unknown";
    const color = `url(#hatch${zoneId % 42})`;
    pack.zones.push({ i: zoneId, name, type, color, cells: [] });

    zonesEditorAddLines();
    ZonesRenderer.render(worldContext, viewContext, appServices);
  }

  function downloadZonesData(): void {
    const areaUnitEl = document.getElementById("areaUnit") as HTMLSelectElement;
    const distanceUnitEl = document.getElementById("distanceUnitInput") as HTMLInputElement;
    const unit = areaUnitEl.value === "square" ? `${distanceUnitEl.value}2` : areaUnitEl.value;
    let data = `Id,Color,Description,Type,Cells,Area ${unit},Population\n`;

    body.querySelectorAll(":scope > div").forEach(el => {
      const div = el as HTMLElement;
      data += `${div.dataset.id},`;
      data += `${div.dataset.color},`;
      data += `${div.dataset.description},`;
      data += `${div.dataset.type},`;
      data += `${div.dataset.cells},`;
      data += `${div.dataset.area},`;
      data += `${div.dataset.population}\n`;
    });

    const name = `${getFileName("Zones")}.csv`;
    downloadFile(data, name);
  }

  function changeDescription(zone: Zone, value: string): void {
    zone.name = value;
    zones.select(`#zone${zone.i}`).attr("data-description", value);
  }

  function changeType(zone: Zone, value: string): void {
    zone.type = value;
    zones.select(`#zone${zone.i}`).attr("data-type", value);
  }

  function changePopulation(zone: Zone): void {
    const landCells = zone.cells.filter(i => pack.cells.h[i] >= 20);
    if (!landCells.length) {
      tip("Zone does not have any land cells, cannot change population", false, "error");
      return;
    }

    const burgs = pack.burgs.filter(
      (b: { removed?: boolean; cell: number }) => !b.removed && landCells.includes(b.cell)
    );
    const rural = rn(sum(landCells.map((i: number) => pack.cells.pop[i])) * populationRate);
    const urban = rn(
      sum(landCells.map((i: number) => pack.cells.burg[i]).map((b: number) => pack.burgs[b].population)) *
        populationRate *
        urbanization
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

    const ruralPopEl = document.getElementById("ruralPop") as HTMLInputElement;
    const urbanPopEl = document.getElementById("urbanPop") as HTMLInputElement;
    const totalPopEl = document.getElementById("totalPop") as HTMLElement;
    const totalPopPercEl = document.getElementById("totalPopPerc") as HTMLElement;

    const update = () => {
      const totalNew = ruralPopEl.valueAsNumber + urbanPopEl.valueAsNumber;
      if (Number.isNaN(totalNew)) return;
      totalPopEl.innerHTML = l(totalNew);
      totalPopPercEl.innerHTML = String(rn((totalNew / total) * 100));
    };

    ruralPopEl.oninput = () => update();
    urbanPopEl.oninput = () => update();

    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Change zone population",
      width: "24em",
      buttons: {
        Apply: () => {
          applyPopulationChange();
          /* $(this).dialog("close") removed */
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });

    function applyPopulationChange(): void {
      const ruralChange = ruralPopEl.valueAsNumber / rural;
      if (Number.isFinite(ruralChange) && ruralChange !== 1) {
        landCells.forEach(i => {
          pack.cells.pop[i] *= ruralChange;
        });
      }
      if (!Number.isFinite(ruralChange) && +ruralPopEl.value > 0) {
        const points = ruralPopEl.valueAsNumber / populationRate;
        const pop = rn(points / landCells.length);
        landCells.forEach(i => {
          pack.cells.pop[i] = pop;
        });
      }

      const urbanChange = urbanPopEl.valueAsNumber / urban;
      if (Number.isFinite(urbanChange) && urbanChange !== 1) {
        burgs.forEach(b => {
          b.population = rn((b.population ?? 0) * urbanChange, 4);
        });
      }
      if (!Number.isFinite(urbanChange) && +urbanPopEl.value > 0) {
        const points = urbanPopEl.valueAsNumber / populationRate / urbanization;
        const population = rn(points / burgs.length, 4);
        burgs.forEach(b => {
          b.population = population;
        });
      }

      if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
      zonesEditorAddLines();
    }
  }

  function zoneRemove(zone: Zone): void {
    confirmationDialog({
      title: "Remove zone",
      message: "Are you sure you want to remove the zone? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        pack.zones = pack.zones.filter((z: Zone) => z.i !== zone.i);
        zones.select(`#zone${zone.i}`).remove();
        unfog(`focusZone${zone.i}`);
        zonesEditorAddLines();
      }
    });
  }
}

export function initZonesEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
