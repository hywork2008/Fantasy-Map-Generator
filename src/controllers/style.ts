import type { Selection } from "d3";
import { interpolateRgb, interpolateRgbBasis, scaleSequential } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { OceanLayers } from "../modules/ocean-layers";
import {
  drawBurgIcons,
  drawBurgLabels,
  drawEmblems,
  drawGrid,
  drawHeightmap,
  drawReliefIcons,
  drawStateLabels
} from "../renderers";
import { drawRegiments, drawScaleBar, fitScaleBar } from "../renderers/index";
import { useStyleState } from "../store/styleState";
import { closeDialog, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { drawHeights, ensureEl, parseTransform, rn, toHEX } from "../utils";
import { heightmapColorSchemes } from "../utils/colorUtils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

// ─── Types ────────────────────────────────────────────────────────────────────

type StyleJSON = Record<string, Record<string, string | number | null>>;
type AnySelection = Selection<SVGGElement, unknown, null, undefined>;

// ─── Color schemes ────────────────────────────────────────────────────────────

export function addCustomColorScheme(scheme: string): void {
  const stops = scheme.split(",");
  heightmapColorSchemes[scheme] = scaleSequential(interpolateRgbBasis(stops));
  ensureEl<HTMLSelectElement>("styleHeightmapScheme").options.add(new Option(scheme, scheme, false, true));
}

// ─── Style element selection ──────────────────────────────────────────────────

function editStyle(element: string, group?: string): void {
  showOptions();
  ensureEl<HTMLButtonElement>("styleTab").click();
  ensureEl<HTMLSelectElement>("styleElementSelect").value = element;
  if (group) ensureEl<HTMLSelectElement>("styleGroupSelect").options.add(new Option(group, group, true, true));
  selectStyleElement();

  ensureEl("styleElementSelect").classList.add("glow");
  if (group) ensureEl("styleGroupSelect").classList.add("glow");

  setTimeout(() => {
    ensureEl("styleElementSelect").classList.remove("glow");
    if (group) ensureEl("styleGroupSelect").classList.remove("glow");
  }, 1500);
}

function selectStyleElement(): void {
  const styleElement = ensureEl<HTMLSelectElement>("styleElementSelect").value;
  let el: AnySelection = svg.select<SVGGElement>(`#${styleElement}`);

  const visibility: Record<string, boolean> = {};
  const sliderValues: Record<string, string> = {};

  const isLayerOff = styleElement !== "ocean" && (el.style("display") === "none" || !el.selectAll("*").size());
  visibility.styleIsOff = Boolean(isLayerOff);

  if (["anchors", "borders", "burgIcons", "coastline", "lakes", "labels", "routes", "terrs"].includes(styleElement)) {
    const group = ensureEl<HTMLSelectElement>("styleGroupSelect").value;
    const defaultGroupSelector = styleElement === "terrs" ? "#landHeights" : "g";
    el =
      group && el.select<SVGGElement>(`#${group}`).size()
        ? el.select<SVGGElement>(`#${group}`)
        : el.select<SVGGElement>(defaultGroupSelector);
  }

  // Prevent D3 v7 `.attr()` getter from throwing if the selection is empty.
  if (el.empty()) {
    el = svg.select<SVGGElement>(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
  }

  if (!["landmass", "legend", "ocean", "regions"].includes(styleElement)) {
    visibility.styleOpacity = true;
    sliderValues.styleOpacityInput = String(el.attr("opacity") ?? 1);
  }

  if (!["landmass", "legend", "regions", "scaleBar"].includes(styleElement)) {
    visibility.styleFilter = true;
    ensureEl<HTMLInputElement>("styleFilterInput").value = el.attr("filter") ?? "";
  }

  if (["fogging", "ice", "lakes", "landmass", "prec", "rivers", "scaleBar", "vignette"].includes(styleElement)) {
    visibility.styleFill = true;
    const fill = el.attr("fill") ?? "";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
  }

  if (
    [
      "armies",
      "biomes",
      "borders",
      "cells",
      "coastline",
      "coordinates",
      "cults",
      "gridOverlay",
      "ice",
      "icons",
      "lakes",
      "prec",
      "relig",
      "routes",
      "zones"
    ].includes(styleElement)
  ) {
    visibility.styleStroke = true;
    const stroke = el.attr("stroke") ?? "";
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    visibility.styleStrokeWidth = true;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
  }

  if (
    [
      "borders",
      "cells",
      "coordinates",
      "gridOverlay",
      "legend",
      "population",
      "routes",
      "temperature",
      "zones"
    ].includes(styleElement)
  ) {
    visibility.styleStrokeDash = true;
    ensureEl<HTMLInputElement>("styleStrokeDasharrayInput").value = el.attr("stroke-dasharray") ?? "";
    ensureEl<HTMLInputElement>("styleStrokeLinecapInput").value = el.attr("stroke-linecap") ?? "inherit";
  }

  if (
    [
      "biomes",
      "cells",
      "compass",
      "coordinates",
      "gridOverlay",
      "population",
      "prec",
      "routes",
      "temperature",
      "terrain",
      "texture",
      "zones"
    ].includes(styleElement)
  ) {
    visibility.styleClipping = true;
    ensureEl<HTMLInputElement>("styleClippingInput").value = el.attr("mask") ?? "";
  }

  if (styleElement === "texture") {
    visibility.styleTexture = true;
    ensureEl<HTMLInputElement>("styleTextureShiftX").value = String(el.attr("data-x") ?? 0);
    ensureEl<HTMLInputElement>("styleTextureShiftY").value = String(el.attr("data-y") ?? 0);
    updateTextureSelectValue(el.attr("data-href") ?? "");
  }

  if (styleElement === "terrs") {
    visibility.styleHeightmap = true;
    ensureEl<HTMLElement>("styleHeightmapRenderOceanOption").style.display =
      el.attr("id") === "oceanHeights" ? "block" : "none";
    ensureEl<HTMLInputElement>("styleHeightmapRenderOcean").checked = Boolean(+el.attr("data-render")!);
    ensureEl<HTMLSelectElement>("styleHeightmapScheme").value = el.attr("scheme") ?? "";
    sliderValues.styleHeightmapTerracing = el.attr("terracing") ?? "";
    sliderValues.styleHeightmapSkip = el.attr("skip") ?? "";
    sliderValues.styleHeightmapSimplification = el.attr("relax") ?? "";
    ensureEl<HTMLSelectElement>("styleHeightmapCurve").value = el.attr("curve") ?? "";
  }

  if (styleElement === "markers") {
    visibility.styleMarkers = true;
    ensureEl<HTMLInputElement>("styleRescaleMarkers").checked = Boolean(+markers.attr("rescale")!);
  }

  if (styleElement === "gridOverlay") {
    visibility.styleGrid = true;
    ensureEl<HTMLSelectElement>("styleGridType").value = el.attr("type") ?? "";
    ensureEl<HTMLInputElement>("styleGridScale").value = String(el.attr("scale") ?? 1);
    ensureEl<HTMLInputElement>("styleGridShiftX").value = String(el.attr("dx") ?? 0);
    ensureEl<HTMLInputElement>("styleGridShiftY").value = String(el.attr("dy") ?? 0);
    calculateFriendlyGridSize();
  }

  if (styleElement === "compass") {
    visibility.styleCompass = true;
    const tr = parseTransform(compass.select("use").attr("transform"));
    ensureEl<HTMLInputElement>("styleCompassShiftX").value = String(tr[0]);
    ensureEl<HTMLInputElement>("styleCompassShiftY").value = String(tr[1]);
    sliderValues.styleCompassSizeInput = String(tr[2]);
  }

  if (styleElement === "terrain") {
    visibility.styleRelief = true;
    sliderValues.styleReliefSize = String(terrain.attr("size") ?? 1);
    sliderValues.styleReliefDensity = String(terrain.attr("density") ?? 0.4);
    ensureEl<HTMLSelectElement>("styleReliefSet").value = terrain.attr("set") ?? "";
  }

  if (styleElement === "population") {
    visibility.stylePopulation = true;
    const ruralStroke = population.select("#rural").attr("stroke") ?? "";
    const urbanStroke = population.select("#urban").attr("stroke") ?? "";
    ensureEl<HTMLInputElement>("stylePopulationRuralStrokeInput").value = ruralStroke;
    ensureEl<HTMLInputElement>("stylePopulationRuralStrokeOutput").value = ruralStroke;
    ensureEl<HTMLInputElement>("stylePopulationUrbanStrokeInput").value = urbanStroke;
    ensureEl<HTMLInputElement>("stylePopulationUrbanStrokeOutput").value = urbanStroke;
    visibility.styleStrokeWidth = true;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
  }

  if (styleElement === "regions") {
    visibility.styleStates = true;
    sliderValues.styleStatesBodyOpacity = String(statesBody.attr("opacity") ?? 1);
    ensureEl<HTMLInputElement>("styleStatesBodyFilter").value = statesBody.attr("filter") ?? "";
    sliderValues.styleStatesHaloWidth = String(statesHalo.attr("data-width") ?? 10);
    sliderValues.styleStatesHaloOpacity = String(statesHalo.attr("opacity") ?? 1);
    const blurMatch = statesHalo.attr("filter")?.match(/blur\(([^)]+)\)/);
    sliderValues.styleStatesHaloBlur = String(blurMatch ? parseFloat(blurMatch[1]) : 0);
  }

  if (styleElement === "provs") {
    visibility.styleFill = true;
    visibility.styleSize = true;
    const fill = el.attr("fill") ?? "#111111";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    visibility.styleFont = true;
    ensureEl<HTMLSelectElement>("styleSelectFont").value = el.attr("font-family") ?? "";
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("font-size") ?? "";
  }

  if (styleElement === "labels") {
    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleLetterSpacing = true;
    visibility.styleShadow = true;
    visibility.styleSize = true;
    visibility.styleVisibility = true;

    const fill = el.attr("fill") ?? "#3e3e4b";
    const stroke = el.attr("stroke") ?? "#3a3a3a";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
    sliderValues.styleLetterSpacingInput = String(el.attr("letter-spacing") ?? 0);
    ensureEl<HTMLInputElement>("styleShadowInput").value = el.style("text-shadow") ?? "";
    ensureEl<HTMLInputElement>("styleLabelsHideGroup").checked = el.node()?.style.display === "none";

    visibility.styleFont = true;
    ensureEl<HTMLSelectElement>("styleSelectFont").value = el.attr("font-family") ?? "";
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("data-size") ?? "";

    if ((el.node() as Element).parentElement?.id === "burgLabels") {
      visibility.styleFontShift = true;
      ensureEl<HTMLInputElement>("styleFontShiftX").value = String(el.attr("data-dx") ?? 0);
      ensureEl<HTMLInputElement>("styleFontShiftY").value = String(el.attr("data-dy") ?? 0);
    }
  }

  if (styleElement === "burgIcons") {
    visibility.styleBurgIcons = true;
    ensureEl<HTMLSelectElement>("styleBurgIconsIcon").value = el.attr("data-icon") ?? "";
    sliderValues.styleBurgIconsIconSize = el.attr("font-size") ?? "";
    ensureEl<HTMLSelectElement>("styleBurgIconsStrokeLinejoin").value = el.attr("stroke-linejoin") ?? "";
    sliderValues.styleBurgIconsFillOpacity = el.attr("fill-opacity") ?? "";

    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleStrokeDash = true;
    const fill = el.attr("fill") ?? "#ffffff";
    const stroke = el.attr("stroke") ?? "#3e3e4b";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);
    ensureEl<HTMLInputElement>("styleStrokeDasharrayInput").value = el.attr("stroke-dasharray") ?? "";
    ensureEl<HTMLInputElement>("styleStrokeLinecapInput").value = el.attr("stroke-linecap") ?? "inherit";
  }

  if (styleElement === "anchors") {
    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleSize = true;
    const fill = el.attr("fill") ?? "#ffffff";
    const stroke = el.attr("stroke") ?? "#3e3e4b";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);
    ensureEl<HTMLInputElement>("styleFontSize").value = String(el.attr("font-size") ?? 1);
  }

  if (styleElement === "legend") {
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleSize = true;
    visibility.styleLegend = true;
    const legendBox = el.select<SVGRectElement>("#legendBox");
    sliderValues.styleLegendColItems = el.attr("data-columns") ?? "";
    const backFill = legendBox.size() ? (legendBox.attr("fill") ?? "#ffffff") : "#ffffff";
    ensureEl<HTMLInputElement>("styleLegendBack").value = backFill;
    ensureEl<HTMLInputElement>("styleLegendBackOutput").value = backFill;
    sliderValues.styleLegendOpacity = String(legendBox.size() ? (legendBox.attr("fill-opacity") ?? 1) : 1);
    const stroke = el.attr("stroke") ?? "#111111";
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.5);
    visibility.styleFont = true;
    ensureEl<HTMLSelectElement>("styleSelectFont").value = el.attr("font-family") ?? "";
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("data-size") ?? "";
  }

  if (styleElement === "ocean") {
    visibility.styleOcean = true;
    const oceanBase = oceanLayers.select<SVGRectElement>("#oceanBase");
    const fill = oceanBase.attr("fill") ?? "";
    ensureEl<HTMLInputElement>("styleOceanFill").value = fill;
    ensureEl<HTMLInputElement>("styleOceanFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleOceanPattern").value =
      document.getElementById("oceanicPattern")?.getAttribute("href") ?? "";
    sliderValues.styleOceanPatternOpacity = document.getElementById("oceanicPattern")?.getAttribute("opacity") ?? "1";
    ensureEl<HTMLSelectElement>("outlineLayers").value = oceanLayers.attr("layers") ?? "";
  }

  if (styleElement === "temperature") {
    visibility.styleStrokeWidth = true;
    visibility.styleTemperature = true;
    sliderValues.styleStrokeWidthInput = el.attr("stroke-width") ?? "";
    sliderValues.styleTemperatureFillOpacityInput = String(el.attr("fill-opacity") ?? 0.1);
    const tempFill = el.attr("fill") ?? "#000";
    ensureEl<HTMLInputElement>("styleTemperatureFillInput").value = tempFill;
    ensureEl<HTMLInputElement>("styleTemperatureFillOutput").value = tempFill;
    sliderValues.styleTemperatureFontSizeInput = (el.attr("font-size") ?? "8").replace(/px$/, "");
  }

  if (styleElement === "coordinates") {
    visibility.styleSize = true;
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("data-size") ?? "";
  }

  if (styleElement === "armies") {
    visibility.styleArmies = true;
    sliderValues.styleArmiesFillOpacity = el.attr("fill-opacity") ?? "";
    sliderValues.styleArmiesSize = el.attr("box-size") ?? "";
  }

  if (styleElement === "emblems") {
    visibility.styleEmblems = true;
    visibility.styleStrokeWidth = true;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 1);
    sliderValues.emblemsStateSizeInput = emblems.select("#stateEmblems").attr("data-size") ?? "1";
    sliderValues.emblemsProvinceSizeInput = emblems.select("#provinceEmblems").attr("data-size") ?? "1";
    sliderValues.emblemsBurgSizeInput = emblems.select("#burgEmblems").attr("data-size") ?? "1";
  }

  // update group options
  ensureEl<HTMLSelectElement>("styleGroupSelect").options.length = 0;
  if (["anchors", "borders", "burgIcons", "coastline", "lakes", "labels", "routes", "terrs"].includes(styleElement)) {
    const groups = ensureEl(styleElement).querySelectorAll<SVGGElement>("g");
    groups.forEach(g => {
      if (g.id === "burgLabels") return;
      const option = new Option(`${g.id} (${g.childElementCount})`, g.id, false, false);
      ensureEl<HTMLSelectElement>("styleGroupSelect").options.add(option);
    });
    ensureEl<HTMLSelectElement>("styleGroupSelect").value = el.attr("id") ?? "";
    visibility.styleGroup = true;
  } else {
    ensureEl<HTMLSelectElement>("styleGroupSelect").options.add(new Option(styleElement, styleElement, false, true));
    visibility.styleGroup = false;
  }

  if (styleElement === "coastline" && ensureEl<HTMLSelectElement>("styleGroupSelect").value === "sea_island") {
    visibility.styleCoastline = true;
    const auto = Boolean(coastline.select("#sea_island").attr("auto-filter"));
    ensureEl<HTMLInputElement>("styleCoastlineAuto").checked = auto;
    if (auto) visibility.styleFilter = false;
  }

  if (styleElement === "scaleBar") {
    visibility.styleScaleBar = true;
    const scaleBarEl = scaleBar;
    ensureEl<HTMLInputElement>("styleScaleBarSize").value = scaleBarEl.attr("data-bar-size") ?? "";
    ensureEl<HTMLInputElement>("styleScaleBarFontSize").value = scaleBarEl.attr("font-size") ?? "";
    ensureEl<HTMLInputElement>("styleScaleBarPositionX").value = scaleBarEl.attr("data-x") ?? "99";
    ensureEl<HTMLInputElement>("styleScaleBarPositionY").value = scaleBarEl.attr("data-y") ?? "99";
    ensureEl<HTMLInputElement>("styleScaleBarLabel").value = scaleBarEl.attr("data-label") ?? "";

    const scaleBarBack = scaleBarEl.select<SVGRectElement>("#scaleBarBack");
    if (scaleBarBack.size()) {
      sliderValues.styleScaleBarBackgroundOpacity = scaleBarBack.attr("opacity") ?? "";
      const backFill = scaleBarBack.attr("fill") ?? "";
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundFill").value = backFill;
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundFillOutput").value = backFill;
      const backStroke = scaleBarBack.attr("stroke") ?? "";
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundStroke").value = backStroke;
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundStrokeOutput").value = backStroke;
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundStrokeWidth").value = scaleBarBack.attr("stroke-width") ?? "";
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundFilter").value = scaleBarBack.attr("filter") ?? "";
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundPaddingTop").value = scaleBarBack.attr("data-top") ?? "";
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundPaddingRight").value = scaleBarBack.attr("data-right") ?? "";
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundPaddingBottom").value = scaleBarBack.attr("data-bottom") ?? "";
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundPaddingLeft").value = scaleBarBack.attr("data-left") ?? "";
    }
  }

  if (styleElement === "vignette") {
    visibility.styleVignette = true;
    const maskRect = document.getElementById("vignette-rect");
    if (maskRect) {
      const digit = (str: string | null) => (str ?? "").replace(/[^\d.]/g, "");
      ensureEl<HTMLInputElement>("styleVignetteX").value = digit(maskRect.getAttribute("x"));
      ensureEl<HTMLInputElement>("styleVignetteY").value = digit(maskRect.getAttribute("y"));
      ensureEl<HTMLInputElement>("styleVignetteWidth").value = digit(maskRect.getAttribute("width"));
      ensureEl<HTMLInputElement>("styleVignetteHeight").value = digit(maskRect.getAttribute("height"));
      ensureEl<HTMLInputElement>("styleVignetteRx").value = digit(maskRect.getAttribute("rx"));
      ensureEl<HTMLInputElement>("styleVignetteRy").value = digit(maskRect.getAttribute("ry"));
      sliderValues.styleVignetteBlur = digit(maskRect.getAttribute("filter"));
    }
  }

  useStyleState.getState().setValues(sliderValues);
  useStyleState.getState().setVisibility(visibility);
}
// ─── Helper: get current D3 selection ─────────────────────────────────────────

function getEl(): AnySelection {
  const el = ensureEl<HTMLSelectElement>("styleElementSelect").value;
  const g = ensureEl<HTMLSelectElement>("styleGroupSelect").value;

  let selection = svg.select<SVGGElement>(`#${el}`);
  if (g !== el && g !== "") {
    selection = selection.select<SVGGElement>(`#${g}`);
  }

  // Prevent D3 v7 `.attr()` getter from throwing if the selection is empty.
  if (selection.empty()) {
    return svg.select<SVGGElement>(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
  }

  return selection;
}

// ─── Texture helpers ──────────────────────────────────────────────────────────

function changeTexture(href: string): void {
  texture.attr("data-href", href);
  texture.select("image").attr("href", href);
}

function updateTextureSelectValue(href: string): void {
  const select = ensureEl<HTMLSelectElement>("styleTextureInput");
  const isAdded = Array.from(select.options).some(option => option.value === href);
  if (isAdded) {
    select.value = href;
  } else {
    const name = href.split("/").pop()?.slice(0, 20) ?? href;
    select.add(new Option(name, href, false, true));
  }
}

// ─── Grid size calculator ─────────────────────────────────────────────────────

function calculateFriendlyGridSize(): void {
  const size = +ensureEl<HTMLInputElement>("styleGridScale").value * 25;
  const friendly = `${rn(size * distanceScale, 2)} ${distanceUnitInput.value}`;
  ensureEl<HTMLInputElement>("styleGridSizeFriendly").value = friendly;
}

// ─── Compass helper ───────────────────────────────────────────────────────────

function shiftCompass(sizeOverride?: string): void {
  const x = ensureEl<HTMLInputElement>("styleCompassShiftX").value;
  const y = ensureEl<HTMLInputElement>("styleCompassShiftY").value;
  const size = sizeOverride ?? useStyleState.getState().values.styleCompassSizeInput ?? "0.3";
  compass.select("use").attr("transform", `translate(${x} ${y}) scale(${size})`);
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

function changeFont(): void {
  const family = ensureEl<HTMLSelectElement>("styleSelectFont").value;
  getEl().attr("font-family", family);
  if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "legend") redrawLegend();
}

function changeFontSize(el: AnySelection, size: number): void {
  ensureEl<HTMLInputElement>("styleFontSize").value = String(size);
  const styleElement = ensureEl<HTMLSelectElement>("styleElementSelect").value;

  const getSizeOnScale = (element: string): number => {
    if (element === "labels") return Math.max(rn((size + size / scale) / 2, 2), 1);
    if (element === "coordinates") return rn(size / scale ** 0.8, 2);
    return size;
  };

  const scaleSize = getSizeOnScale(styleElement);
  el.attr("data-size", size).attr("font-size", scaleSize);

  if (styleElement === "legend") redrawLegend();
}

// ─── updateElements ───────────────────────────────────────────────────────────

function updateElements(): void {
  if (layerIsOn("toggleHeight")) drawHeightmap(worldContext, viewContext, appServices);
  if (legend.selectAll("*").size()) redrawLegend();
  oceanLayers.selectAll("path").remove();
  OceanLayers();
  invokeActiveZooming();
}

// ─── Slider change dispatcher (called from React SliderInput components) ──────

export function applySliderChange(id: string, value: string): void {
  useStyleState.getState().updateValue(id, value);

  switch (id) {
    case "styleOpacityInput":
      getEl().attr("opacity", value);
      break;
    case "styleStrokeWidthInput":
      getEl().attr("stroke-width", value);
      if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid"))
        drawGrid(worldContext, viewContext, appServices);
      break;
    case "styleLetterSpacingInput":
      getEl().attr("letter-spacing", value);
      break;
    case "styleHeightmapTerracing":
      getEl().attr("terracing", value);
      drawHeightmap(worldContext, viewContext, appServices);
      break;
    case "styleHeightmapSkip":
      getEl().attr("skip", value);
      drawHeightmap(worldContext, viewContext, appServices);
      break;
    case "styleHeightmapSimplification":
      getEl().attr("relax", value);
      drawHeightmap(worldContext, viewContext, appServices);
      break;
    case "styleOceanPatternOpacity":
      document.getElementById("oceanicPattern")?.setAttribute("opacity", value);
      break;
    case "styleVignetteBlur":
      document.getElementById("vignette-rect")?.setAttribute("filter", `blur(${value}px)`);
      break;
    case "styleBurgIconsIconSize":
      getEl().attr("font-size", value);
      break;
    case "styleBurgIconsFillOpacity":
      getEl().attr("fill-opacity", value);
      break;
    case "styleCompassSizeInput":
      shiftCompass(value);
      break;
    case "styleReliefSize":
      terrain.attr("size", value);
      drawReliefIcons(worldContext, viewContext, appServices);
      if (!layerIsOn("toggleRelief")) toggleRelief();
      break;
    case "styleReliefDensity":
      terrain.attr("density", value);
      drawReliefIcons(worldContext, viewContext, appServices);
      if (!layerIsOn("toggleRelief")) toggleRelief();
      break;
    case "styleLegendColItems":
      legend.select("#legendBox").attr("data-columns", value);
      redrawLegend();
      break;
    case "styleLegendOpacity":
      legend.select("#legendBox").attr("fill-opacity", value);
      break;
    case "styleTemperatureFillOpacityInput":
      temperature.attr("fill-opacity", value);
      break;
    case "styleTemperatureFontSizeInput":
      temperature.attr("font-size", `${value}px`);
      break;
    case "styleStatesBodyOpacity":
      statesBody.attr("opacity", value);
      break;
    case "styleStatesHaloWidth":
      statesHalo.attr("data-width", value).attr("stroke-width", value);
      break;
    case "styleStatesHaloOpacity":
      statesHalo.attr("opacity", value);
      break;
    case "styleStatesHaloBlur": {
      const blur = Number(value) > 0 ? `blur(${value}px)` : null;
      statesHalo.attr("filter", blur);
      break;
    }
    case "styleArmiesFillOpacity":
      armies.attr("fill-opacity", value);
      break;
    case "styleArmiesSize": {
      const numVal = Number(value);
      armies.attr("box-size", numVal).attr("font-size", numVal * 2);
      armies.selectAll("g").remove();
      pack.states.forEach(s => {
        if (!s.i || s.removed || !s.military?.length) return;
        drawRegiments(worldContext, viewContext, appServices, s.military, s.i);
      });
      break;
    }
    case "emblemsStateSizeInput":
      emblems.select("#stateEmblems").attr("data-size", value);
      drawEmblems(worldContext, viewContext, appServices);
      break;
    case "emblemsProvinceSizeInput":
      emblems.select("#provinceEmblems").attr("data-size", value);
      drawEmblems(worldContext, viewContext, appServices);
      break;
    case "emblemsBurgSizeInput":
      emblems.select("#burgEmblems").attr("data-size", value);
      drawEmblems(worldContext, viewContext, appServices);
      break;
    case "styleScaleBarBackgroundOpacity":
      scaleBar.select<SVGRectElement>("#scaleBarBack").attr("opacity", value);
      break;
  }
}

// ─── Map filter ───────────────────────────────────────────────────────────────

function applyMapFilter(event: Event): void {
  if ((event.target as HTMLElement).tagName !== "BUTTON") return;
  const button = event.target as HTMLButtonElement;
  svg.attr("data-filter", null).attr("filter", null);
  if (button.classList.contains("pressed")) {
    button.classList.remove("pressed");
    return;
  }
  ensureEl("mapFilters")
    .querySelectorAll<HTMLButtonElement>(".pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  button.classList.add("pressed");
  svg.attr("data-filter", button.id).attr("filter", `url(#filter-${button.id})`);
}

// ─── Texture URL dialog ───────────────────────────────────────────────────────

function textureProvideURL(): void {
  openRichDialog({
    title: "Load custom texture",
    content: /* html */ `Provide a texture image URL:
    <input id="textureURL" type="url" style="width: 100%" placeholder="http://www.example.com/image.jpg" oninput="fetchTextureURL(this.value)" />
    <canvas id="texturePreview" width="256px" height="144px"></canvas>`,
    buttons: [
      {
        label: "Apply",
        onClick: () => {
          const url = (document.getElementById("textureURL") as HTMLInputElement).value;
          if (!url) return tip("Please provide a valid URL", false, "error");
          changeTexture(url);
          updateTextureSelectValue(url);
        }
      },
      { label: "Cancel", onClick: () => {} }
    ]
  });
}

function fetchTextureURL(url: string): void {
  INFO && console.info("Provided URL is", url); // INFO is a global debug flag
  const img = new Image();
  img.onload = () => {
    const canvas = ensureEl<HTMLCanvasElement>("texturePreview");
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = url;
}

export function initStyleTab() {
  // ─── Initialization: filter dropdowns ────────────────────────────────────────

  {
    const filters = Array.from(ensureEl("filters").querySelectorAll<SVGFilterElement>("filter"));
    const emptyOption = '<option value="" selected>None</option>';
    const options = filters.map(filter => {
      const id = filter.getAttribute("id")!;
      const name = filter.getAttribute("name") ?? id;
      return `<option value="url(#${id})">${name}</option>`;
    });
    const allOptions = emptyOption + options.join("");
    ensureEl("styleFilterInput").innerHTML = allOptions;
    ensureEl("styleStatesBodyFilter").innerHTML = allOptions;
    ensureEl("styleScaleBarBackgroundFilter").innerHTML = allOptions;
  }

  // ─── Initialization: heightmap scheme dropdown ────────────────────────────────

  ensureEl<HTMLSelectElement>("styleHeightmapScheme").innerHTML = Object.keys(heightmapColorSchemes)
    .map(scheme => `<option value="${scheme}">${scheme}</option>`)
    .join("");

  // ─── Initialization: vignette preset dropdown ─────────────────────────────────

  const vignettePresets: Record<string, string> = {
    default: `{ "#vignette": { "opacity": 0.3, "fill": "#000000", "filter": null }, "#vignette-rect": { "x": "0.3%", "y": "0.4%", "width": "99.6%", "height": "99.2%", "rx": "5%", "ry": "5%", "filter": "blur(20px)" } }`,
    neon: `{ "#vignette": { "opacity": 0.5, "fill": "#7300ff", "filter": null }, "#vignette-rect": { "x": "0.3%", "y": "0.4%", "width": "99.6%", "height": "99.2%", "rx": "0%", "ry": "0%", "filter": "blur(15px)" } }`,
    smoke: `{ "#vignette": { "opacity": 1, "fill": "#000000", "filter": "url(#splotch)" }, "#vignette-rect": { "x": "3%", "y": "5%", "width": "96%", "height": "90%", "rx": "10%", "ry": "10%", "filter": "blur(100px)" } }`,
    wound: `{ "#vignette": { "opacity": 0.8, "fill": "#ff0000", "filter": "url(#paper)"}, "#vignette-rect": {"x": "0.5%", "y": "1%", "width": "99%", "height": "98%", "rx": "5%", "ry": "5%", "filter": "blur(50px)" } }`,
    paper: `{ "#vignette": { "opacity": 1, "fill": "#000000", "filter": "url(#paper)" }, "#vignette-rect": { "x": "0.3%", "y": "0.4%", "width": "99.6%", "height": "99.2%", "rx": "20%", "ry": "20%", "filter": "blur(150px)" } }`,
    granite: `{ "#vignette": { "opacity": 0.95, "fill": "#231b1b", "filter": "url(#crumpled)" }, "#vignette-rect": { "x": "3%", "y": "5%", "width": "94%", "height": "90%", "rx": "20%", "ry": "20%", "filter": "blur(150px)" } }`,
    spotlight: `{ "#vignette": { "opacity": 0.96, "fill": "#000000", "filter": null }, "#vignette-rect": { "x": "20%", "y": "30%", "width": "24%", "height": "30%", "rx": "50%", "ry": "50%", "filter": "blur(30px) "} }`
  };

  Object.keys(vignettePresets).forEach(preset => {
    ensureEl<HTMLSelectElement>("styleVignettePreset").options.add(new Option(preset, preset, false, false));
  });

  // ─── Initialization: style preset dropdown ────────────────────────────────────

  const systemPresets = [
    "default",
    "ancient",
    "gloom",
    "pale",
    "light",
    "watercolor",
    "clean",
    "atlas",
    "darkSeas",
    "cyberpunk",
    "night",
    "monochrome"
  ];
  const customPresetPrefix = "fmgStyle_";

  {
    const systemOptions = systemPresets.map(name => `<option value="${name}">${name}</option>`);
    const storedStyles = Object.keys(localStorage).filter(key => key.startsWith(customPresetPrefix));
    const customOptions = storedStyles.map(
      key => `<option value="${key}">${key.replace(customPresetPrefix, "")} [custom]</option>`
    );
    ensureEl("stylePreset").innerHTML = systemOptions.join("") + customOptions.join("");
  }

  // ─── Event listeners ──────────────────────────────────────────────────────────

  ensureEl("styleElements").addEventListener("change", (ev: Event) => {
    const target = ev.target as HTMLElement;
    if (target.dataset.stored) lock(target.dataset.stored);
  });

  ensureEl("styleElementSelect").addEventListener("change", selectStyleElement);
  ensureEl("styleGroupSelect").addEventListener("change", selectStyleElement);

  ensureEl("styleFillInput").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    ensureEl<HTMLInputElement>("styleFillOutput").value = value;
    getEl().attr("fill", value);
  });

  ensureEl("styleStrokeInput").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = value;
    getEl().attr("stroke", value);
    if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid"))
      drawGrid(worldContext, viewContext, appServices);
  });

  ensureEl("styleStrokeDasharrayInput").addEventListener("input", (e: Event) => {
    getEl().attr("stroke-dasharray", (e.target as HTMLInputElement).value);
    if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid"))
      drawGrid(worldContext, viewContext, appServices);
  });

  ensureEl("styleStrokeLinecapInput").addEventListener("change", (e: Event) => {
    getEl().attr("stroke-linecap", (e.target as HTMLSelectElement).value);
    if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid"))
      drawGrid(worldContext, viewContext, appServices);
  });

  ensureEl("styleLabelsHideGroup").addEventListener("change", (e: Event) => {
    if ((e.target as HTMLInputElement).checked) getEl().style("display", "none");
    else getEl().style("display", null);
  });

  ensureEl("styleFilterInput").addEventListener("change", (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    if (ensureEl<HTMLSelectElement>("styleGroupSelect").value === "ocean")
      return void oceanLayers.attr("filter", value);
    getEl().attr("filter", value);
  });

  ensureEl("styleTextureInput").addEventListener("change", (e: Event) => {
    changeTexture((e.target as HTMLSelectElement).value);
  });

  ensureEl("styleTextureShiftX").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    const numVal = +(e.target as HTMLInputElement).valueAsNumber;
    texture.attr("data-x", value);
    texture
      .select("image")
      .attr("x", value)
      .attr("width", graphWidth - numVal);
  });

  ensureEl("styleTextureShiftY").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    const numVal = +(e.target as HTMLInputElement).valueAsNumber;
    texture.attr("data-y", value);
    texture
      .select("image")
      .attr("y", value)
      .attr("height", graphHeight - numVal);
  });

  ensureEl("styleClippingInput").addEventListener("change", (e: Event) => {
    getEl().attr("mask", (e.target as HTMLSelectElement).value);
  });

  ensureEl("styleGridType").addEventListener("change", (e: Event) => {
    getEl().attr("type", (e.target as HTMLSelectElement).value);
    if (layerIsOn("toggleGrid")) drawGrid(worldContext, viewContext, appServices);
    calculateFriendlyGridSize();
  });

  ensureEl("styleGridScale").addEventListener("input", () => {
    getEl().attr("scale", ensureEl<HTMLInputElement>("styleGridScale").value);
    if (layerIsOn("toggleGrid")) drawGrid(worldContext, viewContext, appServices);
    calculateFriendlyGridSize();
  });

  ensureEl("styleGridShiftX").addEventListener("input", (e: Event) => {
    getEl().attr("dx", (e.target as HTMLInputElement).value);
    if (layerIsOn("toggleGrid")) drawGrid(worldContext, viewContext, appServices);
  });

  ensureEl("styleGridShiftY").addEventListener("input", (e: Event) => {
    getEl().attr("dy", (e.target as HTMLInputElement).value);
    if (layerIsOn("toggleGrid")) drawGrid(worldContext, viewContext, appServices);
  });

  ensureEl("styleRescaleMarkers").addEventListener("change", (e: Event) => {
    markers.attr("rescale", +(e.target as HTMLInputElement).checked);
    invokeActiveZooming();
  });

  ensureEl("styleCoastlineAuto").addEventListener("change", (e: Event) => {
    const checked = (e.target as HTMLInputElement).checked;
    coastline.select("#sea_island").attr("auto-filter", +checked);
    ensureEl<HTMLElement>("styleFilter").style.display = checked ? "none" : "block";
    invokeActiveZooming();
  });

  ensureEl("styleOceanFill").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    oceanLayers.select("rect").attr("fill", value);
    ensureEl<HTMLInputElement>("styleOceanFillOutput").value = value;
  });

  ensureEl("styleOceanPattern").addEventListener("change", (e: Event) => {
    ensureEl("oceanicPattern").setAttribute("href", (e.target as HTMLSelectElement).value);
  });

  ensureEl("outlineLayers").addEventListener("change", (e: Event) => {
    oceanLayers.selectAll("path").remove();
    oceanLayers.attr("layers", (e.target as HTMLSelectElement).value);
    OceanLayers();
  });

  ensureEl("styleHeightmapScheme").addEventListener("change", (e: Event) => {
    getEl().attr("scheme", (e.target as HTMLSelectElement).value);
    drawHeightmap(worldContext, viewContext, appServices);
  });

  ensureEl("openCreateHeightmapSchemeButton").addEventListener("click", function (this: HTMLButtonElement) {
    const button = this;
    const scheme = getEl().attr("scheme") ?? "bright";
    button.dataset.stops = scheme.startsWith("#")
      ? scheme
      : [0, 0.25, 0.5, 0.75, 1].map(heightmapColorSchemes[scheme]).map(toHEX).join(",");

    function renderPreview(): void {
      const stops = button.dataset.stops!.split(",");
      const previewScheme = scaleSequential(interpolateRgbBasis(stops));
      const preview = drawHeights({
        heights: Array.from(grid.cells.h),
        width: grid.cellsX,
        height: grid.cellsY,
        scheme: previewScheme,
        renderOcean: false
      });
      ensureEl<HTMLImageElement>("heightmapSchemePreview").src = preview;
    }

    function renderStops(): void {
      const stops = button.dataset.stops!.split(",");

      const colorInput = (color: string) =>
        `<input type="color" class="stop" value="${color}" data-tip="Click to set the color" style="width: 2.5em; border: none;" />`;
      const removeStopButton = (index: number) =>
        `<button class="remove" data-index="${index}" data-tip="Remove color stop" style="margin-top: 0.3em; height: max-content;">x</button>`;
      const addStopButton = () =>
        `<button class="add" data-tip="Add color stop in between" style="margin-top: 0.3em; height: max-content;">+</button>`;

      const container = ensureEl("heightmapSchemeStops");
      container.innerHTML = stops
        .map((stop, index) => `${colorInput(stop)}${index && index < stops.length - 1 ? removeStopButton(index) : ""}`)
        .join(addStopButton());

      Array.from(container.querySelectorAll<HTMLInputElement>("input.stop")).forEach((input, index) => {
        input.oninput = function () {
          stops[index] = (this as HTMLInputElement).value;
          button.dataset.stops = stops.join(",");
          renderPreview();
          renderGradient();
        };
      });

      Array.from(container.querySelectorAll<HTMLButtonElement>("button.remove")).forEach(btn => {
        btn.onclick = function () {
          const index = +(this as HTMLButtonElement).dataset.index!;
          stops.splice(index, 1);
          button.dataset.stops = stops.join(",");
          renderPreview();
          renderStops();
          renderGradient();
        };
      });

      Array.from(container.querySelectorAll<HTMLButtonElement>("button.add")).forEach((btn, index) => {
        btn.onclick = () => {
          const middleColor = interpolateRgb(stops[index], stops[index + 1])(0.5);
          stops.splice(index + 1, 0, toHEX(middleColor));
          button.dataset.stops = stops.join(",");
          renderPreview();
          renderStops();
          renderGradient();
        };
      });
    }

    function renderGradient(): void {
      const stops = button.dataset.stops!;
      ensureEl<HTMLElement>("heightmapSchemeGradient").style.background = `linear-gradient(to right, ${stops})`;
    }

    function handleCreate(): void {
      const stops = button.dataset.stops!;
      if (stops in heightmapColorSchemes) {
        tip("This scheme already exists", false, "error");
        return;
      }
      addCustomColorScheme(stops);
      getEl().attr("scheme", stops);
      drawHeightmap(worldContext, viewContext, appServices);
    }

    openRichDialog({
      title: "Create heightmap color scheme",
      content: /* html */ `<div>
        <i>Define heightmap gradient colors from high to low altitude</i>
        <img id="heightmapSchemePreview" alt="heightmap preview" style="margin-top: 0.5em; width: 100%;" />
        <div id="heightmapSchemeStops" style="margin-block: 0.5em; display: flex; flex-wrap: wrap;"></div>
        <div id="heightmapSchemeGradient" style="height: 1.9em; border: 1px solid #767676;"></div>
      </div>`,
      onOpen: () => {
        renderPreview();
        renderStops();
        renderGradient();
      },
      buttons: [
        { label: "Create", onClick: handleCreate },
        { label: "Cancel", onClick: () => {} }
      ]
    });
  });

  ensureEl("styleHeightmapRenderOcean").addEventListener("change", (e: Event) => {
    getEl().attr("data-render", +(e.target as HTMLInputElement).checked);
    drawHeightmap(worldContext, viewContext, appServices);
  });

  ensureEl("styleHeightmapCurve").addEventListener("change", (e: Event) => {
    getEl().attr("curve", (e.target as HTMLSelectElement).value);
    drawHeightmap(worldContext, viewContext, appServices);
  });

  ensureEl("styleReliefSet").addEventListener("change", (e: Event) => {
    terrain.attr("set", (e.target as HTMLSelectElement).value);
    drawReliefIcons(worldContext, viewContext, appServices);
    if (!layerIsOn("toggleRelief")) toggleRelief();
  });

  ensureEl("styleTemperatureFillInput").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    temperature.attr("fill", value);
    ensureEl<HTMLInputElement>("styleTemperatureFillOutput").value = value;
  });

  ensureEl("stylePopulationRuralStrokeInput").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    population.select("#rural").attr("stroke", value);
    ensureEl<HTMLInputElement>("stylePopulationRuralStrokeOutput").value = value;
  });

  ensureEl("stylePopulationUrbanStrokeInput").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    population.select("#urban").attr("stroke", value);
    ensureEl<HTMLInputElement>("stylePopulationUrbanStrokeOutput").value = value;
  });

  ensureEl("styleBurgIconsIcon").addEventListener("change", (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    getEl().attr("data-icon", value).selectAll<SVGUseElement, unknown>("use").attr("href", value);
  });

  ensureEl("styleBurgIconsStrokeLinejoin").addEventListener("change", (e: Event) => {
    getEl().attr("stroke-linejoin", (e.target as HTMLSelectElement).value);
  });

  ensureEl("styleCompassShiftX").addEventListener("input", () => shiftCompass());
  ensureEl("styleCompassShiftY").addEventListener("input", () => shiftCompass());

  ensureEl("styleLegendBack").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    ensureEl<HTMLInputElement>("styleLegendBackOutput").value = value;
    legend.select("#legendBox").attr("fill", value);
  });

  ensureEl("styleSelectFont").addEventListener("change", changeFont);

  ensureEl("styleShadowInput").addEventListener("input", (e: Event) => {
    getEl().style("text-shadow", (e.target as HTMLInputElement).value);
  });

  ensureEl("styleFontSize").addEventListener("change", () => {
    changeFontSize(getEl(), +ensureEl<HTMLInputElement>("styleFontSize").value);
  });

  ensureEl("styleFontPlus").addEventListener("click", () => {
    const current = +ensureEl<HTMLInputElement>("styleFontSize").value || 12;
    changeFontSize(getEl(), Math.min(rn(current + 0.1, 1), 999));
  });

  ensureEl("styleFontMinus").addEventListener("click", () => {
    const current = +ensureEl<HTMLInputElement>("styleFontSize").value || 12;
    changeFontSize(getEl(), Math.max(rn(current - 0.1, 1), 0.1));
  });

  ensureEl("styleFontShiftX").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    getEl().attr("data-dx", value).selectAll<SVGTextElement, unknown>("text").attr("dx", `${value}em`);
  });

  ensureEl("styleFontShiftY").addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    getEl().attr("data-dy", value).selectAll<SVGTextElement, unknown>("text").attr("dy", `${value}em`);
  });

  ensureEl("styleStatesBodyFilter").addEventListener("change", (e: Event) => {
    statesBody.attr("filter", (e.target as HTMLSelectElement).value);
  });

  ensureEl("styleVignettePreset").addEventListener("change", (e: Event) => {
    const presetName = (e.target as HTMLSelectElement).value;
    const attributes = JSON.parse(vignettePresets[presetName]) as Record<string, Record<string, string | null>>;

    for (const selector in attributes) {
      const el = document.querySelector(selector);
      if (!el) continue;
      for (const attr in attributes[selector]) {
        const value = attributes[selector][attr];
        if (value === null) el.removeAttribute(attr);
        else el.setAttribute(attr, value);
      }
    }

    const vignette = ensureEl("vignette");
    if (vignette) {
      const opacityVal = vignette.getAttribute("opacity") ?? "";
      useStyleState.getState().updateValue("styleOpacityInput", opacityVal);
      const fill = vignette.getAttribute("fill") ?? "";
      ensureEl<HTMLInputElement>("styleFillInput").value = fill;
      ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
      ensureEl<HTMLSelectElement>("styleFilterInput").value = vignette.getAttribute("filter") ?? "";
    }

    const maskRect = ensureEl("vignette-rect");
    if (maskRect) {
      const digit = (str: string | null) => (str ?? "").replace(/[^\d.]/g, "");
      ensureEl<HTMLInputElement>("styleVignetteX").value = digit(maskRect.getAttribute("x"));
      ensureEl<HTMLInputElement>("styleVignetteY").value = digit(maskRect.getAttribute("y"));
      ensureEl<HTMLInputElement>("styleVignetteWidth").value = digit(maskRect.getAttribute("width"));
      ensureEl<HTMLInputElement>("styleVignetteHeight").value = digit(maskRect.getAttribute("height"));
      ensureEl<HTMLInputElement>("styleVignetteRx").value = digit(maskRect.getAttribute("rx"));
      ensureEl<HTMLInputElement>("styleVignetteRy").value = digit(maskRect.getAttribute("ry"));
      useStyleState.getState().updateValue("styleVignetteBlur", digit(maskRect.getAttribute("filter")));
    }
  });

  ensureEl("styleVignetteX").addEventListener("input", (e: Event) => {
    ensureEl("vignette-rect").setAttribute("x", `${(e.target as HTMLInputElement).value}%`);
  });

  ensureEl("styleVignetteWidth").addEventListener("input", (e: Event) => {
    ensureEl("vignette-rect").setAttribute("width", `${(e.target as HTMLInputElement).value}%`);
  });

  ensureEl("styleVignetteY").addEventListener("input", (e: Event) => {
    ensureEl("vignette-rect").setAttribute("y", `${(e.target as HTMLInputElement).value}%`);
  });

  ensureEl("styleVignetteHeight").addEventListener("input", (e: Event) => {
    ensureEl("vignette-rect").setAttribute("height", `${(e.target as HTMLInputElement).value}%`);
  });

  ensureEl("styleVignetteRx").addEventListener("input", (e: Event) => {
    ensureEl("vignette-rect").setAttribute("rx", `${(e.target as HTMLInputElement).value}%`);
  });

  ensureEl("styleVignetteRy").addEventListener("input", (e: Event) => {
    ensureEl("vignette-rect").setAttribute("ry", `${(e.target as HTMLInputElement).value}%`);
  });

  ensureEl("styleScaleBar").addEventListener("input", (event: Event) => {
    const scaleBarBack = scaleBar.select<SVGGElement>("#scaleBarBack");
    if (!scaleBarBack.size()) return;

    const target = event.target as HTMLInputElement;
    const { id, value } = target;

    if (id === "styleScaleBarSize") scaleBar.attr("data-bar-size", value);
    else if (id === "styleScaleBarFontSize") scaleBar.attr("font-size", value);
    else if (id === "styleScaleBarPositionX") scaleBar.attr("data-x", value);
    else if (id === "styleScaleBarPositionY") scaleBar.attr("data-y", value);
    else if (id === "styleScaleBarLabel") scaleBar.attr("data-label", value);
    else if (id === "styleScaleBarBackgroundFill") {
      scaleBarBack.attr("fill", value);
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundFillOutput").value = value;
    } else if (id === "styleScaleBarBackgroundStroke") {
      scaleBarBack.attr("stroke", value);
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundStrokeOutput").value = value;
    } else if (id === "styleScaleBarBackgroundStrokeWidth") scaleBarBack.attr("stroke-width", value);
    else if (id === "styleScaleBarBackgroundFilter") scaleBarBack.attr("filter", value);
    else if (id === "styleScaleBarBackgroundPaddingTop") scaleBarBack.attr("data-top", value);
    else if (id === "styleScaleBarBackgroundPaddingRight") scaleBarBack.attr("data-right", value);
    else if (id === "styleScaleBarBackgroundPaddingBottom") scaleBarBack.attr("data-bottom", value);
    else if (id === "styleScaleBarBackgroundPaddingLeft") scaleBarBack.attr("data-left", value);

    if (
      [
        "styleScaleBarSize",
        "styleScaleBarPositionX",
        "styleScaleBarPositionY",
        "styleScaleBarLabel",
        "styleScaleBarBackgroundPaddingLeft",
        "styleScaleBarBackgroundPaddingTop",
        "styleScaleBarBackgroundPaddingRight",
        "styleScaleBarBackgroundPaddingBottom"
      ].includes(id)
    ) {
      drawScaleBar(worldContext, viewContext, appServices, scaleBar, scale);
      fitScaleBar(worldContext, viewContext, appServices, scaleBar, svgWidth, svgHeight);
    }
  });

  ensureEl("mapFilters").addEventListener("click", applyMapFilter);

  // ─── Style preset functions (from style-presets.js) ───────────────────────────

  async function applyStyleOnLoad(): Promise<void> {
    const desiredPreset = localStorage.getItem("presetStyle") ?? "default";
    const [appliedPreset, styleData] = await getStylePreset(desiredPreset);
    applyStyle(styleData);
    updateMapFilter();
    const presetEl = ensureEl<HTMLSelectElement>("stylePreset");
    presetEl.value = appliedPreset;
    presetEl.dataset.old = appliedPreset;
    setPresetRemoveButtonVisibiliy();
    selectStyleElement();
  }

  async function getStylePreset(desiredPreset: string): Promise<[string, StyleJSON]> {
    let presetToLoad = desiredPreset;

    const isCustom = !systemPresets.includes(desiredPreset);
    if (isCustom) {
      const storedStyleJSON = localStorage.getItem(desiredPreset);
      if (!storedStyleJSON) {
        ERROR && console.error(`Custom style ${desiredPreset} in not found in localStorage. Applying default style`);
        presetToLoad = "default";
      } else {
        const isValid = JSON.isValid(storedStyleJSON);
        if (isValid) return [desiredPreset, JSON.parse(storedStyleJSON) as StyleJSON];
        ERROR &&
          console.error(`Custom style ${desiredPreset} stored in localStorage is not valid. Applying default style`);
        presetToLoad = "default";
      }
    }

    const styleData = await fetchSystemPreset(presetToLoad);
    return [presetToLoad, styleData];
  }

  async function fetchSystemPreset(preset: string): Promise<StyleJSON> {
    try {
      const res = await fetch(`./styles/${preset}.json?v=${VERSION}`);
      return (await res.json()) as StyleJSON;
    } catch {
      throw new Error(`Cannot fetch style preset ${preset}`);
    }
  }

  function applyStyle(styleJSON: StyleJSON): void {
    for (const selector in styleJSON) {
      if (selector.startsWith("#burgLabels")) {
        const group = selector.split("#").pop()!;
        style.burgLabels[group] = styleJSON[selector] as Record<string, string>;
      }
      if (selector.startsWith("#burgIcons")) {
        const group = selector.split("#").pop()!;
        style.burgIcons[group] = styleJSON[selector] as Record<string, string>;
      }
      if (selector.startsWith("#anchors")) {
        const group = selector.split("#").pop()!;
        style.anchors[group] = styleJSON[selector] as Record<string, string>;
      }

      const el = document.querySelector(selector);
      if (!el) continue;

      for (const attribute in styleJSON[selector]) {
        const value = styleJSON[selector][attribute];

        if (value === "null" || value === null) {
          el.removeAttribute(attribute);
          continue;
        }

        el.setAttribute(attribute, String(value));

        if (selector === "#texture") {
          const image = document.querySelector("#texture > image");
          if (image) {
            if (attribute === "data-x") image.setAttribute("x", String(value));
            if (attribute === "data-y") image.setAttribute("y", String(value));
            if (attribute === "data-href") image.setAttribute("href", String(value));
          }
        }

        if (selector === "#terrs" && attribute === "scheme" && !(String(value) in heightmapColorSchemes)) {
          addCustomColorScheme(String(value));
        }
      }
    }
  }

  function requestStylePresetChange(preset: string): void {
    const isConfirmed = sessionStorage.getItem("styleChangeConfirmed");
    if (isConfirmed) return void changeStyle(preset);

    confirmationDialog({
      title: "Change style preset",
      message: "Are you sure you want to change the style preset? All unsaved style changes will be lost",
      confirm: "Change",
      onConfirm: () => {
        sessionStorage.setItem("styleChangeConfirmed", "true");
        changeStyle(preset);
      },
      onCancel: () => {
        const presetEl = ensureEl<HTMLSelectElement>("stylePreset");
        presetEl.value = presetEl.dataset.old ?? "default";
      }
    });
  }

  async function changeStyle(desiredPreset: string): Promise<void> {
    const [presetName, styleData] = await getStylePreset(desiredPreset);
    localStorage.setItem("presetStyle", presetName);
    applyStyleWithUiRefresh(styleData);
    if (layerIsOn("toggleBurgIcons")) drawBurgIcons(worldContext, viewContext, appServices);
    if (layerIsOn("toggleLabels")) {
      drawBurgLabels(worldContext, viewContext, appServices);
      drawStateLabels(worldContext, viewContext, appServices);
    }
  }

  function applyStyleWithUiRefresh(styleJSON: StyleJSON): void {
    applyStyle(styleJSON);
    updateElements();
    selectStyleElement();
    updateMapFilter();
    const presetEl = ensureEl<HTMLSelectElement>("stylePreset");
    presetEl.dataset.old = presetEl.value;
    invokeActiveZooming();
    setPresetRemoveButtonVisibiliy();
    drawScaleBar(worldContext, viewContext, appServices, scaleBar, scale);
    fitScaleBar(worldContext, viewContext, appServices, scaleBar, svgWidth, svgHeight);
  }

  function addStylePreset(): void {
    openDialog("styleSaver", {
      title: "Style Saver",
      width: "26em",
      position: { my: "center", at: "center", of: "svg" }
    });

    const styleName = ensureEl<HTMLSelectElement>("stylePreset").value.replace(customPresetPrefix, "");
    ensureEl<HTMLInputElement>("styleSaverName").value = styleName;
    ensureEl<HTMLTextAreaElement>("styleSaverJSON").value = JSON.stringify(collectStyleData(), null, 2);
    checkName();

    if (modules.saveStyle) return;
    modules.saveStyle = true;

    ensureEl("styleSaverName").addEventListener("input", checkName);
    ensureEl("styleSaverSave").addEventListener("click", saveStyle);
    ensureEl("styleSaverDownload").addEventListener("click", styleDownload);
    ensureEl("styleSaverLoad").addEventListener("click", () => ensureEl<HTMLInputElement>("styleToLoad").click());
    ensureEl("styleToLoad").addEventListener("change", loadStyleFile);

    function collectStyleData(): StyleJSON {
      const result: StyleJSON = {};

      const attributes: Record<string, string[]> = {
        "#map": ["background-color", "filter", "data-filter"],
        "#armies": ["font-size", "box-size", "stroke", "stroke-width", "fill-opacity", "filter"],
        "#biomes": ["opacity", "filter", "mask"],
        "#stateBorders": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
        "#provinceBorders": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
        "#cells": ["opacity", "stroke", "stroke-width", "filter", "mask"],
        "#gridOverlay": [
          "opacity",
          "scale",
          "dx",
          "dy",
          "type",
          "stroke",
          "stroke-width",
          "stroke-dasharray",
          "stroke-linecap",
          "transform",
          "filter",
          "mask"
        ],
        "#coordinates": [
          "opacity",
          "data-size",
          "font-size",
          "stroke",
          "stroke-width",
          "stroke-dasharray",
          "stroke-linecap",
          "filter",
          "mask"
        ],
        "#compass": ["opacity", "transform", "filter", "mask", "shape-rendering"],
        "#compass > use": ["transform"],
        "#relig": ["opacity", "stroke", "stroke-width", "filter"],
        "#cults": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
        "#landmass": ["opacity", "fill", "filter"],
        "#markers": ["opacity", "rescale", "filter"],
        "#prec": ["opacity", "stroke", "stroke-width", "fill", "filter"],
        "#population": ["opacity", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
        "#rural": ["stroke"],
        "#urban": ["stroke"],
        "#freshwater": ["opacity", "fill", "stroke", "stroke-width", "filter"],
        "#salt": ["opacity", "fill", "stroke", "stroke-width", "filter"],
        "#sinkhole": ["opacity", "fill", "stroke", "stroke-width", "filter"],
        "#frozen": ["opacity", "fill", "stroke", "stroke-width", "filter"],
        "#lava": ["opacity", "fill", "stroke", "stroke-width", "filter"],
        "#dry": ["opacity", "fill", "stroke", "stroke-width", "filter"],
        "#sea_island": ["opacity", "stroke", "stroke-width", "filter", "auto-filter"],
        "#lake_island": ["opacity", "stroke", "stroke-width", "filter"],
        "#terrain": ["opacity", "set", "size", "density", "filter", "mask"],
        "#rivers": ["opacity", "filter", "fill"],
        "#ruler": ["opacity", "filter"],
        "#roads": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
        "#trails": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
        "#searoutes": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
        "#statesBody": ["opacity", "filter"],
        "#statesHalo": ["opacity", "data-width", "stroke-width", "filter"],
        "#provs": ["opacity", "fill", "font-size", "font-family", "filter"],
        "#temperature": [
          "opacity",
          "font-size",
          "fill",
          "fill-opacity",
          "stroke",
          "stroke-width",
          "stroke-dasharray",
          "stroke-linecap",
          "filter"
        ],
        "#ice": ["opacity", "fill", "stroke", "stroke-width", "filter"],
        "#emblems": ["opacity", "stroke-width", "filter"],
        "#emblems > #stateEmblems": ["data-size"],
        "#emblems > #provinceEmblems": ["data-size"],
        "#emblems > #burgEmblems": ["data-size"],
        "#texture": ["opacity", "filter", "mask", "data-x", "data-y", "data-href"],
        "#zones": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
        "#oceanLayers": ["filter", "layers"],
        "#oceanBase": ["fill"],
        "#oceanicPattern": ["href", "opacity"],
        "#terrs #oceanHeights": [
          "data-render",
          "opacity",
          "scheme",
          "terracing",
          "skip",
          "relax",
          "curve",
          "filter",
          "mask"
        ],
        "#terrs #landHeights": ["opacity", "scheme", "terracing", "skip", "relax", "curve", "filter", "mask"],
        "#legend": [
          "data-size",
          "font-size",
          "font-family",
          "stroke",
          "stroke-width",
          "stroke-dasharray",
          "stroke-linecap",
          "data-x",
          "data-y",
          "data-columns"
        ],
        "#legendBox": ["fill", "fill-opacity"],
        "#labels > #states": [
          "opacity",
          "fill",
          "stroke",
          "stroke-width",
          "style",
          "letter-spacing",
          "data-size",
          "font-size",
          "font-family",
          "filter"
        ],
        "#labels > #addedLabels": [
          "opacity",
          "fill",
          "stroke",
          "stroke-width",
          "style",
          "letter-spacing",
          "data-size",
          "font-size",
          "font-family",
          "filter"
        ],
        "#fogging": ["opacity", "fill", "filter"],
        "#vignette": ["opacity", "fill", "filter"],
        "#vignette-rect": ["x", "y", "width", "height", "rx", "ry", "filter"],
        "#scaleBar": ["opacity", "fill", "font-size", "data-bar-size", "data-x", "data-y", "data-label"],
        "#scaleBarBack": [
          "opacity",
          "fill",
          "stroke",
          "stroke-width",
          "filter",
          "data-top",
          "data-right",
          "data-bottom",
          "data-left"
        ]
      };

      const burgLabelsAttributes = [
        "opacity",
        "fill",
        "stroke",
        "stroke-width",
        "style",
        "letter-spacing",
        "data-size",
        "font-size",
        "font-family",
        "data-dx",
        "data-dy"
      ];
      const burgIconsAttributes = [
        "opacity",
        "data-icon",
        "font-size",
        "fill",
        "fill-opacity",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linecap",
        "stroke-linejoin",
        "filter"
      ];
      const anchorsAttributes = ["opacity", "fill", "font-size", "stroke", "stroke-width", "filter"];

      options.burgs.groups.forEach(({ name }) => {
        attributes[`#burgLabels > g#${name}`] = burgLabelsAttributes;
        attributes[`#burgIcons > g#${name}`] = burgIconsAttributes;
        attributes[`#anchors > g#${name}`] = anchorsAttributes;
      });

      for (const selector in attributes) {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) continue;

        result[selector] = {};
        for (const attr of attributes[selector]) {
          let value: string | null = (el.style as unknown as Record<string, string>)[attr] || el.getAttribute(attr);
          if (attr === "font-size" && el.hasAttribute("data-size")) value = el.getAttribute("data-size");
          result[selector][attr] = parseValue(value);
        }
      }

      function parseValue(value: string | null): string | number | null {
        if (value === "null" || value === null) return null;
        if (value === "") return "";
        if (!Number.isNaN(+value)) return +value;
        return value;
      }

      return result;
    }

    function checkName(): void {
      const rawName = ensureEl<HTMLInputElement>("styleSaverName").value;
      const styleName = customPresetPrefix + rawName;

      const isSystem = systemPresets.includes(styleName) || systemPresets.includes(rawName);
      if (isSystem) {
        ensureEl("styleSaverTip").innerHTML = "default";
        return;
      }

      const isExisting = Array.from(ensureEl<HTMLSelectElement>("stylePreset").options).some(
        option => option.value === styleName
      );
      if (isExisting) {
        ensureEl("styleSaverTip").innerHTML = "existing";
        return;
      }

      ensureEl("styleSaverTip").innerHTML = "new";
    }

    function saveStyle(): void {
      const styleJSON = ensureEl<HTMLTextAreaElement>("styleSaverJSON").value;
      const desiredName = ensureEl<HTMLInputElement>("styleSaverName").value;

      if (!styleJSON) {
        tip("Please provide a style JSON", false, "error");
        return;
      }
      if (!JSON.isValid(styleJSON)) {
        tip("JSON string is not valid, please check the format", false, "error");
        return;
      }
      if (!desiredName) {
        tip("Please provide a preset name", false, "error");
        return;
      }
      if (ensureEl("styleSaverTip").innerHTML === "default") {
        tip("You cannot overwrite default preset, please change the name", false, "error");
        return;
      }

      const presetName = customPresetPrefix + desiredName;
      applyOption(ensureEl<HTMLSelectElement>("stylePreset"), presetName, `${desiredName} [custom]`);
      localStorage.setItem("presetStyle", presetName);
      localStorage.setItem(presetName, styleJSON);

      applyStyleWithUiRefresh(JSON.parse(styleJSON) as StyleJSON);
      tip("Style preset is saved and applied", false, "success", 4000);
      closeDialog("styleSaver");
    }

    function styleDownload(): void {
      const styleJSON = ensureEl<HTMLTextAreaElement>("styleSaverJSON").value;
      const styleName = ensureEl<HTMLInputElement>("styleSaverName").value;

      if (!styleJSON) {
        tip("Please provide a style JSON", false, "error");
        return;
      }
      if (!JSON.isValid(styleJSON)) {
        tip("JSON string is not valid, please check the format", false, "error");
        return;
      }
      if (!styleName) {
        tip("Please provide a preset name", false, "error");
        return;
      }

      downloadFile(styleJSON, `${styleName}.json`, "application/json");
    }

    function loadStyleFile(this: HTMLInputElement): void {
      const fileName = this.files?.[0]?.name.replace(/\.[^.]*$/, "") ?? "";
      uploadFile(this, function styleUpload(dataLoaded: string) {
        if (!dataLoaded) return tip("Cannot load the file. Please check the data format", false, "error");
        const isValid = JSON.isValid(dataLoaded);
        if (!isValid) return tip("Loaded data is not a valid JSON, please check the format", false, "error");

        ensureEl<HTMLTextAreaElement>("styleSaverJSON").value = JSON.stringify(JSON.parse(dataLoaded), null, 2);
        ensureEl<HTMLInputElement>("styleSaverName").value = fileName;
        checkName();
        tip("Style preset is uploaded", false, "success", 4000);
      });
    }
  }

  function requestRemoveStylePreset(): void {
    const isDefault = systemPresets.includes(ensureEl<HTMLSelectElement>("stylePreset").value);
    if (isDefault) {
      tip("Cannot remove system preset", false, "error");
      return;
    }

    confirmationDialog({
      title: "Remove style preset",
      message: "Are you sure you want to remove the style preset? This action cannot be undone.",
      confirm: "Remove",
      onConfirm: removeStylePreset
    });
  }

  function removeStylePreset(): void {
    const presetEl = ensureEl<HTMLSelectElement>("stylePreset");
    localStorage.removeItem("presetStyle");
    localStorage.removeItem(presetEl.value);
    presetEl.selectedOptions[0]?.remove();
    changeStyle("default");
  }

  function updateMapFilter(): void {
    const filter = svg.attr("data-filter");
    ensureEl("mapFilters")
      .querySelectorAll<HTMLButtonElement>(".pressed")
      .forEach(button => {
        button.classList.remove("pressed");
      });
    if (!filter) return;
    ensureEl("mapFilters").querySelector<HTMLButtonElement>(`#${filter}`)?.classList.add("pressed");
  }

  function setPresetRemoveButtonVisibiliy(): void {
    const isDefault = systemPresets.includes(ensureEl<HTMLSelectElement>("stylePreset").value);
    ensureEl<HTMLElement>("removeStyleButton").style.display = isDefault ? "none" : "inline-block";
  }

  // ─── Global exports ───────────────────────────────────────────────────────────
  window.editStyle = editStyle;
  window.selectStyleElement = selectStyleElement;
  window.calculateFriendlyGridSize = calculateFriendlyGridSize;
  window.changeFont = changeFont;
  window.updateElements = updateElements;
  window.fetchTextureURL = fetchTextureURL;
  window.textureProvideURL = textureProvideURL;
  window.updateTextureSelectValue = updateTextureSelectValue;

  window.applyStyleOnLoad = applyStyleOnLoad;
  window.applyStyle = applyStyle;
  window.applyStyleWithUiRefresh = applyStyleWithUiRefresh;
  window.changeStyle = changeStyle;
  window.addStylePreset = addStylePreset;
  window.requestStylePresetChange = requestStylePresetChange;
  window.requestRemoveStylePreset = requestRemoveStylePreset;
  window.removeStylePreset = removeStylePreset;
  window.updateMapFilter = updateMapFilter;
}

export function initStyle(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
