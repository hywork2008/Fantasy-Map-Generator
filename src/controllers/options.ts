import { hsl } from "d3";
import { ensureEl, gauss, P, rand, rn, rw } from "../utils";
import { exportToJson as exportToJsonModule } from "./export-json";
import { open as openHeightmapSelection } from "./heightmap-selection";

// ─── Init jQuery draggable / disable-selection ────────────────────────────────

($("#optionsContainer") as any).draggable({ handle: ".drag-trigger", snap: "svg", snapMode: "both" });
($("#exitCustomization") as any).draggable({ handle: "div" });
($("#mapLayers") as any).disableSelection();

if (stored("disable_click_arrow_tooltip")) {
  clearMainTip();
  optionsTrigger.classList.remove("glow");
}

// ─── Options pane show/hide ───────────────────────────────────────────────────

function showOptions(event?: Event): void {
  if (!stored("disable_click_arrow_tooltip")) {
    clearMainTip();
    localStorage.setItem("disable_click_arrow_tooltip", "true");
    optionsTrigger.classList.remove("glow");
  }

  regenerate.style.display = "none";
  ensureEl("options").style.display = "block";
  optionsTrigger.style.display = "none";

  if (event) event.stopPropagation();
}

function hideOptions(event?: Event): void {
  ensureEl("options").style.display = "none";
  optionsTrigger.style.display = "block";
  if (event) event.stopPropagation();
}

function toggleOptions(event?: Event): void {
  if (ensureEl("options").style.display === "none") showOptions(event);
  else hideOptions(event);
}

// ─── "New Map!" hover panel ───────────────────────────────────────────────────

optionsTrigger.addEventListener("mouseenter", () => {
  if (optionsTrigger.classList.contains("glow")) return;
  if (ensureEl("options").style.display === "none") regenerate.style.display = "block";
});

collapsible.addEventListener("mouseleave", () => {
  regenerate.style.display = "none";
});

// ─── Options tab switching ────────────────────────────────────────────────────

document
  .getElementById("options")!
  .querySelector<HTMLElement>("div.tab")!
  .addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName !== "BUTTON") return;
    const id = target.id;
    const active = ensureEl("options").querySelector<HTMLElement>(".tab > button.active");
    if (active && id === active.id) return;

    if (active) active.classList.remove("active");
    ensureEl(id).classList.add("active");
    document
      .getElementById("options")!
      .querySelectorAll<HTMLElement>(".tabcontent")
      .forEach(e => {
        e.style.display = "none";
      });

    if (id === "layersTab") {
      layersContent.style.display = "block";
    } else if (id === "styleTab") {
      styleContent.style.display = "block";
      selectStyleElement();
    } else if (id === "optionsTab") {
      optionsContent.style.display = "block";
    } else if (id === "toolsTab") {
      if (customization === 1) {
        customizationMenu.style.display = "block";
      } else {
        toolsContent.style.display = "block";
      }
    } else if (id === "aboutTab") {
      aboutContent.style.display = "block";
    }
  });

// ─── Patreon supporters ────────────────────────────────────────────────────────

async function showSupporters(): Promise<void> {
  const url = `${import.meta.env.BASE_URL}modules/dynamic/supporters.js`;
  const mod = (await import(/* @vite-ignore */ url)) as { supporters: string };
  const list = mod.supporters.split("\n").sort();
  const columns = window.innerWidth < 800 ? 2 : 5;

  alertMessage.innerHTML = `<ul style='column-count: ${columns}; column-gap: 2em'>${list.map((n: string) => `<li>${n}</li>`).join("")}</ul>`;
  $("#alert").dialog({
    resizable: false,
    title: "Patreon Supporters",
    width: "min-width",
    position: { my: "center", at: "center", of: "svg" }
  });
}

// ─── Generic option change helpers ────────────────────────────────────────────

ensureEl("options").addEventListener("change", storeValueIfRequired);
ensureEl("dialogs").addEventListener("change", storeValueIfRequired);
ensureEl("options").addEventListener("input", updateOutputToFollowInput);
ensureEl("dialogs").addEventListener("input", updateOutputToFollowInput);

function storeValueIfRequired(ev: Event): void {
  const target = ev.target as HTMLElement;
  if ((target as HTMLInputElement).dataset?.stored) lock((target as HTMLInputElement).dataset.stored!);
}

function updateOutputToFollowInput(ev: Event): void {
  const target = ev.target as HTMLInputElement;
  const id = target.id;
  const value = target.value;

  if (id === "manorsInput") {
    manorsOutput.value = value === "1000" ? "auto" : value;
    return;
  }

  if (id.slice(-5) === "Input") {
    const output = document.getElementById(`${id.slice(0, -5)}Output`) as HTMLInputElement | null;
    if (output) output.value = value;
  } else if (id.slice(-6) === "Output") {
    const input = document.getElementById(`${id.slice(0, -6)}Input`) as HTMLInputElement | null;
    if (input) input.value = value;
  }
}

// ─── Options content listeners ────────────────────────────────────────────────

const optionsContentEl = ensureEl("optionsContent");

optionsContentEl.addEventListener("input", (event: Event) => {
  const target = event.target as HTMLInputElement;
  const { id, value } = target;
  if (id === "mapWidthInput" || id === "mapHeightInput") mapSizeInputChange();
  else if (id === "pointsInput") changeCellsDensity(+value);
  else if (id === "culturesSet") changeCultureSet();
  else if (id === "statesNumber") changeStatesNumber(value);
  else if (id === "emblemShape") changeEmblemShape(value);
  else if (id === "tooltipSize") changeTooltipSize(value);
  else if (id === "themeHueInput") changeThemeHue(value);
  else if (id === "themeColorInput") changeDialogsTheme(themeColorInput.value, transparencyInput.value);
  else if (id === "transparencyInput") changeDialogsTheme(themeColorInput.value, value);
});

optionsContentEl.addEventListener("change", (event: Event) => {
  const target = event.target as HTMLInputElement;
  const { id, value } = target;
  if (id === "zoomExtentMin" || id === "zoomExtentMax") changeZoomExtent(value);
  else if (id === "optionsSeed") generateMapWithSeed();
  else if (id === "uiSize") changeUiSize(+value);
  else if (id === "shapeRendering") setRendering(value);
  else if (id === "yearInput") changeYear();
  else if (id === "eraInput") changeEra();
  else if (id === "stateLabelsModeInput") (options as any).stateLabelsMode = value;
  else if (id === "azgaarAssistant") toggleAssistant?.();
});

optionsContentEl.addEventListener("click", (event: MouseEvent) => {
  const { id } = event.target as HTMLElement;
  if (id === "restoreDefaultCanvasSize") restoreDefaultCanvasSize();
  else if (id === "optionsMapHistory") showSeedHistoryDialog();
  else if (id === "optionsCopySeed") copyMapURL();
  else if (id === "optionsEraRegenerate") regenerateEra();
  else if (id === "templateInputContainer") openTemplateSelectionDialog();
  else if (id === "zoomExtentDefault") restoreDefaultZoomExtent();
  else if (id === "translateExtent") toggleTranslateExtent(event.target as HTMLElement);
  else if (id === "speakerTest") testSpeaker();
  else if (id === "themeColorRestore") restoreDefaultThemeColor();
  else if (id === "loadGoogleTranslateButton") loadGoogleTranslate();
  else if (id === "resetLanguage") resetLanguage();
});

// ─── Canvas size ───────────────────────────────────────────────────────────────

function mapSizeInputChange(): void {
  const $mapWidthInput = ensureEl<HTMLInputElement>("mapWidthInput");
  const $mapHeightInput = ensureEl<HTMLInputElement>("mapHeightInput");

  fitMapToScreen();
  localStorage.setItem("mapWidth", $mapWidthInput.value);
  localStorage.setItem("mapHeight", $mapHeightInput.value);

  const tooWide = +$mapWidthInput.value > window.innerWidth;
  const tooHigh = +$mapHeightInput.value > window.innerHeight;

  if (tooWide || tooHigh) {
    const message = `Canvas size is larger than window size (${window.innerWidth} x ${window.innerHeight}). It can affect performance`;
    tip(message, false, "warn", 4000);
  }
}

function restoreDefaultCanvasSize(): void {
  mapWidthInput.value = String(window.innerWidth);
  mapHeightInput.value = String(window.innerHeight);
  localStorage.removeItem("mapHeight");
  localStorage.removeItem("mapWidth");
  fitMapToScreen();
}

function applyGraphSize(): void {
  graphWidth = +mapWidthInput.value;
  graphHeight = +mapHeightInput.value;

  landmass.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  oceanPattern.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  oceanLayers.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  fogging.selectAll("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  defs.select("mask#fog > rect").attr("width", graphWidth).attr("height", graphHeight);
  defs.select("mask#water > rect").attr("width", graphWidth).attr("height", graphHeight);
}

function fitMapToScreen(): void {
  svgWidth = Math.min(+mapWidthInput.value, window.innerWidth);
  svgHeight = Math.min(+mapHeightInput.value, window.innerHeight);
  svg.attr("width", svgWidth).attr("height", svgHeight);

  const zoomMin = rn(Math.max(svgWidth / graphWidth, svgHeight / graphHeight), 3);
  zoomExtentMin.value = String(zoomMin);
  const zoomMax = +zoomExtentMax.value;

  (zoom as any)
    .translateExtent([
      [0, 0],
      [graphWidth, graphHeight]
    ])
    .scaleExtent([zoomMin, zoomMax]);

  fitScaleBar(scaleBar as any, svgWidth, svgHeight);
  if (typeof fitLegendBox !== "undefined") fitLegendBox();
}

function toggleTranslateExtent(el: HTMLElement): void {
  el.dataset.on = String(+!+(el.dataset.on ?? "0"));
  const on = el.dataset.on;
  if (+on) {
    (zoom as any).translateExtent([
      [-graphWidth / 2, -graphHeight / 2],
      [graphWidth * 1.5, graphHeight * 1.5]
    ]);
  } else {
    (zoom as any).translateExtent([
      [0, 0],
      [graphWidth, graphHeight]
    ]);
  }
}

// ─── Voice synthesis ──────────────────────────────────────────────────────────

let voiceAttempts = 0;
const voiceInterval = setInterval(() => {
  voiceAttempts++;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) {
    if (voiceAttempts < 10) return;
    clearInterval(voiceInterval);
    const select = ensureEl<HTMLSelectElement>("speakerVoice");
    if (select && !select.options.length) {
      select.options.add(new Option("No voices available", "", false));
    }
    return;
  }

  clearInterval(voiceInterval);

  const select = ensureEl<HTMLSelectElement>("speakerVoice");
  voices.forEach((voice, i) => {
    select.options.add(new Option(voice.name, String(i), false));
  });
  const storedVoice = stored("speakerVoice");
  if (storedVoice) select.value = storedVoice;
  else select.value = String(voices.findIndex(voice => voice.lang === "en-US"));
}, 1000);

function testSpeaker(): void {
  const text = `${mapName.value}, ${options.year} ${options.era}`;
  const speaker = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  if (voices.length) {
    const voiceId = +ensureEl<HTMLSelectElement>("speakerVoice").value;
    speaker.voice = voices[voiceId];
  }
  speechSynthesis.speak(speaker);
}

// ─── Seed / map history ────────────────────────────────────────────────────────

function generateMapWithSeed(): void {
  if (optionsSeed.value === seed) {
    tip("The current map already has this seed", false, "error");
    return;
  }
  regeneratePrompt({ seed: optionsSeed.value });
}

function showSeedHistoryDialog(): void {
  const lines = mapHistory.map((h: any, i: number) => {
    const created = new Date(h.created).toLocaleTimeString();
    const button = `<i data-tip="Click to generate a map with this seed" onclick="restoreSeed(${i})" class="icon-history optionsSeedRestore"></i>`;
    return `<li>Seed: ${h.seed} ${button}. Size: ${h.width}x${h.height}. Template: ${h.template}. Created: ${created}</li>`;
  });
  alertMessage.innerHTML = `<ol style="margin: 0; padding-left: 1.5em">${lines.join("")}</ol>`;

  $("#alert").dialog({
    resizable: false,
    title: "Seed history",
    position: { my: "center", at: "center", of: "svg" }
  });
}

function restoreSeed(id: number): void {
  const { seed: s, width, height, template } = mapHistory[id] as any;
  ensureEl<HTMLInputElement>("optionsSeed").value = s;
  ensureEl<HTMLInputElement>("mapWidthInput").value = width;
  ensureEl<HTMLInputElement>("mapHeightInput").value = height;
  ensureEl<HTMLInputElement>("templateInput").value = template;

  if (locked("template")) unlock("template");

  regeneratePrompt({ seed: s });
}

function copyMapURL(): void {
  const lockedCount = document.querySelectorAll("i.icon-lock").length;
  const search = `?seed=${optionsSeed.value}&width=${graphWidth}&height=${graphHeight}${lockedCount ? "" : "&options=default"}`;
  navigator.clipboard
    .writeText(location.host + location.pathname + search)
    .then(() => tip("Map URL is copied to clipboard", false, "success", 3000))
    .catch((err: Error) => tip(`Could not copy URL: ${err}`, false, "error", 5000));
}

// ─── Cells density ─────────────────────────────────────────────────────────────

const cellsDensityMap: Record<number, number> = {
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

function changeCellsDensity(value: number): void {
  pointsInput.value = String(value);
  const cells = cellsDensityMap[value] || +(pointsInput.dataset.cells ?? 10000);
  pointsInput.dataset.cells = String(cells);
  pointsOutputFormatted.value = `${cells / 1000}K`;
  pointsOutputFormatted.style.color = getCellsDensityColor(cells);
}

function getCellsDensityColor(cells: number): string {
  return cells > 50000 ? "#b12117" : cells !== 10000 ? "#dfdf12" : "#053305";
}

// ─── Options changes ───────────────────────────────────────────────────────────

function changeCultureSet(): void {
  const max = (culturesSet.selectedOptions[0] as HTMLElement).dataset.max!;
  (culturesInput as HTMLInputElement).max = (culturesOutput as HTMLInputElement).max = max;
  if (+(culturesOutput as HTMLInputElement).value > +max) {
    (culturesInput as HTMLInputElement).value = (culturesOutput as HTMLInputElement).value = max;
  }
}

function changeEmblemShape(emblemShape: string): void {
  const image = document.getElementById("emblemShapeImage") as SVGPathElement | null;
  const shapePath = window.COArenderer && (COArenderer.shieldPaths as any)[emblemShape];
  if (image) shapePath ? image.setAttribute("d", shapePath) : image.removeAttribute("d");

  const specificShape = ["culture", "state", "random"].includes(emblemShape) ? null : emblemShape;
  if (emblemShape === "random")
    pack.cultures
      .filter((c: any) => !c.removed)
      .forEach((c: any) => {
        c.shield = Cultures.getRandomShield();
      });

  const rerenderCOA = (id: string, coa: any) => {
    const coaEl = document.getElementById(id);
    if (!coaEl) return;
    coaEl.remove();
    COArenderer.trigger(id, coa);
  };

  pack.states.forEach((state: any) => {
    if (!state.i || state.removed || !state.coa || state.coa.custom) return;
    const newShield = specificShape || COA.getShield(state.culture);
    if (newShield === state.coa.shield) return;
    state.coa.shield = newShield;
    rerenderCOA(`stateCOA${state.i}`, state.coa);
  });

  pack.provinces.forEach((province: any) => {
    if (!province.i || province.removed || !province.coa || province.coa.custom) return;
    const culture = pack.cells.culture[province.center];
    const newShield = specificShape || COA.getShield(culture, province.state);
    if (newShield === province.coa.shield) return;
    province.coa.shield = newShield;
    rerenderCOA(`provinceCOA${province.i}`, province.coa);
  });

  pack.burgs.forEach((burg: any) => {
    if (!burg.i || burg.removed || !burg.coa || burg.coa.custom) return;
    const newShield = specificShape || COA.getShield(burg.culture, burg.state);
    if (newShield === burg.coa.shield) return;
    burg.coa.shield = newShield;
    rerenderCOA(`burgCOA${burg.i}`, burg.coa);
  });
}

function changeStatesNumber(value: string): void {
  ensureEl("statesNumber").style.color = +value ? "" : "#b12117";
  burgLabels.select("#capital").attr("data-size", Math.max(rn(6 - +value / 20), 3));
  labels.select("#countries").attr("data-size", Math.max(rn(18 - +value / 6), 4));
}

function changeUiSize(value: number): void {
  if (Number.isNaN(value) || value < 0.5) return;

  const max = getUImaxSize();
  if (value > max) value = max;

  uiSize.value = String(value);
  document.getElementsByTagName("body")[0].style.fontSize = `${rn(value * 10, 2)}px`;
  ensureEl("options").style.width = `${value * 300}px`;
}

function getUImaxSize(): number {
  return rn(Math.min(window.innerHeight / 465, window.innerWidth / 302), 1);
}

function changeTooltipSize(value: string): void {
  tooltip.style.fontSize = `calc(${value}px + 0.5vw)`;
}

// ─── Theme / color ─────────────────────────────────────────────────────────────

const THEME_COLOR = "#997787";

function restoreDefaultThemeColor(): void {
  localStorage.removeItem("themeColor");
  changeDialogsTheme(THEME_COLOR, transparencyInput.value);
}

function changeThemeHue(hue: string): void {
  const { s, l } = hsl(themeColorInput.value);
  const newColor = hsl(+hue, s, l).formatHex();
  changeDialogsTheme(newColor, transparencyInput.value);
}

function changeDialogsTheme(themeColor: string, transparency: string): void {
  transparencyInput.value = transparency;
  const alpha = (100 - +transparency) / 100;
  const alphaReduced = Math.min(alpha + 0.3, 1);

  const { h, s, l } = hsl(themeColor || THEME_COLOR);
  themeColorInput.value = themeColor || THEME_COLOR;
  themeHueInput.value = String(h);

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

function initGoogleTranslate(): void {
  const g = (window as any).google;
  new g.translate.TranslateElement(
    { pageLanguage: "en", layout: g.translate.TranslateElement.InlineLayout.VERTICAL },
    "google_translate_element"
  );
}

function resetLanguage(): void {
  const languageSelect = document.querySelector<HTMLSelectElement>("#google_translate_element select");
  if (!languageSelect?.value) return;

  languageSelect.value = "en";
  (languageSelect as any).handleChange(new Event("change"));

  languageSelect.value = "en";
  (languageSelect as any).handleChange(new Event("change"));
}

// ─── Zoom extent ──────────────────────────────────────────────────────────────

function changeZoomExtent(value: string): void {
  if (+zoomExtentMin.value > +zoomExtentMax.value) {
    [zoomExtentMin.value, zoomExtentMax.value] = [zoomExtentMax.value, zoomExtentMin.value];
  }
  const min = Math.max(+zoomExtentMin.value, 0.01);
  const max = Math.min(+zoomExtentMax.value, 200);
  zoomExtentMin.value = String(min);
  zoomExtentMax.value = String(max);
  (zoom as any).scaleExtent([min, max]);
  const scale = minmax(+value, 0.01, 200);
  (zoom as any).scaleTo(svg, scale);
}

function restoreDefaultZoomExtent(): void {
  zoomExtentMin.value = "1";
  zoomExtentMax.value = "20";
  (zoom as any).scaleExtent([1, 20]).scaleTo(svg, 1);
}

// ─── Apply stored options ─────────────────────────────────────────────────────

function applyStoredOptions(): void {
  if (!stored("mapWidth") || !stored("mapHeight")) {
    mapWidthInput.value = String(window.innerWidth);
    mapHeightInput.value = String(window.innerHeight);
  }

  const heightmapId = stored("template");
  if (heightmapId) {
    const name =
      (heightmapTemplates as any)[heightmapId]?.name || (precreatedHeightmaps as any)[heightmapId]?.name || heightmapId;
    applyOption(ensureEl("templateInput"), heightmapId, name);
  }

  if (stored("distanceUnit")) applyOption(distanceUnitInput, stored("distanceUnit")!);
  if (stored("heightUnit")) applyOption(heightUnit, stored("heightUnit")!);

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key === "speakerVoice") continue;

    const input = (document.getElementById(`${key}Input`) || document.getElementById(key)) as HTMLInputElement | null;
    const output = document.getElementById(`${key}Output`) as HTMLInputElement | null;

    const value = stored(key)!;
    if (input) input.value = value;
    if (output) output.value = value;
    lock(key);

    if (key === "points") changeCellsDensity(+value);
    if (key === "distanceScale") distanceScale = +value;

    if (key.slice(0, 5) === "style") applyOption(stylePreset, key, key.slice(5));
  }

  if (stored("winds")) options.winds = stored("winds")!.split(",").map(Number) as any;
  if (stored("temperatureEquator")) options.temperatureEquator = +stored("temperatureEquator")!;
  if (stored("temperatureNorthPole")) options.temperatureNorthPole = +stored("temperatureNorthPole")!;
  if (stored("temperatureSouthPole")) options.temperatureSouthPole = +stored("temperatureSouthPole")!;
  if (stored("military")) options.military = JSON.parse(stored("military")!);

  if (stored("tooltipSize")) changeTooltipSize(stored("tooltipSize")!);
  if (stored("regions")) changeStatesNumber(stored("regions")!);

  (uiSize as HTMLInputElement).max = String(getUImaxSize());
  if (stored("uiSize")) changeUiSize(+stored("uiSize")!);
  else changeUiSize(minmax(rn(+mapWidthInput.value / 1280, 1), 1, 2.5));

  const params = new URL(window.location.href).searchParams;
  const width = +params.get("width")!;
  const height = +params.get("height")!;
  if (width) mapWidthInput.value = String(width);
  if (height) mapHeightInput.value = String(height);

  const transparency = stored("transparency") || "5";
  const themeColor = stored("themeColor") || "";
  changeDialogsTheme(themeColor, transparency);

  setRendering(shapeRendering.value);
  (options as any).stateLabelsMode = stateLabelsModeInput.value;
}

// ─── Randomize options ─────────────────────────────────────────────────────────

function randomizeOptions(): void {
  const randomize = new URL(window.location.href).searchParams.get("options") === "default";

  if (randomize || !locked("points")) changeCellsDensity(4);
  if (randomize || !locked("template")) randomizeHeightmapTemplate();
  if (randomize || !locked("statesNumber")) (statesNumber as HTMLInputElement).value = String(gauss(18, 5, 2, 30));
  if (randomize || !locked("provincesRatio"))
    (provincesRatio as HTMLInputElement).value = String(gauss(20, 10, 20, 100));
  if (randomize || !locked("manors")) {
    manorsInput.value = "1000";
    manorsOutput.value = "auto";
  }
  if (randomize || !locked("religionsNumber")) (religionsNumber as HTMLInputElement).value = String(gauss(6, 3, 2, 10));
  if (randomize || !locked("sizeVariety")) (sizeVariety as HTMLInputElement).value = String(gauss(4, 2, 0, 10, 1));
  if (randomize || !locked("growthRate")) (growthRate as HTMLInputElement).value = String(rn(1 + Math.random(), 1));
  if (randomize || !locked("cultures"))
    (culturesInput as HTMLInputElement).value = (culturesOutput as HTMLInputElement).value = String(
      gauss(12, 3, 5, 30)
    );
  if (randomize || !locked("culturesSet")) randomizeCultureSet();

  if (randomize || !locked("temperatureEquator")) options.temperatureEquator = gauss(25, 7, 20, 35, 0);
  if (randomize || !locked("temperatureNorthPole")) options.temperatureNorthPole = gauss(-25, 7, -40, 10, 0);
  if (randomize || !locked("temperatureSouthPole")) options.temperatureSouthPole = gauss(-15, 7, -40, 10, 0);
  if (randomize || !locked("prec"))
    precInput.value = (precOutput as unknown as HTMLInputElement).value = String(gauss(100, 40, 5, 500));

  const US = navigator.language === "en-US";
  if (randomize || !locked("distanceScale")) {
    const dsv = gauss(3, 1, 1, 5);
    (distanceScaleInput as HTMLInputElement).value = String(dsv);
    distanceScale = dsv;
  }
  if (!stored("distanceUnit")) (distanceUnitInput as HTMLInputElement).value = US ? "mi" : "km";
  if (!stored("heightUnit")) (heightUnit as unknown as HTMLInputElement).value = US ? "ft" : "m";
  if (!stored("temperatureScale")) (temperatureScale as unknown as HTMLInputElement).value = US ? "°F" : "°C";

  generateEra();
}

function randomizeHeightmapTemplate(): void {
  const templates: Record<string, number> = {};
  for (const key in heightmapTemplates) {
    (templates as any)[key] = (heightmapTemplates as any)[key].probability || 0;
  }
  const template = rw(templates);
  const name = (heightmapTemplates as any)[template].name;
  applyOption(ensureEl("templateInput"), template, name);
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
  (culturesSet as HTMLSelectElement).value = rw(sets);
  changeCultureSet();
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function setRendering(value: string): void {
  viewbox.attr("shape-rendering", value);

  if (value === "optimizeSpeed") {
    coastline.select("#sea_island").style("filter", "none");
    statesHalo.style("display", "none");
  } else {
    coastline.select("#sea_island").style("filter", null);
    statesHalo.style("display", null);
    if (pack.cells && statesHalo.selectAll("*").size() === 0) drawStates();
  }
}

// ─── Era ──────────────────────────────────────────────────────────────────────

function generateEra(): void {
  if (!stored("year")) (yearInput as HTMLInputElement).value = String(rand(100, 2000));
  if (!stored("era"))
    (eraInput as HTMLInputElement).value = `${Names.getBaseShort(P(0.7) ? 1 : rand(nameBases.length))} Era`;
  options.year = +(yearInput as HTMLInputElement).value;
  options.era = (eraInput as HTMLInputElement).value;
  options.eraShort = options.era
    .split(" ")
    .map((w: string) => w[0].toUpperCase())
    .join("");
}

function regenerateEra(): void {
  unlock("era");
  options.era = (eraInput as HTMLInputElement).value = `${Names.getBaseShort(P(0.7) ? 1 : rand(nameBases.length))} Era`;
  options.eraShort = options.era
    .split(" ")
    .map((w: string) => w[0].toUpperCase())
    .join("");
}

function changeYear(): void {
  const val = (yearInput as HTMLInputElement).value;
  if (!val) return;
  if (Number.isNaN(+val)) {
    tip("Current year should be a number", false, "error");
    return;
  }
  options.year = +val;
}

function changeEra(): void {
  const val = (eraInput as HTMLInputElement).value;
  if (!val) return;
  lock("era");
  options.era = val;
}

function openTemplateSelectionDialog(): void {
  openHeightmapSelection();
}

// ─── Sticked menu ─────────────────────────────────────────────────────────────

ensureEl("sticked").addEventListener("click", (event: MouseEvent) => {
  const id = (event.target as HTMLElement).id;
  if (id === "newMapButton") regeneratePrompt();
  else if (id === "saveButton") showSavePane();
  else if (id === "exportButton") showExportPane();
  else if (id === "loadButton") showLoadPane();
  else if (id === "zoomReset") resetZoom(1000);
});

function regeneratePrompt(opts?: { seed?: string }): void {
  if (customization) {
    tip("New map cannot be generated when edit mode is active, please exit the mode and retry", false, "error");
    return;
  }
  const workingTime = (Date.now() - last(mapHistory).created) / 60000;
  if (workingTime < 1) {
    (regenerateMap as any)(opts);
    return;
  }

  alertMessage.innerHTML = `Are you sure you want to generate a new map?<br />All unsaved changes made to the current map will be lost`;
  $("#alert").dialog({
    resizable: false,
    title: "Generate new map",
    buttons: {
      Cancel: function (this: Element) {
        $(this).dialog("close");
      },
      Generate: function (this: Element) {
        closeDialogs();
        (regenerateMap as any)(opts);
        $(this).dialog("close");
      }
    }
  });
}

// ─── Save / export / load panes ───────────────────────────────────────────────

function showSavePane(): void {
  const sharableLinkContainer = ensureEl("sharableLinkContainer");
  sharableLinkContainer.style.display = "none";

  $("#saveMapData").dialog({
    title: "Save map",
    resizable: false,
    width: "25em",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Close: function (this: Element) {
        $(this).dialog("close");
      }
    }
  });
}

function copyLinkToClickboard(): void {
  const shrableLink = ensureEl("sharableLink");
  const link = shrableLink.getAttribute("href")!;
  navigator.clipboard.writeText(link).then(() => tip("Link is copied to the clipboard", true, "success", 8000));
}

function showExportPane(): void {
  ensureEl<HTMLInputElement>("showLabels").checked = !(hideLabels as HTMLInputElement).checked;

  $("#exportMapData").dialog({
    title: "Export map data",
    resizable: false,
    width: "26em",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Close: function (this: Element) {
        $(this).dialog("close");
      }
    }
  });
}

function exportToJson(type: string): void {
  exportToJsonModule(type);
}

async function showLoadPane(): Promise<void> {
  $("#loadMapData").dialog({
    title: "Load map",
    resizable: false,
    width: "auto",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Close: function (this: Element) {
        $(this).dialog("close");
      }
    }
  });

  const dropbox = (Cloud as any).providers.dropbox;
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
    files.forEach(({ name, updated, size, path }: any) => {
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

async function connectToDropbox(): Promise<void> {
  await (Cloud as any).providers.dropbox.initialize();
  if ((Cloud as any).providers.dropbox.api) showLoadPane();
}

function loadURL(): void {
  const pattern = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
  const inner = `Provide URL to map file:
    <input id="mapURL" type="url" style="width: 24em" placeholder="https://e-cloud.com/test.map">
    <br><i>Please note server should allow CORS for file to be loaded. If CORS is not allowed, save file to Dropbox and provide a direct link</i>`;
  alertMessage.innerHTML = inner;
  $("#alert").dialog({
    resizable: false,
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
        $(this).dialog("close");
      },
      Cancel: function (this: Element) {
        $(this).dialog("close");
      }
    }
  });
}

ensureEl<HTMLInputElement>("mapToLoad").addEventListener("change", function (this: HTMLInputElement) {
  const fileToLoad = this.files![0];
  this.value = "";
  closeDialogs();
  uploadMap(fileToLoad);
});

// ─── PNG tiles export ─────────────────────────────────────────────────────────

function openExportToPngTiles(): void {
  ensureEl("tileStatus").innerHTML = "";
  closeDialogs();
  updateTilesOptions();

  const inputs = ensureEl("exportToPngTilesScreen").querySelectorAll<HTMLInputElement>("input");
  inputs.forEach(input => {
    input.addEventListener("input", updateTilesOptions);
  });

  $("#exportToPngTilesScreen").dialog({
    resizable: false,
    title: "Download tiles",
    width: "23em",
    buttons: {
      Download: () => (window as any).exportToPngTiles(),
      Cancel: function (this: Element) {
        $(this).dialog("close");
      }
    },
    close: () => {
      inputs.forEach(input => {
        input.removeEventListener("input", updateTilesOptions);
      });
      debug.selectAll("*").remove();
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

  debug.html(
    `<g fill='none' stroke='#000'>${rects.join("")}</g>` +
      `<g fill='#000' stroke='none' text-anchor='middle' dominant-baseline='central' font-size='18px'>${labelItems.join("")}</g>`
  );
}

// ─── View mode / 3D ───────────────────────────────────────────────────────────

viewMode.addEventListener("click", changeViewMode);

function changeViewMode(event: MouseEvent): void {
  const button = event.target as HTMLElement;
  if (button.tagName !== "BUTTON") return;
  const pressed = button.classList.contains("pressed");
  enterStandardView();

  if (!pressed && button.id !== "viewStandard") {
    viewStandard.classList.remove("pressed");
    button.classList.add("pressed");
    enter3dView(button.id);
  }
}

function enterStandardView(): void {
  viewMode.querySelectorAll(".pressed").forEach(button => {
    button.classList.remove("pressed");
  });
  heightmap3DView.classList.remove("pressed");
  viewStandard.classList.add("pressed");

  if (!document.getElementById("canvas3d")) return;
  ThreeD.stop();
  ensureEl("canvas3d").remove();
  if (options3dUpdate.offsetParent) ($("#options3d") as any).dialog("close");
  if (preview3d.offsetParent) ($("#preview3d") as any).dialog("close");
}

async function enter3dView(type: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.id = "canvas3d";
  canvas.dataset.type = type;

  if (type === "heightmap3DView") {
    canvas.width = parseFloat(preview3d.style.width) || graphWidth / 3;
    canvas.height = canvas.width / (graphWidth / graphHeight);
    canvas.style.display = "block";
  } else {
    canvas.width = svgWidth;
    canvas.height = svgHeight;
    canvas.style.position = "absolute";
    canvas.style.display = "none";
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
    ($("#preview3d") as any).dialog({
      title: "3D Preview",
      resizable: true,
      position: { my: "left bottom", at: "left+10 bottom-20", of: "svg" },
      resizeStop: resize3d,
      close: enterStandardView
    });
  } else document.body.insertBefore(canvas, optionsContainer);

  toggle3dOptions();
}

function resize3d(): void {
  const canvas = ensureEl<HTMLCanvasElement>("canvas3d");
  canvas.width = parseFloat(preview3d.style.width);
  canvas.height = parseFloat(preview3d.style.height) - 2;
  ThreeD.redraw();
}

function toggle3dOptions(): void {
  if (options3dUpdate.offsetParent) {
    ($("#options3d") as any).dialog("close");
    return;
  }
  ($("#options3d") as any).dialog({
    title: "3D mode settings",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-30 top+10", of: "svg", collision: "fit" }
  });

  updateValues();

  if (modules.options3d) return;
  modules.options3d = true;

  ensureEl("options3dUpdate").addEventListener("click", ThreeD.update);
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
    (options3dLightnessRange as HTMLInputElement).value = (options3dLightnessNumber as HTMLInputElement).value = String(
      ThreeD.options.lightness * 100
    );
    (options3dSunX as HTMLInputElement).value = ThreeD.options.sun.x;
    (options3dSunY as HTMLInputElement).value = ThreeD.options.sun.y;
    (options3dMeshRotationRange as HTMLInputElement).value = (options3dMeshRotationNumber as HTMLInputElement).value =
      ThreeD.options.rotateMesh;
    (options3dMeshSkinResolution as HTMLInputElement).value = ThreeD.options.resolutionScale;
    (options3dGlobeRotationRange as HTMLInputElement).value = (options3dGlobeRotationNumber as HTMLInputElement).value =
      ThreeD.options.rotateGlobe;
    (options3dMeshLabels3d as HTMLInputElement).value = ThreeD.options.labels3d;
    (options3dMeshSkyMode as HTMLInputElement).value = ThreeD.options.extendedWater;
    options3dColorSection.style.display = ThreeD.options.extendedWater ? "block" : "none";
    (options3dMeshSky as HTMLInputElement).value = ThreeD.options.skyColor;
    (options3dMeshWater as HTMLInputElement).value = ThreeD.options.waterColor;
    (options3dGlobeResolution as HTMLInputElement).value = ThreeD.options.resolution;
    (options3dSunColor as HTMLInputElement).value = ThreeD.options.sunColor;
    (options3dSubdivide as HTMLInputElement).value = ThreeD.options.subdivide;
    updateTimeOfDayPreset();
  }

  function updateTimeOfDayPreset(): void {
    const presetSelect = ensureEl<HTMLSelectElement>("options3dTimeOfDay");
    if (!presetSelect) return;

    const { sun, sunColor, lightness } = ThreeD.options;

    let matchingPreset = "custom";
    for (const [name, preset] of Object.entries(ThreeD.timeOfDayPresets) as [string, any][]) {
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
    ThreeD.setSun(x, y);
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
    ThreeD.setResolution(this.value);
  }
}

// ─── Global registration ───────────────────────────────────────────────────────

window.showOptions = showOptions;
window.hideOptions = hideOptions;
window.toggleOptions = toggleOptions;
window.applyGraphSize = applyGraphSize;
window.fitMapToScreen = fitMapToScreen;
window.applyStoredOptions = applyStoredOptions;
window.randomizeOptions = randomizeOptions;
window.randomizeHeightmapTemplate = randomizeHeightmapTemplate;
window.randomizeCultureSet = randomizeCultureSet;
window.generateEra = generateEra;
window.regenerateEra = regenerateEra;
window.changeYear = changeYear;
window.changeEra = changeEra;
window.changeCellsDensity = changeCellsDensity;
window.cellsDensityMap = cellsDensityMap;
window.getCellsDensityColor = getCellsDensityColor;
window.changeCultureSet = changeCultureSet;
window.changeEmblemShape = changeEmblemShape;
window.changeStatesNumber = changeStatesNumber;
window.changeUiSize = changeUiSize;
window.changeTooltipSize = changeTooltipSize;
window.changeThemeHue = changeThemeHue;
window.changeDialogsTheme = changeDialogsTheme;
window.restoreDefaultThemeColor = restoreDefaultThemeColor;
window.setRendering = setRendering;
window.regeneratePrompt = regeneratePrompt;
window.showSavePane = showSavePane;
window.showExportPane = showExportPane;
window.showLoadPane = showLoadPane;
window.copyLinkToClickboard = copyLinkToClickboard;
window.exportToJson = exportToJson;
window.connectToDropbox = connectToDropbox;
window.loadURL = loadURL;
window.openExportToPngTiles = openExportToPngTiles;
window.updateTilesOptions = updateTilesOptions as any;
window.enterStandardView = enterStandardView;
window.enter3dView = enter3dView;
window.toggle3dOptions = toggle3dOptions;
window.resize3d = resize3d;
window.showSupporters = showSupporters;
window.showSeedHistoryDialog = showSeedHistoryDialog;
window.restoreSeed = restoreSeed;
window.copyMapURL = copyMapURL;
window.initGoogleTranslate = initGoogleTranslate;
window.openTemplateSelectionDialog = openTemplateSelectionDialog;
