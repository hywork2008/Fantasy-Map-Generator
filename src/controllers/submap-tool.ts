import { ensureEl, rn } from "../utils";

function openSubmapTool(): void {
  resetInputs();

  $("#submapTool").dialog({
    title: "Create a submap",
    resizable: false,
    width: "32em",
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Submap: () => {
        closeDialogs();
        generateSubmap();
      },
      Cancel: function () {
        $(this).dialog("close");
      }
    }
  });

  if (modules.openSubmapTool) return;
  modules.openSubmapTool = true;

  function resetInputs(): void {
    updateCellsNumber((ensureEl("pointsInput") as HTMLInputElement).value);
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

    const [x0, y0] = [Math.abs(viewX / scale), Math.abs(viewY / scale)];
    recalculateMapSize(x0, y0);

    const submapPointsValue = (ensureEl("submapPointsInput") as HTMLInputElement).value;
    const globalPointsValue = (ensureEl("pointsInput") as HTMLInputElement).value;
    if (submapPointsValue !== globalPointsValue) changeCellsDensity(+submapPointsValue);

    const projection = (x: number, y: number): [number, number] => [(x - x0) * scale, (y - y0) * scale];
    const inverse = (x: number, y: number): [number, number] => [x / scale + x0, y / scale + y0];

    applyGraphSize();
    fitMapToScreen();
    resetZoom(0);
    undraw();
    Resample.process({ projection, inverse, scale });

    if ((ensureEl("submapRescaleBurgStyles") as HTMLInputElement).checked) rescaleBurgStyles(scale);
    drawLayers();

    INFO && console.groupEnd();
  }

  function recalculateMapSize(x0: number, y0: number): void {
    const mapSize = +(ensureEl("mapSizeOutput") as HTMLOutputElement).value;
    const newSize = String(rn(mapSize / scale, 2));
    (ensureEl("mapSizeOutput") as HTMLOutputElement).value = (ensureEl("mapSizeInput") as HTMLInputElement).value =
      newSize;

    const latT = mapCoordinates.latT! / scale;
    const latN = getLatitude(y0);
    const latShift = (90 - latN) / (180 - latT);
    const newLat = String(rn(latShift * 100, 2));
    (ensureEl("latitudeOutput") as HTMLOutputElement).value = (ensureEl("latitudeInput") as HTMLInputElement).value =
      newLat;

    const lotT = mapCoordinates.lonT! / scale;
    const lonE = getLongitude(x0 + graphWidth / scale);
    const lonShift = (180 - lonE) / (360 - lotT);
    const newLon = String(rn(lonShift * 100, 2));
    (ensureEl("longitudeOutput") as HTMLOutputElement).value = (ensureEl("longitudeInput") as HTMLInputElement).value =
      newLon;

    distanceScale = rn(distanceScale / scale, 2);
    distanceScaleInput.value = String(distanceScale);
    populationRate = rn(populationRate / scale, 2);
    populationRateInput.value = String(populationRate);
  }

  function rescaleBurgStyles(scaleFactor: number): void {
    const burgIconsNode = burgIcons.node()!;
    const burgIconGroups = [...burgIconsNode.querySelectorAll("g")];
    for (const group of burgIconGroups) {
      const newSize = rn(minmax(+(group.getAttribute("size") ?? 1) * scaleFactor, 0.2, 10), 2);
      group.setAttribute("font-size", String(newSize));

      const newStroke = rn(+(group.getAttribute("stroke-width") ?? 1) * scaleFactor, 2);
      group.setAttribute("stroke-width", String(newStroke));
    }

    const burgLabelsNode = burgLabels.node()!;
    const burgLabelGroups = [...burgLabelsNode.querySelectorAll("g")];
    for (const group of burgLabelGroups) {
      const el = group as unknown as HTMLElement;
      const size = +(el.dataset.size ?? 1);
      el.dataset.size = String(Math.max(rn((size + size / scaleFactor) / 2, 2), 1) * scaleFactor);
    }
  }
}

window.openSubmapTool = openSubmapTool;
