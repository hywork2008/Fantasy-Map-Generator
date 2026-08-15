import React from "react";
import { useTranslation } from "react-i18next";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { open as openGreatLibraryOverview, refreshGreatLibraryOverview } from "../../controllers/greatLibraryOverview";
import type { GreatLibraryPhase, GreatLibraryStatus } from "../../generators/greatLibraryTypes";
import { useGreatLibraryOverviewState } from "../../store/greatLibraryOverviewState";

const STATUS_LABEL_KEY: Record<GreatLibraryStatus, string> = {
  planning: "extensions.greatLibrary.statusPlanning",
  building: "extensions.greatLibrary.statusBuilding",
  paused: "extensions.greatLibrary.statusPaused",
  completed: "extensions.greatLibrary.statusCompleted",
  ruined: "extensions.greatLibrary.statusRuined"
};

const PHASE_LABEL_KEY: Record<GreatLibraryPhase, string> = {
  sitePrep: "extensions.greatLibrary.phaseSitePrep",
  structure: "extensions.greatLibrary.phaseStructure",
  collection: "extensions.greatLibrary.phaseCollection",
  inauguration: "extensions.greatLibrary.phaseInauguration"
};

const STATUS_ICON: Record<GreatLibraryStatus, string> = {
  planning: "📜",
  building: "🏗️",
  paused: "⏸️",
  completed: "📚",
  ruined: "🏚️"
};

const GATE_TIP_KEY: Record<"culture" | "ruler" | "wealth" | "peace", string> = {
  culture: "extensions.greatLibrary.gateCulture",
  ruler: "extensions.greatLibrary.gateRuler",
  wealth: "extensions.greatLibrary.gateWealth",
  peace: "extensions.greatLibrary.gatePeace"
};

function GateMark({ ok, tip }: { ok: boolean; tip: string }): React.ReactElement {
  return (
    <span data-tip={tip} className={ok ? "great-library-gate great-library-gate--ok" : "great-library-gate"}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

export const GreatLibraryOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("greatLibraryOverview"));
  const projects = useGreatLibraryOverviewState(state => state.projects);
  const eligibility = useGreatLibraryOverviewState(state => state.eligibility);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openGreatLibraryOverview(), 0);
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.greatLibrary")}
      onClose={() => closeDialog("greatLibraryOverview")}
      className="fmg-dialog--table fmg-dialog--great-library-overview"
    >
      <div className="great-library-overview-dialog">
        <section className="great-library-overview-dialog__section" aria-labelledby="greatLibraryProjectsHeading">
          <h3 id="greatLibraryProjectsHeading">{t("extensions.greatLibrary.projects")}</h3>
          <div className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>{t("extensions.greatLibrary.status")}</th>
                  <th>{t("extensions.greatLibrary.state")}</th>
                  <th>{t("extensions.greatLibrary.city")}</th>
                  <th>{t("extensions.greatLibrary.phase")}</th>
                  <th className="numeric" data-tip={t("extensions.greatLibrary.progressTip")}>
                    {t("extensions.greatLibrary.progress")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.greatLibrary.spentTip")}>
                    {t("extensions.greatLibrary.spent")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.greatLibrary.endowmentTip")}>
                    {t("extensions.greatLibrary.endowment")}
                  </th>
                  <th className="numeric">{t("extensions.greatLibrary.started")}</th>
                  <th className="numeric">{t("extensions.greatLibrary.finished")}</th>
                </tr>
              </thead>
              {projects.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={9}>{t("extensions.greatLibrary.emptyProjects")}</td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {projects.map(row => (
                    <tr key={row.id} data-id={row.id} data-status={row.status}>
                      <td data-tip={row.occupied ? t("extensions.greatLibrary.occupied") : undefined}>
                        {STATUS_ICON[row.status]} {t(STATUS_LABEL_KEY[row.status])}
                        {row.occupied ? t("extensions.greatLibrary.occupiedSuffix") : ""}
                      </td>
                      <td>{row.stateName}</td>
                      <td>{row.burgName}</td>
                      <td>{t(PHASE_LABEL_KEY[row.phase])}</td>
                      <td className="numeric">
                        {row.status === "ruined" ? "—" : `${Math.round((row.progress / row.buildPoints) * 100)}%`}
                      </td>
                      <td className="numeric">{Math.round(row.totalSpent)}</td>
                      <td className="numeric">
                        {row.status === "completed" ? `${Math.round(row.endowment * 100)}%` : "—"}
                      </td>
                      <td className="numeric">{row.startedYear}</td>
                      <td className="numeric">{row.completedYear ?? row.ruinedYear ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </section>

        <section className="great-library-overview-dialog__section" aria-labelledby="greatLibraryEligibilityHeading">
          <h3 id="greatLibraryEligibilityHeading">{t("extensions.greatLibrary.eligibility")}</h3>
          <p className="note">{t("extensions.greatLibrary.eligibilityNote")}</p>
          <div className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>{t("extensions.greatLibrary.state")}</th>
                  <th data-tip={t(GATE_TIP_KEY.culture)}>{t("extensions.greatLibrary.culture")}</th>
                  <th data-tip={t(GATE_TIP_KEY.ruler)}>{t("extensions.greatLibrary.ruler")}</th>
                  <th data-tip={t(GATE_TIP_KEY.wealth)}>{t("extensions.greatLibrary.wealth")}</th>
                  <th data-tip={t(GATE_TIP_KEY.peace)}>{t("extensions.greatLibrary.peace")}</th>
                  <th className="numeric" data-tip={t("extensions.greatLibrary.knowledgeTip")}>
                    {t("extensions.greatLibrary.knowledge")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.greatLibrary.rulerScoreTip")}>
                    {t("extensions.greatLibrary.rulerScore")}
                  </th>
                  <th className="numeric">{t("extensions.greatLibrary.treasury")}</th>
                </tr>
              </thead>
              {eligibility.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={8}>{t("extensions.greatLibrary.emptyEligibility")}</td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {eligibility.map(row => (
                    <tr key={row.stateId} data-state-id={row.stateId} data-eligible={row.eligible}>
                      <td>{row.stateName}</td>
                      <td>
                        <GateMark ok={row.cultureOk} tip={t(GATE_TIP_KEY.culture)} />
                      </td>
                      <td>
                        <GateMark ok={row.rulerOk} tip={t(GATE_TIP_KEY.ruler)} />
                      </td>
                      <td>
                        <GateMark ok={row.wealthOk} tip={t(GATE_TIP_KEY.wealth)} />
                      </td>
                      <td>
                        <GateMark ok={row.peaceOk} tip={t(GATE_TIP_KEY.peace)} />
                      </td>
                      <td className="numeric">{row.knowledgeValue.toFixed(2)}</td>
                      <td className="numeric">{row.rulerScore.toFixed(2)}</td>
                      <td className="numeric">{Math.round(row.treasury)}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </section>

        <div className="footer">
          <button
            type="button"
            id="greatLibraryOverviewRefresh"
            data-tip={t("extensions.greatLibrary.refreshTip")}
            className="icon-cw"
            onClick={refreshGreatLibraryOverview}
          />
        </div>
      </div>
    </Dialog>
  );
};
