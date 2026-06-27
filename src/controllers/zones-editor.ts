import { type D3DragEvent, drag, pointer, type Selection, sum } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { PopulationRenderer, ZonesRenderer } from "../renderers";
import { getZonesEditorState, setZonesEditorState } from "../store/zonesEditorState";
import type { Zone } from "../types/models";
import { isDialogOpen, openDialog } from "../ui/dialogs/dialogService";
import type { PopulationChangeConfig } from "../ui/dialogs/PopulationChangeDialog";
import { findAll, findCell, rn, unique } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName } from "../utils/editorHelpers";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, getArea, showMainTip, tip } from "../utils/uiHelpers";
import { toggleZones } from "./layers";
import { editStyle } from "./style";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

type ZoneCellDatum = { cell: number; zoneId: number; fill: string };

export const zonesEditorActions = {
  closeZonesEditor(): void {
    setZonesEditorState({ isOpen: false });
    exitZonesManualAssignment("close");
  },

  refresh(): void {
    zonesEditorAddLines();
  },

  editStyle(): void {
    editStyle("zones");
  },

  toggleLegend(): void {
    toggleLegend();
  },

  changeSort(_field: string): void {
    // sorting is handled by React Component, so we don't need to do anything here
  },

  enterManualAssignment(): void {
    enterZonesManualAssignent();
  },

  applyManualAssignment(): void {
    applyZonesManualAssignent();
  },

  cancelManualAssignment(): void {
    cancelZonesManualAssignent();
  },

  addZone(): void {
    addZonesLayer();
  },

  downloadCsv(): void {
    downloadZonesData();
  },

  selectZone(zoneId: number): void {
    const st = getZonesEditorState();
    if (st.customizationMode) {
      setZonesEditorState({ zones: st.zones.map(z => ({ ...z, focused: z.i === zoneId })) });
    }
  },

  changeColor(zoneId: number): void {
    const zone = worldContext.pack.zones.find(z => z.i === zoneId);
    if (zone) changeFill(zone.color, zone);
  },

  changeName(zoneId: number, val: string): void {
    const zone = worldContext.pack.zones.find(z => z.i === zoneId);
    if (zone) changeDescription(zone, val);
    zonesEditorAddLines();
  },

  changeType(zoneId: number, val: string): void {
    const zone = worldContext.pack.zones.find(z => z.i === zoneId);
    if (zone) changeType(zone, val);
    zonesEditorAddLines();
  },

  changePopulation(zoneId: number): void {
    const zone = worldContext.pack.zones.find(z => z.i === zoneId);
    if (zone) changePopulation(zone);
  },

  toggleVisibility(zoneId: number): void {
    const zone = worldContext.pack.zones.find(z => z.i === zoneId);
    if (zone) toggleVisibility(zone);
  },

  toggleFog(zoneId: number): void {
    const zone = worldContext.pack.zones.find(z => z.i === zoneId);
    if (zone) toggleFog(zone);
  },

  removeZone(zoneId: number): void {
    const zone = worldContext.pack.zones.find(z => z.i === zoneId);
    if (zone) zoneRemove(zone);
  },

  highlightOn(zoneId: number): void {
    viewContext.zones.select(`#zone${zoneId}`).style("outline", "1px solid red");
  },

  highlightOff(zoneId: number): void {
    viewContext.zones.select(`#zone${zoneId}`).style("outline", null);
  }
};

export function editZones(): void {
  if (isDialogOpen("zonesEditor")) return;

  if (!layerIsOn("toggleZones")) toggleZones();

  updateFilters();
  zonesEditorAddLines();
  setZonesEditorState({ isOpen: true });
  openDialog("zonesEditor");
}

function updateFilters(): void {
  const types = unique(worldContext.pack.zones.map((zone: Zone) => zone.type));
  setZonesEditorState({ types });
}

export function refreshZonesEditor(): void {
  zonesEditorAddLines();
}

function zonesEditorAddLines(): void {
  const st = getZonesEditorState();
  const filteredZones =
    st.filterBy === "all"
      ? worldContext.pack.zones
      : worldContext.pack.zones.filter((zone: Zone) => zone.type === st.filterBy);

  const lines = filteredZones.map(({ i, name, type, cells, color, hidden }: Zone) => {
    const area = getArea(sum(cells.map((idx: number) => worldContext.pack.cells.area[idx])));
    const rural = sum(cells.map((idx: number) => worldContext.pack.cells.pop[idx])) * worldContext.populationRate;
    const urban =
      sum(
        cells
          .map((idx: number) => worldContext.pack.cells.burg[idx])
          .map((b: number) => worldContext.pack.burgs[b].population)
      ) *
      worldContext.populationRate *
      worldContext.urbanization;
    const population = rn(rural + urban);
    const focused = viewContext.defs.select(`#fog #focusZone${i}`).size();

    return {
      i,
      name,
      type,
      cells: cells.length,
      area,
      population,
      rural,
      urban,
      color,
      hidden: !!hidden,
      focused: !!focused
    };
  });

  const totalArea = getArea(worldContext.graphWidth * worldContext.graphHeight);
  const totalPop =
    (sum(worldContext.pack.cells.pop) +
      sum(worldContext.pack.burgs.filter((b: { removed?: boolean }) => !b.removed).map(b => b.population ?? 0)) *
        worldContext.urbanization) *
    worldContext.populationRate;

  setZonesEditorState({
    zones: lines,
    totalZones: worldContext.pack.zones.length,
    totalCells: worldContext.pack.cells.i.length,
    totalArea,
    totalPopulation: totalPop
  });
}

function enterZonesManualAssignent(): void {
  if (!layerIsOn("toggleZones")) toggleZones();
  viewContext.customization = 10;
  setZonesEditorState({ customizationMode: 10 });

  tip("Click to select a zone, drag to paint a zone", true);
  viewContext.viewbox
    .style("cursor", "crosshair")
    .on("click", selectZoneOnMapClick)
    .call(drag<SVGGElement, unknown>().on("drag", dragZoneBrush))
    .on("touchmove mousemove", moveZoneBrush);

  viewContext.zones.selectAll("*").remove();

  const st = getZonesEditorState();
  const filterBy = st.filterBy;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = worldContext.pack.zones.filter(
    (zone: Zone) => !zone.hidden && (!isFiltered || zone.type === filterBy)
  );
  const data = visibleZones.flatMap(({ i, cells, color }: Zone) =>
    cells.map((cell: number) => ({ cell, zoneId: i, fill: color }))
  );
  viewContext.zones
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
  if (zoneId) {
    zonesEditorActions.selectZone(+zoneId);
  }
}

function dragZoneBrush(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
  if (!event.dx && !event.dy) return;
  const st = getZonesEditorState();
  const radius = st.brushSize;
  const eraseMode = event.sourceEvent.shiftKey;
  const landOnly = st.landOnlyBrush;
  const [x, y] = pointer(event, this);
  EditorBus.moveCircle(x, y, radius);

  let selection = radius > 5 ? findAll(x, y, radius) : [findCell(x, y)];
  if (landOnly) selection = selection.filter(i => worldContext.pack.cells.h[i] >= 20);
  if (!selection.length) return;

  const focusedZone = st.zones.find((z: { focused: boolean }) => z.focused);
  const zoneId = focusedZone?.i || 0;
  const zone = worldContext.pack.zones.find((z: Zone) => z.i === zoneId);
  if (!zone && !eraseMode) return;

  if (eraseMode) {
    const data = viewContext.zones
      .selectAll<SVGPolygonElement, ZoneCellDatum>("polygon")
      .data()
      .filter(d => !(d.zoneId === zoneId && selection.includes(d.cell)));
    viewContext.zones
      .selectAll<SVGPolygonElement, ZoneCellDatum>("polygon")
      .data(data, d => `${d.zoneId}-${d.cell}`)
      .exit()
      .remove();
  } else {
    const data = selection.map(cell => ({ cell, zoneId, fill: zone!.color }));
    viewContext.zones
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
  const st = getZonesEditorState();
  const radius = st.brushSize;
  EditorBus.moveCircle(px, py, radius);
}

function applyZonesManualAssignent(): void {
  const data = viewContext.zones.selectAll<SVGPolygonElement, ZoneCellDatum>("polygon").data();
  const zoneCells: Record<number, number[]> = data.reduce((acc: Record<number, number[]>, d) => {
    if (!acc[d.zoneId]) acc[d.zoneId] = [];
    acc[d.zoneId].push(d.cell);
    return acc;
  }, {});

  const st = getZonesEditorState();
  const filterBy = st.filterBy;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = worldContext.pack.zones.filter(
    (zone: Zone) => !zone.hidden && (!isFiltered || zone.type === filterBy)
  );
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

function exitZonesManualAssignment(_close?: string): void {
  viewContext.customization = 0;
  setZonesEditorState({ customizationMode: 0 });
  EditorBus.removeCircle();

  EditorBus.restoreDefaultEvents();
  clearMainTip();
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

function toggleFog(zone: Zone): void {
  const st = getZonesEditorState();
  const zRow = st.zones.find(z => z.i === zone.i);
  const inactive = !zRow?.focused;
  if (inactive) {
    const path = viewContext.zones.select(`#zone${zone.i}`).attr("d");
    EditorBus.fog(`focusZone${zone.i}`, path);
  } else {
    EditorBus.unfog(`focusZone${zone.i}`);
  }
  zonesEditorAddLines();
}

function toggleLegend(): void {
  if ((viewContext.legend as Selection<SVGGElement, unknown, null, undefined>).selectAll("*").size()) {
    EditorBus.clearLegend();
    return;
  }

  const st = getZonesEditorState();
  const filterBy = st.filterBy;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = worldContext.pack.zones.filter(
    (zone: Zone) => !zone.hidden && (!isFiltered || zone.type === filterBy)
  );
  const data = visibleZones.map(({ i, name, color }: Zone) => [`zone${i}`, color, name] as [string, string, string]);
  EditorBus.drawLegend("Zones", data);
}

function addZonesLayer(): void {
  const zoneId = worldContext.pack.zones.length ? Math.max(...worldContext.pack.zones.map((z: Zone) => z.i)) + 1 : 0;
  const name = "Unknown zone";
  const type = "Unknown";
  const color = `url(#hatch${zoneId % 42})`;
  worldContext.pack.zones.push({ i: zoneId, name, type, color, cells: [] });

  zonesEditorAddLines();
  ZonesRenderer.render(worldContext, viewContext, appServices);
}

function downloadZonesData(): void {
  const st = getZonesEditorState();
  const unit = "sq";
  let data = `Id,Color,Description,Type,Cells,Area ${unit},Population\n`;

  st.zones.forEach(z => {
    data += `${z.i},`;
    data += `${z.color},`;
    data += `${z.name},`;
    data += `${z.type},`;
    data += `${z.cells},`;
    data += `${z.area},`;
    data += `${z.population}\n`;
  });

  const name = `${getFileName("Zones")}.csv`;
  downloadFile(data, name);
}

function changeDescription(zone: Zone, value: string): void {
  zone.name = value;
  viewContext.zones.select(`#zone${zone.i}`).attr("data-description", value);
}

function changeType(zone: Zone, value: string): void {
  zone.type = value;
  viewContext.zones.select(`#zone${zone.i}`).attr("data-type", value);
}

function changePopulation(zone: Zone): void {
  const landCells = zone.cells.filter(i => worldContext.pack.cells.h[i] >= 20);
  if (!landCells.length) {
    tip("Zone does not have any land cells, cannot change population", false, "error");
    return;
  }

  const burgs = worldContext.pack.burgs.filter(
    (b: { removed?: boolean; cell: number }) => !b.removed && landCells.includes(b.cell)
  );
  const rural = rn(sum(landCells.map((i: number) => worldContext.pack.cells.pop[i])) * worldContext.populationRate);
  const urban = rn(
    sum(
      landCells
        .map((i: number) => worldContext.pack.cells.burg[i])
        .map((b: number) => worldContext.pack.burgs[b].population)
    ) *
      worldContext.populationRate *
      worldContext.urbanization
  );
  const total = rural + urban;
  const l = (n: number) => Number(n).toLocaleString();

  const config: PopulationChangeConfig = {
    title: "Change zone population",
    description: `Total: ${l(total)}`,
    initialRural: rural,
    initialUrban: urban,
    urbanDisabled: !burgs.length,
    onApply: (newRural, newUrban) => {
      const ruralChange = newRural / rural;
      if (Number.isFinite(ruralChange) && ruralChange !== 1) {
        landCells.forEach(i => {
          worldContext.pack.cells.pop[i] *= ruralChange;
        });
      }
      if (!Number.isFinite(ruralChange) && newRural > 0) {
        const pop = rn(newRural / worldContext.populationRate / landCells.length);
        landCells.forEach(i => {
          worldContext.pack.cells.pop[i] = pop;
        });
      }

      const urbanChange = newUrban / urban;
      if (Number.isFinite(urbanChange) && urbanChange !== 1) {
        burgs.forEach(b => {
          b.population = rn((b.population ?? 0) * urbanChange, 4);
        });
      }
      if (!Number.isFinite(urbanChange) && newUrban > 0) {
        const population = rn(newUrban / worldContext.populationRate / worldContext.urbanization / burgs.length, 4);
        burgs.forEach(b => {
          b.population = population;
        });
      }

      if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
      zonesEditorAddLines();
    }
  };
  openDialog("populationChangeDialog", config);
}

function zoneRemove(zone: Zone): void {
  confirmationDialog({
    title: "Remove zone",
    message: "Are you sure you want to remove the zone? <br>This action cannot be reverted",
    confirm: "Remove",
    onConfirm: () => {
      worldContext.pack.zones = worldContext.pack.zones.filter((z: Zone) => z.i !== zone.i);
      viewContext.zones.select(`#zone${zone.i}`).remove();
      EditorBus.unfog(`focusZone${zone.i}`);
      zonesEditorAddLines();
    }
  });
}

export function initZonesEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
