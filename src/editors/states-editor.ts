import * as d3 from "d3";
import { getWorldState, zoomTo } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { overviewBurgs } from "../controllers/burgs-overview";
import { interactionManager } from "../controllers/interactionManager";
import {
  toggleBiomes,
  toggleBorders,
  toggleCultures,
  toggleProvinces,
  toggleReligions,
  toggleStates
} from "../controllers/layers";
import { editStyle } from "../controllers/style";
import { Burgs } from "../modules/burgs-generator";
import { COA } from "../modules/emblem/generator";
import { Names } from "../modules/names-generator";
import { Provinces } from "../modules/provinces-generator";
import { States } from "../modules/states-generator";
import {
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  drawBurgIcon,
  drawBurgLabel,
  drawRoute,
  drawStateLabels,
  PopulationRenderer,
  ProvincesRenderer,
  StatesRenderer
} from "../renderers";
import type { Emblem as RendererEmblem } from "../renderers/emblem-renderer";
import { COArenderer } from "../renderers/emblem-renderer";
import { useOptionsState } from "../store/optionsState";
import { getStatesEditorState, setStatesEditorState } from "../store/statesEditorState";
import type { Burg, Culture, MilitaryRegiment, Province, State } from "../types/models";
import type { WorldNote } from "../types/WorldState";
import { closeDialogs, openRichDialog } from "../ui/dialogs/dialogService";
import { findAll, findCell, getAdjective, getMixedColor, getRandomColor, isLand, P, rand, rn, si } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName } from "../utils/editorHelpers";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, fitContent, getArea, getAreaUnit, showMainTip, tip } from "../utils/uiHelpers";
import { BrushHistoryClass as BrushHistory } from "./BrushHistory";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

const statesManualHistory = new BrushHistory();

// formName (e.g. "Kingdom") → form category (e.g. "Monarchy")
const FORM_CATEGORIES: Record<string, string> = {
  Beylik: "Monarchy",
  Despotate: "Monarchy",
  Dominion: "Monarchy",
  Duchy: "Monarchy",
  Emirate: "Monarchy",
  Empire: "Monarchy",
  Horde: "Monarchy",
  "Grand Duchy": "Monarchy",
  Heptarchy: "Monarchy",
  Khaganate: "Monarchy",
  Khanate: "Monarchy",
  Kingdom: "Monarchy",
  Marches: "Monarchy",
  Principality: "Monarchy",
  Satrapy: "Monarchy",
  Shogunate: "Monarchy",
  Sultanate: "Monarchy",
  Tsardom: "Monarchy",
  Ulus: "Monarchy",
  Viceroyalty: "Monarchy",
  Chancellery: "Republic",
  "City-state": "Republic",
  Diarchy: "Republic",
  Federation: "Republic",
  "Free City": "Republic",
  "Most Serene Republic": "Republic",
  Oligarchy: "Republic",
  Protectorate: "Republic",
  Republic: "Republic",
  Tetrarchy: "Republic",
  "Trade Company": "Republic",
  Triumvirate: "Republic",
  Confederacy: "Union",
  Confederation: "Union",
  Conglomerate: "Union",
  Commonwealth: "Union",
  League: "Union",
  Union: "Union",
  "United Hordes": "Union",
  "United Kingdom": "Union",
  "United Provinces": "Union",
  "United Republic": "Union",
  "United States": "Union",
  "United Tribes": "Union",
  Bishopric: "Theocracy",
  Brotherhood: "Theocracy",
  Caliphate: "Theocracy",
  Diocese: "Theocracy",
  "Divine Duchy": "Theocracy",
  "Divine Grand Duchy": "Theocracy",
  "Divine Principality": "Theocracy",
  "Divine Kingdom": "Theocracy",
  "Divine Empire": "Theocracy",
  Eparchy: "Theocracy",
  Exarchate: "Theocracy",
  "Holy State": "Theocracy",
  Imamah: "Theocracy",
  Patriarchate: "Theocracy",
  Theocracy: "Theocracy",
  Commune: "Anarchy",
  Community: "Anarchy",
  Council: "Anarchy",
  "Free Territory": "Anarchy",
  Tribes: "Anarchy"
};

export function open(): void {
  closeDialogs("#statesEditor, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleReligions")) toggleReligions();

  setStatesEditorState({ isOpen: true, isRegenerationMenuOpen: false, customizationMode: 0 });
  refreshStatesEditor();
}

export function refreshStatesEditor(): void {
  States.collectStatistics(getWorldState());

  let totalArea = 0;
  let totalPopulation = 0;
  let totalBurgs = 0;

  const statesRowData = [];

  for (const s of worldContext.pack.states as State[]) {
    if (s.removed) continue;
    const area = getArea(s.area ?? 0);
    const rural = (s.rural ?? 0) * worldContext.populationRate;
    const urban = (s.urban ?? 0) * worldContext.populationRate * worldContext.urbanization;
    const population = rn(rural + urban);

    totalArea += area;
    totalPopulation += population;
    totalBurgs += s.burgs ?? 0;

    const capitalName = s.i ? ((worldContext.pack.burgs as Burg[])[s.capital]?.name ?? "") : "";
    const cultureName = s.i ? ((worldContext.pack.cultures as Culture[])[s.culture]?.name ?? "") : "";

    if (s.i) {
      COArenderer.trigger(`stateCOA${s.i}`, s.coa as RendererEmblem);
    }

    statesRowData.push({
      i: s.i,
      name: s.name,
      color: s.color ?? "",
      form: s.form ?? "",
      formName: s.formName ?? "",
      capital: s.capital,
      capitalName,
      culture: s.culture,
      cultureName,
      burgs: s.burgs ?? 0,
      area,
      population,
      type: s.type || "Generic",
      expansionism: s.expansionism || 0,
      cells: s.cells ?? 0,
      rural,
      urban,
      isLocked: !!s.lock
    });
  }

  const validStates = statesRowData.filter(s => s.i > 0).length;
  const validCells = Array.from(worldContext.pack.cells.h).filter(h => h >= 20).length;

  setStatesEditorState({
    states: statesRowData,
    totalStates: validStates,
    totalCells: validCells,
    totalBurgs,
    totalArea,
    totalPopulation
  });
}

export const statesEditorActions = {
  closeStatesEditor(): void {
    setStatesEditorState({ isOpen: false });
    if (viewContext.customization === 2) exitStatesManualAssignment(true);
    if (viewContext.customization === 3) exitAddStateMode();
    viewContext.debug.selectAll(".highlight").remove();
  },

  refresh(): void {
    refreshStatesEditor();
  },

  editStyle(): void {
    editStyle("regions");
  },

  toggleLegend(): void {
    if (viewContext.legend.selectAll("*").size()) {
      EditorBus.clearLegend();
      return;
    }
    const data = (worldContext.pack.states as State[])
      .filter(s => s.i && !s.removed && s.cells)
      .sort((a, b) => (b.area ?? 0) - (a.area ?? 0))
      .map(s => [s.i, s.color ?? "", s.name] as [number, string, string]);
    EditorBus.drawLegend("States", data);
  },

  togglePercentageMode(): void {
    const st = getStatesEditorState();
    setStatesEditorState({ isPercentageMode: !st.isPercentageMode });
  },

  showStatesChart(): void {
    showStatesChart();
  },

  toggleRegenerationMenu(): void {
    const st = getStatesEditorState();
    setStatesEditorState({ isRegenerationMenuOpen: !st.isRegenerationMenuOpen });
  },

  randomizeStatesExpansion(): void {
    randomizeStatesExpansion();
  },

  changeGrowthRate(rate: number): void {
    setStatesEditorState({ growthRate: rate });
    recalculateStates(false);
  },

  recalculateStates(must: boolean): void {
    recalculateStates(must);
  },

  setAutoChange(val: boolean): void {
    setStatesEditorState({ autoChange: val });
  },

  setAdjustLabels(val: boolean): void {
    setStatesEditorState({ adjustLabels: val });
  },

  toggleManualAssignment(): void {
    const st = getStatesEditorState();
    if (st.customizationMode === 1) {
      exitStatesManualAssignment(false);
    } else {
      enterStatesManualAssignent();
    }
  },

  changeBrushSize(size: number): void {
    setStatesEditorState({ brushSize: size });
  },

  undoManualAssignment(): void {
    undoStatesManualAssignment();
  },

  applyManualAssignment(): void {
    applyStatesManualAssignent();
  },

  cancelManualAssignment(): void {
    exitStatesManualAssignment(false);
  },

  setProtectExisting(val: boolean): void {
    setStatesEditorState({ protectExisting: val });
  },

  toggleAddStateMode(_shift: boolean): void {
    const st = getStatesEditorState();
    if (st.customizationMode === 2) {
      exitAddStateMode();
    } else {
      viewContext.customization = 3;
      setStatesEditorState({ customizationMode: 2 });
      tip("Click on the map to create a new capital or promote an existing burg", true);
      viewContext.viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(addState);
    }
  },

  openStateMergeDialog(): void {
    openStateMergeDialog();
  },

  highlightStateOnMap(stateId: number): void {
    if (!layerIsOn("toggleStates")) return;
    stateHighlightOff();
    stateHighlightById(stateId);
  },

  clearStateHighlight(): void {
    stateHighlightOff();
  },

  closeMergeDialog(): void {
    stateHighlightOff();
    setStatesEditorState({ mergeDialog: null });
  },

  confirmMerge(rulingStateId: number | null, statesToMerge: number[]): void {
    if (!rulingStateId) {
      tip("Please select a state to merge into", false, "error");
      return;
    }
    const mergeList = statesToMerge.filter(id => id !== rulingStateId);
    if (!mergeList.length) {
      tip("Please select several states to merge", false, "error");
      return;
    }
    const rulingState = worldContext.pack.states[rulingStateId] as State;
    const emblem = (i: number) => `<svg class="coaIcon" viewBox="0 0 200 200"><use href="#stateCOA${i}"></use></svg>`;
    confirmationDialog({
      title: "Merge states",
      message: `
        <p>The following states will be <strong>removed</strong>: ${mergeList.map(id => `${emblem(id)}${(worldContext.pack.states[id] as State).name}`).join(", ")}.</p>
        <p>Removed states data (burgs, provinces, regiments) will be assigned to ${emblem(rulingState.i)}${rulingState.name}.</p>
        <p>Are you sure you want to merge states? This action cannot be reverted.</p>`,
      confirm: "Merge",
      onConfirm: () => {
        mergeStates(mergeList, rulingStateId);
        setStatesEditorState({ mergeDialog: null });
      }
    });
  },

  downloadStatesCsv(): void {
    downloadStatesCsv();
  },

  changeSort(field: string): void {
    const st = getStatesEditorState();
    if (st.sortBy === field) {
      setStatesEditorState({ sortDirection: st.sortDirection === 1 ? -1 : 1 });
    } else {
      setStatesEditorState({ sortBy: field, sortDirection: 1 });
    }
  },

  changeColor(stateId: number): void {
    const currentFill = worldContext.pack.states[stateId].color;
    const callback = (newFill: string) => {
      worldContext.pack.states[stateId].color = newFill;
      viewContext.statesBody.select(`#state${stateId}`).attr("fill", newFill);
      viewContext.statesBody.select(`#state-gap${stateId}`).attr("stroke", newFill);
      const halo = d3.color(newFill)?.darker()?.formatHex() ?? "#666666";
      viewContext.statesHalo.select(`#state-border${stateId}`).attr("stroke", halo);

      const solidColor = newFill[0] === "#" ? newFill : "#999";
      const darkerColor = d3.color(solidColor)!.darker().formatHex();
      viewContext.armies.select(`#army${stateId}`).attr("fill", solidColor);
      viewContext.armies.select(`#army${stateId}`).selectAll("g > rect:nth-of-type(2)").attr("fill", darkerColor);
      refreshStatesEditor();
    };
    window.openPicker(currentFill ?? "", callback);
  },

  editStateName(stateId: number): void {
    editStateName(stateId);
  },

  zoomCapital(stateId: number): void {
    stateCapitalZoomIn(stateId);
  },

  changeCapitalName(stateId: number, val: string): void {
    const capital = (worldContext.pack.states[stateId] as State).capital;
    if (!capital) return;
    (worldContext.pack.burgs as Burg[])[capital].name = val;
    (document.querySelector(`#burgLabel${capital}`) as Element).textContent = val;
    refreshStatesEditor();
  },

  getCultureOptions(_selectedCulture: number): Culture[] {
    return (worldContext.pack.cultures as Culture[]).filter(c => !c.removed);
  },

  changeCulture(stateId: number, val: number): void {
    (worldContext.pack.states[stateId] as State).culture = val;
    refreshStatesEditor();
  },

  overviewBurgs(stateId: number): void {
    overviewBurgs({ stateId });
  },

  changePopulation(stateId: number): void {
    changePopulation(stateId);
  },

  changeType(stateId: number, val: string): void {
    worldContext.pack.states[stateId].type = val;
    recalculateStates();
  },

  changeExpansionism(stateId: number, val: number): void {
    worldContext.pack.states[stateId].expansionism = val;
    recalculateStates();
  },

  toggleLock(stateId: number): void {
    const s = worldContext.pack.states[stateId] as State;
    s.lock = !s.lock;
    refreshStatesEditor();
  },

  removeState(stateId: number): void {
    if (viewContext.customization) return;
    stateRemovePrompt(stateId);
  },

  nameEditorUpdate(updates: Partial<import("../store/statesEditorState").NameEditorData>): void {
    const ne = getStatesEditorState().nameEditor;
    if (!ne) return;
    setStatesEditorState({ nameEditor: { ...ne, ...updates } });
  },

  nameEditorGenerateShortCulture(): void {
    const ne = getStatesEditorState().nameEditor;
    if (!ne) return;
    const culture = (worldContext.pack.states[ne.stateId] as State).culture;
    const name = Names.getState(Names.getCultureShort(worldContext, viewContext, appServices, culture), culture);
    setStatesEditorState({ nameEditor: { ...ne, shortName: name } });
  },

  nameEditorGenerateShortRandom(): void {
    const ne = getStatesEditorState().nameEditor;
    if (!ne) return;
    const base = rand(worldContext.nameBases.length - 1);
    const name = Names.getState(Names.getBase(base), 0, base);
    setStatesEditorState({ nameEditor: { ...ne, shortName: name } });
  },

  nameEditorRegenerateFullName(): void {
    const ne = getStatesEditorState().nameEditor;
    if (!ne) return;
    const { shortName, formName, regenTick } = ne;
    let fullName: string;
    if (!formName) fullName = shortName;
    else if (!shortName) fullName = `The ${formName}`;
    else fullName = regenTick % 2 ? `${getAdjective(shortName)} ${formName}` : `${formName} of ${shortName}`;
    setStatesEditorState({ nameEditor: { ...ne, fullName, regenTick: regenTick + 1 } });
  },

  nameEditorApply(): void {
    const ne = getStatesEditorState().nameEditor;
    if (!ne) return;
    const s = worldContext.pack.states[ne.stateId] as State;

    const nameChanged = ne.shortName !== s.name;
    const formChanged = ne.formName !== (s.formName ?? "");
    const fullNameChanged = ne.fullName !== (s.fullName ?? "");
    const changed = nameChanged || formChanged || fullNameChanged;

    if (formChanged && ne.formName) {
      const form = FORM_CATEGORIES[ne.formName];
      if (form) s.form = form;
    }

    s.name = ne.shortName;
    s.formName = ne.formName;
    s.fullName = ne.fullName;

    if (changed && ne.updateLabel) drawStateLabels(worldContext, viewContext, appServices, [s.i]);
    setStatesEditorState({ nameEditor: null });
    refreshStatesEditor();
  },

  nameEditorClose(): void {
    setStatesEditorState({ nameEditor: null });
  }
};

function stateHighlightOn(event: Event): void {
  if (!layerIsOn("toggleStates")) return;
  if (viewContext.defs.select("#fog path").size()) return;

  const state = +((event.target as HTMLElement).dataset.id ?? 0);
  if (viewContext.customization || !state) return;
  stateHighlightById(state);
}

function stateHighlightById(stateId: number): void {
  const d = viewContext.regions.select(`#state${stateId}`).attr("d");
  if (!d) return;

  const path = viewContext.debug
    .append("path")
    .attr("class", "highlight")
    .attr("d", d)
    .attr("fill", "none")
    .attr("stroke", "red")
    .attr("stroke-width", 1)
    .attr("opacity", 1)
    .attr("filter", "url(#blur1)");

  const totalLength = (path.node() as SVGPathElement).getTotalLength();
  const duration = (totalLength + 5000) / 2;
  const interpolate = d3.interpolateString(`0, ${totalLength}`, `${totalLength}, ${totalLength}`);
  path
    .transition()
    .duration(duration)
    .attrTween("stroke-dasharray", () => interpolate);
}

function stateHighlightOff(): void {
  viewContext.debug.selectAll<SVGElement, unknown>(".highlight").each(function () {
    d3.select(this).transition().duration(1000).attr("opacity", 0).remove();
  });
}

function editStateName(stateId: number): void {
  const s = worldContext.pack.states[stateId] as State;
  setStatesEditorState({
    nameEditor: {
      stateId,
      shortName: s.name || "",
      formName: s.formName ?? "",
      fullName: s.fullName || "",
      isCustomFormMode: false,
      customFormInput: "",
      updateLabel: true,
      regenTick: 0
    }
  });
}

function changePopulation(stateId: number): void {
  const state = worldContext.pack.states[stateId] as State;
  if (!state.cells) {
    tip("State does not have any cells, cannot change population", false, "error");
    return;
  }

  const rural = rn((state.rural ?? 0) * worldContext.populationRate);
  const urban = rn((state.urban ?? 0) * worldContext.populationRate * worldContext.urbanization);
  const total = rural + urban;
  const format = (n: number) => Number(n).toLocaleString();

  alertMessage.innerHTML = /* html */ `<div>
    <i>Change population of all cells assigned to the state</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${rural} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${urban} style="width:6em" />
    </div>
    <div>Total population: ${format(total)} ⇒ <span id="totalPop">${format(total)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;

  const getRuralPop = () => document.getElementById("ruralPop") as HTMLInputElement;
  const getUrbanPop = () => document.getElementById("urbanPop") as HTMLInputElement;

  const update = () => {
    const totalNew = getRuralPop().valueAsNumber + getUrbanPop().valueAsNumber;
    if (Number.isNaN(totalNew)) return;
    const totalPopEl = document.getElementById("totalPop");
    const totalPopPercEl = document.getElementById("totalPopPerc");
    if (totalPopEl) totalPopEl.innerHTML = format(totalNew);
    if (totalPopPercEl) totalPopPercEl.innerHTML = String(rn((totalNew / total) * 100));
  };

  getRuralPop().oninput = () => update();
  getUrbanPop().oninput = () => update();

  openRichDialog({
    content: alertMessage.innerHTML,
    resizable: false,
    title: "Change state population",
    width: "24em",
    buttons: {
      Apply: () => {
        applyPopulationChange();
        /* $(this).dialog("close") removed */
      },
      Cancel: () => {
        /* $(this).dialog("close") removed */
      }
    },
    position: { my: "center", at: "center", of: "svg" }
  });

  function applyPopulationChange(): void {
    const ruralChange = +getRuralPop().value / rural;
    if (Number.isFinite(ruralChange) && ruralChange !== 1) {
      const cells = worldContext.pack.cells.i.filter((i: number) => worldContext.pack.cells.state[i] === stateId);
      cells.forEach((i: number) => {
        worldContext.pack.cells.pop[i] *= ruralChange;
      });
    }
    if (!Number.isFinite(ruralChange) && +getRuralPop().value > 0) {
      const points = +getRuralPop().value / worldContext.populationRate;
      const cells = worldContext.pack.cells.i.filter((i: number) => worldContext.pack.cells.state[i] === stateId);
      const pop = points / cells.length;
      cells.forEach((i: number) => {
        worldContext.pack.cells.pop[i] = pop;
      });
    }

    const urbanChange = +getUrbanPop().value / urban;
    if (Number.isFinite(urbanChange) && urbanChange !== 1) {
      const burgs = (worldContext.pack.burgs as Burg[]).filter(b => !b.removed && b.state === stateId);
      burgs.forEach(b => {
        b.population = rn((b.population ?? 0) * urbanChange, 4);
      });
    }
    if (!Number.isFinite(urbanChange) && +getUrbanPop().value > 0) {
      const points = +getUrbanPop().value / worldContext.populationRate / worldContext.urbanization;
      const burgs = (worldContext.pack.burgs as Burg[]).filter(b => !b.removed && b.state === stateId);
      const population = rn(points / burgs.length, 4);
      burgs.forEach(b => {
        b.population = population;
      });
    }

    if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
    refreshStatesEditor();
  }
}

function stateCapitalZoomIn(state: number): void {
  const capital = (worldContext.pack.states[state] as State).capital;
  const l = viewContext.burgLabels.select(`[data-id='${capital}']`);
  const x = +l.attr("x");
  const y = +l.attr("y");
  zoomTo(x, y, 8, 2000);
}

function stateRemovePrompt(state: number): void {
  if (viewContext.customization) return;

  confirmationDialog({
    title: "Remove state",
    message: "Are you sure you want to remove the state? <br>This action cannot be reverted",
    confirm: "Remove",
    onConfirm: () => stateRemove(state)
  });
}

function stateRemove(stateId: number): void {
  viewContext.statesBody.select(`#state${stateId}`).remove();
  viewContext.statesBody.select(`#state-gap${stateId}`).remove();
  viewContext.statesHalo.select(`#state-border${stateId}`).remove();
  viewContext.labels.select(`#stateLabel${stateId}`).remove();
  viewContext.defs.select(`#textPath_stateLabel${stateId}`).remove();

  EditorBus.unfog(`focusState${stateId}`);

  (worldContext.pack.burgs as Burg[]).forEach(burg => {
    if (burg.state === stateId) {
      burg.state = 0;
      if (burg.capital) {
        burg.capital = 0;
        Burgs.changeGroup(burg);
      }
    }
  });
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) BurgLabelsRenderer.render(worldContext, viewContext, appServices);

  Array.from(worldContext.pack.cells.state).forEach((s: number, i: number) => {
    if (s === stateId) worldContext.pack.cells.state[i] = 0;
  });

  const coaId = `stateCOA${stateId}`;
  document.getElementById(coaId)?.remove();
  viewContext.emblems.select(`#stateEmblems > use[data-i='${stateId}']`).remove();

  ((worldContext.pack.states[stateId] as State).provinces ?? []).forEach((p: number) => {
    (worldContext.pack.provinces as Province[])[p] = { i: p, removed: true } as Province;
    Array.from(worldContext.pack.cells.province).forEach((pr: number, i: number) => {
      if (pr === p) worldContext.pack.cells.province[i] = 0;
    });

    const provCoaId = `provinceCOA${p}`;
    const provCoaEl = document.getElementById(provCoaId);
    if (provCoaEl) provCoaEl.remove();
    viewContext.emblems.select(`#provinceEmblems > use[data-i='${p}']`).remove();
    const g = viewContext.provs.select("#provincesBody");
    g.select(`#province${p}`).remove();
    g.select(`#province-gap${p}`).remove();
  });

  ((worldContext.pack.states[stateId] as State).military ?? []).forEach((m: { i: number }) => {
    const id = `regiment${stateId}-${m.i}`;
    const index = (worldContext.notes as WorldNote[]).findIndex(n => n.id === id);
    if (index !== -1) worldContext.notes.splice(index, 1);
  });
  viewContext.armies.select(`g#army${stateId}`).remove();

  (worldContext.pack.states as State[]).forEach(state => {
    if (!state.i || state.removed || !state.neighbors) return;
    state.neighbors = state.neighbors.filter(n => n !== stateId);
  });

  (worldContext.pack.states as State[])[stateId] = { i: stateId, removed: true } as State;

  viewContext.debug.selectAll(".highlight").remove();

  if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);

  refreshStatesEditor();
}

function showStatesChart(): void {
  const statesData = (worldContext.pack.states as State[]).filter(s => !s.removed);
  if (statesData.length < 2) {
    tip("There are no states to show", false, "error");
    return;
  }

  const root = d3
    .stratify<State>()
    .id(d => String(d.i))
    .parentId(d => (d.i ? "0" : null))(statesData)
    .sum(d => d.area ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const size = 150 + 200 * useOptionsState.getState().uiSize;
  const margin = { top: 0, right: -50, bottom: 0, left: -50 };
  const w = +size - margin.left - margin.right;
  const h = +size - margin.top - margin.bottom;
  const treeLayout = d3.pack<State>().size([w, h]).padding(3);

  alertMessage.innerHTML = /* html */ `<select id="statesTreeType" style="display:block; margin-left:13px; font-size:11px">
    <option value="area" selected>Area</option>
    <option value="population">Total population</option>
    <option value="rural">Rural population</option>
    <option value="urban">Urban population</option>
    <option value="burgs">Burgs number</option>
  </select>`;
  alertMessage.innerHTML += `<div id='statesInfo' class='chartInfo'>&#8205;</div>`;

  const chartSvg = d3
    .select("#alertMessage")
    .insert("svg", "#statesInfo")
    .attr("id", "statesTree")
    .attr("width", size)
    .attr("height", size)
    .style("font-family", "Almendra SC")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central");
  const graph = chartSvg.append("g").attr("transform", `translate(-50, 0)`);
  document.getElementById("statesTreeType")!.addEventListener("change", updateChart);

  treeLayout(root);

  type HPNode = d3.HierarchyCircularNode<State>;
  const leaves = root.leaves() as unknown as HPNode[];
  const node = graph
    .selectAll<SVGGElement, HPNode>("g")
    .data(leaves)
    .enter()
    .append("g")
    .attr("transform", (d: HPNode) => `translate(${d.x},${d.y})`)
    .attr("data-id", (d: HPNode) => d.data.i)
    .on("mouseenter", (event: MouseEvent, d: HPNode) => showInfo(event, d))
    .on("mouseleave", (event: MouseEvent) => hideInfo(event));

  node
    .append("circle")
    .attr("fill", (d: HPNode) => d.data.color ?? "")
    .attr("r", (d: HPNode) => d.r);

  const exp = /(?=[A-Z][^A-Z])/g;
  const lp = (n: string) => d3.max(n.split(exp).map(p => p.length))! + 1;

  node
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .style("font-size", (d: HPNode) => `${rn((d.r ** 0.97 * 4) / lp(d.data.name), 2)}px`)
    .selectAll<SVGTSpanElement, string>("tspan")
    .data((d: HPNode) => d.data.name.split(exp))
    .join("tspan")
    .attr("x", 0)
    .text((d: string) => d)
    .attr("dy", (_d: string, i: number, n: ArrayLike<SVGTSpanElement>) => `${i ? 1 : (n.length - 1) / -2}em`);

  function showInfo(ev: MouseEvent, d: HPNode): void {
    const circle = (ev.target as Element).querySelector("circle");
    if (circle) circle.classList.add("selected");
    const state = d.data.fullName;

    const area = `${getArea(d.data.area ?? 0)} ${getAreaUnit()}`;
    const rural = rn((d.data.rural ?? 0) * worldContext.populationRate);
    const urban = rn((d.data.urban ?? 0) * worldContext.populationRate * worldContext.urbanization);

    const option = (document.getElementById("statesTreeType") as HTMLSelectElement).value;
    const value =
      option === "area"
        ? `Area: ${area}`
        : option === "rural"
          ? `Rural population: ${si(rural)}`
          : option === "urban"
            ? `Urban population: ${si(urban)}`
            : option === "burgs"
              ? `Burgs number: ${d.data.burgs}`
              : `Population: ${si(rural + urban)}`;

    document.getElementById("statesInfo")!.innerHTML = `${state}. ${value}`;
    stateHighlightOn(ev);
  }

  function hideInfo(ev: MouseEvent): void {
    stateHighlightOff();
    const statesInfoEl = document.getElementById("statesInfo");
    if (!statesInfoEl) return;
    statesInfoEl.innerHTML = "&#8205;";
    const circle = (ev.target as Element).querySelector("circle");
    if (circle) circle.classList.remove("selected");
  }

  function updateChart(this: HTMLSelectElement): void {
    const accessor: (d: State) => number =
      this.value === "area"
        ? d => d.area ?? 0
        : this.value === "rural"
          ? d => d.rural ?? 0
          : this.value === "urban"
            ? d => d.urban ?? 0
            : this.value === "burgs"
              ? d => d.burgs ?? 0
              : d => (d.rural ?? 0) + (d.urban ?? 0);

    root.sum(accessor);
    node.data(treeLayout(root).leaves() as unknown as HPNode[]);

    node
      .transition()
      .duration(1500)
      .attr("transform", (d: HPNode) => `translate(${d.x},${d.y})`);
    node
      .select("circle")
      .transition()
      .duration(1500)
      .attr("r", (d: HPNode) => d.r);
    node
      .select("text")
      .transition()
      .duration(1500)
      .style("font-size", (d: HPNode) => `${rn((d.r ** 0.97 * 4) / lp(d.data.name), 2)}px`);
  }

  openRichDialog({
    content: alertMessage.innerHTML,
    title: "States bubble chart",
    width: fitContent(),
    position: { my: "left bottom", at: "left+10 bottom-10", of: "svg" },
    buttons: {},
    onClose: () => {
      alertMessage.innerHTML = "";
    }
  });
}

function recalculateStates(must?: boolean): void {
  if (!must && !getStatesEditorState().autoChange) return;

  const state = getWorldState();
  States.expandStates(worldContext, viewContext, appServices);
  Provinces.generate(worldContext, viewContext, appServices, state);
  Provinces.getPoles(state);
  States.getPoles(state);

  if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (getStatesEditorState().adjustLabels) drawStateLabels(worldContext, viewContext, appServices);

  refreshStatesEditor();
}

function randomizeStatesExpansion(): void {
  (worldContext.pack.states as State[]).forEach(s => {
    if (!s.i || s.removed) return;
    s.expansionism = rn(Math.random() * 4 + 1, 1);
  });
  recalculateStates(true);
}

function enterStatesManualAssignent(): void {
  if (!layerIsOn("toggleStates")) toggleStates();
  viewContext.customization = 2;
  viewContext.statesBody.append("g").attr("id", "temp");
  viewContext.statesHalo.node()!.style.display = "none";

  const firstState = (worldContext.pack.states as State[]).find(s => s.i && !s.removed);
  setStatesEditorState({ customizationMode: 1, manualSelectedStateId: firstState?.i ?? 0 });

  tip("Click on state to select, drag the circle to change state", true);
  viewContext.viewbox
    .style("cursor", "crosshair")
    .on("click", selectStateOnMapClick)
    .call(d3.drag<SVGGElement, unknown>().on("start", dragStateBrushStart).on("drag", dragStateBrush))
    .on("touchmove mousemove", moveStateBrush);

  statesManualHistory.reset();
}

function selectStateOnMapClick(this: SVGElement, event: MouseEvent): void {
  const point = d3.pointer(event, this);
  const i = findCell(point[0], point[1]);
  if (worldContext.pack.cells.h[i] < 20) return;

  const assigned = viewContext.statesBody.select("#temp").select(`polygon[data-cell='${i}']`);
  const state = assigned.size() ? +assigned.attr("data-state") : worldContext.pack.cells.state[i];
  setStatesEditorState({ manualSelectedStateId: state });
}

function dragStateBrushStart(): void {
  saveStatesManualSnapshot();
}

function dragStateBrush(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
  if (!event.dx && !event.dy) return;
  const r = getStatesEditorState().brushSize;
  const p = d3.pointer(event, this);
  EditorBus.moveCircle(p[0], p[1], r);

  const found = r > 5 ? findAll(p[0], p[1], r) : [findCell(p[0], p[1])];
  const selection = found.filter(i => isLand(i, worldContext.pack));
  if (selection) changeStateForSelection(selection);
}

function changeStateForSelection(selection: number[]): void {
  const temp = viewContext.statesBody.select("#temp");

  const { manualSelectedStateId: stateNew, protectExisting: preventOverwrite } = getStatesEditorState();
  const color = (worldContext.pack.states[stateNew] as State).color || "#ffffff";

  selection.forEach((i: number) => {
    const exists = temp.select(`polygon[data-cell='${i}']`);
    const stateOld = exists.size() ? +exists.attr("data-state") : worldContext.pack.cells.state[i];
    if (stateNew === stateOld) return;
    if (preventOverwrite && stateOld) return;
    if (i === (worldContext.pack.states[stateOld] as State).center) return;

    if (exists.size()) exists.attr("data-state", stateNew).attr("fill", color).attr("stroke", color);
    else
      temp
        .append("polygon")
        .attr("data-cell", i)
        .attr("data-state", stateNew)
        .attr("points", getPackPolygon(i, worldContext.pack).join(" "))
        .attr("fill", color)
        .attr("stroke", color);
  });
}

function moveStateBrush(this: SVGElement, event: MouseEvent): void {
  showMainTip();
  const point = d3.pointer(event, this);
  const radius = getStatesEditorState().brushSize;
  EditorBus.moveCircle(point[0], point[1], radius);
}

function applyStatesManualAssignent(): void {
  const { cells } = worldContext.pack;
  const affectedStates: number[] = [];
  const affectedProvinces: number[] = [];

  viewContext.statesBody
    .select("#temp")
    .selectAll<SVGPolygonElement, unknown>("polygon")
    .each(function () {
      const i = +this.dataset.cell!;
      const c = +this.dataset.state!;
      affectedStates.push(cells.state[i], c);
      affectedProvinces.push(cells.province[i]);
      cells.state[i] = c;
      if (cells.burg[i]) (worldContext.pack.burgs as Burg[])[cells.burg[i]].state = c;
    });

  if (affectedStates.length) {
    refreshStatesEditor();
    States.getPoles(getWorldState());
    layerIsOn("toggleStates") ? StatesRenderer.render(worldContext, viewContext, appServices) : toggleStates();
    if (getStatesEditorState().adjustLabels)
      drawStateLabels(worldContext, viewContext, appServices, [...new Set(affectedStates)]);
    adjustProvinces([...new Set(affectedProvinces)]);
    layerIsOn("toggleBorders") ? BordersRenderer.render(worldContext, viewContext, appServices) : toggleBorders();
    if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  }

  exitStatesManualAssignment(false);
}

function adjustProvinces(affectedProvinces: number[]): void {
  const { cells, provinces, states, burgs } = worldContext.pack;

  affectedProvinces.forEach((provinceId: number) => {
    if (!provinces[provinceId]) return;

    const provCells = Array.from(cells.i.filter((i: number) => cells.province[i] === provinceId));
    const provStates = [...new Set(provCells.map((i: number) => cells.state[i]))];

    if (provinceId && provStates.length === 1) {
      changeProvinceOwner(provinceId, provStates[0] as number, provCells);
      return;
    }

    splitProvince(provinceId, provStates as number[], provCells);
  });

  function changeProvinceOwner(provinceId: number, newOwnerId: number, provinceCells: number[]): void {
    const province = (provinces as Province[])[provinceId];
    const prevOwner = (states as State[])[province.state];

    prevOwner.provinces = (prevOwner.provinces ?? []).filter(p => p !== provinceId);

    if (newOwnerId) {
      province.state = newOwnerId;
      (states as State[])[newOwnerId].provinces!.push(provinceId);
    } else {
      (provinces as Province[])[provinceId] = { i: provinceId, removed: true } as Province;
      provinceCells.forEach((i: number) => {
        cells.province[i] = 0;
      });
    }
  }

  function splitProvince(provinceId: number, provinceStates: number[], provinceCells: number[]): void {
    const province = (provinces as Province[])[provinceId];
    const prevOwner = (states as State[])[province.state];
    const provinceCenterOwner = cells.state[province.center];

    provinceStates.forEach((stateId: number) => {
      const stateProvinceCells = provinceCells.filter((i: number) => cells.state[i] === stateId);

      if (stateId === provinceCenterOwner) {
        if (stateId === prevOwner.i) return;

        if (!stateId) {
          (provinces as Province[])[provinceId] = { i: provinceId, removed: true } as Province;
          stateProvinceCells.forEach((i: number) => {
            cells.province[i] = 0;
          });
          return;
        }

        prevOwner.provinces = (prevOwner.provinces ?? []).filter(p => p !== provinceId);
        province.state = stateId;
        province.color = getMixedColor((states as State[])[stateId].color ?? "");
        (states as State[])[stateId].provinces!.push(provinceId);
        return;
      }

      if (!stateId) {
        stateProvinceCells.forEach((i: number) => {
          cells.province[i] = 0;
        });
        return;
      }

      if (stateProvinceCells.length < 20) {
        const closestProvince = findClosestProvince(provinceId, stateId, stateProvinceCells);
        if (closestProvince) {
          stateProvinceCells.forEach((i: number) => {
            cells.province[i] = closestProvince;
          });
          return;
        }
      }

      createProvince(province, stateId, stateProvinceCells);
    });
  }

  function createProvince(oldProvince: Province, stateId: number, provinceCells: number[]): void {
    const newProvinceId = (provinces as Province[]).length;
    const burgCell = provinceCells.find((i: number) => cells.burg[i]);
    const center = burgCell ?? provinceCells[0];
    const burgId = burgCell ? cells.burg[burgCell] : 0;
    const burg = burgId ? (burgs as Burg[])[burgId] : null;
    const culture = cells.culture[center];

    const nameByBurg = burgCell && P(0.5);
    const name = nameByBurg
      ? (burg?.name ?? "")
      : oldProvince.name ||
        Names.getState(Names.getCultureShort(worldContext, viewContext, appServices, culture), culture);

    const formOptions = ["Zone", "Area", "Territory", "Province"];
    const formName = burgCell && oldProvince.formName ? oldProvince.formName : ra(formOptions);

    const color = getMixedColor((states as State[])[stateId].color ?? "");

    const kinship = nameByBurg ? 0.8 : 0.4;
    const type = Burgs.getType(center, burg?.port);
    const coa = COA.generate(burg?.coa || (states as State[])[stateId].coa, kinship, burg ? null : 0.9, type);
    coa.shield = COA.getShield(culture, stateId);

    (provinces as Province[]).push({
      i: newProvinceId,
      state: stateId,
      center,
      burg: burgId,
      name,
      formName,
      fullName: `${name} ${formName}`,
      color,
      coa
    } as Province);

    provinceCells.forEach((i: number) => {
      cells.province[i] = newProvinceId;
    });
    (states as State[])[stateId].provinces!.push(newProvinceId);
  }

  function findClosestProvince(provinceId: number, stateId: number, sourceCells: number[]): number | undefined {
    const borderCell = sourceCells.find((i: number) =>
      (cells.c[i] as number[]).some((c: number) => {
        return cells.state[c] === stateId && cells.province[c] && cells.province[c] !== provinceId;
      })
    );

    return (
      borderCell &&
      (cells.c[borderCell] as number[]).map((c: number) => cells.province[c]).find((p: number) => p && p !== provinceId)
    );
  }
}

function exitStatesManualAssignment(_close: boolean): void {
  viewContext.customization = 0;
  statesManualHistory.reset();
  viewContext.statesBody.select("#temp").remove();
  EditorBus.removeCircle();
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  viewContext.statesHalo.node()!.style.display = "block";
  setStatesEditorState({ customizationMode: 0, manualSelectedStateId: 0 });
}

function saveStatesManualSnapshot(): void {
  const temp = viewContext.statesBody.select("#temp").node() as Element | null;
  if (!temp) return;
  statesManualHistory.push(temp.innerHTML);
}

function undoStatesManualAssignment(): void {
  const temp = viewContext.statesBody.select("#temp").node() as Element | null;
  if (!temp || !statesManualHistory.canUndo) return;
  temp.innerHTML = statesManualHistory.pop() ?? "";
}

function addState(this: SVGElement, event: MouseEvent): void {
  const { cells, states, burgs } = worldContext.pack;
  const point = d3.pointer(event, this);
  const center = findCell(point[0], point[1]);
  if (cells.h[center] < 20) {
    tip("You cannot place state into the water. Please click on a land cell", false, "error");
    return;
  }

  let burgId = cells.burg[center];
  if (burgId && (burgs as Burg[])[burgId].capital) {
    tip("Existing capital cannot be selected as a new state capital! Select other cell", false, "error");
    return;
  }

  if (!burgId) {
    const { burgId: addedId, newRoute } = Burgs.add(point);
    burgId = addedId;
    const addedBurg = (burgs as Burg[])[burgId];
    drawBurgIcon(worldContext, viewContext, appServices, addedBurg);
    drawBurgLabel(worldContext, viewContext, appServices, addedBurg);
    if (newRoute && layerIsOn("toggleRoutes")) drawRoute(worldContext, viewContext, appServices, newRoute);
  }

  const oldState = cells.state[center];
  const newState = (states as State[]).length;

  (burgs as Burg[])[burgId].capital = 1;
  (burgs as Burg[])[burgId].state = newState;
  Burgs.changeGroup((burgs as Burg[])[burgId]);
  drawBurgIcon(worldContext, viewContext, appServices, (burgs as Burg[])[burgId]);
  drawBurgLabel(worldContext, viewContext, appServices, (burgs as Burg[])[burgId]);

  if (event.shiftKey === false) exitAddStateMode();

  const culture = cells.culture[center];
  const basename = center % 5 === 0 ? ((burgs as Burg[])[burgId].name ?? "") : Names.getCulture(culture);
  const name = Names.getState(basename, culture);
  const color = getRandomColor();

  const cultureType = (worldContext.pack.cultures as Culture[])[culture].type;
  const coa = COA.generate((burgs as Burg[])[burgId].coa ?? null, 0.4, null, cultureType);
  coa.shield = COA.getShield(culture);

  const statesArr = states as State[];
  const diplomacy = statesArr.map(s => {
    if (!s.i || s.removed) return "x";
    if (!oldState) {
      s.diplomacy!.push("Neutral");
      return "Neutral";
    }

    let relations = statesArr[oldState].diplomacy![s.i];
    if (s.i === oldState) relations = "Enemy";
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
  statesArr[0].diplomacy!.push(`${name} declared its independance from ${statesArr[oldState].name}`);

  cells.state[center] = newState;
  cells.province[center] = 0;

  statesArr.push({
    i: newState,
    name,
    diplomacy,
    provinces: [],
    color,
    expansionism: 0.5,
    capital: burgId,
    type: "Generic",
    center,
    culture,
    military: [],
    alert: 1,
    coa
  } as State);

  const state = getWorldState();
  States.getPoles(state);
  States.findNeighbors();
  States.collectStatistics(state);
  States.defineStateForms(state, [newState]);
  adjustProvinces([cells.province[center]]);

  drawStateLabels(worldContext, viewContext, appServices, [newState]);
  COArenderer.add("state", newState, coa as RendererEmblem, statesArr[newState].pole![0], statesArr[newState].pole![1]);

  layerIsOn("toggleProvinces") && toggleProvinces();
  layerIsOn("toggleStates") ? StatesRenderer.render(worldContext, viewContext, appServices) : toggleStates();
  layerIsOn("toggleBorders") ? BordersRenderer.render(worldContext, viewContext, appServices) : toggleBorders();

  refreshStatesEditor();
}

function exitAddStateMode(): void {
  viewContext.customization = 0;
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  setStatesEditorState({ customizationMode: 0 });
}

function openStateMergeDialog(): void {
  const validStates = (worldContext.pack.states as State[])
    .filter(s => s.i && !s.removed)
    .map(s => ({
      i: s.i,
      name: s.name,
      fullName: s.fullName ?? s.name,
      color: s.color ?? "#666"
    }));
  setStatesEditorState({ mergeDialog: validStates });
}

function mergeStates(statesToMerge: number[], rulingStateId: number): void {
  const rulingState = worldContext.pack.states[rulingStateId] as State;
  const rulingStateArmy = document.getElementById(`army${rulingStateId}`)!;

  statesToMerge.forEach((stateId: number) => {
    const state = worldContext.pack.states[stateId] as State;
    state.removed = true;

    viewContext.statesBody.select(`#state${stateId}`).remove();
    viewContext.statesBody.select(`#state-gap${stateId}`).remove();
    viewContext.statesHalo.select(`#state-border${stateId}`).remove();
    viewContext.labels.select(`#stateLabel${stateId}`).remove();
    viewContext.defs.select(`#textPath_stateLabel${stateId}`).remove();

    document.getElementById(`stateCOA${stateId}`)?.remove();
    viewContext.emblems.select(`#stateEmblems > use[data-i='${stateId}']`).remove();

    (state.military ?? []).forEach((regiment: MilitaryRegiment) => {
      const oldId = `regiment${stateId}-${regiment.i}`;
      const newIndex = (rulingState.military ?? []).length;
      rulingState.military ??= [];
      rulingState.military.push({ ...regiment, i: newIndex });
      const newId = `regiment${rulingStateId}-${newIndex}`;

      const note = (worldContext.notes as WorldNote[]).find(n => n.id === oldId);
      if (note) note.id = newId;

      const element = document.getElementById(oldId);
      if (element) {
        element.id = newId;
        element.dataset.state = String(rulingStateId);
        element.dataset.id = String(newIndex);
        rulingStateArmy.appendChild(element);
      }
    });

    viewContext.armies.select(`g#army${stateId}`).remove();
  });

  (worldContext.pack.burgs as Burg[]).forEach(burg => {
    if (statesToMerge.includes(burg.state ?? -1)) {
      if (burg.capital) {
        burg.capital = 0;
        Burgs.changeGroup(burg);
      }
      burg.state = rulingStateId;
    }
  });
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) BurgLabelsRenderer.render(worldContext, viewContext, appServices);

  (worldContext.pack.provinces as Province[]).forEach(province => {
    if (province.i && !province.removed && statesToMerge.includes(province.state)) province.state = rulingStateId;
  });

  Array.from(worldContext.pack.cells.state).forEach((s: number, i: number) => {
    if (statesToMerge.includes(s)) worldContext.pack.cells.state[i] = rulingStateId;
  });

  EditorBus.unfog();
  viewContext.debug.selectAll(".highlight").remove();

  States.getPoles(getWorldState());
  layerIsOn("toggleStates") ? StatesRenderer.render(worldContext, viewContext, appServices) : toggleStates();
  layerIsOn("toggleBorders") ? BordersRenderer.render(worldContext, viewContext, appServices) : toggleBorders();
  layerIsOn("toggleProvinces") && ProvincesRenderer.render(worldContext, viewContext, appServices);
  drawStateLabels(worldContext, viewContext, appServices, [rulingStateId]);

  refreshStatesEditor();
}

function downloadStatesCsv(): void {
  const unit = getAreaUnit("2");
  const headers = `Id,State,Full Name,Form,Color,Capital,Culture,Type,Expansionism,Cells,Burgs,Area ${unit},Total Population,Rural Population,Urban Population`;
  const { states } = getStatesEditorState();
  const data = states.map(s => {
    const packState = worldContext.pack.states[s.i] as State;
    return [
      s.i,
      s.name,
      packState.fullName ?? "",
      s.form,
      s.color,
      s.capitalName,
      s.cultureName,
      s.type,
      s.expansionism,
      s.cells,
      s.burgs,
      s.area,
      s.population,
      Math.round(s.rural),
      Math.round(s.urban)
    ].join(",");
  });
  const csvData = [headers].concat(data).join("\n");

  const name = `${getFileName("States")}.csv`;
  downloadFile(csvData, name);
}

export function initStatesEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
