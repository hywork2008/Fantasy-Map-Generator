import React from "react";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { openCouncilSession, refreshCouncilSession, selectCouncilSessionState } from "../../controllers/councilSession";
import { useCouncilSessionState } from "../../store/councilSessionState";

/**
 * PR-13/14 — assembly session chronicle + faction vote detail panel.
 */
export const CouncilSessionDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("councilSession"));
  const rows = useCouncilSessionState(state => state.rows);
  const selectedStateId = useCouncilSessionState(state => state.selectedStateId);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openCouncilSession(), 0);
  }, [isOpen]);

  const selected = rows.find(r => r.stateId === selectedStateId) ?? rows[0] ?? null;
  const log = selected ? [...selected.log].reverse() : [];

  return (
    <Dialog
      isOpen={isOpen}
      title="Council Session Log"
      onClose={() => closeDialog("councilSession")}
      className="fmg-dialog--table"
    >
      <div style={{ padding: "0.5rem 0.75rem", minWidth: 520 }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <label>
            State{" "}
            <select value={selected?.stateId ?? ""} onChange={e => selectCouncilSessionState(Number(e.target.value))}>
              {rows.map(r => (
                <option key={r.stateId} value={r.stateId}>
                  {r.stateName} (#{r.sessionNumber})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-cw"
            data-tip="Refresh"
            aria-label="Refresh council session log"
            onClick={() => refreshCouncilSession(selected?.stateId)}
          />
        </div>

        {!selected ? (
          <div className="empty-message">No assembly sessions recorded yet — run a tax cycle first.</div>
        ) : (
          <>
            <div style={{ fontSize: "0.9em", marginBottom: "0.5rem" }}>
              <strong>{selected.stateName}</strong> · {selected.form} · support {selected.support}/100
              {selected.debtVoteYes > 0 ? ` · last debt vote ${(selected.debtVoteYes * 100).toFixed(0)}% yes` : ""}
              {selected.coupLegitimacy != null ? ` · legitimacy ${selected.coupLegitimacy}` : ""}
              {selected.civilUnrest ? " · CIVIL UNREST" : ""}
              {selected.foreignDebtInDefault ? " · FX DEFAULT" : ""}
            </div>

            {/* PR-14 faction vote detail */}
            {selected.factionVotes.length > 0 ? (
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85em", marginBottom: "0.25rem" }}>
                  Faction vote detail (last debt-issue motion)
                </div>
                <table className="fmg-table" style={{ width: "100%", fontSize: "0.85em" }}>
                  <thead>
                    <tr>
                      <th>Faction</th>
                      <th>Share</th>
                      <th>Yes lean</th>
                      <th>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.factionVotes.map(f => (
                      <tr key={f.faction}>
                        <td>{f.faction}</td>
                        <td>{(f.share * 100).toFixed(0)}%</td>
                        <td>{(f.lean * 100).toFixed(0)}%</td>
                        <td>{(f.contribution * 100).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selected.lineVotes ? (
                  <div style={{ fontSize: "0.8em", marginTop: "0.35rem", opacity: 0.9 }}>
                    Line yes: debt {(selected.lineVotes.debtIssue * 100).toFixed(0)}% · war{" "}
                    {(selected.lineVotes.warFooting * 100).toFixed(0)}% · tax{" "}
                    {(selected.lineVotes.extraordinaryTax * 100).toFixed(0)}% · mil{" "}
                    {(selected.lineVotes.militaryExpansion * 100).toFixed(0)}%
                  </div>
                ) : null}
              </div>
            ) : null}

            <table className="fmg-table" style={{ width: "100%", fontSize: "0.85em" }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {log.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No log lines for this state.</td>
                  </tr>
                ) : (
                  log.map(entry => (
                    <tr key={entry.id}>
                      <td>
                        Y{entry.year}.M{entry.month}
                      </td>
                      <td>{entry.kind}</td>
                      <td data-tip={entry.factionDetail || entry.summary}>{entry.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Dialog>
  );
};
