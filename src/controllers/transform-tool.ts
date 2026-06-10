import { ensureEl, rn } from "../utils";

async function openTransformTool(): Promise<void> {
  const width = Math.min(400, window.innerWidth * 0.5);
  const previewScale = width / graphWidth;
  const height = graphHeight * previewScale;

  let mouseIsDown = false;
  let mouseX = 0;
  let mouseY = 0;

  resetInputs();
  loadPreview();

  $("#transformTool").dialog({
    title: "Transform map",
    resizable: false,
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Transform: () => {
        closeDialogs();
        transformMap();
      },
      Cancel: function () {
        $(this).dialog("close");
      }
    }
  });

  if (modules.openTransformTool) return;
  modules.openTransformTool = true;

  ensureEl("transformToolBody").on("input", handleInput);
  ensureEl("transformPreview")
    .on("mousedown", handleMousedown)
    .on("mouseup", () => {
      mouseIsDown = false;
    })
    .on("mousemove", handleMousemove)
    .on("wheel", handleWheel);

  async function loadPreview(): Promise<void> {
    (ensureEl("transformPreview") as HTMLElement).style.width = `${width}px`;
    (ensureEl("transformPreview") as HTMLElement).style.height = `${height}px`;

    const opts = { noWater: true, fullMap: true, noLabels: true, noScaleBar: true, noVignette: true, noIce: true };
    const url = await getMapURL("png", opts);
    const SCALE = 4;

    const img = new Image();
    img.src = url;
    img.onload = () => {
      const $canvas = ensureEl("transformPreviewCanvas") as HTMLCanvasElement;
      $canvas.style.width = `${width}px`;
      $canvas.style.height = `${height}px`;
      $canvas.width = width * SCALE;
      $canvas.height = height * SCALE;
      $canvas.getContext("2d")!.drawImage(img, 0, 0, width * SCALE, height * SCALE);
    };
  }

  function resetInputs(): void {
    (ensureEl("transformAngleInput") as HTMLInputElement).value = "0";
    (ensureEl("transformAngleOutput") as HTMLOutputElement).value = "0";
    (ensureEl("transformMirrorH") as HTMLInputElement).checked = false;
    (ensureEl("transformMirrorV") as HTMLInputElement).checked = false;
    (ensureEl("transformScaleInput") as HTMLInputElement).value = "0";
    (ensureEl("transformScaleResult") as HTMLOutputElement).value = "1";
    (ensureEl("transformShiftX") as HTMLInputElement).value = "0";
    (ensureEl("transformShiftY") as HTMLInputElement).value = "0";
    handleInput();

    updateCellsNumber((ensureEl("pointsInput") as HTMLInputElement).value);
    (ensureEl("transformPointsInput") as HTMLInputElement).oninput = (e: Event) =>
      updateCellsNumber((e.target as HTMLInputElement).value);

    function updateCellsNumber(value: string): void {
      (ensureEl("transformPointsInput") as HTMLInputElement).value = value;
      const cells = cellsDensityMap[+value];
      (ensureEl("transformPointsInput") as HTMLInputElement).dataset.cells = String(cells);
      const output = ensureEl("transformPointsFormatted") as HTMLOutputElement;
      output.value = `${cells / 1000}K`;
      output.style.color = getCellsDensityColor(cells);
    }
  }

  function handleInput(): void {
    const angle = (+(ensureEl("transformAngleInput") as HTMLInputElement).value / 180) * Math.PI;
    const shiftX = +(ensureEl("transformShiftX") as HTMLInputElement).value;
    const shiftY = +(ensureEl("transformShiftY") as HTMLInputElement).value;
    const mirrorH = (ensureEl("transformMirrorH") as HTMLInputElement).checked;
    const mirrorV = (ensureEl("transformMirrorV") as HTMLInputElement).checked;

    const EXP = 1.0965;
    const scaleVal = rn(EXP ** +(ensureEl("transformScaleInput") as HTMLInputElement).value, 2);
    (ensureEl("transformScaleResult") as HTMLOutputElement).value = String(scaleVal);

    (ensureEl("transformPreviewCanvas") as HTMLElement).style.transform = `
      translate(${shiftX * previewScale}px, ${shiftY * previewScale}px)
      scale(${mirrorH ? -scaleVal : scaleVal}, ${mirrorV ? -scaleVal : scaleVal})
      rotate(${angle}rad)
    `;
  }

  function handleMousedown(e: Event): void {
    mouseIsDown = true;
    const me = e as MouseEvent;
    const shiftX = +(ensureEl("transformShiftX") as HTMLInputElement).value;
    const shiftY = +(ensureEl("transformShiftY") as HTMLInputElement).value;
    mouseX = shiftX - me.clientX / previewScale;
    mouseY = shiftY - me.clientY / previewScale;
  }

  function handleMousemove(e: Event): void {
    if (!mouseIsDown) return;
    e.preventDefault();
    const me = e as MouseEvent;
    (ensureEl("transformShiftX") as HTMLInputElement).value = String(Math.round(mouseX + me.clientX / previewScale));
    (ensureEl("transformShiftY") as HTMLInputElement).value = String(Math.round(mouseY + me.clientY / previewScale));
    handleInput();
  }

  function handleWheel(e: Event): void {
    const we = e as WheelEvent;
    const $scaleInput = ensureEl("transformScaleInput") as HTMLInputElement;
    $scaleInput.value = String($scaleInput.valueAsNumber - Math.sign(we.deltaY));
    handleInput();
  }

  function transformMap(): void {
    INFO && console.group("transformMap");

    const transformPointsValue = (ensureEl("transformPointsInput") as HTMLInputElement).value;
    const globalPointsValue = (ensureEl("pointsInput") as HTMLInputElement).value;
    if (transformPointsValue !== globalPointsValue) changeCellsDensity(+transformPointsValue);

    const [projection, inverse] = getProjection();

    applyGraphSize();
    fitMapToScreen();
    resetZoom(0);
    undraw();
    Resample.process({ projection, inverse, scale: 1 });

    drawLayers();

    INFO && console.groupEnd();
  }

  function getProjection(): [(x: number, y: number) => [number, number], (x: number, y: number) => [number, number]] {
    const centerX = graphWidth / 2;
    const centerY = graphHeight / 2;
    const shiftX = +(ensureEl("transformShiftX") as HTMLInputElement).value;
    const shiftY = +(ensureEl("transformShiftY") as HTMLInputElement).value;
    const angle = (+(ensureEl("transformAngleInput") as HTMLInputElement).value / 180) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const scaleVal = +(ensureEl("transformScaleResult") as HTMLOutputElement).value;
    const mirrorH = (ensureEl("transformMirrorH") as HTMLInputElement).checked;
    const mirrorV = (ensureEl("transformMirrorV") as HTMLInputElement).checked;

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
}

window.openTransformTool = openTransformTool;
