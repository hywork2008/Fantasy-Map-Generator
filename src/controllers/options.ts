import { hsl } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { getHeightmapTemplateWeights, getInitialSettlementPatternPreset } from "../data";
import { Cultures } from "../generators/cultures-generator";
import { COA } from "../generators/emblem/generator";
import { Names } from "../generators/names-generator";
import { syncSimulationClockFromOptions } from "../generators/timeEngine";
import { Cloud } from "../io/cloud";
import { loadMapFromURL } from "../io/load";
import { StatesRenderer } from "../renderers";
import type { Emblem as RendererEmblem } from "../renderers/emblem-renderer";
import { COArenderer } from "../renderers/emblem-renderer";
import { drawCalendar, fitScaleBar } from "../renderers/index";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { viewStateStore } from "../store";
import { loadMapDialogStore } from "../store/loadMapDialogState";
import { loadMapUrlDialogStore } from "../store/loadMapUrlDialogState";
import { DEFAULT_UI_OPTIONS, type OptionsState, useOptionsState } from "../store/optionsState";
import type { Burg, Culture, Province, State } from "../types/models";
import { closeAllDialogs, closeDialogs, openAlert, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { gauss, last, minmax, P, rand, rn, rw } from "../utils";
import { isValidCanvasDimension, isValidCanvasSize, MIN_CANVAS_HEIGHT, MIN_CANVAS_WIDTH } from "../utils/canvasSize";
import { applyOption, lock, locked, stored, unlock } from "../utils/domUtils";
import { normalizeInitialSettlementPattern } from "../utils/initialSettlementPattern";
import { getElementById, getElementBySelector, getElementsBySelector, layerIsOn } from "../utils/nodeUtils";
import { cleanupData } from "../versioning";
import { exportToJson as exportToJsonModule } from "./export-json";
import { editWorld } from "./world-configurator";

// ─── Options pane show/hide ───────────────────────────────────────────────────

export function showOptions(event?: Event): void {
  viewStateStore.getState().setMenuOpen(true);
  if (event) event.stopPropagation();
}

export function hideOptions(event?: Event): void {
  viewStateStore.getState().setMenuOpen(false);
  if (event) event.stopPropagation();
}

export function toggleOptions(event?: Event): void {
  const isOpen = viewStateStore.getState().isMenuOpen;
  viewStateStore.getState().setMenuOpen(!isOpen);
  if (event) event.stopPropagation();
}

// ─── "New Map!" hover panel ───────────────────────────────────────────────────

// ─── Patreon supporters ────────────────────────────────────────────────────────

export async function showSupporters(): Promise<void> {
  const url = `${import.meta.env.BASE_URL}modules/dynamic/supporters.js`;
  const mod = (await import(/* @vite-ignore */ url)) as { supporters: string };
  const list = mod.supporters.split("\n").sort();
  const columns = view.svgWidth < 800 ? 2 : 5;

  openAlert(
    `<ul style='column-count: ${columns}; column-gap: 2em'>${list.map((n: string) => `<li>${n}</li>`).join("")}</ul>`,
    { title: "Patreon Supporters" }
  );
}

// ─── Generic option change helpers ────────────────────────────────────────────

// ─── Options content listeners ────────────────────────────────────────────────

// ─── Canvas size ───────────────────────────────────────────────────────────────

function getWindowCanvasSize(): { mapWidth: number; mapHeight: number } {
  return { mapWidth: window.innerWidth, mapHeight: window.innerHeight };
}

function mapSizeInputChange(): void {
  const options = useOptionsState.getState();
  const canvasSize = isValidCanvasSize(options)
    ? { mapWidth: options.mapWidth, mapHeight: options.mapHeight }
    : getWindowCanvasSize();
  if (!isValidCanvasSize(options)) options.setOptions(canvasSize);
  fitMapToScreen();
  localStorage.setItem("mapWidth", String(canvasSize.mapWidth));
  localStorage.setItem("mapHeight", String(canvasSize.mapHeight));

  const tooWide = canvasSize.mapWidth > view.svgWidth;
  const tooHigh = canvasSize.mapHeight > view.svgHeight;

  if (tooWide || tooHigh) {
    const message = `Canvas size is larger than window size (${view.svgWidth} x ${view.svgHeight}). It can affect performance`;
    tip(message, false, "warn", 4000);
  }
}

function restoreDefaultCanvasSize(): void {
  const options = useOptionsState.getState();
  options.setOptions({ mapWidth: window.innerWidth, mapHeight: window.innerHeight });
  localStorage.removeItem("mapHeight");
  localStorage.removeItem("mapWidth");
  fitMapToScreen();
}

export function applyGraphSize(): void {
  const options = useOptionsState.getState();
  const canvasSize = isValidCanvasSize(options)
    ? { mapWidth: options.mapWidth, mapHeight: options.mapHeight }
    : getWindowCanvasSize();
  if (!isValidCanvasSize(options)) options.setOptions(canvasSize);
  worldContext.graphWidth = canvasSize.mapWidth;
  worldContext.graphHeight = canvasSize.mapHeight;
  const { graphWidth, graphHeight } = worldContext;

  if (!viewContext?.renderMap || !viewContext.viewbox) return;

  view.landmass.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  view.oceanPattern.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  view.oceanLayers.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  viewContext
    .fogging!.selectAll("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", graphWidth)
    .attr("height", graphHeight);
  view.defs.select("mask#fog > rect").attr("width", graphWidth).attr("height", graphHeight);
  view.defs.select("mask#water > rect").attr("width", graphWidth).attr("height", graphHeight);
}

export function fitMapToScreen(): void {
  if (!viewContext?.renderMap || !viewContext.viewbox) return;
  const svgWidth = window.innerWidth;
  const svgHeight = window.innerHeight;
  Object.assign(viewContext, { svgWidth, svgHeight });

  view.svg.attr("width", String(svgWidth)).attr("height", String(svgHeight));

  const { graphWidth, graphHeight } = worldContext;
  const zoomMin = rn(Math.max(svgWidth / graphWidth, svgHeight / graphHeight), 3);
  useOptionsState.getState().setOption("zoomExtentMin", zoomMin);
  const zoomMax = useOptionsState.getState().zoomExtentMax;

  view.zoom
    .translateExtent([
      [0, 0],
      [graphWidth, graphHeight]
    ])
    .scaleExtent([zoomMin, zoomMax]);

  fitScaleBar(worldContext, viewContext, appServices, view.scaleBar, svgWidth, svgHeight);
  drawCalendar(worldContext, viewContext);
  document.dispatchEvent(new CustomEvent("fmg:fit-legend-box"));
}

document.addEventListener("fmg:fit-map-to-screen", fitMapToScreen);

function toggleTranslateExtent(el: HTMLElement): void {
  el.dataset.on = String(+!+(el.dataset.on ?? "0"));
  const on = el.dataset.on;
  const { graphWidth, graphHeight } = worldContext;
  if (+on) {
    view.zoom.translateExtent([
      [-graphWidth / 2, -graphHeight / 2],
      [graphWidth * 1.5, graphHeight * 1.5]
    ]);
  } else {
    view.zoom.translateExtent([
      [0, 0],
      [graphWidth, graphHeight]
    ]);
  }
}

// ─── Voice synthesis ──────────────────────────────────────────────────────────

function testSpeaker(): void {
  const store = useOptionsState.getState();
  const text = `${store.mapName}, ${store.year} ${store.era}`;
  const speaker = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  if (voices.length) {
    const selectedVoice = store.speakerVoice
      ? (voices.find(v => v.name === store.speakerVoice) ?? voices[0])
      : voices[0];
    speaker.voice = selectedVoice;
  }
  speechSynthesis.speak(speaker);
}

// ─── Seed / map history ────────────────────────────────────────────────────────

function generateMapWithSeed(): void {
  if (useOptionsState.getState().seed === worldContext.seed) {
    tip("The current map already has this seed", false, "error");
    return;
  }
  regeneratePrompt({ seed: useOptionsState.getState().seed });
}

export function showSeedHistoryDialog(): void {
  const lines = worldContext.mapHistory.map((h, i) => {
    const created = new Date(h.created).toLocaleTimeString();
    const button = `<button type="button" aria-label="Restore seed" data-tip="Click to generate a map with this seed" onclick="restoreSeed(${i})" class="icon-btn icon-history optionsSeedRestore"></button>`;
    return `<li>Seed: ${h.seed} ${button}. Size: ${h.width}x${h.height}. Template: ${h.template}. Created: ${created}</li>`;
  });
  openAlert(`<ol>${lines.join("")}</ol>`, { title: "Seed history" });
}

export function restoreSeed(id: number): void {
  const { seed: s, width, height, template } = worldContext.mapHistory[id];
  useOptionsState.getState().setOptions({ seed: s, mapWidth: width, mapHeight: height, template });

  if (locked("template")) unlock("template");

  regeneratePrompt({ seed: s });
}

export function copyMapURL(): void {
  const lockedCount = getElementsBySelector<HTMLElement>("i.icon-lock").length;
  const { graphWidth, graphHeight } = worldContext;
  const search = `?seed=${useOptionsState.getState().seed}&width=${graphWidth}&height=${graphHeight}${lockedCount ? "" : "&options=default"}`;
  navigator.clipboard
    .writeText(location.host + location.pathname + search)
    .then(() => tip("Map URL is copied to clipboard", false, "success", 3000))
    .catch((err: Error) => tip(`Could not copy URL: ${err}`, false, "error", 5000));
}

export const cellsDensityMap: Record<number, number> = {
  1: 1000,
  2: 2000,
  3: 5000,
  4: 10000,
  5: 20000,
  6: 30000,
  7: 40000,
  8: 50000,
  9: 60000,
  10: 70000,
  11: 80000,
  12: 90000,
  13: 100000
};

export function changeCellsDensity(value: number): void {
  useOptionsState.getState().setOptions({ points: value });
  // const cells = cellsDensityMap[value] || +(10000);
  // pointsOutputFormatted.value = `${cells / 1000}K`;
  // pointsOutputFormatted.style.color = getCellsDensityColor(cells);
}

export function getCellsDensityColor(cells: number): string {
  return cells > 50000 ? "#b12117" : cells !== 10000 ? "#dfdf12" : "#053305";
}

// ─── Options changes ───────────────────────────────────────────────────────────

function changeCultureSet(): void {
  // const max = (culturesSet.selectedOptions[0] as HTMLElement).dataset.max!;
  /* removed */
  /* removed */
}

function changeEmblemShape(emblemShape: string): void {
  const specificShape = ["culture", "state", "random"].includes(emblemShape) ? null : emblemShape;
  if (emblemShape === "random")
    (worldContext.pack.cultures as Culture[])
      .filter(c => !c.removed)
      .forEach(c => {
        c.shield = Cultures.getRandomShield();
      });

  const rerenderCOA = (id: string, coa: RendererEmblem) => {
    const coaEl = getElementById<SVGGElement>(id);
    if (!coaEl) return;
    coaEl.remove();
    COArenderer.trigger(id, coa);
  };

  (worldContext.pack.states as State[]).forEach(state => {
    if (!state.i || state.removed || !state.coa || state.coa.custom) return;
    const newShield = specificShape || COA.getShield(state.culture);
    if (newShield === state.coa.shield) return;
    state.coa.shield = newShield;
    rerenderCOA(`stateCOA${state.i}`, state.coa);
  });

  (worldContext.pack.provinces as Province[]).forEach(province => {
    if (!province.i || province.removed || !province.coa || province.coa.custom) return;
    const culture = worldContext.pack.cells.culture[province.center];
    const newShield = specificShape || COA.getShield(culture, province.state);
    if (newShield === province.coa.shield) return;
    province.coa.shield = newShield;
    rerenderCOA(`provinceCOA${province.i}`, province.coa);
  });

  worldContext.pack.burgs.forEach((burg: Burg) => {
    if (!burg.i || burg.removed || !burg.coa || burg.coa.custom) return;
    const newShield = specificShape || COA.getShield(burg.culture ?? 0, burg.state);
    if (newShield === burg.coa.shield) return;
    burg.coa.shield = newShield;
    rerenderCOA(`burgCOA${burg.i}`, burg.coa);
  });
}

function changeStatesNumber(value: string): void {
  /* statesNumber style removed */
  view.burgLabels.select("#capital").attr("data-size", Math.max(rn(6 - +value / 20), 3));
  view.labels.select("#countries").attr("data-size", Math.max(rn(18 - +value / 6), 4));
}

function changeUiSize(value: number): void {
  if (Number.isNaN(value) || value < 0.5) return;

  const max = getUImaxSize();
  if (value > max) value = max;

  useOptionsState.getState().setOptions({ uiSize: value });
  const newSize = `${rn(value * 10, 2)}px`;
  getElementBySelector<HTMLElement>("body")!.style.fontSize = newSize;
  document.documentElement.style.fontSize = newSize;
}

function getUImaxSize(): number {
  return rn(Math.min(window.innerHeight / 465, window.innerWidth / 302), 1);
}

function changeTooltipSize(value: string): void {
  const tooltip = getElementById("tooltip");
  if (tooltip) tooltip.style.fontSize = `calc(${value}px + 0.5vw)`;
}

// ─── Theme / color ─────────────────────────────────────────────────────────────

function restoreDefaultThemeColor(): void {
  localStorage.removeItem("themeColor");
  changeDialogsTheme(DEFAULT_UI_OPTIONS.themeColor, String(useOptionsState.getState().transparency));
}

export function changeThemeHue(hue: string): void {
  const { s, l } = hsl(useOptionsState.getState().themeColor);
  const newColor = hsl(+hue, s, l).formatHex();
  changeDialogsTheme(newColor, String(useOptionsState.getState().transparency));
}

function changeDialogsTheme(themeColor: string, transparency: string): void {
  useOptionsState.getState().setOptions({ transparency: +transparency });
  const alpha = (100 - +transparency) / 100;
  const alphaReduced = Math.min(alpha + 0.3, 1);

  const resolvedThemeColor = themeColor || DEFAULT_UI_OPTIONS.themeColor;
  const { h, s, l } = hsl(resolvedThemeColor);
  useOptionsState.getState().setOptions({ themeColor: resolvedThemeColor });

  const getRGBA = (hue: number, saturation: number, lightness: number, a: number): string => {
    return hsl(hue, saturation, lightness, a).toString();
  };

  const theme: Array<{
    name: string;
    value?: number;
    h?: number;
    s?: number;
    l?: number;
    alpha?: number;
    alphaReduced?: number;
  }> = [
    { name: "--bg-opacity", value: alpha },
    { name: "--bg-main", h, s, l, alpha },
    { name: "--bg-lighter", h, s, l: l + 0.02, alpha },
    { name: "--bg-light", h, s: s - 0.02, l: l + 0.06, alpha },
    { name: "--bg-light-solid", h, s: s - 0.02, l: l + 0.06, alpha: 1 },
    { name: "--light-solid", h, s: s + 0.01, l: l + 0.05, alpha: 1 },
    { name: "--dark-solid", h, s, l: l - 0.2, alpha: 1 },
    { name: "--header", h, s, l: l - 0.03, alpha: alphaReduced },
    { name: "--header-active", h, s, l: l - 0.09, alpha: alphaReduced },
    { name: "--bg-disabled", h, s: s - 0.04, l: l + 0.09, alphaReduced },
    { name: "--bg-dialogs", h: 0, s: 0, l: 0.98, alpha }
  ];

  const sx = document.documentElement.style;
  theme.forEach(({ name, value, h: th, s: ts, l: tl, alpha: ta }) => {
    if (value !== undefined) sx.setProperty(name, String(value));
    else sx.setProperty(name, getRGBA(th!, ts!, tl!, ta!));
  });
}

// ─── Google translate ─────────────────────────────────────────────────────────

function loadGoogleTranslate(): void {
  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=initGoogleTranslate";
  script.onload = () => {
    getElementById<HTMLElement>("loadGoogleTranslateButton")?.remove();

    getElementById<HTMLElement>("mapLayers")
      ?.querySelectorAll("button")
      .forEach(el => {
        el.querySelectorAll("u").forEach(u => {
          u.replaceWith(u.textContent ?? "");
        });
      });
  };

  document.head.appendChild(script);
}

export function initGoogleTranslate(): void {
  const google = (
    window as Window &
      typeof globalThis & {
        google: {
          translate: {
            TranslateElement: new (opts: object, id: string) => undefined & { InlineLayout: Record<string, unknown> };
          };
        };
      }
  ).google;
  new google.translate.TranslateElement(
    {
      pageLanguage: "en",
      layout: (google.translate.TranslateElement as unknown as { InlineLayout: Record<string, unknown> }).InlineLayout
        .VERTICAL
    },
    "google_translate_element"
  );
}

function resetLanguage(): void {
  const languageSelect = getElementBySelector<HTMLSelectElement>("#google_translate_element select");
  if (!languageSelect?.value) return;

  languageSelect.value = "en";
  (languageSelect as HTMLSelectElement & { handleChange: (event: Event) => void }).handleChange(new Event("change"));

  languageSelect.value = "en";
  (languageSelect as HTMLSelectElement & { handleChange: (event: Event) => void }).handleChange(new Event("change"));
}

// ─── Zoom extent ──────────────────────────────────────────────────────────────

function changeZoomExtent(value: string): void {
  const store = useOptionsState.getState();
  let curMin = store.zoomExtentMin;
  let curMax = store.zoomExtentMax;
  if (curMin > curMax) [curMin, curMax] = [curMax, curMin];
  const min = Math.max(curMin, 0.01);
  const max = Math.min(curMax, 200);
  store.setOptions({ zoomExtentMin: min, zoomExtentMax: max });
  view.zoom.scaleExtent([min, max]);
  const scale = minmax(+value, 0.01, 200);
  view.zoom.scaleTo(view.svg, scale);
}

function restoreDefaultZoomExtent(): void {
  const { zoomExtentMin, zoomExtentMax } = DEFAULT_UI_OPTIONS;
  useOptionsState.getState().setOptions({ zoomExtentMin, zoomExtentMax });
  view.zoom.scaleExtent([zoomExtentMin, zoomExtentMax]).scaleTo(view.svg, zoomExtentMin);
}

// ─── Apply stored options ─────────────────────────────────────────────────────

export function applyStoredOptions(): void {
  const optionsStore = useOptionsState.getState();
  const storedMapWidth = stored("mapWidth");
  const storedMapHeight = stored("mapHeight");
  const storedCanvasSize = {
    mapWidth: Number(storedMapWidth),
    mapHeight: Number(storedMapHeight)
  };

  if (storedMapWidth === null || storedMapHeight === null || !isValidCanvasSize(storedCanvasSize)) {
    optionsStore.setOptions(getWindowCanvasSize());
    localStorage.removeItem("mapWidth");
    localStorage.removeItem("mapHeight");
  } else {
    optionsStore.setOptions(storedCanvasSize);
  }

  const heightmapId = stored("template");
  if (heightmapId) {
    optionsStore.setOption("template", heightmapId);
  }

  const loadedOptions: Partial<Omit<OptionsState, "setOption" | "setOptions">> = {};

  // This list includes every OptionsState-backed lock control and the
  // pre-existing non-lock preferences that this startup path owns. Keep the
  // lock entries aligned with every LockIconButton: a lock promises that its
  // latest value survives a browser reload.
  const persistedOptionKeys = [
    "seed",
    "points",
    "mapName",
    "year",
    "era",
    "historicalPeriod",
    "cultures",
    "culturesSet",
    "statesNumber",
    "diplomacyHistoryAttempts",
    "provincesRatio",
    "sizeVariety",
    "growthRate",
    "initialPopulationSaturation",
    "initialSettlementPattern",
    "biomeRegionProfile",
    "manors",
    "religionsNumber",
    "stateLabelsMode",
    "demographicBirthRate",
    "demographicChildMortalityRate",
    "warFrequency",
    "threatCalculation",
    "emblemShape",
    "distanceScale",
    "mapSize",
    "latitude",
    "longitude",
    "prec",
    "uiSize",
    "tooltipSize",
    "themeColor",
    "transparency",
    // This setting is stored by the legacy control without a React lock button.
    "gunpowderEraEnabled"
  ] as const satisfies readonly (keyof Omit<OptionsState, "setOption" | "setOptions">)[];

  type PersistedOptionKey = (typeof persistedOptionKeys)[number];
  const isPersistedOptionKey = (key: string): key is PersistedOptionKey =>
    (persistedOptionKeys as readonly string[]).includes(key);

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key === "speakerVoice") continue;

    const value = stored(key)!;

    if (key === "points") changeCellsDensity(+value);
    if (key === "distanceScale") worldContext.distanceScale = +value;

    if (key.slice(0, 5) === "style") applyOption(getElementById<HTMLSelectElement>("stylePreset")!, key, key.slice(5));

    if (isPersistedOptionKey(key)) {
      const parsedValue = key === "gunpowderEraEnabled" ? value === "true" : Number.isNaN(+value) ? value : +value;
      (loadedOptions as Record<PersistedOptionKey, string | number | boolean>)[key] = parsedValue;
    }
  }
  if (typeof loadedOptions.initialSettlementPattern === "string") {
    loadedOptions.initialSettlementPattern = normalizeInitialSettlementPattern(loadedOptions.initialSettlementPattern);
    // Settlement patterns have a recommended population saturation. Restore
    // that derived value unless the user explicitly locked a custom one.
    if (!locked("initialPopulationSaturation")) {
      loadedOptions.initialPopulationSaturation = getInitialSettlementPatternPreset(
        loadedOptions.initialSettlementPattern
      ).initialPopulationSaturation;
    }
  }
  optionsStore.setOptions(loadedOptions);

  // Remove stale heightExponent values that are outside the valid slider range (1–5).
  // These can accumulate when the slider defaults incorrectly, causing all land cells to become glacier.
  const storedHeightExp = stored("heightExponent");
  if (storedHeightExp !== null) {
    const exp = +storedHeightExp;
    if (!Number.isFinite(exp) || exp < 1 || exp > 5) localStorage.removeItem("heightExponent");
  }

  if (stored("winds"))
    worldContext.options.winds = stored("winds")!.split(",").map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number
    ];
  if (stored("temperatureEquator")) worldContext.options.temperatureEquator = +stored("temperatureEquator")!;
  if (stored("temperatureNorthPole")) worldContext.options.temperatureNorthPole = +stored("temperatureNorthPole")!;
  if (stored("temperatureSouthPole")) worldContext.options.temperatureSouthPole = +stored("temperatureSouthPole")!;
  if (stored("military")) worldContext.options.military = JSON.parse(stored("military")!);
  if (stored("gunpowderEraEnabled")) {
    worldContext.options.gunpowderEraEnabled = stored("gunpowderEraEnabled") === "true";
  }

  if (stored("tooltipSize")) changeTooltipSize(stored("tooltipSize")!);
  if (stored("regions")) changeStatesNumber(stored("regions")!);

  if (stored("uiSize")) changeUiSize(+stored("uiSize")!);
  else changeUiSize(minmax(rn(optionsStore.mapWidth / 1280, 1), 1, 2.5));

  const params = new URL(window.location.href).searchParams;
  const width = Number(params.get("width"));
  const height = Number(params.get("height"));
  const hasValidWidth = isValidCanvasDimension(width, MIN_CANVAS_WIDTH);
  const hasValidHeight = isValidCanvasDimension(height, MIN_CANVAS_HEIGHT);
  if (hasValidWidth || hasValidHeight) {
    optionsStore.setOptions({
      mapWidth: hasValidWidth ? width : optionsStore.mapWidth,
      mapHeight: hasValidHeight ? height : optionsStore.mapHeight
    });
  }

  const transparency = stored("transparency") ?? String(DEFAULT_UI_OPTIONS.transparency);
  const themeColor = stored("themeColor") ?? DEFAULT_UI_OPTIONS.themeColor;
  changeDialogsTheme(themeColor, transparency);

  setRendering(optionsStore.shapeRendering);
  worldContext.options.stateLabelsMode = optionsStore.stateLabelsMode as "auto" | "short" | "full";
}

// ─── Randomize options ─────────────────────────────────────────────────────────

export function randomizeOptions(): void {
  const randomize = new URL(window.location.href).searchParams.get("options") === "default";

  if (randomize || !locked("points")) changeCellsDensity(4);
  if (randomize || !locked("template")) randomizeHeightmapTemplate();
  if (randomize || !locked("statesNumber"))
    useOptionsState.getState().setOptions({ statesNumber: Math.round(gauss(18, 5, 2, 30)) });
  if (randomize || !locked("provincesRatio"))
    useOptionsState.getState().setOptions({ provincesRatio: Math.round(gauss(20, 10, 20, 100)) });
  if (randomize || !locked("manors")) {
    useOptionsState.getState().setOptions({ manors: 1000 });
  }
  if (randomize || !locked("religionsNumber"))
    useOptionsState.getState().setOptions({ religionsNumber: Math.round(gauss(6, 3, 2, 10)) });
  if (randomize || !locked("sizeVariety"))
    useOptionsState.getState().setOptions({ sizeVariety: gauss(4, 2, 0, 10, 1) });
  if (randomize || !locked("growthRate"))
    useOptionsState.getState().setOptions({ growthRate: rn(1 + Math.random(), 1) });
  if (randomize || !locked("cultures"))
    useOptionsState.getState().setOptions({ cultures: Math.round(gauss(12, 3, 5, 30)) });
  if (randomize || !locked("culturesSet")) randomizeCultureSet();

  if (randomize || !locked("temperatureEquator")) worldContext.options.temperatureEquator = gauss(25, 7, 20, 35, 0);
  if (randomize || !locked("temperatureNorthPole"))
    worldContext.options.temperatureNorthPole = gauss(-25, 7, -40, 10, 0);
  if (randomize || !locked("temperatureSouthPole"))
    worldContext.options.temperatureSouthPole = gauss(-15, 7, -40, 10, 0);
  if (randomize || !locked("prec")) useOptionsState.getState().setOption("prec", Math.round(gauss(100, 40, 5, 500)));

  if (randomize || !locked("distanceScale")) {
    const dsv = gauss(3, 1, 1, 5);
    useOptionsState.getState().setOption("distanceScale", dsv);
    worldContext.distanceScale = dsv;
  }

  generateEra();
}

function randomizeHeightmapTemplate(): void {
  const { templateRandomization } = useOptionsState.getState();
  const template = rw(getHeightmapTemplateWeights(templateRandomization));
  useOptionsState.getState().setOption("template", template);
}

function randomizeCultureSet(): void {
  const sets: Record<string, number> = {
    world: 10,
    european: 10,
    oriental: 2,
    english: 5,
    antique: 3,
    highFantasy: 11,
    darkFantasy: 3,
    random: 1
  };
  const chosen = rw(sets);
  useOptionsState.getState().setOption("culturesSet", chosen);
  changeCultureSet();
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function setRendering(value: string): void {
  // viewbox might be undefined if we're in headless mode or before SVG is initialized
  if (!viewContext?.renderMap || !viewContext.viewbox) return;
  const { viewbox, coastline, statesHalo } = viewContext;
  viewbox.attr("shape-rendering", value);

  if (value === "optimizeSpeed") {
    coastline.select("#sea_island").style("filter", "none");
    statesHalo.style("display", "none");
  } else {
    coastline.select("#sea_island").style("filter", null);
    statesHalo.style("display", null);
    if (worldContext.pack.cells && statesHalo.selectAll("*").size() === 0)
      StatesRenderer.render(worldContext, viewContext, appServices);
  }
}

// ─── Era ──────────────────────────────────────────────────────────────────────

function generateEra(): void {
  const store = useOptionsState.getState();
  if (!stored("year")) store.setOptions({ year: rand(100, 2000) });
  if (!stored("era"))
    store.setOptions({
      era: `${Names.getBaseShort(P(0.7) ? 1 : rand(worldContext.nameBases.length))} Era`
    });

  // Re-read after the conditional setOptions() calls above — `store` is a snapshot
  // taken before them, so store.year/era would still be the pre-randomization values.
  const { year, era } = useOptionsState.getState();
  worldContext.options.year = year;
  worldContext.options.era = era;
  worldContext.options.eraShort = worldContext.options.era
    .split(" ")
    .map((w: string) => w[0].toUpperCase())
    .join("");
}

function regenerateEra(): void {
  unlock("era");
  const era = `${Names.getBaseShort(P(0.7) ? 1 : rand(worldContext.nameBases.length))} Era`;
  useOptionsState.getState().setOptions({ era });
  worldContext.options.era = era;
  worldContext.options.eraShort = worldContext.options.era
    .split(" ")
    .map((w: string) => w[0].toUpperCase())
    .join("");
}

export function changeYear(): void {
  // state managed by react, just sync global
  worldContext.options.year = useOptionsState.getState().year;
}

export function changeEra(): void {
  // state managed by react, just sync global
  lock("era");
  worldContext.options.era = useOptionsState.getState().era;
}

function openTemplateSelectionDialog(): void {
  import("./heightmap-selection").then(m => m.openHeightmapSelection());
}

// ─── Sticked menu ─────────────────────────────────────────────────────────────

export function regeneratePrompt(opts?: { seed?: string }): void {
  if (view.customization) {
    tip("New map cannot be generated when edit mode is active, please exit the mode and retry", false, "error");
    return;
  }
  // A map loaded before the initial generation has no generated-map history.
  // In that case there is no creation timestamp to compare, so proceed with
  // the requested replacement instead of dereferencing an absent entry.
  const latestMap = last(worldContext.mapHistory);
  if (!latestMap) {
    document.dispatchEvent(new CustomEvent("fmg:regenerate-map", { detail: opts }));
    return;
  }

  const workingTime = (Date.now() - latestMap.created) / 60000;
  if (workingTime < 1) {
    document.dispatchEvent(new CustomEvent("fmg:regenerate-map", { detail: opts }));
    return;
  }

  openConfirm(
    `Are you sure you want to generate a new map?<br />All unsaved changes made to the current map will be lost`,
    {
      title: "Generate new map",
      confirm: "Generate",
      cancel: "Cancel",
      onConfirm: () => {
        closeAllDialogs();
        document.dispatchEvent(new CustomEvent("fmg:regenerate-map", { detail: opts }));
      }
    }
  );
}

// ─── Save / export / load panes ───────────────────────────────────────────────

export function showSavePane(): void {
  openDialog("saveMapData", { title: "Save map" });
}

export function copyLinkToClickboard(): void {
  const stateLink = loadMapDialogStore.getState().sharableLinkUrl;
  const domLink = getElementById<HTMLAnchorElement>("sharableLink")?.getAttribute("href") ?? "";
  const link = stateLink || (domLink && domLink !== "#" ? domLink : "");

  if (!link) {
    tip("Generate a sharable Dropbox link first", true, "warn", 3000);
    return;
  }

  navigator.clipboard
    .writeText(link)
    .then(() => tip("Link is copied to the clipboard", true, "success", 8000))
    .catch(() => tip("Failed to copy the link", true, "error", 3000));
}

export function showExportPane(): void {
  openDialog("exportMapData", { title: "Export map data" });
}

export function exportToJson(type: string): void {
  exportToJsonModule(type);
}

export async function showLoadPane(): Promise<void> {
  openDialog("loadMapData", { title: "Load map" });

  const dropbox = Cloud.providers.dropbox;
  if (dropbox.api) {
    loadMapDialogStore.getState().setDropboxLoading();

    const files = await dropbox.list();

    if (!files) {
      loadMapDialogStore.getState().setDropboxNoFiles("Save files to Dropbox first");
      return;
    }

    loadMapDialogStore.getState().setDropboxFiles(files);

    return;
  }

  loadMapDialogStore.getState().setDropboxDisconnected();
}

export async function connectToDropbox(): Promise<void> {
  await Cloud.providers.dropbox.initialize();
  if (Cloud.providers.dropbox.api) showLoadPane();
}

export function loadURL(): void {
  loadMapUrlDialogStore.getState().open({
    onLoad: (url: string) => {
      loadMapFromURL(url, 0);
    }
  });
}

// ─── PNG tiles export ─────────────────────────────────────────────────────────

export function openExportToPngTiles(): void {
  closeDialogs();

  openDialog("exportToPngTilesScreen", {
    title: "Download tiles",
    width: "23em"
  });
}

export function initOptions(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices): void {
  // React options listeners
  document.addEventListener("react-map-size-change", mapSizeInputChange);

  document.addEventListener("react-generate-map-with-seed", (e: Event) => {
    const detail = (e as CustomEvent).detail;
    // Update legacy inputs in case other parts of the system read from them
    useOptionsState.getState().setOptions({ seed: detail.seed });
    generateMapWithSeed();
  });

  document.addEventListener("react-change-ui-size", (e: Event) => {
    changeUiSize((e as CustomEvent).detail.size);
  });

  document.addEventListener("react-restore-theme", restoreDefaultThemeColor);

  document.addEventListener("react-change-theme", (e: Event) => {
    const { color, transparency } = (e as CustomEvent).detail;
    changeDialogsTheme(color, transparency);
  });

  document.addEventListener("react-regenerate-era", regenerateEra);

  document.addEventListener("react-change-tooltip-size", (e: Event) => {
    changeTooltipSize(String((e as CustomEvent).detail.size));
  });

  document.addEventListener("react-open-template-selection", openTemplateSelectionDialog);

  document.addEventListener("react-change-emblem-shape", (e: Event) => {
    changeEmblemShape((e as CustomEvent).detail.shape);
  });

  document.addEventListener("react-test-speaker", testSpeaker);

  document.addEventListener("react-regenerate-map-name", () => {
    Names.getMapName(true);
  });

  document.addEventListener("react-change-year", (e: Event) => {
    worldContext.options.year = (e as CustomEvent).detail.year;
    syncSimulationClockFromOptions();
  });

  document.addEventListener("react-change-era", (e: Event) => {
    lock("era");
    worldContext.options.era = (e as CustomEvent).detail.era;
    worldContext.options.eraShort = (worldContext.options.era ?? "")
      .split(" ")
      .map((w: string) => w[0]?.toUpperCase() ?? "")
      .join("");
    syncSimulationClockFromOptions();
  });

  document.addEventListener("react-change-historical-period", (e: Event) => {
    lock("historicalPeriod");
    worldContext.options.historicalPeriod = (e as CustomEvent).detail.period as
      | "earlyMedieval"
      | "highMedieval"
      | "lateMedieval";
  });

  document.addEventListener("react-change-state-labels-mode", (e: Event) => {
    worldContext.options.stateLabelsMode = (e as CustomEvent).detail.mode as "auto" | "short" | "full";
  });

  document.addEventListener("react-change-cultures-set", () => {
    const culturesSetMaxMap: Record<string, number> = {
      world: 32,
      european: 15,
      oriental: 13,
      english: 10,
      antique: 10,
      highFantasy: 17,
      darkFantasy: 18,
      random: 100
    };
    const { culturesSet, cultures } = useOptionsState.getState();
    const max = culturesSetMaxMap[culturesSet] ?? 100;
    if (cultures > max) useOptionsState.getState().setOption("cultures", max);
  });

  document.addEventListener("react-restore-default-zoom-extent", restoreDefaultZoomExtent);

  document.addEventListener("react-change-zoom-extent", (e: Event) => {
    changeZoomExtent(String((e as CustomEvent<{ value: string }>).detail.value));
  });

  document.addEventListener("react-set-translate-extent", (e: Event) => {
    const { on } = (e as CustomEvent<{ on: boolean }>).detail;
    const { graphWidth, graphHeight } = worldContext;
    if (on) {
      view.zoom.translateExtent([
        [-graphWidth / 2, -graphHeight / 2],
        [graphWidth * 1.5, graphHeight * 1.5]
      ]);
    } else {
      view.zoom.translateExtent([
        [0, 0],
        [graphWidth, graphHeight]
      ]);
    }
  });

  document.addEventListener("react-change-shape-rendering", (e: Event) => {
    const { value } = (e as CustomEvent<{ value: string }>).detail;
    useOptionsState.getState().setOption("shapeRendering", value as OptionsState["shapeRendering"]);
    setRendering(value);
  });

  document.addEventListener("react-change-population-rendering-mode", () => {
    if (layerIsOn("togglePopulation")) {
      import("../renderers").then(({ PopulationRenderer }) => {
        PopulationRenderer.render(worldContext, viewContext, appServices);
      });
    }
  });

  document.addEventListener("react-change-heightmap-rendering-mode", () => {
    // This choice applies only to the legacy SVG renderer. Hybrid mode keeps its deck.gl terrain path.
    if (viewContext.renderMode !== "svg" || !layerIsOn("toggleHeight")) return;
    import("../renderers").then(({ HeightmapRenderer }) => {
      HeightmapRenderer.render(worldContext, viewContext, appServices);
    });
  });

  document.addEventListener("react-change-danger-rendering-mode", () => {
    if (layerIsOn("toggleDanger")) {
      import("../renderers").then(({ DangerRenderer }) => {
        DangerRenderer.render(worldContext, viewContext, appServices);
      });
    }
  });

  document.addEventListener("react-change-combat-deaths-rendering-mode", () => {
    if (layerIsOn("toggleCombatDeaths")) {
      import("../renderers").then(({ CombatDeathsRenderer }) => {
        CombatDeathsRenderer.render(worldContext, viewContext, appServices);
      });
    }
  });

  document.addEventListener("react-load-google-translate", loadGoogleTranslate);
  document.addEventListener("react-reset-language", resetLanguage);
  document.addEventListener("react-open-world-configurator", editWorld);
  document.addEventListener("react-cleanup-data", () => {
    void cleanupData();
  });

  // Note: For other sliders (points, cultures, etc.), their changes are applied on map generation.
  // If immediate change is needed, add specific react- events for them and call the corresponding functions
  // like changeCellsDensity(), changeStatesNumber(), etc.

  // View mode / 3D handled via React
}

export {
  changeZoomExtent,
  loadGoogleTranslate,
  resetLanguage,
  restoreDefaultCanvasSize,
  restoreDefaultZoomExtent,
  testSpeaker,
  toggleTranslateExtent
};

document.addEventListener("fmg:show-export-pane", () => showExportPane());
