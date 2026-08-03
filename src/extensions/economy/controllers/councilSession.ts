import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { getCouncilSessionLog } from "../generators/councilSession";
import { getCouncilSessionSnapshots } from "../generators/councilSessionReplay";
import { type CouncilSessionRow, setCouncilSessionState } from "../store/councilSessionState";

/** PR-13/15 council session chronicle + replay dialog. */
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
    const snapshots = getCouncilSessionSnapshots(state).map(s => ({
      sessionNumber: s.sessionNumber,
      year: s.year,
      month: s.month,
      support: s.support,
      debtVoteYes: s.debtVoteYes,
      lineVotes: s.lineVotes,
      factions: s.factions.map(f => ({
        faction: f.faction,
        share: f.share,
        lean: f.lean,
        contribution: f.contribution
      })),
      councilFailed: s.councilFailed,
      notes: s.notes
    }));
    if (!(state.councilSessionNumber || 0) && log.length === 0 && snapshots.length === 0) continue;
    rows.push({
      stateId: state.i,
      stateName: state.name || `State ${state.i}`,
      form: state.form || "—",
      sessionNumber: state.councilSessionNumber || 0,
      support: rn(state.councilSupport ?? 0, 1),
      debtVoteYes: rn(state.councilLastDebtVoteYes ?? 0, 3),
      factionVotes: (state.councilLastVoteFactionDetail || []).map(d => ({
        faction: d.faction,
        share: d.share,
        lean: d.lean,
        contribution: d.contribution
      })),
      lineVotes: state.councilLastLineVotes
        ? {
            debtIssue: state.councilLastLineVotes.debtIssue,
            warFooting: state.councilLastLineVotes.warFooting,
            extraordinaryTax: state.councilLastLineVotes.extraordinaryTax,
            militaryExpansion: state.councilLastLineVotes.militaryExpansion
          }
        : null,
      coupLegitimacy: state.coupLegitimacy !== undefined ? rn(state.coupLegitimacy, 1) : null,
      civilUnrest: Boolean(state.civilUnrest),
      foreignDebtInDefault: Boolean(state.foreignDebtInDefault),
      creditRating: state.creditRating ?? null,
      tradeSanctionMult: rn(state.tradeSanctionMult ?? 1, 3),
      legitimacyWarActive: Boolean(state.legitimacyWarActive),
      pretenderName: state.legitimacyPretenderName ?? null,
      snapshots,
      log
    });
  }
  rows.sort((a, b) => b.sessionNumber - a.sessionNumber || a.stateName.localeCompare(b.stateName));
  const selected = stateId && rows.some(r => r.stateId === stateId) ? stateId : (rows[0]?.stateId ?? null);
  setCouncilSessionState({ rows, selectedStateId: selected, replaySessionNumber: null });
}

export function selectCouncilSessionState(stateId: number): void {
  setCouncilSessionState({ selectedStateId: stateId, replaySessionNumber: null });
}

export function selectCouncilReplaySession(sessionNumber: number | null): void {
  setCouncilSessionState({ replaySessionNumber: sessionNumber });
}
