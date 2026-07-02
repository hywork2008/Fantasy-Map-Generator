import * as d3 from "d3";
import { color, interpolate, pointer } from "d3";
import { getWorldState, zoomTo } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";

import {
  BordersRenderer,
  drawBurgIcon,
  drawBurgLabel,
  drawStateLabels,
  EmblemsRenderer,
  PopulationRenderer,
  ProvincesRenderer,
  StatesRenderer
} from "../renderers";
import type { Emblem as RendererEmblem } from "../renderers/emblem-renderer";
import { COArenderer } from "../renderers/emblem-renderer";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, showMainTip, tip } from "../services/tooltipService";
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
import { findAll, findCell, getRandomColor, isLand, P, parseTransform, rand, rn, unique } from "../utils";
import { fitContent, getArea, getAreaUnit } from "../utils/domUtils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName } from "../utils/editorHelpers";
import { getPackPolygon } from "../utils/graphUtils";
import { confirmMergeDialog } from "../utils/mergeHelpers";
import { generateShortCultureName, regenerateFullName } from "../utils/nameEditorHelpers";
import { generateRandomName } from "../utils/nameGenerator";
import { getElementsBySelector, layerIsOn } from "../utils/nodeUtils";
import { openPopulationChangeDialog } from "../utils/populationHelpers";
import { overviewBurgs } from "./burgs-overview";
import { editEmblem } from "./emblems-editor";
import { interactionManager } from "./interactionManager";
import { toggleBorders, toggleCultures, toggleProvinces, toggleStates, turnButtonOff } from "./layers";
import { editStyle } from "./style";

export function editProvinces(): void {
  if (viewContext.customization) return;
  closeDialogs("#provincesEditor, .stable");
  if (!layerIsOn("toggleProvinces")) toggleProvinces();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleCultures")) toggleCultures();

  viewContext.provs
    .selectAll<SVGTextElement, unknown>("text")
    .call(d3.drag<SVGTextElement, unknown>().on("start", dragLabelStart).on("drag", dragLabel))
    .classed("draggable", true);

  setProvincesEditorState({ isOpen: true, customization: 0, filterState: -1 });
  refreshProvincesEditor();

  if (modules.editProvinces) return;
  modules.editProvinces = true;

  openDialog("provincesEditor", {
    title: "GenerationPipeline.Provinces Editor",
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
    const isFocused = !viewContext.defs.select(`#fog #focusProvince${p.i}`).empty();

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
      burgsData: (p.burgs || []).map(bId => ({
        id: bId,
        name: (worldContext.pack.burgs as Burg[])[bId]?.name || "Unknown"
      })),
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
  if (viewContext.customization) return;
  ProvincesRenderer.highlightProvinceOn(viewContext, province);
}

function provinceHighlightOff(province: number | null): void {
  if (!layerIsOn("toggleProvinces") || !province) {
    ProvincesRenderer.clearHighlight(viewContext);
    return;
  }
  ProvincesRenderer.highlightProvinceOff(viewContext, province);
  ProvincesRenderer.clearHighlight(viewContext);
}

function changeFill(provinceId: number): void {
  const p = (worldContext.pack.provinces as Province[])[provinceId];
  const currentFill = p.color || "#ffffff";

  const input = document.createElement("input");
  input.type = "color";
  input.value = currentFill;
  input.oninput = e => {
    const newFill = (e.target as HTMLInputElement).value;
    p.color = newFill;
    ProvincesRenderer.updateProvinceColor(viewContext, provinceId, newFill);
    refreshProvincesEditor();
  };
  input.click();
}

function capitalZoomIn(p: number): void {
  const capital = (worldContext.pack.provinces as Province[])[p].burg;
  const l = viewContext.burgLabels.select(`[data-id='${capital}']`);
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
  GenerationPipeline.Burgs.changeGroup(capital);
  drawBurgIcon(worldContext, viewContext, appServices, capital);
  drawBurgLabel(worldContext, viewContext, appServices, capital);

  (provinceBurgs ?? []).forEach((b: number) => {
    (burgs as Burg[])[b].state = newStateId;
  });

  const { cell: center, culture } = (burgs as Burg[])[burgId];
  const newColor = getRandomColor();
  const coa = province.coa;
  d3.select(`#provinceCOA${provinceId}`).attr("id", `stateCOA${newStateId}`);
  EmblemsRenderer.removeProvinceEmblems(viewContext, provinceId);

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
  GenerationPipeline.States.getPoles(state);
  GenerationPipeline.States.findNeighbors();
  GenerationPipeline.States.collectStatistics(state);
  GenerationPipeline.States.defineStateForms(state, newStates);
  drawStateLabels(worldContext, viewContext, appServices, allStates);

  allStates.forEach(stateId => {
    EmblemsRenderer.removeStateEmblems(viewContext, stateId);
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
  const burgs = (p.burgs || []).map(b => (worldContext.pack.burgs as Burg[])[b]).filter(b => b && !b.removed);

  openPopulationChangeDialog({
    title: "Change province population",
    description: `Total: ${l(total)}`,
    oldRural: rural,
    oldUrban: urban,
    cells,
    burgs,
    onSuccess: () => {
      if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
      refreshProvincesEditor();
    }
  });
}

function toggleFog(p: number): void {
  const path = viewContext.provs.select(`#province${p}`).attr("d");
  const id = `focusProvince${p}`;
  const isFocused = !viewContext.defs.select(`#fog #${id}`).empty();
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

      d3.select(`#provinceCOA${p}`).remove();
      EmblemsRenderer.removeProvinceEmblems(viewContext, p);

      (worldContext.pack.provinces as Province[])[p] = { i: p, removed: true } as Province;

      ProvincesRenderer.removeProvinceDOM(viewContext, p);
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
  ProvincesRenderer.toggleProvinceLabels(viewContext);
  viewContext.provs
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

  ProvincesRenderer.setupBorderHighlight(viewContext);

  viewContext.customization = 11;
  ProvincesRenderer.setupTempGroup(viewContext);

  setProvincesEditorState({ customization: 11 });

  tip("Click on a province to select, drag the circle to change province", true);
  viewContext.viewbox
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
  if (viewContext.customization === 11) {
    selectedProvinceIdForManual = id;
    selectProvince(id);
  }
}

function selectProvinceOnMapClick(this: SVGElement, event: MouseEvent): void {
  const [px, py] = pointer(event, this);
  const i = findCell(px, py);
  if (worldContext.pack.cells.h[i] < 20 || !worldContext.pack.cells.state[i]) return;

  const assigned = viewContext.provs.select("g#temp").select(`polygon[data-cell='${i}']`);
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
  ProvincesRenderer.selectProvinceHighlight(viewContext, p);
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
  if (selectedProvinceIdForManual === null) return;

  const provinceNew = selectedProvinceIdForManual;
  const state = (worldContext.pack.provinces as Province[])[provinceNew].state;
  const fill = (worldContext.pack.provinces as Province[])[provinceNew].color || "#ffffff";

  const temp = viewContext.provs.select("#temp");
  const centers = viewContext.provs.select("#centers");

  selection.forEach(i => {
    if (!worldContext.pack.cells.state[i] || worldContext.pack.cells.state[i] !== state) return;
    const exists = temp.select(`polygon[data-cell='${i}']`);
    const provinceOld = exists.size() ? +exists.attr("data-province") : worldContext.pack.cells.province[i];
    if (provinceNew === provinceOld) return;
    if (i === (worldContext.pack.provinces as Province[])[provinceOld]?.center) {
      if (!centers.select(`polygon[data-center='${i}']`).size()) {
        ProvincesRenderer.drawCenterMark(viewContext, i, getPackPolygon(i, worldContext.pack).join(" "));
      }
      tip("Province center cannot be assigned to a different region. Please remove the province first", false, "error");
      return;
    }

    if (exists.size()) {
      if (worldContext.pack.cells.province[i] === provinceNew) {
        ProvincesRenderer.removeTempPolygon(viewContext, i);
      } else {
        ProvincesRenderer.updateTempPolygon(viewContext, i, provinceNew, fill);
      }
    } else {
      ProvincesRenderer.drawTempPolygon(
        viewContext,
        i,
        getPackPolygon(i, worldContext.pack).join(" "),
        provinceNew,
        fill
      );
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
  viewContext.provs
    .select("#temp")
    .selectAll("polygon")
    .each(function () {
      const el = this as SVGPolygonElement;
      const i = +el.dataset.cell!;
      worldContext.pack.cells.province[i] = +el.dataset.province!;
    });

  GenerationPipeline.Provinces.getPoles(getWorldState());
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);

  exitProvincesManualAssignment();
  refreshProvincesEditor();
}

function exitProvincesManualAssignment(): void {
  viewContext.customization = 0;
  ProvincesRenderer.cleanupTempGroup(viewContext);
  EditorBus.removeCircle();

  ProvincesRenderer.clearBorderHighlight(viewContext);
  ProvincesRenderer.clearSelectionHighlight(viewContext);

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

  viewContext.customization = 12;
  setProvincesEditorState({ customization: 12 });
  tip("Click on the map to place a new province center", true);
  viewContext.viewbox.style("cursor", "crosshair");
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
    : GenerationPipeline.Names.getState(
        GenerationPipeline.Names.getCultureShort(worldContext, viewContext, appServices, c),
        c
      );
  const formName = oldProvince ? provincesArr[oldProvince].formName : "Province";
  const fullName = `${name} ${formName}`;
  const stateColor = (worldContext.pack.states as State[])[state].color ?? "";
  const rndColor = getRandomColor();
  const newColor = stateColor[0] === "#" ? color(interpolate(stateColor, rndColor)(0.2))!.formatHex() : rndColor;

  const kinship = burg ? 0.8 : 0.4;
  const parentBurg = burg ? (worldContext.pack.burgs as Burg[])[burg] : null;
  const type = GenerationPipeline.Burgs.getType(center, parentBurg?.port);
  const parentCOA = parentBurg ? parentBurg.coa : (worldContext.pack.states as State[])[state].coa;
  const coa = GenerationPipeline.COA.generate(parentCOA ?? null, kinship, P(0.1) as unknown as number, type);
  coa.shield = GenerationPipeline.COA.getShield(c, state) ?? "";
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
  viewContext.customization = 0;
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
  const unit = getAreaUnit();
  let data = `Id,Province,Full Name,Form,State,Color,Capital,Area ${unit},Total Population,Rural Population,Urban Population,GenerationPipeline.Burgs\n`;

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

  downloadFile(data, `${getFileName("GenerationPipeline.Provinces")}.csv`);
}

function removeAllProvinces(): void {
  openConfirm("Are you sure you want to remove all provinces? <br />This action cannot be reverted", {
    title: "Remove all provinces",
    confirm: "Remove",
    onConfirm: () => {
      getElementsBySelector("[id^='provinceCOA']").forEach(el => {
        el.remove();
      });
      EmblemsRenderer.clearProvinceEmblems(viewContext);

      worldContext.pack.provinces = [0 as unknown as Province];
      worldContext.pack.cells.province = new Uint16Array(worldContext.pack.cells.i.length);
      (worldContext.pack.states as State[]).forEach(s => {
        s.provinces = [];
      });

      EditorBus.unfog();
      if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
      ProvincesRenderer.clearBody(viewContext);
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
  viewContext.provs
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
      title: "Merge GenerationPipeline.Provinces"
    });
    return;
  }
  const provincesToMerge = (worldContext.pack.provinces as Province[]).filter(
    p => p.i && !p.removed && p.state === selectedState
  );
  if (provincesToMerge.length < 2) {
    openAlert("Not enough provinces in the selected state to merge.", { title: "Merge GenerationPipeline.Provinces" });
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
  EmblemsRenderer.removeProvinceEmblems(viewContext, provinceId);
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
  GenerationPipeline.Provinces.getPoles(getWorldState());

  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);

  EditorBus.unfog();
  ProvincesRenderer.clearHighlight(viewContext);

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
    EditorBus.highlightElement(viewContext.provs.select(`#province${id}`).node() as Element, 8),
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
    const name = generateShortCultureName(culture);
    setProvincesEditorState({ nameEditor: { ...ne, shortName: name } });
  },

  nameEditorGenerateShortRandom(): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    const name = GenerationPipeline.Names.getState(generateRandomName(), 0, rand(worldContext.nameBases.length - 1));
    setProvincesEditorState({ nameEditor: { ...ne, shortName: name } });
  },

  nameEditorRegenerateFullName(): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    const { shortName, formName } = ne;
    const fullName = regenerateFullName(shortName, formName, false);
    setProvincesEditorState({ nameEditor: { ...ne, fullName } });
  },

  nameEditorApply(): void {
    const ne = getProvincesEditorState().nameEditor;
    if (!ne) return;
    const p = (worldContext.pack.provinces as Province[])[ne.provinceId];
    p.name = ne.shortName;
    p.formName = ne.formName;
    p.fullName = ne.fullName;
    ProvincesRenderer.updateProvinceLabelText(viewContext, p.i, p.name);
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
    confirmMergeDialog({
      entityType: "province",
      rulingId: rulingProvinceId,
      selectedIds: provincesToMerge,
      getEntityName: (id: number) => (worldContext.pack.provinces as Province[])[id].name,
      onConfirm: (mergeList: number[], rulingId: number) => {
        mergeProvinces(mergeList, rulingId);
        setProvincesEditorState({ mergeDialog: null });
      }
    });
  }
};

export function initProvincesEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}

document.addEventListener("fmg:refresh-editors", () => {
  if (isDialogOpen("provincesEditor")) refreshProvincesEditor();
});
