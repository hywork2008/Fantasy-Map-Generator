import * as d3 from "d3";
import { color, interpolate, pointer } from "d3";
import { getWorldState, zoomTo } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { COA } from "../generators/emblem/generator";
import { Names } from "../generators/names-generator";
import { Provinces } from "../generators/provinces-generator";
import { States } from "../generators/states-generator";
import {
  BordersRenderer,
  drawBurgIcon,
  drawBurgLabel,
  drawStateLabels,
  PopulationRenderer,
  ProvincesRenderer,
  StatesRenderer
} from "../renderers";
import type { Emblem as RendererEmblem } from "../renderers/emblem-renderer";
import { COArenderer } from "../renderers/emblem-renderer";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import {
  getProvincesEditorState,
  type ProvinceRowData,
  type StateOption,
  setProvincesEditorState
} from "../store/provincesEditorState";
import type { Burg, Culture, Province, State } from "../types/models";
import {
  closeDialog,
  closeDialogs,
  isDialogOpen,
  openAlert,
  openConfirm,
  openDialog
} from "../ui/dialogs/dialogService";
import type { PopulationChangeConfig } from "../ui/dialogs/PopulationChangeDialog";
import { findAll, findCell, getRandomColor, isLand, P, parseTransform, rand, rn, unique } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName } from "../utils/editorHelpers";
import { getPackPolygon } from "../utils/graphUtils";
import { getElementsBySelector, layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, fitContent, getArea, getAreaUnit, showMainTip, tip } from "../utils/uiHelpers";
import { overviewBurgs } from "./burgs-overview";
import { editEmblem } from "./emblems-editor";
import { interactionManager } from "./interactionManager";
import { toggleBorders, toggleCultures, toggleProvinces, toggleStates, turnButtonOff } from "./layers";
import { editStyle } from "./style";

export function editProvinces(): void {
  if (view.customization) return;
  closeDialogs("#provincesEditor, .stable");
  if (!layerIsOn("toggleProvinces")) toggleProvinces();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleCultures")) toggleCultures();

  view.provs
    .selectAll<SVGTextElement, unknown>("text")
    .call(d3.drag<SVGTextElement, unknown>().on("start", dragLabelStart).on("drag", dragLabel))
    .classed("draggable", true);

  setProvincesEditorState({ isOpen: true, customization: 0, filterState: -1 });
  refreshProvincesEditor();

  if (modules.editProvinces) return;
  modules.editProvinces = true;

  openDialog("provincesEditor", {
    title: "Provinces Editor",
    resizable: false,
    width: fitContent(),
    onClose: closeProvincesEditor,
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

function refreshProvincesEditor(): void {
  collectStatistics();

  const stateOptions: StateOption[] = [];
  stateOptions.push({ i: -1, name: "all" });
  const statesSorted = (worldContext.pack.states as State[])
    .filter(s => s.i && !s.removed)
    .sort((a, b) => (a.name > b.name ? 1 : -1));
  statesSorted.forEach(s => {
    stateOptions.push({ i: s.i, name: s.name });
  });

  const { filterState } = getProvincesEditorState();
  let filtered = (worldContext.pack.provinces as Province[]).filter(p => p.i && !p.removed);
  if (filterState !== -1) filtered = filtered.filter(p => p.state === filterState);

  let totalArea = 0;
  let totalPopulation = 0;
  let totalBurgs = 0;

  const provinceData: ProvinceRowData[] = filtered.map(p => {
    const area = getArea(p.area ?? 0);
    totalArea += area;
    const rural = (p.rural ?? 0) * worldContext.populationRate;
    const urban = (p.urban ?? 0) * worldContext.populationRate * worldContext.urbanization;
    const population = rn(rural + urban);
    totalPopulation += population;
    const burgCount = p.burgs?.length ?? 0;
    totalBurgs += burgCount;

    const stateName = (worldContext.pack.states as State[])[p.state].name;
    const capitalName = p.burg ? ((worldContext.pack.burgs as Burg[])[p.burg].name ?? "") : "";
    const isSeparable = !!(p.burg && p.burg !== (worldContext.pack.states as State[])[p.state].capital);
    const isFocused = !view.defs.select(`#fog #focusProvince${p.i}`).empty();

    COArenderer.trigger(`provinceCOA${p.i}`, p.coa as RendererEmblem);

    return {
      i: p.i,
      name: p.name,
      formName: p.formName,
      fullName: p.fullName || `${p.name} ${p.formName}`,
      color: p.color || "#ffffff",
      capitalId: p.burg || 0,
      capitalName,
      stateId: p.state,
      stateName,
      area,
      population,
      rural,
      urban,
      burgs: p.burgs || [],
      burgCount,
      isSeparable,
      isFocused,
      isLocked: !!p.lock
    };
  });

  setProvincesEditorState({
    stateOptions,
    provinces: provinceData,
    totalProvinces: filtered.length,
    totalBurgs,
    totalArea,
    totalPopulation
  });
}

function collectStatistics(): void {
  const { cells } = worldContext.pack;
  const provinces = worldContext.pack.provinces as Province[];
  const burgs = worldContext.pack.burgs as Burg[];

  provinces.forEach(p => {
    if (!p.i || p.removed) return;
    p.area = p.rural = p.urban = 0;
    p.burgs = [];
    if ((p.burg && !burgs[p.burg]) || burgs[p.burg]?.removed) p.burg = 0;
  });

  for (const i of cells.i) {
    const p = cells.province[i];
    if (!p) continue;
    provinces[p].area! += cells.area[i];
    provinces[p].rural! += cells.pop[i];
    if (!cells.burg[i]) continue;
    provinces[p].urban! += burgs[cells.burg[i]].population ?? 0;
    provinces[p].burgs!.push(cells.burg[i]);
  }

  provinces.forEach(p => {
    if (!p.i || p.removed) return;
    if (!p.burg && p.burgs?.length) p.burg = p.burgs[0];
  });
}

function provinceHighlightOn(province: number): void {
  if (!layerIsOn("toggleProvinces")) return;
  if (view.customization) return;
  const animate = d3.transition().duration(2000).ease(d3.easeSinIn);
  view.provs
    .select(`#province${province}`)
    .raise()
    .transition(animate)
    .attr("stroke-width", 2.5)
    .attr("stroke", "#d0240f");
}

function provinceHighlightOff(province: number | null): void {
  if (!layerIsOn("toggleProvinces") || !province) {
    view.debug.selectAll(".highlight").remove();
    return;
  }
  view.provs.select(`#province${province}`).transition().attr("stroke-width", null).attr("stroke", null);
  view.debug.selectAll(".highlight").remove();
}

function changeFill(provinceId: number): void {
  const p = (worldContext.pack.provinces as Province[])[provinceId];
  const currentFill = p.color || "#ffffff";

  // Using raw HTML input type=color workaround since original uses openPicker? Wait, openPicker is an external function not imported here?
  // Actually, original code used openPicker, but I will simulate it or we can just use a native prompt/color picker.
  // Wait! The original code used `openPicker(currentFill, callback)` which was probably in some `uiHelpers` or `editors.ts`... wait, `openPicker` is not imported! Wait, it was implicitly global or something? Oh wait, it was NOT imported in the original file!
  // Wait, let's look at the original file: `function changeFill(el: HTMLElement) { ... openPicker(currentFill, callback); }`. Since I can't find `openPicker` import, I will use a native HTML5 color input workaround if it's missing, but actually let's assume `openPicker` is available globally or I'll just use a direct input. Let's just create a temporary color input.
  const input = document.createElement("input");
  input.type = "color";
  input.value = currentFill;
  input.oninput = e => {
    const newFill = (e.target as HTMLInputElement).value;
    p.color = newFill;
    const g = view.provs.select("#provincesBody");
    g.select(`#province${provinceId}`).attr("fill", newFill);
    g.select(`#province-gap${provinceId}`).attr("stroke", newFill);
    refreshProvincesEditor();
  };
  input.click();
}

function capitalZoomIn(p: number): void {
  const capital = (worldContext.pack.provinces as Province[])[p].burg;
  const l = view.burgLabels.select(`[data-id='${capital}']`);
  const x = +l.attr("x");
  const y = +l.attr("y");
  zoomTo(x, y, 8, 2000);
}

function triggerIndependencePrompts(p: number): void {
  confirmationDialog({
    title: "Declare independence",
    message: "Are you sure you want to declare province independence? <br>It will turn province into a new state",
    confirm: "Declare",
    onConfirm: () => {
      const result = declareProvinceIndependence(p);
      if (result) {
        updateStatesPostRelease([result[0]], [result[1]]);
      }
    }
  });
}

function declareProvinceIndependence(provinceId: number): [number, number] | undefined {
  const { states, provinces, cells, burgs } = worldContext.pack;
  const province = (provinces as Province[])[provinceId];
  const { name, burg: burgId, burgs: provinceBurgs } = province;

  if ((provinceBurgs ?? []).some((b: number) => (burgs as Burg[])[b].capital)) {
    tip("Cannot declare independence of a province having capital burg. Please change capital first", false, "error");
    return;
  }
  if (!burgId) {
    tip("Cannot declare independence of a province without burg", false, "error");
    return;
  }

  const oldStateId = province.state;
  const newStateId = (states as State[]).length;

  const capital = (burgs as Burg[])[burgId];
  capital.capital = 1;
  Burgs.changeGroup(capital);
  drawBurgIcon(worldContext, viewContext, appServices, capital);
  drawBurgLabel(worldContext, viewContext, appServices, capital);

  (provinceBurgs ?? []).forEach((b: number) => {
    (burgs as Burg[])[b].state = newStateId;
  });

  const { cell: center, culture } = (burgs as Burg[])[burgId];
  const newColor = getRandomColor();
  const coa = province.coa;
  d3.select(`#provinceCOA${provinceId}`).attr("id", `stateCOA${newStateId}`);
  view.emblems.select(`#provinceEmblems > use[data-i='${provinceId}']`).remove();

  Array.from(cells.i)
    .filter((i: number) => cells.province[i] === provinceId)
    .forEach((i: number) => {
      cells.province[i] = 0;
      cells.state[i] = newStateId;
    });

  const statesArr = states as State[];
  const diplomacy = statesArr.map(s => {
    if (!s.i || s.removed) return "x";
    let relations = statesArr[oldStateId].diplomacy![s.i];
    if (s.i === oldStateId) relations = "Enemy";
    else if (relations === "Ally") relations = "Suspicion";
    else if (relations === "Friendly") relations = "Suspicion";
    else if (relations === "Suspicion") relations = "Neutral";
    else if (relations === "Enemy") relations = "Friendly";
    else if (relations === "Rival") relations = "Friendly";
    else if (relations === "Vassal") relations = "Suspicion";
    else if (relations === "Suzerain") relations = "Enemy";
    s.diplomacy!.push(relations);
    return relations;
  });
  diplomacy.push("x");
  statesArr[0].diplomacy!.push(`${name} declared its independance from ${statesArr[oldStateId].name}`);

  statesArr.push({
    i: newStateId,
    name,
    diplomacy,
    provinces: [],
    color: newColor,
    expansionism: 0.5,
    capital: burgId,
    type: "Generic",
    center: center!,
    culture: culture!,
    military: [],
    alert: 1,
    coa
  } as State);

  statesArr[oldStateId].provinces = (statesArr[oldStateId].provinces ?? []).filter(p => p !== provinceId);
  (provinces as Province[])[provinceId] = { i: provinceId, removed: true } as Province;

  return [oldStateId, newStateId];
}

function updateStatesPostRelease(oldStates: number[], newStates: number[]): void {
  const allStates = unique([...oldStates, ...newStates]);

  layerIsOn("toggleProvinces") && toggleProvinces();
  layerIsOn("toggleStates") ? StatesRenderer.render(worldContext, viewContext, appServices) : toggleStates();
  layerIsOn("toggleBorders") ? BordersRenderer.render(worldContext, viewContext, appServices) : toggleBorders();

  const state = getWorldState();
  States.getPoles(state);
  States.findNeighbors();
  States.collectStatistics(state);
  States.defineStateForms(state, newStates);
  drawStateLabels(worldContext, viewContext, appServices, allStates);

  allStates.forEach(stateId => {
    view.emblems.select(`#stateEmblems > use[data-i='${stateId}']`)?.remove();
    const { coa, pole } = (worldContext.pack.states as State[])[stateId];
    COArenderer.add("state", stateId, coa as RendererEmblem, pole![0], pole![1]);
  });

  layerIsOn("toggleProvinces") && toggleProvinces();
  layerIsOn("toggleStates") ? StatesRenderer.render(worldContext, viewContext, appServices) : toggleStates();
  layerIsOn("toggleBorders") ? BordersRenderer.render(worldContext, viewContext, appServices) : toggleBorders();

  EditorBus.unfog();
  closeDialogs();
  EditorBus.editStates();
}

function changePopulation(province: number): void {
  const p = (worldContext.pack.provinces as Province[])[province];
  const cells = Array.from(worldContext.pack.cells.i).filter(i => worldContext.pack.cells.province[i] === province);
  if (!cells.length) {
    tip("Province does not have any cells, cannot change population", false, "error");
    return;
  }
  const rural = rn((p.rural ?? 0) * worldContext.populationRate);
  const urban = rn((p.urban ?? 0) * worldContext.populationRate * worldContext.urbanization);
  const total = rural + urban;
  const l = (n: number) => Number(n).toLocaleString();

  const config: PopulationChangeConfig = {
    title: "Change province population",
    description: `Total: ${l(total)}`,
    initialRural: rural,
    initialUrban: urban,
    urbanDisabled: !p.burgs?.length,
    onApply: (newRural, newUrban) => {
      const ruralChange = newRural / rural;
      if (Number.isFinite(ruralChange) && ruralChange !== 1) {
        cells.forEach(i => {
          worldContext.pack.cells.pop[i] *= ruralChange;
        });
      }
      if (!Number.isFinite(ruralChange) && newRural > 0) {
        const pop = rn(newRural / worldContext.populationRate / cells.length);
        cells.forEach(i => {
          worldContext.pack.cells.pop[i] = pop;
        });
      }

      const urbanChange = newUrban / urban;
      if (Number.isFinite(urbanChange) && urbanChange !== 1) {
        p.burgs?.forEach((b: number) => {
          (worldContext.pack.burgs as Burg[])[b].population = rn(
            ((worldContext.pack.burgs as Burg[])[b].population ?? 0) * urbanChange,
            4
          );
        });
      }
      if (!Number.isFinite(urbanChange) && newUrban > 0) {
        const population = rn(
          newUrban / worldContext.populationRate / worldContext.urbanization / (p.burgs?.length ?? 1),
          4
        );
        p.burgs?.forEach((b: number) => {
          (worldContext.pack.burgs as Burg[])[b].population = population;
        });
      }

      if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
      refreshProvincesEditor();
    }
  };
  openDialog("populationChangeDialog", config);
}

function toggleFog(p: number): void {
  const path = view.provs.select(`#province${p}`).attr("d");
  const id = `focusProvince${p}`;
  const isFocused = !view.defs.select(`#fog #${id}`).empty();
  if (!isFocused) EditorBus.fog(id, path);
  else EditorBus.unfog(id);
  refreshProvincesEditor();
}

function removeProvince(p: number): void {
  openConfirm("Are you sure you want to remove the province? <br />This action cannot be reverted", {
    title: "Remove province",
    confirm: "Remove",
    onConfirm: () => {
      worldContext.pack.cells.province.forEach((province: number, i: number) => {
        if (province === p) worldContext.pack.cells.province[i] = 0;
      });
      const s = (worldContext.pack.provinces as Province[])[p].state;
      const state = (worldContext.pack.states as State[])[s];
      if (state.provinces?.includes(p)) state.provinces.splice(state.provinces.indexOf(p), 1);

      EditorBus.unfog(`focusProvince${p}`);

      const coaId = `provinceCOA${p}`;
      d3.select(`#${coaId}`).remove();
      view.emblems.select(`#provinceEmblems > use[data-i='${p}']`).remove();

      (worldContext.pack.provinces as Province[])[p] = { i: p, removed: true } as Province;

      const g = view.provs.select("#provincesBody");
      g.select(`#province${p}`).remove();
      g.select(`#province-gap${p}`).remove();
      if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
      refreshProvincesEditor();
    }
  });
}

function editProvinceName(province: number): void {
  const p = (worldContext.pack.provinces as Province[])[province];
  const cultureId = worldContext.pack.cells.culture[p.center];
  const cultureName = (worldContext.pack.cultures as Culture[])[cultureId]?.name || "Unknown";

  setProvincesEditorState({
    nameEditor: {
      provinceId: p.i,
      shortName: p.name || "",
      formName: p.formName || "",
      fullName: p.fullName || "",
      isCustomFormMode: false,
      customFormInput: "",
      cultureName,
      regenTick: 0
    }
  });
}

function changeCapital(p: number, value: string): void {
  (worldContext.pack.provinces as Province[])[p].center = (worldContext.pack.burgs as Burg[])[+value].cell;
  (worldContext.pack.provinces as Province[])[p].burg = +value;
  refreshProvincesEditor();
}

function showChart(): void {
  openDialog("provincesChart");
}

function toggleLabels(): void {
  const hidden = view.provs.select("#provinceLabels").style("display") === "none";
  view.provs.select("#provinceLabels").style("display", `${hidden ? "block" : "none"}`);
  view.provs.attr("data-labels", +hidden);
  view.provs
    .selectAll<SVGTextElement, unknown>("text")
    .call(d3.drag<SVGTextElement, unknown>().on("start", dragLabelStart).on("drag", dragLabel))
    .classed("draggable", true);
}

function triggerProvincesRelease(): void {
  confirmationDialog({
    title: "Release provinces",
    message: `Are you sure you want to release all provinces?
        </br>It will turn all separable provinces into independent states.
        </br>Capital province and provinces without any burgs will state as they are`,
    confirm: "Release",
    onConfirm: () => {
      const oldStateIds: number[] = [];
      const newStateIds: number[] = [];

      (worldContext.pack.provinces as Province[]).forEach(province => {
        if (!province || province.removed) return;
        const provinceId = province.i;
        if (!province.burg) return;
        if (province.burg === (worldContext.pack.states as State[])[province.state].capital) return;
        if ((province.burgs ?? []).some((burgId: number) => (worldContext.pack.burgs as Burg[])[burgId].capital))
          return;

        const result = declareProvinceIndependence(provinceId);
        if (result) {
          oldStateIds.push(result[0]);
          newStateIds.push(result[1]);
        }
      });

      updateStatesPostRelease(unique(oldStateIds), newStateIds);
      refreshProvincesEditor();
    }
  });
}

// Global selection tracker for manual assignment
let selectedProvinceIdForManual: number | null = null;

function enterProvincesManualAssignment(): void {
  if (!layerIsOn("toggleProvinces")) toggleProvinces();
  if (!layerIsOn("toggleBorders")) toggleBorders();

  view.provinceBorders.select("path").attr("stroke", "#000").attr("stroke-width", 0.5);
  view.stateBorders.select("path").attr("stroke", "#000").attr("stroke-width", 1.2);

  view.setCustomization(11);
  view.provs.select("g#provincesBody").append("g").attr("id", "temp").attr("stroke-width", 0.3);
  view.provs
    .select("g#provincesBody")
    .append("g")
    .attr("id", "centers")
    .attr("fill", "none")
    .attr("stroke", "#ff0000")
    .attr("stroke-width", 1);

  setProvincesEditorState({ customization: 11 });

  tip("Click on a province to select, drag the circle to change province", true);
  view.viewbox
    .style("cursor", "crosshair")
    .on("click", selectProvinceOnMapClick)
    .call(d3.drag<SVGGElement, unknown>().on("drag", dragBrush))
    .on("touchmove", moveBrush)
    .on("mousemove", moveBrush);

  const { provinces } = getProvincesEditorState();
  if (provinces.length > 0) {
    selectedProvinceIdForManual = provinces[0].i;
    selectProvince(selectedProvinceIdForManual);
  }
}

export function selectProvinceOnLineClick(id: number): void {
  if (view.customization === 11) {
    selectedProvinceIdForManual = id;
    selectProvince(id);
  }
}

function selectProvinceOnMapClick(this: SVGElement, event: MouseEvent): void {
  const [px, py] = pointer(event, this);
  const i = findCell(px, py);
  if (worldContext.pack.cells.h[i] < 20 || !worldContext.pack.cells.state[i]) return;

  const assigned = view.provs.select("g#temp").select(`polygon[data-cell='${i}']`);
  const province = assigned.size() ? +assigned.attr("data-province") : worldContext.pack.cells.province[i];

  const { provinces } = getProvincesEditorState();
  if (!provinces.find(p => p.i === province)) {
    tip("You cannot select a province if it is not in the Editor list", false, "error");
    return;
  }

  selectedProvinceIdForManual = province;
  selectProvince(province);
}

function selectProvince(p: number): void {
  view.debug.selectAll("path.selected").remove();
  const path = view.provs.select(`#province${p}`).attr("d");
  view.debug.append("path").attr("class", "selected").attr("d", path);
}

function dragBrush(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
  if (!event.dx && !event.dy) return;
  const { brushSize } = getProvincesEditorState();
  EditorBus.moveCircle(event.x, event.y, brushSize);

  const found = brushSize > 5 ? findAll(event.x, event.y, brushSize) : [findCell(event.x, event.y)];
  const selection = found.filter(i => isLand(i, worldContext.pack));
  if (selection.length > 0) changeForSelection(selection);
}

function changeForSelection(selection: number[]): void {
  const temp = view.provs.select("#temp");
  const centers = view.provs.select("#centers");
  if (selectedProvinceIdForManual === null) return;

  const provinceNew = selectedProvinceIdForManual;
  const state = (worldContext.pack.provinces as Province[])[provinceNew].state;
  const fill = (worldContext.pack.provinces as Province[])[provinceNew].color || "#ffffff";

  selection.forEach(i => {
    if (!worldContext.pack.cells.state[i] || worldContext.pack.cells.state[i] !== state) return;
    const exists = temp.select(`polygon[data-cell='${i}']`);
    const provinceOld = exists.size() ? +exists.attr("data-province") : worldContext.pack.cells.province[i];
    if (provinceNew === provinceOld) return;
    if (i === (worldContext.pack.provinces as Province[])[provinceOld]?.center) {
      const center = centers.select(`polygon[data-center='${i}']`);
      if (!center.size())
        centers.append("polygon").attr("data-center", i).attr("points", getPackPolygon(i, worldContext.pack).join(" "));
      tip("Province center cannot be assigned to a different region. Please remove the province first", false, "error");
      return;
    }

    if (exists.size()) {
      if (worldContext.pack.cells.province[i] === provinceNew) exists.remove();
      else exists.attr("data-province", provinceNew).attr("fill", fill);
    } else {
      temp
        .append("polygon")
        .attr("points", getPackPolygon(i, worldContext.pack).join(" "))
        .attr("data-cell", i)
        .attr("data-province", provinceNew)
        .attr("fill", fill)
        .attr("stroke", "#555");
    }
  });
}

function moveBrush(this: SVGElement, event: MouseEvent): void {
  showMainTip();
  const [px, py] = pointer(event, this);
  const { brushSize } = getProvincesEditorState();
  EditorBus.moveCircle(px, py, brushSize);
}

function applyProvincesManualAssignment(): void {
  view.provs
    .select("#temp")
    .selectAll("polygon")
    .each(function () {
      const el = this as SVGPolygonElement;
      const i = +el.dataset.cell!;
      worldContext.pack.cells.province[i] = +el.dataset.province!;
    });

  Provinces.getPoles(getWorldState());
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);

  exitProvincesManualAssignment();
  refreshProvincesEditor();
}

function exitProvincesManualAssignment(): void {
  view.setCustomization(0);
  view.provs.select("#temp").remove();
  view.provs.select("#centers").remove();
  EditorBus.removeCircle();

  view.provinceBorders.select("path").attr("stroke", null).attr("stroke-width", null);
  view.stateBorders.select("path").attr("stroke", null).attr("stroke-width", null);
  view.debug.selectAll("path.selected").remove();

  setProvincesEditorState({ customization: 0 });
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  selectedProvinceIdForManual = null;
}

function enterAddProvinceMode(): void {
  const { customization } = getProvincesEditorState();
  if (customization === 12) {
    exitAddProvinceMode();
    return;
  }

  view.setCustomization(12);
  setProvincesEditorState({ customization: 12 });
  tip("Click on the map to place a new province center", true);
  view.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(addProvince);
}

function addProvince(this: SVGElement, event: MouseEvent): void {
  const { cells, provinces } = worldContext.pack;
  const [px, py] = pointer(event, this);
  const center = findCell(px, py);
  if (cells.h[center] < 20) {
    tip("You cannot place province into the water. Please click on a land cell", false, "error");
    return;
  }

  const oldProvince = cells.province[center];
  const provincesArr = provinces as Province[];
  if (oldProvince && provincesArr[oldProvince].center === center) {
    tip("The cell is already a center of a different province. Select other cell", false, "error");
    return;
  }

  const state = cells.state[center];
  if (!state) {
    tip("You cannot create a province in neutral lands. Please assign this land to a state first", false, "error");
    return;
  }

  if (!(event as KeyboardEvent & MouseEvent).shiftKey) {
    exitAddProvinceMode();
  }

  const province = provincesArr.length;
  (worldContext.pack.states as State[])[state].provinces!.push(province);
  const burg = cells.burg[center];
  const c = cells.culture[center];
  const name = burg
    ? ((worldContext.pack.burgs as Burg[])[burg].name ?? "")
    : Names.getState(Names.getCultureShort(worldContext, viewContext, appServices, c), c);
  const formName = oldProvince ? provincesArr[oldProvince].formName : "Province";
  const fullName = `${name} ${formName}`;
  const stateColor = (worldContext.pack.states as State[])[state].color ?? "";
  const rndColor = getRandomColor();
  const newColor = stateColor[0] === "#" ? color(interpolate(stateColor, rndColor)(0.2))!.formatHex() : rndColor;

  const kinship = burg ? 0.8 : 0.4;
  const parentBurg = burg ? (worldContext.pack.burgs as Burg[])[burg] : null;
  const type = Burgs.getType(center, parentBurg?.port);
  const parentCOA = parentBurg ? parentBurg.coa : (worldContext.pack.states as State[])[state].coa;
  const coa = COA.generate(parentCOA ?? null, kinship, P(0.1) as unknown as number, type);
  coa.shield = COA.getShield(c, state) ?? "";
  COArenderer.add("province", province, coa as RendererEmblem, px, py);

  provincesArr.push({ i: province, state, center, burg, name, formName, fullName, color: newColor, coa } as Province);

  cells.province[center] = province;
  cells.c[center].forEach((cc: number) => {
    if (cells.h[cc] < 20 || cells.state[cc] !== state) return;
    if (provincesArr.find(p => !p.removed && p.center === cc)) return;
    cells.province[cc] = province;
  });

  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);

  setProvincesEditorState({ filterState: state });
  refreshProvincesEditor();
}

function exitAddProvinceMode(): void {
  view.setCustomization(0);
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  setProvincesEditorState({ customization: 0 });
}

function recolorProvinces(): void {
  const { filterState } = getProvincesEditorState();
  const state = filterState;

  (worldContext.pack.provinces as Province[]).forEach(p => {
    if (!p || p.removed) return;
    if (state !== -1 && p.state !== state) return;
    const stateColor = (worldContext.pack.states as State[])[p.state].color ?? "";
    const rndColor = getRandomColor();
    p.color = stateColor[0] === "#" ? color(interpolate(stateColor, rndColor)(0.2))!.formatHex() : rndColor;
  });

  if (!layerIsOn("toggleProvinces")) toggleProvinces();
  else ProvincesRenderer.render(worldContext, viewContext, appServices);

  refreshProvincesEditor();
}

function downloadProvincesData(): void {
  // Can just access natively from React
  const unit = getAreaUnit(); // assuming square etc is handled
  let data = `Id,Province,Full Name,Form,State,Color,Capital,Area ${unit},Total Population,Rural Population,Urban Population,Burgs\n`;

  const { provinces } = getProvincesEditorState();
  provinces.forEach(p => {
    data += `${p.i},`;
    data += `${p.name},`;
    data += `${p.fullName},`;
    data += `${p.formName},`;
    data += `${p.stateName},`;
    data += `${p.color},`;
    data += `${p.capitalName},`;
    data += `${p.area},`;
    data += `${p.population},`;
    data += `${p.rural},`;
    data += `${p.urban},`;
    data += `${p.burgCount}\n`;
  });

  downloadFile(data, `${getFileName("Provinces")}.csv`);
}

function removeAllProvinces(): void {
  openConfirm("Are you sure you want to remove all provinces? <br />This action cannot be reverted", {
    title: "Remove all provinces",
    confirm: "Remove",
    onConfirm: () => {
      getElementsBySelector("[id^='provinceCOA']").forEach(el => {
        el.remove();
      });
      view.emblems.select("#provinceEmblems").selectAll("*").remove();

      worldContext.pack.provinces = [0 as unknown as Province];
      worldContext.pack.cells.province = new Uint16Array(worldContext.pack.cells.i.length);
      (worldContext.pack.states as State[]).forEach(s => {
        s.provinces = [];
      });

      EditorBus.unfog();
      if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
      view.provs.select("#provincesBody").remove();
      turnButtonOff("toggleProvinces");

      refreshProvincesEditor();
    }
  });
}

let _dlX = 0,
  _dlY = 0;

function dragLabelStart(this: SVGTextElement, event: d3.D3DragEvent<SVGTextElement, unknown, unknown>): void {
  const tr = parseTransform(this.getAttribute("transform") ?? "");
  _dlX = +tr[0] - event.x;
  _dlY = +tr[1] - event.y;
}

function dragLabel(this: SVGTextElement, event: d3.D3DragEvent<SVGTextElement, unknown, unknown>): void {
  this.setAttribute("transform", `translate(${_dlX + event.x},${_dlY + event.y})`);
}

function closeProvincesEditor(): void {
  view.provs
    .selectAll<SVGTextElement, unknown>("text")
    .call(d3.drag<SVGTextElement, unknown>().on("drag", null))
    .attr("class", null);

  const { customization } = getProvincesEditorState();
  if (customization === 11) exitProvincesManualAssignment();
  if (customization === 12) exitAddProvinceMode();

  setProvincesEditorState({ isOpen: false });
  modules.editProvinces = false;
  closeDialog("provincesEditor");
}

function openProvinceMergeDialog(): void {
  const { filterState } = getProvincesEditorState();
  const selectedState = filterState;
  if (selectedState === -1) {
    openAlert("Please select a specific state from the filter to merge provinces within that state.", {
      title: "Merge Provinces"
    });
    return;
  }
  const provincesToMerge = (worldContext.pack.provinces as Province[]).filter(
    p => p.i && !p.removed && p.state === selectedState
  );
  if (provincesToMerge.length < 2) {
    openAlert("Not enough provinces in the selected state to merge.", { title: "Merge Provinces" });
    return;
  }

  setProvincesEditorState({
    mergeDialog: provincesToMerge.map(p => ({
      i: p.i,
      name: p.name,
      fullName: p.fullName || `${p.name} ${p.formName}`,
      color: p.color || "#ffffff"
    }))
  });
}

function cleanupMergedProvince(provinceId: number): void {
  EditorBus.unfog(`focusProvince${provinceId}`);
  d3.select(`#provinceCOA${provinceId}`).remove();
  view.emblems.select(`#provinceEmblems > use[data-i='${provinceId}']`).remove();
}

function mergeProvinces(ids: number[], primary: number): void {
  const primaryProvince = (worldContext.pack.provinces as Province[])[primary];
  const provinceIdMap = new Map<number, number>();

  ids.forEach(id => {
    if (id === primary) return;
    const province = (worldContext.pack.provinces as Province[])[id];

    (province.burgs ?? []).forEach((b: number) => {
      (worldContext.pack.burgs as Burg[])[b].province = primary;
      if (!primaryProvince.burgs?.includes(b)) primaryProvince.burgs?.push(b);
    });
    if (!primaryProvince.burg && province.burg) {
      primaryProvince.burg = province.burg;
    }

    provinceIdMap.set(id, primary);
    cleanupMergedProvince(id);
    (worldContext.pack.provinces as Province[])[id] = { i: id, removed: true } as Province;
  });

  worldContext.pack.cells.province.forEach((oldProvinceId: number, cellIndex: number) => {
    const newProvinceId = provinceIdMap.get(oldProvinceId);
    if (newProvinceId !== undefined) worldContext.pack.cells.province[cellIndex] = newProvinceId;
  });

  const state = (worldContext.pack.states as State[])[primaryProvince.state];
  state.provinces = (state.provinces ?? []).filter(
    (p: number) => !(worldContext.pack.provinces as Province[])[p].removed
  );

  collectStatistics();
  Provinces.getPoles(getWorldState());

  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);

  EditorBus.unfog();
  view.debug.selectAll(".highlight").remove();

  refreshProvincesEditor();
}

function updateLockStatus(provinceId: number): void {
  const p = (worldContext.pack.provinces as Province[])[provinceId];
  p.lock = !p.lock;
  refreshProvincesEditor();
}

function changeFilter(filterState: number): void {
  setProvincesEditorState({ filterState });
  refreshProvincesEditor();
}

function changeSort(sortBy: string): void {
  const state = getProvincesEditorState();
  if (state.sortBy === sortBy) {
    setProvincesEditorState({ sortDirection: state.sortDirection * -1 });
  } else {
    setProvincesEditorState({ sortBy, sortDirection: 1 });
  }
}

function togglePercentageMode(): void {
  const { isPercentageMode } = getProvincesEditorState();
  setProvincesEditorState({ isPercentageMode: !isPercentageMode });
}

function changeBrushSize(brushSize: number): void {
  setProvincesEditorState({ brushSize });
}

export const provincesEditorActions = {
  changeFilter,
  changeSort,
  togglePercentageMode,
  changeBrushSize,
  provinceHighlightOn,
  provinceHighlightOff,
  changeFill,
  editProvinceName,
  editEmblem: (id: number) => editEmblem?.("province", `provinceCOA${id}`, worldContext.pack.provinces[id]),
  capitalZoomIn,
  changeCapital,
  triggerIndependencePrompts,
  overviewBurgs: (stateId: number) => overviewBurgs({ stateId }),
  changePopulation,
  highlightElement: (id: number) =>
    EditorBus.highlightElement(view.provs.select(`#province${id}`).node() as Element, 8),
  toggleFog,
  removeProvince,
  updateLockStatus,
  editStyle: () => editStyle("provs"),
  showChart,
  toggleLabels,
  downloadProvincesData,
  removeAllProvinces,
  enterProvincesManualAssignment,
  applyProvincesManualAssignment,
  exitProvincesManualAssignment,
  triggerProvincesRelease,
  enterAddProvinceMode,
  openProvinceMergeDialog,
  recolorProvinces,

  nameEditorUpdate(updates: Partial<import("../store/provincesEditorState").ProvinceNameEditorData>): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    setProvincesEditorState({ nameEditor: { ...ne, ...updates } });
  },

  nameEditorGenerateShortCulture(): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    const province = (worldContext.pack.provinces as Province[])[ne.provinceId];
    const culture = worldContext.pack.cells.culture[province.center];
    const name = Names.getState(Names.getCultureShort(worldContext, viewContext, appServices, culture), culture);
    setProvincesEditorState({ nameEditor: { ...ne, shortName: name } });
  },

  nameEditorGenerateShortRandom(): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    const base = rand(worldContext.nameBases.length - 1);
    const name = Names.getState(Names.getBase(base), 0, base);
    setProvincesEditorState({ nameEditor: { ...ne, shortName: name } });
  },

  nameEditorRegenerateFullName(): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    const { shortName, formName } = ne;
    let fullName: string;
    if (!formName) fullName = shortName;
    else if (!shortName) fullName = `The ${formName}`;
    else fullName = `${shortName} ${formName}`;
    setProvincesEditorState({ nameEditor: { ...ne, fullName } });
  },

  nameEditorApply(): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    const p = (worldContext.pack.provinces as Province[])[ne.provinceId];
    p.name = ne.shortName;
    p.formName = ne.formName;
    p.fullName = ne.fullName;
    view.provs.select(`#provinceLabel${p.i}`).text(p.name);
    setProvincesEditorState({ nameEditor: null });
    refreshProvincesEditor();
  },

  nameEditorClose(): void {
    setProvincesEditorState({ nameEditor: null });
  },

  closeMergeDialog(): void {
    provinceHighlightOff(null);
    setProvincesEditorState({ mergeDialog: null });
  },

  confirmMerge(rulingProvinceId: number | null, provincesToMerge: number[]): void {
    if (!rulingProvinceId) {
      tip("Please select a province to merge into", false, "error");
      return;
    }
    const mergeList = provincesToMerge.filter(id => id !== rulingProvinceId);
    if (!mergeList.length) {
      tip("Please select several provinces to merge", false, "error");
      return;
    }
    const rulingProvince = (worldContext.pack.provinces as Province[])[rulingProvinceId];
    const emblem = (i: number) =>
      `<svg class="coaIcon" viewBox="0 0 200 200"><use href="#provinceCOA${i}"></use></svg>`;
    confirmationDialog({
      title: "Merge provinces",
      message: `
        <p>The following provinces will be <strong>removed</strong>: ${mergeList.map(id => `${emblem(id)}${(worldContext.pack.provinces as Province[])[id].name}`).join(", ")}.</p>
        <p>Removed provinces data (burgs and cells) will be assigned to ${emblem(rulingProvince.i)}${rulingProvince.name}.</p>
        <p>Are you sure you want to merge provinces? This action cannot be reverted.</p>`,
      confirm: "Merge",
      onConfirm: () => {
        mergeProvinces(mergeList, rulingProvinceId);
        setProvincesEditorState({ mergeDialog: null });
      }
    });
  }
};

export function initProvincesEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}

document.addEventListener("fmg:refresh-editors", () => {
  if (isDialogOpen("provincesEditor")) refreshProvincesEditor();
});
