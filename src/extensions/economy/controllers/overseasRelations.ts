import { closeDialog, openDialog } from "../../hostUi";
import { getWorldContext } from "../economyContext";
import { OverseasRelations } from "../generators/overseasRelations";
import {
  getOverseasRelationsState,
  type OverseasRelationsStateOption,
  setOverseasRelationsState
} from "../store/overseasRelationsState";

function getStateName(stateId: number): string {
  const state = getWorldContext().pack.states?.[stateId];
  return state?.name || `State #${stateId}`;
}

function buildStateOptions(): OverseasRelationsStateOption[] {
  return OverseasRelations.listEligibleStateIds().map(stateId => ({ stateId, name: getStateName(stateId) }));
}

export function open(): void {
  refresh();
  openDialog("overseasRelations");
}

export function close(): void {
  closeDialog("overseasRelations");
}

/** Rebuilds the eligible-state list and the selected state's realm rows from live generator state. */
export function refresh(): void {
  const stateOptions = buildStateOptions();
  const priorSelection = getOverseasRelationsState().selectedStateId;
  const selectedStateId =
    priorSelection !== null && stateOptions.some(option => option.stateId === priorSelection)
      ? priorSelection
      : (stateOptions[0]?.stateId ?? null);

  setOverseasRelationsState({
    stateOptions,
    selectedStateId,
    rows: selectedStateId !== null ? OverseasRelations.getOverseasRelationsOverview(selectedStateId) : [],
    activeExpeditionCount: selectedStateId !== null ? OverseasRelations.getActiveExpeditionCount(selectedStateId) : 0
  });
}

export function selectState(stateId: number): void {
  setOverseasRelationsState({ selectedStateId: stateId, lastActionMessage: null });
  refresh();
}

export function sendTradeExpedition(realmId: number): void {
  const stateId = getOverseasRelationsState().selectedStateId;
  if (stateId === null) return;
  const result = OverseasRelations.sendTradeExpedition(stateId, realmId);
  setOverseasRelationsState({ lastActionMessage: result.ok ? "sent" : result.reason });
  refresh();
}
