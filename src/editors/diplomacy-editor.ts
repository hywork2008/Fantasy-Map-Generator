import { color, interpolateString, pointer } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { interactionManager } from "../controllers/interactionManager";
import { COArenderer } from "../modules/emblem/renderer";
import { States } from "../modules/states-generator";
import { StatesRenderer } from "../renderers";
import { openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { findCell, getAdjective } from "../utils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

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

const relations: Record<RelationKey, { inText: string; color: string; tip: string }> = {
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
  if (customization) return;
  if (pack.states.filter(s => s.i && !s.removed).length < 2) {
    tip("There should be at least 2 states to edit the diplomacy", false, "error");
    return;
  }

  const body = document.getElementById("diplomacyBodySection") as HTMLElement;

  closeDialogs("#diplomacyEditor, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (layerIsOn("toggleProvinces")) toggleProvinces();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleReligions")) toggleReligions();

  refreshDiplomacyEditor();
  viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(selectStateOnMapClick);

  if (modules.editDiplomacy) return;
  modules.editDiplomacy = true;

  openDialog("diplomacyEditor", {
    title: "Diplomacy Editor",
    resizable: false,
    width: fitContent(),
    close: closeDiplomacyEditor,
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  document.getElementById("diplomacyEditorRefresh")!.addEventListener("click", refreshDiplomacyEditor);
  document.getElementById("diplomacyEditStyle")!.addEventListener("click", () => editStyle("regions"));
  document.getElementById("diplomacyRegenerate")!.addEventListener("click", regenerateRelations);
  document.getElementById("diplomacyReset")!.addEventListener("click", resetRelations);
  document.getElementById("diplomacyShowMatrix")!.addEventListener("click", showRelationsMatrix);
  document.getElementById("diplomacyHistory")!.addEventListener("click", showRelationsHistory);
  document.getElementById("diplomacyExport")!.addEventListener("click", downloadDiplomacyData);

  body.addEventListener("click", ev => {
    const el = ev.target as HTMLElement;
    if (el.parentElement!.classList.contains("Self")) return;

    if (el.classList.contains("changeRelations")) {
      const line = el.parentElement as HTMLElement;
      const subjectId = +line.dataset.id!;
      const objectId = +(body.querySelector("div.Self")! as HTMLElement).dataset.id!;
      const currentRelation = line.dataset.relations!;

      selectRelation(subjectId, objectId, currentRelation);
      return;
    }

    body.querySelector("div.Self")!.classList.remove("Self");
    el.parentElement!.classList.add("Self");
    refreshDiplomacyEditor();
  });

  function refreshDiplomacyEditor(): void {
    diplomacyEditorAddLines();
    showStateRelations();
  }

  function diplomacyEditorAddLines(): void {
    const states = pack.states;
    const selectedLine = body.querySelector("div.Self") as HTMLElement | null;
    const selectedId = selectedLine ? +selectedLine.dataset.id! : states.find(s => s.i && !s.removed)!.i;
    const selectedName = states[selectedId].name;

    COArenderer.trigger(`stateCOA${selectedId}`, states[selectedId].coa!);
    let lines = /* html */ `<div class="states Self" data-id=${selectedId} data-tip="List below shows relations to ${selectedName}">
      <div style="width: max-content">${states[selectedId].fullName}</div>
      <svg class="coaIcon" viewBox="0 0 200 200"><use href="#stateCOA${selectedId}"></use></svg>
    </div>`;

    for (const state of states) {
      if (!state.i || state.removed || state.i === selectedId) continue;
      const relation = state.diplomacy![selectedId] as RelationKey;
      const { color, inText } = relations[relation];

      const tipText = `${state.name} ${inText} ${selectedName}`;
      const tipSelect = `${tipText}. Click to see relations to ${state.name}`;
      const tipChange = `Click to change relations. ${tipText}`;

      const name = (state.fullName ?? "").length < 23 ? (state.fullName ?? state.name) : state.name;
      COArenderer.trigger(`stateCOA${state.i}`, state.coa!);

      lines += /* html */ `<div class="states" data-id=${state.i} data-name="${name}" data-relations="${relation}">
        <svg data-tip="${tipSelect}" class="coaIcon" viewBox="0 0 200 200"><use href="#stateCOA${state.i}"></use></svg>
        <div data-tip="${tipSelect}" style="width: 12em">${name}</div>
        <div data-tip="${tipChange}" class="changeRelations" style="width: 6em">
          <fill-box fill="${color}" size=".9em"></fill-box>
          ${relation}
        </div>
      </div>`;
    }
    body.innerHTML = lines;

    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseenter", ev => stateHighlightOn(ev as MouseEvent));
    });
    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseleave", () => stateHighlightOff());
    });

    applySorting(document.getElementById("diplomacyHeader") as HTMLElement);
    openDialog("diplomacyEditor");
  }

  function stateHighlightOn(event: MouseEvent): void {
    if (!layerIsOn("toggleStates")) return;
    const state = +(event.target as HTMLElement).dataset.id!;
    if (customization || !state) return;
    const d = regions.select(`#state${state}`).attr("d");

    const path = debug
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
  }

  function stateHighlightOff(): void {
    debug.selectAll<SVGElement, unknown>(".highlight").transition().duration(1000).attr("opacity", 0).remove();
  }

  function showStateRelations(): void {
    const selectedLine = body.querySelector("div.Self") as HTMLElement | null;
    const sel = selectedLine ? +selectedLine.dataset.id! : pack.states.find(s => s.i && !s.removed)?.i;
    if (!sel) return;
    if (!layerIsOn("toggleStates")) toggleStates();

    statesBody.selectAll("path").each(function () {
      const el = this as SVGPathElement;
      if (el.id.slice(0, 9) === "state-gap") return;
      const id = +el.id.slice(5);

      const relation = pack.states[id].diplomacy![sel] as RelationKey;
      const c = relations[relation]?.color || "#4682b4";

      el.setAttribute("fill", c);
      statesBody.select(`#state-gap${id}`).attr("stroke", c);
      statesHalo.select(`#state-border${id}`).attr("stroke", color(c)?.darker().formatHex() ?? c);
    });
  }

  function selectStateOnMapClick(this: SVGElement, event: MouseEvent): void {
    const point = pointer(event, this);
    const i = findCell(point[0], point[1]);
    const state = pack.cells.state![i];
    if (!state) return;
    const selectedLine = body.querySelector("div.Self") as HTMLElement;
    if (+selectedLine.dataset.id! === state) return;

    selectedLine.classList.remove("Self");
    (body.querySelector(`div[data-id='${state}']`) as HTMLElement).classList.add("Self");
    refreshDiplomacyEditor();
  }

  function selectRelation(subjectId: number, objectId: number, currentRelation: string): void {
    const states = pack.states;
    const subject = states[subjectId];

    const relationsSelector = Object.entries(relations)
      .map(
        ([relation, { color: c, inText, tip }]) => /* html */ `
          <div data-tip="${tip}">
            <label class="pointer">
              <input type="radio" name="relationSelect" value="${relation}"
              ${currentRelation === relation && "checked"} >
              <fill-box fill="${c}" size=".8em"></fill-box>
              ${inText}
          </label>
          </div>
        `
      )
      .join("");

    const objectsSelector = states
      .filter(s => s.i && !s.removed && s.i !== subjectId)
      .map(
        s => /* html */ `
          <div data-tip="${s.fullName}">
            <input id="selectState${s.i}" class="checkbox" type="checkbox" name="objectSelect" value="${s.i}"
            ${s.i === objectId && "checked"} />
            <label for="selectState${s.i}" class="checkbox-label">
              <svg class="coaIcon" viewBox="0 0 200 200">
                <use href="#stateCOA${s.i}"></use>
              </svg>
              ${s.fullName}
            </label>
          </div>
        `
      )
      .join("");

    alertMessage.innerHTML = /* html */ `
      <form id='relationsForm' style="overflow: hidden; display: flex; flex-direction: column; gap: .3em; padding: 0.1em 0;">
        <header>
          <svg class="coaIcon" viewBox="0 0 200 200">
            <use href="#stateCOA${subject.i}"></use>
          </svg>
          <b>${subject.fullName}</b>
        </header>

        <main style='display: flex; gap: 1em;'>
          <section style="display: flex; flex-direction: column; gap: .3em;">${relationsSelector}</section>
          <section style="display: flex; flex-direction: column; gap: .3em;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3em;">
              <label style="font-weight: 500; font-size: 0.95em;">States:</label>
              <button id="selectAllNoneBtn" type="button" style="padding: 0.3em 0.8em; cursor: pointer; font-size: 0.9em;" data-tip="Toggle selection of all states. Also supports Ctrl+A.">Select All / None</button>
            </div>
            <div id="stateSelectionContainer" style="display: flex; flex-direction: column; gap: .3em;">${objectsSelector}</div>
          </section>
        </main>
      </form>
    `;

    openRichDialog({
      content: window.alertMessage.innerHTML,
      width: fitContent(),
      title: `Change relations`,
      buttons: {
        Apply: () => {
          const formData = new FormData(document.getElementById("relationsForm") as HTMLFormElement);
          const newRelation = formData.get("relationSelect") as string;
          const objectIds = [...formData.getAll("objectSelect")].map(Number);

          for (const oid of objectIds) {
            changeRelation(subjectId, oid, currentRelation, newRelation);
          }
          /* $(this).dialog("close") removed */
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });

    const selectAllNoneBtn = document.getElementById("selectAllNoneBtn") as HTMLButtonElement;
    const stateCheckboxes = () =>
      document.querySelectorAll<HTMLInputElement>("#stateSelectionContainer input[name='objectSelect']");

    function updateButtonState(): void {
      const checkboxes = stateCheckboxes();
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      if (allChecked && checkboxes.length > 0) {
        selectAllNoneBtn.classList.add("pressed");
      } else {
        selectAllNoneBtn.classList.remove("pressed");
      }
    }

    function toggleSelectAll(): void {
      const checkboxes = stateCheckboxes();
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      const newState = !allChecked;
      checkboxes.forEach(cb => {
        cb.checked = newState;
      });
      updateButtonState();
    }

    selectAllNoneBtn.addEventListener("click", e => {
      e.preventDefault();
      toggleSelectAll();
    });

    updateButtonState();
  }

  function changeRelation(subjectId: number, objectId: number, oldRelation: string, newRelation: string): void {
    if (newRelation === oldRelation) return;
    const states = pack.states;
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
    const selectedLine = body.querySelector("div.Self") as HTMLElement | null;
    const selectedId = selectedLine ? +selectedLine.dataset.id! : 0;
    if (!selectedId) return;
    const states = pack.states;

    (states[selectedId].diplomacy as string[]).forEach((rel, index) => {
      if (rel !== "x") {
        states[selectedId].diplomacy![index] = "Neutral";
        states[index].diplomacy![selectedId] = "Neutral";
      }
    });

    refreshDiplomacyEditor();
  }

  function showRelationsHistory(): void {
    const chronicle = pack.states[0].diplomacy as unknown as string[][];

    let message = /* html */ `<div autocorrect="off" spellcheck="false">`;
    chronicle.forEach((entry: string[], index: number) => {
      message += `<div>`;
      entry.forEach((l, entryIndex) => {
        message += /* html */ `<div contenteditable="true" data-id="${index}-${entryIndex}"
          ${entryIndex ? "" : "style='font-weight:bold'"}>${l}</div>`;
      });
      message += `&#8205;</div>`;
    });

    if (!chronicle.length) {
      (pack.states[0].diplomacy as unknown as string[][]) = [[]];
      message += /* html */ `<div><div contenteditable="true" data-id="0-0">No historical records</div>&#8205;</div>`;
    }

    alertMessage.innerHTML =
      message +
      `</div><div class="info-line">Type to edit. Press Enter to add a new line, empty the element to remove it</div>`;
    alertMessage.querySelectorAll<HTMLElement>("div[contenteditable='true']").forEach(el => {
      el.addEventListener("input", changeRelationsHistory);
    });

    openRichDialog({
      content: window.alertMessage.innerHTML,
      title: "Relations history",
      position: { my: "center", at: "center", of: "svg" },
      buttons: {
        Save: function () {
          const data = (this as unknown as HTMLElement).querySelector("div")!.innerText.split("\n").join("\r\n");
          const name = `${getFileName("Relations history")}.txt`;
          downloadFile(data, name);
        },
        Clear: () => {
          pack.states[0].diplomacy = [];
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
    const group = (pack.states[0].diplomacy as unknown as string[][])[+parts[0]];
    if (this.innerHTML === "") {
      group.splice(+parts[1], 1);
      this.remove();
    } else group[+parts[1]] = this.innerHTML;
  }

  function showRelationsMatrix(): void {
    const states = pack.states.filter(s => s.i && !s.removed);
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

            const objectState = pack.states[valid[index]];
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
    const states = pack.states.filter(s => s.i && !s.removed);
    const valid = states.map(s => s.i);

    let data = `,${states.map(s => s.name).join(",")}\n`;
    states.forEach(s => {
      const rels = (s.diplomacy as string[]).filter((_v, i) => valid.includes(i));
      data += `${s.name},${rels.join(",")}\n`;
    });

    const name = `${getFileName("Relations")}.csv`;
    downloadFile(data, name);
  }

  function closeDiplomacyEditor(): void {
    restoreDefaultEvents?.();
    clearMainTip();
    const selected = body.querySelector("div.Self");
    if (selected) selected.classList.remove("Self");
    if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
    else toggleStates();
    debug.selectAll(".highlight").remove();
  }
}

declare global {
  interface Window {
    editDiplomacy: () => void;
  }
}

export function initDiplomacyEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
