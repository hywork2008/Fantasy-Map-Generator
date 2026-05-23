"use strict";

import type { FmgGlobalContext } from "@fmg/types";

type TransformRuntime = {
  graphWidth: number;
  graphHeight: number;
  INFO: boolean;
  modules: { openTransformTool?: boolean };
  Resample: { process: (options: { projection: (x: number, y: number) => [number, number]; inverse: (x: number, y: number) => [number, number]; scale: number }) => void };
  $: (target: string | object) => { dialog: (optionsOrAction: unknown) => unknown };
  ensureEl: (id: string) => HTMLElement & {
    value: string | number;
    valueAsNumber: number;
    checked: boolean;
    dataset: { cells?: string };
    style: CSSStyleDeclaration;
    width?: number;
    height?: number;
    getContext?: (contextId: "2d") => CanvasRenderingContext2D | null;
  };
  rn: (value: number, digits?: number) => number;
  getMapURL: (type: string, options: Record<string, boolean>) => Promise<string>;
  getCellsDensityColor: (cells: number | string) => string;
  cellsDensityMap?: Record<string, number>;
  closeDialogs: () => void;
  changeCellsDensity: (value: string) => void;
  applyGraphSize: () => void;
  fitMapToScreen: () => void;
  resetZoom: (duration?: number) => void;
  undraw: () => void;
  drawLayers: () => void;
};

type TransformFmgContext = FmgGlobalContext & { openTransformTool?: typeof openTransformTool };

const transformWindow = window as Window & { [key: string]: any; fmg?: TransformFmgContext };
const asRuntime = <T>(runtimeWindow: Window & { [key: string]: any }) => runtimeWindow as T;
const transformRuntime = asRuntime<TransformRuntime>(transformWindow);

async function openTransformTool() {
  const width = Math.min(400, window.innerWidth * 0.5);
  const previewScale = width / transformRuntime.graphWidth;
  const height = transformRuntime.graphHeight * previewScale;

  let mouseIsDown = false;
  let mouseX = 0;
  let mouseY = 0;

  resetInputs();
  loadPreview();

  transformRuntime.$("#transformTool").dialog({
    title: "Transform map",
    resizable: false,
    position: {my: "center", at: "center", of: "svg"},
    buttons: {
      Transform: function () {
        transformRuntime.closeDialogs();
        transformMap();
      },
      Cancel: function () {
        transformRuntime.$(this).dialog("close");
      }
    }
  });

  if (transformRuntime.modules.openTransformTool) return;
  transformRuntime.modules.openTransformTool = true;

  transformRuntime.ensureEl("transformToolBody").on("input", handleInput);
  transformRuntime.ensureEl("transformPreview")
    .on("mousedown", handleMousedown)
    .on("mouseup", _ => (mouseIsDown = false))
    .on("mousemove", handleMousemove)
    .on("wheel", handleWheel);

  async function loadPreview() {
    transformRuntime.ensureEl("transformPreview").style.width = width + "px";
    transformRuntime.ensureEl("transformPreview").style.height = height + "px";

    const options = {noWater: true, fullMap: true, noLabels: true, noScaleBar: true, noVignette: true, noIce: true};
    const url = await transformRuntime.getMapURL("png", options);
    const SCALE = 4;

    const img = new Image();
    img.src = url;
    img.onload = function () {
      const $canvas = transformRuntime.ensureEl("transformPreviewCanvas");
      $canvas.style.width = width + "px";
      $canvas.style.height = height + "px";
      $canvas.width = width * SCALE;
      $canvas.height = height * SCALE;
      $canvas.getContext("2d").drawImage(img, 0, 0, width * SCALE, height * SCALE);
    };
  }

  function resetInputs() {
    transformRuntime.ensureEl("transformAngleInput").value = 0;
    transformRuntime.ensureEl("transformAngleOutput").value = "0";
    transformRuntime.ensureEl("transformMirrorH").checked = false;
    transformRuntime.ensureEl("transformMirrorV").checked = false;
    transformRuntime.ensureEl("transformScaleInput").value = 0;
    transformRuntime.ensureEl("transformScaleResult").value = 1;
    transformRuntime.ensureEl("transformShiftX").value = 0;
    transformRuntime.ensureEl("transformShiftY").value = 0;
    handleInput();

    updateCellsNumber(transformRuntime.ensureEl("pointsInput").value);
    transformRuntime.ensureEl("transformPointsInput").oninput = e => {
      const target = e.target as HTMLInputElement;
      updateCellsNumber(target.value);
    };

    function updateCellsNumber(value: string | number) {
      transformRuntime.ensureEl("transformPointsInput").value = value;
      const cellsDensityMap = transformRuntime.cellsDensityMap || {};
      const key = String(value);
      const cells = cellsDensityMap[key] ?? Number(transformRuntime.ensureEl("pointsInput").dataset.cells);
      transformRuntime.ensureEl("transformPointsInput").dataset.cells = String(cells);
      const output = transformRuntime.ensureEl("transformPointsFormatted");
      output.value = cells / 1000 + "K";
      output.style.color = transformRuntime.getCellsDensityColor(cells);
    }
  }

  function handleInput() {
    const angle = (+transformRuntime.ensureEl("transformAngleInput").value / 180) * Math.PI;
    const shiftX = +transformRuntime.ensureEl("transformShiftX").value;
    const shiftY = +transformRuntime.ensureEl("transformShiftY").value;
    const mirrorH = transformRuntime.ensureEl("transformMirrorH").checked;
    const mirrorV = transformRuntime.ensureEl("transformMirrorV").checked;

    const EXP = 1.0965;
    const scale = transformRuntime.rn(EXP ** +transformRuntime.ensureEl("transformScaleInput").value, 2);
    transformRuntime.ensureEl("transformScaleResult").value = scale;

    transformRuntime.ensureEl("transformPreviewCanvas").style.transform = `
      translate(${shiftX * previewScale}px, ${shiftY * previewScale}px)
      scale(${mirrorH ? -scale : scale}, ${mirrorV ? -scale : scale})
      rotate(${angle}rad)
    `;
  }

  function handleMousedown(e) {
    mouseIsDown = true;
    const shiftX = +transformRuntime.ensureEl("transformShiftX").value;
    const shiftY = +transformRuntime.ensureEl("transformShiftY").value;
    mouseX = shiftX - e.clientX / previewScale;
    mouseY = shiftY - e.clientY / previewScale;
  }

  function handleMousemove(e) {
    if (!mouseIsDown) return;
    e.preventDefault();

    transformRuntime.ensureEl("transformShiftX").value = Math.round(mouseX + e.clientX / previewScale);
    transformRuntime.ensureEl("transformShiftY").value = Math.round(mouseY + e.clientY / previewScale);
    handleInput();
  }

  function handleWheel(e) {
    const $scaleInput = transformRuntime.ensureEl("transformScaleInput");
    $scaleInput.value = $scaleInput.valueAsNumber - Math.sign(e.deltaY);
    handleInput();
  }

  function transformMap() {
    transformRuntime.INFO && console.group("transformMap");

    const transformPointsValue = transformRuntime.ensureEl("transformPointsInput").value;
    const globalPointsValue = transformRuntime.ensureEl("pointsInput").value;
    if (transformPointsValue !== globalPointsValue) transformRuntime.changeCellsDensity(transformPointsValue);

    const [projection, inverse] = getProjection();

    transformRuntime.applyGraphSize();
    transformRuntime.fitMapToScreen();
    transformRuntime.resetZoom(0);
    transformRuntime.undraw();
    transformRuntime.Resample.process({projection, inverse, scale: 1});

    transformRuntime.drawLayers();

    transformRuntime.INFO && console.groupEnd();
  }

  function getProjection() {
    const centerX = transformRuntime.graphWidth / 2;
    const centerY = transformRuntime.graphHeight / 2;
    const shiftX = +transformRuntime.ensureEl("transformShiftX").value;
    const shiftY = +transformRuntime.ensureEl("transformShiftY").value;
    const angle = (+transformRuntime.ensureEl("transformAngleInput").value / 180) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const scale = +transformRuntime.ensureEl("transformScaleResult").value;
    const mirrorH = transformRuntime.ensureEl("transformMirrorH").checked;
    const mirrorV = transformRuntime.ensureEl("transformMirrorV").checked;

    function project(x, y): [number, number] {
      x -= centerX;
      y -= centerY;

      if (scale !== 1) {
        x *= scale;
        y *= scale;
      }

      if (angle) [x, y] = [x * cos - y * sin, x * sin + y * cos];

      if (mirrorH) x = -x;
      if (mirrorV) y = -y;

      return [x + centerX + shiftX, y + centerY + shiftY];
    }

    function inverse(x, y): [number, number] {
      x -= centerX + shiftX;
      y -= centerY + shiftY;

      if (mirrorV) y = -y;
      if (mirrorH) x = -x;

      if (angle !== 0) [x, y] = [x * cos + y * sin, -x * sin + y * cos];

      if (scale !== 1) {
        x /= scale;
        y /= scale;
      }

      return [x + centerX, y + centerY];
    }

    return [project, inverse];
  }
}

// Register in window.fmg first, keep window global for legacy compatibility.
const transformFmg = transformWindow.fmg as TransformFmgContext | undefined;
if (transformFmg) transformFmg.openTransformTool = openTransformTool;
(transformWindow as Window & {openTransformTool?: typeof openTransformTool}).openTransformTool = openTransformTool;
