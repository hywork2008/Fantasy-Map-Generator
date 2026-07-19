import { drag, easeSinIn, pointer, type Selection, sum } from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { BiomesRenderer, ReliefIconsRenderer } from "../renderers";
import { legacyMutation } from "../runtime/worldRuntime";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, showMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import type { BiomeRow, BiomesFooter } from "../store/biomesEditorStore";
import { useBiomesEditorStore } from "../store/biomesEditorStore";
import { isDialogOpen, openDialog } from "../ui/dialogs/dialogService";
import { findAll, findCell, getRandomColor, isLand, openURL, rn, si } from "../utils";
import { getArea, getAreaUnit } from "../utils/domUtils";
import { EditorBus } from "../utils/editorBus";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { toggleBiomes, toggleCultures, toggleProvinces, toggleRelief, toggleReligions, toggleStates } from "./layers";
import { editStyle } from "./style";
import { recalculatePopulation } from "./tools";

let worldContext: WorldContext;
let appServices: AppServices;

export function editBiomes(): void {
  if (view.customization) return;
  if (isDialogOpen("biomesEditor")) return;

  if (!layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleReligions")) toggleReligions();
  if (layerIsOn("toggleProvinces")) toggleProvinces();

  biomesRefresh();

  openDialog("biomesEditor");
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
  if (view.customization === 6) return;
  (view.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select(`#biome${biomeId}`)
    .raise()
    .transition()
    .duration(2000)
    .ease(easeSinIn)
    .attr("stroke-width", 2)
    .attr("stroke", "#cd4c11");
}

export function biomesHighlightOff(biomeId: number): void {
  if (view.customization === 6) return;
  const color = worldContext.biomesData.color[biomeId];
  (view.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select(`#biome${biomeId}`)
    .transition()
    .attr("stroke-width", 0.7)
    .attr("stroke", color);
}

export function biomesChangeColor(biomeId: number, currentColor: string): void {
  const callback = (newFill: string) => {
    worldContext.biomesData.color[biomeId] = newFill;
    (view.biomes as Selection<SVGGElement, unknown, null, undefined>)
      .select(`#biome${biomeId}`)
      .attr("fill", newFill)
      .attr("stroke", newFill);
    useBiomesEditorStore.getState().updateRowColor(biomeId, newFill);
  };
  EditorBus.openPicker(currentColor, callback);
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
  if ((view.legend as Selection<SVGGElement, unknown, null, undefined>).selectAll("*").size()) {
    EditorBus.clearLegend();
    return;
  }
  const d = worldContext.biomesData;
  const data = Array.from(d.i)
    .filter(i => d.cells![i])
    .sort((a, b) => d.area![b] - d.area![a])
    .map(i => [i, d.color[i], d.name[i]] as [number, string, string]);
  EditorBus.drawLegend("GenerationPipeline.Biomes", data);
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
  downloadFile(data, `${getFileName("GenerationPipeline.Biomes")}.csv`);
}

export function biomesEditStyle(): void {
  editStyle("biomes");
}

export function biomesEnterCustomization(): void {
  if (!layerIsOn("toggleBiomes")) toggleBiomes();
  view.setCustomization(6);
  (view.biomes as Selection<SVGGElement, unknown, null, undefined>).append("g").attr("id", "temp");

  const { rows } = useBiomesEditorStore.getState();
  useBiomesEditorStore.getState().setCustomizationMode(true);
  useBiomesEditorStore.getState().setSelectedBiomeId(rows[0]?.i ?? null);

  tip("Click on biome to select, drag the circle to change biome", true);
  view.viewbox
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
  const assigned = (view.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select("#temp")
    .select(`polygon[data-cell='${i}']`);
  const biome = assigned.size() ? +assigned.attr("data-biome") : worldContext.pack.cells.biome[i];
  useBiomesEditorStore.getState().setSelectedBiomeId(biome);
}

function dragBiomeBrush(this: SVGElement, event: import("d3").D3DragEvent<SVGElement, unknown, unknown>): void {
  if (!event.dx && !event.dy) return;
  const r = useBiomesEditorStore.getState().brushSize;
  const [px, py] = pointer(event, this);
  EditorBus.moveCircle(px, py, r);
  const found = r > 5 ? findAll(px, py, r) : [findCell(px, py)];
  const selection = found.filter(i => isLand(i, worldContext.pack));
  if (selection.length) changeBiomeForSelection(selection);
}

function changeBiomeForSelection(selection: number[]): void {
  const temp = (view.biomes as Selection<SVGGElement, unknown, null, undefined>).select("#temp");
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
  const radius = useBiomesEditorStore.getState().brushSize;
  EditorBus.moveCircle(px, py, radius);
}

export function biomesApplyChange(): void {
  const changed = (view.biomes as Selection<SVGGElement, unknown, null, undefined>)
    .select("#temp")
    .selectAll("polygon");
  if (changed.size()) {
    legacyMutation(() => {
      changed.each(function () {
        const el = this as SVGPolygonElement;
        const i = +el.dataset.cell!;
        const b = +el.dataset.biome!;
        worldContext.pack.cells.biome[i] = b;
      });
      return { result: undefined, topics: ["map.physical"] };
    });
    BiomesRenderer.render(worldContext, viewContext, appServices);
    biomesRefresh();
  }
  biomesExitCustomization();
}

export function biomesExitCustomization(close?: string): void {
  view.setCustomization(0);
  (view.biomes as Selection<SVGGElement, unknown, null, undefined>).select("#temp").remove();
  EditorBus.removeCircle();
  useBiomesEditorStore.getState().setCustomizationMode(false);
  useBiomesEditorStore.getState().setSelectedBiomeId(null);
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  if (close === "close") {
    // modules flag managed by CommonEditorDialog cleanup
  }
}

export function biomesRestoreDefaults(): void {
  worldContext.biomesData = GenerationPipeline.Biomes.getDefault();
  GenerationPipeline.Biomes.define(getWorldState());
  BiomesRenderer.render(worldContext, viewContext, appServices);
  recalculatePopulation();
  biomesRefresh();
}

export function initBiomesEditor(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices): void {
  worldContext = wc;
  appServices = as;
}

document.addEventListener("fmg:refresh-editors", () => {
  if (isDialogOpen("biomesEditor")) biomesRefresh();
});
document.addEventListener("fmg:edit-biomes", () => editBiomes());
