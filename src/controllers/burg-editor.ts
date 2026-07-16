import { drag, pointer } from "d3";
import { zoomIntoBurg as zoomIntoBurgAction } from "../actions";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";

import { drawBurgIcon, drawBurgLabel, removeBurgCOA } from "../renderers";
import { COArenderer } from "../renderers/emblem-renderer";
import { burgEconomyExtensions } from "../services/burgEconomyExtensions";
import { getBurgSiteDescriptor } from "../services/burgSiteDescriptor";
import { getHeight } from "../services/cellInfoService";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { getBurgEditorState } from "../store/burgEditorState";
import { elSelected, modules, setElSelected } from "../store/editorState";
import type { Burg, Culture, CultureType } from "../types/models";
import { closeDialog, closeDialogs, openAlert, openDialog, openPrompt } from "../ui/dialogs/dialogService";
import { convertTemperature, findCell, openURL, parseTransform, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog } from "../utils/editorHelpers";
import { generateRandomName } from "../utils/nameGenerator";
import { getElementBySelector, layerIsOn } from "../utils/nodeUtils";
import { editBurgGroups } from "./burg-group-editor";
import { editEmblem } from "./emblems-editor";
import { interactionManager } from "./interactionManager";
import { toggleBurgIcons, toggleCells, toggleLabels } from "./layers";
import { editNotes } from "./notes-editor";
import { editStyle } from "./style";
import { showBurgTemperatureGraph } from "./temperature-graph";

let _currentBurgId = 0;
let cellsWasForced = false;

export function editBurg(id?: number): void {
  if (view.customization) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleBurgIcons")) toggleBurgIcons();
  if (!layerIsOn("toggleLabels")) toggleLabels();

  _currentBurgId = id ?? 0;
  setElSelected(view.burgLabels.select(`[data-id='${_currentBurgId}']`));
  let _bdx = 0,
    _bdy = 0;
  view.burgLabels
    .selectAll<SVGTextElement, unknown>("text")
    .call(
      drag<SVGTextElement, unknown>()
        .on(
          "start",
          function (this: SVGTextElement, event: import("d3").D3DragEvent<SVGTextElement, unknown, unknown>) {
            const tr = parseTransform(this.getAttribute("transform") || "");
            _bdx = +tr[0] - event.x;
            _bdy = +tr[1] - event.y;
          }
        )
        .on("drag", function (this: SVGTextElement, event: import("d3").D3DragEvent<SVGTextElement, unknown, unknown>) {
          this.setAttribute("transform", `translate(${_bdx + event.x},${_bdy + event.y})`);
          tip('Use dragging for fine-tuning only, to actually move burg use "Relocate" button', false, "warn");
        })
    )
    .classed("draggable", true);

  burgEditorInternal.updateGroupsList();
  burgEditorInternal.updateBurgValues();

  openDialog("burgEditor", {
    title: "Edit Burg",
    resizable: false,
    onClose: burgEditorInternal.closeBurgEditor,
    position: { my: "left top", at: "left+10 top+10", of: "svg", collision: "fit" }
  });

  if (modules.editBurg) return;
  modules.editBurg = true;
}

const burgEditorInternal = {
  getBurgId(): number {
    return _currentBurgId;
  },

  updateGroupsList(): void {
    const groups = worldContext.options.burgs.groups.map(g => g.name);
    getBurgEditorState().setGroups(groups);
  },

  updateBurgValues(): void {
    const burgId = burgEditorInternal.getBurgId();
    const b = worldContext.pack.burgs[burgId];
    const province = worldContext.pack.cells.province[b.cell];
    const provinceName = province ? `${worldContext.pack.provinces[province].fullName}, ` : "";
    const stateName = worldContext.pack.states[b.state!].fullName || worldContext.pack.states[b.state!].name;
    const provinceAndState = provinceName + stateName;

    const cultures = worldContext.pack.cultures
      .filter((c: Culture) => !c.removed)
      .map((c: Culture) => ({ id: c.i, name: c.name }));
    getBurgEditorState().setCultures(cultures);

    const temperature = worldContext.grid.cells.temp[worldContext.pack.cells.g[b.cell]];
    const tempStr = convertTemperature(temperature);
    const tempLikeIn = `Average yearly temperature is like in ${getTemperatureLikeness(temperature)}`;
    const elevationStr = getHeight(worldContext.pack.cells.h[b.cell]);

    const coaID = `burgCOA${burgId}`;
    COArenderer.trigger(coaID, b.coa!);

    const economySummary = burgEconomyExtensions.getBurgEconomySummary?.(burgId);

    getBurgEditorState().setBurgData({
      id: burgId,
      emblemId: coaID,
      provinceAndState,
      name: b.name ?? "",
      group: b.group ?? "",
      type: b.type || "Generic",
      culture: b.culture ?? 0,
      population: rn((b.population ?? 0) * worldContext.populationRate * worldContext.urbanization),
      children: b.demographics?.children
        ? rn(b.demographics.children * worldContext.populationRate * worldContext.urbanization)
        : 0,
      maleAdults: b.demographics?.maleAdults
        ? rn(b.demographics.maleAdults * worldContext.populationRate * worldContext.urbanization)
        : 0,
      femaleAdults: b.demographics?.femaleAdults
        ? rn(b.demographics.femaleAdults * worldContext.populationRate * worldContext.urbanization)
        : 0,
      elders: b.demographics?.elders
        ? rn(b.demographics.elders * worldContext.populationRate * worldContext.urbanization)
        : 0,
      temperature: tempStr,
      temperatureLikeIn: tempLikeIn,
      elevation: elevationStr,
      previewUrl: null,
      production: economySummary?.production ?? "—",
      wealth: economySummary?.wealth ?? "—",
      treasury: economySummary?.treasury ?? "—",
      capital: !!b.capital,
      port: !!b.port,
      citadel: !!b.citadel,
      walls: !!b.walls,
      plaza: !!b.plaza,
      temple: !!b.temple,
      shanty: !!b.shanty,
      lock: !!b.lock
    });

    burgEditorInternal.updateBurgPreview(b);
  },

  updateBurgPreview(burg: Burg): void {
    const previewUrl = GenerationPipeline.Burgs.getPreview(burg).preview || null;
    getBurgEditorState().updateBurgData({ previewUrl });
  },

  relocateBurgOnClick(this: SVGElement, event: MouseEvent): void {
    const cells = worldContext.pack.cells;
    const pt = pointer(event, this) as [number, number];
    const cellId = findCell(pt[0], pt[1]);
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];

    if (cells.h[cellId] < 20) {
      tip("Cannot place burg into the water! Select a land cell", false, "error");
      return;
    }
    if (cells.burg[cellId] && cells.burg[cellId] !== burgId) {
      tip("There is already a burg in this cell. Please select a free cell", false, "error");
      return;
    }

    const newState = cells.state[cellId];
    const oldState = burg.state;
    if (newState !== oldState && burg.capital) {
      tip("Capital cannot be relocated into another state!", false, "error");
      return;
    }

    // change UI
    const x = rn(pt[0], 2);
    const y = rn(pt[1], 2);

    view.burgIcons.select(`#burg${burgId}`).attr("x", x).attr("y", y);
    view.burgLabels.select(`#burgLabel${burgId}`).attr("transform", null).attr("x", x).attr("y", y);

    const anchor = view.anchors.select(`use[data-id='${burgId}']`);
    if (anchor.size()) {
      const size = anchor.attr("width");
      const xa = rn(x - +size * 0.47, 2);
      const ya = rn(y - +size * 0.47, 2);
      anchor.attr("transform", null).attr("x", xa).attr("y", ya);
    }

    // change data
    cells.burg[burg.cell] = 0;
    cells.burg[cellId] = burgId;
    burg.cell = cellId;
    burg.state = newState;
    burg.x = x;
    burg.y = y;
    if (burg.capital) worldContext.pack.states[newState].center = burg.cell;

    if (event.shiftKey === false) burgEditorActions.toggleRelocateBurg();
  },

  closeBurgEditor(): void {
    getBurgEditorState().setIsRelocateMode(false);
    view.burgLabels
      .selectAll("text")
      .call(
        drag().on("drag", null) as (
          selection: import("d3").Selection<import("d3").BaseType, unknown, SVGGElement, unknown>
        ) => void
      )
      .classed("draggable", false);
    EditorBus.unselect();
    modules.editBurg = false;
  }
};

export const burgEditorActions = {
  changeName(value: string): void {
    const burgId = burgEditorInternal.getBurgId();
    worldContext.pack.burgs[burgId].name = value;
    if (elSelected?.node()) elSelected.text(value);
    getBurgEditorState().updateBurgData({ name: value });
  },

  generateNameRandom(): void {
    const newName = generateRandomName();
    burgEditorActions.changeName(newName);
  },

  changeGroup(newGroup: string): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];
    GenerationPipeline.Burgs.changeGroup(burg, newGroup);
    drawBurgIcon(worldContext, viewContext, appServices, burg);
    drawBurgLabel(worldContext, viewContext, appServices, burg);
    // changeGroup reapplies group-based demographics (e.g. fort: no children, 8:2 sex ratio)
    burgEditorInternal.updateBurgValues();
  },

  editBurgGroups(): void {
    editBurgGroups();
  },

  changeType(newType: string): void {
    const burgId = burgEditorInternal.getBurgId();
    worldContext.pack.burgs[burgId].type = newType as CultureType;
    getBurgEditorState().updateBurgData({ type: newType });
  },

  changeCulture(newCulture: number): void {
    const burgId = burgEditorInternal.getBurgId();
    worldContext.pack.burgs[burgId].culture = newCulture;
    getBurgEditorState().updateBurgData({ culture: newCulture });
  },

  generateNameCulture(): void {
    const burgId = burgEditorInternal.getBurgId();
    const culture = worldContext.pack.burgs[burgId].culture;
    const newName = GenerationPipeline.Names.getCulture(culture ?? 0);
    burgEditorActions.changeName(newName);
  },

  changePopulation(newPopulation: string): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];

    const parsedPop = rn(+newPopulation / worldContext.populationRate / worldContext.urbanization, 4);
    burg.population = parsedPop;
    // Rebuild age/sex buckets with the same group profile at the new total.
    GenerationPipeline.Burgs.applyDemographics(burg);

    getBurgEditorState().updateBurgData({
      population: rn((burg.population ?? 0) * worldContext.populationRate * worldContext.urbanization),
      children: burg.demographics?.children
        ? rn(burg.demographics.children * worldContext.populationRate * worldContext.urbanization)
        : 0,
      maleAdults: burg.demographics?.maleAdults
        ? rn(burg.demographics.maleAdults * worldContext.populationRate * worldContext.urbanization)
        : 0,
      femaleAdults: burg.demographics?.femaleAdults
        ? rn(burg.demographics.femaleAdults * worldContext.populationRate * worldContext.urbanization)
        : 0,
      elders: burg.demographics?.elders
        ? rn(burg.demographics.elders * worldContext.populationRate * worldContext.urbanization)
        : 0
    });
    burgEditorInternal.updateBurgPreview(burg);
  },

  toggleFeature(feature: string): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];

    if (feature === "port") {
      if (burg.port) {
        burg.port = 0;
        const anchor = getElementBySelector<SVGUseElement>(`#anchors [data-id='${burgId}']`);
        if (anchor) anchor.remove();
      } else {
        const haven = worldContext.pack.cells.haven[burg.cell];
        if (!haven) tip("Port haven is not found, system won't be able to make a searoute", false, "warn");
        const portFeature = haven ? worldContext.pack.cells.f[haven] : -1;
        burg.port = portFeature;

        view.anchors
          .select(`#${burg.group}`)
          .append("use")
          .attr("href", "#icon-anchor")
          .attr("id", `anchor${burg.i}`)
          .attr("data-id", burg.i ?? 0)
          .attr("x", burg.x)
          .attr("y", burg.y);
      }
    } else if (feature === "capital") {
      if (burg.capital) {
        tip("To change capital please assign a capital status to another burg of this state", false, "error");
        return;
      }
      const stateId = burg.state;
      if (!stateId) {
        tip("Neutral lands cannot have a capital", false, "error");
        return;
      }

      const oldCapitalId = worldContext.pack.states[stateId].capital;
      worldContext.pack.states[stateId].capital = burgId;
      worldContext.pack.states[stateId].center = burg.cell;

      burg.capital = 1;
      GenerationPipeline.Burgs.changeGroup(burg);
      drawBurgIcon(worldContext, viewContext, appServices, burg);
      drawBurgLabel(worldContext, viewContext, appServices, burg);

      const oldCapital = worldContext.pack.burgs[oldCapitalId];
      oldCapital.capital = 0;
      GenerationPipeline.Burgs.changeGroup(oldCapital);
      drawBurgIcon(worldContext, viewContext, appServices, oldCapital);
      drawBurgLabel(worldContext, viewContext, appServices, oldCapital);
    } else {
      const bObj = burg as unknown as Record<string, number | undefined>;
      bObj[feature] = bObj[feature] ? 0 : 1;
    }

    getBurgEditorState().updateBurgData({
      capital: !!burg.capital,
      port: !!burg.port,
      citadel: !!burg.citadel,
      walls: !!burg.walls,
      plaza: !!burg.plaza,
      temple: !!burg.temple,
      shanty: !!burg.shanty
    });
    burgEditorInternal.updateBurgPreview(burg);
  },

  openBurgLink(): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];
    const link = GenerationPipeline.Burgs.getPreview(burg).link;
    if (link) openURL(link);
  },

  copyCityGeneratorInput(): void {
    const burgId = burgEditorInternal.getBurgId();
    const descriptor = getBurgSiteDescriptor(burgId);
    if (!descriptor) {
      tip("Cannot build the site descriptor for this burg", false, "error");
      return;
    }
    navigator.clipboard
      .writeText(JSON.stringify(descriptor, null, 2))
      .then(() => tip("City Generator site input is copied to clipboard as JSON", false, "success", 4000))
      .catch(() => tip("Failed to copy the site input to clipboard", false, "error"));
  },

  setCustomPreview(): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];

    openPrompt({
      message:
        "Provide custom URL to the burg map. It can be a link to a generator or just an image. Leave empty to use the default map preview",
      default: GenerationPipeline.Burgs.getPreview(burg).link ?? "",
      onConfirm: link => {
        const url = String(link);
        if (url) burg.link = url;
        else delete burg.link;
        burgEditorInternal.updateBurgPreview(burg);
      }
    });
  },

  openEmblemEdit(): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];
    editEmblem!("burg", `burgCOA${burgId}`, burg);
  },

  zoomIntoBurg(): void {
    const burgId = burgEditorInternal.getBurgId();
    zoomIntoBurgAction(burgId);
  },

  toggleRelocateBurg(): void {
    const isRelocating = !getBurgEditorState().isRelocateMode;
    getBurgEditorState().setIsRelocateMode(isRelocating);

    if (isRelocating) {
      view.viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(burgEditorInternal.relocateBurgOnClick);
      tip("Click on map to relocate burg. Hold Shift for continuous move", true);
      if (!layerIsOn("toggleCells")) {
        toggleCells();
        cellsWasForced = true;
      }
    } else {
      clearMainTip();
      interactionManager.resetClickHandler();
      view.viewbox.style("cursor", "default");
      if (cellsWasForced && layerIsOn("toggleCells")) toggleCells();
      cellsWasForced = false;
    }
  },

  editBurgLegend(): void {
    const burg = worldContext.pack.burgs[_currentBurgId];
    editNotes(`burg${_currentBurgId}`, burg?.name ?? "");
  },

  toggleBurgLockButton(): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];
    burg.lock = !burg.lock;
    getBurgEditorState().updateBurgData({ lock: !!burg.lock });
  },

  removeSelectedBurg(): void {
    const burgId = burgEditorInternal.getBurgId();
    const burg = worldContext.pack.burgs[burgId];

    if (burg.capital) {
      openAlert("You cannot remove the capital. You must change the state capital first", { title: "Remove burg" });
    } else {
      confirmationDialog({
        title: "Remove burg",
        message: "Are you sure you want to remove the burg? <br>This action cannot be reverted",
        confirm: "Remove",
        onConfirm: () => {
          const hasCOA = !!worldContext.pack.burgs[burgId]?.coa;
          GenerationPipeline.Burgs.remove(burgId);
          if (hasCOA) removeBurgCOA(viewContext, burgId);
          closeDialog("burgEditor");
        }
      });
    }
  },

  showStyleSection(): void {
    getBurgEditorState().setIsStyleSectionOpen(true);
  },

  hideStyleSection(): void {
    getBurgEditorState().setIsStyleSectionOpen(false);
  },

  editGroupLabelStyle(): void {
    const node = elSelected?.node();
    const g = node ? (node.parentNode as SVGGElement).id : (worldContext.pack.burgs[_currentBurgId]?.group ?? "");
    closeDialogs(".stable");
    editStyle("labels", g);
  },

  editGroupIconStyle(): void {
    const node = elSelected?.node();
    const g = node ? (node.parentNode as SVGGElement).id : (worldContext.pack.burgs[_currentBurgId]?.group ?? "");
    closeDialogs(".stable");
    editStyle("burgIcons", g);
  },

  editGroupAnchorStyle(): void {
    const node = elSelected?.node();
    const g = node ? (node.parentNode as SVGGElement).id : (worldContext.pack.burgs[_currentBurgId]?.group ?? "");
    closeDialogs(".stable");
    editStyle("anchors", g);
  },

  showTemperatureGraph(): void {
    const burgId = burgEditorInternal.getBurgId();
    showBurgTemperatureGraph(burgId);
  }
};

// in °C, array from -5 °C; source: https://en.wikipedia.org/wiki/List_of_city_by_average_temperature
const meanTempCityMap: Record<string, string> = {
  "-5": "Snag (Yukon)",
  "-4": "Yellowknife (Canada)",
  "-3": "Okhotsk (Russia)",
  "-2": "Fairbanks (Alaska)",
  "-1": "Nuuk (Greenland)",
  "0": "Murmansk (Russia)",
  "1": "Arkhangelsk (Russia)",
  "2": "Anchorage (Alaska)",
  "3": "Tromsø (Norway)",
  "4": "Reykjavik (Iceland)",
  "5": "Harbin (China)",
  "6": "Stockholm (Sweden)",
  "7": "Montreal (Canada)",
  "8": "Prague (Czechia)",
  "9": "Copenhagen (Denmark)",
  "10": "London (England)",
  "11": "Antwerp (Belgium)",
  "12": "Paris (France)",
  "13": "Milan (Italy)",
  "14": "Washington (D.C.)",
  "15": "Rome (Italy)",
  "16": "Dubrovnik (Croatia)",
  "17": "Lisbon (Portugal)",
  "18": "Barcelona (Spain)",
  "19": "Marrakesh (Morocco)",
  "20": "Alexandria (Egypt)",
  "21": "Tegucigalpa (Honduras)",
  "22": "Guangzhou (China)",
  "23": "Rio de Janeiro (Brazil)",
  "24": "Dakar (Senegal)",
  "25": "Miami (USA)",
  "26": "Jakarta (Indonesia)",
  "27": "Mogadishu (Somalia)",
  "28": "Bangkok (Thailand)",
  "29": "Niamey (Niger)",
  "30": "Khartoum (Sudan)"
};

export function getTemperatureLikeness(temperature: number): string | null {
  if (temperature < -5) return "Yakutsk (Russia)";
  if (temperature > 30) return "Mecca (Saudi Arabia)";
  return meanTempCityMap[String(temperature)] || null;
}
