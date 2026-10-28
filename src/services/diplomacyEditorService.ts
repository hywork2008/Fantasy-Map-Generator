import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import {
  type ConflictStatus,
  type DiplomacyRowData,
  getDiplomacyEditorState,
  setDiplomacyEditorState
} from "../store/diplomacyEditorState";
import { getDiplomacyMilitaryPersonnel } from "../utils/diplomacyMilitary";
import { type RelationKey, relations } from "../utils/diplomacyRelations";

function getTotalForces(state: (typeof worldContext.pack.states)[number]): number {
  return getDiplomacyMilitaryPersonnel(state, worldContext.options);
}

export function refreshDiplomacyEditorData(): void {
  const states = worldContext.pack.states;
  let selectedId = getDiplomacyEditorState()?.selectedStateId || 0;
  if (!selectedId || !states[selectedId] || states[selectedId].removed) {
    selectedId = states.find(s => s.i && !s.removed)!.i;
  }

  const rowData: DiplomacyRowData[] = [];
  const hasPlayerConflictAuthorization = (subjectId: number, objectId: number): boolean => {
    const values = simulationContext.extensions.nobility?.conflictAuthorizationsByState;
    if (typeof values !== "object" || values === null || Array.isArray(values)) return false;
    const subject = (values as Record<number, unknown>)[subjectId];
    return typeof subject === "object" && subject !== null && objectId in subject;
  };
  const getConflictStatus = (subjectId: number, objectId: number, relation: string): ConflictStatus => {
    if (relation !== "Enemy") return "none";
    if (worldContext.options.conflictAutonomy !== "playerDirected") return "autonomous";
    return hasPlayerConflictAuthorization(subjectId, objectId) ? "player" : "suspended";
  };

  // Self Row
  rowData.push({
    i: selectedId,
    name: states[selectedId].name,
    fullName: states[selectedId].fullName || "",
    color: "none",
    relation: "Self",
    conflictStatus: "none",
    inText: "Self",
    totalForces: getTotalForces(states[selectedId])
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
      conflictStatus: getConflictStatus(selectedId, state.i, relation),
      inText,
      totalForces: getTotalForces(state)
    });
  }

  const validStates = worldContext.pack.states.filter(s => s.i && !s.removed);
  const matrix = validStates.map(state => ({
    i: state.i,
    name: state.name,
    fullName: state.fullName,
    diplomacy: state.diplomacy as string[]
  }));

  setDiplomacyEditorState({
    states: rowData,
    matrix,
    selectedStateId: selectedId
  });
}

export function selectDiplomacyRelation(subjectId: number, objectId: number, currentRelation: string): void {
  refreshDiplomacyEditorData();
  setDiplomacyEditorState({
    relationDialog: {
      isOpen: true,
      subjectId,
      objectId,
      currentRelation
    }
  });
}
