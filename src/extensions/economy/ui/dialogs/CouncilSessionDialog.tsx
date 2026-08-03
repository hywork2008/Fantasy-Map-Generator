import React from "react";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import {
  openCouncilSession,
  refreshCouncilSession,
  selectCouncilReplaySession,
  selectCouncilSessionState
} from "../../controllers/councilSession";
import { useCouncilSessionState } from "../../store/councilSessionState";

/**
 * PR-13/14/15 — assembly chronicle, faction vote bars, and session replay scrubber.
 */
export const CouncilSessionDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("councilSession"));
  const rows = useCouncilSessionState(state => state.rows);
  const selectedStateId = useCouncilSessionState(state => state.selectedStateId);
  const replaySessionNumber = useCouncilSessionState(state => state.replaySessionNumber);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openCouncilSession(), 0);
  }, [isOpen]);

  const selected = rows.find(r => r.stateId === selectedStateId) ?? rows[0] ?? null;
  const log = selected ? [...selected.log].reverse() : [];

  const replaySnap =
    selected && replaySessionNumber != null
      ? (selected.snapshots.find(s => s.sessionNumber === replaySessionNumber) ?? null)
      : selected?.snapshots.length
        ? selected.snapshots[selected.snapshots.length - 1]!
        : null;

  const graphFactions = replaySnap?.factions?.length ? replaySnap.factions : (selected?.factionVotes ?? []);
  const graphLineVotes = replaySnap?.lineVotes ?? selected?.lineVotes;
  const graphSupport = replaySnap?.support ?? selected?.support ?? 0;
  const graphDebtYes = replaySnap?.debtVoteYes ?? selected?.debtVoteYes ?? 0;

  return (
    <Dialog
      isOpen={isOpen}
      title="Council Session Log"
      onClose={() => closeDialog("councilSession")}
      className="fmg-dialog--table"
    >
      <div style={{ padding: "0.5rem 0.75rem", minWidth: 540 }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap" }}>
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
          {selected && selected.snapshots.length > 0 ? (
            <label>
              Replay{" "}
              <select
                value={replaySessionNumber ?? selected.snapshots[selected.snapshots.length - 1]!.sessionNumber}
                onChange={e => selectCouncilReplaySession(Number(e.target.value))}
              >
                {selected.snapshots.map(s => (
                  <option key={s.sessionNumber} value={s.sessionNumber}>
                    #{s.sessionNumber} · Y{s.year}.M{s.month}
                    {s.councilFailed ? " · veto" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
              <strong>{selected.stateName}</strong> · {selected.form} · support {graphSupport}/100
              {graphDebtYes > 0 ? ` · debt vote ${(graphDebtYes * 100).toFixed(0)}% yes` : ""}
              {selected.coupLegitimacy != null ? ` · legitimacy ${selected.coupLegitimacy}` : ""}
              {selected.civilUnrest ? " · CIVIL UNREST" : ""}
              {selected.legitimacyWarActive
                ? ` · LEGIT WAR${selected.pretenderName ? ` (${selected.pretenderName})` : ""}`
                : ""}
              {selected.foreignDebtInDefault ? " · FX DEFAULT" : ""}
              {selected.tradeSanctionMult < 1 ? ` · trade ×${selected.tradeSanctionMult.toFixed(2)}` : ""}
              {selected.creditRating ? ` · rating ${selected.creditRating}` : ""}
            </div>

            {/* PR-15 faction vote bar graph */}
            {graphFactions.length > 0 ? (
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85em", marginBottom: "0.35rem" }}>
                  Faction vote graph
                  {replaySnap
                    ? ` — session #${replaySnap.sessionNumber} (Y${replaySnap.year}.M${replaySnap.month})`
                    : " — live"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {graphFactions.map(f => {
                    const leanPct = Math.max(0, Math.min(100, f.lean * 100));
                    const sharePct = Math.max(0, Math.min(100, f.share * 100));
                    return (
                      <div key={f.faction} style={{ fontSize: "0.8em" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>
                            {f.faction} · share {sharePct.toFixed(0)}%
                          </span>
                          <span>yes lean {leanPct.toFixed(0)}%</span>
                        </div>
                        <div
                          style={{
                            height: 10,
                            background: "var(--bg-secondary, #2a2a2a)",
                            borderRadius: 3,
                            overflow: "hidden",
                            position: "relative"
                          }}
                        >
                          <div
                            style={{
                              width: `${leanPct}%`,
                              height: "100%",
                              background: leanPct >= 50 ? "#4caf50" : "#e57373",
                              opacity: 0.35 + sharePct / 200
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {graphLineVotes ? (
                  <div style={{ fontSize: "0.8em", marginTop: "0.4rem", opacity: 0.9 }}>
                    Line yes: debt {(graphLineVotes.debtIssue * 100).toFixed(0)}% · war{" "}
                    {(graphLineVotes.warFooting * 100).toFixed(0)}% · tax{" "}
                    {(graphLineVotes.extraordinaryTax * 100).toFixed(0)}% · mil{" "}
                    {(graphLineVotes.militaryExpansion * 100).toFixed(0)}%
                  </div>
                ) : null}
                {replaySnap?.notes ? (
                  <div style={{ fontSize: "0.75em", marginTop: "0.25rem", opacity: 0.75 }}>{replaySnap.notes}</div>
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
