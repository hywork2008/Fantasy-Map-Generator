import { quickLoad } from "../io/load";
import { saveMap, toggleSaveReminder } from "../io/save";
import { ensureEl, minmax } from "../utils";
import { editBiomes } from "./biomes-editor";
import { overviewBurgs } from "./burgs-overview";
import { editDiplomacy } from "./diplomacy-editor";
import { closeDialogs, editCoastlineSettings, editCultures, editReligions, editStates } from "./editors";
import { editHeightmap } from "./heightmap-editor";
import {
  toggleBiomes,
  toggleBorders,
  toggleBurgIcons,
  toggleCells,
  toggleCompass,
  toggleCoordinates,
  toggleCultures,
  toggleEmblems,
  toggleGrid,
  toggleHeight,
  toggleIce,
  toggleLabels,
  toggleLakes,
  toggleMarkers,
  toggleMilitary,
  togglePopulation,
  togglePrecipitation,
  toggleProvinces,
  toggleRelief,
  toggleReligions,
  toggleRivers,
  toggleRoutes,
  toggleRulers,
  toggleScaleBar,
  toggleStates,
  toggleTemperature,
  toggleTexture,
  toggleVignette,
  toggleZones
} from "./layers";
import { overviewMarkers } from "./markers-overview";
import { overviewMilitary } from "./military-overview";
import { NamesbaseEditor } from "./namesbase-editor";
import { editNotes } from "./notes-editor";
import { hideOptions, regeneratePrompt, toggle3dOptions, toggleOptions } from "./options";
import { editProvinces } from "./provinces-editor";
import { overviewRivers } from "./rivers-overview";
import { createRoute } from "./routes-editor";
import { overviewRoutes } from "./routes-overview";
import {
  openEmblemEditor,
  overviewCharts,
  toggleAddBurg,
  toggleAddLabel,
  toggleAddMarker,
  toggleAddRiver,
  viewCellDetails
} from "./tools";
import { editUnits } from "./units-editor";
import { editZones } from "./zones-editor";

document.addEventListener("keydown", handleKeydown);
document.addEventListener("keyup", handleKeyup);

function handleKeydown(event: KeyboardEvent): void {
  if (!allowHotkeys()) return;

  const { code, ctrlKey, altKey, shiftKey } = event;
  if (altKey && !ctrlKey && !shiftKey) event.preventDefault();
  if (ctrlKey && ["KeyS", "KeyC"].includes(code)) event.preventDefault();
  if (["F1", "F2", "F6", "F9", "Tab"].includes(code)) event.preventDefault();
}

function handleKeyup(event: KeyboardEvent): void {
  if (!modules.editors) return;
  if (!allowHotkeys()) return;

  event.stopPropagation();

  const { code, key, ctrlKey, metaKey, shiftKey, altKey } = event;
  const ctrl = ctrlKey || metaKey || key === "Control";
  const shift = (shiftKey || key === "Shift") && !altKey;
  const altShift = altKey && (shiftKey || key === "Shift") && !ctrl;

  if (code === "F1") showInfo();
  else if (code === "F2") regeneratePrompt();
  else if (code === "F6") saveMap("storage");
  else if (code === "F9") quickLoad();
  else if (code === "Tab") toggleOptions(event);
  else if (code === "Escape") closeAllDialogs();
  else if (code === "Delete") removeElementOnKey();
  else if (code === "KeyO" && ensureEl("canvas3d")) toggle3dOptions();
  else if (ctrl && code === "KeyQ") toggleSaveReminder();
  else if (ctrl && code === "KeyS") saveMap("machine");
  else if (ctrl && code === "KeyC") saveMap("dropbox");
  else if (ctrl && code === "KeyZ" && undo?.offsetParent) undo.click();
  else if (ctrl && code === "KeyY" && redo?.offsetParent) redo.click();
  else if ((shift || altShift) && code === "KeyH") editHeightmap();
  else if ((shift || altShift) && code === "KeyB") editBiomes();
  else if ((shift || altShift) && code === "KeyS") editStates();
  else if ((shift || altShift) && code === "KeyP") editProvinces();
  else if ((shift || altShift) && code === "KeyD") editDiplomacy();
  else if ((shift || altShift) && code === "KeyL") editCoastlineSettings();
  else if ((shift || altShift) && code === "KeyC") editCultures();
  else if ((shift || altShift) && code === "KeyN") NamesbaseEditor.open();
  else if ((shift || altShift) && code === "KeyZ") editZones();
  else if ((shift || altShift) && code === "KeyR") editReligions();
  else if ((shift || altShift) && code === "KeyY") openEmblemEditor();
  else if ((shift || altShift) && code === "KeyQ") editUnits();
  else if ((shift || altShift) && code === "KeyO") editNotes();
  else if ((shift || altShift) && code === "KeyA") overviewCharts();
  else if ((shift || altShift) && code === "KeyT") overviewBurgs();
  else if ((shift || altShift) && code === "KeyU") overviewRoutes();
  else if ((shift || altShift) && code === "KeyV") overviewRivers();
  else if ((shift || altShift) && code === "KeyM") overviewMilitary();
  else if ((shift || altShift) && code === "KeyK") overviewMarkers();
  else if ((shift || altShift) && code === "KeyE") viewCellDetails();
  else if (key === "!") toggleAddBurg();
  else if (key === "@") toggleAddLabel();
  else if (key === "#") toggleAddRiver();
  else if (key === "$") createRoute();
  else if (key === "%") toggleAddMarker();
  else if (code === "KeyX") toggleTexture();
  else if (code === "KeyH") toggleHeight();
  else if (code === "KeyQ") toggleLakes();
  else if (code === "KeyB") toggleBiomes();
  else if (code === "KeyE") toggleCells();
  else if (code === "KeyG") toggleGrid();
  else if (code === "KeyO") toggleCoordinates();
  else if (code === "KeyW") toggleCompass();
  else if (code === "KeyV") toggleRivers();
  else if (code === "KeyF") toggleRelief();
  else if (code === "KeyC") toggleCultures();
  else if (code === "KeyS") toggleStates();
  else if (code === "KeyP") toggleProvinces();
  else if (code === "KeyZ") toggleZones();
  else if (code === "KeyD") toggleBorders();
  else if (code === "KeyR") toggleReligions();
  else if (code === "KeyU") toggleRoutes();
  else if (code === "KeyT") toggleTemperature();
  else if (code === "KeyN") togglePopulation();
  else if (code === "KeyJ") toggleIce();
  else if (code === "KeyA") togglePrecipitation();
  else if (code === "KeyY") toggleEmblems();
  else if (code === "KeyL") toggleLabels();
  else if (code === "KeyI") toggleBurgIcons();
  else if (code === "KeyM") toggleMilitary();
  else if (code === "KeyK") toggleMarkers();
  else if (code === "Equal" && !customization) toggleRulers();
  else if (code === "Slash") toggleScaleBar();
  else if (code === "BracketLeft" && !handleBracketSizeChange(code)) toggleVignette();
  else if (code === "BracketRight") handleBracketSizeChange(code);
  else if (code === "ArrowLeft") zoom.translateBy(svg, 10, 0);
  else if (code === "ArrowRight") zoom.translateBy(svg, -10, 0);
  else if (code === "ArrowUp") zoom.translateBy(svg, 0, 10);
  else if (code === "ArrowDown") zoom.translateBy(svg, 0, -10);
  else if (key === "+" || key === "-" || key === "=") handleSizeChange(key);
  else if (key === "0") resetZoom(1000);
  else if (key === "1") zoom.scaleTo(svg, 1);
  else if (key === "2") zoom.scaleTo(svg, 2);
  else if (key === "3") zoom.scaleTo(svg, 3);
  else if (key === "4") zoom.scaleTo(svg, 4);
  else if (key === "5") zoom.scaleTo(svg, 5);
  else if (key === "6") zoom.scaleTo(svg, 6);
  else if (key === "7") zoom.scaleTo(svg, 7);
  else if (key === "8") zoom.scaleTo(svg, 8);
  else if (key === "9") zoom.scaleTo(svg, 9);
  else if (ctrl) toggleMode();
}

function allowHotkeys(): boolean {
  const active = document.activeElement as HTMLElement;
  const { tagName } = active;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tagName)) return false;
  if (tagName === "DIV" && active.contentEditable === "true") return false;
  if (document.getSelection()?.toString()) return false;
  return true;
}

function handleSizeChange(key: string): void {
  let brush: HTMLInputElement | null = null;

  if ((ensureEl("heightmapBrushRadius") as HTMLElement)?.offsetParent)
    brush = ensureEl("heightmapBrushRadius") as HTMLInputElement;
  else if ((ensureEl("heightmapBrushPower") as HTMLElement)?.offsetParent)
    brush = ensureEl("heightmapBrushPower") as HTMLInputElement;
  else if ((ensureEl("heightmapLinePower") as HTMLElement)?.offsetParent)
    brush = ensureEl("heightmapLinePower") as HTMLInputElement;
  else if ((ensureEl("biomesBrush") as HTMLElement)?.offsetParent) brush = ensureEl("biomesBrush") as HTMLInputElement;
  else if (document.getElementById("culturesBrush")?.offsetParent)
    brush = document.getElementById("culturesBrush") as HTMLInputElement;
  else if (document.getElementById("statesBrush")?.offsetParent)
    brush = document.getElementById("statesBrush") as HTMLInputElement;
  else if ((ensureEl("provincesBrush") as HTMLElement)?.offsetParent)
    brush = ensureEl("provincesBrush") as HTMLInputElement;
  else if (document.getElementById("religionsBrush")?.offsetParent)
    brush = document.getElementById("religionsBrush") as HTMLInputElement;
  else if ((ensureEl("zonesBrush") as HTMLElement)?.offsetParent) brush = ensureEl("zonesBrush") as HTMLInputElement;

  if (brush) {
    const change = key === "-" ? -5 : 5;
    const min = +(brush.getAttribute("min") ?? "5") || 5;
    const max = +(brush.getAttribute("max") ?? "100") || 100;
    const value = +brush.value + change;
    brush.value = String(minmax(value, min, max));
    return;
  }

  const scaleBy = key === "+" ? 1.2 : 0.8;
  zoom.scaleBy(svg, scaleBy);
}

function handleBracketSizeChange(code: string): boolean {
  const isHeightmapBrushPressed = Boolean((ensureEl("brushesButtons") as HTMLElement)?.querySelector("button.pressed"));
  const hasActiveBrush =
    isHeightmapBrushPressed ||
    (ensureEl("heightmapBrushRadius") as HTMLElement)?.offsetParent ||
    (ensureEl("heightmapBrushPower") as HTMLElement)?.offsetParent ||
    (ensureEl("heightmapLinePower") as HTMLElement)?.offsetParent ||
    (ensureEl("biomesBrush") as HTMLElement)?.offsetParent ||
    document.getElementById("culturesBrush")?.offsetParent ||
    document.getElementById("statesBrush")?.offsetParent ||
    (ensureEl("provincesBrush") as HTMLElement)?.offsetParent ||
    document.getElementById("religionsBrush")?.offsetParent ||
    (ensureEl("zonesBrush") as HTMLElement)?.offsetParent;

  if (!hasActiveBrush) return false;

  handleSizeChange(code === "BracketLeft" ? "-" : "+");
  return true;
}

function toggleMode(): void {
  if (zonesRemove?.offsetParent) {
    zonesRemove.classList.contains("pressed")
      ? zonesRemove.classList.remove("pressed")
      : zonesRemove.classList.add("pressed");
  }
}

function removeElementOnKey(): void {
  const fastDelete = Array.from(document.querySelectorAll("[role='dialog'] .fastDelete")).find(
    dialog => (dialog as HTMLElement).style.display !== "none"
  ) as HTMLElement | undefined;
  if (fastDelete) fastDelete.click();

  const visibleDialogs = Array.from(document.querySelectorAll("[role='dialog']")).filter(
    dialog => (dialog as HTMLElement).style.display !== "none"
  ) as HTMLElement[];
  if (!visibleDialogs.length) return;

  for (const dialog of visibleDialogs) {
    for (const button of dialog.querySelectorAll("button")) {
      if (button.textContent === "Remove") button.click();
    }
  }
}

function closeAllDialogs(): void {
  closeDialogs();
  hideOptions();
}

// ─── Legacy globals (from non-migrated JS files) ──────────────────────────────

declare const zoom: {
  translateBy: (selection: unknown, dx: number, dy: number) => unknown;
  scaleTo: (selection: unknown, scale: number) => unknown;
  scaleBy: (selection: unknown, factor: number) => unknown;
};
declare const zonesRemove: HTMLButtonElement | null;
declare const undo: HTMLButtonElement | null;
declare const redo: HTMLButtonElement | null;
declare const resetZoom: (duration?: number) => void;

declare const showInfo: () => void;
