import { type D3DragEvent, drag, pointer } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Routes } from "../generators/routes-generator";
import { drawTemperature } from "../renderers";
import { drawScaleBar, fitScaleBar } from "../renderers/index";
import { modules, rulers, setRulers } from "../store/editorState";
import { getUnitsEditorState, setUnitsEditorState } from "../store/unitsEditorState";
import { closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { findCell, showPrompt } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, lock, tip, unlock } from "../utils/uiHelpers";
import { toggleRulers } from "./layers";
import { calculateFriendlyGridSize } from "./style";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

export function editUnits(): void {
  closeDialogs("#unitsEditor, .stable");
  setUnitsEditorState({ isOpen: true, rulerMode: "none" });

  openDialog("unitsEditor", {
    title: "Units Editor",
    onClose: () => setUnitsEditorState({ isOpen: false }),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  modules.editUnits = true;
}

const renderScaleBar = () => {
  drawScaleBar(worldContext, viewContext, appServices, viewContext.scaleBar, viewContext.scale);
  fitScaleBar(
    worldContext,
    viewContext,
    appServices,
    viewContext.scaleBar,
    viewContext.svgWidth,
    viewContext.svgHeight
  );
};

export const unitsEditorActions = {
  changeDistanceUnit(value: string): void {
    if (value === "custom_name") {
      const select = document.getElementById("distanceUnitInput") as HTMLSelectElement;
      showPrompt("Provide a custom name for a distance unit", { default: "" }, customValue => {
        const custom = String(customValue);
        select.options.add(new Option(custom, custom, false, true));
        lock("distanceUnit");
        renderScaleBar();
        calculateFriendlyGridSize();
      });
      return;
    }
    renderScaleBar();
    calculateFriendlyGridSize();
  },

  changeDistanceScale(value: number): void {
    worldContext.distanceScale = value;
    renderScaleBar();
    calculateFriendlyGridSize();
  },

  changeHeightUnit(value: string): void {
    if (value !== "custom_name") return;
    const select = document.getElementById("heightUnit") as HTMLSelectElement;
    showPrompt("Provide a custom name for a height unit", { default: "" }, customValue => {
      const custom = String(customValue);
      select.options.add(new Option(custom, custom, false, true));
      lock("heightUnit");
    });
  },

  changeHeightExponent(): void {
    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true } }));
    if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  },

  changeTemperatureScale(): void {
    if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  },

  changePopulationRate(value: number): void {
    worldContext.populationRate = value;
  },

  changeUrbanizationRate(value: number): void {
    worldContext.urbanization = value;
  },

  changeUrbanDensity(value: number): void {
    worldContext.urbanDensity = value;
  },

  restoreDefaultUnits(): void {
    worldContext.distanceScale = 3;
    const distanceScaleInput = document.getElementById("distanceScaleInput") as HTMLInputElement | null;
    if (distanceScaleInput) distanceScaleInput.value = String(worldContext.distanceScale);
    unlock("distanceScale");

    const US = navigator.language === "en-US";
    const UK = navigator.language === "en-GB";
    const distanceUnitInput = document.getElementById("distanceUnitInput") as HTMLSelectElement | null;
    const heightUnit = document.getElementById("heightUnit") as HTMLSelectElement | null;
    const temperatureScale = document.getElementById("temperatureScale") as HTMLSelectElement | null;
    const areaUnit = document.getElementById("areaUnit") as HTMLInputElement | null;

    if (distanceUnitInput) distanceUnitInput.value = US || UK ? "mi" : "km";
    if (heightUnit) heightUnit.value = US || UK ? "ft" : "m";
    if (temperatureScale) temperatureScale.value = US ? "°F" : "°C";
    if (areaUnit) areaUnit.value = "square";
    localStorage.removeItem("distanceUnit");
    localStorage.removeItem("heightUnit");
    localStorage.removeItem("temperatureScale");
    localStorage.removeItem("areaUnit");
    calculateFriendlyGridSize();

    const heightExponentInput = document.getElementById("heightExponentInput") as HTMLInputElement | null;
    if (heightExponentInput) heightExponentInput.value = "1.8";
    localStorage.removeItem("heightExponent");
    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true } }));

    renderScaleBar();

    const populationRateInput = document.getElementById("populationRateInput") as HTMLInputElement | null;
    const urbanizationInput = document.getElementById("urbanizationInput") as HTMLInputElement | null;
    const urbanDensityInput = document.getElementById("urbanDensityInput") as HTMLInputElement | null;
    if (populationRateInput) {
      populationRateInput.value = "1000";
      worldContext.populationRate = 1000;
    }
    if (urbanizationInput) {
      urbanizationInput.value = "1";
      worldContext.urbanization = 1;
    }
    if (urbanDensityInput) {
      urbanDensityInput.value = "10";
      worldContext.urbanDensity = 10;
    }
    localStorage.removeItem("populationRate");
    localStorage.removeItem("urbanization");
    localStorage.removeItem("urbanDensity");
  },

  addRuler(): void {
    if (!layerIsOn("toggleRulers")) toggleRulers();

    const width = Math.min(worldContext.graphWidth, viewContext.svgWidth);
    const height = Math.min(worldContext.graphHeight, viewContext.svgHeight);
    const pt = (document.getElementById("map") as Element as SVGSVGElement).createSVGPoint();
    pt.x = width / 2;
    pt.y = height / 4;
    const p = pt.matrixTransform((viewContext.viewbox.node() as SVGGraphicsElement).getScreenCTM()!.inverse());

    const dx = width / 4 / viewContext.scale;
    const dy = (rulers.data.length * 40) % (height / 2);
    const from: [number, number] = [(p.x - dx) | 0, (p.y + dy) | 0];
    const to: [number, number] = [(p.x + dx) | 0, (p.y + dy) | 0];
    rulers.create(Ruler, [from, to]).draw();
  },

  toggleOpisometerMode(): void {
    const { rulerMode } = getUnitsEditorState();
    if (rulerMode === "opisometer") {
      EditorBus.restoreDefaultEvents();
      clearMainTip();
      setUnitsEditorState({ rulerMode: "none" });
      return;
    }
    if (!layerIsOn("toggleRulers")) toggleRulers();
    tip("Draw a curve to measure length. Hold Shift to disallow path optimization", true);
    setUnitsEditorState({ rulerMode: "opisometer" });
    viewContext.viewbox.style("cursor", "crosshair").call(
      drag<SVGGElement, unknown>().on(
        "start",
        function (this: SVGGElement, startEvent: D3DragEvent<SVGGElement, unknown, unknown>) {
          const point = pointer(startEvent, this) as [number, number];
          const opisometer = rulers.create(Opisometer, [point]).draw();

          startEvent.on("drag", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
            opisometer.addPoint(event, pointer(event, this) as [number, number]);
          });

          startEvent.on("end", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
            EditorBus.restoreDefaultEvents();
            clearMainTip();
            setUnitsEditorState({ rulerMode: "none" });
            if (opisometer.points.length < 2) rulers.remove(opisometer.id);
            if (!event.sourceEvent.shiftKey) opisometer.optimize();
          });
        }
      )
    );
  },

  toggleRouteOpisometerMode(): void {
    const { rulerMode } = getUnitsEditorState();
    if (rulerMode === "routeOpisometer") {
      EditorBus.restoreDefaultEvents();
      clearMainTip();
      setUnitsEditorState({ rulerMode: "none" });
      return;
    }
    if (!layerIsOn("toggleRulers")) toggleRulers();
    tip("Draw a curve along routes to measure length. Hold Shift to measure away from roads.", true);
    setUnitsEditorState({ rulerMode: "routeOpisometer" });

    viewContext.viewbox.style("cursor", "crosshair").call(
      drag<SVGGElement, unknown>().on(
        "start",
        function (this: SVGGElement, startEvent: D3DragEvent<SVGGElement, unknown, unknown>) {
          const cells = worldContext.pack.cells;
          const burgs = worldContext.pack.burgs;
          const point = pointer(startEvent, this) as [number, number];
          const c = findCell(point[0], point[1]);

          if (Routes.isConnected(c) || startEvent.sourceEvent.shiftKey) {
            const b = cells.burg[c];
            const x = b ? burgs[b].x : cells.p[c][0];
            const y = b ? burgs[b].y : cells.p[c][1];
            const routeOpisometer = rulers.create(RouteOpisometer, [[x, y]]).draw();

            startEvent.on("drag", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
              const pt = pointer(event, this) as [number, number];
              const ci = findCell(pt[0], pt[1]);
              if (Routes.isConnected(ci) || event.sourceEvent.shiftKey) {
                routeOpisometer.trackCell(ci, true);
              }
            });

            startEvent.on("end", () => {
              EditorBus.restoreDefaultEvents();
              clearMainTip();
              setUnitsEditorState({ rulerMode: "none" });
              if (routeOpisometer.points.length < 2) {
                rulers.remove(routeOpisometer.id);
              }
            });
          } else {
            EditorBus.restoreDefaultEvents();
            clearMainTip();
            setUnitsEditorState({ rulerMode: "none" });
            tip("Must start in a cell with a route in it", false, "error");
          }
        }
      )
    );
  },

  togglePlanimeterMode(): void {
    const { rulerMode } = getUnitsEditorState();
    if (rulerMode === "planimeter") {
      EditorBus.restoreDefaultEvents();
      clearMainTip();
      setUnitsEditorState({ rulerMode: "none" });
      return;
    }
    if (!layerIsOn("toggleRulers")) toggleRulers();
    tip("Draw a curve to measure its area. Hold Shift to disallow path optimization", true);
    setUnitsEditorState({ rulerMode: "planimeter" });
    viewContext.viewbox.style("cursor", "crosshair").call(
      drag<SVGGElement, unknown>().on(
        "start",
        function (this: SVGGElement, startEvent: D3DragEvent<SVGGElement, unknown, unknown>) {
          const point = pointer(startEvent, this) as [number, number];
          const planimeter = rulers.create(Planimeter, [point]).draw();

          startEvent.on("drag", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
            planimeter.addPoint(event, pointer(event, this) as [number, number]);
          });

          startEvent.on("end", (event: D3DragEvent<SVGGElement, unknown, unknown>) => {
            EditorBus.restoreDefaultEvents();
            clearMainTip();
            setUnitsEditorState({ rulerMode: "none" });
            if (planimeter.points.length < 3) rulers.remove(planimeter.id);
            else if (!event.sourceEvent.shiftKey) planimeter.optimize();
          });
        }
      )
    );
  },

  removeAllRulers(): void {
    if (!rulers.data.length) return;
    const alertContent = /* html */ ` Are you sure you want to remove all placed rulers?
      <br />If you just want to hide rulers, toggle the Rulers layer off in Menu`;
    openRichDialog({
      content: alertContent,
      resizable: false,
      title: "Remove all rulers",
      buttons: {
        Remove: () => {
          rulers.undraw();
          setRulers(new Rulers());
        },
        Cancel: () => {}
      }
    });
  }
};

export function initUnitsEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}

// CustomEvent Listeners
document.addEventListener("fmg:edit-units", () => editUnits());
