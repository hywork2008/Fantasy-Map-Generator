import React from "react";
import { useTranslation } from "react-i18next";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { openDebtNegotiation, refreshDebtNegotiation } from "../../controllers/debtNegotiation";
import { getWorldContext } from "../../economyContext";
import { negotiateDebtInterestRate } from "../../generators/moneylenders";
import { useDebtNegotiationState } from "../../store/debtNegotiationState";

/**
 * PR-12 — interest-rate negotiation panel for the named Banker syndicate.
 */
export const DebtNegotiationDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("debtNegotiation"));
  const view = useDebtNegotiationState(state => state.view);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openDebtNegotiation(), 0);
  }, [isOpen]);

  const handleNegotiate = (direction: 1 | -1) => {
    if (!view) return;
    const state = getWorldContext().pack.states?.[view.stateId];
    if (!state?.i) return;
    negotiateDebtInterestRate(state, direction);
    refreshDebtNegotiation(view.stateId);
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.debtNegotiation")}
      onClose={() => closeDialog("debtNegotiation")}
      className="fmg-dialog--narrow"
    >
      {!view ? (
        <div className="empty-message">No state available for debt negotiation.</div>
      ) : (
        <div className="debt-negotiation" style={{ padding: "0.5rem 0.75rem", minWidth: 320 }}>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>{view.stateName}</strong> · {view.form}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem 1rem", fontSize: "0.9em" }}>
            <span data-tip="Named Banker (primary syndicate member)">
              Banker: <strong>{view.bankerName}</strong>
            </span>
            <span data-tip="Effective monthly interest">
              Rate: <strong>{(view.debtInterestRate * 100).toFixed(2)}%</strong>
              {view.debtRateNegotiation !== 0
                ? ` (nego ${view.debtRateNegotiation > 0 ? "+" : ""}${view.debtRateNegotiation})`
                : ""}
            </span>
            <span data-tip="Public debt principal">Debt: {formatPrice(view.publicDebt)}</span>
            <span data-tip="Credit pool balance">Pool: {formatPrice(view.creditPoolBalance)}</span>
            <span data-tip="Assembly support">Council: {view.councilSupport}/100</span>
            <span data-tip="Last debt-issue faction vote yes share">
              Debt vote:{" "}
              {view.councilLastDebtVoteYes != null ? `${(view.councilLastDebtVoteYes * 100).toFixed(0)}% yes` : "—"}
            </span>
            <span data-tip="In public-debt default">Default: {view.debtInDefault ? "YES" : "—"}</span>
            <span data-tip="Military/merchant coup risk while in default">
              Coup risk: {view.debtCoupRisk ? "YES" : "—"}
            </span>
          </div>

          {view.factionShares ? (
            <div style={{ marginTop: "0.6rem", fontSize: "0.85em" }} data-tip="Council faction bloc shares">
              Factions: court {(view.factionShares.court * 100).toFixed(0)}% · merchants{" "}
              {(view.factionShares.merchants * 100).toFixed(0)}% · military{" "}
              {(view.factionShares.military * 100).toFixed(0)}% · clergy {(view.factionShares.clergy * 100).toFixed(0)}%
            </div>
          ) : null}

          {view.members.length > 0 ? (
            <table className="fmg-table" style={{ marginTop: "0.6rem", width: "100%", fontSize: "0.85em" }}>
              <thead>
                <tr>
                  <th>Syndicate</th>
                  <th>Greed</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {view.members.map(m => (
                  <tr key={m.characterId}>
                    <td>
                      {m.name}
                      {m.isBanker ? " (Banker)" : ""}
                    </td>
                    <td>{m.greed}</td>
                    <td>{m.weight.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ marginTop: "0.6rem", fontSize: "0.85em", opacity: 0.8 }}>
              Anonymous creditors (no capital-market syndicate yet).
            </div>
          )}

          {view.notes.length > 0 ? (
            <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem", fontSize: "0.85em" }}>
              {view.notes.map(n => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button
              type="button"
              className="button"
              disabled={!view.canNegotiate || view.debtInDefault}
              data-tip="Press the Banker for cheaper credit (costs public treasury bribe)"
              onClick={() => handleNegotiate(-1)}
            >
              Rate −
            </button>
            <button
              type="button"
              className="button"
              disabled={!view.canNegotiate || view.debtInDefault}
              data-tip="Accept harsher credit terms (raises interest; no bribe)"
              onClick={() => handleNegotiate(1)}
            >
              Rate +
            </button>
            <button
              type="button"
              className="icon-cw"
              data-tip="Refresh"
              aria-label="Refresh debt negotiation"
              onClick={() => refreshDebtNegotiation(view.stateId)}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
};
