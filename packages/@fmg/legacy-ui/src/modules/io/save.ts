"use strict";

import { getFileName } from "../ui/editors";
import { Biomes } from "@fmg/core/modules/biomes";
import { link, parseError } from "@fmg/shared";
import { VERSION } from "../../versioning";

type SaveMethod = "storage" | "machine" | "dropbox";

const saveRuntime = globalThis as any;

// functions to save the whole .map project
export async function saveMap(method: SaveMethod): Promise<void> {
  if (saveRuntime.customization) return saveRuntime.tip("Map cannot be saved in EDIT mode, please complete the edit and retry", false, "error");
  saveRuntime.closeDialogs("#alert");

  try {
    const mapData = prepareMapData();
    const filename = getFileName() + ".map";

    if (method === "storage") await saveToStorage(mapData, true);
    if (method === "machine") saveToMachine(mapData, filename);
    if (method === "dropbox") await saveToDropbox(mapData, filename);
  } catch (error) {
    saveRuntime.ERROR && console.error(error);
    saveRuntime.alertMessage.innerHTML = /* html */ `An error occurred while saving the map. If the issue persists, please copy the message below and report it on ${link(
      "https://github.com/Azgaar/Fantasy-Map-Generator/issues",
      "GitHub"
    )}. <p id="errorBox">${parseError(error as Error)}</p>`;

    $("#alert").dialog({
      resizable: false,
      title: "Saving error",
      width: "28em",
      buttons: {
        Retry: function () {
          $(this).dialog("close");
          saveMap(method);
        },
        Close: function () {
          $(this).dialog("close");
        }
      },
      position: {my: "center", at: "center", of: "svg"}
    });
  }
}

function prepareMapData(): string {
  const date = new Date();
  const dateString = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
  const license = "File can be loaded in azgaar.github.io/Fantasy-Map-Generator";
  const mapVersion = saveRuntime.VERSION || VERSION;
  const params = [
    mapVersion,
    license,
    dateString,
    saveRuntime.seed,
    saveRuntime.graphWidth,
    saveRuntime.graphHeight,
    saveRuntime.mapId
  ].join("|");
  const settings = [
    saveRuntime.distanceUnitInput.value,
    saveRuntime.distanceScale,
    saveRuntime.areaUnit.value,
    saveRuntime.heightUnit.value,
    saveRuntime.heightExponentInput.value,
    saveRuntime.temperatureScale.value,
    "", // previously used for barSize.value
    "", // previously used for barLabel.value
    "", // previously used for barBackColor.value
    "", // previously used for barBackColor.value
    "", // previously used for barPosX.value
    "", // previously used for barPosY.value
    saveRuntime.populationRate,
    saveRuntime.urbanization,
    saveRuntime.mapSizeOutput.value,
    saveRuntime.latitudeOutput.value,
    "", // previously used for temperatureEquatorOutput.value
    "", // previously used for tempNorthOutput.value
    saveRuntime.precOutput.value,
    JSON.stringify(saveRuntime.options),
    saveRuntime.mapName.value,
    +saveRuntime.hideLabels.checked,
    saveRuntime.stylePreset.value,
    +saveRuntime.rescaleLabels.checked,
    saveRuntime.urbanDensity,
    saveRuntime.longitudeOutput.value,
    saveRuntime.growthRate.value
  ].join("|");
  const coords = JSON.stringify(saveRuntime.mapCoordinates);
  const biomesData = saveRuntime.biomesData || Biomes.getDefault();
  saveRuntime.biomesData = biomesData;
  const biomes = [biomesData.color, biomesData.habitability, biomesData.name].join("|");
  const notesData = JSON.stringify(saveRuntime.notes);
  const rulersString = saveRuntime.rulers ? saveRuntime.rulers.toString() : "";

  // save svg
  const cloneEl = document.getElementById("map")?.cloneNode(true) as SVGSVGElement | null;
  if (!cloneEl) throw new Error("Map SVG element is not found");

  const fonts = JSON.stringify(window.getUsedFonts(cloneEl));

  // reset transform values to default
  cloneEl.setAttribute("width", String(saveRuntime.graphWidth));
  cloneEl.setAttribute("height", String(saveRuntime.graphHeight));
  cloneEl.querySelector("#viewbox")?.removeAttribute("transform");

  const rulerNode = cloneEl.querySelector("#ruler") as HTMLElement | null;
  if (rulerNode) rulerNode.innerHTML = ""; // always remove rulers
  
  cloneEl
    .querySelectorAll("#routes > #roads path, #routes > #trails path, #routes > #searoutes path")
    .forEach(path => path.setAttribute("fill", "none"));
  
  cloneEl
    .querySelectorAll("#borders > #stateBorders path, #borders > #provinceBorders path")
    .forEach(path => path.setAttribute("fill", "none"));

  const serializedSVG = new XMLSerializer().serializeToString(cloneEl);

  const {spacing, cellsX, cellsY, boundary, points, features, cellsDesired} = saveRuntime.grid;
  const gridGeneral = JSON.stringify({spacing, cellsX, cellsY, boundary, points, features, cellsDesired});
  const packFeatures = JSON.stringify(saveRuntime.pack.features);
  const cultures = JSON.stringify(saveRuntime.pack.cultures);
  const states = JSON.stringify(saveRuntime.pack.states);
  const burgs = JSON.stringify(saveRuntime.pack.burgs);
  const religions = JSON.stringify(saveRuntime.pack.religions);
  const provinces = JSON.stringify(saveRuntime.pack.provinces);
  const rivers = JSON.stringify(saveRuntime.pack.rivers);
  const markers = JSON.stringify(saveRuntime.pack.markers);
  const cellRoutes = JSON.stringify(saveRuntime.pack.cells.routes);
  const routes = JSON.stringify(saveRuntime.pack.routes);
  const zones = JSON.stringify(saveRuntime.pack.zones);
  const ice = JSON.stringify(saveRuntime.pack.ice);

  // store name array only if not the same as default
  const defaultNB = saveRuntime.Names.getNameBases();
  const nameBases = saveRuntime.nameBases || defaultNB;
  saveRuntime.nameBases = nameBases;
  const namesData = nameBases
    .map((b, i) => {
      const names = defaultNB[i] && defaultNB[i].b === b.b ? "" : b.b;
      return `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${names}`;
    })
    .join("/");

  // round population to save space
  const pop = Array.from(saveRuntime.pack.cells.pop).map((p: number) => window.rn(p, 4));

  // data format as below
  const mapData = [
    params,
    settings,
    coords,
    biomes,
    notesData,
    serializedSVG,
    gridGeneral,
    saveRuntime.grid.cells.h,
    saveRuntime.grid.cells.prec,
    saveRuntime.grid.cells.f,
    saveRuntime.grid.cells.t,
    saveRuntime.grid.cells.temp,
    packFeatures,
    cultures,
    states,
    burgs,
    saveRuntime.pack.cells.biome,
    saveRuntime.pack.cells.burg,
    saveRuntime.pack.cells.conf,
    saveRuntime.pack.cells.culture,
    saveRuntime.pack.cells.fl,
    pop,
    saveRuntime.pack.cells.r,
    [], // deprecated pack.cells.road
    saveRuntime.pack.cells.s,
    saveRuntime.pack.cells.state,
    saveRuntime.pack.cells.religion,
    saveRuntime.pack.cells.province,
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

// save map file to indexedDB
export async function saveToStorage(mapData: string, showTip = false): Promise<void> {
  const blob = new Blob([mapData], {type: "text/plain"});
  await saveRuntime.ldb.set("lastMap", blob);
  showTip && saveRuntime.tip("Map is saved to the browser storage", false, "success");
}

// download map file
export function saveToMachine(mapData: string, filename: string): void {
  const blob = new Blob([mapData], {type: "text/plain"});
  const URL = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.download = filename;
  link.href = URL;
  link.click();

  saveRuntime.tip('Map is saved to the "Downloads" folder (CTRL + J to open)', true, "success", 8000);
  setTimeout(() => window.URL.revokeObjectURL(URL), 5000);
}

export async function saveToDropbox(mapData: string, filename: string): Promise<void> {
  await saveRuntime.Cloud.providers.dropbox.save(filename, mapData);
  saveRuntime.tip("Map is saved to your Dropbox", true, "success", 8000);
}

export async function initiateAutosave(): Promise<void> {
  const MINUTE = 60000; // minute in milliseconds
  let lastSavedAt = Date.now();

  async function autosave() {
    const timeoutMinutes = (saveRuntime.ensureEl("autosaveIntervalOutput") as HTMLInputElement).valueAsNumber;
    if (!timeoutMinutes) return;

    const diffInMinutes = (Date.now() - lastSavedAt) / MINUTE;
    if (diffInMinutes < timeoutMinutes) return;
    if (saveRuntime.customization) return saveRuntime.tip("Autosave: map cannot be saved in edit mode", false, "warn", 2000);

    try {
      saveRuntime.tip("Autosave: saving map...", false, "warn", 3000);
      const mapData = prepareMapData();
      await saveToStorage(mapData);
      saveRuntime.tip("Autosave: map is saved", false, "success", 2000);

      lastSavedAt = Date.now();
    } catch (error) {
      saveRuntime.ERROR && console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      saveRuntime.tip(`Autosave failed: ${message}`, true, "error", 4000);
    }
  }

  setInterval(autosave, MINUTE / 2);
}

class SaveReminder {
  private reminder?: ReturnType<typeof setInterval>;
  private status = 0;

  public start() {
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
    const interval = 15 * 60 * 1000; // remind every 15 minutes

    this.reminder = setInterval(() => {
      if (saveRuntime.customization) return;
      saveRuntime.tip(saveRuntime.ra(message), true, "warn", 2500);
    }, interval);
    this.status = 1;
  }

  public toggle() {
    if (this.status) {
      saveRuntime.tip("Save reminder is turned off. Press CTRL+Q again to re-initiate", true, "warn", 2000);
      if (this.reminder) clearInterval(this.reminder);
      localStorage.setItem("noReminder", "true");
      this.status = 0;
      return;
    }

    saveRuntime.tip("Save reminder is turned on. Press CTRL+Q to turn off", true, "warn", 2000);
    localStorage.removeItem("noReminder");
    this.start();
  }
}

const saveReminder = new SaveReminder();
saveReminder.start();

function toggleSaveReminder() {
  saveReminder.toggle();
}

