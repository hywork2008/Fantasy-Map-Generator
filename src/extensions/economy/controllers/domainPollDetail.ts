import { openDialog } from "../../hostUi";
import { getAllDomainPollDetails } from "../generators/domainPollDetail";
import { setDomainPollDetailState } from "../store/domainPollDetailState";

/** PR-13 domain poll per-burg detail dialog. */
export function openDomainPollDetail(stateId?: number): void {
  openDialog("domainPollDetail");
  refreshDomainPollDetail(stateId);
}

export function refreshDomainPollDetail(stateId?: number): void {
  const details = getAllDomainPollDetails();
  const selected = stateId && details.some(d => d.stateId === stateId) ? stateId : (details[0]?.stateId ?? null);
  setDomainPollDetailState({ details, selectedStateId: selected });
}

export function selectDomainPollState(stateId: number): void {
  setDomainPollDetailState({ selectedStateId: stateId });
}
