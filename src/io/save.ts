import { getUsedFonts } from "../modules/fonts";
import { useOptionsState } from "../store/optionsState";
import { openRichDialog } from "../ui/dialogs/dialogService";
import { ensureEl, link, parseError, ra, rn } from "../utils";

// ─── Map serialization ────────────────────────────────────────────────────────

export function prepareMapData(): string {
  const date = new Date();
  const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const license = "File can be loaded in azgaar.github.io/Fantasy-Map-Generator";
  const params = [VERSION, license, dateString, seed, graphWidth, graphHeight, mapId].join("|");
  const settings = [
    distanceUnitInput.value,
    distanceScale,
    areaUnit.value,
    heightUnit.value,
    heightExponentInput.value,
    temperatureScale.value,
    "", // previously used for barSize.value
    "", // previously used for barLabel.value
    "", // previously used for barBackColor.value
    "", // previously used for barBackColor.value
    "", // previously used for barPosX.value
    "", // previously used for barPosY.value
    populationRate,
    urbanization,
    mapSizeOutput.value,
    latitudeOutput.value,
    "", // previously used for temperatureEquatorOutput.value
    "", // previously used for tempNorthOutput.value
    precOutput.value,
    JSON.stringify(options),
    useOptionsState.getState().mapName,
    +hideLabels.checked,
    stylePreset.value,
    +rescaleLabels.checked,
    urbanDensity,
    longitudeOutput.value,
    growthRate.value
  ].join("|");
  const coords = JSON.stringify(mapCoordinates);
  const biomes = [biomesData.color, biomesData.habitability, biomesData.name].join("|");
  const notesData = JSON.stringify(notes);
  const rulersString = rulers.toString();
  const fonts = JSON.stringify(getUsedFonts(svg.node()!));

  // clone SVG and reset transform to defaults
  const cloneEl = document.getElementById("map")!.cloneNode(true) as SVGSVGElement;
  cloneEl.setAttribute("width", String(graphWidth));
  cloneEl.setAttribute("height", String(graphHeight));
  cloneEl.querySelector("#viewbox")!.removeAttribute("transform");
  cloneEl.querySelector("#ruler")!.innerHTML = "";

  cloneEl.querySelectorAll("#routes > #roads path, #routes > #trails path, #routes > #searoutes path").forEach(path => {
    path.setAttribute("fill", "none");
  });
  cloneEl.querySelectorAll("#borders > #stateBorders path, #borders > #provinceBorders path").forEach(path => {
    path.setAttribute("fill", "none");
  });

  const serializedSVG = new XMLSerializer().serializeToString(cloneEl);

  const { spacing, cellsX, cellsY, boundary, points, features, cellsDesired } = grid;
  const gridGeneral = JSON.stringify({ spacing, cellsX, cellsY, boundary, points, features, cellsDesired });
  const packFeatures = JSON.stringify(pack.features);
  const cultures = JSON.stringify(pack.cultures);
  const states = JSON.stringify(pack.states);
  const burgs = JSON.stringify(pack.burgs);
  const religions = JSON.stringify(pack.religions);
  const provinces = JSON.stringify(pack.provinces);
  const rivers = JSON.stringify(pack.rivers);
  const markers = JSON.stringify(pack.markers);
  const cellRoutes = JSON.stringify(pack.cells.routes);
  const routes = JSON.stringify(pack.routes);
  const zones = JSON.stringify(pack.zones);
  const ice = JSON.stringify(pack.ice);

  // store name array only if not the same as default
  const defaultNB = Names.getNameBases();
  const namesData = nameBases
    .map((b, i) => {
      const names = defaultNB[i] && defaultNB[i].b === b.b ? "" : b.b;
      return `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${names}`;
    })
    .join("/");

  // round population to save space
  const pop = Array.from(pack.cells.pop).map(p => rn(p, 4));

  const mapData = [
    params,
    settings,
    coords,
    biomes,
    notesData,
    serializedSVG,
    gridGeneral,
    grid.cells.h,
    grid.cells.prec,
    grid.cells.f,
    grid.cells.t,
    grid.cells.temp,
    packFeatures,
    cultures,
    states,
    burgs,
    pack.cells.biome,
    pack.cells.burg,
    pack.cells.conf,
    pack.cells.culture,
    pack.cells.fl,
    pop,
    pack.cells.r,
    [], // deprecated pack.cells.road
    pack.cells.s,
    pack.cells.state,
    pack.cells.religion,
    pack.cells.province,
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
    ice
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
  const URL = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL;
  a.click();
  tip('Map is saved to the "Downloads" folder (CTRL + J to open)', true, "success", 8000);
  setTimeout(() => window.URL.revokeObjectURL(URL), 5000);
}

async function saveToDropbox(mapData: string, filename: string): Promise<void> {
  await Cloud.providers.dropbox.save(filename, mapData);
  tip("Map is saved to your Dropbox", true, "success", 8000);
}

// ─── Main save entry point ────────────────────────────────────────────────────

export async function saveMap(method: string): Promise<void> {
  if (customization) return tip("Map cannot be saved in EDIT mode, please complete the edit and retry", false, "error");
  closeDialogs("#alert");

  try {
    const mapData = prepareMapData();
    const filename = `${getFileName()}.map`;

    if (method === "storage") await saveToStorage(mapData, true);
    if (method === "machine") saveToMachine(mapData, filename);
    if (method === "dropbox") await saveToDropbox(mapData, filename);
  } catch (error) {
    ERROR && console.error(error);
    alertMessage.innerHTML = /* html */ `An error occurred while saving the map. If the issue persists, please copy the message below and report it on ${link(
      "https://github.com/Azgaar/Fantasy-Map-Generator/issues",
      "GitHub"
    )}. <p id="errorBox">${parseError(error)}</p>`;

    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Saving error",
      width: "28em",
      buttons: {
        Retry: () => {
          /* $(this).dialog("close") removed */
          saveMap(method);
        },
        Close: () => {
          /* $(this).dialog("close") removed */
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });
  }
}

// ─── Autosave ─────────────────────────────────────────────────────────────────

export async function initiateAutosave(): Promise<void> {
  const MINUTE = 60000;
  let lastSavedAt = Date.now();

  async function autosave() {
    const timeoutMinutes = (ensureEl("autosaveIntervalOutput") as HTMLInputElement).valueAsNumber;
    if (!timeoutMinutes) return;

    const diffInMinutes = (Date.now() - lastSavedAt) / MINUTE;
    if (diffInMinutes < timeoutMinutes) return;
    if (customization) return tip("Autosave: map cannot be saved in edit mode", false, "warning" as never, 2000);

    try {
      tip("Autosave: saving map...", false, "warning" as never, 3000);
      const mapData = prepareMapData();
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
    if (customization) return;
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
        if (customization) return;
        tip(ra(["Please remember to save the map to your desktop"]), true, "warn" as never, 2500);
      },
      15 * 60 * 1000
    );
  }
}

// ─── Global exports ───────────────────────────────────────────────────────────

window.prepareMapData = prepareMapData;
window.saveToStorage = saveToStorage;
window.saveToMachine = saveToMachine;
window.saveMap = saveMap;
window.initiateAutosave = initiateAutosave;
window.toggleSaveReminder = toggleSaveReminder;
