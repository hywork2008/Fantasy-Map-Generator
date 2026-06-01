"use strict";
import { COArenderer } from "@fmg/core/modules/emblem/renderer";
import { editBurgGroups } from "./group-editor";
import { closeDialogs, unselect, confirmationDialog, clicked } from "@legacy-ui-runtime/modules/ui/editors";
import { clearMainTip, getHeight, tip } from "@legacy-ui-runtime/modules/ui/general";
import { layerIsOn, toggleBurgIcons, toggleCells, toggleLabels } from "@legacy-ui-runtime/modules/ui/layers";
import { editEmblem } from "@legacy-ui-runtime/modules/ui/emblems-editor";
import { editNotes } from "@legacy-ui-runtime/modules/ui/notes-editor";
import { editStyle } from "@legacy-ui-runtime/modules/ui/style";
import type { Burg } from "@fmg/burgs";
import { requireFmgApi } from "@legacy-ui-runtime/modules/runtime/fmg-api";

const getBurgs = () => requireFmgApi("Burgs") as {
  changeGroup: (burg: unknown, group?: string | null) => void;
  getPreview: (burg: unknown) => { link: string | null; preview: string | null };
  remove: (burgId: number) => void;
};

class BurgEditor {
  public open(id?: unknown) {
    if (customization) return;
    closeDialogs(".stable");
    if (!layerIsOn("toggleBurgIcons")) toggleBurgIcons();
    if (!layerIsOn("toggleLabels")) toggleLabels();

    const burg = id || d3.event.target.dataset.id;
    elSelected = burgLabels.select("[data-id='" + burg + "']");
    burgLabels.selectAll("text").call(
      d3.drag().on("start", function(this: SVGTextElement) { burgEditorSelf.dragBurgLabel(this); })
    ).classed("draggable", true);
    this.updateGroupsList();
    this.updateBurgValues();

    $("#burgEditor").dialog({
      title: "Edit Burg",
      resizable: false,
      close: () => this.closeBurgEditor(),
      position: {my: "left top", at: "left+10 top+10", of: "svg", collision: "fit"}
    });

    if (modules.editBurg) return;
    modules.editBurg = true;

    ensureEl("burgName").on("input", () => this.changeName());
    ensureEl("burgNameReRandom").on("click", () => this.generateNameRandom());
    ensureEl("burgGroup").on("change", () => this.changeGroup());
    ensureEl("burgGroupConfigure").on("click", editBurgGroups);
    ensureEl("burgType").on("change", () => this.changeType());
    ensureEl("burgCulture").on("change", () => this.changeCulture());
    ensureEl("burgNameReCulture").on("click", () => this.generateNameCulture());
    ensureEl("burgPopulation").on("change", () => this.changePopulation());
    d3.select("#burgBody").selectAll(".burgFeature").on("click", function(this: HTMLElement) { burgEditorSelf.toggleFeature(this); });
    ensureEl("burgLinkOpen").on("click", () => this.openBurgLink());

    ensureEl("burgStyleShow").on("click", () => this.showStyleSection());
    ensureEl("burgStyleHide").on("click", () => this.hideStyleSection());
    ensureEl("burgEditLabelStyle").on("click", () => this.editGroupLabelStyle());
    ensureEl("burgEditIconStyle").on("click", () => this.editGroupIconStyle());
    ensureEl("burgEditAnchorStyle").on("click", () => this.editGroupAnchorStyle());

    ensureEl("burgEmblem").on("click", () => this.openEmblemEdit());
    ensureEl("burgSetPreviewLink").on("click", () => this.setCustomPreview());
    ensureEl("burgEditEmblem").on("click", () => this.openEmblemEdit());
    ensureEl("burgLocate").on("click", () => this.zoomIntoBurg());
    ensureEl("burgRelocate").on("click", () => this.toggleRelocateBurg());
    ensureEl("burglLegend").on("click", () => this.editBurgLegend());
    ensureEl("burgLock").on("click", () => this.toggleBurgLockButton());
    ensureEl("burgRemove").on("click", () => this.removeSelectedBurg());
    ensureEl("burgTemperatureGraph").on("click", () => this.showTemperatureGraph());
  }

  private updateGroupsList() {
    const burgGroupEl = ensureEl("burgGroup") as HTMLSelectElement;
    burgGroupEl.options.length = 0;
    for (const {name} of options.burgs.groups) {
      burgGroupEl.options.add(new Option(name, name));
    }
  }

  private updateBurgValues() {
    const id = +elSelected.attr("data-id");
    const b = pack.burgs[id];
    const province = pack.cells.province[b.cell];
    const provinceName = province ? pack.provinces[province].fullName + ", " : "";
    const stateName = pack.states[b.state].fullName || pack.states[b.state].name;
    ensureEl("burgProvinceAndState").innerHTML = provinceName + stateName;

    (ensureEl("burgName") as HTMLInputElement).value = b.name;
    (ensureEl("burgGroup") as HTMLSelectElement).value = b.group;
    (ensureEl("burgType") as HTMLSelectElement).value = b.type || "Generic";
    (ensureEl("burgPopulation") as HTMLInputElement).value = String(rn(b.population * populationRate * urbanization));
    (ensureEl("burgEditAnchorStyle") as HTMLElement).style.display = +b.port ? "inline-block" : "none";

    const cultureSelect = ensureEl("burgCulture") as HTMLSelectElement;
    cultureSelect.options.length = 0;
    const cultures = pack.cultures.filter((c: unknown) => !(c as {removed?: boolean}).removed) as unknown as {name: string; i: number}[];
    cultures.forEach((c) => cultureSelect.options.add(new Option(c.name, String(c.i), false, c.i === b.culture)));

    const temperature = grid.cells.temp[pack.cells.g[b.cell]];
    ensureEl("burgTemperature").innerHTML = convertTemperature(temperature);
    (ensureEl("burgTemperatureLikeIn") as HTMLElement).dataset.tip =
      "Average yearly temperature is like in " + getTemperatureLikeness(temperature);
    ensureEl("burgElevation").innerHTML = getHeight(pack.cells.h[b.cell]);

    ensureEl("burgCapital").classList.toggle("inactive", !b.capital);
    ensureEl("burgPort").classList.toggle("inactive", !b.port);
    ensureEl("burgCitadel").classList.toggle("inactive", !b.citadel);
    ensureEl("burgWalls").classList.toggle("inactive", !b.walls);
    ensureEl("burgPlaza").classList.toggle("inactive", !b.plaza);
    ensureEl("burgTemple").classList.toggle("inactive", !b.temple);
    ensureEl("burgShanty").classList.toggle("inactive", !b.shanty);

    this.updateBurgLockIcon();

    const coaID = "burgCOA" + id;
    COArenderer.trigger(coaID, b.coa);
    ensureEl("burgEmblem").setAttribute("href", "#" + coaID);

    this.updateBurgPreview(b);
  }

  public dragBurgLabel(element: SVGTextElement) {
    const tr = parseTransform(element.getAttribute("transform"));
    const dx = +tr[0] - d3.event.x,
      dy = +tr[1] - d3.event.y;

    d3.event.on("drag", function(this: SVGTextElement) {
      const x = d3.event.x,
        y = d3.event.y;
      this.setAttribute("transform", `translate(${dx + x},${dy + y})`);
      tip('Use dragging for fine-tuning only, to actually move burg use "Relocate" button', false, "warn");
    });
  }

  private changeName() {
    const id = +elSelected.attr("data-id");
    pack.burgs[id].name = (ensureEl("burgName") as HTMLInputElement).value;
    elSelected.text((ensureEl("burgName") as HTMLInputElement).value);
  }

  private generateNameRandom() {
    const base = rand(nameBases.length - 1);
    (ensureEl("burgName") as HTMLInputElement).value = Names.getBase(base);
    this.changeName();
  }

  private changeGroup() {
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];
    getBurgs().changeGroup(burg, (ensureEl("burgGroup") as HTMLSelectElement).value);
  }

  private changeType() {
    const id = +elSelected.attr("data-id");
    pack.burgs[id].type = (ensureEl("burgType") as HTMLSelectElement).value;
  }

  private changeCulture() {
    const id = +elSelected.attr("data-id");
    pack.burgs[id].culture = +(ensureEl("burgCulture") as HTMLSelectElement).value;
  }

  private generateNameCulture() {
    const id = +elSelected.attr("data-id");
    const culture = pack.burgs[id].culture;
    (ensureEl("burgName") as HTMLInputElement).value = Names.getCulture(culture);
    this.changeName();
  }

  private changePopulation() {
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];

    pack.burgs[id].population = rn(+(ensureEl("burgPopulation") as HTMLInputElement).value / populationRate / urbanization, 4);
    this.updateBurgPreview(burg);
  }

  public toggleFeature(el: HTMLElement) {
    const burgId = +elSelected.attr("data-id");
    const burg = pack.burgs[burgId];

    const feature = el.dataset.feature;
    const value = Number(el.classList.contains("inactive"));

    if (feature === "port") this.togglePort(burgId);
    else if (feature === "capital") this.toggleCapital(burgId);
    else burg[feature] = value;

    el.classList.toggle("inactive", !burg[feature]);

    (ensureEl("burgEditAnchorStyle") as HTMLElement).style.display = burg.port ? "inline-block" : "none";
    this.updateBurgPreview(burg);
  }

  private togglePort(burgId: number) {
    const burg = pack.burgs[burgId];
    if (burg.port) {
      burg.port = 0;

      const anchor = document.querySelector("#anchors [data-id='" + burgId + "']");
      if (anchor) anchor.remove();
    } else {
      const haven = pack.cells.haven[burg.cell];
      if (!haven) tip("Port haven is not found, system won't be able to make a searoute", false, "warn");
      const portFeature = haven ? pack.cells.f[haven] : -1;
      burg.port = portFeature;

      anchors
        .select("#" + burg.group)
        .append("use")
        .attr("href", "#icon-anchor")
        .attr("id", "anchor" + burg.i)
        .attr("data-id", burg.i)
        .attr("x", burg.x)
        .attr("y", burg.y);
    }
  }

  private toggleCapital(burgId: number) {
    const {burgs, states} = pack;

    if (burgs[burgId].capital)
      return tip("To change capital please assign a capital status to another burg of this state", false, "error");

    const stateId = burgs[burgId].state;
    if (!stateId) return tip("Neutral lands cannot have a capital", false, "error");

    const oldCapitalId = states[stateId].capital;
    states[stateId].capital = burgId;
    states[stateId].center = burgs[burgId].cell;

    const capital = burgs[burgId];
    capital.capital = 1;
    getBurgs().changeGroup(capital);

    const oldCapital = burgs[oldCapitalId];
    oldCapital.capital = 0;
    getBurgs().changeGroup(oldCapital);
  }

  private toggleBurgLockButton() {
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];
    burg.lock = !burg.lock;

    this.updateBurgLockIcon();
  }

  private updateBurgLockIcon() {
    const id = +elSelected.attr("data-id");
    const b = pack.burgs[id];
    if (b.lock) {
      ensureEl("burgLock").classList.remove("icon-lock-open");
      ensureEl("burgLock").classList.add("icon-lock");
    } else {
      ensureEl("burgLock").classList.remove("icon-lock");
      ensureEl("burgLock").classList.add("icon-lock-open");
    }
  }

  private showStyleSection() {
    document.querySelectorAll("#burgBottom > button").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("burgStyleSection") as HTMLElement).style.display = "inline-block";
  }

  private hideStyleSection() {
    document.querySelectorAll("#burgBottom > button").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("burgStyleSection") as HTMLElement).style.display = "none";
  }

  private editGroupLabelStyle() {
    const g = elSelected.node().parentNode.id;
    closeDialogs(".stable");
    editStyle("labels", g);
  }

  private editGroupIconStyle() {
    const g = elSelected.node().parentNode.id;
    closeDialogs(".stable");
    editStyle("burgIcons", g);
  }

  private editGroupAnchorStyle() {
    const g = elSelected.node().parentNode.id;
    closeDialogs(".stable");
    editStyle("anchors", g);
  }

  private updateBurgPreview(burg: Burg) {
    const preview = getBurgs().getPreview(burg).preview;
    if (!preview) {
      (ensureEl("burgPreviewSection") as HTMLElement).style.display = "none";
      return;
    }

    (ensureEl("burgPreviewSection") as HTMLElement).style.display = "block";

    const container = ensureEl("burgPreviewObject");
    container.innerHTML = "";
    const object = document.createElement("object");
    object.style.width = "100%";
    object.style.maxWidth = "60vw";
    object.style.maxHeight = "60vh";
    object.data = preview;
    container.insertBefore(object, null);
  }

  private openBurgLink() {
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];
    const link = getBurgs().getPreview(burg).link;
    if (link) openURL(link);
  }

  private setCustomPreview() {
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];

    prompt(
      "Provide custom URL to the burg map. It can be a link to a generator or just an image. Leave empty to use the default map preview",
      {default: getBurgs().getPreview(burg).link, required: false},
      (link: string) => {
        if (link) burg.link = link;
        else delete burg.link;
        this.updateBurgPreview(burg);
      }
    );
  }

  private openEmblemEdit() {
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];
    editEmblem("burg", "burgCOA" + id, burg);
  }

  private zoomIntoBurg() {
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];
    const x = burg.x;
    const y = burg.y;
    const zoomToGlobal = (window as unknown as {zoomTo?: (x: number, y: number, zoom?: number, duration?: number) => void})
      .zoomTo;
    if (!zoomToGlobal) return tip("Zoom API is not available", false, "error");
    zoomToGlobal(x, y, 8, 2000);
  }

  private toggleRelocateBurg() {
    const toggler = ensureEl("toggleCells");
    ensureEl("burgRelocate").classList.toggle("pressed");
    if (ensureEl("burgRelocate").classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair").on("click", () => this.relocateBurgOnClick());
      tip("Click on map to relocate burg. Hold Shift for continuous move", true);
      if (!layerIsOn("toggleCells")) {
        toggleCells();
        (toggler as HTMLElement).dataset.forced = "true";
      }
    } else {
      clearMainTip();
      viewbox.on("click", clicked).style("cursor", "default");
      if (layerIsOn("toggleCells") && (toggler as HTMLElement).dataset.forced) {
        toggleCells();
        (toggler as HTMLElement).dataset.forced = "";
      }
    }
  }

  private relocateBurgOnClick() {
    const cells = pack.cells;
    const point = d3.mouse(viewbox.node());
    const cellId = findCell(point[0], point[1]);
    const id = +elSelected.attr("data-id");
    const burg = pack.burgs[id];

    if (cells.h[cellId] < 20) return tip("Cannot place burg into the water! Select a land cell", false, "error");
    if (cells.burg[cellId] && cells.burg[cellId] !== id)
      return tip("There is already a burg in this cell. Please select a free cell", false, "error");

    const newState = cells.state[cellId];
    const oldState = burg.state;
    if (newState !== oldState && burg.capital)
      return tip("Capital cannot be relocated into another state!", false, "error");

    const x = rn(point[0], 2);
    const y = rn(point[1], 2);

    burgIcons.select(`#burg${id}`).attr("x", x).attr("y", y);
    burgLabels.select(`#burgLabel${id}`).attr("transform", null).attr("x", x).attr("y", y);

    const anchor = anchors.select("use[data-id='" + id + "']");
    if (anchor.size()) {
      const size = Number(anchor.attr("width")) || 0;
      const xa = rn(x - size * 0.47, 2);
      const ya = rn(y - size * 0.47, 2);
      anchor.attr("transform", null).attr("x", xa).attr("y", ya);
    }

    cells.burg[burg.cell] = 0;
    cells.burg[cellId] = id;
    burg.cell = cellId;
    burg.state = newState;
    burg.x = x;
    burg.y = y;
    if (burg.capital) pack.states[newState].center = burg.cell;

    if (d3.event.shiftKey === false) this.toggleRelocateBurg();
  }

  private editBurgLegend() {
    const id = elSelected.attr("data-id");
    const name = elSelected.text();
    editNotes("burg" + id, name);
  }

  private showTemperatureGraph() {
    const id = elSelected.attr("data-id");
    showBurgTemperatureGraph(id);
  }

  private removeSelectedBurg() {
    const burgId = +elSelected.attr("data-id");
    const burg = pack.burgs[burgId];

    if (burg.capital) {
      alertMessage.innerHTML = /* html */ `You cannot remove the capital. You must change the state capital first`;
      $("#alert").dialog({
        resizable: false,
        title: "Remove burg",
        buttons: {
          Ok: function () {
            $(this).dialog("close");
          }
        }
      });
    } else {
      confirmationDialog({
        title: "Remove burg",
        message: "Are you sure you want to remove the burg? <br>This action cannot be reverted",
        confirm: "Remove",
        onConfirm: () => {
          getBurgs().remove(burgId);
          $("#burgEditor").dialog("close");
        }
      });
    }
  }

  private closeBurgEditor() {
    ensureEl("burgRelocate").classList.remove("pressed");
    burgLabels.selectAll("text").call(d3.drag().on("drag", null)).classed("draggable", false);
    unselect();
  }
}

const burgEditorController = new BurgEditor();
const burgEditorSelf = burgEditorController;

export function editBurg(id?: any) {
  burgEditorController.open(id);
}

const meanTempCityMap: Record<string, string> = {
  "-5": "Snag (Yukon)",
  "-4": "Yellowknife (Canada)",
  "-3": "Okhotsk (Russia)",
  "-2": "Fairbanks (Alaska)",
  "-1": "Nuuk (Greenland)",
  0: "Murmansk (Russia)",
  1: "Arkhangelsk (Russia)",
  2: "Anchorage (Alaska)",
  3: "Tromsø (Norway)",
  4: "Reykjavik (Iceland)",
  5: "Harbin (China)",
  6: "Stockholm (Sweden)",
  7: "Montreal (Canada)",
  8: "Prague (Czechia)",
  9: "Copenhagen (Denmark)",
  10: "London (England)",
  11: "Antwerp (Belgium)",
  12: "Paris (France)",
  13: "Milan (Italy)",
  14: "Washington (D.C.)",
  15: "Rome (Italy)",
  16: "Dubrovnik (Croatia)",
  17: "Lisbon (Portugal)",
  18: "Barcelona (Spain)",
  19: "Marrakesh (Morocco)",
  20: "Alexandria (Egypt)",
  21: "Tegucigalpa (Honduras)",
  22: "Guangzhou (China)",
  23: "Rio de Janeiro (Brazil)",
  24: "Dakar (Senegal)",
  25: "Miami (USA)",
  26: "Jakarta (Indonesia)",
  27: "Mogadishu (Somalia)",
  28: "Bangkok (Thailand)",
  29: "Niamey (Niger)",
  30: "Khartoum (Sudan)"
};

function getTemperatureLikeness(temperature: number): string | null {
  if (temperature < -5) return "Yakutsk (Russia)";
  if (temperature > 30) return "Mecca (Saudi Arabia)";
  return meanTempCityMap[String(temperature)] || null;
}

