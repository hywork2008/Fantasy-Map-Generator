"use strict";

import { Routes } from "@fmg/core/modules/routes-generator";
import { clearMainTip, lock, unlock } from "./general";
import { Opisometer, Planimeter, RouteOpisometer, Ruler } from "./measurers";
import { layerIsOn, toggleRulers, toggleTemperature } from "./layers";
import { closeDialogs } from "./editors";
import { calculateFriendlyGridSize } from "./style";

declare const areaUnit: HTMLSelectElement;

class UnitsEditor {
  public open() {
    closeDialogs("#unitsEditor, .stable");
    $("#unitsEditor").dialog();

    if (modules.editUnits) return;
    modules.editUnits = true;

    $("#unitsEditor").dialog({
      title: "Units Editor",
      position: {my: "right top", at: "right-10 top+10", of: "svg", collision: "fit"}
    });

    ensureEl("distanceUnitInput").on("change", () => this.changeDistanceUnit());
    ensureEl("distanceScaleInput").on("change", () => this.changeDistanceScale());
    ensureEl("heightUnit").on("change", () => this.changeHeightUnit());
    ensureEl("heightExponentInput").on("input", () => this.changeHeightExponent());
    ensureEl("temperatureScale").on("change", () => this.changeTemperatureScale());

    ensureEl("populationRateInput").on("change", () => this.changePopulationRate());
    ensureEl("urbanizationInput").on("change", () => this.changeUrbanizationRate());
    ensureEl("urbanDensityInput").on("change", () => this.changeUrbanDensity());

    ensureEl("addLinearRuler").on("click", () => this.addRuler());
    ensureEl("addOpisometer").on("click", () => this.toggleOpisometerMode());
    ensureEl("addRouteOpisometer").on("click", () => this.toggleRouteOpisometerMode());
    ensureEl("addPlanimeter").on("click", () => this.togglePlanimeterMode());
    ensureEl("removeRulers").on("click", () => this.removeAllRulers());
    ensureEl("unitsRestore").on("click", () => this.restoreDefaultUnits());
  }

  private renderScaleBar() {
    drawScaleBar(scaleBar, scale);
    fitScaleBar(scaleBar, svgWidth, svgHeight);
  }

  private changeDistanceUnit() {
    const input = ensureEl("distanceUnitInput") as HTMLSelectElement;
    if (input.value === "custom_name") {
      prompt("Provide a custom name for a distance unit", {default: ""}, (custom: string) => {
        input.options.add(new Option(custom, custom, false, true));
        lock("distanceUnit");
        this.renderScaleBar();
        calculateFriendlyGridSize();
      });
      return;
    }
    this.renderScaleBar();
    calculateFriendlyGridSize();
  }

  private changeDistanceScale() {
    distanceScale = +(ensureEl("distanceScaleInput") as HTMLInputElement).value;
    this.renderScaleBar();
    calculateFriendlyGridSize();
  }

  private changeHeightUnit() {
    const select = ensureEl("heightUnit") as HTMLSelectElement;
    if (select.value !== "custom_name") return;
    prompt("Provide a custom name for a height unit", {default: ""}, (custom: string) => {
      select.options.add(new Option(custom, custom, false, true));
      lock("heightUnit");
    });
  }

  private changeHeightExponent() {
    calculateTemperatures();
    if (layerIsOn("toggleTemperature")) drawTemperature();
  }

  private changeTemperatureScale() {
    if (layerIsOn("toggleTemperature")) drawTemperature();
  }

  private changePopulationRate() {
    populationRate = +(ensureEl("populationRateInput") as HTMLInputElement).value;
  }

  private changeUrbanizationRate() {
    urbanization = +(ensureEl("urbanizationInput") as HTMLInputElement).value;
  }

  private changeUrbanDensity() {
    urbanDensity = +(ensureEl("urbanDensityInput") as HTMLInputElement).value;
  }

  private restoreDefaultUnits() {
    distanceScale = 3;
    ensureEl("distanceScaleInput").value = distanceScale;
    unlock("distanceScale");

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

    heightExponentInput.value = "1.8";
    localStorage.removeItem("heightExponent");
    calculateTemperatures();

    this.renderScaleBar();

    populationRate = 1000;
    populationRateInput.value = String(populationRate);
    urbanization = 1;
    urbanizationInput.value = String(urbanization);
    urbanDensity = 10;
    urbanDensityInput.value = String(urbanDensity);
    localStorage.removeItem("populationRate");
    localStorage.removeItem("urbanization");
    localStorage.removeItem("urbanDensity");
  }

  private addRuler() {
    if (!layerIsOn("toggleRulers")) toggleRulers();

    const width = Math.min(graphWidth, svgWidth);
    const height = Math.min(graphHeight, svgHeight);
    const pt = (ensureEl("map") as SVGSVGElement).createSVGPoint();
    pt.x = width / 2;
    pt.y = height / 4;
    const p = pt.matrixTransform((viewbox.node() as SVGGraphicsElement).getScreenCTM()!.inverse());

    const dx = width / 4 / scale;
    const dy = (rulers.data.length * 40) % (height / 2);
    const from = [(p.x - dx) | 0, (p.y + dy) | 0];
    const to = [(p.x + dx) | 0, (p.y + dy) | 0];
    rulers.create(Ruler, [from, to]).draw();
  }

  private toggleOpisometerMode() {
    const button = ensureEl("addOpisometer") as HTMLElement;
    if (button.classList.contains("pressed")) {
      restoreDefaultEvents();
      clearMainTip();
      button.classList.remove("pressed");
      return;
    }
    if (!layerIsOn("toggleRulers")) toggleRulers();
    tip("Draw a curve to measure length. Hold Shift to disallow path optimization", true);
    unitsBottom.querySelectorAll(".pressed").forEach((b: Element) => b.classList.remove("pressed"));
    button.classList.add("pressed");
    viewbox.style("cursor", "crosshair").call(
      d3.drag().on("start", function () {
        const point = d3.mouse(this);
        const opisometer = rulers.create(Opisometer, [point]).draw();
        d3.event.on("drag", function () {
          opisometer.addPoint(d3.mouse(this));
        });
        d3.event.on("end", function () {
          restoreDefaultEvents();
          clearMainTip();
          (ensureEl("addOpisometer") as HTMLElement).classList.remove("pressed");
          if (opisometer.points.length < 2) rulers.remove(opisometer.id);
          if (!d3.event.sourceEvent.shiftKey) opisometer.optimize();
        });
      })
    );
  }

  private toggleRouteOpisometerMode() {
    const button = ensureEl("addRouteOpisometer") as HTMLElement;
    if (button.classList.contains("pressed")) {
      restoreDefaultEvents();
      clearMainTip();
      button.classList.remove("pressed");
      return;
    }
    if (!layerIsOn("toggleRulers")) toggleRulers();
    tip("Draw a curve along routes to measure length. Hold Shift to measure away from roads.", true);
    unitsBottom.querySelectorAll(".pressed").forEach((b: Element) => b.classList.remove("pressed"));
    button.classList.add("pressed");
    viewbox.style("cursor", "crosshair").call(
      d3.drag().on("start", function () {
        const cells = pack.cells;
        const burgs = pack.burgs;
        const point = d3.mouse(this);
        const c = findCell(point[0], point[1]);

        if (Routes.isConnected(c) || d3.event.sourceEvent.shiftKey) {
          const b = cells.burg[c];
          const x = b ? burgs[b].x : cells.p[c][0];
          const y = b ? burgs[b].y : cells.p[c][1];
          const routeOpisometer = rulers.create(RouteOpisometer, [[x, y]]).draw();
          d3.event.on("drag", function () {
            const c = findCell(d3.mouse(this)[0], d3.mouse(this)[1]);
            if (Routes.isConnected(c) || d3.event.sourceEvent.shiftKey) routeOpisometer.trackCell(c, true);
          });
          d3.event.on("end", function () {
            restoreDefaultEvents();
            clearMainTip();
            (ensureEl("addRouteOpisometer") as HTMLElement).classList.remove("pressed");
            if (routeOpisometer.points.length < 2) rulers.remove(routeOpisometer.id);
          });
        } else {
          restoreDefaultEvents();
          clearMainTip();
          (ensureEl("addRouteOpisometer") as HTMLElement).classList.remove("pressed");
          tip("Must start in a cell with a route in it", false, "error");
        }
      })
    );
  }

  private togglePlanimeterMode() {
    const button = ensureEl("addPlanimeter") as HTMLElement;
    if (button.classList.contains("pressed")) {
      restoreDefaultEvents();
      clearMainTip();
      button.classList.remove("pressed");
      return;
    }
    if (!layerIsOn("toggleRulers")) toggleRulers();
    tip("Draw a curve to measure its area. Hold Shift to disallow path optimization", true);
    unitsBottom.querySelectorAll(".pressed").forEach((b: Element) => b.classList.remove("pressed"));
    button.classList.add("pressed");
    viewbox.style("cursor", "crosshair").call(
      d3.drag().on("start", function () {
        const point = d3.mouse(this);
        const planimeter = rulers.create(Planimeter, [point]).draw();
        d3.event.on("drag", function () {
          planimeter.addPoint(d3.mouse(this));
        });
        d3.event.on("end", function () {
          restoreDefaultEvents();
          clearMainTip();
          (ensureEl("addPlanimeter") as HTMLElement).classList.remove("pressed");
          if (planimeter.points.length < 3) rulers.remove(planimeter.id);
          else if (!d3.event.sourceEvent.shiftKey) planimeter.optimize();
        });
      })
    );
  }

  private removeAllRulers() {
    if (!rulers.data.length) return;
    alertMessage.innerHTML = /* html */ ` Are you sure you want to remove all placed rulers?
      <br />If you just want to hide rulers, toggle the Rulers layer off in Menu`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove all rulers",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          rulers.undraw();
          rulers = new Rulers();
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }
}

const unitsEditor = new UnitsEditor();

export function editUnits() {
  unitsEditor.open();
}
