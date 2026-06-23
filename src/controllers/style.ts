import type { Selection } from "d3";
import { interpolateRgb, interpolateRgbBasis, scaleSequential } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { onFontAdded } from "../modules/fonts";
import { OceanLayers } from "../modules/ocean-layers";
import {
  BurgIconsRenderer,
  BurgLabelsRenderer,
  drawStateLabels,
  EmblemsRenderer,
  GridRenderer,
  HeightmapRenderer,
  ReliefIconsRenderer
} from "../renderers";
import { drawRegiments, drawScaleBar, fitScaleBar } from "../renderers/index";
import { modules } from "../store/editorState";
import { useStyleState } from "../store/styleState";
import { closeDialog, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { drawHeights, parseTransform, rn, toHEX } from "../utils";
import { heightmapColorSchemes } from "../utils/colorUtils";
import { ERROR, INFO } from "../utils/debug";
import { layerIsOn } from "../utils/nodeUtils";
import { applyOption, lock, tip } from "../utils/uiHelpers";
import { VERSION } from "../versioning";
import { confirmationDialog, downloadFile, redrawLegend, uploadFile } from "./editors";
import { toggleRelief } from "./layers";

// ─── Types ────────────────────────────────────────────────────────────────────

type StyleJSON = Record<string, Record<string, string | number | null>>;
type AnySelection = Selection<SVGGElement, unknown, null, undefined>;

// ─── Color schemes ────────────────────────────────────────────────────────────

export function addCustomColorScheme(scheme: string): void {
  const stops = scheme.split(",");
  heightmapColorSchemes[scheme] = scaleSequential(interpolateRgbBasis(stops));
  (document.getElementById("styleHeightmapScheme") as HTMLSelectElement).options.add(
    new Option(scheme, scheme, false, true)
  );
}

document.addEventListener("fmg:edit-style", (e: Event) => {
  const { element, group } = (e as CustomEvent<{ element: string; group?: string }>).detail;
  editStyle(element, group);
});

// ─── Style element selection ──────────────────────────────────────────────────

export function editStyle(element: string, group?: string): void {
  import("./options").then(m => m.showOptions());
  (document.getElementById("styleTab") as HTMLButtonElement).click();
  (document.getElementById("styleElementSelect") as HTMLSelectElement).value = element;
  if (group)
    (document.getElementById("styleGroupSelect") as HTMLSelectElement).options.add(
      new Option(group, group, true, true)
    );
  selectStyleElement();

  document.getElementById("styleElementSelect")!.classList.add("glow");
  if (group) document.getElementById("styleGroupSelect")!.classList.add("glow");

  setTimeout(() => {
    document.getElementById("styleElementSelect")!.classList.remove("glow");
    if (group) document.getElementById("styleGroupSelect")!.classList.remove("glow");
  }, 1500);
}

function selectStyleElement(): void {
  const styleElement = (document.getElementById("styleElementSelect") as HTMLSelectElement).value;
  let el: AnySelection = viewContext.svg.select<SVGGElement>(`#${styleElement}`);

  const visibility: Record<string, boolean> = {};
  const sliderValues: Record<string, string> = {};

  const isLayerOff = styleElement !== "ocean" && (el.style("display") === "none" || !el.selectAll("*").size());
  visibility.styleIsOff = Boolean(isLayerOff);

  if (["anchors", "borders", "burgIcons", "coastline", "lakes", "labels", "routes", "terrs"].includes(styleElement)) {
    const group = (document.getElementById("styleGroupSelect") as HTMLSelectElement).value;
    const defaultGroupSelector = styleElement === "terrs" ? "#landHeights" : "g";
    el =
      group && el.select<SVGGElement>(`#${group}`).size()
        ? el.select<SVGGElement>(`#${group}`)
        : el.select<SVGGElement>(defaultGroupSelector);
  }

  // Prevent D3 v7 `.attr()` getter from throwing if the selection is empty.
  if (el.empty()) {
    el = viewContext.svg.select<SVGGElement>(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
  }

  if (!["landmass", "legend", "ocean", "regions"].includes(styleElement)) {
    visibility.styleOpacity = true;
    sliderValues.styleOpacityInput = String(el.attr("opacity") ?? 1);
  }

  if (!["landmass", "legend", "regions", "scaleBar"].includes(styleElement)) {
    visibility.styleFilter = true;
    (document.getElementById("styleFilterInput") as HTMLInputElement).value = el.attr("filter") ?? "";
  }

  if (["fogging", "ice", "lakes", "landmass", "prec", "rivers", "scaleBar", "vignette"].includes(styleElement)) {
    visibility.styleFill = true;
    const fill = el.attr("fill") ?? "";
    (document.getElementById("styleFillInput") as HTMLInputElement).value = fill;
    (document.getElementById("styleFillOutput") as HTMLInputElement).value = fill;
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
    (document.getElementById("styleStrokeInput") as HTMLInputElement).value = stroke;
    (document.getElementById("styleStrokeOutput") as HTMLInputElement).value = stroke;
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
    (document.getElementById("styleStrokeDasharrayInput") as HTMLInputElement).value =
      el.attr("stroke-dasharray") ?? "";
    (document.getElementById("styleStrokeLinecapInput") as HTMLInputElement).value =
      el.attr("stroke-linecap") ?? "inherit";
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
    (document.getElementById("styleClippingInput") as HTMLInputElement).value = el.attr("mask") ?? "";
  }

  if (styleElement === "texture") {
    visibility.styleTexture = true;
    (document.getElementById("styleTextureShiftX") as HTMLInputElement).value = String(el.attr("data-x") ?? 0);
    (document.getElementById("styleTextureShiftY") as HTMLInputElement).value = String(el.attr("data-y") ?? 0);
    updateTextureSelectValue(el.attr("data-href") ?? "");
  }

  if (styleElement === "terrs") {
    visibility.styleHeightmap = true;
    (document.getElementById("styleHeightmapRenderOceanOption") as HTMLElement).style.display =
      el.attr("id") === "oceanHeights" ? "block" : "none";
    (document.getElementById("styleHeightmapRenderOcean") as HTMLInputElement).checked = Boolean(
      +el.attr("data-render")!
    );
    (document.getElementById("styleHeightmapScheme") as HTMLSelectElement).value = el.attr("scheme") ?? "";
    sliderValues.styleHeightmapTerracing = el.attr("terracing") ?? "";
    sliderValues.styleHeightmapSkip = el.attr("skip") ?? "";
    sliderValues.styleHeightmapSimplification = el.attr("relax") ?? "";
    (document.getElementById("styleHeightmapCurve") as HTMLSelectElement).value = el.attr("curve") ?? "";
  }

  if (styleElement === "markers") {
    visibility.styleMarkers = true;
    (document.getElementById("styleRescaleMarkers") as HTMLInputElement).checked = Boolean(
      +viewContext.markers.attr("rescale")!
    );
  }

  if (styleElement === "gridOverlay") {
    visibility.styleGrid = true;
    (document.getElementById("styleGridType") as HTMLSelectElement).value = el.attr("type") ?? "";
    (document.getElementById("styleGridScale") as HTMLInputElement).value = String(el.attr("scale") ?? 1);
    (document.getElementById("styleGridShiftX") as HTMLInputElement).value = String(el.attr("dx") ?? 0);
    (document.getElementById("styleGridShiftY") as HTMLInputElement).value = String(el.attr("dy") ?? 0);
    calculateFriendlyGridSize();
  }

  if (styleElement === "compass") {
    visibility.styleCompass = true;
    const tr = parseTransform(viewContext.compass.select("use").attr("transform"));
    (document.getElementById("styleCompassShiftX") as HTMLInputElement).value = String(tr[0]);
    (document.getElementById("styleCompassShiftY") as HTMLInputElement).value = String(tr[1]);
    sliderValues.styleCompassSizeInput = String(tr[2]);
  }

  if (styleElement === "terrain") {
    visibility.styleRelief = true;
    sliderValues.styleReliefSize = String(viewContext.terrain.attr("size") ?? 1);
    sliderValues.styleReliefDensity = String(viewContext.terrain.attr("density") ?? 0.4);
    (document.getElementById("styleReliefSet") as HTMLSelectElement).value = viewContext.terrain.attr("set") ?? "";
  }

  if (styleElement === "population") {
    visibility.stylePopulation = true;
    const ruralStroke = viewContext.population.select("#rural").attr("stroke") ?? "";
    const urbanStroke = viewContext.population.select("#urban").attr("stroke") ?? "";
    (document.getElementById("stylePopulationRuralStrokeInput") as HTMLInputElement).value = ruralStroke;
    (document.getElementById("stylePopulationRuralStrokeOutput") as HTMLInputElement).value = ruralStroke;
    (document.getElementById("stylePopulationUrbanStrokeInput") as HTMLInputElement).value = urbanStroke;
    (document.getElementById("stylePopulationUrbanStrokeOutput") as HTMLInputElement).value = urbanStroke;
    visibility.styleStrokeWidth = true;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
  }

  if (styleElement === "regions") {
    visibility.styleStates = true;
    sliderValues.styleStatesBodyOpacity = String(viewContext.statesBody.attr("opacity") ?? 1);
    (document.getElementById("styleStatesBodyFilter") as HTMLInputElement).value =
      viewContext.statesBody.attr("filter") ?? "";
    sliderValues.styleStatesHaloWidth = String(viewContext.statesHalo.attr("data-width") ?? 10);
    sliderValues.styleStatesHaloOpacity = String(viewContext.statesHalo.attr("opacity") ?? 1);
    const blurMatch = viewContext.statesHalo.attr("filter")?.match(/blur\(([^)]+)\)/);
    sliderValues.styleStatesHaloBlur = String(blurMatch ? parseFloat(blurMatch[1]) : 0);
  }

  if (styleElement === "provs") {
    visibility.styleFill = true;
    visibility.styleSize = true;
    const fill = el.attr("fill") ?? "#111111";
    (document.getElementById("styleFillInput") as HTMLInputElement).value = fill;
    (document.getElementById("styleFillOutput") as HTMLInputElement).value = fill;
    visibility.styleFont = true;
    (document.getElementById("styleSelectFont") as HTMLSelectElement).value = el.attr("font-family") ?? "";
    (document.getElementById("styleFontSize") as HTMLInputElement).value = el.attr("font-size") ?? "";
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
    (document.getElementById("styleFillInput") as HTMLInputElement).value = fill;
    (document.getElementById("styleFillOutput") as HTMLInputElement).value = fill;
    (document.getElementById("styleStrokeInput") as HTMLInputElement).value = stroke;
    (document.getElementById("styleStrokeOutput") as HTMLInputElement).value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
    sliderValues.styleLetterSpacingInput = String(el.attr("letter-spacing") ?? 0);
    (document.getElementById("styleShadowInput") as HTMLInputElement).value = el.style("text-shadow") ?? "";
    (document.getElementById("styleLabelsHideGroup") as HTMLInputElement).checked = el.node()?.style.display === "none";

    visibility.styleFont = true;
    (document.getElementById("styleSelectFont") as HTMLSelectElement).value = el.attr("font-family") ?? "";
    (document.getElementById("styleFontSize") as HTMLInputElement).value = el.attr("data-size") ?? "";

    if ((el.node() as Element).parentElement?.id === "burgLabels") {
      visibility.styleFontShift = true;
      (document.getElementById("styleFontShiftX") as HTMLInputElement).value = String(el.attr("data-dx") ?? 0);
      (document.getElementById("styleFontShiftY") as HTMLInputElement).value = String(el.attr("data-dy") ?? 0);
    }
  }

  if (styleElement === "burgIcons") {
    visibility.styleBurgIcons = true;
    (document.getElementById("styleBurgIconsIcon") as HTMLSelectElement).value = el.attr("data-icon") ?? "";
    sliderValues.styleBurgIconsIconSize = el.attr("font-size") ?? "";
    (document.getElementById("styleBurgIconsStrokeLinejoin") as HTMLSelectElement).value =
      el.attr("stroke-linejoin") ?? "";
    sliderValues.styleBurgIconsFillOpacity = el.attr("fill-opacity") ?? "";

    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleStrokeDash = true;
    const fill = el.attr("fill") ?? "#ffffff";
    const stroke = el.attr("stroke") ?? "#3e3e4b";
    (document.getElementById("styleFillInput") as HTMLInputElement).value = fill;
    (document.getElementById("styleFillOutput") as HTMLInputElement).value = fill;
    (document.getElementById("styleStrokeInput") as HTMLInputElement).value = stroke;
    (document.getElementById("styleStrokeOutput") as HTMLInputElement).value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);
    (document.getElementById("styleStrokeDasharrayInput") as HTMLInputElement).value =
      el.attr("stroke-dasharray") ?? "";
    (document.getElementById("styleStrokeLinecapInput") as HTMLInputElement).value =
      el.attr("stroke-linecap") ?? "inherit";
  }

  if (styleElement === "anchors") {
    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleSize = true;
    const fill = el.attr("fill") ?? "#ffffff";
    const stroke = el.attr("stroke") ?? "#3e3e4b";
    (document.getElementById("styleFillInput") as HTMLInputElement).value = fill;
    (document.getElementById("styleFillOutput") as HTMLInputElement).value = fill;
    (document.getElementById("styleStrokeInput") as HTMLInputElement).value = stroke;
    (document.getElementById("styleStrokeOutput") as HTMLInputElement).value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);
    (document.getElementById("styleFontSize") as HTMLInputElement).value = String(el.attr("font-size") ?? 1);
  }

  if (styleElement === "legend") {
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleSize = true;
    visibility.styleLegend = true;
    const legendBox = el.select<SVGRectElement>("#legendBox");
    sliderValues.styleLegendColItems = el.attr("data-columns") ?? "";
    const backFill = legendBox.size() ? (legendBox.attr("fill") ?? "#ffffff") : "#ffffff";
    (document.getElementById("styleLegendBack") as HTMLInputElement).value = backFill;
    (document.getElementById("styleLegendBackOutput") as HTMLInputElement).value = backFill;
    sliderValues.styleLegendOpacity = String(legendBox.size() ? (legendBox.attr("fill-opacity") ?? 1) : 1);
    const stroke = el.attr("stroke") ?? "#111111";
    (document.getElementById("styleStrokeInput") as HTMLInputElement).value = stroke;
    (document.getElementById("styleStrokeOutput") as HTMLInputElement).value = stroke;
    sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.5);
    visibility.styleFont = true;
    (document.getElementById("styleSelectFont") as HTMLSelectElement).value = el.attr("font-family") ?? "";
    (document.getElementById("styleFontSize") as HTMLInputElement).value = el.attr("data-size") ?? "";
  }

  if (styleElement === "ocean") {
    visibility.styleOcean = true;
    const oceanBase = viewContext.oceanLayers.select<SVGRectElement>("#oceanBase");
    const fill = oceanBase.attr("fill") ?? "";
    (document.getElementById("styleOceanFill") as HTMLInputElement).value = fill;
    (document.getElementById("styleOceanFillOutput") as HTMLInputElement).value = fill;
    (document.getElementById("styleOceanPattern") as HTMLInputElement).value =
      document.getElementById("oceanicPattern")?.getAttribute("href") ?? "";
    sliderValues.styleOceanPatternOpacity = document.getElementById("oceanicPattern")?.getAttribute("opacity") ?? "1";
    (document.getElementById("outlineLayers") as HTMLSelectElement).value =
      viewContext.oceanLayers.attr("layers") ?? "";
  }

  if (styleElement === "temperature") {
    visibility.styleStrokeWidth = true;
    visibility.styleTemperature = true;
    sliderValues.styleStrokeWidthInput = el.attr("stroke-width") ?? "";
    sliderValues.styleTemperatureFillOpacityInput = String(el.attr("fill-opacity") ?? 0.1);
    const tempFill = el.attr("fill") ?? "#000";
    (document.getElementById("styleTemperatureFillInput") as HTMLInputElement).value = tempFill;
    (document.getElementById("styleTemperatureFillOutput") as HTMLInputElement).value = tempFill;
    sliderValues.styleTemperatureFontSizeInput = (el.attr("font-size") ?? "8").replace(/px$/, "");
  }

  if (styleElement === "coordinates") {
    visibility.styleSize = true;
    (document.getElementById("styleFontSize") as HTMLInputElement).value = el.attr("data-size") ?? "";
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
    sliderValues.emblemsStateSizeInput = viewContext.emblems.select("#stateEmblems").attr("data-size") ?? "1";
    sliderValues.emblemsProvinceSizeInput = viewContext.emblems.select("#provinceEmblems").attr("data-size") ?? "1";
    sliderValues.emblemsBurgSizeInput = viewContext.emblems.select("#burgEmblems").attr("data-size") ?? "1";
  }

  // update group options
  (document.getElementById("styleGroupSelect") as HTMLSelectElement).options.length = 0;
  if (["anchors", "borders", "burgIcons", "coastline", "lakes", "labels", "routes", "terrs"].includes(styleElement)) {
    const groups = document.getElementById(styleElement)!.querySelectorAll<SVGGElement>("g");
    groups.forEach(g => {
      if (g.id === "burgLabels") return;
      const option = new Option(`${g.id} (${g.childElementCount})`, g.id, false, false);
      (document.getElementById("styleGroupSelect") as HTMLSelectElement).options.add(option);
    });
    (document.getElementById("styleGroupSelect") as HTMLSelectElement).value = el.attr("id") ?? "";
    visibility.styleGroup = true;
  } else {
    (document.getElementById("styleGroupSelect") as HTMLSelectElement).options.add(
      new Option(styleElement, styleElement, false, true)
    );
    visibility.styleGroup = false;
  }

  if (
    styleElement === "coastline" &&
    (document.getElementById("styleGroupSelect") as HTMLSelectElement).value === "sea_island"
  ) {
    visibility.styleCoastline = true;
    const auto = Boolean(viewContext.coastline.select("#sea_island").attr("auto-filter"));
    (document.getElementById("styleCoastlineAuto") as HTMLInputElement).checked = auto;
    if (auto) visibility.styleFilter = false;
  }

  if (styleElement === "scaleBar") {
    visibility.styleScaleBar = true;
    const scaleBarEl = viewContext.scaleBar;
    (document.getElementById("styleScaleBarSize") as HTMLInputElement).value = scaleBarEl.attr("data-bar-size") ?? "";
    (document.getElementById("styleScaleBarFontSize") as HTMLInputElement).value = scaleBarEl.attr("font-size") ?? "";
    (document.getElementById("styleScaleBarPositionX") as HTMLInputElement).value = scaleBarEl.attr("data-x") ?? "99";
    (document.getElementById("styleScaleBarPositionY") as HTMLInputElement).value = scaleBarEl.attr("data-y") ?? "99";
    (document.getElementById("styleScaleBarLabel") as HTMLInputElement).value = scaleBarEl.attr("data-label") ?? "";

    const scaleBarBack = scaleBarEl.select<SVGRectElement>("#scaleBarBack");
    if (scaleBarBack.size()) {
      sliderValues.styleScaleBarBackgroundOpacity = scaleBarBack.attr("opacity") ?? "";
      const backFill = scaleBarBack.attr("fill") ?? "";
      (document.getElementById("styleScaleBarBackgroundFill") as HTMLInputElement).value = backFill;
      (document.getElementById("styleScaleBarBackgroundFillOutput") as HTMLInputElement).value = backFill;
      const backStroke = scaleBarBack.attr("stroke") ?? "";
      (document.getElementById("styleScaleBarBackgroundStroke") as HTMLInputElement).value = backStroke;
      (document.getElementById("styleScaleBarBackgroundStrokeOutput") as HTMLInputElement).value = backStroke;
      (document.getElementById("styleScaleBarBackgroundStrokeWidth") as HTMLInputElement).value =
        scaleBarBack.attr("stroke-width") ?? "";
      (document.getElementById("styleScaleBarBackgroundFilter") as HTMLInputElement).value =
        scaleBarBack.attr("filter") ?? "";
      (document.getElementById("styleScaleBarBackgroundPaddingTop") as HTMLInputElement).value =
        scaleBarBack.attr("data-top") ?? "";
      (document.getElementById("styleScaleBarBackgroundPaddingRight") as HTMLInputElement).value =
        scaleBarBack.attr("data-right") ?? "";
      (document.getElementById("styleScaleBarBackgroundPaddingBottom") as HTMLInputElement).value =
        scaleBarBack.attr("data-bottom") ?? "";
      (document.getElementById("styleScaleBarBackgroundPaddingLeft") as HTMLInputElement).value =
        scaleBarBack.attr("data-left") ?? "";
    }
  }

  if (styleElement === "vignette") {
    visibility.styleVignette = true;
    const maskRect = document.getElementById("vignette-rect");
    if (maskRect) {
      const digit = (str: string | null) => (str ?? "").replace(/[^\d.]/g, "");
      (document.getElementById("styleVignetteX") as HTMLInputElement).value = digit(maskRect.getAttribute("x"));
      (document.getElementById("styleVignetteY") as HTMLInputElement).value = digit(maskRect.getAttribute("y"));
      (document.getElementById("styleVignetteWidth") as HTMLInputElement).value = digit(maskRect.getAttribute("width"));
      (document.getElementById("styleVignetteHeight") as HTMLInputElement).value = digit(
        maskRect.getAttribute("height")
      );
      (document.getElementById("styleVignetteRx") as HTMLInputElement).value = digit(maskRect.getAttribute("rx"));
      (document.getElementById("styleVignetteRy") as HTMLInputElement).value = digit(maskRect.getAttribute("ry"));
      sliderValues.styleVignetteBlur = digit(maskRect.getAttribute("filter"));
    }
  }

  useStyleState.getState().setValues(sliderValues);
  useStyleState.getState().setVisibility(visibility);
}
// ─── Helper: get current D3 selection ─────────────────────────────────────────

function getEl(): AnySelection {
  const el = (document.getElementById("styleElementSelect") as HTMLSelectElement).value;
  const g = (document.getElementById("styleGroupSelect") as HTMLSelectElement).value;

  let selection = viewContext.svg.select<SVGGElement>(`#${el}`);
  if (g !== el && g !== "") {
    selection = selection.select<SVGGElement>(`#${g}`);
  }

  // Prevent D3 v7 `.attr()` getter from throwing if the selection is empty.
  if (selection.empty()) {
    return viewContext.svg.select<SVGGElement>(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
  }

  return selection;
}

// ─── Texture helpers ──────────────────────────────────────────────────────────

function changeTexture(href: string): void {
  viewContext.texture.attr("data-href", href);
  viewContext.texture.select("image").attr("href", href);
}

export function updateTextureSelectValue(href: string): void {
  const select = document.getElementById("styleTextureInput") as HTMLSelectElement;
  const isAdded = Array.from(select.options).some(option => option.value === href);
  if (isAdded) {
    select.value = href;
  } else {
    const name = href.split("/").pop()?.slice(0, 20) ?? href;
    select.add(new Option(name, href, false, true));
  }
}

// ─── Grid size calculator ─────────────────────────────────────────────────────

export function calculateFriendlyGridSize(): void {
  const size = +(document.getElementById("styleGridScale") as HTMLInputElement).value * 25;
  const friendly = `${rn(size * worldContext.distanceScale, 2)} ${distanceUnitInput.value}`;
  (document.getElementById("styleGridSizeFriendly") as HTMLInputElement).value = friendly;
}

// ─── Compass helper ───────────────────────────────────────────────────────────

function shiftCompass(sizeOverride?: string): void {
  const x = (document.getElementById("styleCompassShiftX") as HTMLInputElement).value;
  const y = (document.getElementById("styleCompassShiftY") as HTMLInputElement).value;
  const size = sizeOverride ?? useStyleState.getState().values.styleCompassSizeInput ?? "0.3";
  viewContext.compass.select("use").attr("transform", `translate(${x} ${y}) scale(${size})`);
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

export function changeFont(): void {
  const family = (document.getElementById("styleSelectFont") as HTMLSelectElement).value;
  getEl().attr("font-family", family);
  if ((document.getElementById("styleElementSelect") as HTMLSelectElement).value === "legend") redrawLegend();
}

function changeFontSize(el: AnySelection, size: number): void {
  (document.getElementById("styleFontSize") as HTMLInputElement).value = String(size);
  const styleElement = (document.getElementById("styleElementSelect") as HTMLSelectElement).value;

  const getSizeOnScale = (element: string): number => {
    if (element === "labels") return Math.max(rn((size + size / viewContext.scale) / 2, 2), 1);
    if (element === "coordinates") return rn(size / viewContext.scale ** 0.8, 2);
    return size;
  };

  const scaleSize = getSizeOnScale(styleElement);
  el.attr("data-size", size).attr("font-size", scaleSize);

  if (styleElement === "legend") redrawLegend();
}

// ─── updateElements ───────────────────────────────────────────────────────────

function updateElements(): void {
  if (layerIsOn("toggleHeight")) HeightmapRenderer.render(worldContext, viewContext, appServices);
  if (viewContext.legend.selectAll("*").size()) redrawLegend();
  viewContext.oceanLayers.selectAll("path").remove();
  OceanLayers();
  import("../main").then(m => m.invokeActiveZooming());
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
      if (
        (document.getElementById("styleElementSelect") as HTMLSelectElement).value === "gridOverlay" &&
        layerIsOn("toggleGrid")
      )
        GridRenderer.render(worldContext, viewContext, appServices);
      break;
    case "styleLetterSpacingInput":
      getEl().attr("letter-spacing", value);
      break;
    case "styleHeightmapTerracing":
      getEl().attr("terracing", value);
      HeightmapRenderer.render(worldContext, viewContext, appServices);
      break;
    case "styleHeightmapSkip":
      getEl().attr("skip", value);
      HeightmapRenderer.render(worldContext, viewContext, appServices);
      break;
    case "styleHeightmapSimplification":
      getEl().attr("relax", value);
      HeightmapRenderer.render(worldContext, viewContext, appServices);
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
      viewContext.terrain.attr("size", value);
      ReliefIconsRenderer.render(worldContext, viewContext, appServices);
      if (!layerIsOn("toggleRelief")) toggleRelief();
      break;
    case "styleReliefDensity":
      viewContext.terrain.attr("density", value);
      ReliefIconsRenderer.render(worldContext, viewContext, appServices);
      if (!layerIsOn("toggleRelief")) toggleRelief();
      break;
    case "styleLegendColItems":
      viewContext.legend.select("#legendBox").attr("data-columns", value);
      redrawLegend();
      break;
    case "styleLegendOpacity":
      viewContext.legend.select("#legendBox").attr("fill-opacity", value);
      break;
    case "styleTemperatureFillOpacityInput":
      viewContext.temperature.attr("fill-opacity", value);
      break;
    case "styleTemperatureFontSizeInput":
      viewContext.temperature.attr("font-size", `${value}px`);
      break;
    case "styleStatesBodyOpacity":
      viewContext.statesBody.attr("opacity", value);
      break;
    case "styleStatesHaloWidth":
      viewContext.statesHalo.attr("data-width", value).attr("stroke-width", value);
      break;
    case "styleStatesHaloOpacity":
      viewContext.statesHalo.attr("opacity", value);
      break;
    case "styleStatesHaloBlur": {
      const blur = Number(value) > 0 ? `blur(${value}px)` : null;
      viewContext.statesHalo.attr("filter", blur);
      break;
    }
    case "styleArmiesFillOpacity":
      viewContext.armies.attr("fill-opacity", value);
      break;
    case "styleArmiesSize": {
      const numVal = Number(value);
      viewContext.armies.attr("box-size", numVal).attr("font-size", numVal * 2);
      viewContext.armies.selectAll("g").remove();
      worldContext.pack.states.forEach(s => {
        if (!s.i || s.removed || !s.military?.length) return;
        drawRegiments(worldContext, viewContext, appServices, s.military, s.i);
      });
      break;
    }
    case "emblemsStateSizeInput":
      viewContext.emblems.select("#stateEmblems").attr("data-size", value);
      EmblemsRenderer.render(worldContext, viewContext, appServices);
      break;
    case "emblemsProvinceSizeInput":
      viewContext.emblems.select("#provinceEmblems").attr("data-size", value);
      EmblemsRenderer.render(worldContext, viewContext, appServices);
      break;
    case "emblemsBurgSizeInput":
      viewContext.emblems.select("#burgEmblems").attr("data-size", value);
      EmblemsRenderer.render(worldContext, viewContext, appServices);
      break;
    case "styleScaleBarBackgroundOpacity":
      viewContext.scaleBar.select<SVGRectElement>("#scaleBarBack").attr("opacity", value);
      break;
  }
}

// ─── Map filter ───────────────────────────────────────────────────────────────

function applyMapFilter(event: Event): void {
  if ((event.target as HTMLElement).tagName !== "BUTTON") return;
  const button = event.target as HTMLButtonElement;
  viewContext.svg.attr("data-filter", null).attr("filter", null);
  if (button.classList.contains("pressed")) {
    button.classList.remove("pressed");
    return;
  }
  document
    .getElementById("mapFilters")!
    .querySelectorAll<HTMLButtonElement>(".pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  button.classList.add("pressed");
  viewContext.svg.attr("data-filter", button.id).attr("filter", `url(#filter-${button.id})`);
}

// ─── Texture URL dialog ───────────────────────────────────────────────────────

export function textureProvideURL(): void {
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

export function fetchTextureURL(url: string): void {
  INFO && console.info("Provided URL is", url); // INFO is a global debug flag
  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById("texturePreview") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = url;
}

// ─── Module-level forwarding refs set by initStyleTab ────────────────────────

let _applyStyleOnLoad: (() => Promise<void>) | null = null;
let _requestStylePresetChange: ((preset: string) => void) | null = null;
let _addStylePreset: (() => void) | null = null;
let _requestRemoveStylePreset: (() => void) | null = null;

export async function applyStyleOnLoad(): Promise<void> {
  if (!_applyStyleOnLoad) throw new Error("applyStyleOnLoad called before initStyleTab");
  return _applyStyleOnLoad();
}

export function requestStylePresetChange(preset: string): void {
  if (!_requestStylePresetChange) throw new Error("requestStylePresetChange called before initStyleTab");
  _requestStylePresetChange(preset);
}

export function addStylePreset(): void {
  if (!_addStylePreset) throw new Error("addStylePreset called before initStyleTab");
  _addStylePreset();
}

export function requestRemoveStylePreset(): void {
  if (!_requestRemoveStylePreset) throw new Error("requestRemoveStylePreset called before initStyleTab");
  _requestRemoveStylePreset();
}

export function initStyleTab() {
  onFontAdded((family, shouldSelect) => {
    const select = document.getElementById("styleSelectFont") as HTMLSelectElement | null;
    if (!select) return;
    if (!select.querySelector(`option[value="${family}"]`)) {
      const option = new Option(family, family);
      option.style.fontFamily = family;
      select.append(option);
    }
    if (shouldSelect) {
      select.value = family;
      changeFont();
    }
  });

  // ─── Initialization: filter dropdowns ────────────────────────────────────────

  {
    const filters = Array.from(document.getElementById("filters")!.querySelectorAll<SVGFilterElement>("filter"));
    const buildFilterOptions = (): HTMLOptionElement[] => {
      const noneOpt = new Option("None", "");
      noneOpt.selected = true;
      return [
        noneOpt,
        ...filters.map(filter => {
          const id = filter.getAttribute("id")!;
          const name = filter.getAttribute("name") ?? id;
          return new Option(name, `url(#${id})`);
        })
      ];
    };
    const populateFilterSelect = (elId: string): void => {
      (document.getElementById(elId) as HTMLSelectElement).replaceChildren(...buildFilterOptions());
    };
    populateFilterSelect("styleFilterInput");
    populateFilterSelect("styleStatesBodyFilter");
    populateFilterSelect("styleScaleBarBackgroundFilter");
  }

  // ─── Initialization: heightmap scheme dropdown ────────────────────────────────

  (document.getElementById("styleHeightmapScheme") as HTMLSelectElement).replaceChildren(
    ...Object.keys(heightmapColorSchemes).map(scheme => new Option(scheme, scheme))
  );

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
    (document.getElementById("styleVignettePreset") as HTMLSelectElement).options.add(
      new Option(preset, preset, false, false)
    );
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
    const storedStyles = Object.keys(localStorage).filter(key => key.startsWith(customPresetPrefix));
    const systemOptionEls = systemPresets.map(name => new Option(name, name));
    const customOptionEls = storedStyles.map(key => new Option(`${key.replace(customPresetPrefix, "")} [custom]`, key));
    (document.getElementById("stylePreset") as HTMLSelectElement).replaceChildren(
      ...systemOptionEls,
      ...customOptionEls
    );
  }

  // ─── Event listeners ──────────────────────────────────────────────────────────

  document.getElementById("styleElements")!.addEventListener("change", (ev: Event) => {
    const target = ev.target as HTMLElement;
    if (target.dataset.stored) lock(target.dataset.stored);
  });

  document.getElementById("styleElementSelect")!.addEventListener("change", selectStyleElement);
  document.getElementById("styleGroupSelect")!.addEventListener("change", selectStyleElement);

  document.getElementById("styleFillInput")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    (document.getElementById("styleFillOutput") as HTMLInputElement).value = value;
    getEl().attr("fill", value);
  });

  document.getElementById("styleStrokeInput")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    (document.getElementById("styleStrokeOutput") as HTMLInputElement).value = value;
    getEl().attr("stroke", value);
    if (
      (document.getElementById("styleElementSelect") as HTMLSelectElement).value === "gridOverlay" &&
      layerIsOn("toggleGrid")
    )
      GridRenderer.render(worldContext, viewContext, appServices);
  });

  document.getElementById("styleStrokeDasharrayInput")!.addEventListener("input", (e: Event) => {
    getEl().attr("stroke-dasharray", (e.target as HTMLInputElement).value);
    if (
      (document.getElementById("styleElementSelect") as HTMLSelectElement).value === "gridOverlay" &&
      layerIsOn("toggleGrid")
    )
      GridRenderer.render(worldContext, viewContext, appServices);
  });

  document.getElementById("styleStrokeLinecapInput")!.addEventListener("change", (e: Event) => {
    getEl().attr("stroke-linecap", (e.target as HTMLSelectElement).value);
    if (
      (document.getElementById("styleElementSelect") as HTMLSelectElement).value === "gridOverlay" &&
      layerIsOn("toggleGrid")
    )
      GridRenderer.render(worldContext, viewContext, appServices);
  });

  document.getElementById("styleLabelsHideGroup")!.addEventListener("change", (e: Event) => {
    if ((e.target as HTMLInputElement).checked) getEl().style("display", "none");
    else getEl().style("display", null);
  });

  document.getElementById("styleFilterInput")!.addEventListener("change", (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    if ((document.getElementById("styleGroupSelect") as HTMLSelectElement).value === "ocean")
      return void viewContext.oceanLayers.attr("filter", value);
    getEl().attr("filter", value);
  });

  document.getElementById("styleTextureInput")!.addEventListener("change", (e: Event) => {
    changeTexture((e.target as HTMLSelectElement).value);
  });

  document.getElementById("styleTextureShiftX")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    const numVal = +(e.target as HTMLInputElement).valueAsNumber;
    viewContext.texture.attr("data-x", value);
    viewContext.texture
      .select("image")
      .attr("x", value)
      .attr("width", worldContext.graphWidth - numVal);
  });

  document.getElementById("styleTextureShiftY")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    const numVal = +(e.target as HTMLInputElement).valueAsNumber;
    viewContext.texture.attr("data-y", value);
    viewContext.texture
      .select("image")
      .attr("y", value)
      .attr("height", worldContext.graphHeight - numVal);
  });

  document.getElementById("styleClippingInput")!.addEventListener("change", (e: Event) => {
    getEl().attr("mask", (e.target as HTMLSelectElement).value);
  });

  document.getElementById("styleGridType")!.addEventListener("change", (e: Event) => {
    getEl().attr("type", (e.target as HTMLSelectElement).value);
    if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
    calculateFriendlyGridSize();
  });

  document.getElementById("styleGridScale")!.addEventListener("input", () => {
    getEl().attr("scale", (document.getElementById("styleGridScale") as HTMLInputElement).value);
    if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
    calculateFriendlyGridSize();
  });

  document.getElementById("styleGridShiftX")!.addEventListener("input", (e: Event) => {
    getEl().attr("dx", (e.target as HTMLInputElement).value);
    if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
  });

  document.getElementById("styleGridShiftY")!.addEventListener("input", (e: Event) => {
    getEl().attr("dy", (e.target as HTMLInputElement).value);
    if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
  });

  document.getElementById("styleRescaleMarkers")!.addEventListener("change", (e: Event) => {
    viewContext.markers.attr("rescale", +(e.target as HTMLInputElement).checked);
    import("../main").then(m => m.invokeActiveZooming());
  });

  document.getElementById("styleCoastlineAuto")!.addEventListener("change", (e: Event) => {
    const checked = (e.target as HTMLInputElement).checked;
    viewContext.coastline.select("#sea_island").attr("auto-filter", +checked);
    (document.getElementById("styleFilter") as HTMLElement).style.display = checked ? "none" : "block";
    import("../main").then(m => m.invokeActiveZooming());
  });

  document.getElementById("styleOceanFill")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    viewContext.oceanLayers.select("rect").attr("fill", value);
    (document.getElementById("styleOceanFillOutput") as HTMLInputElement).value = value;
  });

  document.getElementById("styleOceanPattern")!.addEventListener("change", (e: Event) => {
    document.getElementById("oceanicPattern")!.setAttribute("href", (e.target as HTMLSelectElement).value);
  });

  document.getElementById("outlineLayers")!.addEventListener("change", (e: Event) => {
    viewContext.oceanLayers.selectAll("path").remove();
    viewContext.oceanLayers.attr("layers", (e.target as HTMLSelectElement).value);
    OceanLayers();
  });

  document.getElementById("styleHeightmapScheme")!.addEventListener("change", (e: Event) => {
    getEl().attr("scheme", (e.target as HTMLSelectElement).value);
    HeightmapRenderer.render(worldContext, viewContext, appServices);
  });

  document
    .getElementById("openCreateHeightmapSchemeButton")!
    .addEventListener("click", function (this: HTMLButtonElement) {
      const button = this;
      const scheme = getEl().attr("scheme") ?? "bright";
      button.dataset.stops = scheme.startsWith("#")
        ? scheme
        : [0, 0.25, 0.5, 0.75, 1].map(heightmapColorSchemes[scheme]).map(toHEX).join(",");

      function renderPreview(): void {
        const stops = button.dataset.stops!.split(",");
        const previewScheme = scaleSequential(interpolateRgbBasis(stops));
        const preview = drawHeights({
          heights: Array.from(worldContext.grid.cells.h),
          width: worldContext.grid.cellsX,
          height: worldContext.grid.cellsY,
          scheme: previewScheme,
          renderOcean: false
        });
        (document.getElementById("heightmapSchemePreview") as HTMLImageElement).src = preview;
      }

      function renderStops(): void {
        const stops = button.dataset.stops!.split(",");
        const container = document.getElementById("heightmapSchemeStops")!;

        const createColorInput = (color: string, idx: number): HTMLInputElement => {
          const input = document.createElement("input");
          input.type = "color";
          input.className = "stop";
          input.value = color;
          input.dataset.tip = "Click to set the color";
          input.style.width = "2.5em";
          input.style.border = "none";
          input.oninput = function () {
            stops[idx] = (this as HTMLInputElement).value;
            button.dataset.stops = stops.join(",");
            renderPreview();
            renderGradient();
          };
          return input;
        };

        const createRemoveButton = (idx: number): HTMLButtonElement => {
          const btn = document.createElement("button");
          btn.className = "remove";
          btn.dataset.index = String(idx);
          btn.dataset.tip = "Remove color stop";
          btn.style.marginTop = "0.3em";
          btn.style.height = "max-content";
          btn.textContent = "x";
          btn.onclick = () => {
            stops.splice(idx, 1);
            button.dataset.stops = stops.join(",");
            renderPreview();
            renderStops();
            renderGradient();
          };
          return btn;
        };

        const createAddButton = (idx: number): HTMLButtonElement => {
          const btn = document.createElement("button");
          btn.className = "add";
          btn.dataset.tip = "Add color stop in between";
          btn.style.marginTop = "0.3em";
          btn.style.height = "max-content";
          btn.textContent = "+";
          btn.onclick = () => {
            const middleColor = interpolateRgb(stops[idx], stops[idx + 1])(0.5);
            stops.splice(idx + 1, 0, toHEX(middleColor));
            button.dataset.stops = stops.join(",");
            renderPreview();
            renderStops();
            renderGradient();
          };
          return btn;
        };

        const children: Node[] = [];
        stops.forEach((stop, idx) => {
          children.push(createColorInput(stop, idx));
          if (idx && idx < stops.length - 1) children.push(createRemoveButton(idx));
          if (idx < stops.length - 1) children.push(createAddButton(idx));
        });
        container.replaceChildren(...children);
      }

      function renderGradient(): void {
        const stops = button.dataset.stops!;
        (document.getElementById("heightmapSchemeGradient") as HTMLElement).style.background =
          `linear-gradient(to right, ${stops})`;
      }

      function handleCreate(): void {
        const stops = button.dataset.stops!;
        if (stops in heightmapColorSchemes) {
          tip("This scheme already exists", false, "error");
          return;
        }
        addCustomColorScheme(stops);
        getEl().attr("scheme", stops);
        HeightmapRenderer.render(worldContext, viewContext, appServices);
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

  document.getElementById("styleHeightmapRenderOcean")!.addEventListener("change", (e: Event) => {
    getEl().attr("data-render", +(e.target as HTMLInputElement).checked);
    HeightmapRenderer.render(worldContext, viewContext, appServices);
  });

  document.getElementById("styleHeightmapCurve")!.addEventListener("change", (e: Event) => {
    getEl().attr("curve", (e.target as HTMLSelectElement).value);
    HeightmapRenderer.render(worldContext, viewContext, appServices);
  });

  document.getElementById("styleReliefSet")!.addEventListener("change", (e: Event) => {
    viewContext.terrain.attr("set", (e.target as HTMLSelectElement).value);
    ReliefIconsRenderer.render(worldContext, viewContext, appServices);
    if (!layerIsOn("toggleRelief")) toggleRelief();
  });

  document.getElementById("styleTemperatureFillInput")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    viewContext.temperature.attr("fill", value);
    (document.getElementById("styleTemperatureFillOutput") as HTMLInputElement).value = value;
  });

  document.getElementById("stylePopulationRuralStrokeInput")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    viewContext.population.select("#rural").attr("stroke", value);
    (document.getElementById("stylePopulationRuralStrokeOutput") as HTMLInputElement).value = value;
  });

  document.getElementById("stylePopulationUrbanStrokeInput")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    viewContext.population.select("#urban").attr("stroke", value);
    (document.getElementById("stylePopulationUrbanStrokeOutput") as HTMLInputElement).value = value;
  });

  document.getElementById("styleBurgIconsIcon")!.addEventListener("change", (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    getEl().attr("data-icon", value).selectAll<SVGUseElement, unknown>("use").attr("href", value);
  });

  document.getElementById("styleBurgIconsStrokeLinejoin")!.addEventListener("change", (e: Event) => {
    getEl().attr("stroke-linejoin", (e.target as HTMLSelectElement).value);
  });

  document.getElementById("styleCompassShiftX")!.addEventListener("input", () => shiftCompass());
  document.getElementById("styleCompassShiftY")!.addEventListener("input", () => shiftCompass());

  document.getElementById("styleLegendBack")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    (document.getElementById("styleLegendBackOutput") as HTMLInputElement).value = value;
    viewContext.legend.select("#legendBox").attr("fill", value);
  });

  document.getElementById("styleSelectFont")!.addEventListener("change", changeFont);

  document.getElementById("styleShadowInput")!.addEventListener("input", (e: Event) => {
    getEl().style("text-shadow", (e.target as HTMLInputElement).value);
  });

  document.getElementById("styleFontSize")!.addEventListener("change", () => {
    changeFontSize(getEl(), +(document.getElementById("styleFontSize") as HTMLInputElement).value);
  });

  document.getElementById("styleFontPlus")!.addEventListener("click", () => {
    const current = +(document.getElementById("styleFontSize") as HTMLInputElement).value || 12;
    changeFontSize(getEl(), Math.min(rn(current + 0.1, 1), 999));
  });

  document.getElementById("styleFontMinus")!.addEventListener("click", () => {
    const current = +(document.getElementById("styleFontSize") as HTMLInputElement).value || 12;
    changeFontSize(getEl(), Math.max(rn(current - 0.1, 1), 0.1));
  });

  document.getElementById("styleFontShiftX")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    getEl().attr("data-dx", value).selectAll<SVGTextElement, unknown>("text").attr("dx", `${value}em`);
  });

  document.getElementById("styleFontShiftY")!.addEventListener("input", (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    getEl().attr("data-dy", value).selectAll<SVGTextElement, unknown>("text").attr("dy", `${value}em`);
  });

  document.getElementById("styleStatesBodyFilter")!.addEventListener("change", (e: Event) => {
    viewContext.statesBody.attr("filter", (e.target as HTMLSelectElement).value);
  });

  document.getElementById("styleVignettePreset")!.addEventListener("change", (e: Event) => {
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

    const vignette = document.getElementById("vignette")!;
    if (vignette) {
      const opacityVal = vignette.getAttribute("opacity") ?? "";
      useStyleState.getState().updateValue("styleOpacityInput", opacityVal);
      const fill = vignette.getAttribute("fill") ?? "";
      (document.getElementById("styleFillInput") as HTMLInputElement).value = fill;
      (document.getElementById("styleFillOutput") as HTMLInputElement).value = fill;
      (document.getElementById("styleFilterInput") as HTMLSelectElement).value = vignette.getAttribute("filter") ?? "";
    }

    const maskRect = document.getElementById("vignette-rect")!;
    if (maskRect) {
      const digit = (str: string | null) => (str ?? "").replace(/[^\d.]/g, "");
      (document.getElementById("styleVignetteX") as HTMLInputElement).value = digit(maskRect.getAttribute("x"));
      (document.getElementById("styleVignetteY") as HTMLInputElement).value = digit(maskRect.getAttribute("y"));
      (document.getElementById("styleVignetteWidth") as HTMLInputElement).value = digit(maskRect.getAttribute("width"));
      (document.getElementById("styleVignetteHeight") as HTMLInputElement).value = digit(
        maskRect.getAttribute("height")
      );
      (document.getElementById("styleVignetteRx") as HTMLInputElement).value = digit(maskRect.getAttribute("rx"));
      (document.getElementById("styleVignetteRy") as HTMLInputElement).value = digit(maskRect.getAttribute("ry"));
      useStyleState.getState().updateValue("styleVignetteBlur", digit(maskRect.getAttribute("filter")));
    }
  });

  document.getElementById("styleVignetteX")!.addEventListener("input", (e: Event) => {
    document.getElementById("vignette-rect")!.setAttribute("x", `${(e.target as HTMLInputElement).value}%`);
  });

  document.getElementById("styleVignetteWidth")!.addEventListener("input", (e: Event) => {
    document.getElementById("vignette-rect")!.setAttribute("width", `${(e.target as HTMLInputElement).value}%`);
  });

  document.getElementById("styleVignetteY")!.addEventListener("input", (e: Event) => {
    document.getElementById("vignette-rect")!.setAttribute("y", `${(e.target as HTMLInputElement).value}%`);
  });

  document.getElementById("styleVignetteHeight")!.addEventListener("input", (e: Event) => {
    document.getElementById("vignette-rect")!.setAttribute("height", `${(e.target as HTMLInputElement).value}%`);
  });

  document.getElementById("styleVignetteRx")!.addEventListener("input", (e: Event) => {
    document.getElementById("vignette-rect")!.setAttribute("rx", `${(e.target as HTMLInputElement).value}%`);
  });

  document.getElementById("styleVignetteRy")!.addEventListener("input", (e: Event) => {
    document.getElementById("vignette-rect")!.setAttribute("ry", `${(e.target as HTMLInputElement).value}%`);
  });

  document.getElementById("styleScaleBar")!.addEventListener("input", (event: Event) => {
    const scaleBarBack = viewContext.scaleBar.select<SVGGElement>("#scaleBarBack");
    if (!scaleBarBack.size()) return;

    const target = event.target as HTMLInputElement;
    const { id, value } = target;

    if (id === "styleScaleBarSize") viewContext.scaleBar.attr("data-bar-size", value);
    else if (id === "styleScaleBarFontSize") viewContext.scaleBar.attr("font-size", value);
    else if (id === "styleScaleBarPositionX") viewContext.scaleBar.attr("data-x", value);
    else if (id === "styleScaleBarPositionY") viewContext.scaleBar.attr("data-y", value);
    else if (id === "styleScaleBarLabel") viewContext.scaleBar.attr("data-label", value);
    else if (id === "styleScaleBarBackgroundFill") {
      scaleBarBack.attr("fill", value);
      (document.getElementById("styleScaleBarBackgroundFillOutput") as HTMLInputElement).value = value;
    } else if (id === "styleScaleBarBackgroundStroke") {
      scaleBarBack.attr("stroke", value);
      (document.getElementById("styleScaleBarBackgroundStrokeOutput") as HTMLInputElement).value = value;
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
      drawScaleBar(worldContext, viewContext, appServices, viewContext.scaleBar, viewContext.scale);
      fitScaleBar(
        worldContext,
        viewContext,
        appServices,
        viewContext.scaleBar,
        viewContext.svgWidth,
        viewContext.svgHeight
      );
    }
  });

  document.getElementById("mapFilters")!.addEventListener("click", applyMapFilter);

  // ─── Style preset functions (from style-presets.js) ───────────────────────────

  async function applyStyleOnLoad(): Promise<void> {
    const desiredPreset = localStorage.getItem("presetStyle") ?? "default";
    const [appliedPreset, styleData] = await getStylePreset(desiredPreset);
    applyStyle(styleData);
    updateMapFilter();
    const presetEl = document.getElementById("stylePreset") as HTMLSelectElement;
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
        worldContext.style.burgLabels[group] = styleJSON[selector] as Record<string, string>;
      }
      if (selector.startsWith("#burgIcons")) {
        const group = selector.split("#").pop()!;
        worldContext.style.burgIcons[group] = styleJSON[selector] as Record<string, string>;
      }
      if (selector.startsWith("#anchors")) {
        const group = selector.split("#").pop()!;
        worldContext.style.anchors[group] = styleJSON[selector] as Record<string, string>;
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
        const presetEl = document.getElementById("stylePreset") as HTMLSelectElement;
        presetEl.value = presetEl.dataset.old ?? "default";
      }
    });
  }

  async function changeStyle(desiredPreset: string): Promise<void> {
    const [presetName, styleData] = await getStylePreset(desiredPreset);
    localStorage.setItem("presetStyle", presetName);
    applyStyleWithUiRefresh(styleData);
    if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
    if (layerIsOn("toggleLabels")) {
      BurgLabelsRenderer.render(worldContext, viewContext, appServices);
      drawStateLabels(worldContext, viewContext, appServices);
    }
  }

  function applyStyleWithUiRefresh(styleJSON: StyleJSON): void {
    applyStyle(styleJSON);
    updateElements();
    selectStyleElement();
    updateMapFilter();
    const presetEl = document.getElementById("stylePreset") as HTMLSelectElement;
    presetEl.dataset.old = presetEl.value;
    import("../main").then(m => m.invokeActiveZooming());
    setPresetRemoveButtonVisibiliy();
    drawScaleBar(worldContext, viewContext, appServices, viewContext.scaleBar, viewContext.scale);
    fitScaleBar(
      worldContext,
      viewContext,
      appServices,
      viewContext.scaleBar,
      viewContext.svgWidth,
      viewContext.svgHeight
    );
  }

  function addStylePreset(): void {
    openDialog("styleSaver", {
      title: "Style Saver",
      width: "26em",
      position: { my: "center", at: "center", of: "svg" }
    });

    const styleName = (document.getElementById("stylePreset") as HTMLSelectElement).value.replace(
      customPresetPrefix,
      ""
    );
    (document.getElementById("styleSaverName") as HTMLInputElement).value = styleName;
    (document.getElementById("styleSaverJSON") as HTMLTextAreaElement).value = JSON.stringify(
      collectStyleData(),
      null,
      2
    );
    checkName();

    if (modules.saveStyle) return;
    modules.saveStyle = true;

    document.getElementById("styleSaverName")!.addEventListener("input", checkName);
    document.getElementById("styleSaverSave")!.addEventListener("click", saveStyle);
    document.getElementById("styleSaverDownload")!.addEventListener("click", styleDownload);
    document
      .getElementById("styleSaverLoad")!
      .addEventListener("click", () => (document.getElementById("styleToLoad") as HTMLInputElement).click());
    document.getElementById("styleToLoad")!.addEventListener("change", loadStyleFile);

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

      worldContext.options.burgs.groups.forEach(({ name }) => {
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
      const rawName = (document.getElementById("styleSaverName") as HTMLInputElement).value;
      const styleName = customPresetPrefix + rawName;

      const isSystem = systemPresets.includes(styleName) || systemPresets.includes(rawName);
      if (isSystem) {
        document.getElementById("styleSaverTip")!.textContent = "default";
        return;
      }

      const isExisting = Array.from((document.getElementById("stylePreset") as HTMLSelectElement).options).some(
        option => option.value === styleName
      );
      if (isExisting) {
        document.getElementById("styleSaverTip")!.textContent = "existing";
        return;
      }

      document.getElementById("styleSaverTip")!.textContent = "new";
    }

    function saveStyle(): void {
      const styleJSON = (document.getElementById("styleSaverJSON") as HTMLTextAreaElement).value;
      const desiredName = (document.getElementById("styleSaverName") as HTMLInputElement).value;

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
      if (document.getElementById("styleSaverTip")!.textContent === "default") {
        tip("You cannot overwrite default preset, please change the name", false, "error");
        return;
      }

      const presetName = customPresetPrefix + desiredName;
      applyOption(document.getElementById("stylePreset") as HTMLSelectElement, presetName, `${desiredName} [custom]`);
      localStorage.setItem("presetStyle", presetName);
      localStorage.setItem(presetName, styleJSON);

      applyStyleWithUiRefresh(JSON.parse(styleJSON) as StyleJSON);
      tip("Style preset is saved and applied", false, "success", 4000);
      closeDialog("styleSaver");
    }

    function styleDownload(): void {
      const styleJSON = (document.getElementById("styleSaverJSON") as HTMLTextAreaElement).value;
      const styleName = (document.getElementById("styleSaverName") as HTMLInputElement).value;

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

        (document.getElementById("styleSaverJSON") as HTMLTextAreaElement).value = JSON.stringify(
          JSON.parse(dataLoaded),
          null,
          2
        );
        (document.getElementById("styleSaverName") as HTMLInputElement).value = fileName;
        checkName();
        tip("Style preset is uploaded", false, "success", 4000);
      });
    }
  }

  function requestRemoveStylePreset(): void {
    const isDefault = systemPresets.includes((document.getElementById("stylePreset") as HTMLSelectElement).value);
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
    const presetEl = document.getElementById("stylePreset") as HTMLSelectElement;
    localStorage.removeItem("presetStyle");
    localStorage.removeItem(presetEl.value);
    presetEl.selectedOptions[0]?.remove();
    changeStyle("default");
  }

  function updateMapFilter(): void {
    const filter = viewContext.svg.attr("data-filter");
    document
      .getElementById("mapFilters")
      ?.querySelectorAll<HTMLButtonElement>(".pressed")
      .forEach(button => {
        button.classList.remove("pressed");
      });
    if (!filter) return;
    document.getElementById("mapFilters")?.querySelector<HTMLButtonElement>(`#${filter}`)?.classList.add("pressed");
  }

  function setPresetRemoveButtonVisibiliy(): void {
    const isDefault = systemPresets.includes((document.getElementById("stylePreset") as HTMLSelectElement).value);
    (document.getElementById("removeStyleButton") as HTMLElement).style.display = isDefault ? "none" : "inline-block";
  }

  // Wire up module-level forwarding refs
  _applyStyleOnLoad = applyStyleOnLoad;
  _requestStylePresetChange = requestStylePresetChange;
  _addStylePreset = addStylePreset;
  _requestRemoveStylePreset = requestRemoveStylePreset;
}

export function initStyle(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
