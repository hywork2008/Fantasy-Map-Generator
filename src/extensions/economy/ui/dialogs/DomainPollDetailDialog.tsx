import React from "react";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import {
  openDomainPollDetail,
  refreshDomainPollDetail,
  selectDomainPollState
} from "../../controllers/domainPollDetail";
import { useDomainPollDetailState } from "../../store/domainPollDetailState";

/**
 * PR-13 — per-burg domain levy contribution to state poll tax.
 */
export const DomainPollDetailDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("domainPollDetail"));
  const details = useDomainPollDetailState(state => state.details);
  const selectedStateId = useDomainPollDetailState(state => state.selectedStateId);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openDomainPollDetail(), 0);
  }, [isOpen]);

  const selected = details.find(d => d.stateId === selectedStateId) ?? details[0] ?? null;

  return (
    <Dialog
      isOpen={isOpen}
      title="Domain Poll Detail"
      onClose={() => closeDialog("domainPollDetail")}
      className="fmg-dialog--table"
    >
      <div style={{ padding: "0.5rem 0.75rem", minWidth: 480 }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <label>
            State{" "}
            <select value={selected?.stateId ?? ""} onChange={e => selectDomainPollState(Number(e.target.value))}>
              {details.map(d => (
                <option key={d.stateId} value={d.stateId}>
                  {d.stateName} (×{d.pollMultiplier.toFixed(2)})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-cw"
            data-tip="Refresh"
            aria-label="Refresh domain poll detail"
            onClick={() => refreshDomainPollDetail(selected?.stateId)}
          />
        </div>

        {!selected ? (
          <div className="empty-message">No provincial domain seats found.</div>
        ) : (
          <>
            <div style={{ fontSize: "0.9em", marginBottom: "0.5rem" }}>
              <strong>{selected.stateName}</strong> · poll mult <strong>×{selected.pollMultiplier.toFixed(3)}</strong> ·
              avg levy {selected.averageLevy.toFixed(2)} · extract share {(selected.extractShare * 100).toFixed(0)}%
            </div>
            <table className="fmg-table" style={{ width: "100%", fontSize: "0.85em" }}>
              <thead>
                <tr>
                  <th>Burg</th>
                  <th>Province</th>
                  <th>Pop</th>
                  <th>Levy</th>
                  <th>Policy</th>
                  <th>Works</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {selected.seats.map(seat => (
                  <tr key={seat.burgId}>
                    <td>{seat.burgName}</td>
                    <td>{seat.provinceName}</td>
                    <td>{seat.population.toFixed(0)}</td>
                    <td>×{seat.levyRate.toFixed(2)}</td>
                    <td>{seat.policy}</td>
                    <td>
                      {seat.worksTarget} {seat.worksProgress > 0 ? `${seat.worksProgress}/100` : ""}
                    </td>
                    <td>{(seat.weightShare * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Dialog>
  );
};
