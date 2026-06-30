import { type D3DragEvent, drag, pointer } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Routes } from "../generators/routes-generator";
import { drawTemperature } from "../renderers";
import { drawScaleBar, fitScaleBar } from "../renderers/index";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules, rulers, setRulers } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import { getUnitsEditorState, setUnitsEditorState } from "../store/unitsEditorState";
import { closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { findCell } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getElementById, layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, tip } from "../utils/uiHelpers";
import { toggleRulers } from "./layers";
import { calculateFriendlyGridSize } from "./style";

let worldContext: WorldContext;
let appServices: AppServices;

export function editUnits(): void {
  closeDialogs("#unitsEditor, .stable");
  setUnitsEditorState({ isOpen: true, rulerMode: "none" });

  openDialog("unitsEditor", {
    title: "Units Editor",
    onClose: () => {
      setUnitsEditorState({ isOpen: false });
      modules.editUnits = false;
    },
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  modules.editUnits = true;
}

const renderScaleBar = () => {
  drawScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.scale);
  fitScaleBar(worldContext, viewContext, appServices, view.scaleBar, view.svgWidth, view.svgHeight);
};

export const unitsEditorActions = {
  changeDistanceUnit(_value: string): void {
    renderScaleBar();
    calculateFriendlyGridSize();
  },

  changeDistanceScale(value: number): void {
    worldContext.distanceScale = value;
    renderScaleBar();
    calculateFriendlyGridSize();
  },

  changeHeightUnit(_value: string): void {
    // React UI handles custom name prompts and state sync
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
    const options = useOptionsState.getState();
    worldContext.distanceScale = 3;
    const US = navigator.language === "en-US";
    const UK = navigator.language === "en-GB";

    options.setOptions({
      distanceScale: 3,
      distanceUnit: US || UK ? "mi" : "km",
      heightUnit: US || UK ? "ft" : "m",
      temperatureScale: US ? "°F" : "°C",
      areaUnit: "square",
      heightExponent: 1.8,
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: 10
    });

    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.urbanDensity = 10;

    localStorage.removeItem("distanceUnit");
    localStorage.removeItem("heightUnit");
    localStorage.removeItem("temperatureScale");
    localStorage.removeItem("areaUnit");
    localStorage.removeItem("heightExponent");
    localStorage.removeItem("populationRate");
    localStorage.removeItem("urbanization");
    localStorage.removeItem("urbanDensity");

    calculateFriendlyGridSize();
    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true } }));
    renderScaleBar();
  },

  addRuler(): void {
    if (!layerIsOn("toggleRulers")) toggleRulers();

    const width = Math.min(worldContext.graphWidth, view.svgWidth);
    const height = Math.min(worldContext.graphHeight, view.svgHeight);
    const mapSvg = getElementById<SVGSVGElement>("map");
    if (!mapSvg) return;
    const pt = mapSvg.createSVGPoint();
    pt.x = width / 2;
    pt.y = height / 4;
    const p = pt.matrixTransform((view.viewbox.node() as SVGGraphicsElement).getScreenCTM()!.inverse());

    const dx = width / 4 / view.scale;
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
    view.viewbox.style("cursor", "crosshair").call(
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

    view.viewbox.style("cursor", "crosshair").call(
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
    view.viewbox.style("cursor", "crosshair").call(
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
    openConfirm(
      `Are you sure you want to remove all placed rulers?
      <br />If you just want to hide rulers, toggle the Rulers layer off in Menu`,
      {
        title: "Remove all rulers",
        confirm: "Remove",
        onConfirm: () => {
          rulers.undraw();
          setRulers(new Rulers());
        }
      }
    );
  }
};

export function initUnitsEditor(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}

// CustomEvent Listeners
document.addEventListener("fmg:edit-units", () => editUnits());
