import { resetZoom } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

import { getMapURL } from "../io/export";
import { undraw } from "../main";
import { GenerationPipeline } from "../services/generationPipeline";
import { viewLayerService as view } from "../services/viewLayerService";
import { useOptionsState } from "../store/optionsState";
import { openDialog } from "../ui/dialogs/dialogService";
import { INFO } from "../utils/debug";
import { drawLayers } from "./layers";
import { applyGraphSize, changeCellsDensity, fitMapToScreen } from "./options";

let worldContext: WorldContext;
let appServices: AppServices;

export interface TransformParams {
  angleDeg: number;
  scaleVal: number;
  shiftX: number;
  shiftY: number;
  mirrorH: boolean;
  mirrorV: boolean;
}

export function openTransformTool(): void {
  openDialog("transformTool");
}

export function initTransformTool(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}

export function getTransformPreviewDims(): { previewWidth: number; previewHeight: number; previewScale: number } {
  const previewWidth = Math.min(400, view.svgWidth * 0.5);
  const previewScale = previewWidth / worldContext.graphWidth;
  const previewHeight = worldContext.graphHeight * previewScale;
  return { previewWidth, previewHeight, previewScale };
}

export async function loadTransformPreview(): Promise<string> {
  const opts = { noWater: true, fullMap: true, noLabels: true, noScaleBar: true, noVignette: true, noIce: true };
  return getMapURL("png", opts);
}

export function applyTransformMap(params: TransformParams, pointsInput: number): void {
  INFO && console.group("transformMap");

  const globalPoints = useOptionsState.getState().points;
  if (pointsInput !== globalPoints) changeCellsDensity(pointsInput);

  const [projection, inverse] = buildProjection(params);

  applyGraphSize();
  fitMapToScreen();
  resetZoom(0);

  undraw();
  GenerationPipeline.Resample.init(worldContext, viewContext, appServices);
  GenerationPipeline.Resample.process({ projection, inverse, scale: 1 });

  drawLayers();

  INFO && console.groupEnd();
}

function buildProjection(
  params: TransformParams
): [(x: number, y: number) => [number, number], (x: number, y: number) => [number, number]] {
  const centerX = worldContext.graphWidth / 2;
  const centerY = worldContext.graphHeight / 2;
  const { angleDeg, scaleVal, shiftX, shiftY, mirrorH, mirrorV } = params;
  const angle = (angleDeg / 180) * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  function project(x: number, y: number): [number, number] {
    x -= centerX;
    y -= centerY;
    if (scaleVal !== 1) {
      x *= scaleVal;
      y *= scaleVal;
    }
    if (angle) [x, y] = [x * cos - y * sin, x * sin + y * cos];
    if (mirrorH) x = -x;
    if (mirrorV) y = -y;
    return [x + centerX + shiftX, y + centerY + shiftY];
  }

  function inverse(x: number, y: number): [number, number] {
    x -= centerX + shiftX;
    y -= centerY + shiftY;
    if (mirrorV) y = -y;
    if (mirrorH) x = -x;
    if (angle !== 0) [x, y] = [x * cos + y * sin, -x * sin + y * cos];
    if (scaleVal !== 1) {
      x /= scaleVal;
      y /= scaleVal;
    }
    return [x + centerX, y + centerY];
  }

  return [project, inverse];
}
