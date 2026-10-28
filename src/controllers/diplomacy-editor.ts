import { color, interpolateString, pointer } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { generateWarCasusBelli } from "../generators/warCasusBelli";
import { StatesRenderer } from "../renderers";
import { legacyMutation } from "../runtime/worldRuntime";
import { refreshDiplomacyEditorData, selectDiplomacyRelation } from "../services/diplomacyEditorService";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { getDiplomacyEditorState, setDiplomacyEditorState } from "../store/diplomacyEditorState";
import { diplomacyHistoryDialogStore } from "../store/diplomacyHistoryDialogState";
import { closeDialogs, isDialogOpen, openDialog } from "../ui/dialogs/dialogService";
import { findCell, getAdjective } from "../utils";
import { type RelationKey, relations } from "../utils/diplomacyRelations";
import { EditorBus } from "../utils/editorBus";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { layerIsOn } from "../utils/layerUtils";
import { renderDiplomacyBadges } from "./diplomacy-badges";
import { interactionManager } from "./interactionManager";
import {
  scheduleWebglUpdate,
  toggleBiomes,
  toggleBorders,
  toggleCultures,
  toggleDiplomacy,
  toggleProvinces,
  toggleReligions,
  toggleStates
} from "./layers";
import { editStyle } from "./style";

export { type RelationKey, relations };

export function editDiplomacy(): void {
  if (view.customization) return;
  if (worldContext.pack.states.filter(s => s.i && !s.removed).length < 2) {
    tip("There should be at least 2 states to edit the diplomacy", false, "error");
    return;
  }

  closeDialogs("#diplomacyEditor, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (!layerIsOn("toggleDiplomacy")) toggleDiplomacy();
  if (layerIsOn("toggleProvinces")) toggleProvinces();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleReligions")) toggleReligions();

  refreshDiplomacyEditor();
  view.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(selectStateOnMapClick);

  if (isDialogOpen("diplomacyEditor")) return;

  document.addEventListener("fmg:webgl-map-pick", selectStateOnWebglMapPick);

  openDialog("diplomacyEditor");
}

function refreshDiplomacyEditor(): void {
  refreshDiplomacyEditorData();
  showStateRelations();
}

function showStateRelations(): void {
  const states = worldContext.pack.states;
  let sel = getDiplomacyEditorState()?.selectedStateId || 0;
  if (!sel || !states[sel] || states[sel].removed) {
    sel = states.find(s => s.i && !s.removed)?.i || 0;
  }
  if (!sel) return;
  if (!layerIsOn("toggleStates")) toggleStates();

  viewContext.diplomacySelectedStateId = sel;
  scheduleWebglUpdate();

  view.statesBody.selectAll("path").each(function () {
    const el = this as SVGPathElement;
    if (el.id.slice(0, 9) === "state-gap") return;
    const id = +el.id.slice(5);

    const relation = worldContext.pack.states[id].diplomacy![sel] as RelationKey;
    const c = relations[relation]?.color || "#4682b4";

    el.setAttribute("fill", c);
    view.statesBody.select(`#state-gap${id}`).attr("stroke", c);
    view.statesHalo.select(`#state-border${id}`).attr("stroke", color(c)?.darker().formatHex() ?? c);
  });

  if (layerIsOn("toggleDiplomacy")) renderDiplomacyBadges();
}

function selectStateOnMapClick(this: SVGElement, event: MouseEvent): void {
  const point = pointer(event, this);
  const i = findCell(point[0], point[1]);
  const state = worldContext.pack.cells.state![i];
  if (!state) return;

  setDiplomacyEditorState({ selectedStateId: state });
  refreshDiplomacyEditor();
}

function selectStateOnWebglMapPick(event: CustomEvent<import("../types/webglPicking").WebglPickDetail | null>): void {
  if (viewContext.renderMode !== "webglHybrid") return;
  const cellId = event.detail?.cellId;
  if (cellId === null || cellId === undefined) return;
  const state = worldContext.pack.cells.state?.[cellId];
  if (!state || worldContext.pack.states[state]?.removed) return;

  setDiplomacyEditorState({ selectedStateId: state });
  refreshDiplomacyEditor();
}

function changeRelation(subjectId: number, objectId: number, oldRelation: string, newRelation: string): void {
  if (newRelation === oldRelation) return;
  const states = worldContext.pack.states;
  const chronicle = states[0].diplomacy as unknown as string[][];

  const subjectName = states[subjectId].name;
  const objectName = states[objectId].name;

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
  const war = (): [string, string] => {
    const pack = worldContext.pack;
    const attackerRelId = pack.cells.religion?.[states[subjectId].center] ?? 0;
    const defenderRelId = pack.cells.religion?.[states[objectId].center] ?? 0;
    const cb = generateWarCasusBelli({
      attacker: states[subjectId],
      defender: states[objectId],
      attackerReligionName: pack.religions?.[attackerRelId]?.name,
      defenderReligionName: pack.religions?.[defenderRelId]?.name,
      attackerCultureName: pack.cultures?.[states[subjectId].culture]?.name,
      defenderCultureName: pack.cultures?.[states[objectId].culture]?.name,
      warCount: 1
    });
    return [`War declaration`, `${subjectName} declared war on ${objectName}, ${cb.reason}`];
  };
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

  legacyMutation(() => {
    states[subjectId].diplomacy![objectId] = newRelation;
    states[objectId].diplomacy![subjectId] =
      newRelation === "Vassal" ? "Suzerain" : newRelation === "Suzerain" ? "Vassal" : newRelation;

    if (oldRelation === "Enemy") chronicle.push(peace());
    else if (newRelation === "Enemy") chronicle.push(war());
    else if (newRelation === "Vassal") chronicle.push(vassal());
    else if (newRelation === "Suzerain") chronicle.push(suzerain());
    else if (newRelation === "Ally") chronicle.push(ally());
    else if (newRelation === "Unknown") chronicle.push(unknown());
    else if (newRelation === "Rival") chronicle.push(rival());
    else chronicle.push(change());
    return { result: undefined, topics: ["map.politics"] };
  });

  if (newRelation === "Enemy") {
    document.dispatchEvent(
      new CustomEvent("fmg:player-conflict-requested", {
        detail: { attackerStateId: subjectId, defenderStateId: objectId }
      })
    );
  } else if (oldRelation === "Enemy") {
    document.dispatchEvent(
      new CustomEvent("fmg:player-conflict-ended", {
        detail: { attackerStateId: subjectId, defenderStateId: objectId }
      })
    );
  }

  if (isDialogOpen("diplomacyEditor")) refreshDiplomacyEditor();
  else {
    refreshDiplomacyEditorData();
    if (layerIsOn("toggleDiplomacy")) renderDiplomacyBadges();
  }
}

function regenerateRelations(): void {
  legacyMutation(() => {
    GenerationPipeline.States.generateDiplomacy();
    return { result: undefined, topics: ["map.politics"] };
  });
  refreshDiplomacyEditor();
}

function resetRelations(): void {
  const selectedId = getDiplomacyEditorState()?.selectedStateId || 0;
  if (!selectedId) return;
  const states = worldContext.pack.states;

  const endedConflicts: number[] = [];
  legacyMutation(() => {
    (states[selectedId].diplomacy as string[]).forEach((rel, index) => {
      if (rel === "x") return;
      if (rel === "Enemy") endedConflicts.push(index);
      states[selectedId].diplomacy![index] = "Neutral";
      states[index].diplomacy![selectedId] = "Neutral";
    });
    return { result: undefined, topics: ["map.politics"] };
  });
  for (const stateId of endedConflicts) {
    document.dispatchEvent(
      new CustomEvent("fmg:player-conflict-ended", {
        detail: { attackerStateId: selectedId, defenderStateId: stateId }
      })
    );
  }

  refreshDiplomacyEditor();
}

function showRelationsHistory(): void {
  openRelationsHistory();
}

function openMatrix(): void {
  if (layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleProvinces")) toggleProvinces();
  if (!layerIsOn("toggleBiomes")) toggleBiomes();

  refreshDiplomacyEditor();
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
  document.removeEventListener("fmg:webgl-map-pick", selectStateOnWebglMapPick);
  viewContext.diplomacySelectedStateId = null;
  scheduleWebglUpdate();
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
  else toggleStates();
  view.debug.selectAll(".highlight").remove();
  // modules flag managed by CommonEditorDialog cleanup
}

export const diplomacyEditorActions = {
  refreshDiplomacyEditor,
  stateHighlightOn: (stateId: number) => {
    if (!layerIsOn("toggleStates")) return;
    if (view.customization || !stateId) return;
    // WebGL hybrid hides the SVG state paths, so this SVG-only outline is not always available.
    const statePath = view.regions.select<SVGPathElement>(`#state${stateId}`).node();
    const d = statePath?.getAttribute("d");
    if (!d) return;

    const path = view.debug
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
    view.debug.selectAll<SVGElement, unknown>(".highlight").transition().duration(1000).attr("opacity", 0).remove();
  },
  selectState: (stateId: number) => {
    setDiplomacyEditorState({ selectedStateId: stateId });
    diplomacyEditorActions.refreshDiplomacyEditor();
  },
  selectRelation: selectDiplomacyRelation,
  changeRelation,
  regenerateRelations,
  resetRelations,
  showRelationsHistory,
  openMatrix,
  downloadDiplomacyData,
  editStyle,
  closeDiplomacyEditor: closeDiplomacyEditorImpl
};

export function initDiplomacyEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}

const refreshRelationsHistoryIfOpen = () => {
  if (diplomacyHistoryDialogStore.getState().isOpen) {
    openRelationsHistory();
  }
};

document.addEventListener("fmg:refresh-editors", () => {
  if (isDialogOpen("diplomacyEditor")) diplomacyEditorActions.refreshDiplomacyEditor();
  refreshRelationsHistoryIfOpen();
});
document.addEventListener("fmg:generate-post-core", refreshRelationsHistoryIfOpen);
document.addEventListener("fmg:map-layers-reinitialized", refreshRelationsHistoryIfOpen);

export function openRelationsHistory(): void {
  const neutralState = worldContext.pack.states[0];
  const chronicle = neutralState.diplomacy as unknown as string[][];
  if (!chronicle.length) {
    legacyMutation(() => {
      (neutralState.diplomacy as unknown as string[][]) = [[]];
      return { result: undefined, topics: ["map.politics"] };
    });
  }

  diplomacyHistoryDialogStore.getState().open({
    chronicle: neutralState.diplomacy as unknown as string[][],
    onSave: (data: string) => {
      const name = `${getFileName("Relations history")}.txt`;
      downloadFile(data, name);
    },
    onClear: () => {
      legacyMutation(() => {
        neutralState.diplomacy = [];
        return { result: undefined, topics: ["map.politics"] };
      });
    },
    onChange: (groupIdx: number, entryIdx: number, value: string) => {
      legacyMutation(() => {
        // biome-ignore lint/suspicious/noExplicitAny: mixed chronicle array
        const group = (neutralState.diplomacy as any[])[groupIdx];
        if (!group) return { result: undefined, topics: [] };
        if (value === "") {
          group.splice(entryIdx, 1);
        } else {
          const current = group[entryIdx];
          if (typeof current === "object" && current !== null) {
            current.rawText = value;
          } else {
            group[entryIdx] = value;
          }
        }
        return { result: undefined, topics: ["map.politics"] };
      });
    }
  });
}
