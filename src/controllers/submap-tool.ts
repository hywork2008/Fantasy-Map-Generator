import { resetZoom } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

import { undraw } from "../main";
import { GenerationPipeline } from "../services/generationPipeline";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import { openDialog } from "../ui/dialogs/dialogService";
import { getLatitude, getLongitude, minmax, rn } from "../utils";
import { INFO } from "../utils/debug";
import { drawLayers } from "./layers";
import { applyGraphSize, changeCellsDensity, fitMapToScreen } from "./options";

let worldContext: WorldContext;
let appServices: AppServices;

export function openSubmapTool(): void {
  openDialog("submapTool");

  if (modules.openSubmapTool) return;
  modules.openSubmapTool = true;
}

export const submapToolActions = {
  generateSubmap: async (submapPointsValue: number, shouldRescaleBurgStyles: boolean): Promise<void> => {
    INFO && console.group("generateSubmap");

    const [x0, y0] = [Math.abs(view.viewX / view.scale), Math.abs(view.viewY / view.scale)];
    recalculateMapSize(x0, y0);

    const globalPointsValue = useOptionsState.getState().points;
    if (submapPointsValue !== globalPointsValue) {
      changeCellsDensity(submapPointsValue);
    }

    const projection = (x: number, y: number): [number, number] => [(x - x0) * view.scale, (y - y0) * view.scale];
    const inverse = (x: number, y: number): [number, number] => [x / view.scale + x0, y / view.scale + y0];

    applyGraphSize();
    fitMapToScreen();
    resetZoom(0);

    undraw();
    GenerationPipeline.Resample.init(worldContext, viewContext, appServices);
    GenerationPipeline.Resample.process({ projection, inverse, scale: view.scale });

    if (shouldRescaleBurgStyles) {
      rescaleBurgStyles(view.scale);
    }
    drawLayers();

    INFO && console.groupEnd();
  }
};

function recalculateMapSize(x0: number, y0: number): void {
  const options = useOptionsState.getState();
  const mapSize = options.mapSize;
  const newSize = rn(mapSize / view.scale, 2);
  options.setOption("mapSize", newSize);

  const latT = worldContext.mapCoordinates.latT! / view.scale;
  const latN = getLatitude(y0, worldContext.mapCoordinates, worldContext.graphHeight);
  let latShift = (90 - latN) / (180 - latT);
  if (!Number.isFinite(latShift) || Number.isNaN(latShift)) latShift = 0.5;
  const newLat = rn(latShift * 100, 2);
  options.setOption("latitude", newLat);

  const lotT = worldContext.mapCoordinates.lonT! / view.scale;
  const lonE = getLongitude(
    x0 + worldContext.graphWidth / view.scale,
    worldContext.mapCoordinates,
    worldContext.graphWidth
  );
  let lonShift = (180 - lonE) / (360 - lotT);
  if (!Number.isFinite(lonShift) || Number.isNaN(lonShift)) lonShift = 0.5;
  const newLon = rn(lonShift * 100, 2);
  options.setOption("longitude", newLon);

  worldContext.distanceScale = rn(worldContext.distanceScale / view.scale, 2);
  options.setOption("distanceScale", worldContext.distanceScale);

  worldContext.populationRate = rn(worldContext.populationRate / view.scale, 2);
  options.setOption("populationRate", worldContext.populationRate);
}

function rescaleBurgStyles(scaleFactor: number): void {
  const burgIconsNode = view.burgIcons.node()!;
  const burgIconGroups = [...burgIconsNode.querySelectorAll("g")];
  for (const group of burgIconGroups) {
    const newSize = rn(minmax(+(group.getAttribute("size") ?? 1) * scaleFactor, 0.2, 10), 2);
    group.setAttribute("font-size", String(newSize));

    const newStroke = rn(+(group.getAttribute("stroke-width") ?? 1) * scaleFactor, 2);
    group.setAttribute("stroke-width", String(newStroke));
  }

  const burgLabelsNode = view.burgLabels.node()!;
  const burgLabelGroups = [...burgLabelsNode.querySelectorAll("g")];
  for (const group of burgLabelGroups) {
    const size = +(group.dataset.size ?? 1);
    group.dataset.size = String(Math.max(rn((size + size / scaleFactor) / 2, 2), 1) * scaleFactor);
  }
}

export function initSubmapTool(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}
