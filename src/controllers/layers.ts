import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import {
  drawBiomes,
  drawBorders,
  drawBurgIcons,
  drawBurgLabels,
  drawCells,
  drawCoordinates,
  drawCultures,
  drawEmblems,
  drawFeatures,
  drawGrid,
  drawHeightmap,
  drawIce,
  drawMarkers,
  drawMilitary,
  drawPopulation,
  drawPrecipitation,
  drawProvinces,
  drawReliefIcons,
  drawReligions,
  drawRivers,
  drawRoutes,
  drawStateLabels,
  drawStates,
  drawTemperature,
  drawTexture,
  drawZones
} from "../renderers";
import { ensureEl, isCtrlClick, showPrompt } from "../utils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

// Layer presets: map preset name → list of toggle button IDs that should be ON
let presets: Record<string, string[]> = {};

export function initLayers(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices): void {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
  restoreCustomPresets();
  initSortable();
}

// ─── Preset management ───────────────────────────────────────────────────────

function getDefaultPresets(): Record<string, string[]> {
  return {
    political: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleIce",
      "toggleLabels",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    cultural: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleCultures",
      "toggleLabels",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    religions: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLabels",
      "toggleLakes",
      "toggleReligions",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    provinces: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLakes",
      "toggleProvinces",
      "toggleRivers",
      "toggleScaleBar",
      "toggleVignette"
    ],
    biomes: ["toggleBiomes", "toggleIce", "toggleLakes", "toggleRivers", "toggleScaleBar", "toggleVignette"],
    heightmap: ["toggleHeight", "toggleLakes", "toggleRivers", "toggleVignette"],
    physical: [
      "toggleCoordinates",
      "toggleHeight",
      "toggleIce",
      "toggleLakes",
      "toggleRivers",
      "toggleScaleBar",
      "toggleVignette"
    ],
    poi: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleHeight",
      "toggleIce",
      "toggleLakes",
      "toggleMarkers",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    military: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLabels",
      "toggleLakes",
      "toggleMilitary",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    emblems: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleIce",
      "toggleEmblems",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    landmass: ["toggleScaleBar"]
  };
}

function restoreCustomPresets(): void {
  presets = getDefaultPresets();
  const stored = localStorage.getItem("presets");
  const storedPresets: Record<string, string[]> | null = stored ? JSON.parse(stored) : null;
  if (!storedPresets) return;

  for (const preset in storedPresets) {
    if (presets[preset]) continue;
    ensureEl<HTMLSelectElement>("layersPreset").add(new Option(preset, preset));
  }
  presets = storedPresets;
}

function applyLayersPreset(): void {
  const preset = localStorage.getItem("preset") || ensureEl<HTMLSelectElement>("layersPreset").value;
  setLayersPreset(preset);

  const layers = presets[preset] ?? [];
  document.querySelectorAll<HTMLElement>("#mapLayers > li").forEach(el => {
    const shouldBeOn = layers.includes(el.id);
    if (shouldBeOn) el.classList.remove("buttonoff");
    else el.classList.add("buttonoff");
  });
}

function setLayersPreset(preset: string): void {
  ensureEl<HTMLSelectElement>("layersPreset").value = preset;
  localStorage.setItem("preset", preset);

  const isDefault = !!getDefaultPresets()[preset];
  ensureEl("removePresetButton").style.display = isDefault ? "none" : "inline-block";
  ensureEl("savePresetButton").style.display = "none";
}

function handleLayersPresetChange(preset: string): void {
  setLayersPreset(preset);

  const layers = presets[preset] ?? [];
  document.querySelectorAll<HTMLElement>("#mapLayers > li").forEach(el => {
    const isOn = layerIsOn(el.id);
    const shouldBeOn = layers.includes(el.id);
    if (shouldBeOn && !isOn) el.click();
    if (isOn && !shouldBeOn) el.click();
  });

  if (document.getElementById("canvas3d")) setTimeout(() => ThreeD.update(), 400);
}

function savePreset(): void {
  showPrompt("Please provide a preset name", { default: "" }, value => {
    const preset = String(value);
    presets[preset] = Array.from(ensureEl("mapLayers").querySelectorAll<HTMLElement>("li:not(.buttonoff)"))
      .map(node => node.id)
      .sort();
    ensureEl<HTMLSelectElement>("layersPreset").add(new Option(preset, preset, false, true));
    localStorage.setItem("presets", JSON.stringify(presets));
    localStorage.setItem("preset", preset);
    ensureEl("removePresetButton").style.display = "inline-block";
    ensureEl("savePresetButton").style.display = "none";
  });
}

function removePreset(): void {
  const layersPreset = ensureEl<HTMLSelectElement>("layersPreset");
  const preset = layersPreset.value;
  delete presets[preset];
  const index = Array.from(layersPreset.options).findIndex(o => o.value === preset);
  layersPreset.options.remove(index);
  layersPreset.value = "custom";
  ensureEl("removePresetButton").style.display = "none";
  ensureEl("savePresetButton").style.display = "inline-block";

  localStorage.setItem("presets", JSON.stringify(presets));
  localStorage.removeItem("preset");
}

function getCurrentPreset(): void {
  const layers = Array.from(document.querySelectorAll<HTMLElement>("#mapLayers > li:not(.buttonoff)"))
    .map(node => node.id)
    .sort();

  for (const preset in presets) {
    if (JSON.stringify(presets[preset].sort()) === JSON.stringify(layers)) {
      ensureEl<HTMLSelectElement>("layersPreset").value = preset;
      const isDefault = !!getDefaultPresets()[preset];
      ensureEl("removePresetButton").style.display = isDefault ? "none" : "inline-block";
      ensureEl("savePresetButton").style.display = "none";
      return;
    }
  }

  ensureEl<HTMLSelectElement>("layersPreset").value = "custom";
  ensureEl("removePresetButton").style.display = "none";
  ensureEl("savePresetButton").style.display = "inline-block";
}

// ─── Layer orchestration ──────────────────────────────────────────────────────

function drawLayers(): void {
  drawFeatures(worldContext, viewContext, appServices);
  if (layerIsOn("toggleTexture")) drawTexture(worldContext, viewContext, appServices);
  if (layerIsOn("toggleHeight")) drawHeightmap(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) drawBiomes(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCells")) drawCells(worldContext, viewContext, appServices);
  if (layerIsOn("toggleGrid")) drawGrid(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCoordinates")) drawCoordinates(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCompass")) {
    if (!compass.select("use").size()) compass.append("use").attr("xlink:href", "#defs-compass-rose");
    compass.style("display", "block");
  }
  if (layerIsOn("toggleRivers")) drawRivers(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRelief")) drawReliefIcons(worldContext, viewContext, appServices);
  if (layerIsOn("toggleReligions")) drawReligions(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCultures")) drawCultures(worldContext, viewContext, appServices);
  if (layerIsOn("toggleStates")) drawStates(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) drawProvinces(worldContext, viewContext, appServices);
  if (layerIsOn("toggleZones")) drawZones(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) drawBorders(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRoutes")) drawRoutes(worldContext, viewContext, appServices);
  if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  if (layerIsOn("togglePopulation")) drawPopulation(worldContext, viewContext, appServices);
  if (layerIsOn("toggleIce")) drawIce(worldContext, viewContext, appServices);
  if (layerIsOn("togglePrecipitation")) drawPrecipitation(worldContext, viewContext, appServices);
  if (layerIsOn("toggleEmblems")) drawEmblems(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) drawLabels();
  if (layerIsOn("toggleBurgIcons")) drawBurgIcons(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMilitary")) drawMilitary(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMarkers")) drawMarkers(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRulers")) rulers.draw();
}

function drawLabels(): void {
  drawStateLabels(worldContext, viewContext, appServices);
  drawBurgLabels(worldContext, viewContext, appServices);
  invokeActiveZooming();
}

// ─── Button helpers ───────────────────────────────────────────────────────────

function layerIsOn(el: string): boolean {
  return !ensureEl(el).classList.contains("buttonoff");
}

function turnButtonOff(el: string): void {
  ensureEl(el).classList.add("buttonoff");
  getCurrentPreset();
}

function turnButtonOn(el: string): void {
  ensureEl(el).classList.remove("buttonoff");
  getCurrentPreset();
}

// ─── Toggle functions ─────────────────────────────────────────────────────────

function toggleHeight(event?: MouseEvent): void {
  if (customization === 1) {
    tip("You cannot turn off the layer when heightmap is in edit mode", false, "error");
    return;
  }

  const children = terrs.selectAll("#oceanHeights > *, #landHeights > *");
  if (!children.size()) {
    turnButtonOn("toggleHeight");
    drawHeightmap(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("terrs");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("terrs");
      return;
    }
    turnButtonOff("toggleHeight");
    children.remove();
  }
}

function toggleTemperature(event?: MouseEvent): void {
  if (!temperature.selectAll("*").size()) {
    turnButtonOn("toggleTemperature");
    drawTemperature(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("temperature");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("temperature");
      return;
    }
    turnButtonOff("toggleTemperature");
    temperature.selectAll("*").remove();
  }
}

function toggleBiomes(event?: MouseEvent): void {
  if (!biomes.selectAll("path").size()) {
    turnButtonOn("toggleBiomes");
    drawBiomes(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("biomes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("biomes");
      return;
    }
    biomes.selectAll("path").remove();
    turnButtonOff("toggleBiomes");
  }
}

function togglePrecipitation(event?: MouseEvent): void {
  if (!prec.selectAll("circle").size()) {
    turnButtonOn("togglePrecipitation");
    drawPrecipitation(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("prec");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("prec");
      return;
    }
    turnButtonOff("togglePrecipitation");
    const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
    prec.selectAll("text").attr("opacity", 1).transition(hide).attr("opacity", 0);
    prec.selectAll("circle").transition(hide).attr("r", 0).remove();
    prec.transition().delay(1000).style("display", "none");
  }
}

function togglePopulation(event?: MouseEvent): void {
  if (!population.selectAll("line").size()) {
    turnButtonOn("togglePopulation");
    drawPopulation(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("population");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("population");
      return;
    }
    turnButtonOff("togglePopulation");

    const isD3data = population.select("line").datum();
    if (!isD3data) {
      population.selectAll("line").remove();
    } else {
      const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
      population
        .select("#rural")
        .selectAll("line")
        .transition(hide)
        .attr("y2", (d: unknown) => (d as [number, number])[1])
        .remove();
      population
        .select("#urban")
        .selectAll("line")
        .transition(hide)
        .delay(1000)
        .attr("y2", (d: unknown) => (d as [number, number])[1])
        .remove();
    }
  }
}

function toggleCells(event?: MouseEvent): void {
  if (!cells.selectAll("path").size()) {
    turnButtonOn("toggleCells");
    drawCells(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cells");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cells");
      return;
    }
    cells.selectAll("path").remove();
    turnButtonOff("toggleCells");
  }
}

function toggleIce(event?: MouseEvent): void {
  if (!layerIsOn("toggleIce")) {
    turnButtonOn("toggleIce");
    $("#ice").fadeIn();
    if (!ice.selectAll("*").size()) drawIce(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("ice");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("ice");
      return;
    }
    $("#ice").fadeOut();
    turnButtonOff("toggleIce");
  }
}

function toggleCultures(event?: MouseEvent): void {
  const activeCultures = pack.cultures.filter(c => c.i && !c.removed);
  const empty = !cults.selectAll("path").size();
  if (empty && activeCultures.length) {
    turnButtonOn("toggleCultures");
    drawCultures(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cults");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cults");
      return;
    }
    cults.selectAll("path").remove();
    turnButtonOff("toggleCultures");
  }
}

function toggleReligions(event?: MouseEvent): void {
  const activeReligions = pack.religions.filter(r => r.i && !r.removed);
  if (!relig.selectAll("path").size() && activeReligions.length) {
    turnButtonOn("toggleReligions");
    drawReligions(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("relig");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("relig");
      return;
    }
    relig.selectAll("path").remove();
    turnButtonOff("toggleReligions");
  }
}

function toggleStates(event?: MouseEvent): void {
  if (!layerIsOn("toggleStates")) {
    turnButtonOn("toggleStates");
    drawStates(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("regions");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("regions");
      return;
    }
    regions.selectAll("path").remove();
    turnButtonOff("toggleStates");
  }
}

function toggleBorders(event?: MouseEvent): void {
  if (!layerIsOn("toggleBorders")) {
    turnButtonOn("toggleBorders");
    drawBorders(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("borders");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("borders");
      return;
    }
    turnButtonOff("toggleBorders");
    borders.selectAll("path").remove();
  }
}

function toggleProvinces(event?: MouseEvent): void {
  if (!layerIsOn("toggleProvinces")) {
    turnButtonOn("toggleProvinces");
    drawProvinces(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("provs");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("provs");
      return;
    }
    provs.selectAll("*").remove();
    turnButtonOff("toggleProvinces");
  }
}

function toggleGrid(event?: MouseEvent): void {
  if (!gridOverlay.selectAll("*").size()) {
    turnButtonOn("toggleGrid");
    drawGrid(worldContext, viewContext, appServices);
    calculateFriendlyGridSize();
    if (event && isCtrlClick(event)) editStyle("gridOverlay");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("gridOverlay");
      return;
    }
    turnButtonOff("toggleGrid");
    gridOverlay.selectAll("*").remove();
  }
}

function toggleCoordinates(event?: MouseEvent): void {
  if (!coordinates.selectAll("*").size()) {
    turnButtonOn("toggleCoordinates");
    drawCoordinates(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("coordinates");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("coordinates");
      return;
    }
    turnButtonOff("toggleCoordinates");
    coordinates.selectAll("*").remove();
  }
}

function toggleCompass(event?: MouseEvent): void {
  if (!layerIsOn("toggleCompass")) {
    turnButtonOn("toggleCompass");
    if (!compass.select("use").size()) compass.append("use").attr("xlink:href", "#defs-compass-rose");
    $("#compass").fadeIn();
    if (event && isCtrlClick(event)) editStyle("compass");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("compass");
      return;
    }
    $("#compass").fadeOut();
    turnButtonOff("toggleCompass");
  }
}

function toggleRelief(event?: MouseEvent): void {
  if (!layerIsOn("toggleRelief")) {
    turnButtonOn("toggleRelief");
    if (!terrain.selectAll("*").size()) drawReliefIcons(worldContext, viewContext, appServices);
    $("#terrain").fadeIn();
    if (event && isCtrlClick(event)) editStyle("terrain");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("terrain");
      return;
    }
    $("#terrain").fadeOut();
    turnButtonOff("toggleRelief");
  }
}

function toggleLakes(event?: MouseEvent): void {
  if (!layerIsOn("toggleLakes")) {
    turnButtonOn("toggleLakes");
    $("#lakes").fadeIn();
    if (event && isCtrlClick(event)) editStyle("lakes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("lakes");
      return;
    }
    $("#lakes").fadeOut();
    turnButtonOff("toggleLakes");
  }
}

function toggleTexture(event?: MouseEvent): void {
  if (!layerIsOn("toggleTexture")) {
    turnButtonOn("toggleTexture");
    drawTexture(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("texture");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("texture");
      return;
    }
    turnButtonOff("toggleTexture");
    texture.select("image").remove();
  }
}

function toggleRivers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRivers")) {
    turnButtonOn("toggleRivers");
    drawRivers(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("rivers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("rivers");
      return;
    }
    rivers.selectAll("*").remove();
    turnButtonOff("toggleRivers");
  }
}

function toggleRoutes(event?: MouseEvent): void {
  if (!layerIsOn("toggleRoutes")) {
    turnButtonOn("toggleRoutes");
    drawRoutes(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("routes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("routes");
      return;
    }
    routes.selectAll("path").remove();
    turnButtonOff("toggleRoutes");
  }
}

function toggleMilitary(event?: MouseEvent): void {
  if (!layerIsOn("toggleMilitary")) {
    turnButtonOn("toggleMilitary");
    drawMilitary(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("armies");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("armies");
      return;
    }
    armies.selectAll("g").remove();
    turnButtonOff("toggleMilitary");
  }
}

function toggleMarkers(event?: MouseEvent): void {
  if (!layerIsOn("toggleMarkers")) {
    turnButtonOn("toggleMarkers");
    drawMarkers(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("markers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("markers");
      return;
    }
    markers.html("");
    turnButtonOff("toggleMarkers");
  }
}

function toggleLabels(event?: MouseEvent): void {
  if (!layerIsOn("toggleLabels")) {
    turnButtonOn("toggleLabels");
    $("#labels").fadeIn();
    if (labels.selectAll("text").size() === 0) drawLabels();
    if (event && isCtrlClick(event)) editStyle("labels");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("labels");
      return;
    }
    turnButtonOff("toggleLabels");
    $("#labels").fadeOut();
  }
}

function toggleBurgIcons(event?: MouseEvent): void {
  if (!layerIsOn("toggleBurgIcons")) {
    turnButtonOn("toggleBurgIcons");
    drawBurgIcons(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("burgIcons");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("burgIcons");
      return;
    }
    turnButtonOff("toggleBurgIcons");
    icons.selectAll("circle, use").remove();
  }
}

function toggleRulers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRulers")) {
    turnButtonOn("toggleRulers");
    if (event && isCtrlClick(event)) editStyle("ruler");
    rulers.draw();
    ruler.style("display", null);
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("ruler");
      return;
    }
    turnButtonOff("toggleRulers");
    ruler.selectAll("*").remove();
    ruler.style("display", "none");
  }
}

function toggleScaleBar(event?: MouseEvent): void {
  if (!layerIsOn("toggleScaleBar")) {
    turnButtonOn("toggleScaleBar");
    $("#scaleBar").fadeIn();
    if (event && isCtrlClick(event)) editStyle("scaleBar");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("scaleBar");
      return;
    }
    $("#scaleBar").fadeOut();
    turnButtonOff("toggleScaleBar");
  }
}

function toggleZones(event?: MouseEvent): void {
  if (!layerIsOn("toggleZones")) {
    turnButtonOn("toggleZones");
    drawZones(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("zones");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("zones");
      return;
    }
    turnButtonOff("toggleZones");
    zones.selectAll("*").remove();
  }
}

function toggleEmblems(event?: MouseEvent): void {
  if (!layerIsOn("toggleEmblems")) {
    turnButtonOn("toggleEmblems");
    if (!emblems.selectAll("use").size()) drawEmblems(worldContext, viewContext, appServices);
    $("#emblems").fadeIn();
    invokeActiveZooming();
    if (event && isCtrlClick(event)) editStyle("emblems");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("emblems");
      return;
    }
    $("#emblems").fadeOut();
    turnButtonOff("toggleEmblems");
  }
}

function toggleVignette(event?: MouseEvent): void {
  if (!layerIsOn("toggleVignette")) {
    turnButtonOn("toggleVignette");
    $("#vignette").fadeIn();
    if (event && isCtrlClick(event)) editStyle("vignette");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("vignette");
      return;
    }
    $("#vignette").fadeOut();
    turnButtonOff("toggleVignette");
  }
}

// ─── Layer reordering (jQuery UI sortable) ────────────────────────────────────

function initSortable(): void {
  $("#mapLayers").sortable({ items: "li:not(.solid)", containment: "parent", cancel: ".solid", update: moveLayer });
}

function moveLayer(_event: unknown, ui: { item: JQuery<HTMLElement> }): void {
  const el = getLayer(ui.item.attr("id") as string);
  if (!el) return;
  const prev = getLayer(ui.item.prev().attr("id") as string);
  const next = getLayer(ui.item.next().attr("id") as string);
  if (prev) el.insertAfter(prev);
  else if (next) el.insertBefore(next);
}

function getLayer(id: string): JQuery<HTMLElement> | null {
  if (id === "toggleLakes") return $("#lakes");
  if (id === "toggleHeight") return $("#terrs");
  if (id === "toggleBiomes") return $("#biomes");
  if (id === "toggleCells") return $("#cells");
  if (id === "toggleGrid") return $("#gridOverlay");
  if (id === "toggleCoordinates") return $("#coordinates");
  if (id === "toggleCompass") return $("#compass");
  if (id === "toggleRivers") return $("#rivers");
  if (id === "toggleRelief") return $("#terrain");
  if (id === "toggleReligions") return $("#relig");
  if (id === "toggleCultures") return $("#cults");
  if (id === "toggleStates") return $("#regions");
  if (id === "toggleProvinces") return $("#provs");
  if (id === "toggleBorders") return $("#borders");
  if (id === "toggleRoutes") return $("#routes");
  if (id === "toggleTemperature") return $("#temperature");
  if (id === "togglePrecipitation") return $("#prec");
  if (id === "togglePopulation") return $("#population");
  if (id === "toggleIce") return $("#ice");
  if (id === "toggleTexture") return $("#texture");
  if (id === "toggleEmblems") return $("#emblems");
  if (id === "toggleLabels") return $("#labels");
  if (id === "toggleBurgIcons") return $("#icons");
  if (id === "toggleMarkers") return $("#markers");
  if (id === "toggleRulers") return $("#ruler");
  return null;
}

// ─── Global exports ───────────────────────────────────────────────────────────

window.layerIsOn = layerIsOn;
window.turnButtonOn = turnButtonOn;
window.turnButtonOff = turnButtonOff;
window.getCurrentPreset = getCurrentPreset;
window.applyLayersPreset = applyLayersPreset;
window.drawLayers = drawLayers;
window.handleLayersPresetChange = handleLayersPresetChange;
window.savePreset = savePreset;
window.removePreset = removePreset;

window.toggleHeight = toggleHeight;
window.toggleTemperature = toggleTemperature;
window.toggleBiomes = toggleBiomes;
window.togglePrecipitation = togglePrecipitation;
window.togglePopulation = togglePopulation;
window.toggleCells = toggleCells;
window.toggleIce = toggleIce;
window.toggleCultures = toggleCultures;
window.toggleReligions = toggleReligions;
window.toggleStates = toggleStates;
window.toggleBorders = toggleBorders;
window.toggleProvinces = toggleProvinces;
window.toggleGrid = toggleGrid;
window.toggleCoordinates = toggleCoordinates;
window.toggleCompass = toggleCompass;
window.toggleRelief = toggleRelief;
window.toggleLakes = toggleLakes;
window.toggleTexture = toggleTexture;
window.toggleRivers = toggleRivers;
window.toggleRoutes = toggleRoutes;
window.toggleMilitary = toggleMilitary;
window.toggleMarkers = toggleMarkers;
window.toggleLabels = toggleLabels;
window.toggleBurgIcons = toggleBurgIcons;
window.toggleRulers = toggleRulers;
window.toggleScaleBar = toggleScaleBar;
window.toggleZones = toggleZones;
window.toggleEmblems = toggleEmblems;
window.toggleVignette = toggleVignette;

// d3 is the UMD global exposed by the legacy <script> tag in index.html
