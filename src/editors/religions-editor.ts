import * as d3 from "d3";
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
import { toggleBiomes, toggleCultures, toggleProvinces, toggleReligions, toggleStates } from "../controllers/layers";
import { editStyle } from "../controllers/style";
import type { Religion } from "../modules/religions-generator";
import { Religions } from "../modules/religions-generator";
import { PopulationRenderer, ReligionsRenderer } from "../renderers";
import type { ReligionRowData } from "../store/religionsEditorState";
import { getReligionsEditorState, setReligionsEditorState } from "../store/religionsEditorState";
import { closeDialog, closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { abbreviate, debounce, findAll, findCell, rn, si } from "../utils";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, getArea, getAreaUnit, removeCircle, tip } from "../utils/uiHelpers";

type HighlightEvent = { id?: string | number | null; target?: EventTarget | null };

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

export function initReligionsEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}

export function open(): void {
  closeDialogs("#religionsEditor, .stable");
  if (!layerIsOn("toggleReligions")) toggleReligions();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleProvinces")) toggleProvinces();

  setReligionsEditorState({ isOpen: true });
  religionsEditorActions.refresh();
  drawReligionCenters();

  openDialog("religionsEditor", {
    title: "Religions Editor",
    resizable: false,
    onClose: closeReligionsEditor,
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

function closeReligionsEditor(): void {
  setReligionsEditorState({ isOpen: false });
  exitReligionsManualAssignment();
  viewContext.relig.selectAll("path").attr("stroke-width", null).attr("stroke", null);
  viewContext.debug.selectAll("circle").attr("r", 2).attr("stroke", null);
  viewContext.debug.select("#religionCenters").remove();
}

function recalculateReligions(mustUpdate = false): void {
  const { autoChange } = getReligionsEditorState();
  if (!autoChange && !mustUpdate) return;

  Religions.recalculate();
  ReligionsRenderer.render(worldContext, viewContext, appServices);
  religionsEditorActions.refresh();
}

export const religionsEditorActions = {
  refresh(): void {
    const { extinctVisible } = getReligionsEditorState();
    const { cells, religions, burgs } = worldContext.pack;

    // Collect stats
    (religions as Religion[]).forEach(r => {
      r.cells = r.area = r.rural = r.urban = 0;
    });

    for (const i of cells.i) {
      if (cells.h[i] < 20) continue;
      const religionId = cells.religion[i];
      const rel = religions[religionId] as Religion;
      rel.cells! += 1;
      rel.area! += cells.area[i];
      rel.rural! += cells.pop[i];
      const burgId = cells.burg[i];
      if (burgId) rel.urban! += burgs[burgId].population ?? 0;
    }

    let totalArea = 0;
    let totalPopulation = 0;

    const rowData = (religions as Religion[])
      .map(r => {
        if (r.removed || (!r.i && !r.cells && !extinctVisible)) return null;
        if (r.i && !r.cells && !extinctVisible) return null;

        const area = getArea(r.area ?? 0);
        const rural = (r.rural ?? 0) * worldContext.populationRate;
        const urban = (r.urban ?? 0) * worldContext.populationRate * worldContext.urbanization;
        const population = rn(rural + urban);

        totalArea += area;
        totalPopulation += population;

        return {
          i: r.i,
          name: r.name,
          color: r.color || "",
          area,
          population,
          type: r.type,
          form: r.form || "",
          deity: r.deity || "",
          expansion: r.expansion || "",
          expansionism: r.expansionism || 0,
          cells: r.cells || 0,
          rural,
          urban,
          lock: r.lock,
          isExtinct: !r.cells
        } as ReligionRowData;
      })
      .filter(Boolean) as ReligionRowData[];

    const validReligions = (religions as Religion[]).filter(r => r.i && !r.removed);
    const totalOrganized = validReligions.filter(r => r.type === "Organized").length;
    const totalHeresies = validReligions.filter(r => r.type === "Heresy").length;
    const totalCults = validReligions.filter(r => r.type === "Cult").length;
    const totalFolk = validReligions.filter(r => r.type === "Folk").length;

    setReligionsEditorState({
      religions: rowData,
      totalArea,
      totalPopulation,
      totalOrganized,
      totalHeresies,
      totalCults,
      totalFolk
    });
  },

  changeSort(sortBy: string): void {
    const state = getReligionsEditorState();
    if (state.sortBy === sortBy) {
      setReligionsEditorState({ sortDirection: state.sortDirection * -1 });
    } else {
      setReligionsEditorState({ sortBy, sortDirection: 1 });
    }
  },

  togglePercentageMode(): void {
    setReligionsEditorState(s => ({ isPercentageMode: !s.isPercentageMode }));
  },

  toggleExtinct(): void {
    setReligionsEditorState(s => ({ extinctVisible: !s.extinctVisible }));
    setTimeout(() => {
      religionsEditorActions.refresh();
      drawReligionCenters();
    }, 0);
  },

  setAutoChange(autoChange: boolean): void {
    setReligionsEditorState({ autoChange });
  },

  editStyle(): void {
    editStyle("relig");
  },

  toggleLegend(): void {
    if (viewContext.legend.selectAll("*").size()) {
      clearLegend();
      return;
    }

    const data = (worldContext.pack.religions as Religion[])
      .filter(r => r.i && !r.removed && r.area)
      .sort((a, b) => (b.area ?? 0) - (a.area ?? 0))
      .map(r => [r.i, r.color, r.name] as [number, string, string]);
    drawLegend("Religions", data);
  },

  showHierarchy(): void {
    if (viewContext.customization) return;

    const getDescription = (element: HierarchyElement) => {
      const r = element as unknown as Religion;
      const { name, type, form } = r;
      const rural = r.rural ?? 0;
      const urban = r.urban ?? 0;

      const getTypeText = () => {
        if (name.includes(type)) return "";
        if (form?.includes(type)) return "";
        if (type === "Folk" || type === "Organized") return `. ${type} religion`;
        return `. ${type}`;
      };

      const formText = form === type || !form ? "" : `. ${form}`;
      const population =
        rural * worldContext.populationRate + urban * worldContext.populationRate * worldContext.urbanization;
      const populationText = population > 0 ? `${si(rn(population))} people` : "Extinct";

      return `${name}${getTypeText()}${formText}. ${populationText}`;
    };

    const getShape = (element: HierarchyElement) => {
      const type = element.type as string | undefined;
      if (type === "Folk") return "circle";
      if (type === "Organized") return "square";
      if (type === "Cult") return "hexagon";
      if (type === "Heresy") return "diamond";
      return undefined;
    };

    openHierarchyTree({
      type: "religions",
      data: worldContext.pack.religions as unknown as HierarchyElement[],
      onNodeEnter: religionHighlightOn,
      onNodeLeave: religionHighlightOff,
      getDescription,
      getShape
    });
  },

  enterReligionsManualAssignent(): void {
    if (!layerIsOn("toggleReligions")) toggleReligions();
    viewContext.customization = 7;
    setReligionsEditorState({ customization: 7 });

    viewContext.relig.append("g").attr("id", "temp");
    viewContext.debug.select("#religionCenters").style("display", "none");

    tip("Click on religion to select, drag the circle to change religion", true);
    viewContext.viewbox
      .style("cursor", "crosshair")
      .on("click", selectReligionOnMapClick)
      .call(d3.drag<SVGGElement, unknown>().on("drag", dragReligionBrush))
      .on("touchmove mousemove", moveReligionBrush);
  },

  exitReligionsManualAssignment(): void {
    exitReligionsManualAssignment();
  },

  applyReligionsManualAssignent(): void {
    applyReligionsManualAssignent();
  },

  changeBrushSize(size: number): void {
    setReligionsEditorState({ brushSize: size });
    viewContext.debug.select("#brush").attr("r", size);
  },

  toggleProtectExisting(protect: boolean): void {
    setReligionsEditorState({ protectExisting: protect });
  },

  enterAddReligionMode(): void {
    enterAddReligionMode();
  },

  downloadReligionsCsv(): void {
    downloadReligionsCsv();
  },

  recalculateReligions(): void {
    recalculateReligions(true);
  },

  religionHighlightOn(i: number): void {
    religionHighlightOn({ id: i });
  },

  religionHighlightOff(i: number): void {
    religionHighlightOff({ id: i });
  },

  selectReligionOnLineClick(_i: number): void {
    // In React this will just visually select, which currently isn't wired up to brush.
  },

  changeFill(i: number): void {
    const r = worldContext.pack.religions[i];
    openPicker(r.color || "", (newFill: string) => {
      r.color = newFill;
      viewContext.relig.select(`#religion${i}`).attr("fill", newFill);
      viewContext.debug.select(`#religionsCenter${i}`).attr("fill", newFill);
      religionsEditorActions.refresh();
    });
  },

  changeName(i: number, name: string): void {
    const rel = worldContext.pack.religions[i];
    rel.name = name;
    rel.code = abbreviate(
      name,
      (worldContext.pack.religions as Religion[]).map(c => c.code).filter((c): c is string => c !== undefined)
    );
    religionsEditorActions.refresh();
  },

  changeType(i: number, type: string): void {
    const validTypes = ["Folk", "Organized", "Cult", "Heresy"];
    if (validTypes.includes(type)) {
      (worldContext.pack.religions[i] as Religion).type = type as Religion["type"];
      religionsEditorActions.refresh();
    }
  },

  changeForm(i: number, form: string): void {
    worldContext.pack.religions[i].form = form;
    religionsEditorActions.refresh();
  },

  regenerateDeity(i: number): void {
    const rel = worldContext.pack.religions[i] as Religion;
    const deity = Religions.getDeityName(rel.culture);
    rel.deity = deity;
    religionsEditorActions.refresh();
  },

  changeDeity(i: number, deity: string): void {
    worldContext.pack.religions[i].deity = deity;
    religionsEditorActions.refresh();
  },

  changePopulation(i: number): void {
    const religion = worldContext.pack.religions[i] as Religion;
    if (!religion.cells) {
      tip("Religion does not have any cells, cannot change population", false, "error");
      return;
    }

    const rural = rn((religion.rural ?? 0) * worldContext.populationRate);
    const urban = rn((religion.urban ?? 0) * worldContext.populationRate * worldContext.urbanization);
    const total = rural + urban;
    const format = (n: number) => Number(n).toLocaleString();
    const burgs = worldContext.pack.burgs.filter(b => !b.removed && worldContext.pack.cells.religion[b.cell!] === i);

    const content = /* html */ `<div>
      <i>All population of religion territory is considered believers of this religion. It means believers number change will directly affect population</i>
      <div style="margin: 0.5em 0">
        Rural: <input type="number" min="0" step="1" id="ruralPop" value=${rural} style="width:6em" />
        Urban: <input type="number" min="0" step="1" id="urbanPop" value=${urban} style="width:6em"
          ${burgs.length ? "" : "disabled"} />
      </div>
      <div>Total population: ${format(total)} ⇒ <span id="totalPop">${format(total)}</span>
        (<span id="totalPopPerc">100</span>%)
      </div>
    </div>`;

    openRichDialog({
      content,
      resizable: false,
      title: "Change believers number",
      width: "24em",
      buttons: {
        Apply: () => {
          const getRuralPop = () => document.getElementById("ruralPop") as HTMLInputElement;
          const getUrbanPop = () => document.getElementById("urbanPop") as HTMLInputElement;
          const ruralChange = +getRuralPop().value / rural;
          if (Number.isFinite(ruralChange) && ruralChange !== 1) {
            const cells = worldContext.pack.cells.i.filter((c: number) => worldContext.pack.cells.religion[c] === i);
            cells.forEach((c: number) => {
              worldContext.pack.cells.pop[c] *= ruralChange;
            });
          }
          if (!Number.isFinite(ruralChange) && +getRuralPop().value > 0) {
            const points = +getRuralPop().value / worldContext.populationRate;
            const cells = worldContext.pack.cells.i.filter((c: number) => worldContext.pack.cells.religion[c] === i);
            const pop = rn(points / cells.length);
            cells.forEach((c: number) => {
              worldContext.pack.cells.pop[c] = pop;
            });
          }

          const urbanChange = +getUrbanPop().value / urban;
          if (Number.isFinite(urbanChange) && urbanChange !== 1) {
            burgs.forEach(b => {
              b.population = rn((b.population ?? 0) * urbanChange, 4);
            });
          }
          if (!Number.isFinite(urbanChange) && +getUrbanPop().value > 0) {
            const points = +getUrbanPop().value / worldContext.populationRate / worldContext.urbanization;
            const population = rn(points / burgs.length, 4);
            burgs.forEach(b => {
              b.population = population;
            });
          }

          if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
          religionsEditorActions.refresh();
          closeDialog("richDialog");
        },
        Cancel: () => {
          closeDialog("richDialog");
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

  changeExtent(i: number, extent: string): void {
    worldContext.pack.religions[i].expansion = extent;
    recalculateReligions();
  },

  changeExpansionism(i: number, expansionism: number): void {
    worldContext.pack.religions[i].expansionism = expansionism;
    recalculateReligions();
  },

  triggerRemove(i: number): void {
    if (viewContext.customization) return;
    confirmationDialog({
      title: "Remove religion",
      message: "Are you sure you want to remove the religion? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => removeReligion(i)
    });
  },

  highlightReligion(i: number): void {
    const element = document.getElementById(`religion${i}`);
    if (element) highlightElement(element, 3);
  },

  updateLockStatus(i: number): void {
    const rel = worldContext.pack.religions[i];
    rel.lock = !rel.lock;
    religionsEditorActions.refresh();
  }
};

const religionHighlightOn = debounce((event: HighlightEvent) => {
  const religionId = Number(event.id || (event.target as HTMLElement | null)?.dataset?.id);

  if (!layerIsOn("toggleReligions")) return;
  if (viewContext.customization) return;

  const animate = d3.transition().duration(2000).ease(d3.easeSinIn);
  viewContext.relig
    .select(`#religion${religionId}`)
    .raise()
    .transition(animate)
    .attr("stroke-width", 2.5)
    .attr("stroke", "#d0240f");
  viewContext.debug
    .select(`#religionsCenter${religionId}`)
    .raise()
    .transition(animate)
    .attr("r", 3)
    .attr("stroke", "#d0240f");
}, 200);

function religionHighlightOff(event: HighlightEvent): void {
  const religionId = Number(event.id || (event.target as HTMLElement | null)?.dataset?.id);
  viewContext.relig.select(`#religion${religionId}`).transition().attr("stroke-width", null).attr("stroke", null);
  viewContext.debug.select(`#religionsCenter${religionId}`).transition().attr("r", 2).attr("stroke", null);
}

function removeReligion(religionId: number): void {
  viewContext.relig.select(`#religion${religionId}`).remove();
  viewContext.relig.select(`#religion-gap${religionId}`).remove();
  viewContext.debug.select(`#religionsCenter${religionId}`).remove();

  Array.from(worldContext.pack.cells.religion).forEach((r: number, i: number) => {
    if (r === religionId) worldContext.pack.cells.religion[i] = 0;
  });
  worldContext.pack.religions[religionId].removed = true;

  (worldContext.pack.religions as Religion[])
    .filter(r => r.i && !r.removed)
    .forEach(r => {
      r.origins = (r.origins ?? []).filter(origin => origin !== religionId);
      if (!r.origins.length) r.origins = [0];
    });

  religionsEditorActions.refresh();
}

function drawReligionCenters(): void {
  viewContext.debug.select("#religionCenters").remove();
  const religionCenters = viewContext.debug
    .append("g")
    .attr("id", "religionCenters")
    .attr("stroke-width", 0.8)
    .attr("stroke", "#444444")
    .style("cursor", "move");

  const { extinctVisible } = getReligionsEditorState();
  let data = (worldContext.pack.religions as Religion[]).filter(r => r.i && r.center && !r.removed);
  if (!extinctVisible) data = data.filter(r => (r.cells ?? 0) > 0);

  religionCenters
    .selectAll<SVGCircleElement, Religion>("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("id", d => `religionsCenter${d.i}`)
    .attr("data-id", d => d.i)
    .attr("r", 2)
    .attr("fill", d => d.color)
    .attr("cx", d => worldContext.pack.cells.p[d.center][0])
    .attr("cy", d => worldContext.pack.cells.p[d.center][1])
    .on("mouseenter", (_event: MouseEvent, d: Religion) => {
      tip(`${d.name}. Drag to move the religion center`, true);
      religionHighlightOn({ id: d.i });
    })
    .on("mouseleave", (_event: MouseEvent, d: Religion) => {
      tip("", true);
      religionHighlightOff({ id: d.i });
    })
    .call(
      d3.drag<SVGCircleElement, Religion>().on("start", religionCenterDragStart).on("drag", religionCenterDragDebounced)
    );
}

let _rcdId = 0,
  _rcdX0 = 0,
  _rcdY0 = 0;

function parseTransform(transform: string): [number, number] {
  if (!transform) return [0, 0];
  const match = transform.match(/translate\((-?\d+(?:\.\d+)?),?\s*(-?\d+(?:\.\d+)?)\)/);
  if (!match) return [0, 0];
  return [parseFloat(match[1]), parseFloat(match[2])];
}

function religionCenterDragStart(
  this: SVGCircleElement,
  event: d3.D3DragEvent<SVGCircleElement, Religion, unknown>
): void {
  _rcdId = +this.dataset.id!;
  const tr = parseTransform(this.getAttribute("transform") ?? "");
  _rcdX0 = +tr[0] - event.x;
  _rcdY0 = +tr[1] - event.y;
}

function religionCenterDragInner(
  this: SVGCircleElement,
  event: d3.D3DragEvent<SVGCircleElement, Religion, unknown>
): void {
  const { x, y } = event;
  this.setAttribute("transform", `translate(${_rcdX0 + x},${_rcdY0 + y})`);
  const cell = findCell(x, y);
  if (worldContext.pack.cells.h[cell] < 20) return;

  worldContext.pack.religions[_rcdId].center = cell;
  recalculateReligions();
}

const religionCenterDragDebounced = debounce(religionCenterDragInner, 50);

function exitReligionsManualAssignment(): void {
  viewContext.customization = 0;
  setReligionsEditorState({ customization: 0 });
  viewContext.relig.select("#temp").remove();
  removeCircle();
  restoreDefaultEvents?.();
  clearMainTip();
  viewContext.debug.select("#religionCenters").style("display", null);

  const cells = worldContext.pack.cells;
  cells.religion.forEach((r, i) => {
    if (!worldContext.pack.religions[r] || worldContext.pack.religions[r].removed) {
      cells.religion[i] = 0;
    }
  });
}

function applyReligionsManualAssignent(): void {
  ReligionsRenderer.render(worldContext, viewContext, appServices);
  religionsEditorActions.refresh();
  exitReligionsManualAssignment();
}

function exitAddReligionMode(): void {
  viewContext.customization = 0;
  setReligionsEditorState({ customization: 0 });
  viewContext.relig.select("#temp").remove();
  removeCircle();
  restoreDefaultEvents?.();
  clearMainTip();
}

function enterAddReligionMode(): void {
  if (viewContext.customization !== 7) religionsEditorActions.enterReligionsManualAssignent();
  viewContext.customization = 8;
  viewContext.relig.append("g").attr("id", "temp");
  tip("Click on the map to add a new religion or spread an existing one", true);
  viewContext.viewbox.style("cursor", "crosshair").on("click", addReligionClick);
}

function addReligionClick(this: SVGElement, event: MouseEvent): void {
  const point = d3.pointer(event, this);
  const center = findCell(point[0], point[1]);
  if (worldContext.pack.cells.h[center] < 20) {
    tip("You cannot place religion center into the water. Please click on a land cell", false, "error");
    return;
  }

  const occupied = (worldContext.pack.religions as Religion[]).some(r => !r.removed && r.center === center);
  if (occupied) {
    tip("This cell is already a religion center. Please select a different cell", false, "error");
    return;
  }

  if (event.shiftKey === false) exitAddReligionMode();
  Religions.add(center);

  ReligionsRenderer.render(worldContext, viewContext, appServices);
  religionsEditorActions.refresh();
  drawReligionCenters();
}

function selectReligionOnMapClick(this: SVGElement, event: MouseEvent): void {
  const point = d3.pointer(event, this);
  const i = findCell(point[0], point[1]);
  if (worldContext.pack.cells.h[i] < 20) return;

  // Selection visual feedback logic would go here
}

function dragReligionBrush(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
  const { brushSize, protectExisting } = getReligionsEditorState();
  const r = brushSize;
  const point = d3.pointer(event, this);
  moveCircle(point[0], point[1], r);

  const selectedReligion = 0; // Default until UI row selection is hooked up properly

  const found = findAll(point[0], point[1], r);
  const temp = viewContext.relig.select("#temp");
  if (found) {
    found.forEach((i: number) => {
      if (worldContext.pack.cells.h[i] < 20) return;
      if (protectExisting && worldContext.pack.cells.religion[i]) return;
      worldContext.pack.cells.religion[i] = selectedReligion;
      temp
        .append("polygon")
        .attr(
          "points",
          getPackPolygon(i, worldContext.pack)
            .map(p => p.join(","))
            .join(" ")
        )
        .attr("fill", worldContext.pack.religions[selectedReligion].color || "#ffffff")
        .attr("stroke", worldContext.pack.religions[selectedReligion].color || "#ffffff")
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round");
    });
  }
}

function moveReligionBrush(this: SVGElement, event: MouseEvent | TouchEvent): void {
  const { brushSize } = getReligionsEditorState();
  let point: [number, number];
  if (window.TouchEvent && event instanceof TouchEvent) {
    point = d3.pointer(event.touches[0], this);
  } else {
    point = d3.pointer(event as MouseEvent, this);
  }
  moveCircle(point[0], point[1], brushSize);
}

function downloadReligionsCsv(): void {
  const unit = getAreaUnit();
  let csv = `Id,Religion,Color,Cells,Area,Population,Type,Form,Supreme Deity,Expansion,Expansionism\n`;

  for (const r of worldContext.pack.religions as Religion[]) {
    if (r.removed || (!r.i && !r.cells)) continue;
    const area = getArea(r.area ?? 0);
    const rural = (r.rural ?? 0) * worldContext.populationRate;
    const urban = (r.urban ?? 0) * worldContext.populationRate * worldContext.urbanization;
    const population = rn(rural + urban);
    const name = r.name ? `"${r.name}"` : "No religion";
    const type = r.type || "unknown";
    const form = r.form ? `"${r.form}"` : "unknown";
    const deity = r.deity ? `"${r.deity}"` : "none";
    const expansion = r.expansion || "none";
    const expansionism = r.expansionism || 0;

    csv += `${r.i},${name},${r.color},${r.cells},${area} ${unit},${population},${type},${form},${deity},${expansion},${expansionism}\n`;
  }

  downloadFile(csv, `${getFileName("Religions")}.csv`);
}
