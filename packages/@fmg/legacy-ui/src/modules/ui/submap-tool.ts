"use strict";

const submapRuntime = globalThis as any;

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
      const cells = submapRuntime.cellsDensityMap?.[value] ?? (submapRuntime.ensureEl("pointsInput") as HTMLInputElement).dataset.cells;
      submapPointsInput.value = value;
      submapPointsInput.dataset.cells = String(cells);

      const output = submapRuntime.ensureEl("submapPointsFormatted") as HTMLInputElement;
      output.value = cells / 1000 + "K";
      output.style.color = submapRuntime.getCellsDensityColor(cells);
    }
  }

  function generateSubmap() {
    submapRuntime.INFO && console.group("generateSubmap");

    const [x0, y0] = [Math.abs(submapRuntime.viewX / submapRuntime.scale), Math.abs(submapRuntime.viewY / submapRuntime.scale)];
    recalculateMapSize(x0, y0);

    const submapPointsValue = (submapRuntime.ensureEl("submapPointsInput") as HTMLInputElement).value;
    const globalPointsValue = (submapRuntime.ensureEl("pointsInput") as HTMLInputElement).value;
    if (submapPointsValue !== globalPointsValue) submapRuntime.changeCellsDensity(submapPointsValue);

    const projection = (x: number, y: number) => [(x - x0) * submapRuntime.scale, (y - y0) * submapRuntime.scale];
    const inverse = (x: number, y: number) => [x / submapRuntime.scale + x0, y / submapRuntime.scale + y0];

    submapRuntime.applyGraphSize();
    submapRuntime.fitMapToScreen();
    submapRuntime.resetZoom(0);
    submapRuntime.undraw();
    submapRuntime.Resample.process({projection, inverse, scale: submapRuntime.scale});

    if ((submapRuntime.ensureEl("submapRescaleBurgStyles") as HTMLInputElement).checked)
      rescaleBurgStyles(submapRuntime.scale);
    submapRuntime.drawLayers();

    submapRuntime.INFO && console.groupEnd();
  }

  function recalculateMapSize(x0: number, y0: number) {
    const mapSizeOutput = submapRuntime.ensureEl("mapSizeOutput") as HTMLInputElement;
    const mapSizeInput = submapRuntime.ensureEl("mapSizeInput") as HTMLInputElement;
    const mapSize = +mapSizeOutput.value;
    mapSizeOutput.value = mapSizeInput.value = String(submapRuntime.rn(mapSize / submapRuntime.scale, 2));

    const latT = submapRuntime.mapCoordinates.latT / submapRuntime.scale;
    const latN = submapRuntime.getLatitude(y0);
    const latShift = (90 - latN) / (180 - latT);
    const latitudeOutput = submapRuntime.ensureEl("latitudeOutput") as HTMLInputElement;
    const latitudeInput = submapRuntime.ensureEl("latitudeInput") as HTMLInputElement;
    latitudeOutput.value = latitudeInput.value = String(submapRuntime.rn(latShift * 100, 2));

    const lotT = submapRuntime.mapCoordinates.lonT / submapRuntime.scale;
    const lonE = submapRuntime.getLongitude(x0 + submapRuntime.graphWidth / submapRuntime.scale);
    const lonShift = (180 - lonE) / (360 - lotT);
    const longitudeOutput = submapRuntime.ensureEl("longitudeOutput") as HTMLInputElement;
    const longitudeInput = submapRuntime.ensureEl("longitudeInput") as HTMLInputElement;
    longitudeOutput.value = longitudeInput.value = String(submapRuntime.rn(lonShift * 100, 2));

    submapRuntime.distanceScale = submapRuntime.rn(submapRuntime.distanceScale / submapRuntime.scale, 2);
    submapRuntime.populationRate = submapRuntime.rn(submapRuntime.populationRate / submapRuntime.scale, 2);
    submapRuntime.distanceScaleInput.value = String(submapRuntime.distanceScale);
    submapRuntime.populationRateInput.value = String(submapRuntime.populationRate);
  }

  function rescaleBurgStyles(scale: number) {
    const burgIcons = Array.from(submapRuntime.ensureEl("burgIcons").querySelectorAll("g")) as SVGGElement[];
    for (const group of burgIcons) {
      const size = Number(group.getAttribute("size"));
      const newSize = submapRuntime.rn(submapRuntime.minmax(size * scale, 0.2, 10), 2);
      group.setAttribute("font-size", String(newSize));

      const strokeWidth = Number(group.getAttribute("stroke-width"));
      const newStroke = submapRuntime.rn(strokeWidth * scale, 2);
      group.setAttribute("stroke-width", String(newStroke));
    }

    const burgLabels = Array.from(submapRuntime.ensureEl("burgLabels").querySelectorAll("g")) as SVGGElement[];
    for (const group of burgLabels) {
      const size = +group.dataset.size;
      group.dataset.size = String(Math.max(submapRuntime.rn((size + size / scale) / 2, 2), 1) * scale);
    }
  }
}

// Register function in global scope for legacy code compatibility
(globalThis as any).openSubmapTool = openSubmapTool;
