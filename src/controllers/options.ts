import { hsl } from "d3";
import { THEME_COLOR } from "../config/constants";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { exportToPngTiles } from "../io/export";
import { loadMapFromURL, uploadMap } from "../io/load";
import type { Burg } from "../modules/burgs-generator";
import type { Culture } from "../modules/cultures-generator";
import { Cultures } from "../modules/cultures-generator";
import { COA } from "../modules/emblem/generator";
import type { Emblem as RendererEmblem } from "../modules/emblem/renderer";
import { COArenderer } from "../modules/emblem/renderer";
import type { Province } from "../modules/provinces-generator";
import type { State } from "../modules/states-generator";
import { StatesRenderer } from "../renderers";
import { fitScaleBar } from "../renderers/index";
import { type OptionsState, useOptionsState } from "../store/optionsState";
import {
  closeAllDialogs,
  closeDialog,
  closeDialogs,
  isDialogOpen,
  openConfirm,
  openDialog,
  openRichDialog
} from "../ui/dialogs/dialogService";
import { ensureEl, gauss, last, minmax, P, rand, rn, rw } from "../utils";
import { fitLegendBox, unselect } from "./editors";
import { exportToJson as exportToJsonModule } from "./export-json";

// ─── Init jQuery draggable / disable-selection ────────────────────────────────

import { resetZoom } from "../actions";
import { appServices } from "../context/appServices";
import { Names } from "../modules/names-generator";
import { viewStateStore } from "../store";
import { alertMessage } from "../utils/alertMessageEl";
import { applyOption, clearMainTip, fitContent, lock, locked, stored, tip, unlock } from "../utils/uiHelpers";

// ─── Options pane show/hide ───────────────────────────────────────────────────

export function showOptions(event?: Event): void {
  if (!stored("disable_click_arrow_tooltip")) {
    clearMainTip();
    localStorage.setItem("disable_click_arrow_tooltip", "true");
    const trigger = document.getElementById("optionsTrigger");
    if (trigger) trigger.classList.remove("glow");
  }

  const regen = document.getElementById("regenerate");
  if (regen) regen.style.display = "none";
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
  const columns = window.innerWidth < 800 ? 2 : 5;

  openRichDialog({
    title: "Patreon Supporters",
    content: `<ul style='column-count: ${columns}; column-gap: 2em'>${list.map((n: string) => `<li>${n}</li>`).join("")}</ul>`
  });
}

// ─── Generic option change helpers ────────────────────────────────────────────

function storeValueIfRequired(ev: Event): void {
  const target = ev.target as HTMLElement;
  if ((target as HTMLInputElement).dataset?.stored) lock((target as HTMLInputElement).dataset.stored!);
}

function updateOutputToFollowInput(ev: Event): void {
  const target = ev.target as HTMLInputElement;
  const id = target.id;
  const value = target.value;

  if (id === "manorsInput") {
    useOptionsState.getState().setOptions({ manors: value === "1000" ? 1000 : +value });
    return;
  }

  if (id.slice(-5) === "Input") {
    const output = document.getElementById(`${id.slice(0, -5)}Output`) as HTMLInputElement | HTMLSelectElement | null;
    if (output) output.value = value;
  } else if (id.slice(-6) === "Output") {
    const input = document.getElementById(`${id.slice(0, -6)}Input`) as HTMLInputElement | HTMLSelectElement | null;
    if (input) input.value = value;
  }
}

// ─── Options content listeners ────────────────────────────────────────────────

// ─── Canvas size ───────────────────────────────────────────────────────────────

function mapSizeInputChange(): void {
  const options = useOptionsState.getState();
  fitMapToScreen();
  localStorage.setItem("mapWidth", String(options.mapWidth));
  localStorage.setItem("mapHeight", String(options.mapHeight));

  const tooWide = options.mapWidth > window.innerWidth;
  const tooHigh = options.mapHeight > window.innerHeight;

  if (tooWide || tooHigh) {
    const message = `Canvas size is larger than window size (${window.innerWidth} x ${window.innerHeight}). It can affect performance`;
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
  worldContext.graphWidth = options.mapWidth;
  worldContext.graphHeight = options.mapHeight;
  const { graphWidth, graphHeight } = worldContext;

  viewContext.landmass.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  viewContext.oceanPattern
    .select("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", graphWidth)
    .attr("height", graphHeight);
  viewContext.oceanLayers
    .select("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", graphWidth)
    .attr("height", graphHeight);
  viewContext
    .fogging!.selectAll("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", graphWidth)
    .attr("height", graphHeight);
  viewContext.defs.select("mask#fog > rect").attr("width", graphWidth).attr("height", graphHeight);
  viewContext.defs.select("mask#water > rect").attr("width", graphWidth).attr("height", graphHeight);
}

export function fitMapToScreen(): void {
  const options = useOptionsState.getState();
  const svgWidth = Math.min(options.mapWidth, window.innerWidth);
  const svgHeight = Math.min(options.mapHeight, window.innerHeight);
  Object.assign(viewContext, { svgWidth, svgHeight });

  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.setAttribute("width", String(svgWidth));
    mapEl.setAttribute("height", String(svgHeight));
  }

  const { graphWidth, graphHeight } = worldContext;
  const zoomMin = rn(Math.max(svgWidth / graphWidth, svgHeight / graphHeight), 3);
  useOptionsState.getState().setOption("zoomExtentMin", zoomMin);
  const zoomMax = useOptionsState.getState().zoomExtentMax;

  viewContext.zoom
    .translateExtent([
      [0, 0],
      [graphWidth, graphHeight]
    ])
    .scaleExtent([zoomMin, zoomMax]);

  fitScaleBar(worldContext, viewContext, appServices, viewContext.scaleBar, svgWidth, svgHeight);
  if (typeof fitLegendBox !== "undefined") fitLegendBox();
}

document.addEventListener("fmg:fit-map-to-screen", fitMapToScreen);

function toggleTranslateExtent(el: HTMLElement): void {
  el.dataset.on = String(+!+(el.dataset.on ?? "0"));
  const on = el.dataset.on;
  const { graphWidth, graphHeight } = worldContext;
  if (+on) {
    viewContext.zoom.translateExtent([
      [-graphWidth / 2, -graphHeight / 2],
      [graphWidth * 1.5, graphHeight * 1.5]
    ]);
  } else {
    viewContext.zoom.translateExtent([
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
    const button = `<i data-tip="Click to generate a map with this seed" onclick="restoreSeed(${i})" class="icon-history optionsSeedRestore"></i>`;
    return `<li>Seed: ${h.seed} ${button}. Size: ${h.width}x${h.height}. Template: ${h.template}. Created: ${created}</li>`;
  });
  openRichDialog({
    title: "Seed history",
    content: `<ol style="margin: 0; padding-left: 1.5em">${lines.join("")}</ol>`
  });
}

export function restoreSeed(id: number): void {
  const { seed: s, width, height, template } = worldContext.mapHistory[id];
  useOptionsState.getState().setOptions({ seed: s, mapWidth: width, mapHeight: height, template });

  if (locked("template")) unlock("template");

  regeneratePrompt({ seed: s });
}

export function copyMapURL(): void {
  const lockedCount = document.querySelectorAll("i.icon-lock").length;
  const { graphWidth, graphHeight } = worldContext;
  const search = `?seed=${useOptionsState.getState().seed}&width=${graphWidth}&height=${graphHeight}${lockedCount ? "" : "&options=default"}`;
  navigator.clipboard
    .writeText(location.host + location.pathname + search)
    .then(() => tip("Map URL is copied to clipboard", false, "success", 3000))
    .catch((err: Error) => tip(`Could not copy URL: ${err}`, false, "error", 5000));
}

// ─── Cells density ─────────────────────────────────────────────────────────────

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
  const image = document.getElementById("emblemShapeImage") as SVGPathElement | null;
  const shapePath = COArenderer && (COArenderer.shieldPaths as Record<string, string>)[emblemShape];
  if (image) shapePath ? image.setAttribute("d", shapePath) : image.removeAttribute("d");

  const specificShape = ["culture", "state", "random"].includes(emblemShape) ? null : emblemShape;
  if (emblemShape === "random")
    (worldContext.pack.cultures as Culture[])
      .filter(c => !c.removed)
      .forEach(c => {
        c.shield = Cultures.getRandomShield();
      });

  const rerenderCOA = (id: string, coa: RendererEmblem) => {
    const coaEl = document.getElementById(id);
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
  viewContext.burgLabels.select("#capital").attr("data-size", Math.max(rn(6 - +value / 20), 3));
  viewContext.labels.select("#countries").attr("data-size", Math.max(rn(18 - +value / 6), 4));
}

function changeUiSize(value: number): void {
  if (Number.isNaN(value) || value < 0.5) return;

  const max = getUImaxSize();
  if (value > max) value = max;

  useOptionsState.getState().setOptions({ uiSize: value });
  document.getElementsByTagName("body")[0].style.fontSize = `${rn(value * 10, 2)}px`;
  const optionsEl = document.getElementById("options");
  if (optionsEl) optionsEl.style.width = `${value * 300}px`;
}

function getUImaxSize(): number {
  return rn(Math.min(window.innerHeight / 465, window.innerWidth / 302), 1);
}

function changeTooltipSize(value: string): void {
  tooltip.style.fontSize = `calc(${value}px + 0.5vw)`;
}

// ─── Theme / color ─────────────────────────────────────────────────────────────

function restoreDefaultThemeColor(): void {
  localStorage.removeItem("themeColor");
  changeDialogsTheme(THEME_COLOR, String(useOptionsState.getState().transparency));
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

  const { h, s, l } = hsl(themeColor || THEME_COLOR);
  useOptionsState.getState().setOptions({ themeColor: themeColor || THEME_COLOR });

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
    ensureEl("loadGoogleTranslateButton").remove();

    document
      .getElementById("mapLayers")!
      .querySelectorAll("li")
      .forEach(el => {
        const text = el.innerHTML.replace(/<u>(.+)<\/u>/g, "$1");
        el.innerHTML = text;
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
  const languageSelect = document.querySelector<HTMLSelectElement>("#google_translate_element select");
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
  viewContext.zoom.scaleExtent([min, max]);
  const scale = minmax(+value, 0.01, 200);
  viewContext.zoom.scaleTo(viewContext.svg, scale);
}

function restoreDefaultZoomExtent(): void {
  useOptionsState.getState().setOptions({ zoomExtentMin: 1, zoomExtentMax: 20 });
  viewContext.zoom.scaleExtent([1, 20]).scaleTo(viewContext.svg, 1);
}

// ─── Apply stored options ─────────────────────────────────────────────────────

export function applyStoredOptions(): void {
  const optionsStore = useOptionsState.getState();

  if (!stored("mapWidth") || !stored("mapHeight")) {
    optionsStore.setOptions({
      mapWidth: window.innerWidth,
      mapHeight: window.innerHeight
    });
  } else {
    optionsStore.setOptions({
      mapWidth: +stored("mapWidth")!,
      mapHeight: +stored("mapHeight")!
    });
  }

  const heightmapId = stored("template");
  if (heightmapId) {
    const name = heightmapTemplates[heightmapId]?.name || precreatedHeightmaps[heightmapId]?.name || heightmapId;
    const templateInput = document.getElementById("templateInput") as HTMLInputElement | HTMLSelectElement | null;
    if (templateInput) applyOption(templateInput, heightmapId, name);
    optionsStore.setOption("template", heightmapId);
  }

  if (stored("distanceUnit")) applyOption(distanceUnitInput, stored("distanceUnit")!);
  if (stored("heightUnit")) applyOption(heightUnit, stored("heightUnit")!);

  const loadedOptions: Partial<Omit<OptionsState, "setOption" | "setOptions">> = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key === "speakerVoice") continue;

    const value = stored(key)!;

    const input = (document.getElementById(`${key}Input`) || document.getElementById(key)) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    const output = document.getElementById(`${key}Output`) as HTMLInputElement | HTMLSelectElement | null;
    if (input) input.value = value;
    if (output) output.value = value;
    lock(key);

    if (key === "points") changeCellsDensity(+value);
    if (key === "distanceScale") worldContext.distanceScale = +value;

    if (key.slice(0, 5) === "style") applyOption(stylePreset, key, key.slice(5));

    // Map valid keys to the Zustand store
    const validKeys = [
      "seed",
      "points",
      "mapName",
      "year",
      "era",
      "cultures",
      "culturesSet",
      "statesNumber",
      "provincesRatio",
      "sizeVariety",
      "growthRate",
      "manors",
      "religionsNumber",
      "uiSize",
      "tooltipSize",
      "themeColor",
      "transparency"
    ];
    if (validKeys.includes(key)) {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic key assignment for validated keys
      (loadedOptions as any)[key] = Number.isNaN(+value) ? value : +value;
    }
  }
  // biome-ignore lint/suspicious/noExplicitAny: partial options object from legacy storage
  optionsStore.setOptions(loadedOptions as any);

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

  if (stored("tooltipSize")) changeTooltipSize(stored("tooltipSize")!);
  if (stored("regions")) changeStatesNumber(stored("regions")!);

  if (stored("uiSize")) changeUiSize(+stored("uiSize")!);
  else changeUiSize(minmax(rn(optionsStore.mapWidth / 1280, 1), 1, 2.5));

  const params = new URL(window.location.href).searchParams;
  const width = +params.get("width")!;
  const height = +params.get("height")!;
  if (width || height) {
    optionsStore.setOptions({
      mapWidth: width || optionsStore.mapWidth,
      mapHeight: height || optionsStore.mapHeight
    });
  }

  const transparency = stored("transparency") || "5";
  const themeColor = stored("themeColor") || "";
  changeDialogsTheme(themeColor, transparency);

  setRendering("auto");
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
  if ((randomize || !locked("prec")) && precInput) precInput.value = String(gauss(100, 40, 5, 500));

  const US = navigator.language === "en-US";
  if (randomize || !locked("distanceScale")) {
    const dsv = gauss(3, 1, 1, 5);
    useOptionsState.getState().setOption("distanceScale", dsv);
    worldContext.distanceScale = dsv;
  }
  if (!stored("distanceUnit") && distanceUnitInput) distanceUnitInput.value = US ? "mi" : "km";
  if (!stored("heightUnit") && heightUnit) heightUnit.value = US ? "ft" : "m";
  if (!stored("temperatureScale") && temperatureScale) temperatureScale.value = US ? "°F" : "°C";

  generateEra();
}

function randomizeHeightmapTemplate(): void {
  const templates: Record<string, number> = {};
  for (const key in heightmapTemplates) {
    templates[key] = (heightmapTemplates[key].probability as number) || 0;
  }
  const template = rw(templates);
  const name = heightmapTemplates[template].name;
  useOptionsState.getState().setOption("template", template);
  const templateInput = document.getElementById("templateInput") as HTMLInputElement | HTMLSelectElement | null;
  if (templateInput) applyOption(templateInput, template, name);
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
  // viewContext is not injected yet when called at module level before initOptions()
  if (!viewContext) return;
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
    store.setOptions({ era: `${Names.getBaseShort(P(0.7) ? 1 : rand(worldContext.nameBases.length))} Era` });

  worldContext.options.year = store.year;
  worldContext.options.era = store.era;
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
  import("./heightmap-selection").then(m => m.open());
}

// ─── Sticked menu ─────────────────────────────────────────────────────────────

export function regeneratePrompt(opts?: { seed?: string }): void {
  if (viewContext.customization) {
    tip("New map cannot be generated when edit mode is active, please exit the mode and retry", false, "error");
    return;
  }
  const workingTime = (Date.now() - last(worldContext.mapHistory).created) / 60000;
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

function showSavePane(): void {
  const sharableLinkContainer = ensureEl("sharableLinkContainer");
  sharableLinkContainer.style.display = "none";

  openDialog("saveMapData", { title: "Save map" });
}

export function copyLinkToClickboard(): void {
  const shrableLink = ensureEl("sharableLink");
  const link = shrableLink.getAttribute("href")!;
  navigator.clipboard.writeText(link).then(() => tip("Link is copied to the clipboard", true, "success", 8000));
}

export function showExportPane(): void {
  ensureEl<HTMLInputElement>("showLabels").checked = !hideLabels.checked;

  openDialog("exportMapData", { title: "Export map data" });
}

export function exportToJson(type: string): void {
  exportToJsonModule(type);
}

async function showLoadPane(): Promise<void> {
  openDialog("loadMapData", {
    title: "Load map",

    width: "auto",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Close: function (this: Element) {
        /* $(this).dialog("close") removed */
      }
    }
  });

  const dropbox = Cloud.providers.dropbox;
  if (dropbox.api) {
    ensureEl("dropboxConnectButton").style.display = "none";
    ensureEl("loadFromDropboxSelect").style.display = "block";
    const loadFromDropboxButtons = ensureEl("loadFromDropboxButtons");
    const fileSelect = ensureEl<HTMLSelectElement>("loadFromDropboxSelect");
    fileSelect.innerHTML = `<option value="" disabled selected>Loading...</option>`;

    const files = await dropbox.list();

    if (!files) {
      loadFromDropboxButtons.style.display = "none";
      fileSelect.innerHTML = `<option value="" disabled selected>Save files to Dropbox first</option>`;
      return;
    }

    loadFromDropboxButtons.style.display = "block";
    fileSelect.innerHTML = "";
    files.forEach(({ name, updated, size, path }) => {
      const sizeMB = `${rn(size / 1024 / 1024, 2)} MB`;
      const updatedOn = new Date(updated).toLocaleDateString();
      const nameFormatted = `${updatedOn}: ${name} [${sizeMB}]`;
      const option = new Option(nameFormatted, path);
      fileSelect.options.add(option);
    });

    return;
  }

  ensureEl("dropboxConnectButton").style.display = "inline-block";
  ensureEl("loadFromDropboxButtons").style.display = "none";
  ensureEl("loadFromDropboxSelect").style.display = "none";
}

export async function connectToDropbox(): Promise<void> {
  await Cloud.providers.dropbox.initialize();
  if (Cloud.providers.dropbox.api) showLoadPane();
}

export function loadURL(): void {
  const pattern = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
  const inner = `Provide URL to map file:
    <input id="mapURL" type="url" style="width: 24em" placeholder="https://e-cloud.com/test.map">
    <br><i>Please note server should allow CORS for file to be loaded. If CORS is not allowed, save file to Dropbox and provide a direct link</i>`;
  alertMessage.innerHTML = inner;
  openRichDialog({
    content: alertMessage.innerHTML,

    title: "Load map from URL",
    width: "27em",
    buttons: {
      Load: function (this: Element) {
        const value = (document.getElementById("mapURL") as HTMLInputElement).value;
        if (!pattern.test(value)) {
          tip("Please provide a valid URL", false, "error");
          return;
        }
        loadMapFromURL(value, 0);
        /* $(this).dialog("close") removed */
      },
      Cancel: function (this: Element) {
        /* $(this).dialog("close") removed */
      }
    }
  });
}

// ─── PNG tiles export ─────────────────────────────────────────────────────────

export function openExportToPngTiles(): void {
  ensureEl("tileStatus").innerHTML = "";
  closeDialogs();
  updateTilesOptions();

  const inputs = ensureEl("exportToPngTilesScreen").querySelectorAll<HTMLInputElement>("input");
  inputs.forEach(input => {
    input.addEventListener("input", updateTilesOptions);
  });

  openDialog("exportToPngTilesScreen", {
    title: "Download tiles",
    width: "23em",
    buttons: {
      Download: () => exportToPngTiles(),
      Cancel: function (this: Element) {
        /* $(this).dialog("close") removed */
      }
    },
    close: () => {
      inputs.forEach(input => {
        input.removeEventListener("input", updateTilesOptions);
      });
      viewContext.debug.selectAll("*").remove();
    }
  });
}

// biome-ignore lint/suspicious/noConfusingVoidType: this parameter needs void union for optional event handler context
function updateTilesOptions(this: HTMLInputElement | void): void {
  if (this && (this as HTMLInputElement).tagName === "INPUT") {
    const el = this as HTMLInputElement;
    const { nextElementSibling: next, previousElementSibling: prev } = el;
    if (next && (next as HTMLInputElement).tagName === "INPUT") (next as HTMLInputElement).value = el.value;
    if (prev && (prev as HTMLInputElement).tagName === "INPUT") (prev as HTMLInputElement).value = el.value;
  }

  const tileSize = ensureEl("tileSize");
  const tilesX = +ensureEl<HTMLInputElement>("tileColsOutput").value || 2;
  const tilesY = +ensureEl<HTMLInputElement>("tileRowsOutput").value || 2;
  const scale = +ensureEl<HTMLInputElement>("tileScaleOutput").value || 1;

  const { graphWidth, graphHeight } = worldContext;
  const sizeX = graphWidth * scale * tilesX;
  const sizeY = graphHeight * scale * tilesY;
  const totalSize = sizeX * sizeY;

  tileSize.innerHTML = `${sizeX} x ${sizeY} px`;
  tileSize.style.color = totalSize > 1e9 ? "#d00b0b" : totalSize > 1e8 ? "#9e6409" : "#1a941a";

  const rects: string[] = [];
  const labelItems: string[] = [];
  const tileW = (graphWidth / tilesX) | 0;
  const tileH = (graphHeight / tilesY) | 0;

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function getRowLabel(row: number): string {
    const first = row >= alphabet.length ? alphabet[Math.floor(row / alphabet.length) - 1] : "";
    const last = alphabet[row % alphabet.length];
    return first + last;
  }

  for (let y = 0, row = 0; y + tileH <= graphHeight; y += tileH, row++) {
    for (let x = 0, column = 1; x + tileW <= graphWidth; x += tileW, column++) {
      rects.push(`<rect x=${x} y=${y} width=${tileW} height=${tileH} />`);
      labelItems.push(`<text x=${x + tileW / 2} y=${y + tileH / 2}>${getRowLabel(row)}${column}</text>`);
    }
  }

  viewContext.debug.html(
    `<g fill='none' stroke='#000'>${rects.join("")}</g>` +
      `<g fill='#000' stroke='none' text-anchor='middle' dominant-baseline='central' font-size='18px'>${labelItems.join("")}</g>`
  );
}

// ─── View mode / 3D ───────────────────────────────────────────────────────────

export function changeViewMode(event: MouseEvent): void {
  const button = event.target as HTMLElement;
  if (button.tagName !== "BUTTON") return;
  const pressed = button.classList.contains("pressed");
  enterStandardView();

  const viewStandardEl = document.getElementById("viewStandard");
  if (!pressed && button.id !== "viewStandard") {
    viewStandardEl?.classList.remove("pressed");
    button.classList.add("pressed");
    enter3dView(button.id);
  }
}

export function enterStandardView(): void {
  const viewModeEl = document.getElementById("viewMode");
  const heightmap3DViewEl = document.getElementById("heightmap3DView");
  const viewStandardEl = document.getElementById("viewStandard");

  viewModeEl?.querySelectorAll(".pressed").forEach(button => {
    button.classList.remove("pressed");
  });
  heightmap3DViewEl?.classList.remove("pressed");
  viewStandardEl?.classList.add("pressed");

  if (!document.getElementById("canvas3d")) return;
  ThreeD.stop();
  ensureEl("canvas3d").remove();

  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.style.visibility = "visible";
    mapEl.style.pointerEvents = "auto";
  }

  if (isDialogOpen("options3d")) closeDialog("options3d");
  if (isDialogOpen("preview3d")) closeDialog("preview3d");
}

async function enter3dView(type: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.id = "canvas3d";
  canvas.dataset.type = type;

  if (type === "heightmap3DView") {
    canvas.width = parseFloat(preview3d.style.width) || worldContext.graphWidth / 3;
    canvas.height = canvas.width / (worldContext.graphWidth / worldContext.graphHeight);
    canvas.style.display = "block";
  } else {
    canvas.width = viewContext.svgWidth;
    canvas.height = viewContext.svgHeight;
    canvas.style.position = "absolute";
    canvas.style.display = "none";
    canvas.style.pointerEvents = "auto";
  }

  const started = await ThreeD.create(canvas, type);
  if (!started) return;

  canvas.style.display = "block";
  canvas.onmouseenter = () => {
    const help = "Drag to pan • Scroll to zoom • Right-click drag to rotate • <b>O</b> to toggle options";
    +(canvas.dataset.hovered ?? 0) > 2 ? tip("") : tip(help);
    canvas.dataset.hovered = String((+(canvas.dataset.hovered ?? 0) | 0) + 1);
  };

  if (type === "heightmap3DView") {
    ensureEl("preview3d").appendChild(canvas);
    openDialog("preview3d", {
      title: "3D Preview",

      position: { my: "left bottom", at: "left+10 bottom-20", of: "svg" },
      resizeStop: resize3d,
      close: enterStandardView
    });
  } else {
    optionsContainer.parentNode?.insertBefore(canvas, optionsContainer);

    // Hide SVG
    const mapEl = document.getElementById("map");
    if (mapEl) {
      mapEl.style.visibility = "hidden";
      mapEl.style.pointerEvents = "none";
    }

    if (typeof unselect === "function") unselect();
  }

  toggle3dOptions();
}

function resize3d(): void {
  const canvas = ensureEl<HTMLCanvasElement>("canvas3d");
  canvas.width = parseFloat(preview3d.style.width);
  canvas.height = parseFloat(preview3d.style.height) - 2;
  ThreeD.redraw();
}

export function toggle3dOptions(): void {
  if (isDialogOpen("options3d")) {
    closeDialog("options3d");
    return;
  }
  openDialog("options3d", {
    title: "3D mode settings",

    width: fitContent(),
    position: { my: "right top", at: "right-30 top+10", of: "svg", collision: "fit" }
  });

  setTimeout(() => {
    updateValues();

    if (modules.options3d) return;
    modules.options3d = true;

    ensureEl("options3dUpdate").addEventListener("click", () => ThreeD.update());
    ensureEl("options3dSave").addEventListener("click", ThreeD.saveScreenshot);
    ensureEl("options3dOBJSave").addEventListener("click", ThreeD.saveOBJ);

    ensureEl("options3dScaleRange").addEventListener("input", changeHeightScale);
    ensureEl("options3dScaleNumber").addEventListener("change", changeHeightScale);
    ensureEl("options3dLightnessRange").addEventListener("input", changeLightness);
    ensureEl("options3dLightnessNumber").addEventListener("change", changeLightness);
    ensureEl("options3dSunX").addEventListener("change", changeSunPosition);
    ensureEl("options3dSunY").addEventListener("change", changeSunPosition);
    ensureEl("options3dMeshSkinResolution").addEventListener("change", changeResolutionScale);
    ensureEl("options3dMeshRotationRange").addEventListener("input", changeRotation);
    ensureEl("options3dMeshRotationNumber").addEventListener("change", changeRotation);
    ensureEl("options3dGlobeRotationRange").addEventListener("input", changeRotation);
    ensureEl("options3dGlobeRotationNumber").addEventListener("change", changeRotation);
    ensureEl("options3dMeshLabels3d").addEventListener("change", toggleLabels3d);
    ensureEl("options3dMeshSkyMode").addEventListener("change", toggleSkyMode);
    ensureEl("options3dMeshSky").addEventListener("input", changeColors);
    ensureEl("options3dMeshWater").addEventListener("input", changeColors);
    ensureEl("options3dGlobeResolution").addEventListener("change", changeResolution);
    ensureEl("options3dMeshWireframeMode").addEventListener("change", toggleWireframe3d);
    ensureEl("options3dSunColor").addEventListener("input", changeSunColor);
    ensureEl("options3dSubdivide").addEventListener("change", toggle3dSubdivision);
    ensureEl("options3dTimeOfDay").addEventListener("change", changeTimeOfDay);

    function updateValues(): void {
      const globe = ensureEl("canvas3d").dataset.type === "viewGlobe";
      options3dMesh.style.display = globe ? "none" : "block";
      options3dGlobe.style.display = globe ? "block" : "none";
      options3dOBJSave.style.display = globe ? "none" : "inline-block";
      (options3dScaleRange as HTMLInputElement).value = (options3dScaleNumber as HTMLInputElement).value = String(
        ThreeD.options.scale
      );
      (options3dLightnessRange as HTMLInputElement).value = (options3dLightnessNumber as HTMLInputElement).value =
        String(ThreeD.options.lightness * 100);
      (options3dSunX as HTMLInputElement).value = String(ThreeD.options.sun.x);
      (options3dSunY as HTMLInputElement).value = String(ThreeD.options.sun.y);
      (options3dMeshRotationRange as HTMLInputElement).value = (options3dMeshRotationNumber as HTMLInputElement).value =
        String(ThreeD.options.rotateMesh);
      (options3dMeshSkinResolution as HTMLInputElement).value = String(ThreeD.options.resolutionScale);
      (options3dGlobeRotationRange as HTMLInputElement).value = (
        options3dGlobeRotationNumber as HTMLInputElement
      ).value = String(ThreeD.options.rotateGlobe);
      (options3dMeshLabels3d as HTMLInputElement).value = String(ThreeD.options.labels3d);
      options3dMeshSkyMode.value = String(ThreeD.options.extendedWater);
      options3dColorSection.style.display = ThreeD.options.extendedWater ? "block" : "none";
      (options3dMeshSky as HTMLInputElement).value = ThreeD.options.skyColor;
      (options3dMeshWater as HTMLInputElement).value = ThreeD.options.waterColor;
      (options3dGlobeResolution as HTMLInputElement).value = String(ThreeD.options.resolution);
      (options3dSunColor as HTMLInputElement).value = ThreeD.options.sunColor;
      (options3dSubdivide as HTMLInputElement).value = String(ThreeD.options.subdivide);
      updateTimeOfDayPreset();
    }

    function updateTimeOfDayPreset(): void {
      const presetSelect = ensureEl<HTMLSelectElement>("options3dTimeOfDay");
      if (!presetSelect) return;

      const { sun, sunColor, lightness } = ThreeD.options;

      let matchingPreset = "custom";
      for (const [name, preset] of Object.entries(ThreeD.timeOfDayPresets)) {
        if (
          preset.sun.x === sun.x &&
          preset.sun.y === sun.y &&
          preset.sun.z === sun.z &&
          preset.sunColor === sunColor &&
          Math.abs(preset.lightness - lightness) < 0.05
        ) {
          matchingPreset = name;
          break;
        }
      }

      presetSelect.value = matchingPreset;
    }

    function changeTimeOfDay(this: HTMLSelectElement): void {
      const presetName = this.value;
      if (presetName === "custom") return;
      ThreeD.setTimeOfDay(presetName);
      updateValues();
    }

    function changeHeightScale(this: HTMLInputElement): void {
      (options3dScaleRange as HTMLInputElement).value = (options3dScaleNumber as HTMLInputElement).value = this.value;
      ThreeD.setScale(+this.value);
    }

    function changeResolutionScale(this: HTMLInputElement): void {
      (options3dMeshSkinResolution as HTMLInputElement).value = this.value;
      ThreeD.setResolutionScale(+this.value);
    }

    function changeLightness(this: HTMLInputElement): void {
      (options3dLightnessRange as HTMLInputElement).value = (options3dLightnessNumber as HTMLInputElement).value =
        this.value;
      ThreeD.setLightness(+this.value / 100);
      const presetSelect = ensureEl<HTMLSelectElement>("options3dTimeOfDay");
      if (presetSelect?.value !== "custom") presetSelect.value = "custom";
    }

    function changeSunColor(this: HTMLInputElement): void {
      ThreeD.setSunColor((options3dSunColor as HTMLInputElement).value);
      const presetSelect = ensureEl<HTMLSelectElement>("options3dTimeOfDay");
      if (presetSelect?.value !== "custom") presetSelect.value = "custom";
    }

    function changeSunPosition(this: HTMLInputElement): void {
      const x = +(options3dSunX as HTMLInputElement).value;
      const y = +(options3dSunY as HTMLInputElement).value;
      ThreeD.setSun(x, y, ThreeD.options.sun.z);
      const presetSelect = ensureEl<HTMLSelectElement>("options3dTimeOfDay");
      if (presetSelect?.value !== "custom") presetSelect.value = "custom";
    }

    function changeRotation(this: HTMLInputElement): void {
      const sibling = (this.nextElementSibling || this.previousElementSibling) as HTMLInputElement;
      sibling.value = this.value;
      ThreeD.setRotation(+this.value);
    }

    function toggleLabels3d(): void {
      ThreeD.toggleLabels();
    }
    function toggle3dSubdivision(): void {
      ThreeD.toggle3dSubdivision();
    }
    function toggleWireframe3d(): void {
      ThreeD.toggleWireframe();
    }

    function toggleSkyMode(): void {
      const hide = ThreeD.options.extendedWater;
      options3dColorSection.style.display = hide ? "none" : "block";
      ThreeD.toggleSky();
    }

    function changeColors(): void {
      ThreeD.setColors((options3dMeshSky as HTMLInputElement).value, (options3dMeshWater as HTMLInputElement).value);
    }

    function changeResolution(this: HTMLInputElement): void {
      ThreeD.setResolution(+this.value);
    }
  }, 100);
}

export function initOptions(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices): void {
  // draggable/sortable/disableSelection
  // $("#optionsContainer").draggable({ handle: ".drag-trigger", snap: "svg", snapMode: "both" });
  // $("#exitCustomization").draggable({ handle: "div" });

  if (stored("disable_click_arrow_tooltip")) {
    clearMainTip();
    const trigger = document.getElementById("optionsTrigger");
    if (trigger) trigger.classList.remove("glow");
  }

  // Options pane show/hide
  const trigger2 = document.getElementById("optionsTrigger");
  if (trigger2) {
    trigger2.addEventListener("mouseenter", () => {
      if (trigger2.classList.contains("glow")) return;
      const optsEl = document.getElementById("options");
      const regen = document.getElementById("regenerate");
      if (optsEl && optsEl.style.display === "none" && regen) regen.style.display = "block";
    });
  }

  const collap = document.getElementById("collapsible");
  if (collap) {
    collap.addEventListener("mouseleave", () => {
      const regen = document.getElementById("regenerate");
      if (regen) regen.style.display = "none";
    });
  }

  // Generic option change helpers
  // Generic option change helpers
  const optionsEl = document.getElementById("options");
  if (optionsEl) {
    optionsEl.addEventListener("change", storeValueIfRequired);
    optionsEl.addEventListener("input", updateOutputToFollowInput);
  }
  const dialogsEl = document.getElementById("dialogs");
  if (dialogsEl) {
    dialogsEl.addEventListener("change", storeValueIfRequired);
    dialogsEl.addEventListener("input", updateOutputToFollowInput);
  }

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
  });

  document.addEventListener("react-change-era", (e: Event) => {
    lock("era");
    worldContext.options.era = (e as CustomEvent).detail.era;
    worldContext.options.eraShort = (worldContext.options.era ?? "")
      .split(" ")
      .map((w: string) => w[0]?.toUpperCase() ?? "")
      .join("");
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

  // Note: For other sliders (points, cultures, etc.), their changes are applied on map generation.
  // If immediate change is needed, add specific react- events for them and call the corresponding functions
  // like changeCellsDensity(), changeStatesNumber(), etc.

  // Sticked menu
  ensureEl("sticked").addEventListener("click", (event: MouseEvent) => {
    const id = (event.target as HTMLElement).id;
    if (id === "newMapButton") regeneratePrompt();
    else if (id === "saveButton") showSavePane();
    else if (id === "exportButton") showExportPane();
    else if (id === "loadButton") showLoadPane();
    else if (id === "zoomReset") resetZoom(1000);
  });

  // Load map file
  ensureEl<HTMLInputElement>("mapToLoad").addEventListener("change", function (this: HTMLInputElement) {
    const fileToLoad = this.files![0];
    this.value = "";
    closeDialogs();
    uploadMap(fileToLoad);
  });

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
