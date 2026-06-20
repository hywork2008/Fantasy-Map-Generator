import { resetZoom } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { undraw } from "../main";
import { useOptionsState } from "../store/optionsState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { ensureEl, getLatitude, getLongitude, minmax, rn } from "../utils";
import { drawLayers } from "./layers";
import { applyGraphSize, cellsDensityMap, changeCellsDensity, fitMapToScreen, getCellsDensityColor } from "./options";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

export function openSubmapTool(): void {
  resetInputs();

  openDialog("submapTool", {
    title: "Create a submap",
    resizable: false,
    width: "32em",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Submap: () => {
        closeDialogs();
        generateSubmap();
      },
      Cancel: () => {
        /* $(this).dialog("close") removed */
      }
    }
  });

  if (modules.openSubmapTool) return;
  modules.openSubmapTool = true;

  function resetInputs(): void {
    updateCellsNumber(String(useOptionsState.getState().points));
    (ensureEl("submapPointsInput") as HTMLInputElement).oninput = (e: Event) =>
      updateCellsNumber((e.target as HTMLInputElement).value);

    function updateCellsNumber(value: string): void {
      (ensureEl("submapPointsInput") as HTMLInputElement).value = value;
      const cells = cellsDensityMap[+value];
      (ensureEl("submapPointsInput") as HTMLInputElement).dataset.cells = String(cells);
      const output = ensureEl("submapPointsFormatted") as HTMLOutputElement;
      output.value = `${cells / 1000}K`;
      output.style.color = getCellsDensityColor(cells);
    }
  }

  function generateSubmap(): void {
    INFO && console.group("generateSubmap");

    const [x0, y0] = [Math.abs(viewContext.viewX / viewContext.scale), Math.abs(viewContext.viewY / viewContext.scale)];
    recalculateMapSize(x0, y0);

    const submapPointsValue = (ensureEl("submapPointsInput") as HTMLInputElement).value;
    const globalPointsValue = String(useOptionsState.getState().points);
    if (submapPointsValue !== globalPointsValue) changeCellsDensity(+submapPointsValue);

    const projection = (x: number, y: number): [number, number] => [
      (x - x0) * viewContext.scale,
      (y - y0) * viewContext.scale
    ];
    const inverse = (x: number, y: number): [number, number] => [
      x / viewContext.scale + x0,
      y / viewContext.scale + y0
    ];

    applyGraphSize();
    fitMapToScreen();
    resetZoom(0);
    undraw();
    Resample.init(worldContext, viewContext, appServices);
    Resample.process({ projection, inverse, scale: viewContext.scale });

    if ((ensureEl("submapRescaleBurgStyles") as HTMLInputElement).checked) rescaleBurgStyles(viewContext.scale);
    drawLayers();

    INFO && console.groupEnd();
  }

  function recalculateMapSize(x0: number, y0: number): void {
    const mapSize = +(ensureEl("mapSizeOutput") as HTMLOutputElement).value;
    const newSize = String(rn(mapSize / viewContext.scale, 2));
    (ensureEl("mapSizeOutput") as HTMLOutputElement).value = (ensureEl("mapSizeInput") as HTMLInputElement).value =
      newSize;

    const latT = worldContext.mapCoordinates.latT! / viewContext.scale;
    const latN = getLatitude(y0, worldContext.mapCoordinates, worldContext.graphHeight);
    const latShift = (90 - latN) / (180 - latT);
    const newLat = String(rn(latShift * 100, 2));
    (ensureEl("latitudeOutput") as HTMLOutputElement).value = (ensureEl("latitudeInput") as HTMLInputElement).value =
      newLat;

    const lotT = worldContext.mapCoordinates.lonT! / viewContext.scale;
    const lonE = getLongitude(
      x0 + worldContext.graphWidth / viewContext.scale,
      worldContext.mapCoordinates,
      worldContext.graphWidth
    );
    const lonShift = (180 - lonE) / (360 - lotT);
    const newLon = String(rn(lonShift * 100, 2));
    (ensureEl("longitudeOutput") as HTMLOutputElement).value = (ensureEl("longitudeInput") as HTMLInputElement).value =
      newLon;

    worldContext.distanceScale = rn(worldContext.distanceScale / viewContext.scale, 2);
    distanceScaleInput.value = String(worldContext.distanceScale);
    worldContext.populationRate = rn(worldContext.populationRate / viewContext.scale, 2);
    populationRateInput.value = String(worldContext.populationRate);
  }

  function rescaleBurgStyles(scaleFactor: number): void {
    const burgIconsNode = viewContext.burgIcons.node()!;
    const burgIconGroups = [...burgIconsNode.querySelectorAll("g")];
    for (const group of burgIconGroups) {
      const newSize = rn(minmax(+(group.getAttribute("size") ?? 1) * scaleFactor, 0.2, 10), 2);
      group.setAttribute("font-size", String(newSize));

      const newStroke = rn(+(group.getAttribute("stroke-width") ?? 1) * scaleFactor, 2);
      group.setAttribute("stroke-width", String(newStroke));
    }

    const burgLabelsNode = viewContext.burgLabels.node()!;
    const burgLabelGroups = [...burgLabelsNode.querySelectorAll("g")];
    for (const group of burgLabelGroups) {
      const size = +(group.dataset.size ?? 1);
      group.dataset.size = String(Math.max(rn((size + size / scaleFactor) / 2, 2), 1) * scaleFactor);
    }
  }
}

export function initSubmapTool(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
