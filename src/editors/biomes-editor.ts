import { drag, easeSinIn, pointer, type Selection, sum } from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import {
  clearLegend,
  downloadFile,
  drawLegend,
  getFileName,
  moveCircle,
  restoreDefaultEvents
} from "../controllers/editors";
import {
  layerIsOn,
  toggleBiomes,
  toggleCultures,
  toggleProvinces,
  toggleRelief,
  toggleReligions,
  toggleStates
} from "../controllers/layers";
import { editStyle } from "../controllers/style";
import { Biomes } from "../modules/biomes";
import { BiomesRenderer, ReliefIconsRenderer } from "../renderers";
import type { BiomeRow, BiomesFooter } from "../store/biomesEditorStore";
import { useBiomesEditorStore } from "../store/biomesEditorStore";
import { modules } from "../store/editorState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { findAll, findCell, getRandomColor, isLand, openURL, rn, si } from "../utils";
import { getPackPolygon } from "../utils/graphUtils";
import { clearMainTip, fitContent, getArea, getAreaUnit, removeCircle, showMainTip, tip } from "../utils/uiHelpers";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

export function editBiomes(): void {
  if (viewContext.customization) return;
  closeDialogs("#biomesEditor, .stable");
  if (!layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleReligions")) toggleReligions();
  if (layerIsOn("toggleProvinces")) toggleProvinces();

  biomesRefresh();

  if (modules.editBiomes) return;
  modules.editBiomes = true;

  openDialog("biomesEditor", {
    title: "Biomes Editor",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg" }
  });
}

export function biomesRefresh(): void {
  collectStatistics();
  buildRows();
}

function collectStatistics(): void {
  const cells = worldContext.pack.cells;
  const array = new Uint8Array(worldContext.biomesData.i.length);
  worldContext.biomesData.cells = Array.from(array);
  worldContext.biomesData.area = Array.from(array);
  worldContext.biomesData.rural = Array.from(array);
  worldContext.biomesData.urban = Array.from(array);

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    const b = cells.biome[i];
    worldContext.biomesData.cells![b] += 1;
    worldContext.biomesData.area![b] += cells.area[i];
    worldContext.biomesData.rural![b] += cells.pop[i];
    if (cells.burg[i]) worldContext.biomesData.urban![b] += worldContext.pack.burgs[cells.burg[i]]?.population ?? 0;
  }
}

function buildRows(): void {
  const unit = ` ${getAreaUnit()}`;
  const b = worldContext.biomesData;
  const rows: BiomeRow[] = [];
  let totalArea = 0;
  let totalPopulation = 0;

  for (const i of b.i) {
    if (!i || b.name[i] === "removed") continue;
    const area = getArea(b.area![i]);
    const rural = b.rural![i] * worldContext.populationRate;
    const urban = b.urban![i] * worldContext.populationRate * worldContext.urbanization;
    const population = rn(rural + urban);
    const populationTip = `Total population: ${si(population)}; Rural population: ${si(rural)}; Urban population: ${si(urban)}`;
    totalArea += area;
    totalPopulation += population;

    rows.push({
      i,
      name: b.name[i],
      habitability: b.habitability[i],
      color: b.color[i],
      cells: b.cells![i],
      area,
      population,
      populationTip,
      canRemove: i > 12 && !b.cells![i]
    });
  }

  const totalMapArea = getArea(sum(worldContext.pack.cells.area));
  const footer: BiomesFooter = {
    biomes: rows.length,
    cells: worldContext.pack.cells.h.filter(h => h >= 20).length,
    totalArea,
    mapArea: totalMapArea,
    totalPopulation,
    unit
  };

  useBiomesEditorStore.getState().setData(rows, footer);
}

export function biomesHighlightOn(biomeId: number): void {
  if (viewContext.customization === 6) return;
  (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select(`#biome${biomeId}`)
    .raise()
    .transition()
    .duration(2000)
    .ease(easeSinIn)
    .attr("stroke-width", 2)
    .attr("stroke", "#cd4c11");
}

export function biomesHighlightOff(biomeId: number): void {
  if (viewContext.customization === 6) return;
  const color = worldContext.biomesData.color[biomeId];
  (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select(`#biome${biomeId}`)
    .transition()
    .attr("stroke-width", 0.7)
    .attr("stroke", color);
}

export function biomesChangeColor(biomeId: number, currentColor: string): void {
  const callback = (newFill: string) => {
    worldContext.biomesData.color[biomeId] = newFill;
    (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>)
      .select(`#biome${biomeId}`)
      .attr("fill", newFill)
      .attr("stroke", newFill);
    useBiomesEditorStore.getState().updateRowColor(biomeId, newFill);
  };
  openPicker(currentColor, callback);
}

export function biomesChangeName(biomeId: number, name: string): void {
  worldContext.biomesData.name[biomeId] = name;
  useBiomesEditorStore.getState().updateRowName(biomeId, name);
}

export function biomesChangeHabitability(biomeId: number, value: string): void {
  const num = +value;
  if (Number.isNaN(num) || num < 0 || num > 9999) {
    tip("Please provide a valid number in range 0-9999", false, "error");
    return;
  }
  worldContext.biomesData.habitability[biomeId] = num;
  recalculatePopulation();
  biomesRefresh();
}

export function biomesOpenWiki(biomeName: string): void {
  if (biomeName === "Custom" || !biomeName) {
    tip("Please fill in the biome name", false, "error");
    return;
  }
  const wikiBase = "https://en.wikipedia.org/wiki/";
  const pages: Record<string, string> = {
    "Hot desert": "Desert_climate#Hot_desert_climates",
    "Cold desert": "Desert_climate#Cold_desert_climates",
    Savanna: "Tropical_and_subtropical_grasslands,_savannas,_and_shrublands",
    Grassland: "Temperate_grasslands,_savannas,_and_shrublands",
    "Tropical seasonal forest": "Seasonal_tropical_forest",
    "Temperate deciduous forest": "Temperate_deciduous_forest",
    "Tropical rainforest": "Tropical_rainforest",
    "Temperate rainforest": "Temperate_rainforest",
    Taiga: "Taiga",
    Tundra: "Tundra",
    Glacier: "Glacier",
    Wetland: "Wetland"
  };
  openURL(pages[biomeName] ? wikiBase + pages[biomeName] : `https://en.wikipedia.org/w/index.php?search=${biomeName}`);
}

export function biomesToggleLegend(): void {
  if ((viewContext.legend as Selection<SVGGElement, unknown, null, undefined>).selectAll("*").size()) {
    clearLegend();
    return;
  }
  const d = worldContext.biomesData;
  const data = Array.from(d.i)
    .filter(i => d.cells![i])
    .sort((a, b) => d.area![b] - d.area![a])
    .map(i => [i, d.color[i], d.name[i]] as [number, string, string]);
  drawLegend("Biomes", data);
}

export function biomesToggleDisplayMode(): void {
  useBiomesEditorStore.getState().toggleDisplayMode();
}

export function biomesAddCustomBiome(): void {
  const b = worldContext.biomesData;
  const i = b.i.length;
  if (i > 254) {
    tip("Maximum number of biomes reached (255), data cleansing is required", false, "error");
    return;
  }
  b.i.push(i);
  b.color.push(getRandomColor());
  b.habitability.push(50);
  b.name.push("Custom");
  b.iconsDensity.push(0);
  b.icons.push([]);
  b.cost.push(50);
  b.rural!.push(0);
  b.urban!.push(0);
  b.cells!.push(0);
  b.area!.push(0);

  useBiomesEditorStore.getState().addRow({
    i,
    name: "Custom",
    habitability: 50,
    color: b.color[i],
    cells: 0,
    area: 0,
    population: 0,
    populationTip: "Total population: 0; Rural population: 0; Urban population: 0",
    canRemove: true
  });
}

export function biomesRemoveCustomBiome(biomeId: number): void {
  worldContext.biomesData.name[biomeId] = "removed";
  useBiomesEditorStore.getState().removeRow(biomeId);
}

export function biomesRegenerateIcons(): void {
  ReliefIconsRenderer.render(worldContext, viewContext, appServices);
  if (!layerIsOn("toggleRelief")) toggleRelief();
}

export function biomesDownloadData(rows: BiomeRow[]): void {
  const unit = getAreaUnit("2");
  let data = `Id,Biome,Color,Habitability,Cells,Area ${unit},Population\n`;
  rows.forEach(row => {
    data += `${row.i},${row.name},${row.color},${row.habitability}%,${row.cells},${row.area},${row.population}\n`;
  });
  downloadFile(data, `${getFileName("Biomes")}.csv`);
}

export function biomesEditStyle(): void {
  editStyle("biomes");
}

export function biomesEnterCustomization(): void {
  if (!layerIsOn("toggleBiomes")) toggleBiomes();
  viewContext.customization = 6;
  (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>).append("g").attr("id", "temp");

  const { rows } = useBiomesEditorStore.getState();
  useBiomesEditorStore.getState().setCustomizationMode(true);
  useBiomesEditorStore.getState().setSelectedBiomeId(rows[0]?.i ?? null);

  tip("Click on biome to select, drag the circle to change biome", true);
  viewContext.viewbox
    .style("cursor", "crosshair")
    .on("click", selectBiomeOnMapClick)
    .call(drag<SVGGElement, unknown>().on("drag", dragBiomeBrush))
    .on("touchmove mousemove", moveBiomeBrush);
}

export function biomesSelectOnLine(biomeId: number): void {
  useBiomesEditorStore.getState().setSelectedBiomeId(biomeId);
}

function selectBiomeOnMapClick(event: MouseEvent): void {
  const [px, py] = pointer(event);
  const i = findCell(px, py);
  if (worldContext.pack.cells.h[i] < 20) {
    tip("You cannot reassign water via biomes. Please edit the Heightmap to change water", false, "error");
    return;
  }
  const assigned = (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select("#temp")
    .select(`polygon[data-cell='${i}']`);
  const biome = assigned.size() ? +assigned.attr("data-biome") : worldContext.pack.cells.biome[i];
  useBiomesEditorStore.getState().setSelectedBiomeId(biome);
}

function dragBiomeBrush(this: SVGElement, event: import("d3").D3DragEvent<SVGElement, unknown, unknown>): void {
  if (!event.dx && !event.dy) return;
  const r = +(document.getElementById("biomesBrush") as HTMLInputElement).value;
  const [px, py] = pointer(event, this);
  moveCircle(px, py, r);
  const found = r > 5 ? findAll(px, py, r) : [findCell(px, py)];
  const selection = found.filter(i => isLand(i, worldContext.pack));
  if (selection.length) changeBiomeForSelection(selection);
}

function changeBiomeForSelection(selection: number[]): void {
  const temp = (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>).select("#temp");
  const { selectedBiomeId } = useBiomesEditorStore.getState();
  const biomeNew = String(selectedBiomeId ?? 0);
  const color = worldContext.biomesData.color[selectedBiomeId ?? 0];

  selection.forEach(i => {
    const exists = temp.select(`polygon[data-cell='${i}']`);
    const biomeOld = exists.size() ? +exists.attr("data-biome") : worldContext.pack.cells.biome[i];
    if (+biomeNew === biomeOld) return;

    if (exists.size()) exists.attr("data-biome", biomeNew).attr("fill", color).attr("stroke", color);
    else
      temp
        .append("polygon")
        .attr("data-cell", i)
        .attr("data-biome", biomeNew)
        .attr("points", getPackPolygon(i, worldContext.pack).join(" "))
        .attr("fill", color)
        .attr("stroke", color);
  });
}

function moveBiomeBrush(event: MouseEvent): void {
  showMainTip();
  const [px, py] = pointer(event);
  const radius = +(document.getElementById("biomesBrush") as HTMLInputElement).value;
  moveCircle(px, py, radius);
}

export function biomesApplyChange(): void {
  const changed = (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select("#temp")
    .selectAll("polygon");
  changed.each(function () {
    const el = this as SVGPolygonElement;
    const i = +el.dataset.cell!;
    const b = +el.dataset.biome!;
    worldContext.pack.cells.biome[i] = b;
  });

  if (changed.size()) {
    BiomesRenderer.render(worldContext, viewContext, appServices);
    biomesRefresh();
  }
  biomesExitCustomization();
}

export function biomesExitCustomization(close?: string): void {
  viewContext.customization = 0;
  (viewContext.biomes as Selection<SVGGElement, unknown, null, undefined>).select("#temp").remove();
  removeCircle();
  useBiomesEditorStore.getState().setCustomizationMode(false);
  useBiomesEditorStore.getState().setSelectedBiomeId(null);
  restoreDefaultEvents?.();
  clearMainTip();
  void close; // consumed by caller when closing the dialog
}

export function biomesRestoreDefaults(): void {
  worldContext.biomesData = Biomes.getDefault();
  Biomes.define(getWorldState());
  BiomesRenderer.render(worldContext, viewContext, appServices);
  recalculatePopulation();
  biomesRefresh();
}

export function initBiomesEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices): void {
  worldContext = wc;
  viewContext = vc as ViewContext;
  appServices = as;
}
