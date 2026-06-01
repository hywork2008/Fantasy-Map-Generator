"use strict";

import type { FmgGlobalContext } from "@fmg/types";
import { drawLayers } from "./layers";
import { closeDialogs } from "./editors";
import { getFmgOptionalService } from "../runtime/get-fmg";

// Lazy-load functions from window.fmg (prefer core instances via getFmgOptionalService)
const getApplyGraphSize = () => (getFmgOptionalService as any)("applyGraphSize") || (window as any).applyGraphSize;
const getFitMapToScreen = () => (getFmgOptionalService as any)("fitMapToScreen") || (window as any).getFitMapToScreen;
const getResetZoomFn = () => (getFmgOptionalService as any)("resetZoom") || (window as any).resetZoom;
const getUndraw = () => (getFmgOptionalService as any)("undraw") || (window as any).undraw;

type SubmapFmgContext = FmgGlobalContext & {
  openSubmapTool?: typeof openSubmapTool;
  getLatitude?: (y: number, decimals?: number) => number;
  getLongitude?: (x: number, decimals?: number) => number;
  cellsDensityMap?: Record<string, number>;
  getCellsDensityColor?: (cells: number) => string;
  Resample?: { process: (options: { projection: (x: number, y: number) => [number, number]; inverse: (x: number, y: number) => [number, number]; scale: number }) => void };
  resampleMap?: (options: { projection: (x: number, y: number) => [number, number]; inverse: (x: number, y: number) => [number, number]; scale: number }) => void;
};

const submapRuntime = window as Window & {
  [key: string]: any;
  Resample?: { process: (options: { projection: (x: number, y: number) => [number, number]; inverse: (x: number, y: number) => [number, number]; scale: number }) => void };
  fmg?: SubmapFmgContext;
};

function openSubmapTool() {
  resetInputs();

  submapRuntime.$("#submapTool").dialog({
    title: "Create a submap",
    resizable: false,
    width: "32em",
    position: {my: "center", at: "center", of: "svg"},
    buttons: {
      Submap: function () {
        closeDialogs();
        generateSubmap();
      },
      Cancel: function () {
        submapRuntime.$(this).dialog("close");
      }
    }
  });

  if (submapRuntime.modules.openSubmapTool) return;
  submapRuntime.modules.openSubmapTool = true;

  function resetInputs() {
    const pointsInput = submapRuntime.ensureEl("pointsInput") as HTMLInputElement;
    const submapPointsInput = submapRuntime.ensureEl("submapPointsInput") as HTMLInputElement;

    updateCellsNumber(pointsInput.value);
    submapPointsInput.oninput = e => {
      const target = e.target as HTMLInputElement;
      updateCellsNumber(target.value);
    };

    function updateCellsNumber(value: string) {
      const submapPointsInput = submapRuntime.ensureEl("submapPointsInput") as HTMLInputElement;
      const cellsDensityMap = submapRuntime.fmg?.cellsDensityMap || submapRuntime.cellsDensityMap;
      const cells = (cellsDensityMap?.[value] ?? (submapRuntime.ensureEl("pointsInput") as HTMLInputElement).dataset.cells) as number;
      submapPointsInput.value = value;
      submapPointsInput.dataset.cells = String(cells);

      const output = submapRuntime.ensureEl("submapPointsFormatted") as HTMLInputElement;
      output.value = cells / 1000 + "K";
      const getCellsDensityColor = submapRuntime.fmg?.getCellsDensityColor || submapRuntime.getCellsDensityColor;
      output.style.color = getCellsDensityColor(cells);
    }
  }

  function generateSubmap() {
    submapRuntime.INFO && console.group("generateSubmap");

    const [x0, y0] = [Math.abs(submapRuntime.viewX / submapRuntime.scale), Math.abs(submapRuntime.viewY / submapRuntime.scale)];
    recalculateMapSize(x0, y0);

    const submapPointsValue = (submapRuntime.ensureEl("submapPointsInput") as HTMLInputElement).value;
    const globalPointsValue = (submapRuntime.ensureEl("pointsInput") as HTMLInputElement).value;
    if (submapPointsValue !== globalPointsValue) submapRuntime.changeCellsDensity(submapPointsValue);

    const projection = (x: number, y: number): [number, number] => [
      (x - x0) * submapRuntime.scale,
      (y - y0) * submapRuntime.scale
    ];
    const inverse = (x: number, y: number): [number, number] => [
      x / submapRuntime.scale + x0,
      y / submapRuntime.scale + y0
    ];

    const applySize = getApplyGraphSize();
    if (applySize) applySize();
    const fitScreen = getFitMapToScreen();
    if (fitScreen) fitScreen();
    const resetZoomFn = getResetZoomFn();
    if (resetZoomFn) resetZoomFn(0);
    const undrawFn = getUndraw();
    if (undrawFn) undrawFn();
    const resampleProcess = submapRuntime.fmg?.Resample?.process || submapRuntime.fmg?.resampleMap || submapRuntime.Resample?.process;
    if (!resampleProcess) throw new Error("Resample API is not available");
    resampleProcess({projection, inverse, scale: submapRuntime.scale});

    if ((submapRuntime.ensureEl("submapRescaleBurgStyles") as HTMLInputElement).checked)
      rescaleBurgStyles(submapRuntime.scale);
    drawLayers();

    submapRuntime.INFO && console.groupEnd();
  }

  function recalculateMapSize(x0: number, y0: number) {
    const mapSizeOutput = submapRuntime.ensureEl("mapSizeOutput") as HTMLInputElement;
    const mapSizeInput = submapRuntime.ensureEl("mapSizeInput") as HTMLInputElement;
    const mapSize = +mapSizeOutput.value;
    const rnValue = submapRuntime.fmg?.rn || submapRuntime.rn;
    mapSizeOutput.value = mapSizeInput.value = String(rnValue(mapSize / submapRuntime.scale, 2));

    const latT = submapRuntime.mapCoordinates.latT / submapRuntime.scale;
    const getLatitude = submapRuntime.fmg?.getLatitude || submapRuntime.getLatitude;
    const getLongitude = submapRuntime.fmg?.getLongitude || submapRuntime.getLongitude;
    const latN = getLatitude(y0);
    const latShift = (90 - latN) / (180 - latT);
    const latitudeOutput = submapRuntime.ensureEl("latitudeOutput") as HTMLInputElement;
    const latitudeInput = submapRuntime.ensureEl("latitudeInput") as HTMLInputElement;
    latitudeOutput.value = latitudeInput.value = String(rnValue(latShift * 100, 2));

    const lotT = submapRuntime.mapCoordinates.lonT / submapRuntime.scale;
    const lonE = getLongitude(x0 + submapRuntime.graphWidth / submapRuntime.scale);
    const lonShift = (180 - lonE) / (360 - lotT);
    const longitudeOutput = submapRuntime.ensureEl("longitudeOutput") as HTMLInputElement;
    const longitudeInput = submapRuntime.ensureEl("longitudeInput") as HTMLInputElement;
    longitudeOutput.value = longitudeInput.value = String(rnValue(lonShift * 100, 2));

    submapRuntime.distanceScale = rnValue(submapRuntime.distanceScale / submapRuntime.scale, 2);
    submapRuntime.populationRate = rnValue(submapRuntime.populationRate / submapRuntime.scale, 2);
    submapRuntime.distanceScaleInput.value = String(submapRuntime.distanceScale);
    submapRuntime.populationRateInput.value = String(submapRuntime.populationRate);
  }

  function rescaleBurgStyles(scale: number) {
    const rnValue = submapRuntime.fmg?.rn || submapRuntime.rn;
    const minmaxValue = submapRuntime.fmg?.minmax || submapRuntime.minmax;
    const burgIcons = Array.from(submapRuntime.ensureEl("burgIcons").querySelectorAll("g")) as SVGGElement[];
    for (const group of burgIcons) {
      const size = Number(group.getAttribute("size"));
      const newSize = rnValue(minmaxValue(size * scale, 0.2, 10), 2);
      group.setAttribute("font-size", String(newSize));

      const strokeWidth = Number(group.getAttribute("stroke-width"));
      const newStroke = rnValue(strokeWidth * scale, 2);
      group.setAttribute("stroke-width", String(newStroke));
    }

    const burgLabels = Array.from(submapRuntime.ensureEl("burgLabels").querySelectorAll("g")) as SVGGElement[];
    for (const group of burgLabels) {
      const size = +group.dataset.size;
      group.dataset.size = String(Math.max(rnValue((size + size / scale) / 2, 2), 1) * scale);
    }
  }
}

// Register in window.fmg first, keep window global for legacy compatibility.
const submapFmg = submapRuntime.fmg as SubmapFmgContext | undefined;
if (submapFmg) submapFmg.openSubmapTool = openSubmapTool;
(submapRuntime as Window & {openSubmapTool?: typeof openSubmapTool}).openSubmapTool = openSubmapTool;
