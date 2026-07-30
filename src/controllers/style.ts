import type { Selection } from "d3";
import { interpolateRgbBasis, scaleSequential } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
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
import { OceanLayers } from "../renderers/ocean-layers";
import type { PresentationStyleValue } from "../runtime/presentationData";
import { patchPresentation } from "../runtime/worldRuntime";
import { onFontAdded } from "../services/fonts";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { viewStateStore } from "../store";
import { useExtensionState } from "../store/extensionState";
import { useOptionsState } from "../store/optionsState";
import type { SelectOption } from "../store/styleState";
import { useStyleState } from "../store/styleState";
import { textureUrlDialogStore } from "../store/textureUrlDialogState";
import { closeDialog, openDialog } from "../ui/dialogs/dialogService";
import type { HeightmapSchemeConfig } from "../ui/dialogs/HeightmapSchemeDialog";
import { parseTransform, rn, toHEX } from "../utils";
import { heightmapColorSchemes } from "../utils/colorUtils";
import { ERROR, INFO } from "../utils/debug";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, uploadFile } from "../utils/editorHelpers";
import { getElementById, layerIsOn, getElementBySelector as queryElementBySelector } from "../utils/nodeUtils";
import { VERSION } from "../versioning";
import { schedule3dSceneUpdate, scheduleWebglUpdate, toggleRelief } from "./layers";

// ─── Types ────────────────────────────────────────────────────────────────────

type StyleJSON = Record<string, Record<string, string | number | null>>;
type AnySelection = Selection<SVGGElement, unknown, null, undefined>;

function getRequiredElementById<T extends Element>(id: string): T {
  const element = getElementById<T>(id);
  if (!element) throw new Error(`Element #${id} is not found`);
  return element;
}

function getElementBySelector<T extends Element>(selector: string): T | null {
  return queryElementBySelector<T>(selector);
}

// ─── Module-scope constants ───────────────────────────────────────────────────

let styleChangeConfirmed = false;

const SYSTEM_PRESETS = [
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

const CUSTOM_PRESET_PREFIX = "fmgStyle_";

export const VIGNETTE_PRESETS: Record<string, string> = {
  default: `{ "#vignette": { "opacity": 0.3, "fill": "#000000", "filter": null }, "#vignette-rect": { "x": "0.3%", "y": "0.4%", "width": "99.6%", "height": "99.2%", "rx": "5%", "ry": "5%", "filter": "blur(20px)" } }`,
  neon: `{ "#vignette": { "opacity": 0.5, "fill": "#7300ff", "filter": null }, "#vignette-rect": { "x": "0.3%", "y": "0.4%", "width": "99.6%", "height": "99.2%", "rx": "0%", "ry": "0%", "filter": "blur(15px)" } }`,
  smoke: `{ "#vignette": { "opacity": 1, "fill": "#000000", "filter": "url(#splotch)" }, "#vignette-rect": { "x": "3%", "y": "5%", "width": "96%", "height": "90%", "rx": "10%", "ry": "10%", "filter": "blur(100px)" } }`,
  wound: `{ "#vignette": { "opacity": 0.8, "fill": "#ff0000", "filter": "url(#paper)"}, "#vignette-rect": {"x": "0.5%", "y": "1%", "width": "99%", "height": "98%", "rx": "5%", "ry": "5%", "filter": "blur(50px)" } }`,
  paper: `{ "#vignette": { "opacity": 1, "fill": "#000000", "filter": "url(#paper)" }, "#vignette-rect": { "x": "0.3%", "y": "0.4%", "width": "99.6%", "height": "99.2%", "rx": "20%", "ry": "20%", "filter": "blur(150px)" } }`,
  granite: `{ "#vignette": { "opacity": 0.95, "fill": "#231b1b", "filter": "url(#crumpled)" }, "#vignette-rect": { "x": "3%", "y": "5%", "width": "94%", "height": "90%", "rx": "20%", "ry": "20%", "filter": "blur(150px)" } }`,
  spotlight: `{ "#vignette": { "opacity": 0.96, "fill": "#000000", "filter": null }, "#vignette-rect": { "x": "20%", "y": "30%", "width": "24%", "height": "30%", "rx": "50%", "ry": "50%", "filter": "blur(30px) "} }`
};

// ─── Color schemes ────────────────────────────────────────────────────────────

export function addCustomColorScheme(scheme: string): void {
  const stops = scheme.split(",");
  heightmapColorSchemes[scheme] = scaleSequential(interpolateRgbBasis(stops));
  const currentOptions = useStyleState.getState().options.styleHeightmapScheme ?? [];
  if (!currentOptions.some(o => o.value === scheme)) {
    useStyleState.getState().setOptions("styleHeightmapScheme", [...currentOptions, { value: scheme, label: scheme }]);
  }
  useStyleState.getState().updateValue("styleHeightmapScheme", scheme);
}

// ─── Style element selection ──────────────────────────────────────────────────

document.addEventListener("fmg:edit-style", (e: Event) => {
  const { element, group } = (e as CustomEvent<{ element: string; group?: string }>).detail;
  editStyle(element, group);
});

export function editStyle(element: string, group?: string): void {
  viewStateStore.getState().setMenuOpen(true);
  getRequiredElementById<HTMLButtonElement>("styleTab").click();
  useStyleState.getState().setActiveElement(element);
  if (group) {
    const currentOptions = useStyleState.getState().options.styleGroupSelect ?? [];
    if (!currentOptions.some(o => o.value === group)) {
      useStyleState.getState().setOptions("styleGroupSelect", [...currentOptions, { value: group, label: group }]);
    }
    useStyleState.getState().setActiveGroup(group);
  }
  selectStyleElement();

  // Temporary glow effect on the element select
  const elementSelectEl = getElementById<HTMLElement>("styleElementSelect");
  if (elementSelectEl) {
    elementSelectEl.classList.add("glow");
    if (group) getElementById<HTMLElement>("styleGroupSelect")?.classList.add("glow");
    setTimeout(() => {
      elementSelectEl.classList.remove("glow");
      if (group) getElementById<HTMLElement>("styleGroupSelect")?.classList.remove("glow");
    }, 1500);
  }
}

export function selectStyleElement(): void {
  const { activeElement: styleElement, activeGroup: currentGroup } = useStyleState.getState();
  let el: AnySelection = view.svg.select<SVGGElement>(`#${styleElement}`);

  const visibility: Record<string, boolean> = {};
  const storeValues: Record<string, string> = {};

  const isLayerOff = styleElement !== "ocean" && (el.style("display") === "none" || !el.selectAll("*").size());
  visibility.styleIsOff = Boolean(isLayerOff);

  if (["anchors", "borders", "burgIcons", "coastline", "lakes", "labels", "routes", "terrs"].includes(styleElement)) {
    const defaultGroupSelector = styleElement === "terrs" ? "#landHeights" : "g";
    el =
      currentGroup && el.select<SVGGElement>(`#${currentGroup}`).size()
        ? el.select<SVGGElement>(`#${currentGroup}`)
        : el.select<SVGGElement>(defaultGroupSelector);
  }

  // Prevent D3 v7 `.attr()` getter from throwing if the selection is empty.
  if (el.empty()) {
    el = view.svg.select<SVGGElement>(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
  }

  if (!["landmass", "legend", "ocean", "regions"].includes(styleElement)) {
    visibility.styleOpacity = true;
    storeValues.styleOpacityInput = String(el.attr("opacity") ?? 1);
  }

  if (!["landmass", "legend", "regions", "scaleBar"].includes(styleElement)) {
    visibility.styleFilter = true;
    storeValues.styleFilterInput = el.attr("filter") ?? "";
  }

  if (["fogging", "ice", "lakes", "landmass", "prec", "rivers", "scaleBar", "vignette"].includes(styleElement)) {
    visibility.styleFill = true;
    storeValues.styleFillInput = el.attr("fill") ?? "";
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
    storeValues.styleStrokeInput = el.attr("stroke") ?? "";
    visibility.styleStrokeWidth = true;
    storeValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
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
    storeValues.styleStrokeDasharrayInput = el.attr("stroke-dasharray") ?? "";
    storeValues.styleStrokeLinecapInput = el.attr("stroke-linecap") ?? "inherit";
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
    storeValues.styleClippingInput = el.attr("mask") ?? "";
  }

  if (styleElement === "texture") {
    visibility.styleTexture = true;
    storeValues.styleTextureShiftX = String(el.attr("data-x") ?? 0);
    storeValues.styleTextureShiftY = String(el.attr("data-y") ?? 0);
    const href = el.attr("data-href") ?? "";
    updateTextureSelectValue(href);
  }

  if (styleElement === "terrs") {
    visibility.styleHeightmap = true;
    storeValues.styleHeightmapRenderOcean =
      el.attr("id") === "oceanHeights" ? String(+(el.attr("data-render") ?? 0)) : "0";
    storeValues.styleHeightmapScheme = el.attr("scheme") ?? "";
    storeValues.styleHeightmapTerracing = el.attr("terracing") ?? "";
    storeValues.styleHeightmapSkip = el.attr("skip") ?? "";
    storeValues.styleHeightmapSimplification = el.attr("relax") ?? "";
    storeValues.styleHeightmapCurve = el.attr("curve") ?? "";
    // Show/hide ocean option based on selected group
    const showOceanOption = el.attr("id") === "oceanHeights" ? "1" : "0";
    storeValues.styleHeightmapRenderOceanOptionVisible = showOceanOption;
  }

  if (styleElement === "markers") {
    visibility.styleMarkers = true;
    storeValues.styleRescaleMarkers = String(+(view.markers.attr("rescale") ?? 0));
  }

  if (styleElement === "gridOverlay") {
    visibility.styleGrid = true;
    storeValues.styleGridType = el.attr("type") ?? "";
    storeValues.styleGridScale = String(el.attr("scale") ?? 1);
    storeValues.styleGridShiftX = String(el.attr("dx") ?? 0);
    storeValues.styleGridShiftY = String(el.attr("dy") ?? 0);
  }

  if (styleElement === "compass") {
    visibility.styleCompass = true;
    const tr = parseTransform(view.compass.select("use").attr("transform"));
    storeValues.styleCompassShiftX = String(tr[0]);
    storeValues.styleCompassShiftY = String(tr[1]);
    storeValues.styleCompassSizeInput = String(tr[2]);
  }

  if (styleElement === "terrain") {
    visibility.styleRelief = true;
    storeValues.styleReliefSize = String(view.terrain.attr("size") ?? 1);
    storeValues.styleReliefDensity = String(view.terrain.attr("density") ?? 0.4);
    storeValues.styleReliefSet = view.terrain.attr("set") ?? "";
  }

  if (styleElement === "population") {
    visibility.stylePopulation = true;
    storeValues.stylePopulationRuralStrokeInput = view.population.select("#rural").attr("stroke") ?? "";
    storeValues.stylePopulationUrbanStrokeInput = view.population.select("#urban").attr("stroke") ?? "";
    visibility.styleStrokeWidth = true;
    storeValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
  }

  if (styleElement === "regions") {
    visibility.styleStates = true;
    storeValues.styleStatesBodyOpacity = String(view.statesBody.attr("opacity") ?? 1);
    storeValues.styleStatesBodyFilter = view.statesBody.attr("filter") ?? "";
    storeValues.styleStatesHaloWidth = String(view.statesHalo.attr("data-width") ?? 10);
    storeValues.styleStatesHaloOpacity = String(view.statesHalo.attr("opacity") ?? 1);
    const blurMatch = view.statesHalo.attr("filter")?.match(/blur\(([^)]+)\)/);
    storeValues.styleStatesHaloBlur = String(blurMatch ? parseFloat(blurMatch[1]) : 0);
  }

  if (styleElement === "provs") {
    visibility.styleFill = true;
    visibility.styleSize = true;
    storeValues.styleFillInput = el.attr("fill") ?? "#111111";
    visibility.styleFont = true;
    storeValues.styleSelectFont = el.attr("font-family") ?? "";
    storeValues.styleFontSize = el.attr("font-size") ?? "";
  }

  if (styleElement === "labels") {
    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleLetterSpacing = true;
    visibility.styleShadow = true;
    visibility.styleSize = true;
    visibility.styleVisibility = true;

    storeValues.styleFillInput = el.attr("fill") ?? "#3e3e4b";
    storeValues.styleStrokeInput = el.attr("stroke") ?? "#3a3a3a";
    storeValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0);
    storeValues.styleLetterSpacingInput = String(el.attr("letter-spacing") ?? 0);
    storeValues.styleShadowInput = el.style("text-shadow") ?? "";
    storeValues.styleLabelsHideGroup = el.node()?.style.display === "none" ? "1" : "0";

    visibility.styleFont = true;
    storeValues.styleSelectFont = el.attr("font-family") ?? "";
    storeValues.styleFontSize = el.attr("data-size") ?? "";

    if ((el.node() as Element).parentElement?.id === "burgLabels") {
      visibility.styleFontShift = true;
      storeValues.styleFontShiftX = String(el.attr("data-dx") ?? 0);
      storeValues.styleFontShiftY = String(el.attr("data-dy") ?? 0);
    }
  }

  if (styleElement === "burgIcons") {
    visibility.styleBurgIcons = true;
    storeValues.styleBurgIconsIcon = el.attr("data-icon") ?? "";
    storeValues.styleBurgIconsIconSize = el.attr("font-size") ?? "";
    storeValues.styleBurgIconsStrokeLinejoin = el.attr("stroke-linejoin") ?? "";
    storeValues.styleBurgIconsFillOpacity = el.attr("fill-opacity") ?? "";

    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleStrokeDash = true;
    storeValues.styleFillInput = el.attr("fill") ?? "#ffffff";
    storeValues.styleStrokeInput = el.attr("stroke") ?? "#3e3e4b";
    storeValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);
    storeValues.styleStrokeDasharrayInput = el.attr("stroke-dasharray") ?? "";
    storeValues.styleStrokeLinecapInput = el.attr("stroke-linecap") ?? "inherit";
  }

  if (styleElement === "anchors") {
    visibility.styleFill = true;
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleSize = true;
    storeValues.styleFillInput = el.attr("fill") ?? "#ffffff";
    storeValues.styleStrokeInput = el.attr("stroke") ?? "#3e3e4b";
    storeValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);
    storeValues.styleFontSize = String(el.attr("font-size") ?? 1);
  }

  if (styleElement === "legend") {
    visibility.styleStroke = true;
    visibility.styleStrokeWidth = true;
    visibility.styleSize = true;
    visibility.styleLegend = true;
    const legendBox = el.select<SVGRectElement>("#legendBox");
    storeValues.styleLegendColItems = el.attr("data-columns") ?? "";
    storeValues.styleLegendBack = legendBox.size() ? (legendBox.attr("fill") ?? "#ffffff") : "#ffffff";
    storeValues.styleLegendOpacity = String(legendBox.size() ? (legendBox.attr("fill-opacity") ?? 1) : 1);
    storeValues.styleStrokeInput = el.attr("stroke") ?? "#111111";
    storeValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.5);
    visibility.styleFont = true;
    storeValues.styleSelectFont = el.attr("font-family") ?? "";
    storeValues.styleFontSize = el.attr("data-size") ?? "";
  }

  if (styleElement === "ocean") {
    visibility.styleOcean = true;
    const oceanBase = view.oceanLayers.select<SVGRectElement>("#oceanBase");
    const oceanPattern = getElementById<SVGImageElement>("oceanicPattern");
    storeValues.styleOceanFill = oceanBase.attr("fill") ?? "";
    storeValues.styleOceanPattern = oceanPattern?.getAttribute("href") ?? "";
    storeValues.styleOceanPatternOpacity = oceanPattern?.getAttribute("opacity") ?? "1";
    storeValues.outlineLayers = view.oceanLayers.attr("layers") ?? "";
  }

  if (styleElement === "temperature") {
    visibility.styleStrokeWidth = true;
    visibility.styleTemperature = true;
    storeValues.styleStrokeWidthInput = el.attr("stroke-width") ?? "";
    storeValues.styleTemperatureFillOpacityInput = String(el.attr("fill-opacity") ?? 0.1);
    storeValues.styleTemperatureFillInput = el.attr("fill") ?? "#000";
    storeValues.styleTemperatureFontSizeInput = (el.attr("font-size") ?? "8").replace(/px$/, "");
  }

  if (styleElement === "coordinates") {
    visibility.styleSize = true;
    storeValues.styleFontSize = el.attr("data-size") ?? "";
  }

  if (styleElement === "armies") {
    visibility.styleArmies = true;
    storeValues.styleArmiesFillOpacity = el.attr("fill-opacity") ?? "";
    storeValues.styleArmiesSize = el.attr("box-size") ?? "";
  }

  if (styleElement === "emblems") {
    visibility.styleEmblems = true;
    visibility.styleStrokeWidth = true;
    storeValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 1);
    storeValues.emblemsStateSizeInput = view.emblems.select("#stateEmblems").attr("data-size") ?? "1";
    storeValues.emblemsProvinceSizeInput = view.emblems.select("#provinceEmblems").attr("data-size") ?? "1";
    storeValues.emblemsBurgSizeInput = view.emblems.select("#burgEmblems").attr("data-size") ?? "1";
  }

  // Update group options
  const GROUPED_ELEMENTS = ["anchors", "borders", "burgIcons", "coastline", "lakes", "labels", "routes", "terrs"];
  let groupOptions: SelectOption[] = [];
  let selectedGroup = "";
  if (GROUPED_ELEMENTS.includes(styleElement)) {
    const svgEl = getElementById<Element>(styleElement);
    if (svgEl) {
      svgEl.querySelectorAll<SVGGElement>("g").forEach(g => {
        if (g.id === "burgLabels") return;
        groupOptions.push({ value: g.id, label: `${g.id} (${g.childElementCount})` });
      });
    }
    selectedGroup = el.attr("id") ?? "";
    visibility.styleGroup = true;
  } else {
    groupOptions = [{ value: styleElement, label: styleElement }];
    selectedGroup = styleElement;
    visibility.styleGroup = false;
  }

  if (
    styleElement === "coastline" &&
    (currentGroup === "sea_island" || (!currentGroup && groupOptions[0]?.value === "sea_island"))
  ) {
    visibility.styleCoastline = true;
    const auto = Boolean(view.coastline.select("#sea_island").attr("auto-filter"));
    storeValues.styleCoastlineAuto = auto ? "1" : "0";
    if (auto) visibility.styleFilter = false;
  }

  if (styleElement === "scaleBar") {
    visibility.styleScaleBar = true;
    const scaleBarEl = view.scaleBar;
    storeValues.styleScaleBarSize = scaleBarEl.attr("data-bar-size") ?? "";
    storeValues.styleScaleBarFontSize = scaleBarEl.attr("font-size") ?? "";
    storeValues.styleScaleBarPositionX = scaleBarEl.attr("data-x") ?? "99";
    storeValues.styleScaleBarPositionY = scaleBarEl.attr("data-y") ?? "99";
    storeValues.styleScaleBarLabel = scaleBarEl.attr("data-label") ?? "";

    const scaleBarBack = scaleBarEl.select<SVGRectElement>("#scaleBarBack");
    if (scaleBarBack.size()) {
      storeValues.styleScaleBarBackgroundOpacity = scaleBarBack.attr("opacity") ?? "";
      storeValues.styleScaleBarBackgroundFill = scaleBarBack.attr("fill") ?? "";
      storeValues.styleScaleBarBackgroundStroke = scaleBarBack.attr("stroke") ?? "";
      storeValues.styleScaleBarBackgroundStrokeWidth = scaleBarBack.attr("stroke-width") ?? "";
      storeValues.styleScaleBarBackgroundFilter = scaleBarBack.attr("filter") ?? "";
      storeValues.styleScaleBarBackgroundPaddingTop = scaleBarBack.attr("data-top") ?? "";
      storeValues.styleScaleBarBackgroundPaddingRight = scaleBarBack.attr("data-right") ?? "";
      storeValues.styleScaleBarBackgroundPaddingBottom = scaleBarBack.attr("data-bottom") ?? "";
      storeValues.styleScaleBarBackgroundPaddingLeft = scaleBarBack.attr("data-left") ?? "";
    }
  }

  if (styleElement === "vignette") {
    visibility.styleVignette = true;
    const maskRect = getElementById<SVGRectElement>("vignette-rect");
    if (maskRect) {
      const digit = (str: string | null) => (str ?? "").replace(/[^\d.]/g, "");
      storeValues.styleVignetteX = digit(maskRect.getAttribute("x"));
      storeValues.styleVignetteY = digit(maskRect.getAttribute("y"));
      storeValues.styleVignetteWidth = digit(maskRect.getAttribute("width"));
      storeValues.styleVignetteHeight = digit(maskRect.getAttribute("height"));
      storeValues.styleVignetteRx = digit(maskRect.getAttribute("rx"));
      storeValues.styleVignetteRy = digit(maskRect.getAttribute("ry"));
      storeValues.styleVignetteBlur = digit(maskRect.getAttribute("filter"));
    }
  }

  // Allow extensions to hook into style selection
  const state = useExtensionState.getState();
  const styleConfigs = state.styleConfigs.filter(c => state.enabledExtensions[c.extensionId]);
  for (const config of styleConfigs) {
    if (config.onSelect) {
      config.onSelect(styleElement, storeValues, visibility, el);
    }
  }

  useStyleState.getState().setOptions("styleGroupSelect", groupOptions);
  useStyleState.getState().setActiveGroup(selectedGroup);
  useStyleState.getState().setValues(storeValues);
  useStyleState.getState().setVisibility(visibility);

  // After setting grid values, update the friendly size display
  if (styleElement === "gridOverlay") {
    calculateFriendlyGridSize();
  }
}

// ─── Helper: get current D3 selection ─────────────────────────────────────────

function getEl(): AnySelection {
  const { activeElement: el, activeGroup: g } = useStyleState.getState();

  let selection = view.svg.select<SVGGElement>(`#${el}`);
  if (g !== el && g !== "") {
    selection = selection.select<SVGGElement>(`#${g}`);
  }

  // Prevent D3 v7 `.attr()` getter from throwing if the selection is empty.
  if (selection.empty()) {
    return view.svg.select<SVGGElement>(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
  }

  return selection;
}

function currentPresentationSelector(): string {
  const { activeElement, activeGroup } = useStyleState.getState();
  if (activeGroup && activeGroup !== activeElement) {
    if (["burgIcons", "burgLabels", "anchors"].includes(activeElement)) return `#${activeElement} > g#${activeGroup}`;
    return `#${activeGroup}`;
  }
  return `#${activeElement}`;
}

function patchCurrentPresentation(attributes: Record<string, PresentationStyleValue>): void {
  patchPresentation({ styles: { [currentPresentationSelector()]: attributes } });
}

function patchPresentationStyle(selector: string, attributes: Record<string, PresentationStyleValue>): void {
  patchPresentation({ styles: { [selector]: attributes } });
}

// ─── Texture helpers ──────────────────────────────────────────────────────────

function changeTexture(href: string): void {
  view.texture.attr("data-href", href);
  view.texture.select("image").attr("href", href);
  patchPresentationStyle("#texture", { "data-href": href });
}

export function updateTextureSelectValue(href: string): void {
  const currentOptions = useStyleState.getState().options.styleTextureCustom ?? [];
  const isKnown = currentOptions.some(o => o.value === href) || href === "" || href.startsWith("./images/textures/");
  if (!isKnown) {
    const name = href.split("/").pop()?.slice(0, 20) ?? href;
    useStyleState.getState().setOptions("styleTextureCustom", [...currentOptions, { value: href, label: name }]);
  }
  useStyleState.getState().updateValue("styleTextureInput", href);
}

// ─── Grid size calculator ─────────────────────────────────────────────────────

export function calculateFriendlyGridSize(): void {
  const scale = +(useStyleState.getState().values.styleGridScale ?? 1);
  const size = scale * 25;
  const unit = useOptionsState.getState().distanceUnit || "km";
  const friendly = `${rn(size * worldContext.distanceScale, 2)} ${unit}`;
  useStyleState.getState().updateValue("styleGridSizeFriendly", friendly);
}

// ─── Compass helper ───────────────────────────────────────────────────────────

function shiftCompass(sizeOverride?: string): void {
  const { values } = useStyleState.getState();
  const x = values.styleCompassShiftX ?? "80";
  const y = values.styleCompassShiftY ?? "80";
  const size = sizeOverride ?? values.styleCompassSizeInput ?? "0.3";
  view.compass.select("use").attr("transform", `translate(${x} ${y}) scale(${size})`);
  patchPresentationStyle("#compass > use", { transform: `translate(${x} ${y}) scale(${size})` });
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

export function changeFont(): void {
  const family = String(useStyleState.getState().values.styleSelectFont ?? "");
  getEl().attr("font-family", family);
  patchCurrentPresentation({ "font-family": family });
  const { activeElement } = useStyleState.getState();
  if (activeElement === "legend") EditorBus.redrawLegend();
}

function changeFontSize(el: AnySelection, size: number): void {
  useStyleState.getState().updateValue("styleFontSize", String(size));
  const { activeElement: styleElement } = useStyleState.getState();

  const getSizeOnScale = (element: string): number => {
    if (element === "labels") return Math.max(rn((size + size / view.scale) / 2, 2), 1);
    if (element === "coordinates") return rn(size / view.scale ** 0.8, 2);
    return size;
  };

  const scaleSize = getSizeOnScale(styleElement);
  el.attr("data-size", size).attr("font-size", scaleSize);
  patchCurrentPresentation({ "data-size": size, "font-size": scaleSize });

  if (styleElement === "legend") EditorBus.redrawLegend();
  scheduleWebglUpdate();
}

// ─── updateElements ───────────────────────────────────────────────────────────

function updateElements(): void {
  if (layerIsOn("toggleHeight")) HeightmapRenderer.render(worldContext, viewContext, appServices);
  if (view.legend.selectAll("*").size()) EditorBus.redrawLegend();
  view.oceanLayers.selectAll("path").remove();
  OceanLayers();
  document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
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
      if (useStyleState.getState().activeElement === "gridOverlay" && layerIsOn("toggleGrid"))
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
      getElementById<SVGImageElement>("oceanicPattern")?.setAttribute("opacity", value);
      break;
    case "styleVignetteBlur":
      getElementById<SVGRectElement>("vignette-rect")?.setAttribute("filter", `blur(${value}px)`);
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
      view.terrain.attr("size", value);
      ReliefIconsRenderer.render(worldContext, viewContext, appServices);
      if (!layerIsOn("toggleRelief")) toggleRelief();
      break;
    case "styleReliefDensity":
      view.terrain.attr("density", value);
      ReliefIconsRenderer.render(worldContext, viewContext, appServices);
      if (!layerIsOn("toggleRelief")) toggleRelief();
      break;
    case "styleLegendColItems":
      view.legend.select("#legendBox").attr("data-columns", value);
      EditorBus.redrawLegend();
      break;
    case "styleLegendOpacity":
      view.legend.select("#legendBox").attr("fill-opacity", value);
      break;
    case "styleTemperatureFillOpacityInput":
      view.temperature.attr("fill-opacity", value);
      break;
    case "styleTemperatureFontSizeInput":
      view.temperature.attr("font-size", `${value}px`);
      break;
    case "styleStatesBodyOpacity":
      view.statesBody.attr("opacity", value);
      break;
    case "styleStatesHaloWidth":
      view.statesHalo.attr("data-width", value).attr("stroke-width", value);
      break;
    case "styleStatesHaloOpacity":
      view.statesHalo.attr("opacity", value);
      break;
    case "styleStatesHaloBlur": {
      const blur = Number(value) > 0 ? `blur(${value}px)` : null;
      view.statesHalo.attr("filter", blur);
      break;
    }
    case "styleArmiesFillOpacity":
      view.armies.attr("fill-opacity", value);
      break;
    case "styleArmiesSize": {
      const numVal = Number(value);
      view.armies.attr("box-size", numVal).attr("font-size", numVal * 2);
      view.armies.selectAll("g").remove();
      worldContext.pack.states.forEach(s => {
        if (!s.i || s.removed || !s.military?.length) return;
        drawRegiments(worldContext, viewContext, appServices, s.military, s.i);
      });
      break;
    }
    case "emblemsStateSizeInput":
      view.emblems.select("#stateEmblems").attr("data-size", value);
      EmblemsRenderer.render(worldContext, viewContext, appServices);
      break;
    case "emblemsProvinceSizeInput":
      view.emblems.select("#provinceEmblems").attr("data-size", value);
      EmblemsRenderer.render(worldContext, viewContext, appServices);
      break;
    case "emblemsBurgSizeInput":
      view.emblems.select("#burgEmblems").attr("data-size", value);
      EmblemsRenderer.render(worldContext, viewContext, appServices);
      break;
    case "styleScaleBarBackgroundOpacity":
      view.scaleBar.select<SVGRectElement>("#scaleBarBack").attr("opacity", value);
      patchPresentationStyle("#scaleBarBack", { opacity: value });
      break;
  }

  const currentAttributeByControl: Record<string, string> = {
    styleOpacityInput: "opacity",
    styleStrokeWidthInput: "stroke-width",
    styleLetterSpacingInput: "letter-spacing"
  };
  const currentAttribute = currentAttributeByControl[id];
  if (currentAttribute) patchCurrentPresentation({ [currentAttribute]: value });

  const stylePatchByControl: Record<string, readonly [string, string]> = {
    styleHeightmapTerracing: [currentPresentationSelector(), "terracing"],
    styleHeightmapSkip: [currentPresentationSelector(), "skip"],
    styleHeightmapSimplification: [currentPresentationSelector(), "relax"],
    styleOceanPatternOpacity: ["#oceanicPattern", "opacity"],
    styleVignetteBlur: ["#vignette-rect", "filter"],
    styleBurgIconsIconSize: [currentPresentationSelector(), "font-size"],
    styleBurgIconsFillOpacity: [currentPresentationSelector(), "fill-opacity"],
    styleFontSize: [currentPresentationSelector(), "font-size"],
    styleFillOpacityInput: [currentPresentationSelector(), "fill-opacity"],
    styleReliefSize: ["#terrain", "size"],
    styleReliefDensity: ["#terrain", "density"],
    styleLegendColItems: ["#legendBox", "data-columns"],
    styleLegendOpacity: ["#legendBox", "fill-opacity"],
    styleTemperatureFillOpacityInput: ["#temperature", "fill-opacity"],
    styleTemperatureFontSizeInput: ["#temperature", "font-size"],
    styleStatesBodyOpacity: ["#statesBody", "opacity"],
    styleStatesHaloWidth: ["#statesHalo", "stroke-width"],
    styleStatesHaloOpacity: ["#statesHalo", "opacity"],
    styleStatesHaloBlur: ["#statesHalo", "filter"],
    styleArmiesFillOpacity: ["#armies", "fill-opacity"],
    styleArmiesSize: ["#armies", "box-size"],
    emblemsStateSizeInput: ["#emblems > #stateEmblems", "data-size"],
    emblemsProvinceSizeInput: ["#emblems > #provinceEmblems", "data-size"],
    emblemsBurgSizeInput: ["#emblems > #burgEmblems", "data-size"]
  };
  const stylePatch = stylePatchByControl[id];
  if (stylePatch) {
    const styleValue = id === "styleVignetteBlur" ? (Number(value) > 0 ? `blur(${value}px)` : null) : value;
    patchPresentationStyle(stylePatch[0], { [stylePatch[1]]: styleValue });
  }

  // getEl() above may target any style element (lakes, coastline, ice, burg icons, emblems, armies, ...),
  // several of which feed webglStyleExtractors.ts; scheduleWebglUpdate() is a no-op outside webglHybrid mode.
  scheduleWebglUpdate();
  scheduleRoutes3dUpdate();
}

/** Routes are also rendered as floating lines in viewMesh; rebuild them when their live style changes. */
function scheduleRoutes3dUpdate(): void {
  if (useStyleState.getState().activeElement === "routes") schedule3dSceneUpdate();
}

// ─── Handler functions (exported for React event handlers) ────────────────────

export function applyFillColor(value: string): void {
  useStyleState.getState().updateValue("styleFillInput", value);
  getEl().attr("fill", value);
  patchCurrentPresentation({ fill: value });
  scheduleWebglUpdate();
}

export function applyStrokeColor(value: string): void {
  useStyleState.getState().updateValue("styleStrokeInput", value);
  getEl().attr("stroke", value);
  patchCurrentPresentation({ stroke: value });
  if (useStyleState.getState().activeElement === "gridOverlay" && layerIsOn("toggleGrid"))
    GridRenderer.render(worldContext, viewContext, appServices);
  scheduleWebglUpdate();
  scheduleRoutes3dUpdate();
}

export function applyStrokeDasharray(value: string): void {
  useStyleState.getState().updateValue("styleStrokeDasharrayInput", value);
  getEl().attr("stroke-dasharray", value);
  patchCurrentPresentation({ "stroke-dasharray": value });
  if (useStyleState.getState().activeElement === "gridOverlay" && layerIsOn("toggleGrid"))
    GridRenderer.render(worldContext, viewContext, appServices);
  scheduleWebglUpdate();
  scheduleRoutes3dUpdate();
}

export function applyStrokeLinecap(value: string): void {
  useStyleState.getState().updateValue("styleStrokeLinecapInput", value);
  getEl().attr("stroke-linecap", value);
  patchCurrentPresentation({ "stroke-linecap": value });
  if (useStyleState.getState().activeElement === "gridOverlay" && layerIsOn("toggleGrid"))
    GridRenderer.render(worldContext, viewContext, appServices);
  scheduleWebglUpdate();
  scheduleRoutes3dUpdate();
}

export function applyLabelsHideGroup(checked: boolean): void {
  useStyleState.getState().updateValue("styleLabelsHideGroup", checked ? "1" : "0");
  if (checked) getEl().style("display", "none");
  else getEl().style("display", null);
  patchCurrentPresentation({ display: checked ? "none" : null });
}

export function applyStyleFilter(value: string): void {
  useStyleState.getState().updateValue("styleFilterInput", value);
  if (useStyleState.getState().activeGroup === "ocean") {
    view.oceanLayers.attr("filter", value);
    patchPresentationStyle("#oceanLayers", { filter: value || null });
  } else {
    getEl().attr("filter", value);
    patchCurrentPresentation({ filter: value || null });
  }
}

export function applyTextureSelect(href: string): void {
  useStyleState.getState().updateValue("styleTextureInput", href);
  changeTexture(href);
}

export function applyTextureShiftX(value: string): void {
  useStyleState.getState().updateValue("styleTextureShiftX", value);
  const numVal = +value;
  view.texture.attr("data-x", value);
  patchPresentationStyle("#texture", { "data-x": value });
  view.texture
    .select("image")
    .attr("x", value)
    .attr("width", worldContext.graphWidth - numVal);
}

export function applyTextureShiftY(value: string): void {
  useStyleState.getState().updateValue("styleTextureShiftY", value);
  const numVal = +value;
  view.texture.attr("data-y", value);
  patchPresentationStyle("#texture", { "data-y": value });
  view.texture
    .select("image")
    .attr("y", value)
    .attr("height", worldContext.graphHeight - numVal);
}

export function applyClipping(value: string): void {
  useStyleState.getState().updateValue("styleClippingInput", value);
  getEl().attr("mask", value);
  patchCurrentPresentation({ mask: value || null });
}

export function applyGridType(value: string): void {
  useStyleState.getState().updateValue("styleGridType", value);
  getEl().attr("type", value);
  patchCurrentPresentation({ type: value });
  if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
  calculateFriendlyGridSize();
}

export function applyGridScale(value: string): void {
  useStyleState.getState().updateValue("styleGridScale", value);
  getEl().attr("scale", value);
  patchCurrentPresentation({ scale: value });
  if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
  calculateFriendlyGridSize();
}

export function applyGridShiftX(value: string): void {
  useStyleState.getState().updateValue("styleGridShiftX", value);
  getEl().attr("dx", value);
  patchCurrentPresentation({ dx: value });
  if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
}

export function applyGridShiftY(value: string): void {
  useStyleState.getState().updateValue("styleGridShiftY", value);
  getEl().attr("dy", value);
  patchCurrentPresentation({ dy: value });
  if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
}

export function applyRescaleMarkers(checked: boolean): void {
  useStyleState.getState().updateValue("styleRescaleMarkers", checked ? "1" : "0");
  view.markers.attr("rescale", +checked);
  patchPresentationStyle("#markers", { rescale: checked ? 1 : 0 });
  document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
  scheduleWebglUpdate();
}

export function applyCoastlineAuto(checked: boolean): void {
  useStyleState.getState().updateValue("styleCoastlineAuto", checked ? "1" : "0");
  view.coastline.select("#sea_island").attr("auto-filter", +checked);
  patchPresentationStyle("#sea_island", { "auto-filter": checked ? 1 : 0 });
  // Filter section visibility is controlled via the store; toggle it here:
  useStyleState.getState().setVisibility({
    ...useStyleState.getState().visibility,
    styleFilter: !checked
  });
  document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
}

export function applyOceanFill(value: string): void {
  useStyleState.getState().updateValue("styleOceanFill", value);
  view.oceanLayers.select("rect").attr("fill", value);
  patchPresentationStyle("#oceanBase", { fill: value });
}

export function applyOceanPattern(href: string): void {
  useStyleState.getState().updateValue("styleOceanPattern", href);
  getRequiredElementById<SVGImageElement>("oceanicPattern").setAttribute("href", href);
  patchPresentationStyle("#oceanicPattern", { href });
}

export function applyOutlineLayers(value: string): void {
  useStyleState.getState().updateValue("outlineLayers", value);
  view.oceanLayers.selectAll("path").remove();
  view.oceanLayers.attr("layers", value);
  patchPresentationStyle("#oceanLayers", { layers: value });
  OceanLayers();
}

export function applyHeightmapScheme(value: string): void {
  useStyleState.getState().updateValue("styleHeightmapScheme", value);
  getEl().attr("scheme", value);
  patchCurrentPresentation({ scheme: value });
  HeightmapRenderer.render(worldContext, viewContext, appServices);
  scheduleWebglUpdate();
}

export function openHeightmapSchemeDialog(): void {
  const scheme = getEl().attr("scheme") ?? "bright";
  const initialStops = scheme.startsWith("#")
    ? scheme
    : [0, 0.25, 0.5, 0.75, 1].map(heightmapColorSchemes[scheme]).map(toHEX).join(",");

  const schemeConfig: HeightmapSchemeConfig = {
    initialStops: initialStops.split(","),
    onConfirm: (stopsStr: string) => {
      if (stopsStr in heightmapColorSchemes) {
        tip("This scheme already exists", false, "error");
        return;
      }
      addCustomColorScheme(stopsStr);
      getEl().attr("scheme", stopsStr);
      patchCurrentPresentation({ scheme: stopsStr });
      HeightmapRenderer.render(worldContext, viewContext, appServices);
      scheduleWebglUpdate();
    }
  };
  openDialog("heightmapScheme", schemeConfig);
}

export function applyHeightmapRenderOcean(checked: boolean): void {
  useStyleState.getState().updateValue("styleHeightmapRenderOcean", checked ? "1" : "0");
  getEl().attr("data-render", +checked);
  patchCurrentPresentation({ "data-render": checked ? 1 : 0 });
  HeightmapRenderer.render(worldContext, viewContext, appServices);
  scheduleWebglUpdate();
}

export function applyHeightmapCurve(value: string): void {
  useStyleState.getState().updateValue("styleHeightmapCurve", value);
  getEl().attr("curve", value);
  patchCurrentPresentation({ curve: value });
  HeightmapRenderer.render(worldContext, viewContext, appServices);
  scheduleWebglUpdate();
}

export function applyReliefSet(value: string): void {
  useStyleState.getState().updateValue("styleReliefSet", value);
  view.terrain.attr("set", value);
  patchPresentationStyle("#terrain", { set: value });
  ReliefIconsRenderer.render(worldContext, viewContext, appServices);
  if (!layerIsOn("toggleRelief")) toggleRelief();
}

export function applyTemperatureFill(value: string): void {
  useStyleState.getState().updateValue("styleTemperatureFillInput", value);
  view.temperature.attr("fill", value);
  patchPresentationStyle("#temperature", { fill: value });
}

export function applyPopulationRuralStroke(value: string): void {
  useStyleState.getState().updateValue("stylePopulationRuralStrokeInput", value);
  view.population.select("#rural").attr("stroke", value);
  patchPresentationStyle("#rural", { stroke: value });
}

export function applyPopulationUrbanStroke(value: string): void {
  useStyleState.getState().updateValue("stylePopulationUrbanStrokeInput", value);
  view.population.select("#urban").attr("stroke", value);
  patchPresentationStyle("#urban", { stroke: value });
}

export function applyBurgIconsIcon(value: string): void {
  useStyleState.getState().updateValue("styleBurgIconsIcon", value);
  getEl().attr("data-icon", value).selectAll<SVGUseElement, unknown>("use").attr("href", value);
  patchCurrentPresentation({ "data-icon": value });
  scheduleWebglUpdate();
}

export function applyBurgIconsLinejoin(value: string): void {
  useStyleState.getState().updateValue("styleBurgIconsStrokeLinejoin", value);
  getEl().attr("stroke-linejoin", value);
  patchCurrentPresentation({ "stroke-linejoin": value });
  scheduleWebglUpdate();
}

export function applyCompassShiftX(value: string): void {
  useStyleState.getState().updateValue("styleCompassShiftX", value);
  shiftCompass();
}

export function applyCompassShiftY(value: string): void {
  useStyleState.getState().updateValue("styleCompassShiftY", value);
  shiftCompass();
}

export function applyLegendBack(value: string): void {
  useStyleState.getState().updateValue("styleLegendBack", value);
  view.legend.select("#legendBox").attr("fill", value);
  patchPresentationStyle("#legendBox", { fill: value });
}

export function applyShadow(value: string): void {
  useStyleState.getState().updateValue("styleShadowInput", value);
  getEl().style("text-shadow", value);
  patchCurrentPresentation({ style: `text-shadow: ${value}` });
}

export function applyFontSize(value: string): void {
  changeFontSize(getEl(), +value);
}

export function applyFontSizePlus(): void {
  const current = +(useStyleState.getState().values.styleFontSize ?? 12) || 12;
  changeFontSize(getEl(), Math.min(rn(current + 0.1, 1), 999));
}

export function applyFontSizeMinus(): void {
  const current = +(useStyleState.getState().values.styleFontSize ?? 12) || 12;
  changeFontSize(getEl(), Math.max(rn(current - 0.1, 1), 0.1));
}

export function applyFontShiftX(value: string): void {
  useStyleState.getState().updateValue("styleFontShiftX", value);
  getEl().attr("data-dx", value).selectAll<SVGTextElement, unknown>("text").attr("dx", `${value}em`);
  patchCurrentPresentation({ "data-dx": value });
  scheduleWebglUpdate();
}

export function applyFontShiftY(value: string): void {
  useStyleState.getState().updateValue("styleFontShiftY", value);
  getEl().attr("data-dy", value).selectAll<SVGTextElement, unknown>("text").attr("dy", `${value}em`);
  patchCurrentPresentation({ "data-dy": value });
  scheduleWebglUpdate();
}

export function applyStatesBodyFilter(value: string): void {
  useStyleState.getState().updateValue("styleStatesBodyFilter", value);
  view.statesBody.attr("filter", value);
  patchPresentationStyle("#statesBody", { filter: value || null });
}

export function applyVignettePreset(presetName: string): void {
  const attributes = JSON.parse(VIGNETTE_PRESETS[presetName]) as Record<string, Record<string, string | null>>;
  patchPresentation({ styles: attributes });
  for (const selector in attributes) {
    const el = getElementBySelector<Element>(selector);
    if (!el) continue;
    for (const attr in attributes[selector]) {
      const value = attributes[selector][attr];
      if (value === null) el.removeAttribute(attr);
      else el.setAttribute(attr, value);
    }
  }

  const vignette = getElementById<SVGGElement>("vignette");
  const maskRect = getElementById<SVGRectElement>("vignette-rect");
  const digit = (str: string | null) => (str ?? "").replace(/[^\d.]/g, "");

  const updates: Record<string, string> = {};
  if (vignette) {
    updates.styleOpacityInput = vignette.getAttribute("opacity") ?? "";
    updates.styleFillInput = vignette.getAttribute("fill") ?? "";
    updates.styleFilterInput = vignette.getAttribute("filter") ?? "";
  }
  if (maskRect) {
    updates.styleVignetteX = digit(maskRect.getAttribute("x"));
    updates.styleVignetteY = digit(maskRect.getAttribute("y"));
    updates.styleVignetteWidth = digit(maskRect.getAttribute("width"));
    updates.styleVignetteHeight = digit(maskRect.getAttribute("height"));
    updates.styleVignetteRx = digit(maskRect.getAttribute("rx"));
    updates.styleVignetteRy = digit(maskRect.getAttribute("ry"));
    updates.styleVignetteBlur = digit(maskRect.getAttribute("filter"));
  }
  const { values } = useStyleState.getState();
  useStyleState.getState().setValues({ ...values, ...updates });
}

export function applyVignetteX(value: string): void {
  useStyleState.getState().updateValue("styleVignetteX", value);
  getRequiredElementById<SVGRectElement>("vignette-rect").setAttribute("x", `${value}%`);
  patchPresentationStyle("#vignette-rect", { x: `${value}%` });
}

export function applyVignetteY(value: string): void {
  useStyleState.getState().updateValue("styleVignetteY", value);
  getRequiredElementById<SVGRectElement>("vignette-rect").setAttribute("y", `${value}%`);
  patchPresentationStyle("#vignette-rect", { y: `${value}%` });
}

export function applyVignetteWidth(value: string): void {
  useStyleState.getState().updateValue("styleVignetteWidth", value);
  getRequiredElementById<SVGRectElement>("vignette-rect").setAttribute("width", `${value}%`);
  patchPresentationStyle("#vignette-rect", { width: `${value}%` });
}

export function applyVignetteHeight(value: string): void {
  useStyleState.getState().updateValue("styleVignetteHeight", value);
  getRequiredElementById<SVGRectElement>("vignette-rect").setAttribute("height", `${value}%`);
  patchPresentationStyle("#vignette-rect", { height: `${value}%` });
}

export function applyVignetteRx(value: string): void {
  useStyleState.getState().updateValue("styleVignetteRx", value);
  getRequiredElementById<SVGRectElement>("vignette-rect").setAttribute("rx", `${value}%`);
  patchPresentationStyle("#vignette-rect", { rx: `${value}%` });
}

export function applyVignetteRy(value: string): void {
  useStyleState.getState().updateValue("styleVignetteRy", value);
  getRequiredElementById<SVGRectElement>("vignette-rect").setAttribute("ry", `${value}%`);
  patchPresentationStyle("#vignette-rect", { ry: `${value}%` });
}

export function applyScaleBarInput(id: string, value: string): void {
  useStyleState.getState().updateValue(id, value);
  const scaleBarBack = view.scaleBar.select<SVGGElement>("#scaleBarBack");
  if (!scaleBarBack.size()) return;

  if (id === "styleScaleBarSize") view.scaleBar.attr("data-bar-size", value);
  else if (id === "styleScaleBarFontSize") view.scaleBar.attr("font-size", value);
  else if (id === "styleScaleBarPositionX") view.scaleBar.attr("data-x", value);
  else if (id === "styleScaleBarPositionY") view.scaleBar.attr("data-y", value);
  else if (id === "styleScaleBarLabel") view.scaleBar.attr("data-label", value);
  else if (id === "styleScaleBarBackgroundFill") scaleBarBack.attr("fill", value);
  else if (id === "styleScaleBarBackgroundStroke") scaleBarBack.attr("stroke", value);
  else if (id === "styleScaleBarBackgroundStrokeWidth") scaleBarBack.attr("stroke-width", value);
  else if (id === "styleScaleBarBackgroundFilter") scaleBarBack.attr("filter", value);
  else if (id === "styleScaleBarBackgroundPaddingTop") scaleBarBack.attr("data-top", value);
  else if (id === "styleScaleBarBackgroundPaddingRight") scaleBarBack.attr("data-right", value);
  else if (id === "styleScaleBarBackgroundPaddingBottom") scaleBarBack.attr("data-bottom", value);
  else if (id === "styleScaleBarBackgroundPaddingLeft") scaleBarBack.attr("data-left", value);

  const scaleBarPresentationAttributes: Record<string, readonly [string, string]> = {
    styleScaleBarSize: ["#scaleBar", "data-bar-size"],
    styleScaleBarFontSize: ["#scaleBar", "font-size"],
    styleScaleBarPositionX: ["#scaleBar", "data-x"],
    styleScaleBarPositionY: ["#scaleBar", "data-y"],
    styleScaleBarLabel: ["#scaleBar", "data-label"],
    styleScaleBarBackgroundFill: ["#scaleBarBack", "fill"],
    styleScaleBarBackgroundStroke: ["#scaleBarBack", "stroke"],
    styleScaleBarBackgroundStrokeWidth: ["#scaleBarBack", "stroke-width"],
    styleScaleBarBackgroundFilter: ["#scaleBarBack", "filter"],
    styleScaleBarBackgroundPaddingTop: ["#scaleBarBack", "data-top"],
    styleScaleBarBackgroundPaddingRight: ["#scaleBarBack", "data-right"],
    styleScaleBarBackgroundPaddingBottom: ["#scaleBarBack", "data-bottom"],
    styleScaleBarBackgroundPaddingLeft: ["#scaleBarBack", "data-left"]
  };
  const presentationAttribute = scaleBarPresentationAttributes[id];
  if (presentationAttribute) patchPresentationStyle(presentationAttribute[0], { [presentationAttribute[1]]: value });

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
    drawScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.scale);
    fitScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.svgWidth, view.svgHeight);
  }
}

// ─── Map filter ───────────────────────────────────────────────────────────────

export function applyMapFilterButton(buttonId: string): void {
  const { activeMapFilter } = useStyleState.getState();
  view.svg.attr("data-filter", null).attr("filter", null);
  if (activeMapFilter === buttonId) {
    useStyleState.getState().setActiveMapFilter(null);
    return;
  }
  useStyleState.getState().setActiveMapFilter(buttonId);
  view.svg.attr("data-filter", buttonId).attr("filter", `url(#filter-${buttonId})`);
}

// ─── Texture URL dialog ───────────────────────────────────────────────────────

export function textureProvideURL(): void {
  textureUrlDialogStore.getState().open({
    onApply: (url: string) => {
      changeTexture(url);
      updateTextureSelectValue(url);
    }
  });
}

export function fetchTextureURL(url: string): void {
  INFO && console.info("Provided URL is", url);
  const img = new Image();
  img.onload = () => {
    const canvas = getElementById<HTMLCanvasElement>("texturePreview");
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = url;
}

// ─── Style preset private helpers ─────────────────────────────────────────────

async function getStylePreset(desiredPreset: string): Promise<[string, StyleJSON]> {
  let presetToLoad = desiredPreset;
  const isCustom = !SYSTEM_PRESETS.includes(desiredPreset);
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
  // The preset is the canonical input. SVG receives it only as the legacy
  // renderer's projection, so WebGL and SVG begin from identical style data.
  patchPresentation({ styles: styleJSON });
  for (const selector in styleJSON) {
    const el = getElementBySelector<Element>(selector);
    if (!el) continue;

    for (const attribute in styleJSON[selector]) {
      const value = styleJSON[selector][attribute];

      if (value === "null" || value === null) {
        el.removeAttribute(attribute);
        continue;
      }

      el.setAttribute(attribute, String(value));

      if (selector === "#texture") {
        const image = getElementBySelector<SVGImageElement>("#texture > image");
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

async function changeStyle(desiredPreset: string): Promise<void> {
  const [presetName, styleData] = await getStylePreset(desiredPreset);
  localStorage.setItem("presetStyle", presetName);
  applyStyleWithUiRefresh(styleData, presetName);
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) {
    BurgLabelsRenderer.render(worldContext, viewContext, appServices);
    drawStateLabels(worldContext, viewContext, appServices);
  }
}

function applyStyleWithUiRefresh(styleJSON: StyleJSON, presetName?: string): void {
  applyStyle(styleJSON);
  updateElements();
  selectStyleElement();
  updateMapFilter();

  if (presetName) {
    useStyleState.getState().setActivePreset(presetName);
    const isSystem = SYSTEM_PRESETS.includes(presetName);
    if (!isSystem) {
      const name = presetName.replace(CUSTOM_PRESET_PREFIX, "");
      const { systemPresets: sp, customPresets: cp } = useStyleState.getState();
      if (!cp.includes(name)) {
        useStyleState.getState().setPresets(sp, [...cp, name]);
      }
    }
  }

  document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
  drawScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.scale);
  fitScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.svgWidth, view.svgHeight);
  scheduleWebglUpdate();
}

function updateMapFilter(): void {
  const filter = view.svg.attr("data-filter");
  useStyleState.getState().setActiveMapFilter(filter);
}

// ─── Style preset public API ──────────────────────────────────────────────────

export async function applyStyleOnLoad(): Promise<void> {
  const desiredPreset = localStorage.getItem("presetStyle") ?? "default";
  const [appliedPreset, styleData] = await getStylePreset(desiredPreset);
  applyStyle(styleData);
  updateMapFilter();
  useStyleState.getState().setActivePreset(appliedPreset);
  selectStyleElement();
}

/**
 * Reflect a map's saved style preset in the Style tab without applying it.
 *
 * A loaded map already carries its complete presentation data (an SVG for
 * legacy `.map` files and PresentationData for `.fmg` archives). Re-applying
 * a preset here would discard map-specific style edits, so loading only needs
 * to synchronize the controlled React selector.
 */
export function syncLoadedStylePreset(presetName: string): void {
  if (!presetName) return;

  const state = useStyleState.getState();
  if (!SYSTEM_PRESETS.includes(presetName)) {
    const name = presetName.replace(CUSTOM_PRESET_PREFIX, "");
    if (!state.customPresets.includes(name)) state.setPresets(state.systemPresets, [...state.customPresets, name]);
  }
  useStyleState.getState().setActivePreset(presetName);
}

export function requestStylePresetChange(preset: string): void {
  if (styleChangeConfirmed) return void changeStyle(preset);

  confirmationDialog({
    title: "Change style preset",
    message: "Are you sure you want to change the style preset? All unsaved style changes will be lost",
    confirm: "Change",
    onConfirm: () => {
      styleChangeConfirmed = true;
      changeStyle(preset);
    },
    onCancel: () => {
      // Controlled select in React will revert automatically - no action needed
    }
  });
}

export function addStylePreset(): void {
  openDialog("styleSaver", {
    title: "Style Saver",
    width: "26em",
    position: { my: "center", at: "center", of: "svg" }
  });

  const { activePreset } = useStyleState.getState();
  const styleName = activePreset.replace(CUSTOM_PRESET_PREFIX, "");

  // Pre-fill the dialog with current style data
  const nameInput = getElementById<HTMLInputElement>("styleSaverName");
  const jsonArea = getElementById<HTMLTextAreaElement>("styleSaverJSON");
  if (nameInput) nameInput.value = styleName;
  if (jsonArea) jsonArea.value = JSON.stringify(collectStyleData(), null, 2);
  checkStyleName();
}

export function requestRemoveStylePreset(): void {
  const { activePreset, systemPresets: sp } = useStyleState.getState();
  if (sp.includes(activePreset)) {
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
  const { activePreset, systemPresets: sp, customPresets: cp } = useStyleState.getState();
  localStorage.removeItem("presetStyle");
  localStorage.removeItem(activePreset);
  const name = activePreset.replace(CUSTOM_PRESET_PREFIX, "");
  useStyleState.getState().setPresets(
    sp,
    cp.filter(p => p !== name)
  );
  changeStyle("default");
}

// ─── Style saver dialog helpers (exported for StyleSaverDialog.tsx) ───────────

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
    const el = getElementBySelector<HTMLElement>(selector);
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

export function checkStyleName(): void {
  const nameInput = getElementById<HTMLInputElement>("styleSaverName");
  const tipEl = getElementById<HTMLElement>("styleSaverTip");
  if (!nameInput || !tipEl) return;

  const rawName = nameInput.value;
  const styleName = CUSTOM_PRESET_PREFIX + rawName;

  const { systemPresets: sp } = useStyleState.getState();
  if (sp.includes(styleName) || sp.includes(rawName)) {
    tipEl.textContent = "default";
    return;
  }

  const { customPresets: cp } = useStyleState.getState();
  if (cp.some(p => p === rawName || CUSTOM_PRESET_PREFIX + p === styleName)) {
    tipEl.textContent = "existing";
    return;
  }

  tipEl.textContent = "new";
}

export function saveStylePreset(): void {
  const jsonArea = getElementById<HTMLTextAreaElement>("styleSaverJSON");
  const nameInput = getElementById<HTMLInputElement>("styleSaverName");
  const tipEl = getElementById<HTMLElement>("styleSaverTip");
  if (!jsonArea || !nameInput) return;

  const styleJSON = jsonArea.value;
  const desiredName = nameInput.value;

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
  if (tipEl?.textContent === "default") {
    tip("You cannot overwrite default preset, please change the name", false, "error");
    return;
  }

  const presetName = CUSTOM_PRESET_PREFIX + desiredName;
  const { systemPresets: sp, customPresets: cp } = useStyleState.getState();
  if (!cp.includes(desiredName)) {
    useStyleState.getState().setPresets(sp, [...cp, desiredName]);
  }
  useStyleState.getState().setActivePreset(presetName);
  localStorage.setItem("presetStyle", presetName);
  localStorage.setItem(presetName, styleJSON);

  applyStyleWithUiRefresh(JSON.parse(styleJSON) as StyleJSON, presetName);
  tip("Style preset is saved and applied", false, "success", 4000);
  closeDialog("styleSaver");
}

export function downloadStylePreset(): void {
  const jsonArea = getElementById<HTMLTextAreaElement>("styleSaverJSON");
  const nameInput = getElementById<HTMLInputElement>("styleSaverName");
  if (!jsonArea || !nameInput) return;

  const styleJSON = jsonArea.value;
  const styleName = nameInput.value;

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

export function handleStyleFileLoad(this: HTMLInputElement): void {
  const fileName = this.files?.[0]?.name.replace(/\.[^.]*$/, "") ?? "";
  uploadFile(this, function styleUpload(dataLoaded: string) {
    if (!dataLoaded) return tip("Cannot load the file. Please check the data format", false, "error");
    const isValid = JSON.isValid(dataLoaded);
    if (!isValid) return tip("Loaded data is not a valid JSON, please check the format", false, "error");

    const jsonArea = getElementById<HTMLTextAreaElement>("styleSaverJSON");
    const nameInput = getElementById<HTMLInputElement>("styleSaverName");
    if (jsonArea) jsonArea.value = JSON.stringify(JSON.parse(dataLoaded), null, 2);
    if (nameInput) nameInput.value = fileName;
    checkStyleName();
    tip("Style preset is uploaded", false, "success", 4000);
  });
}

// ─── initStyleTab (initialization only — no event listeners) ─────────────────

export function initStyleTab(): void {
  // Register font-added listener to update the store options
  onFontAdded((family, shouldSelect) => {
    const currentFontOptions = useStyleState.getState().options.styleSelectFont ?? [];
    if (!currentFontOptions.some(o => o.value === family)) {
      useStyleState.getState().setOptions("styleSelectFont", [...currentFontOptions, { value: family, label: family }]);
    }
    if (shouldSelect) {
      useStyleState.getState().updateValue("styleSelectFont", family);
      changeFont();
    }
  });

  // Initialize filter select options from SVG <defs>
  const buildFilterOptions = (): SelectOption[] => {
    const filters = Array.from(
      getElementById<SVGDefsElement>("filters")?.querySelectorAll<SVGFilterElement>("filter") ?? []
    );
    return [
      { value: "", label: "None" },
      ...filters.map(filter => {
        const id = filter.getAttribute("id")!;
        const name = filter.getAttribute("name") ?? id;
        return { value: `url(#${id})`, label: name };
      })
    ];
  };
  const filterOptions = buildFilterOptions();
  useStyleState.getState().setOptions("styleFilterInput", filterOptions);
  useStyleState.getState().setOptions("styleStatesBodyFilter", filterOptions);
  useStyleState.getState().setOptions("styleScaleBarBackgroundFilter", filterOptions);

  // Initialize heightmap scheme options
  const schemeOptions: SelectOption[] = Object.keys(heightmapColorSchemes).map(scheme => ({
    value: scheme,
    label: scheme
  }));
  useStyleState.getState().setOptions("styleHeightmapScheme", schemeOptions);

  // Initialize style preset dropdown data
  const storedStyles = Object.keys(localStorage).filter(key => key.startsWith(CUSTOM_PRESET_PREFIX));
  const customNames = storedStyles.map(key => key.replace(CUSTOM_PRESET_PREFIX, ""));
  useStyleState.getState().setPresets(SYSTEM_PRESETS, customNames);
}

export function initStyle(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}

// ─── CustomEvent Listeners ────────────────────────────────────────────────────

document.addEventListener("fmg:add-custom-color-scheme", (e: Event) =>
  addCustomColorScheme((e as CustomEvent<string>).detail)
);
document.addEventListener("fmg:update-texture-select-value", (e: Event) =>
  updateTextureSelectValue((e as CustomEvent<string>).detail)
);
document.addEventListener("fmg:calculate-friendly-grid-size", () => {
  calculateFriendlyGridSize();
});
