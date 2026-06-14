import { type D3DragEvent, drag, pointer } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Routes } from "../modules/routes-generator";
import { drawTemperature } from "../renderers";
import { drawScaleBar, fitScaleBar } from "../renderers/index";
import { openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { ensureEl, findCell, showPrompt } from "../utils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

export function editUnits(): void {
  closeDialogs("#unitsEditor, .stable");
  openDialog("unitsEditor");

  if (modules.editUnits) return;
  modules.editUnits = true;

  openDialog("unitsEditor", {
    title: "Units Editor",
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  const renderScaleBar = () => {
    drawScaleBar(worldContext, viewContext, appServices, scaleBar, scale);
    fitScaleBar(worldContext, viewContext, appServices, scaleBar, svgWidth, svgHeight);
  };

  // add listeners
  ensureEl("distanceUnitInput").on("change", changeDistanceUnit);
  ensureEl("distanceScaleInput").on("change", changeDistanceScale);
  ensureEl("heightUnit").on("change", changeHeightUnit);
  ensureEl("heightExponentInput").on("input", changeHeightExponent);
  ensureEl("temperatureScale").on("change", changeTemperatureScale);

  ensureEl("populationRateInput").on("change", changePopulationRate);
  ensureEl("urbanizationInput").on("change", changeUrbanizationRate);
  ensureEl("urbanDensityInput").on("change", changeUrbanDensity);

  ensureEl("addLinearRuler").on("click", addRuler);
  ensureEl("addOpisometer").on("click", toggleOpisometerMode);
  ensureEl("addRouteOpisometer").on("click", toggleRouteOpisometerMode);
  ensureEl("addPlanimeter").on("click", togglePlanimeterMode);
  ensureEl("removeRulers").on("click", removeAllRulers);
  ensureEl("unitsRestore").on("click", restoreDefaultUnits);

  function changeDistanceUnit(this: HTMLSelectElement): void {
    if (this.value === "custom_name") {
      showPrompt("Provide a custom name for a distance unit", { default: "" }, value => {
        const custom = String(value);
        this.options.add(new Option(custom, custom, false, true));
        lock("distanceUnit");
        renderScaleBar();
        calculateFriendlyGridSize();
      });
      return;
    }

    renderScaleBar();
    calculateFriendlyGridSize();
  }

  function changeDistanceScale(this: HTMLInputElement): void {
    distanceScale = +this.value;
    renderScaleBar();
    calculateFriendlyGridSize();
  }

  function changeHeightUnit(this: HTMLSelectElement): void {
    if (this.value !== "custom_name") return;

    showPrompt("Provide a custom name for a height unit", { default: "" }, value => {
      const custom = String(value);
      this.options.add(new Option(custom, custom, false, true));
      lock("heightUnit");
    });
  }

  function changeHeightExponent(): void {
    calculateTemperatures();
    if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  }

  function changeTemperatureScale(): void {
    if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  }

  function changePopulationRate(this: HTMLInputElement): void {
    populationRate = +this.value;
  }

  function changeUrbanizationRate(this: HTMLInputElement): void {
    urbanization = +this.value;
  }

  function changeUrbanDensity(this: HTMLInputElement): void {
    urbanDensity = +this.value;
  }

  function restoreDefaultUnits(): void {
    distanceScale = 3;
    distanceScaleInput.value = String(distanceScale);
    unlock("distanceScale");

    // units
    const US = navigator.language === "en-US";
    const UK = navigator.language === "en-GB";
    distanceUnitInput.value = US || UK ? "mi" : "km";
    heightUnit.value = US || UK ? "ft" : "m";
    temperatureScale.value = US ? "°F" : "°C";
    areaUnit.value = "square";
    localStorage.removeItem("distanceUnit");
    localStorage.removeItem("heightUnit");
    localStorage.removeItem("temperatureScale");
    localStorage.removeItem("areaUnit");
    calculateFriendlyGridSize();

    // height exponent
    heightExponentInput.value = "1.8";
    localStorage.removeItem("heightExponent");
    calculateTemperatures();

    renderScaleBar();

    // population
    populationRateInput.value = "1000";
    populationRate = +populationRateInput.value;
    urbanizationInput.value = "1";
    urbanization = +urbanizationInput.value;
    urbanDensityInput.value = "10";
    urbanDensity = +urbanDensityInput.value;
    localStorage.removeItem("populationRate");
    localStorage.removeItem("urbanization");
    localStorage.removeItem("urbanDensity");
  }

  function addRuler(): void {
    if (!layerIsOn("toggleRulers")) toggleRulers();

    const width = Math.min(graphWidth, svgWidth);
    const height = Math.min(graphHeight, svgHeight);
    const pt = (document.getElementById("map") as unknown as SVGSVGElement).createSVGPoint();
    pt.x = width / 2;
    pt.y = height / 4;
    const p = pt.matrixTransform((viewbox.node() as SVGGraphicsElement).getScreenCTM()!.inverse());

    const dx = width / 4 / scale;
    const dy = (rulers.data.length * 40) % (height / 2);
    const from: [number, number] = [(p.x - dx) | 0, (p.y + dy) | 0];
    const to: [number, number] = [(p.x + dx) | 0, (p.y + dy) | 0];
    rulers.create(Ruler, [from, to]).draw();
  }

  function toggleOpisometerMode(this: HTMLElement): void {
    if (this.classList.contains("pressed")) {
      restoreDefaultEvents?.();
      clearMainTip();
      this.classList.remove("pressed");
    } else {
      if (!layerIsOn("toggleRulers")) toggleRulers();
      tip("Draw a curve to measure length. Hold Shift to disallow path optimization", true);
      unitsBottom.querySelectorAll(".pressed").forEach(b => {
        b.classList.remove("pressed");
      });
      this.classList.add("pressed");
      viewbox.style("cursor", "crosshair").call(
        drag<SVGGElement, unknown>().on(
          "start",
          function (this: SVGGElement, startEvent: D3DragEvent<SVGGElement, unknown, unknown>) {
            const point = pointer(startEvent, this) as [number, number];
            const opisometer = rulers.create(Opisometer, [point]).draw();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            startEvent.on("drag", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
              opisometer.addPoint(event, pointer(event, this) as [number, number]);
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            startEvent.on("end", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
              restoreDefaultEvents?.();
              clearMainTip();
              (document.getElementById("addOpisometer") as HTMLElement).classList.remove("pressed");
              if (opisometer.points.length < 2) rulers.remove(opisometer.id);
              if (!event.sourceEvent.shiftKey) opisometer.optimize();
            });
          }
        )
      );
    }
  }

  function toggleRouteOpisometerMode(this: HTMLElement): void {
    if (this.classList.contains("pressed")) {
      restoreDefaultEvents?.();
      clearMainTip();
      this.classList.remove("pressed");
    } else {
      if (!layerIsOn("toggleRulers")) toggleRulers();
      tip("Draw a curve along routes to measure length. Hold Shift to measure away from roads.", true);
      unitsBottom.querySelectorAll(".pressed").forEach(b => {
        b.classList.remove("pressed");
      });
      this.classList.add("pressed");

      viewbox.style("cursor", "crosshair").call(
        drag<SVGGElement, unknown>().on(
          "start",
          function (this: SVGGElement, startEvent: D3DragEvent<SVGGElement, unknown, unknown>) {
            const cells = pack.cells;
            const burgs = pack.burgs;
            const point = pointer(startEvent, this) as [number, number];
            const c = findCell(point[0], point[1]);

            if (Routes.isConnected(c) || startEvent.sourceEvent.shiftKey) {
              const b = cells.burg[c];
              const x = b ? burgs[b].x : cells.p[c][0];
              const y = b ? burgs[b].y : cells.p[c][1];
              const routeOpisometer = rulers.create(RouteOpisometer, [[x, y]]).draw();

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              startEvent.on("drag", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
                const pt = pointer(event, this) as [number, number];
                const ci = findCell(pt[0], pt[1]);
                if (Routes.isConnected(ci) || event.sourceEvent.shiftKey) {
                  routeOpisometer.trackCell(ci, true);
                }
              });

              startEvent.on("end", () => {
                restoreDefaultEvents?.();
                clearMainTip();
                (document.getElementById("addRouteOpisometer") as HTMLElement).classList.remove("pressed");
                if (routeOpisometer.points.length < 2) {
                  rulers.remove(routeOpisometer.id);
                }
              });
            } else {
              restoreDefaultEvents?.();
              clearMainTip();
              (document.getElementById("addRouteOpisometer") as HTMLElement).classList.remove("pressed");
              tip("Must start in a cell with a route in it", false, "error");
            }
          }
        )
      );
    }
  }

  function togglePlanimeterMode(this: HTMLElement): void {
    if (this.classList.contains("pressed")) {
      restoreDefaultEvents?.();
      clearMainTip();
      this.classList.remove("pressed");
    } else {
      if (!layerIsOn("toggleRulers")) toggleRulers();
      tip("Draw a curve to measure its area. Hold Shift to disallow path optimization", true);
      unitsBottom.querySelectorAll(".pressed").forEach(b => {
        b.classList.remove("pressed");
      });
      this.classList.add("pressed");
      viewbox.style("cursor", "crosshair").call(
        drag<SVGGElement, unknown>().on(
          "start",
          function (this: SVGGElement, startEvent: D3DragEvent<SVGGElement, unknown, unknown>) {
            const point = pointer(startEvent, this) as [number, number];
            const planimeter = rulers.create(Planimeter, [point]).draw();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            startEvent.on("drag", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
              planimeter.addPoint(event, pointer(event, this) as [number, number]);
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            startEvent.on("end", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
              restoreDefaultEvents?.();
              clearMainTip();
              (document.getElementById("addPlanimeter") as HTMLElement).classList.remove("pressed");
              if (planimeter.points.length < 3) rulers.remove(planimeter.id);
              else if (!event.sourceEvent.shiftKey) planimeter.optimize();
            });
          }
        )
      );
    }
  }

  function removeAllRulers(): void {
    if (!rulers.data.length) return;
    alertMessage.innerHTML = /* html */ ` Are you sure you want to remove all placed rulers?
      <br />If you just want to hide rulers, toggle the Rulers layer off in Menu`;
    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Remove all rulers",
      buttons: {
        Remove: () => {
          /* $(this).dialog("close") removed */
          rulers.undraw();
          rulers = new Rulers();
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }
}

export function initUnitsEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
