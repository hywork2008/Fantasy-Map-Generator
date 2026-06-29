import { resetZoom } from "../actions";
import { viewContext } from "../context/viewContext";
import { quickLoad } from "../io/load";
import { saveMap, toggleSaveReminder } from "../io/save";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { closeDialogs } from "../ui/dialogs/dialogService";
import { minmax } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getElementById, getElementsBySelector } from "../utils/nodeUtils";
import { showInfo } from "../utils/uiHelpers";
import { editBiomes } from "./biomes-editor";
import { overviewBurgs } from "./burgs-overview";
import { editDiplomacy } from "./diplomacy-editor";
import { editCoastlineSettings, editCultures, editReligions } from "./editors";
import { editHeightmap, HeightmapEditorActions } from "./heightmapEditor";
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

export function initHotkeys(): void {
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("keyup", handleKeyup);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!allowHotkeys()) return;

  const { code, ctrlKey, altKey, shiftKey } = event;
  if (altKey && !ctrlKey && !shiftKey) event.preventDefault();
  if (ctrlKey && ["KeyS", "KeyC"].includes(code)) event.preventDefault();
  if (["F1", "F2", "F6", "F9", "Tab"].includes(code)) event.preventDefault();
}

function handleKeyup(event: KeyboardEvent): void {
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
  else if (code === "KeyO" && ThreeDRenderer.options.isOn) toggle3dOptions();
  else if (ctrl && code === "KeyQ") toggleSaveReminder();
  else if (ctrl && code === "KeyS") saveMap("machine");
  else if (ctrl && code === "KeyC") saveMap("dropbox");
  else if (ctrl && code === "KeyZ") HeightmapEditorActions.undoHistory();
  else if (ctrl && code === "KeyY") HeightmapEditorActions.redoHistory();
  // Block editing shortcuts in 3D mode
  else if (
    ThreeDRenderer.options.isOn &&
    (shift || altShift) &&
    ["KeyH", "KeyB", "KeyS", "KeyP", "KeyD", "KeyL", "KeyC", "KeyN", "KeyZ", "KeyR", "KeyY", "KeyQ", "KeyO"].includes(
      code
    )
  )
    return;
  else if (ThreeDRenderer.options.isOn && ["!", "@", "#", "$", "%"].includes(key)) return;
  else if ((shift || altShift) && code === "KeyH") editHeightmap();
  else if ((shift || altShift) && code === "KeyB") editBiomes();
  else if ((shift || altShift) && code === "KeyS") EditorBus.editStates();
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
  else if (code === "Equal" && !viewContext.customization) toggleRulers();
  else if (code === "Slash") toggleScaleBar();
  else if (code === "BracketLeft" && !handleBracketSizeChange(code)) toggleVignette();
  else if (code === "BracketRight") handleBracketSizeChange(code);
  else if (code === "ArrowLeft") viewContext.zoom.translateBy(viewContext.svg, 10, 0);
  else if (code === "ArrowRight") viewContext.zoom.translateBy(viewContext.svg, -10, 0);
  else if (code === "ArrowUp") viewContext.zoom.translateBy(viewContext.svg, 0, 10);
  else if (code === "ArrowDown") viewContext.zoom.translateBy(viewContext.svg, 0, -10);
  else if (key === "+" || key === "-" || key === "=") handleSizeChange(key);
  else if (key === "0") resetZoom(1000);
  else if (key === "1") viewContext.zoom.scaleTo(viewContext.svg, 1);
  else if (key === "2") viewContext.zoom.scaleTo(viewContext.svg, 2);
  else if (key === "3") viewContext.zoom.scaleTo(viewContext.svg, 3);
  else if (key === "4") viewContext.zoom.scaleTo(viewContext.svg, 4);
  else if (key === "5") viewContext.zoom.scaleTo(viewContext.svg, 5);
  else if (key === "6") viewContext.zoom.scaleTo(viewContext.svg, 6);
  else if (key === "7") viewContext.zoom.scaleTo(viewContext.svg, 7);
  else if (key === "8") viewContext.zoom.scaleTo(viewContext.svg, 8);
  else if (key === "9") viewContext.zoom.scaleTo(viewContext.svg, 9);
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

  if ((getElementById<HTMLElement>("heightmapBrushRadius") as HTMLElement)?.offsetParent)
    brush = getElementById<HTMLInputElement>("heightmapBrushRadius");
  else if ((getElementById<HTMLElement>("heightmapBrushPower") as HTMLElement)?.offsetParent)
    brush = getElementById<HTMLInputElement>("heightmapBrushPower");
  else if ((getElementById<HTMLElement>("heightmapLinePower") as HTMLElement)?.offsetParent)
    brush = getElementById<HTMLInputElement>("heightmapLinePower");
  else if ((getElementById<HTMLElement>("biomesBrush") as HTMLElement)?.offsetParent)
    brush = getElementById<HTMLInputElement>("biomesBrush");
  else if (getElementById<HTMLElement>("culturesBrush")?.offsetParent)
    brush = getElementById<HTMLInputElement>("culturesBrush");
  else if (getElementById<HTMLElement>("statesBrush")?.offsetParent)
    brush = getElementById<HTMLInputElement>("statesBrush");
  else if ((getElementById<HTMLElement>("provincesBrush") as HTMLElement)?.offsetParent)
    brush = getElementById<HTMLInputElement>("provincesBrush");
  else if (getElementById<HTMLElement>("religionsBrush")?.offsetParent)
    brush = getElementById<HTMLInputElement>("religionsBrush");
  else if ((getElementById<HTMLElement>("zonesBrush") as HTMLElement)?.offsetParent)
    brush = getElementById<HTMLInputElement>("zonesBrush");

  if (brush) {
    const change = key === "-" ? -5 : 5;
    const min = +(brush.getAttribute("min") ?? "5") || 5;
    const max = +(brush.getAttribute("max") ?? "100") || 100;
    const value = +brush.value + change;
    brush.value = String(minmax(value, min, max));
    return;
  }

  const scaleBy = key === "+" ? 1.2 : 0.8;
  viewContext.zoom.scaleBy(viewContext.svg, scaleBy);
}

function handleBracketSizeChange(code: string): boolean {
  const isHeightmapBrushPressed = Boolean(
    getElementById<HTMLElement>("brushesButtons")?.querySelector("button.pressed")
  );
  const hasActiveBrush =
    isHeightmapBrushPressed ||
    getElementById<HTMLElement>("heightmapBrushRadius")?.offsetParent ||
    getElementById<HTMLElement>("heightmapBrushPower")?.offsetParent ||
    getElementById<HTMLElement>("heightmapLinePower")?.offsetParent ||
    getElementById<HTMLElement>("biomesBrush")?.offsetParent ||
    getElementById<HTMLElement>("culturesBrush")?.offsetParent ||
    getElementById<HTMLElement>("statesBrush")?.offsetParent ||
    getElementById<HTMLElement>("provincesBrush")?.offsetParent ||
    getElementById<HTMLElement>("religionsBrush")?.offsetParent ||
    getElementById<HTMLElement>("zonesBrush")?.offsetParent;

  if (!hasActiveBrush) return false;

  handleSizeChange(code === "BracketLeft" ? "-" : "+");
  return true;
}

function toggleMode(): void {
  const zonesRemove = getElementById<HTMLElement>("zonesRemove");
  if (zonesRemove?.offsetParent) {
    zonesRemove.classList.contains("pressed")
      ? zonesRemove.classList.remove("pressed")
      : zonesRemove.classList.add("pressed");
  }
}

function removeElementOnKey(): void {
  const fastDelete = Array.from(getElementsBySelector<HTMLElement>("[role='dialog'] .fastDelete")).find(
    dialog => dialog.style.display !== "none"
  );
  if (fastDelete) fastDelete.click();

  const visibleDialogs = Array.from(getElementsBySelector<HTMLElement>("[role='dialog']")).filter(
    dialog => dialog.style.display !== "none"
  );
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
