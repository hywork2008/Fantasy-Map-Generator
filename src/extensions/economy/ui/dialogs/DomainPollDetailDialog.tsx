import React from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      title={t("extensions.titles.domainPoll")}
      onClose={() => closeDialog("domainPollDetail")}
      className="fmg-dialog--table"
    >
      <div style={{ padding: "0.5rem 0.75rem", minWidth: 480 }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <label>
            {t("extensions.domainPoll.state")}{" "}
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
            data-tip={t("extensions.domainPoll.refreshTip")}
            aria-label={t("extensions.domainPoll.refreshAria")}
            onClick={() => refreshDomainPollDetail(selected?.stateId)}
          />
        </div>

        {!selected ? (
          <div className="empty-message">{t("extensions.domainPoll.empty")}</div>
        ) : (
          <>
            <div style={{ fontSize: "0.9em", marginBottom: "0.5rem" }}>
              <strong>{selected.stateName}</strong> ·{" "}
              {t("extensions.domainPoll.summary", {
                mult: selected.pollMultiplier.toFixed(3),
                levy: selected.averageLevy.toFixed(2),
                extract: (selected.extractShare * 100).toFixed(0)
              })}
            </div>
            <table className="fmg-table" style={{ width: "100%", fontSize: "0.85em" }}>
              <thead>
                <tr>
                  <th>{t("extensions.domainPoll.burg")}</th>
                  <th>{t("extensions.domainPoll.province")}</th>
                  <th>{t("extensions.domainPoll.pop")}</th>
                  <th>{t("extensions.domainPoll.levy")}</th>
                  <th>{t("extensions.domainPoll.policy")}</th>
                  <th>{t("extensions.domainPoll.works")}</th>
                  <th>{t("extensions.domainPoll.weight")}</th>
                </tr>
              </thead>
              <tbody>
                {selected.seats.map(seat => (
                  <tr key={seat.burgId}>
                    <td>{seat.burgName}</td>
                    <td>{seat.provinceName}</td>
                    <td>{seat.population.toFixed(0)}</td>
                    <td>×{seat.levyRate.toFixed(2)}</td>
                    <td>{domainPolicyLabel(seat.policy, t)}</td>
                    <td>
                      {domainWorksLabel(seat.worksTarget, t)}{" "}
                      {seat.worksProgress > 0 ? `${seat.worksProgress}/100` : ""}
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

const POLICY_KEYS: Record<string, string> = {
  balanced: "extensions.domainPoll.policyBalanced",
  extract: "extensions.domainPoll.policyExtract",
  fortify: "extensions.domainPoll.policyFortify"
};

const WORKS_KEYS: Record<string, string> = {
  walls: "extensions.domainPoll.worksWalls",
  citadel: "extensions.domainPoll.worksCitadel",
  plaza: "extensions.domainPoll.worksPlaza"
};

function domainPolicyLabel(policy: string, t: (key: string) => string): string {
  return POLICY_KEYS[policy] ? t(POLICY_KEYS[policy]) : policy;
}

function domainWorksLabel(target: string, t: (key: string) => string): string {
  return WORKS_KEYS[target] ? t(WORKS_KEYS[target]) : target;
}
