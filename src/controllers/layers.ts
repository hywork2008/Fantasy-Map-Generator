import * as d3 from "d3";
import { invokeActiveZooming } from "../main";
import {
  drawBiomes,
  drawBorders,
  drawBurgIcons,
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
  drawStates,
  drawTemperature,
  drawTexture,
  drawZones
} from "../renderers";
import { ensureEl, isCtrlClick } from "../utils";
import { ThreeD } from "./3d";
import { rulers } from "./measurers";
import { calculateFriendlyGridSize, editStyle } from "./style";

// Layer presets: map preset name → list of toggle button IDs that should be ON
let presets: Record<string, string[]> = {};

restoreCustomPresets();
initSortable();

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

export function applyLayersPreset(): void {
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

export function handleLayersPresetChange(preset: string): void {
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

export function savePreset(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).prompt("Please provide a preset name", { default: "" }, (preset: string) => {
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

export function removePreset(): void {
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

export function getCurrentPreset(): void {
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

export function drawLayers(): void {
  drawFeatures();
  if (layerIsOn("toggleTexture")) drawTexture();
  if (layerIsOn("toggleHeight")) drawHeightmap();
  if (layerIsOn("toggleBiomes")) drawBiomes();
  if (layerIsOn("toggleCells")) drawCells();
  if (layerIsOn("toggleGrid")) drawGrid();
  if (layerIsOn("toggleCoordinates")) drawCoordinates();
  if (layerIsOn("toggleCompass")) {
    if (!compass.select("use").size()) compass.append("use").attr("xlink:href", "#defs-compass-rose");
    compass.style("display", "block");
  }
  if (layerIsOn("toggleRivers")) drawRivers();
  if (layerIsOn("toggleRelief")) drawReliefIcons();
  if (layerIsOn("toggleReligions")) drawReligions();
  if (layerIsOn("toggleCultures")) drawCultures();
  if (layerIsOn("toggleStates")) drawStates();
  if (layerIsOn("toggleProvinces")) drawProvinces();
  if (layerIsOn("toggleZones")) drawZones();
  if (layerIsOn("toggleBorders")) drawBorders();
  if (layerIsOn("toggleRoutes")) drawRoutes();
  if (layerIsOn("toggleTemperature")) drawTemperature();
  if (layerIsOn("togglePopulation")) drawPopulation();
  if (layerIsOn("toggleIce")) drawIce();
  if (layerIsOn("togglePrecipitation")) drawPrecipitation();
  if (layerIsOn("toggleEmblems")) drawEmblems();
  if (layerIsOn("toggleLabels")) drawLabels();
  if (layerIsOn("toggleBurgIcons")) drawBurgIcons();
  if (layerIsOn("toggleMilitary")) drawMilitary();
  if (layerIsOn("toggleMarkers")) drawMarkers();
  if (layerIsOn("toggleRulers")) rulers.draw();
}

function drawLabels(): void {
  drawStateLabels();
  drawBurgLabels();
  invokeActiveZooming();
}

// ─── Button helpers ───────────────────────────────────────────────────────────

export function layerIsOn(el: string): boolean {
  return !ensureEl(el).classList.contains("buttonoff");
}

export function turnButtonOff(el: string): void {
  ensureEl(el).classList.add("buttonoff");
  getCurrentPreset();
}

export function turnButtonOn(el: string): void {
  ensureEl(el).classList.remove("buttonoff");
  getCurrentPreset();
}

// ─── Toggle functions ─────────────────────────────────────────────────────────

export function toggleHeight(event?: MouseEvent): void {
  if (customization === 1) {
    tip("You cannot turn off the layer when heightmap is in edit mode", false, "error");
    return;
  }

  const children = terrs.selectAll("#oceanHeights > *, #landHeights > *");
  if (!children.size()) {
    turnButtonOn("toggleHeight");
    drawHeightmap();
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

export function toggleTemperature(event?: MouseEvent): void {
  if (!temperature.selectAll("*").size()) {
    turnButtonOn("toggleTemperature");
    drawTemperature();
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

export function toggleBiomes(event?: MouseEvent): void {
  if (!biomes.selectAll("path").size()) {
    turnButtonOn("toggleBiomes");
    drawBiomes();
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

export function togglePrecipitation(event?: MouseEvent): void {
  if (!prec.selectAll("circle").size()) {
    turnButtonOn("togglePrecipitation");
    drawPrecipitation();
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

export function togglePopulation(event?: MouseEvent): void {
  if (!population.selectAll("line").size()) {
    turnButtonOn("togglePopulation");
    drawPopulation();
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

export function toggleCells(event?: MouseEvent): void {
  if (!cells.selectAll("path").size()) {
    turnButtonOn("toggleCells");
    drawCells();
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

export function toggleIce(event?: MouseEvent): void {
  if (!layerIsOn("toggleIce")) {
    turnButtonOn("toggleIce");
    $("#ice").fadeIn();
    if (!ice.selectAll("*").size()) drawIce();
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

export function toggleCultures(event?: MouseEvent): void {
  const activeCultures = pack.cultures.filter(c => c.i && !c.removed);
  const empty = !cults.selectAll("path").size();
  if (empty && activeCultures.length) {
    turnButtonOn("toggleCultures");
    drawCultures();
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

export function toggleReligions(event?: MouseEvent): void {
  const activeReligions = pack.religions.filter(r => r.i && !r.removed);
  if (!relig.selectAll("path").size() && activeReligions.length) {
    turnButtonOn("toggleReligions");
    drawReligions();
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

export function toggleStates(event?: MouseEvent): void {
  if (!layerIsOn("toggleStates")) {
    turnButtonOn("toggleStates");
    drawStates();
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

export function toggleBorders(event?: MouseEvent): void {
  if (!layerIsOn("toggleBorders")) {
    turnButtonOn("toggleBorders");
    drawBorders();
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

export function toggleProvinces(event?: MouseEvent): void {
  if (!layerIsOn("toggleProvinces")) {
    turnButtonOn("toggleProvinces");
    drawProvinces();
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

export function toggleGrid(event?: MouseEvent): void {
  if (!gridOverlay.selectAll("*").size()) {
    turnButtonOn("toggleGrid");
    drawGrid();
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

export function toggleCoordinates(event?: MouseEvent): void {
  if (!coordinates.selectAll("*").size()) {
    turnButtonOn("toggleCoordinates");
    drawCoordinates();
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

export function toggleCompass(event?: MouseEvent): void {
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

export function toggleRelief(event?: MouseEvent): void {
  if (!layerIsOn("toggleRelief")) {
    turnButtonOn("toggleRelief");
    if (!terrain.selectAll("*").size()) drawReliefIcons();
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

export function toggleLakes(event?: MouseEvent): void {
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

export function toggleTexture(event?: MouseEvent): void {
  if (!layerIsOn("toggleTexture")) {
    turnButtonOn("toggleTexture");
    drawTexture();
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

export function toggleRivers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRivers")) {
    turnButtonOn("toggleRivers");
    drawRivers();
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

export function toggleRoutes(event?: MouseEvent): void {
  if (!layerIsOn("toggleRoutes")) {
    turnButtonOn("toggleRoutes");
    drawRoutes();
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

export function toggleMilitary(event?: MouseEvent): void {
  if (!layerIsOn("toggleMilitary")) {
    turnButtonOn("toggleMilitary");
    drawMilitary();
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

export function toggleMarkers(event?: MouseEvent): void {
  if (!layerIsOn("toggleMarkers")) {
    turnButtonOn("toggleMarkers");
    drawMarkers();
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

export function toggleLabels(event?: MouseEvent): void {
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

export function toggleBurgIcons(event?: MouseEvent): void {
  if (!layerIsOn("toggleBurgIcons")) {
    turnButtonOn("toggleBurgIcons");
    drawBurgIcons();
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

export function toggleRulers(event?: MouseEvent): void {
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

export function toggleScaleBar(event?: MouseEvent): void {
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

export function toggleZones(event?: MouseEvent): void {
  if (!layerIsOn("toggleZones")) {
    turnButtonOn("toggleZones");
    drawZones();
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

export function toggleEmblems(event?: MouseEvent): void {
  if (!layerIsOn("toggleEmblems")) {
    turnButtonOn("toggleEmblems");
    if (!emblems.selectAll("use").size()) drawEmblems();
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

export function toggleVignette(event?: MouseEvent): void {
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

function moveLayer(_event: unknown, ui: { item: ReturnType<typeof $> }): void {
  const el = getLayer(ui.item.attr("id") as string);
  if (!el) return;
  const prev = getLayer(ui.item.prev().attr("id") as string);
  const next = getLayer(ui.item.next().attr("id") as string);
  if (prev) el.insertAfter(prev);
  else if (next) el.insertBefore(next);
}

function getLayer(id: string): ReturnType<typeof $> | null {
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

// ─── HTML event listeners ─────────────────────────────────────────────────────

ensureEl<HTMLSelectElement>("layersPreset").addEventListener("change", e =>
  handleLayersPresetChange((e.target as HTMLSelectElement).value)
);
ensureEl("savePresetButton").addEventListener("click", savePreset);
ensureEl("removePresetButton").addEventListener("click", removePreset);

const toggleLayerIds = [
  "toggleTexture",
  "toggleHeight",
  "toggleLakes",
  "toggleBiomes",
  "toggleCells",
  "toggleGrid",
  "toggleCoordinates",
  "toggleCompass",
  "toggleRivers",
  "toggleRelief",
  "toggleReligions",
  "toggleCultures",
  "toggleStates",
  "toggleProvinces",
  "toggleZones",
  "toggleBorders",
  "toggleRoutes",
  "toggleTemperature",
  "togglePopulation",
  "toggleIce",
  "togglePrecipitation",
  "toggleEmblems",
  "toggleBurgIcons",
  "toggleLabels",
  "toggleMilitary",
  "toggleMarkers",
  "toggleRulers",
  "toggleScaleBar",
  "toggleVignette"
] as const;

const toggleFns: Record<(typeof toggleLayerIds)[number], (e?: MouseEvent) => void> = {
  toggleTexture,
  toggleHeight,
  toggleLakes,
  toggleBiomes,
  toggleCells,
  toggleGrid,
  toggleCoordinates,
  toggleCompass,
  toggleRivers,
  toggleRelief,
  toggleReligions,
  toggleCultures,
  toggleStates,
  toggleProvinces,
  toggleZones,
  toggleBorders,
  toggleRoutes,
  toggleTemperature,
  togglePopulation,
  toggleIce,
  togglePrecipitation,
  toggleEmblems,
  toggleBurgIcons,
  toggleLabels,
  toggleMilitary,
  toggleMarkers,
  toggleRulers,
  toggleScaleBar,
  toggleVignette
};

for (const id of toggleLayerIds) {
  document.getElementById(id)?.addEventListener("click", e => toggleFns[id](e as MouseEvent));
}
