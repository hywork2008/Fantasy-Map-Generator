import { color, interpolateString, pointer } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
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
import { States } from "../generators/states-generator";
import { StatesRenderer } from "../renderers";
import { type DiplomacyRowData, getDiplomacyEditorState, setDiplomacyEditorState } from "../store/diplomacyEditorState";
import { modules } from "../store/editorState";
import { closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { findCell, getAdjective } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { EditorBus } from "../utils/editorBus";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, tip } from "../utils/uiHelpers";

type RelationKey =
  | "Ally"
  | "Friendly"
  | "Neutral"
  | "Suspicion"
  | "Enemy"
  | "Unknown"
  | "Rival"
  | "Vassal"
  | "Suzerain";

export const relations: Record<RelationKey, { inText: string; color: string; tip: string }> = {
  Ally: {
    inText: "is an ally of",
    color: "#00b300",
    tip: "Allies formed a defensive pact and protect each other in case of third party aggression"
  },
  Friendly: {
    inText: "is friendly to",
    color: "#d4f8aa",
    tip: "State is friendly to anouther state when they share some common interests"
  },
  Neutral: {
    inText: "is neutral to",
    color: "#edeee8",
    tip: "Neutral means states relations are neither positive nor negative"
  },
  Suspicion: {
    inText: "is suspicious of",
    color: "#eeafaa",
    tip: "Suspicion means state has a cautious distrust of another state"
  },
  Enemy: { inText: "is at war with", color: "#e64b40", tip: "Enemies are states at war with each other" },
  Unknown: {
    inText: "does not know about",
    color: "#a9a9a9",
    tip: "Relations are unknown if states do not have enough information about each other"
  },
  Rival: {
    inText: "is a rival of",
    color: "#ad5a1f",
    tip: "Rivalry is a state of competing for dominance in the region"
  },
  Vassal: { inText: "is a vassal of", color: "#87CEFA", tip: "Vassal is a state having obligation to its suzerain" },
  Suzerain: {
    inText: "is suzerain to",
    color: "#00008B",
    tip: "Suzerain is a state having some control over its vassals"
  }
};

export function editDiplomacy(): void {
  if (viewContext.customization) return;
  if (worldContext.pack.states.filter(s => s.i && !s.removed).length < 2) {
    tip("There should be at least 2 states to edit the diplomacy", false, "error");
    return;
  }

  closeDialogs("#diplomacyEditor, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (layerIsOn("toggleProvinces")) toggleProvinces();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleReligions")) toggleReligions();

  refreshDiplomacyEditor();
  viewContext.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(selectStateOnMapClick);

  if (modules.editDiplomacy) return;
  modules.editDiplomacy = true;

  openDialog("diplomacyEditor");

  function refreshDiplomacyEditor(): void {
    diplomacyEditorAddLines();
    showStateRelations();
  }

  function diplomacyEditorAddLines(): void {
    const states = worldContext.pack.states;
    const { selectedStateId } = getDiplomacyEditorState() ?? { selectedStateId: 0 };
    const selectedId = selectedStateId || states.find(s => s.i && !s.removed)!.i;

    const rowData: DiplomacyRowData[] = [];

    // Self Row
    rowData.push({
      i: selectedId,
      name: states[selectedId].name,
      fullName: states[selectedId].fullName || "",
      color: "none",
      relation: "Self",
      inText: "Self"
    });

    for (const state of states) {
      if (!state.i || state.removed || state.i === selectedId) continue;
      const relation = state.diplomacy![selectedId] as RelationKey;
      const { color, inText } = relations[relation];
      const name = (state.fullName && state.fullName.length < 23 ? state.fullName : state.name) as string;

      rowData.push({
        i: state.i,
        name: name,
        fullName: state.fullName || "",
        color,
        relation,
        inText
      });
    }

    setDiplomacyEditorState({
      states: rowData,
      selectedStateId: selectedId
    });
  }

  function showStateRelations(): void {
    const sel = getDiplomacyEditorState()?.selectedStateId || worldContext.pack.states.find(s => s.i && !s.removed)?.i;
    if (!sel) return;
    if (!layerIsOn("toggleStates")) toggleStates();

    viewContext.statesBody.selectAll("path").each(function () {
      const el = this as SVGPathElement;
      if (el.id.slice(0, 9) === "state-gap") return;
      const id = +el.id.slice(5);

      const relation = worldContext.pack.states[id].diplomacy![sel] as RelationKey;
      const c = relations[relation]?.color || "#4682b4";

      el.setAttribute("fill", c);
      viewContext.statesBody.select(`#state-gap${id}`).attr("stroke", c);
      viewContext.statesHalo.select(`#state-border${id}`).attr("stroke", color(c)?.darker().formatHex() ?? c);
    });
  }

  function selectStateOnMapClick(this: SVGElement, event: MouseEvent): void {
    const point = pointer(event, this);
    const i = findCell(point[0], point[1]);
    const state = worldContext.pack.cells.state![i];
    if (!state) return;

    setDiplomacyEditorState({ selectedStateId: state });
    refreshDiplomacyEditor();
  }

  function selectRelation(subjectId: number, objectId: number, currentRelation: string): void {
    setDiplomacyEditorState({
      relationDialog: {
        isOpen: true,
        subjectId,
        objectId,
        currentRelation
      }
    });
  }

  function changeRelation(subjectId: number, objectId: number, oldRelation: string, newRelation: string): void {
    if (newRelation === oldRelation) return;
    const states = worldContext.pack.states;
    const chronicle = states[0].diplomacy as unknown as string[][];

    const subjectName = states[subjectId].name;
    const objectName = states[objectId].name;

    states[subjectId].diplomacy![objectId] = newRelation;
    states[objectId].diplomacy![subjectId] =
      newRelation === "Vassal" ? "Suzerain" : newRelation === "Suzerain" ? "Vassal" : newRelation;

    const change = (): [string, string] => [
      `Relations change`,
      `${subjectName}-${getAdjective(objectName)} relations changed to ${newRelation.toLowerCase()}`
    ];
    const ally = (): [string, string] => [
      `Defence pact`,
      `${subjectName} entered into defensive pact with ${objectName}`
    ];
    const vassal = (): [string, string] => [`Vassalization`, `${subjectName} became a vassal of ${objectName}`];
    const suzerain = (): [string, string] => [`Vassalization`, `${subjectName} vassalized ${objectName}`];
    const rival = (): [string, string] => [`Rivalization`, `${subjectName} and ${objectName} became rivals`];
    const unknown = (): [string, string] => [
      `Relations severance`,
      `${subjectName} recalled their ambassadors and wiped all the records about ${objectName}`
    ];
    const war = (): [string, string] => [`War declaration`, `${subjectName} declared a war on its enemy ${objectName}`];
    const peace = (): [string, string, string] => {
      const treaty = `${subjectName} and ${objectName} agreed to cease fire and signed a peace treaty`;
      const changed =
        newRelation === "Ally"
          ? ally()
          : newRelation === "Vassal"
            ? vassal()
            : newRelation === "Suzerain"
              ? suzerain()
              : newRelation === "Unknown"
                ? unknown()
                : change();
      return [`War termination`, treaty, changed[1]];
    };

    if (oldRelation === "Enemy") chronicle.push(peace());
    else if (newRelation === "Enemy") chronicle.push(war());
    else if (newRelation === "Vassal") chronicle.push(vassal());
    else if (newRelation === "Suzerain") chronicle.push(suzerain());
    else if (newRelation === "Ally") chronicle.push(ally());
    else if (newRelation === "Unknown") chronicle.push(unknown());
    else if (newRelation === "Rival") chronicle.push(rival());
    else chronicle.push(change());

    refreshDiplomacyEditor();
    const diplomacyMatrixEl = document.getElementById("diplomacyMatrix");
    if (diplomacyMatrixEl?.offsetParent) {
      document.getElementById("diplomacyMatrixBody")!.innerHTML = "";
      showRelationsMatrix();
    }
  }

  function regenerateRelations(): void {
    States.generateDiplomacy();
    refreshDiplomacyEditor();
  }

  function resetRelations(): void {
    const selectedId = getDiplomacyEditorState()?.selectedStateId || 0;
    if (!selectedId) return;
    const states = worldContext.pack.states;

    (states[selectedId].diplomacy as string[]).forEach((rel, index) => {
      if (rel !== "x") {
        states[selectedId].diplomacy![index] = "Neutral";
        states[index].diplomacy![selectedId] = "Neutral";
      }
    });

    refreshDiplomacyEditor();
  }

  function showRelationsHistory(): void {
    const chronicle = worldContext.pack.states[0].diplomacy as unknown as string[][];

    let message = /* html */ `<div autocorrect="off" spellcheck="false">`;
    chronicle.forEach((entry: string[], index: number) => {
      message += `<div>`;
      entry.forEach((l, entryIndex) => {
        message += /* html */ `<div contenteditable="true" data-id="${index}-${entryIndex}"
          ${entryIndex ? "" : "worldContext.style='font-weight:bold'"}>${l}</div>`;
      });
      message += `&#8205;</div>`;
    });

    if (!chronicle.length) {
      (worldContext.pack.states[0].diplomacy as unknown as string[][]) = [[]];
      message += /* html */ `<div><div contenteditable="true" data-id="0-0">No historical records</div>&#8205;</div>`;
    }

    alertMessage.innerHTML =
      message +
      `</div><div class="info-line">Type to edit. Press Enter to add a new line, empty the element to remove it</div>`;
    alertMessage.querySelectorAll<HTMLElement>("div[contenteditable='true']").forEach(el => {
      el.addEventListener("input", changeRelationsHistory);
    });

    openRichDialog({
      content: alertMessage.innerHTML,
      title: "Relations history",
      position: { my: "center", at: "center", of: "svg" },
      buttons: {
        Save: function () {
          const data = (this as unknown as HTMLElement).querySelector("div")!.innerText.split("\n").join("\r\n");
          const name = `${getFileName("Relations history")}.txt`;
          downloadFile(data, name);
        },
        Clear: () => {
          worldContext.pack.states[0].diplomacy = [];
          /* $(this).dialog("close") removed */
        },
        Close: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function changeRelationsHistory(this: HTMLElement): void {
    const parts = this.dataset.id!.split("-");
    const group = (worldContext.pack.states[0].diplomacy as unknown as string[][])[+parts[0]];
    if (this.innerHTML === "") {
      group.splice(+parts[1], 1);
      this.remove();
    } else group[+parts[1]] = this.innerHTML;
  }

  function showRelationsMatrix(): void {
    const states = worldContext.pack.states.filter(s => s.i && !s.removed);
    const valid = states.map(state => state.i);
    const diplomacyMatrixBody = document.getElementById("diplomacyMatrixBody") as HTMLElement;

    let table = `<table><thead><tr><th data-tip='&#8205;'></th>`;
    table += `${states.map(state => `<th data-tip='Relations to ${state.fullName}'>${state.name}</th>`).join("")}</tr>`;
    table += `<tbody>`;

    states.forEach(state => {
      table +=
        `<tr data-id=${state.i}><th data-tip='Relations of ${state.fullName}'>${state.name}</th>` +
        (state.diplomacy as string[])
          .filter((_v, i) => valid.includes(i))
          .map((relation, index) => {
            const relationObj = relations[relation as RelationKey];
            if (!relationObj) return `<td class='${relation}'>${relation}</td>`;

            const objectState = worldContext.pack.states[valid[index]];
            const tipText = `${state.fullName} ${relationObj.inText} ${objectState.fullName}`;
            return `<td data-id=${objectState.i} data-tip='${tipText}' class='${relation}'>${relation}</td>`;
          })
          .join("") +
        "</tr>";
    });

    table += `</tbody></table>`;
    diplomacyMatrixBody.innerHTML = table;

    const tableEl = diplomacyMatrixBody.querySelector("table") as HTMLTableElement;
    tableEl.addEventListener("click", event => {
      const el = event.target as HTMLElement;
      if (el.tagName !== "TD") return;

      const currentRelation = el.innerText;
      if (!relations[currentRelation as RelationKey]) return;

      const subjectId = +((el.closest("tr") as HTMLElement).dataset.id ?? "0");
      const objectId = +(el as HTMLElement).dataset.id!;

      selectRelation(subjectId, objectId, currentRelation);
    });

    openDialog("diplomacyMatrix", {
      title: "Relations matrix",
      position: { my: "center", at: "center", of: "svg" },
      buttons: {}
    });
  }

  function downloadDiplomacyData(): void {
    const states = worldContext.pack.states.filter(s => s.i && !s.removed);
    const valid = states.map(s => s.i);

    let data = `,${states.map(s => s.name).join(",")}\n`;
    states.forEach(s => {
      const rels = (s.diplomacy as string[]).filter((_v, i) => valid.includes(i));
      data += `${s.name},${rels.join(",")}\n`;
    });

    const name = `${getFileName("Relations")}.csv`;
    downloadFile(data, name);
  }

  function closeDiplomacyEditorImpl(): void {
    EditorBus.restoreDefaultEvents();
    clearMainTip();
    if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
    else toggleStates();
    viewContext.debug.selectAll(".highlight").remove();
  }
  diplomacyEditorActions.refreshDiplomacyEditor = refreshDiplomacyEditor;
  diplomacyEditorActions.selectRelation = selectRelation;
  diplomacyEditorActions.changeRelation = changeRelation;
  diplomacyEditorActions.regenerateRelations = regenerateRelations;
  diplomacyEditorActions.resetRelations = resetRelations;
  diplomacyEditorActions.showRelationsHistory = showRelationsHistory;
  diplomacyEditorActions.showRelationsMatrix = showRelationsMatrix;
  diplomacyEditorActions.downloadDiplomacyData = downloadDiplomacyData;
  diplomacyEditorActions.closeDiplomacyEditor = closeDiplomacyEditorImpl;
}

export const diplomacyEditorActions = {
  refreshDiplomacyEditor: () => {},
  stateHighlightOn: (stateId: number) => {
    if (!layerIsOn("toggleStates")) return;
    if (viewContext.customization || !stateId) return;
    const d = viewContext.regions.select(`#state${stateId}`).attr("d");

    const path = viewContext.debug
      .append("path")
      .attr("class", "highlight")
      .attr("d", d)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-width", 1)
      .attr("opacity", 1)
      .attr("filter", "url(#blur1)");

    const l = (path.node() as SVGPathElement).getTotalLength();
    const dur = (l + 5000) / 2;
    const interp = interpolateString(`0,${l}`, `${l},${l}`);
    path
      .transition()
      .duration(dur)
      .attrTween("stroke-dasharray", () => (t: number) => interp(t));
  },
  stateHighlightOff: () => {
    viewContext.debug
      .selectAll<SVGElement, unknown>(".highlight")
      .transition()
      .duration(1000)
      .attr("opacity", 0)
      .remove();
  },
  selectState: (stateId: number) => {
    setDiplomacyEditorState({ selectedStateId: stateId });
    diplomacyEditorActions.refreshDiplomacyEditor();
  },
  selectRelation: (_subjectId: number, _objectId: number, _currentRelation: string) => {},
  changeRelation: (_subjectId: number, _objectId: number, _currentRelation: string, _newRelation: string) => {},
  regenerateRelations: () => {},
  resetRelations: () => {},
  showRelationsHistory: () => {},
  showRelationsMatrix: () => {},
  downloadDiplomacyData: () => {},
  editStyle,
  closeDiplomacyEditor: () => {}
};

declare global {
  interface Window {
    editDiplomacy: () => void;
  }
}

export function initDiplomacyEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
