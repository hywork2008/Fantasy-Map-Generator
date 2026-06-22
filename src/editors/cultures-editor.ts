import * as d3 from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import {
  clearLegend,
  confirmationDialog,
  downloadFile,
  drawLegend,
  getFileName,
  highlightElement,
  moveCircle,
  restoreDefaultEvents
} from "../controllers/editors";
import { type HierarchyElement, open as openHierarchyTree } from "../controllers/hierarchy-tree";
import { interactionManager } from "../controllers/interactionManager";
import { toggleBiomes, toggleCultures, toggleProvinces, toggleReligions, toggleStates } from "../controllers/layers";
import { editStyle } from "../controllers/style";
import { BrushHistoryClass as BrushHistory } from "../editors/BrushHistory";
import type { Burg } from "../modules/burgs-generator";
import type { Culture, CultureType } from "../modules/cultures-generator";
import { Cultures } from "../modules/cultures-generator";
import { COA } from "../modules/emblem/generator";
import type { NameBase } from "../modules/names-generator";
import { Names } from "../modules/names-generator";
import type { Province } from "../modules/provinces-generator";
import type { State } from "../modules/states-generator";
import { CulturesRenderer, PopulationRenderer } from "../renderers";
import { COArenderer, type Emblem as RendererEmblem } from "../renderers/emblem-renderer";
import type { CultureRowData, NameBaseOption } from "../store/culturesEditorState";
import { getCulturesEditorState, setCulturesEditorState } from "../store/culturesEditorState";
import { closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { abbreviate, debounce, findAll, findCell, parseTransform, rn, si } from "../utils";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, getArea, getAreaUnit, removeCircle, showMainTip, tip } from "../utils/uiHelpers";
import { NamesbaseEditor } from "./namesbase-editor";

const cultureTypes = ["Generic", "River", "Lake", "Naval", "Nomadic", "Hunting", "Highland"];

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

const culturesManualHistory = new BrushHistory();

export function initCulturesEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}

export function open(): void {
  closeDialogs("#culturesEditor, .stable");
  if (!layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleReligions")) toggleReligions();
  if (layerIsOn("toggleProvinces")) toggleProvinces();

  setCulturesEditorState({ isOpen: true });
  culturesEditorActions.refresh();
  drawCultureCenters();

  openDialog("culturesEditor", {
    title: "Cultures Editor",
    resizable: false,
    close: closeCulturesEditor,
    position: { my: "right top", at: "right-10 top+10", of: "svg" }
  });
}

function closeCulturesEditor(): void {
  setCulturesEditorState({ isOpen: false });
  viewContext.debug.select("#cultureCenters").remove();
  exitCulturesManualAssignment();
  exitAddCultureMode();
}

function recalculateCultures(force?: boolean): void {
  const { autoChange } = getCulturesEditorState();
  if (!force && !autoChange) return;

  Cultures.expand(getWorldState());
  CulturesRenderer.render(worldContext, viewContext, appServices);
  worldContext.pack.burgs.forEach((b: Burg) => {
    b.culture = worldContext.pack.cells.culture[b.cell];
  });
  culturesEditorActions.refresh();
}

export const culturesEditorActions = {
  refresh(): void {
    const { cells, cultures, burgs } = worldContext.pack;

    (cultures as Culture[]).forEach((c: Culture) => {
      c.cells = c.area = c.rural = c.urban = 0;
    });

    for (const i of cells.i) {
      if (cells.h[i] < 20) continue;
      const cultureId = cells.culture[i];
      const cul = cultures[cultureId] as Culture;
      cul.cells = (cul.cells ?? 0) + 1;
      cul.area = (cul.area ?? 0) + cells.area[i];
      cul.rural = (cul.rural ?? 0) + cells.pop[i];
      const burgId = cells.burg[i];
      if (burgId) cul.urban = (cul.urban ?? 0) + ((burgs[burgId] as Burg).population ?? 0);
    }

    let totalArea = 0;
    let totalPopulation = 0;
    const totalCells = Array.from(cells.h).filter((h: number) => h >= 20).length;

    const rowData: CultureRowData[] = (cultures as Culture[])
      .filter((c: Culture) => !c.removed)
      .map((c: Culture) => {
        const area = getArea(c.area ?? 0);
        const rural = (c.rural ?? 0) * worldContext.populationRate;
        const urban = (c.urban ?? 0) * worldContext.populationRate * worldContext.urbanization;
        const population = rn(rural + urban);

        totalArea += area;
        totalPopulation += population;

        return {
          i: c.i,
          name: c.name,
          color: c.color ?? "",
          type: c.type ?? "",
          base: c.base,
          cells: c.cells ?? 0,
          expansionism: c.expansionism ?? 0,
          area,
          population,
          rural,
          urban,
          shield: c.shield ?? "heater",
          lock: c.lock
        };
      });

    const emblemShapeGroup = document.getElementById("emblemShape") as HTMLSelectElement | null;
    const selectedGroup = emblemShapeGroup?.selectedOptions[0]?.parentNode as HTMLOptGroupElement | null;
    const selectShape = selectedGroup?.label === "Diversiform";

    const nameBases: NameBaseOption[] = (worldContext.nameBases as NameBase[]).map((n, i) => ({ i, name: n.name }));

    setCulturesEditorState({
      cultures: rowData,
      nameBases,
      totalCells,
      totalArea,
      totalPopulation,
      selectShape
    });
  },

  changeSort(sortBy: string): void {
    const state = getCulturesEditorState();
    if (state.sortBy === sortBy) {
      setCulturesEditorState({ sortDirection: state.sortDirection * -1 });
    } else {
      setCulturesEditorState({ sortBy, sortDirection: 1 });
    }
  },

  togglePercentageMode(): void {
    setCulturesEditorState(s => ({ isPercentageMode: !s.isPercentageMode }));
  },

  setAutoChange(autoChange: boolean): void {
    setCulturesEditorState({ autoChange });
  },

  editStyle(): void {
    editStyle("cults");
  },

  toggleLegend(): void {
    if (viewContext.legend.selectAll("*").size()) {
      clearLegend();
      return;
    }

    const data = (worldContext.pack.cultures as Culture[])
      .filter((c: Culture) => c.i && !c.removed && c.cells)
      .sort((a: Culture, b: Culture) => (b.area ?? 0) - (a.area ?? 0))
      .map((c: Culture) => [c.i, c.color, c.name] as [number, string, string]);
    drawLegend("Cultures", data);
  },

  showHierarchy(): void {
    if (viewContext.customization) return;

    const getDescription = (culture: HierarchyElement) => {
      const { name, type, rural, urban } = culture as HierarchyElement & {
        type: string;
        rural: number;
        urban: number;
      };
      const population =
        (rural ?? 0) * worldContext.populationRate +
        (urban ?? 0) * worldContext.populationRate * worldContext.urbanization;
      const populationText = population > 0 ? `${si(rn(population))} people` : "Extinct";
      return `${name} culture. ${type}. ${populationText}`;
    };

    const getShape = ({ type }: HierarchyElement) => {
      if (type === "Generic") return "circle";
      if (type === "River") return "diamond";
      if (type === "Lake") return "hexagon";
      if (type === "Naval") return "square";
      if (type === "Highland") return "concave";
      if (type === "Nomadic") return "octagon";
      if (type === "Hunting") return "pentagon";
      return undefined;
    };

    openHierarchyTree({
      type: "cultures",
      data: worldContext.pack.cultures as unknown as HierarchyElement[],
      onNodeEnter: (event: { id?: string | number | null }) => cultureHighlightOn({ id: event.id }),
      onNodeLeave: (event: { id?: string | number | null }) => cultureHighlightOff({ id: event.id }),
      getDescription,
      getShape
    });
  },

  recalculateCultures(): void {
    recalculateCultures(true);
  },

  changeName(i: number, name: string): void {
    const c = worldContext.pack.cultures[i] as Culture;
    c.name = name;
    c.code = abbreviate(
      name,
      (worldContext.pack.cultures as Culture[]).map((cu: Culture) => cu.code ?? "")
    );
    culturesEditorActions.refresh();
  },

  regenerateName(i: number): void {
    const base = (worldContext.pack.cultures[i] as Culture).base;
    if (!worldContext.nameBases[base]) {
      tip("Namesbase is not defined, please select a valid namesbase", false, "error", 5000);
      return;
    }
    const name = Names.getCultureShort(worldContext, viewContext, appServices, i);
    (worldContext.pack.cultures[i] as Culture).name = name;
    culturesEditorActions.refresh();
  },

  changeFill(i: number): void {
    const c = worldContext.pack.cultures[i] as Culture;
    openPicker(c.color ?? "#ffffff", (newFill: string) => {
      c.color = newFill;
      viewContext.cults.select(`#culture${i}`).attr("fill", newFill);
      viewContext.debug.select(`#cultureCenter${i}`).attr("fill", newFill);
      culturesEditorActions.refresh();
    });
  },

  changeType(i: number, type: string): void {
    (worldContext.pack.cultures[i] as Culture).type = type as CultureType;
    recalculateCultures();
  },

  changeBase(i: number, base: number): void {
    (worldContext.pack.cultures[i] as Culture).base = base;
    culturesEditorActions.refresh();
  },

  changeExpansionism(i: number, expansionism: number): void {
    (worldContext.pack.cultures[i] as Culture).expansionism = expansionism;
    recalculateCultures();
  },

  changeEmblemsShape(i: number, shape: string): void {
    (worldContext.pack.cultures[i] as Culture).shield = shape;

    const rerenderCOA = (id: string, coa: unknown) => {
      const $coa = document.getElementById(id);
      if (!$coa) return;
      $coa.remove();
      COArenderer.trigger(id, coa as RendererEmblem);
    };

    (worldContext.pack.states as State[]).forEach((state: State) => {
      if (state.culture !== i || !state.i || state.removed || !state.coa || state.coa.custom) return;
      if (shape === state.coa.shield) return;
      state.coa.shield = shape;
      rerenderCOA(`stateCOA${state.i}`, state.coa);
    });

    (worldContext.pack.provinces as Province[]).forEach((province: Province) => {
      if (
        worldContext.pack.cells.culture[province.center] !== i ||
        !province.i ||
        province.removed ||
        !province.coa ||
        province.coa.custom
      )
        return;
      if (shape === province.coa.shield) return;
      province.coa.shield = shape;
      rerenderCOA(`provinceCOA${province.i}`, province.coa);
    });

    (worldContext.pack.burgs as Burg[]).forEach((burg: Burg) => {
      if (burg.culture !== i || !burg.i || burg.removed || !burg.coa || burg.coa.custom) return;
      if (shape === burg.coa.shield) return;
      burg.coa.shield = shape;
      rerenderCOA(`burgCOA${burg.i}`, burg.coa);
    });

    culturesEditorActions.refresh();
  },

  changePopulation(i: number): void {
    const culture = worldContext.pack.cultures[i] as Culture;
    if (!culture.cells) {
      tip("Culture does not have any cells, cannot change population", false, "error");
      return;
    }

    const rural = rn((culture.rural ?? 0) * worldContext.populationRate);
    const urban = rn((culture.urban ?? 0) * worldContext.populationRate * worldContext.urbanization);
    const total = rural + urban;
    const format = (n: number) => Number(n).toLocaleString();
    const burgList = (worldContext.pack.burgs as Burg[]).filter((b: Burg) => !b.removed && b.culture === i);

    const content = /* html */ `<div>
      <i>Change population of all cells assigned to the culture</i>
      <div style="margin: 0.5em 0">
        Rural: <input type="number" min="0" step="1" id="ruralPop" value=${rural} style="width:6em" />
        Urban: <input type="number" min="0" step="1" id="urbanPop" value=${urban} style="width:6em"
          ${burgList.length ? "" : "disabled"} />
      </div>
      <div>Total population: ${format(total)} ⇒ <span id="totalPop">${format(total)}</span>
        (<span id="totalPopPerc">100</span>%)
      </div>
    </div>`;

    openRichDialog({
      content,
      resizable: false,
      title: "Change culture population",
      width: "24em",
      buttons: {
        Apply: () => {
          const getRuralPop = () => document.getElementById("ruralPop") as HTMLInputElement;
          const getUrbanPop = () => document.getElementById("urbanPop") as HTMLInputElement;
          applyPopulationChange(rural, urban, getRuralPop().value, getUrbanPop().value, i);
          import("../ui/dialogs/dialogService").then(({ closeDialog }) => closeDialog("richDialog"));
        },
        Cancel: () => {
          import("../ui/dialogs/dialogService").then(({ closeDialog }) => closeDialog("richDialog"));
        }
      },
      position: { my: "center", at: "center", of: "svg" },
      onOpen: () => {
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
        getRuralPop().oninput = update;
        getUrbanPop().oninput = update;
      }
    });
  },

  regenerateBurgs(i: number): void {
    if (viewContext.customization === 4) return;

    const base = (worldContext.pack.cultures[i] as Culture).base;
    if (!worldContext.nameBases[base]) {
      tip("Namesbase is not defined, please select a valid namesbase", false, "error", 5000);
      return;
    }

    const cultureBurgs = (worldContext.pack.burgs as Burg[]).filter(
      (b: Burg) => b.culture === i && !b.removed && !b.lock
    );
    cultureBurgs.forEach((b: Burg) => {
      b.name = Names.getCulture(i);
      viewContext.labels.select(`[data-id='${b.i}']`).text(b.name);
    });
    tip(`Names for ${cultureBurgs.length} burgs are regenerated`, false, "success");
  },

  cultureHighlightOn(i: number): void {
    cultureHighlightOn({ id: i });
  },

  cultureHighlightOff(i: number): void {
    cultureHighlightOff({ id: i });
  },

  selectCultureOnLineClick(i: number): void {
    if (viewContext.customization !== 4) return;
    setCulturesEditorState({ selectedCultureId: i });
  },

  highlightCulture(i: number): void {
    highlightElement(viewContext.cults.select(`#culture${i}`).node() as Element, 4);
  },

  triggerRemove(i: number): void {
    if (viewContext.customization) return;
    confirmationDialog({
      title: "Remove culture",
      message: "Are you sure you want to remove the culture? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => removeCulture(i)
    });
  },

  updateLockStatus(i: number): void {
    const c = worldContext.pack.cultures[i] as Culture;
    c.lock = !c.lock;
    culturesEditorActions.refresh();
  },

  enterCultureManualAssignment(): void {
    if (!layerIsOn("toggleCultures")) toggleCultures();
    viewContext.customization = 4;
    setCulturesEditorState({ customization: 4, selectedCultureId: 0 });

    viewContext.cults.append("g").attr("id", "temp");
    viewContext.debug.select("#cultureCenters").style("display", "none");

    tip("Click on culture to select, drag the circle to change culture", true);
    viewContext.viewbox
      .style("cursor", "crosshair")
      .on("click", selectCultureOnMapClick)
      .call(d3.drag<SVGGElement, unknown>().on("start", dragCultureBrushStart).on("drag", dragCultureBrush))
      .on("touchmove mousemove", moveCultureBrush);

    culturesManualHistory.reset();
  },

  exitCultureManualAssignment(): void {
    exitCulturesManualAssignment();
  },

  applyCultureManualAssignment(): void {
    const changed = viewContext.cults.select("#temp").selectAll<SVGPolygonElement, unknown>("polygon");
    changed.each(function (this: SVGPolygonElement) {
      const i = +this.dataset.cell!;
      const c = +this.dataset.culture!;
      worldContext.pack.cells.culture[i] = c;
      if (worldContext.pack.cells.burg[i]) worldContext.pack.burgs[worldContext.pack.cells.burg[i]].culture = c;
    });

    if (changed.size()) {
      CulturesRenderer.render(worldContext, viewContext, appServices);
      culturesEditorActions.refresh();
    }
    exitCulturesManualAssignment();
  },

  undoCultureManualAssignment(): void {
    const temp = viewContext.cults.select("#temp").node() as Element | null;
    if (!temp || !culturesManualHistory.canUndo) return;
    temp.innerHTML = culturesManualHistory.pop() ?? "";
  },

  changeBrushSize(size: number): void {
    setCulturesEditorState({ brushSize: size });
  },

  enterAddCulturesMode(): void {
    if (getCulturesEditorState().customization === 9) {
      exitAddCultureMode();
      return;
    }
    viewContext.customization = 9;
    setCulturesEditorState({ customization: 9 });
    tip("Click on the map to add a new culture", true);
    viewContext.viewbox.style("cursor", "crosshair");
    interactionManager.setClickHandler(addCulture);
  },

  downloadCulturesCsv(): void {
    const unit = getAreaUnit("2");
    const headers = `Id,Name,Color,Cells,Expansionism,Type,Area ${unit},Population,Namesbase,Emblems Shape,Origins`;

    const { cultures, nameBases } = getCulturesEditorState();
    const lines = cultures
      .filter(c => c.i)
      .map(c => {
        const namesbase = nameBases[c.base]?.name ?? "";
        const { origins } = worldContext.pack.cultures[c.i] as Culture;
        const originList = ((origins ?? []) as number[])
          .filter(o => o)
          .map((o: number) => (worldContext.pack.cultures[o] as Culture)?.name ?? "");
        const originText = `"${originList.join(", ")}"`;
        return [
          c.i,
          c.name,
          c.color,
          c.cells,
          c.expansionism,
          c.type,
          c.area,
          c.population,
          namesbase,
          c.shield,
          originText
        ].join(",");
      });

    const csvData = [headers].concat(lines).join("\n");
    downloadFile(csvData, `${getFileName("Cultures")}.csv`);
  },

  async uploadCulturesData(file: File): Promise<void> {
    const csv = await file.text();
    const data = d3.csvParse(csv, d => ({
      name: d.Name,
      i: +d.Id,
      color: d.Color,
      expansionism: +d.Expansionism,
      type: d.Type,
      population: +d.Population,
      emblemsShape: d["Emblems Shape"],
      origins: d.Origins ?? "",
      namesbase: d.Namesbase
    }));

    const { cultures, cells } = worldContext.pack;
    const shapes = Object.keys(COA.shields.types).flatMap((type: string) => Object.keys(COA.shields[type]));

    const populated = Array.from(cells.pop)
      .map((c: number, i: number) => (c ? i : null))
      .filter((c: number | null): c is number => c !== null);
    (cultures as Culture[]).forEach((item: Culture) => {
      if (item.i) item.removed = true;
    });

    for (const culture of data) {
      let current: Culture;
      if (culture.i < (cultures as Culture[]).length) {
        current = (cultures as Culture[])[culture.i];
        const ratio = (current.urban ?? 0) / ((current.rural ?? 0) + (current.urban ?? 0));
        applyPopulationChange(
          current.rural ?? 0,
          current.urban ?? 0,
          culture.population * (1 - ratio),
          culture.population * ratio,
          culture.i
        );
      } else {
        current = {
          i: (cultures as Culture[]).length,
          center: ra(populated),
          area: 0,
          cells: 0,
          origins: [0],
          rural: 0,
          urban: 0,
          name: "",
          base: 0,
          shield: "heater"
        };
        (cultures as Culture[]).push(current);
      }

      current.removed = false;
      current.name = culture.name ?? "";

      if (current.i) {
        current.code = abbreviate(
          current.name,
          (cultures as Culture[]).map((c: Culture) => c.code ?? "")
        );
        current.color = culture.color ?? "";
        current.expansionism = +culture.expansionism;
        if (cultureTypes.includes(culture.type!)) current.type = culture.type as CultureType;
        else current.type = "Generic" as CultureType;
      }

      const restoreOrigins = (originsString: string) => {
        const originNames = originsString
          .replaceAll('"', "")
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s);

        const originIds = originNames.map((name: string) => {
          const id = (cultures as Culture[]).findIndex((c: Culture) => c.name === name);
          return id === -1 ? null : id;
        });

        current.origins = originIds.filter((id: number | null) => id !== null) as number[];
        if (!current.origins.length) current.origins = [0];
      };

      restoreOrigins(culture.origins);
      current.shield = shapes.includes(culture.emblemsShape!) ? culture.emblemsShape! : "heater";
      current.base = (worldContext.nameBases as NameBase[]).findIndex((n: NameBase) => n.name === culture.namesbase);
    }

    (cultures as Culture[])
      .filter((c: Culture) => c.removed)
      .forEach((c: Culture) => {
        removeCulture(c.i);
      });

    CulturesRenderer.render(worldContext, viewContext, appServices);
    culturesEditorActions.refresh();
  },

  openNamesbaseEditor(): void {
    NamesbaseEditor.open();
  }
};

type HighlightEvent = { id?: string | number | null };

const cultureHighlightOn = debounce((event: HighlightEvent) => {
  const cultureId = Number(event.id);
  if (!layerIsOn("toggleCultures")) return;
  if (viewContext.customization) return;

  const animate = d3.transition().duration(2000).ease(d3.easeSinIn);
  viewContext.cults
    .select(`#culture${cultureId}`)
    .raise()
    .transition(animate)
    .attr("stroke-width", 2.5)
    .attr("stroke", "#d0240f");
  viewContext.debug
    .select(`#cultureCenter${cultureId}`)
    .raise()
    .transition(animate)
    .attr("r", 3)
    .attr("stroke", "#d0240f");
}, 200);

function cultureHighlightOff(event: HighlightEvent): void {
  const cultureId = Number(event.id);
  if (!layerIsOn("toggleCultures")) return;
  viewContext.cults.select(`#culture${cultureId}`).transition().attr("stroke-width", null).attr("stroke", null);
  viewContext.debug.select(`#cultureCenter${cultureId}`).transition().attr("r", 2).attr("stroke", null);
}

function applyPopulationChange(
  oldRural: number,
  oldUrban: number,
  newRural: string | number,
  newUrban: string | number,
  culture: number
): void {
  const ruralChange = +newRural / oldRural;
  if (Number.isFinite(ruralChange) && ruralChange !== 1) {
    const cells = worldContext.pack.cells.i.filter((i: number) => worldContext.pack.cells.culture[i] === culture);
    cells.forEach((i: number) => {
      worldContext.pack.cells.pop[i] *= ruralChange;
    });
  }
  if (!Number.isFinite(ruralChange) && +newRural > 0) {
    const points = +newRural / worldContext.populationRate;
    const cells = worldContext.pack.cells.i.filter((i: number) => worldContext.pack.cells.culture[i] === culture);
    const pop = rn(points / cells.length);
    cells.forEach((i: number) => {
      worldContext.pack.cells.pop[i] = pop;
    });
  }

  const burgList = (worldContext.pack.burgs as Burg[]).filter((b: Burg) => !b.removed && b.culture === culture);
  const urbanChange = +newUrban / oldUrban;
  if (Number.isFinite(urbanChange) && urbanChange !== 1) {
    burgList.forEach((b: Burg) => {
      b.population = rn((b.population ?? 0) * urbanChange, 4);
    });
  }
  if (!Number.isFinite(urbanChange) && +newUrban > 0) {
    const points = +newUrban / worldContext.populationRate / worldContext.urbanization;
    const population = rn(points / burgList.length, 4);
    burgList.forEach((b: Burg) => {
      b.population = population;
    });
  }

  if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
  culturesEditorActions.refresh();
}

function removeCulture(cultureId: number): void {
  viewContext.cults.select(`#culture${cultureId}`).remove();
  viewContext.debug.select(`#cultureCenter${cultureId}`).remove();

  const { burgs, states, cells, cultures } = worldContext.pack;

  (burgs as Burg[])
    .filter((b: Burg) => b.culture === cultureId)
    .forEach((b: Burg) => {
      b.culture = 0;
    });
  (states as State[]).forEach((s: State) => {
    if (s.culture === cultureId) s.culture = 0;
  });
  Array.from(cells.culture).forEach((c: number, i: number) => {
    if (c === cultureId) cells.culture[i] = 0;
  });
  (cultures as Culture[])[cultureId].removed = true;

  (cultures as Culture[])
    .filter((c: Culture) => c.i && !c.removed)
    .forEach((c: Culture) => {
      c.origins = (c.origins ?? []).filter((origin): origin is number => origin !== null && origin !== cultureId);
      if (!c.origins.length) c.origins = [0];
    });
  culturesEditorActions.refresh();
}

function drawCultureCenters(): void {
  const tooltip = "Drag to move the culture center (ancestral home)";
  viewContext.debug.select("#cultureCenters").remove();
  const cultureCenters = viewContext.debug
    .append("g")
    .attr("id", "cultureCenters")
    .attr("stroke-width", 0.8)
    .attr("stroke", "#444444")
    .style("cursor", "move");

  const data = (worldContext.pack.cultures as Culture[]).filter((c: Culture) => c.i && !c.removed);
  cultureCenters
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("id", (d: Culture) => `cultureCenter${d.i}`)
    .attr("data-id", (d: Culture) => d.i)
    .attr("r", 2)
    .attr("fill", (d: Culture) => d.color ?? "")
    .attr("cx", (d: Culture) => worldContext.pack.cells.p[d.center!][0])
    .attr("cy", (d: Culture) => worldContext.pack.cells.p[d.center!][1])
    .on("mouseenter", (_event: MouseEvent, d: Culture) => {
      tip(tooltip, true);
      cultureHighlightOn({ id: d.i });
    })
    .on("mouseleave", (_event: MouseEvent, d: Culture) => {
      tip("", true);
      cultureHighlightOff({ id: d.i });
    })
    .call(
      d3
        .drag<SVGCircleElement, Culture>()
        .on(
          "start",
          cultureCenterDragStart as (
            this: SVGCircleElement,
            event: d3.D3DragEvent<SVGCircleElement, Culture, unknown>
          ) => void
        )
        .on(
          "drag",
          cultureCenterDragDebounced as (
            this: SVGCircleElement,
            event: d3.D3DragEvent<SVGCircleElement, Culture, unknown>
          ) => void
        )
    );
}

let _ccdId = 0,
  _ccdX0 = 0,
  _ccdY0 = 0;

function cultureCenterDragStart(
  this: SVGCircleElement,
  event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>
): void {
  _ccdId = +this.id.slice(13);
  const tr = parseTransform(this.getAttribute("transform") ?? "");
  _ccdX0 = +tr[0] - event.x;
  _ccdY0 = +tr[1] - event.y;
}

function cultureCenterDragInner(
  this: SVGCircleElement,
  event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>
): void {
  const { x, y } = event;
  this.setAttribute("transform", `translate(${_ccdX0 + x},${_ccdY0 + y})`);
  const cell = findCell(x, y);
  if (worldContext.pack.cells.h[cell] < 20) return;

  (worldContext.pack.cultures[_ccdId] as Culture).center = cell;
  recalculateCultures();
}

const cultureCenterDragDebounced = debounce(cultureCenterDragInner, 50);

function selectCultureOnMapClick(this: SVGElement, event: MouseEvent): void {
  const point = d3.pointer(event, this);
  const i = findCell(point[0], point[1]);
  if (worldContext.pack.cells.h[i] < 20) return;

  const assigned = viewContext.cults.select("#temp").select(`polygon[data-cell='${i}']`);
  const culture = assigned.size() ? +assigned.attr("data-culture") : worldContext.pack.cells.culture[i];
  setCulturesEditorState({ selectedCultureId: culture });
}

function dragCultureBrushStart(): void {
  saveCulturesManualSnapshot();
}

function dragCultureBrush(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
  if (!event.dx && !event.dy) return;
  const { brushSize, selectedCultureId } = getCulturesEditorState();
  const p = d3.pointer(event, this);
  moveCircle(p[0], p[1], brushSize);

  const found = brushSize > 5 ? findAll(p[0], p[1], brushSize) : [findCell(p[0], p[1])];
  const selection = found.filter(i => worldContext.pack.cells.h[i] >= 20);
  if (selection.length) changeCultureForSelection(selection, selectedCultureId);
}

function changeCultureForSelection(selection: number[], cultureNew: number): void {
  const temp = viewContext.cults.select("#temp");
  const color = (worldContext.pack.cultures[cultureNew] as Culture)?.color ?? "#ffffff";

  selection.forEach((i: number) => {
    const exists = temp.select(`polygon[data-cell='${i}']`);
    const cultureOld = exists.size() ? +exists.attr("data-culture") : worldContext.pack.cells.culture[i];
    if (cultureNew === cultureOld) return;

    if (exists.size()) exists.attr("data-culture", cultureNew).attr("fill", color).attr("stroke", color);
    else
      temp
        .append("polygon")
        .attr("data-cell", i)
        .attr("data-culture", cultureNew)
        .attr("points", getPackPolygon(i, worldContext.pack).join(" "))
        .attr("fill", color)
        .attr("stroke", color);
  });
}

function moveCultureBrush(this: SVGElement, event: MouseEvent | TouchEvent): void {
  showMainTip();
  const { brushSize } = getCulturesEditorState();
  let point: [number, number];
  if (window.TouchEvent && event instanceof TouchEvent) {
    point = d3.pointer(event.touches[0], this);
  } else {
    point = d3.pointer(event as MouseEvent, this);
  }
  moveCircle(point[0], point[1], brushSize);
}

function exitCulturesManualAssignment(): void {
  viewContext.customization = 0;
  setCulturesEditorState({ customization: 0 });
  culturesManualHistory.reset();
  viewContext.cults.select("#temp").remove();
  removeCircle();
  viewContext.debug.select("#cultureCenters").style("display", null);
  restoreDefaultEvents?.();
  clearMainTip();
}

function exitAddCultureMode(): void {
  if (getCulturesEditorState().customization !== 9) return;
  viewContext.customization = 0;
  setCulturesEditorState({ customization: 0 });
  restoreDefaultEvents?.();
  clearMainTip();
}

function addCulture(this: SVGElement, event: MouseEvent): void {
  const point = d3.pointer(event, this);
  const center = findCell(point[0], point[1]);

  if (worldContext.pack.cells.h[center] < 20) {
    tip("You cannot place culture center into the water. Please click on a land cell", false, "error");
    return;
  }

  const occupied = (worldContext.pack.cultures as Culture[]).some((c: Culture) => !c.removed && c.center === center);
  if (occupied) {
    tip("This cell is already a culture center. Please select a different cell", false, "error");
    return;
  }

  if (event.shiftKey === false) exitAddCultureMode();
  Cultures.add(center);

  drawCultureCenters();
  culturesEditorActions.refresh();
}

function saveCulturesManualSnapshot(): void {
  const temp = viewContext.cults.select("#temp").node() as Element | null;
  if (!temp) return;
  culturesManualHistory.push(temp.innerHTML);
}

declare global {
  var ra: <T>(arr: T[]) => T;
}
