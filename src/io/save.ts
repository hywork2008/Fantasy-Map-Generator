import { worldContext } from "../context/worldContext";
import { Names } from "../generators/names-generator";
import { appendOceanPathsToSaveSVG } from "../renderers/ocean-layers";
import { withSvgSnapshot } from "../services/svgSnapshot";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { rulers } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import { closeDialogs, openConfirm } from "../ui/dialogs/dialogService";
import { createObjectURL, link, parseError, ra, revokeObjectURL, rn } from "../utils";
import { ERROR } from "../utils/debug";
import { getFileName } from "../utils/editorHelpers";
import { VERSION } from "../versioning";
import { Cloud } from "./cloud";
import { getUsedFonts } from "./export";
import { ldb } from "./ldb";

// ─── Map serialization ────────────────────────────────────────────────────────

export async function prepareMapData(): Promise<string> {
  return withSvgSnapshot(prepareMapDataFromSvg);
}

function prepareMapDataFromSvg(): string {
  const date = new Date();
  const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const license = "File can be loaded in azgaar.github.io/Fantasy-Map-Generator";
  const params = [
    VERSION,
    license,
    dateString,
    worldContext.seed,
    worldContext.graphWidth,
    worldContext.graphHeight,
    worldContext.mapId
  ].join("|");
  const options = useOptionsState.getState();
  const settings = [
    options.distanceUnit,
    worldContext.distanceScale,
    options.areaUnit,
    options.heightUnit,
    options.heightExponent,
    options.temperatureScale,
    "", // previously used for barSize.value
    "", // previously used for barLabel.value
    "", // previously used for barBackColor.value
    "", // previously used for barBackColor.value
    "", // previously used for barPosX.value
    "", // previously used for barPosY.value
    worldContext.populationRate,
    worldContext.urbanization,
    options.mapSize,
    options.latitude,
    "", // previously used for temperatureEquatorOutput.value
    "", // previously used for tempNorthOutput.value
    options.prec,
    JSON.stringify(worldContext.options),
    options.mapName,
    +options.hideLabels,
    options.stylePreset,
    +options.rescaleLabels,
    worldContext.urbanDensity,
    options.longitude,
    options.growthRate
  ].join("|");
  const coords = JSON.stringify(worldContext.mapCoordinates);
  const biomes = [
    worldContext.biomesData.color,
    worldContext.biomesData.habitability,
    worldContext.biomesData.name
  ].join("|");
  const notesData = JSON.stringify(worldContext.notes);
  const rulersString = rulers.toString();
  const fonts = JSON.stringify(getUsedFonts(view.svg.node()!));

  // clone SVG and reset transform to defaults
  const cloneEl = document.getElementById("map")!.cloneNode(true) as SVGSVGElement;
  cloneEl.setAttribute("width", String(worldContext.graphWidth));
  cloneEl.setAttribute("height", String(worldContext.graphHeight));
  cloneEl.querySelector("#viewbox")!.removeAttribute("transform");
  cloneEl.querySelector("#ruler")!.innerHTML = "";

  // Remove zoom/viewport culling classes so the serialized SVG has all elements visible
  // CSSでhiddenクラスを設定していないので無意味。style="display:none"があれば、Inkscape等で要素が非表示になる。
  cloneEl.querySelectorAll(".hidden").forEach(el => {
    el.classList.remove("hidden");
  });

  // Inject required icon definitions into the cloned SVG so extracted SVGs are self-contained
  const cloneDefs = cloneEl.querySelector("defs");
  const svgDefs = document.getElementById("defElements");
  if (cloneDefs && svgDefs) {
    if (cloneEl.getElementById("burgIcons")) {
      const groups = cloneEl.getElementById("burgIcons")!.querySelectorAll("g");
      for (const group of Array.from(groups)) {
        const icon = svgDefs.querySelector((group as SVGGElement).dataset.icon ?? "");
        if (icon && !cloneDefs.querySelector(`#${icon.id}`)) {
          const clonedIcon = icon.cloneNode(true) as Element;
          clonedIcon.setAttribute("width", "1");
          clonedIcon.setAttribute("height", "1");
          cloneDefs.appendChild(clonedIcon);
        }
      }
    }
    if (cloneEl.getElementById("anchors")) {
      const anchor = svgDefs.querySelector("#icon-anchor");
      if (anchor && !cloneDefs.querySelector("#icon-anchor")) {
        const clonedAnchor = anchor.cloneNode(true) as Element;
        clonedAnchor.setAttribute("width", "1");
        clonedAnchor.setAttribute("height", "1");
        cloneDefs.appendChild(clonedAnchor);
      }
    }
  }

  appendOceanPathsToSaveSVG(cloneEl.querySelector("#oceanLayers"));

  cloneEl.querySelectorAll("#routes > #roads path, #routes > #trails path, #routes > #searoutes path").forEach(path => {
    path.setAttribute("fill", "none");
  });
  cloneEl.querySelectorAll("#borders > #stateBorders path, #borders > #provinceBorders path").forEach(path => {
    path.setAttribute("fill", "none");
  });

  const serializedSVG = new XMLSerializer().serializeToString(cloneEl);

  const { spacing, cellsX, cellsY, boundary, points, features, cellsDesired } = worldContext.grid;
  const gridGeneral = JSON.stringify({ spacing, cellsX, cellsY, boundary, points, features, cellsDesired });
  const packFeatures = JSON.stringify(worldContext.pack.features);
  const cultures = JSON.stringify(worldContext.pack.cultures);
  const states = JSON.stringify(worldContext.pack.states);
  const burgs = JSON.stringify(worldContext.pack.burgs);
  const religions = JSON.stringify(worldContext.pack.religions);
  const provinces = JSON.stringify(worldContext.pack.provinces);
  const rivers = JSON.stringify(worldContext.pack.rivers);
  const markers = JSON.stringify(worldContext.pack.markers);
  const cellRoutes = JSON.stringify(worldContext.pack.cells.routes);
  const routes = JSON.stringify(worldContext.pack.routes);
  const zones = JSON.stringify(worldContext.pack.zones);
  const ice = JSON.stringify(worldContext.pack.ice);
  const goods = JSON.stringify(worldContext.pack.goods ?? []);
  const markets = JSON.stringify(worldContext.pack.markets ?? []);
  const deals = JSON.stringify(worldContext.pack.deals ?? []);
  const characters = JSON.stringify(worldContext.pack.characters ?? []);

  // store name array only if not the same as default
  const defaultNB = Names.getNameBases();
  const namesData = worldContext.nameBases
    .map((b, i) => {
      const names = defaultNB[i] && defaultNB[i].b === b.b ? "" : b.b;
      return `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${names}`;
    })
    .join("/");

  // round population to save space
  const pop = Array.from(worldContext.pack.cells.pop).map(p => rn(p, 4));
  const capacity = Array.from(worldContext.pack.cells.capacity ?? []).map(p => rn(p, 4));
  const demoChildren = Array.from(worldContext.pack.cells.children ?? []).map(p => rn(p, 4));
  const demoMaleAdults = Array.from(worldContext.pack.cells.maleAdults ?? []).map(p => rn(p, 4));
  const demoFemaleAdults = Array.from(worldContext.pack.cells.femaleAdults ?? []).map(p => rn(p, 4));
  const demoElders = Array.from(worldContext.pack.cells.elders ?? []).map(p => rn(p, 4));

  const mapData = [
    params,
    settings,
    coords,
    biomes,
    notesData,
    serializedSVG,
    gridGeneral,
    worldContext.grid.cells.h,
    worldContext.grid.cells.prec,
    worldContext.grid.cells.f,
    worldContext.grid.cells.t,
    worldContext.grid.cells.temp,
    packFeatures,
    cultures,
    states,
    burgs,
    worldContext.pack.cells.biome,
    worldContext.pack.cells.burg,
    worldContext.pack.cells.conf,
    worldContext.pack.cells.culture,
    worldContext.pack.cells.fl,
    pop,
    worldContext.pack.cells.r,
    [], // deprecated pack.cells.road
    worldContext.pack.cells.s,
    worldContext.pack.cells.state,
    worldContext.pack.cells.religion,
    worldContext.pack.cells.province,
    [], // deprecated pack.cells.crossroad
    religions,
    provinces,
    namesData,
    rivers,
    rulersString,
    fonts,
    markers,
    cellRoutes,
    routes,
    zones,
    ice,
    worldContext.pack.cells.good ?? new Uint16Array(0), // [40] cells.good
    goods, // [41] goods
    markets, // [42] markets
    deals, // [43] deals
    worldContext.pack.cells.market ?? new Uint16Array(0), // [44] cells.market
    characters, // [45] characters
    capacity, // [46] cells.capacity
    demoChildren, // [47] cells.children
    demoMaleAdults, // [48] cells.maleAdults
    demoFemaleAdults, // [49] cells.femaleAdults
    demoElders // [50] cells.elders
  ].join("\r\n");

  return mapData;
}

// ─── Save targets ─────────────────────────────────────────────────────────────

export async function saveToStorage(mapData: string, showTip = false): Promise<void> {
  const blob = new Blob([mapData], { type: "text/plain" });
  await ldb.set("lastMap", blob);
  if (showTip) tip("Map is saved to the browser storage", false, "success");
}

export function saveToMachine(mapData: string, filename: string): void {
  const blob = new Blob([mapData], { type: "text/plain" });
  const URL = createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL;
  a.click();
  tip('Map is saved to the "Downloads" folder (CTRL + J to open)', true, "success", 8000);
  revokeObjectURL(URL, 5000);
}

async function saveToDropbox(mapData: string, filename: string): Promise<void> {
  await Cloud.providers.dropbox.save(filename, mapData);
  tip("Map is saved to your Dropbox", true, "success", 8000);
}

// ─── Main save entry point ────────────────────────────────────────────────────

export async function saveMap(method: string): Promise<void> {
  if (view.customization)
    return tip("Map cannot be saved in EDIT mode, please complete the edit and retry", false, "error");
  closeDialogs("#alert");

  try {
    const mapData = await prepareMapData();
    const filename = `${getFileName()}.map`;

    if (method === "storage") await saveToStorage(mapData, true);
    if (method === "machine") saveToMachine(mapData, filename);
    if (method === "dropbox") await saveToDropbox(mapData, filename);
  } catch (error) {
    ERROR && console.error(error);
    openConfirm(
      `An error occurred while saving the map. If the issue persists, please copy the message below and report it on ${link(
        "https://github.com/Azgaar/Fantasy-Map-Generator/issues",
        "GitHub"
      )}. <p id="errorBox">${parseError(error)}</p>`,
      {
        title: "Saving error",
        confirm: "Retry",
        cancel: "Close",
        onConfirm: () => saveMap(method)
      }
    );
  }
}

// ─── Autosave ─────────────────────────────────────────────────────────────────

export async function initiateAutosave(): Promise<void> {
  const MINUTE = 60000;
  let lastSavedAt = Date.now();

  async function autosave() {
    const timeoutMinutes = useOptionsState.getState().autosaveInterval;
    if (!timeoutMinutes) return;

    const diffInMinutes = (Date.now() - lastSavedAt) / MINUTE;
    if (diffInMinutes < timeoutMinutes) return;
    if (view.customization) return tip("Autosave: map cannot be saved in edit mode", false, "warning" as never, 2000);

    try {
      tip("Autosave: saving map...", false, "warning" as never, 3000);
      const mapData = await prepareMapData();
      await saveToStorage(mapData);
      tip("Autosave: map is saved", false, "success", 2000);
      lastSavedAt = Date.now();
    } catch (error) {
      ERROR && console.error(error);
      tip(`Autosave failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 4000);
    }
  }

  setInterval(autosave, MINUTE / 2);
}

// ─── Save reminder ────────────────────────────────────────────────────────────

const saveReminder = (() => {
  if (localStorage.getItem("noReminder")) return;

  const message = [
    "Please don't forget to save the project to desktop from time to time",
    "Please remember to save the map to your desktop",
    "Saving will ensure your data won't be lost in case of issues",
    "Safety is number one priority. Please save the map",
    "Don't forget to save your map on a regular basis!",
    "Just a gentle reminder for you to save the map",
    "Please don't forget to save your progress (saving to desktop is the best option)",
    "Don't want to get reminded about need to save? Press CTRL+Q"
  ];
  const interval = 15 * 60 * 1000;

  const reminderId = setInterval(() => {
    if (view.customization) return;
    tip(ra(message), true, "warn" as never, 2500);
  }, interval);

  return { reminderId, status: 1 };
})();

const saveReminderState = saveReminder ?? { reminderId: 0, status: 0 };

export function toggleSaveReminder(): void {
  if (saveReminderState.status) {
    tip("Save reminder is turned off. Press CTRL+Q again to re-initiate", true, "warn" as never, 2000);
    clearInterval(saveReminderState.reminderId);
    localStorage.setItem("noReminder", "true");
    saveReminderState.status = 0;
  } else {
    tip("Save reminder is turned on. Press CTRL+Q to turn off", true, "warn" as never, 2000);
    localStorage.removeItem("noReminder");
    saveReminderState.status = 1;
    saveReminderState.reminderId = setInterval(
      () => {
        if (view.customization) return;
        tip(ra(["Please remember to save the map to your desktop"]), true, "warn" as never, 2500);
      },
      15 * 60 * 1000
    );
  }
}
