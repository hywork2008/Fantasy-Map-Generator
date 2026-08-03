import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { getCouncilSessionLog } from "../generators/councilSession";
import { type CouncilSessionRow, setCouncilSessionState } from "../store/councilSessionState";

/** PR-13 council session chronicle dialog. */
export function openCouncilSession(stateId?: number): void {
  openDialog("councilSession");
  refreshCouncilSession(stateId);
}

export function refreshCouncilSession(stateId?: number): void {
  const { pack } = getWorldContext();
  const rows: CouncilSessionRow[] = [];
  for (const state of pack.states || []) {
    if (!state?.i || state.removed) continue;
    const log = getCouncilSessionLog(state);
    if (!(state.councilSessionNumber || 0) && log.length === 0) continue;
    rows.push({
      stateId: state.i,
      stateName: state.name || `State ${state.i}`,
      form: state.form || "—",
      sessionNumber: state.councilSessionNumber || 0,
      support: rn(state.councilSupport ?? 0, 1),
      debtVoteYes: rn(state.councilLastDebtVoteYes ?? 0, 3),
      log
    });
  }
  rows.sort((a, b) => b.sessionNumber - a.sessionNumber || a.stateName.localeCompare(b.stateName));
  const selected = stateId && rows.some(r => r.stateId === stateId) ? stateId : (rows[0]?.stateId ?? null);
  setCouncilSessionState({ rows, selectedStateId: selected });
}

export function selectCouncilSessionState(stateId: number): void {
  setCouncilSessionState({ selectedStateId: stateId });
}
