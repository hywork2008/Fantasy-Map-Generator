import type { Selection } from "d3";
import {
  interpolateGreens,
  interpolateGreys,
  interpolateRdYlGn,
  interpolateRgb,
  interpolateRgbBasis,
  interpolateSpectral,
  scaleSequential
} from "d3";
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
import { drawHeights, ensureEl, parseTransform, rn, toHEX } from "../utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StyleJSON = Record<string, Record<string, string | number | null>>;
type ColorSchemeFunc = (t: number) => string;
type AnySelection = Selection<SVGGElement, unknown, null, undefined>;

// ─── Color schemes ────────────────────────────────────────────────────────────

const heightmapColorSchemes: Record<string, ColorSchemeFunc> = {
  bright: scaleSequential(interpolateSpectral),
  light: scaleSequential(interpolateRdYlGn),
  natural: scaleSequential(interpolateRgbBasis(["white", "#EEEECC", "tan", "green", "teal"])),
  green: scaleSequential(interpolateGreens),
  olive: scaleSequential(interpolateRgbBasis(["#ffffff", "#cea48d", "#d5b085", "#0c2c19", "#151320"])),
  livid: scaleSequential(interpolateRgbBasis(["#BBBBDD", "#2A3440", "#17343B", "#0A1E24"])),
  monochrome: scaleSequential(interpolateGreys)
};

function addCustomColorScheme(scheme: string): void {
  const stops = scheme.split(",");
  heightmapColorSchemes[scheme] = scaleSequential(interpolateRgbBasis(stops));
  ensureEl<HTMLSelectElement>("styleHeightmapScheme").options.add(new Option(scheme, scheme, false, true));
}

function getColorScheme(scheme: string | null = "bright"): ColorSchemeFunc {
  const key = scheme ?? "bright";
  if (!(key in heightmapColorSchemes)) {
    heightmapColorSchemes[key] = scaleSequential(interpolateRgbBasis(key.split(",")));
  }
  return heightmapColorSchemes[key];
}

function getColor(value: number, scheme: ColorSchemeFunc = heightmapColorSchemes.bright): string {
  return scheme(1 - (value < 20 ? value - 5 : value) / 100);
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

  ensureEl("styleElements")
    .querySelectorAll<HTMLElement>("tbody")
    .forEach(e => {
      e.style.display = "none";
    });

  const isLayerOff = styleElement !== "ocean" && (el.style("display") === "none" || !el.selectAll("*").size());
  ensureEl<HTMLElement>("styleIsOff").style.display = isLayerOff ? "block" : "none";

  if (["anchors", "borders", "burgIcons", "coastline", "lakes", "labels", "routes", "terrs"].includes(styleElement)) {
    const group = ensureEl<HTMLSelectElement>("styleGroupSelect").value;
    const defaultGroupSelector = styleElement === "terrs" ? "#landHeights" : "g";
    el =
      group && el.select<SVGGElement>(`#${group}`).size()
        ? el.select<SVGGElement>(`#${group}`)
        : el.select<SVGGElement>(defaultGroupSelector);
  }

  if (!["landmass", "legend", "ocean", "regions"].includes(styleElement)) {
    ensureEl<HTMLElement>("styleOpacity").style.display = "block";
    ensureEl<HTMLInputElement>("styleOpacityInput").value = String(el.attr("opacity") ?? 1);
  }

  if (!["landmass", "legend", "regions", "scaleBar"].includes(styleElement)) {
    ensureEl<HTMLElement>("styleFilter").style.display = "block";
    ensureEl<HTMLInputElement>("styleFilterInput").value = el.attr("filter") ?? "";
  }

  if (["fogging", "ice", "lakes", "landmass", "prec", "rivers", "scaleBar", "vignette"].includes(styleElement)) {
    ensureEl<HTMLElement>("styleFill").style.display = "block";
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
    ensureEl<HTMLElement>("styleStroke").style.display = "block";
    const stroke = el.attr("stroke") ?? "";
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = String(el.attr("stroke-width") ?? 0);
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
    ensureEl<HTMLElement>("styleStrokeDash").style.display = "block";
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
    ensureEl<HTMLElement>("styleClipping").style.display = "block";
    ensureEl<HTMLInputElement>("styleClippingInput").value = el.attr("mask") ?? "";
  }

  if (styleElement === "texture") {
    ensureEl<HTMLElement>("styleTexture").style.display = "block";
    ensureEl<HTMLInputElement>("styleTextureShiftX").value = String(el.attr("data-x") ?? 0);
    ensureEl<HTMLInputElement>("styleTextureShiftY").value = String(el.attr("data-y") ?? 0);
    updateTextureSelectValue(el.attr("data-href") ?? "");
  }

  if (styleElement === "terrs") {
    ensureEl<HTMLElement>("styleHeightmap").style.display = "block";
    ensureEl<HTMLElement>("styleHeightmapRenderOceanOption").style.display =
      el.attr("id") === "oceanHeights" ? "block" : "none";
    ensureEl<HTMLInputElement>("styleHeightmapRenderOcean").checked = Boolean(+el.attr("data-render")!);
    ensureEl<HTMLSelectElement>("styleHeightmapScheme").value = el.attr("scheme") ?? "";
    ensureEl<HTMLInputElement>("styleHeightmapTerracing").value = el.attr("terracing") ?? "";
    ensureEl<HTMLInputElement>("styleHeightmapSkip").value = el.attr("skip") ?? "";
    ensureEl<HTMLInputElement>("styleHeightmapSimplification").value = el.attr("relax") ?? "";
    ensureEl<HTMLSelectElement>("styleHeightmapCurve").value = el.attr("curve") ?? "";
  }

  if (styleElement === "markers") {
    ensureEl<HTMLElement>("styleMarkers").style.display = "block";
    ensureEl<HTMLInputElement>("styleRescaleMarkers").checked = Boolean(+markers.attr("rescale")!);
  }

  if (styleElement === "gridOverlay") {
    ensureEl<HTMLElement>("styleGrid").style.display = "block";
    ensureEl<HTMLSelectElement>("styleGridType").value = el.attr("type") ?? "";
    ensureEl<HTMLInputElement>("styleGridScale").value = String(el.attr("scale") ?? 1);
    ensureEl<HTMLInputElement>("styleGridShiftX").value = String(el.attr("dx") ?? 0);
    ensureEl<HTMLInputElement>("styleGridShiftY").value = String(el.attr("dy") ?? 0);
    calculateFriendlyGridSize();
  }

  if (styleElement === "compass") {
    ensureEl<HTMLElement>("styleCompass").style.display = "block";
    const tr = parseTransform(compass.select("use").attr("transform"));
    ensureEl<HTMLInputElement>("styleCompassShiftX").value = String(tr[0]);
    ensureEl<HTMLInputElement>("styleCompassShiftY").value = String(tr[1]);
    ensureEl<HTMLInputElement>("styleCompassSizeInput").value = String(tr[2]);
  }

  if (styleElement === "terrain") {
    ensureEl<HTMLElement>("styleRelief").style.display = "block";
    ensureEl<HTMLInputElement>("styleReliefSize").value = String(terrain.attr("size") ?? 1);
    ensureEl<HTMLInputElement>("styleReliefDensity").value = String(terrain.attr("density") ?? 0.4);
    ensureEl<HTMLSelectElement>("styleReliefSet").value = terrain.attr("set") ?? "";
  }

  if (styleElement === "population") {
    ensureEl<HTMLElement>("stylePopulation").style.display = "block";
    const ruralStroke = population.select("#rural").attr("stroke") ?? "";
    const urbanStroke = population.select("#urban").attr("stroke") ?? "";
    ensureEl<HTMLInputElement>("stylePopulationRuralStrokeInput").value = ruralStroke;
    ensureEl<HTMLInputElement>("stylePopulationRuralStrokeOutput").value = ruralStroke;
    ensureEl<HTMLInputElement>("stylePopulationUrbanStrokeInput").value = urbanStroke;
    ensureEl<HTMLInputElement>("stylePopulationUrbanStrokeOutput").value = urbanStroke;
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = String(el.attr("stroke-width") ?? 0);
  }

  if (styleElement === "regions") {
    ensureEl<HTMLElement>("styleStates").style.display = "block";
    ensureEl<HTMLInputElement>("styleStatesBodyOpacity").value = String(statesBody.attr("opacity") ?? 1);
    ensureEl<HTMLInputElement>("styleStatesBodyFilter").value = statesBody.attr("filter") ?? "";
    ensureEl<HTMLInputElement>("styleStatesHaloWidth").value = String(statesHalo.attr("data-width") ?? 10);
    ensureEl<HTMLInputElement>("styleStatesHaloOpacity").value = String(statesHalo.attr("opacity") ?? 1);
    const blurMatch = statesHalo.attr("filter")?.match(/blur\(([^)]+)\)/);
    ensureEl<HTMLInputElement>("styleStatesHaloBlur").value = String(blurMatch ? parseFloat(blurMatch[1]) : 0);
  }

  if (styleElement === "provs") {
    ensureEl<HTMLElement>("styleFill").style.display = "block";
    ensureEl<HTMLElement>("styleSize").style.display = "block";
    const fill = el.attr("fill") ?? "#111111";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    ensureEl<HTMLElement>("styleFont").style.display = "block";
    ensureEl<HTMLSelectElement>("styleSelectFont").value = el.attr("font-family") ?? "";
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("font-size") ?? "";
  }

  if (styleElement === "labels") {
    ensureEl<HTMLElement>("styleFill").style.display = "block";
    ensureEl<HTMLElement>("styleStroke").style.display = "block";
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLElement>("styleLetterSpacing").style.display = "block";
    ensureEl<HTMLElement>("styleShadow").style.display = "block";
    ensureEl<HTMLElement>("styleSize").style.display = "block";
    ensureEl<HTMLElement>("styleVisibility").style.display = "block";

    const fill = el.attr("fill") ?? "#3e3e4b";
    const stroke = el.attr("stroke") ?? "#3a3a3a";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = String(el.attr("stroke-width") ?? 0);
    ensureEl<HTMLInputElement>("styleLetterSpacingInput").value = String(el.attr("letter-spacing") ?? 0);
    ensureEl<HTMLInputElement>("styleShadowInput").value = el.style("text-shadow") ?? "";
    ensureEl<HTMLInputElement>("styleLabelsHideGroup").checked = el.node()?.style.display === "none";

    ensureEl<HTMLElement>("styleFont").style.display = "block";
    ensureEl<HTMLSelectElement>("styleSelectFont").value = el.attr("font-family") ?? "";
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("data-size") ?? "";

    if ((el.node() as Element).parentElement?.id === "burgLabels") {
      ensureEl<HTMLElement>("styleFontShift").style.display = "block";
      ensureEl<HTMLInputElement>("styleFontShiftX").value = String(el.attr("data-dx") ?? 0);
      ensureEl<HTMLInputElement>("styleFontShiftY").value = String(el.attr("data-dy") ?? 0);
    }
  }

  if (styleElement === "burgIcons") {
    ensureEl<HTMLElement>("styleBurgIcons").style.display = "block";
    ensureEl<HTMLSelectElement>("styleBurgIconsIcon").value = el.attr("data-icon") ?? "";
    ensureEl<HTMLInputElement>("styleBurgIconsIconSize").value = el.attr("font-size") ?? "";
    ensureEl<HTMLSelectElement>("styleBurgIconsStrokeLinejoin").value = el.attr("stroke-linejoin") ?? "";
    ensureEl<HTMLInputElement>("styleBurgIconsFillOpacity").value = el.attr("fill-opacity") ?? "";

    ensureEl<HTMLElement>("styleFill").style.display = "block";
    ensureEl<HTMLElement>("styleStroke").style.display = "block";
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLElement>("styleStrokeDash").style.display = "block";
    const fill = el.attr("fill") ?? "#ffffff";
    const stroke = el.attr("stroke") ?? "#3e3e4b";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = String(el.attr("stroke-width") ?? 0.24);
    ensureEl<HTMLInputElement>("styleStrokeDasharrayInput").value = el.attr("stroke-dasharray") ?? "";
    ensureEl<HTMLInputElement>("styleStrokeLinecapInput").value = el.attr("stroke-linecap") ?? "inherit";
  }

  if (styleElement === "anchors") {
    ensureEl<HTMLElement>("styleFill").style.display = "block";
    ensureEl<HTMLElement>("styleStroke").style.display = "block";
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLElement>("styleSize").style.display = "block";
    const fill = el.attr("fill") ?? "#ffffff";
    const stroke = el.attr("stroke") ?? "#3e3e4b";
    ensureEl<HTMLInputElement>("styleFillInput").value = fill;
    ensureEl<HTMLInputElement>("styleFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = String(el.attr("stroke-width") ?? 0.24);
    ensureEl<HTMLInputElement>("styleFontSize").value = String(el.attr("font-size") ?? 1);
  }

  if (styleElement === "legend") {
    ensureEl<HTMLElement>("styleStroke").style.display = "block";
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLElement>("styleSize").style.display = "block";
    ensureEl<HTMLElement>("styleLegend").style.display = "block";
    ensureEl<HTMLInputElement>("styleLegendColItems").value = el.attr("data-columns") ?? "";
    const legendBox = el.select<SVGRectElement>("#legendBox");
    const backFill = legendBox.size() ? (legendBox.attr("fill") ?? "#ffffff") : "#ffffff";
    ensureEl<HTMLInputElement>("styleLegendBack").value = backFill;
    ensureEl<HTMLInputElement>("styleLegendBackOutput").value = backFill;
    ensureEl<HTMLInputElement>("styleLegendOpacity").value = String(
      legendBox.size() ? (legendBox.attr("fill-opacity") ?? 1) : 1
    );
    const stroke = el.attr("stroke") ?? "#111111";
    ensureEl<HTMLInputElement>("styleStrokeInput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeOutput").value = stroke;
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = String(el.attr("stroke-width") ?? 0.5);
    ensureEl<HTMLElement>("styleFont").style.display = "block";
    ensureEl<HTMLSelectElement>("styleSelectFont").value = el.attr("font-family") ?? "";
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("data-size") ?? "";
  }

  if (styleElement === "ocean") {
    ensureEl<HTMLElement>("styleOcean").style.display = "block";
    const oceanBase = oceanLayers.select<SVGRectElement>("#oceanBase");
    const fill = oceanBase.attr("fill") ?? "";
    ensureEl<HTMLInputElement>("styleOceanFill").value = fill;
    ensureEl<HTMLInputElement>("styleOceanFillOutput").value = fill;
    ensureEl<HTMLInputElement>("styleOceanPattern").value =
      document.getElementById("oceanicPattern")?.getAttribute("href") ?? "";
    ensureEl<HTMLInputElement>("styleOceanPatternOpacity").value =
      document.getElementById("oceanicPattern")?.getAttribute("opacity") ?? "1";
    ensureEl<HTMLSelectElement>("outlineLayers").value = oceanLayers.attr("layers") ?? "";
  }

  if (styleElement === "temperature") {
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLElement>("styleTemperature").style.display = "block";
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = el.attr("stroke-width") ?? "";
    ensureEl<HTMLInputElement>("styleTemperatureFillOpacityInput").value = String(el.attr("fill-opacity") ?? 0.1);
    const tempFill = el.attr("fill") ?? "#000";
    ensureEl<HTMLInputElement>("styleTemperatureFillInput").value = tempFill;
    ensureEl<HTMLInputElement>("styleTemperatureFillOutput").value = tempFill;
    ensureEl<HTMLInputElement>("styleTemperatureFontSizeInput").value = el.attr("font-size") ?? "8px";
  }

  if (styleElement === "coordinates") {
    ensureEl<HTMLElement>("styleSize").style.display = "block";
    ensureEl<HTMLInputElement>("styleFontSize").value = el.attr("data-size") ?? "";
  }

  if (styleElement === "armies") {
    ensureEl<HTMLElement>("styleArmies").style.display = "block";
    ensureEl<HTMLInputElement>("styleArmiesFillOpacity").value = el.attr("fill-opacity") ?? "";
    ensureEl<HTMLInputElement>("styleArmiesSize").value = el.attr("box-size") ?? "";
  }

  if (styleElement === "emblems") {
    ensureEl<HTMLElement>("styleEmblems").style.display = "block";
    ensureEl<HTMLElement>("styleStrokeWidth").style.display = "block";
    ensureEl<HTMLInputElement>("styleStrokeWidthInput").value = String(el.attr("stroke-width") ?? 1);
    ensureEl<HTMLInputElement>("emblemsStateSizeInput").value =
      emblems.select("#stateEmblems").attr("data-size") ?? "1";
    ensureEl<HTMLInputElement>("emblemsProvinceSizeInput").value =
      emblems.select("#provinceEmblems").attr("data-size") ?? "1";
    ensureEl<HTMLInputElement>("emblemsBurgSizeInput").value = emblems.select("#burgEmblems").attr("data-size") ?? "1";
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
    ensureEl<HTMLElement>("styleGroup").style.display = "block";
  } else {
    ensureEl<HTMLSelectElement>("styleGroupSelect").options.add(new Option(styleElement, styleElement, false, true));
    ensureEl<HTMLElement>("styleGroup").style.display = "none";
  }

  if (styleElement === "coastline" && ensureEl<HTMLSelectElement>("styleGroupSelect").value === "sea_island") {
    ensureEl<HTMLElement>("styleCoastline").style.display = "block";
    const auto = Boolean(coastline.select("#sea_island").attr("auto-filter"));
    ensureEl<HTMLInputElement>("styleCoastlineAuto").checked = auto;
    if (auto) ensureEl<HTMLElement>("styleFilter").style.display = "none";
  }

  if (styleElement === "scaleBar") {
    ensureEl<HTMLElement>("styleScaleBar").style.display = "block";
    const scaleBarEl = scaleBar;
    ensureEl<HTMLInputElement>("styleScaleBarSize").value = scaleBarEl.attr("data-bar-size") ?? "";
    ensureEl<HTMLInputElement>("styleScaleBarFontSize").value = scaleBarEl.attr("font-size") ?? "";
    ensureEl<HTMLInputElement>("styleScaleBarPositionX").value = scaleBarEl.attr("data-x") ?? "99";
    ensureEl<HTMLInputElement>("styleScaleBarPositionY").value = scaleBarEl.attr("data-y") ?? "99";
    ensureEl<HTMLInputElement>("styleScaleBarLabel").value = scaleBarEl.attr("data-label") ?? "";

    const scaleBarBack = scaleBarEl.select<SVGRectElement>("#scaleBarBack");
    if (scaleBarBack.size()) {
      ensureEl<HTMLInputElement>("styleScaleBarBackgroundOpacity").value = scaleBarBack.attr("opacity") ?? "";
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
    ensureEl<HTMLElement>("styleVignette").style.display = "block";
    const maskRect = document.getElementById("vignette-rect");
    if (maskRect) {
      const digit = (str: string | null) => (str ?? "").replace(/[^\d.]/g, "");
      ensureEl<HTMLInputElement>("styleVignetteX").value = digit(maskRect.getAttribute("x"));
      ensureEl<HTMLInputElement>("styleVignetteY").value = digit(maskRect.getAttribute("y"));
      ensureEl<HTMLInputElement>("styleVignetteWidth").value = digit(maskRect.getAttribute("width"));
      ensureEl<HTMLInputElement>("styleVignetteHeight").value = digit(maskRect.getAttribute("height"));
      ensureEl<HTMLInputElement>("styleVignetteRx").value = digit(maskRect.getAttribute("rx"));
      ensureEl<HTMLInputElement>("styleVignetteRy").value = digit(maskRect.getAttribute("ry"));
      ensureEl<HTMLInputElement>("styleVignetteBlur").value = digit(maskRect.getAttribute("filter"));
    }
  }
}

// ─── Helper: get current D3 selection ─────────────────────────────────────────

function getEl(): AnySelection {
  const el = ensureEl<HTMLSelectElement>("styleElementSelect").value;
  const g = ensureEl<HTMLSelectElement>("styleGroupSelect").value;
  if (g === el || g === "") return svg.select<SVGGElement>(`#${el}`);
  return svg.select<SVGGElement>(`#${el}`).select<SVGGElement>(`#${g}`);
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

function shiftCompass(): void {
  const x = ensureEl<HTMLInputElement>("styleCompassShiftX").value;
  const y = ensureEl<HTMLInputElement>("styleCompassShiftY").value;
  const size = ensureEl<HTMLInputElement>("styleCompassSizeInput").value;
  const tr = `translate(${x} ${y}) scale(${size})`;
  compass.select("use").attr("transform", tr);
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
  if (layerIsOn("toggleHeight")) drawHeightmap();
  if (legend.selectAll("*").size()) redrawLegend();
  oceanLayers.selectAll("path").remove();
  OceanLayers();
  invokeActiveZooming();
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
  alertMessage.innerHTML = /* html */ `Provide a texture image URL:
    <input id="textureURL" type="url" style="width: 100%" placeholder="http://www.example.com/image.jpg" oninput="fetchTextureURL(this.value)" />
    <canvas id="texturePreview" width="256px" height="144px"></canvas>`;

  $("#alert").dialog({
    resizable: false,
    title: "Load custom texture",
    width: "28em",
    buttons: {
      Apply: function (this: HTMLElement) {
        const url = (document.getElementById("textureURL") as HTMLInputElement).value;
        if (!url) return tip("Please provide a valid URL", false, "error");
        changeTexture(url);
        updateTextureSelectValue(url);
        $(this).dialog("close");
      },
      Cancel: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    }
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

ensureEl("styleElements").on("change", (ev: Event) => {
  const target = ev.target as HTMLElement;
  if (target.dataset.stored) lock(target.dataset.stored);
});

ensureEl("styleElementSelect").on("change", selectStyleElement);
ensureEl("styleGroupSelect").on("change", selectStyleElement);

ensureEl("styleFillInput").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  ensureEl<HTMLInputElement>("styleFillOutput").value = value;
  getEl().attr("fill", value);
});

ensureEl("styleStrokeInput").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  ensureEl<HTMLInputElement>("styleStrokeOutput").value = value;
  getEl().attr("stroke", value);
  if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid")) drawGrid();
});

ensureEl("styleStrokeWidthInput").on("input", (e: Event) => {
  getEl().attr("stroke-width", (e.target as HTMLInputElement).value);
  if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid")) drawGrid();
});

ensureEl("styleLetterSpacingInput").on("input", (e: Event) => {
  getEl().attr("letter-spacing", (e.target as HTMLInputElement).value);
});

ensureEl("styleStrokeDasharrayInput").on("input", (e: Event) => {
  getEl().attr("stroke-dasharray", (e.target as HTMLInputElement).value);
  if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid")) drawGrid();
});

ensureEl("styleStrokeLinecapInput").on("change", (e: Event) => {
  getEl().attr("stroke-linecap", (e.target as HTMLSelectElement).value);
  if (ensureEl<HTMLSelectElement>("styleElementSelect").value === "gridOverlay" && layerIsOn("toggleGrid")) drawGrid();
});

ensureEl("styleOpacityInput").on("input", (e: Event) => {
  getEl().attr("opacity", (e.target as HTMLInputElement).value);
});

ensureEl("styleLabelsHideGroup").on("change", (e: Event) => {
  if ((e.target as HTMLInputElement).checked) getEl().style("display", "none");
  else getEl().style("display", null);
});

ensureEl("styleFilterInput").on("change", (e: Event) => {
  const value = (e.target as HTMLSelectElement).value;
  if (ensureEl<HTMLSelectElement>("styleGroupSelect").value === "ocean") return void oceanLayers.attr("filter", value);
  getEl().attr("filter", value);
});

ensureEl("styleTextureInput").on("change", (e: Event) => {
  changeTexture((e.target as HTMLSelectElement).value);
});

ensureEl("styleTextureShiftX").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  const numVal = +(e.target as HTMLInputElement).valueAsNumber;
  texture.attr("data-x", value);
  texture
    .select("image")
    .attr("x", value)
    .attr("width", graphWidth - numVal);
});

ensureEl("styleTextureShiftY").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  const numVal = +(e.target as HTMLInputElement).valueAsNumber;
  texture.attr("data-y", value);
  texture
    .select("image")
    .attr("y", value)
    .attr("height", graphHeight - numVal);
});

ensureEl("styleClippingInput").on("change", (e: Event) => {
  getEl().attr("mask", (e.target as HTMLSelectElement).value);
});

ensureEl("styleGridType").on("change", (e: Event) => {
  getEl().attr("type", (e.target as HTMLSelectElement).value);
  if (layerIsOn("toggleGrid")) drawGrid();
  calculateFriendlyGridSize();
});

ensureEl("styleGridScale").on("input", () => {
  getEl().attr("scale", ensureEl<HTMLInputElement>("styleGridScale").value);
  if (layerIsOn("toggleGrid")) drawGrid();
  calculateFriendlyGridSize();
});

ensureEl("styleGridShiftX").on("input", (e: Event) => {
  getEl().attr("dx", (e.target as HTMLInputElement).value);
  if (layerIsOn("toggleGrid")) drawGrid();
});

ensureEl("styleGridShiftY").on("input", (e: Event) => {
  getEl().attr("dy", (e.target as HTMLInputElement).value);
  if (layerIsOn("toggleGrid")) drawGrid();
});

ensureEl("styleRescaleMarkers").on("change", (e: Event) => {
  markers.attr("rescale", +(e.target as HTMLInputElement).checked);
  invokeActiveZooming();
});

ensureEl("styleCoastlineAuto").on("change", (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked;
  coastline.select("#sea_island").attr("auto-filter", +checked);
  ensureEl<HTMLElement>("styleFilter").style.display = checked ? "none" : "block";
  invokeActiveZooming();
});

ensureEl("styleOceanFill").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  oceanLayers.select("rect").attr("fill", value);
  ensureEl<HTMLInputElement>("styleOceanFillOutput").value = value;
});

ensureEl("styleOceanPattern").on("change", (e: Event) => {
  ensureEl("oceanicPattern").setAttribute("href", (e.target as HTMLSelectElement).value);
});

ensureEl("styleOceanPatternOpacity").on("input", (e: Event) => {
  ensureEl("oceanicPattern").setAttribute("opacity", (e.target as HTMLInputElement).value);
});

ensureEl("outlineLayers").on("change", (e: Event) => {
  oceanLayers.selectAll("path").remove();
  oceanLayers.attr("layers", (e.target as HTMLSelectElement).value);
  OceanLayers();
});

ensureEl("styleHeightmapScheme").on("change", (e: Event) => {
  getEl().attr("scheme", (e.target as HTMLSelectElement).value);
  drawHeightmap();
});

ensureEl("openCreateHeightmapSchemeButton").on("click", function (this: HTMLButtonElement) {
  const button = this;
  const scheme = getEl().attr("scheme") ?? "bright";
  button.dataset.stops = scheme.startsWith("#")
    ? scheme
    : [0, 0.25, 0.5, 0.75, 1].map(heightmapColorSchemes[scheme]).map(toHEX).join(",");

  alertMessage.innerHTML = /* html */ `<div>
    <i>Define heightmap gradient colors from high to low altitude</i>
    <img id="heightmapSchemePreview" alt="heightmap preview" style="margin-top: 0.5em; width: 100%;" />
    <div id="heightmapSchemeStops" style="margin-block: 0.5em; display: flex; flex-wrap: wrap;"></div>
    <div id="heightmapSchemeGradient" style="height: 1.9em; border: 1px solid #767676;"></div>
  </div>`;

  renderPreview();
  renderStops();
  renderGradient();

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
    drawHeightmap();
    handleClose();
  }

  function handleClose(): void {
    $("#alert").dialog("close");
  }

  $("#alert").dialog({
    resizable: false,
    title: "Create heightmap color scheme",
    width: "28em",
    buttons: { Create: handleCreate, Cancel: handleClose },
    position: { my: "center top+150", at: "center top", of: "svg" }
  });
});

ensureEl("styleHeightmapRenderOcean").on("change", (e: Event) => {
  getEl().attr("data-render", +(e.target as HTMLInputElement).checked);
  drawHeightmap();
});

ensureEl("styleHeightmapTerracing").on("input", (e: Event) => {
  getEl().attr("terracing", (e.target as HTMLInputElement).value);
  drawHeightmap();
});

ensureEl("styleHeightmapSkip").on("input", (e: Event) => {
  getEl().attr("skip", (e.target as HTMLInputElement).value);
  drawHeightmap();
});

ensureEl("styleHeightmapSimplification").on("input", (e: Event) => {
  getEl().attr("relax", (e.target as HTMLInputElement).value);
  drawHeightmap();
});

ensureEl("styleHeightmapCurve").on("change", (e: Event) => {
  getEl().attr("curve", (e.target as HTMLSelectElement).value);
  drawHeightmap();
});

ensureEl("styleReliefSet").on("change", (e: Event) => {
  terrain.attr("set", (e.target as HTMLSelectElement).value);
  drawReliefIcons();
  if (!layerIsOn("toggleRelief")) toggleRelief();
});

ensureEl("styleReliefSize").on("change", (e: Event) => {
  terrain.attr("size", (e.target as HTMLInputElement).value);
  drawReliefIcons();
  if (!layerIsOn("toggleRelief")) toggleRelief();
});

ensureEl("styleReliefDensity").on("change", (e: Event) => {
  terrain.attr("density", (e.target as HTMLInputElement).value);
  drawReliefIcons();
  if (!layerIsOn("toggleRelief")) toggleRelief();
});

ensureEl("styleTemperatureFillOpacityInput").on("input", (e: Event) => {
  temperature.attr("fill-opacity", (e.target as HTMLInputElement).value);
});

ensureEl("styleTemperatureFontSizeInput").on("input", (e: Event) => {
  temperature.attr("font-size", `${(e.target as HTMLInputElement).value}px`);
});

ensureEl("styleTemperatureFillInput").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  temperature.attr("fill", value);
  ensureEl<HTMLInputElement>("styleTemperatureFillOutput").value = value;
});

ensureEl("stylePopulationRuralStrokeInput").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  population.select("#rural").attr("stroke", value);
  ensureEl<HTMLInputElement>("stylePopulationRuralStrokeOutput").value = value;
});

ensureEl("stylePopulationUrbanStrokeInput").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  population.select("#urban").attr("stroke", value);
  ensureEl<HTMLInputElement>("stylePopulationUrbanStrokeOutput").value = value;
});

ensureEl("styleBurgIconsIcon").on("change", (e: Event) => {
  const value = (e.target as HTMLSelectElement).value;
  getEl().attr("data-icon", value).selectAll<SVGUseElement, unknown>("use").attr("href", value);
});

ensureEl("styleBurgIconsIconSize").on("input", (e: Event) => {
  getEl().attr("font-size", (e.target as HTMLInputElement).value);
});

ensureEl("styleBurgIconsStrokeLinejoin").on("change", (e: Event) => {
  getEl().attr("stroke-linejoin", (e.target as HTMLSelectElement).value);
});

ensureEl("styleBurgIconsFillOpacity").on("input", (e: Event) => {
  getEl().attr("fill-opacity", (e.target as HTMLInputElement).value);
});

ensureEl("styleCompassSizeInput").on("input", shiftCompass);
ensureEl("styleCompassShiftX").on("input", shiftCompass);
ensureEl("styleCompassShiftY").on("input", shiftCompass);

ensureEl("styleLegendColItems").on("input", (e: Event) => {
  legend.select("#legendBox").attr("data-columns", (e.target as HTMLInputElement).value);
  redrawLegend();
});

ensureEl("styleLegendBack").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  ensureEl<HTMLInputElement>("styleLegendBackOutput").value = value;
  legend.select("#legendBox").attr("fill", value);
});

ensureEl("styleLegendOpacity").on("input", (e: Event) => {
  legend.select("#legendBox").attr("fill-opacity", (e.target as HTMLInputElement).value);
});

ensureEl("styleSelectFont").on("change", changeFont);

ensureEl("styleShadowInput").on("input", (e: Event) => {
  getEl().style("text-shadow", (e.target as HTMLInputElement).value);
});

ensureEl("styleFontAdd").on("click", () => {
  ensureEl<HTMLInputElement>("addFontNameInput").value = "";
  ensureEl<HTMLInputElement>("addFontURLInput").value = "";

  $("#addFontDialog").dialog({
    title: "Add custom font",
    width: "26em",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Add: function (this: HTMLElement) {
        const family = ensureEl<HTMLInputElement>("addFontNameInput").value;
        const src = ensureEl<HTMLInputElement>("addFontURLInput").value;
        const method = ensureEl<HTMLSelectElement>("addFontMethod").value;

        if (!family) return tip("Please provide a font name", false, "error");

        const existingFont =
          method === "fontURL"
            ? fonts.find(font => font.family === family && font.src === src)
            : fonts.find(font => font.family === family);
        if (existingFont) return tip("The font is already added", false, "error");

        if (method === "fontURL") addWebFont(family, src);
        else if (method === "googleFont") addGoogleFont(family);
        else if (method === "localFont") addLocalFont(family);

        ensureEl<HTMLInputElement>("addFontNameInput").value = "";
        ensureEl<HTMLInputElement>("addFontURLInput").value = "";
        $(this).dialog("close");
      },
      Cancel: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    }
  });
});

ensureEl("addFontMethod").on("change", (e: Event) => {
  ensureEl<HTMLElement>("addFontURLInput").style.display =
    (e.target as HTMLSelectElement).value === "fontURL" ? "inline" : "none";
});

ensureEl("styleFontSize").on("change", () => {
  changeFontSize(getEl(), +ensureEl<HTMLInputElement>("styleFontSize").value);
});

ensureEl("styleFontPlus").on("click", () => {
  const current = +ensureEl<HTMLInputElement>("styleFontSize").value || 12;
  changeFontSize(getEl(), Math.min(rn(current + 0.1, 1), 999));
});

ensureEl("styleFontMinus").on("click", () => {
  const current = +ensureEl<HTMLInputElement>("styleFontSize").value || 12;
  changeFontSize(getEl(), Math.max(rn(current - 0.1, 1), 0.1));
});

ensureEl("styleFontShiftX").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  getEl().attr("data-dx", value).selectAll<SVGTextElement, unknown>("text").attr("dx", `${value}em`);
});

ensureEl("styleFontShiftY").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  getEl().attr("data-dy", value).selectAll<SVGTextElement, unknown>("text").attr("dy", `${value}em`);
});

ensureEl("styleStatesBodyOpacity").on("input", (e: Event) => {
  statesBody.attr("opacity", (e.target as HTMLInputElement).value);
});

ensureEl("styleStatesBodyFilter").on("change", (e: Event) => {
  statesBody.attr("filter", (e.target as HTMLSelectElement).value);
});

ensureEl("styleStatesHaloWidth").on("input", (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  statesHalo.attr("data-width", value).attr("stroke-width", value);
});

ensureEl("styleStatesHaloOpacity").on("input", (e: Event) => {
  statesHalo.attr("opacity", (e.target as HTMLInputElement).value);
});

ensureEl("styleStatesHaloBlur").on("input", (e: Event) => {
  const value = Number((e.target as HTMLInputElement).value);
  const blur = value > 0 ? `blur(${value}px)` : null;
  statesHalo.attr("filter", blur);
});

ensureEl("styleArmiesFillOpacity").on("input", (e: Event) => {
  armies.attr("fill-opacity", (e.target as HTMLInputElement).value);
});

ensureEl("styleArmiesSize").on("input", (e: Event) => {
  const value = Number((e.target as HTMLInputElement).value);
  armies.attr("box-size", value).attr("font-size", value * 2);
  armies.selectAll("g").remove();
  pack.states.forEach(s => {
    if (!s.i || s.removed || !s.military?.length) return;
    drawRegiments(s.military, s.i);
  });
});

ensureEl("emblemsStateSizeInput").on("change", (e: Event) => {
  emblems.select("#stateEmblems").attr("data-size", (e.target as HTMLInputElement).value);
  drawEmblems();
});

ensureEl("emblemsProvinceSizeInput").on("change", (e: Event) => {
  emblems.select("#provinceEmblems").attr("data-size", (e.target as HTMLInputElement).value);
  drawEmblems();
});

ensureEl("emblemsBurgSizeInput").on("change", (e: Event) => {
  emblems.select("#burgEmblems").attr("data-size", (e.target as HTMLInputElement).value);
  drawEmblems();
});

ensureEl("styleVignettePreset").on("change", (e: Event) => {
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
    ensureEl<HTMLInputElement>("styleOpacityInput").value = vignette.getAttribute("opacity") ?? "";
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
    ensureEl<HTMLInputElement>("styleVignetteBlur").value = digit(maskRect.getAttribute("filter"));
  }
});

ensureEl("styleVignetteX").on("input", (e: Event) => {
  ensureEl("vignette-rect").setAttribute("x", `${(e.target as HTMLInputElement).value}%`);
});

ensureEl("styleVignetteWidth").on("input", (e: Event) => {
  ensureEl("vignette-rect").setAttribute("width", `${(e.target as HTMLInputElement).value}%`);
});

ensureEl("styleVignetteY").on("input", (e: Event) => {
  ensureEl("vignette-rect").setAttribute("y", `${(e.target as HTMLInputElement).value}%`);
});

ensureEl("styleVignetteHeight").on("input", (e: Event) => {
  ensureEl("vignette-rect").setAttribute("height", `${(e.target as HTMLInputElement).value}%`);
});

ensureEl("styleVignetteRx").on("input", (e: Event) => {
  ensureEl("vignette-rect").setAttribute("rx", `${(e.target as HTMLInputElement).value}%`);
});

ensureEl("styleVignetteRy").on("input", (e: Event) => {
  ensureEl("vignette-rect").setAttribute("ry", `${(e.target as HTMLInputElement).value}%`);
});

ensureEl("styleVignetteBlur").on("input", (e: Event) => {
  ensureEl("vignette-rect").setAttribute("filter", `blur(${(e.target as HTMLInputElement).value}px)`);
});

ensureEl("styleScaleBar").on("input", (event: Event) => {
  const scaleBarBack = scaleBar.select<SVGGElement>("#scaleBarBack");
  if (!scaleBarBack.size()) return;

  const target = event.target as HTMLInputElement;
  const { id, value } = target;

  if (id === "styleScaleBarSize") scaleBar.attr("data-bar-size", value);
  else if (id === "styleScaleBarFontSize") scaleBar.attr("font-size", value);
  else if (id === "styleScaleBarPositionX") scaleBar.attr("data-x", value);
  else if (id === "styleScaleBarPositionY") scaleBar.attr("data-y", value);
  else if (id === "styleScaleBarLabel") scaleBar.attr("data-label", value);
  else if (id === "styleScaleBarBackgroundOpacity") scaleBarBack.attr("opacity", value);
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
    drawScaleBar(scaleBar as unknown as import("d3").Selection<SVGGElement, unknown, HTMLElement, unknown>, scale);
    fitScaleBar(
      scaleBar as unknown as import("d3").Selection<SVGGElement, unknown, HTMLElement, unknown>,
      svgWidth,
      svgHeight
    );
  }
});

ensureEl("mapFilters").on("click", applyMapFilter);

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
  if (layerIsOn("toggleBurgIcons")) drawBurgIcons();
  if (layerIsOn("toggleLabels")) {
    drawBurgLabels();
    drawStateLabels();
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
  drawScaleBar(scaleBar as unknown as import("d3").Selection<SVGGElement, unknown, HTMLElement, unknown>, scale);
  fitScaleBar(
    scaleBar as unknown as import("d3").Selection<SVGGElement, unknown, HTMLElement, unknown>,
    svgWidth,
    svgHeight
  );
}

function addStylePreset(): void {
  $("#styleSaver").dialog({ title: "Style Saver", width: "26em", position: { my: "center", at: "center", of: "svg" } });

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
    $("#styleSaver").dialog("close");
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

window.heightmapColorSchemes = heightmapColorSchemes;
window.addCustomColorScheme = addCustomColorScheme;
window.getColorScheme = getColorScheme;
window.getColor = getColor;

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
