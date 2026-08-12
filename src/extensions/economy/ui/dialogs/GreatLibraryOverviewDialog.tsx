import React from "react";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { open as openGreatLibraryOverview, refreshGreatLibraryOverview } from "../../controllers/greatLibraryOverview";
import type { GreatLibraryStatus } from "../../generators/greatLibraryTypes";
import { useGreatLibraryOverviewState } from "../../store/greatLibraryOverviewState";

const STATUS_LABEL: Record<GreatLibraryStatus, string> = {
  planning: "Planning",
  building: "Under construction",
  paused: "Paused",
  completed: "Completed",
  ruined: "Ruined"
};

const STATUS_ICON: Record<GreatLibraryStatus, string> = {
  planning: "📜",
  building: "🏗️",
  paused: "⏸️",
  completed: "📚",
  ruined: "🏚️"
};

const GATE_TIP: Record<"culture" | "ruler" | "wealth" | "peace", string> = {
  culture: "Culture.knowledgeValue is scholarly enough (docs/plan/great-library.md KD-2)",
  ruler: "A living ruler with enough learning and a knowledge-valuing court (KD-3)",
  wealth: "Treasury clears the floor and a full year's construction budget (KD-4)",
  peace: "No active 'Enemy' diplomacy relation (KD-4 W3)"
};

function GateMark({ ok, tip }: { ok: boolean; tip: string }): React.ReactElement {
  return (
    <span data-tip={tip} className={ok ? "great-library-gate great-library-gate--ok" : "great-library-gate"}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

export const GreatLibraryOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("greatLibraryOverview"));
  const projects = useGreatLibraryOverviewState(state => state.projects);
  const eligibility = useGreatLibraryOverviewState(state => state.eligibility);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openGreatLibraryOverview(), 0);
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Great Library Overview"
      onClose={() => closeDialog("greatLibraryOverview")}
      className="fmg-dialog--table fmg-dialog--great-library-overview"
    >
      <div className="great-library-overview-dialog">
        <section className="great-library-overview-dialog__section" aria-labelledby="greatLibraryProjectsHeading">
          <h3 id="greatLibraryProjectsHeading">Projects</h3>
          <div className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>Status</th>
                  <th>State</th>
                  <th>City</th>
                  <th>Phase</th>
                  <th data-tip="Progress toward completion">Progress</th>
                  <th data-tip="Cumulative treasury spend on this project">Spent</th>
                  <th data-tip="Post-completion vitality (funds upkeep, decays without it)">Endowment</th>
                  <th>Started</th>
                  <th>Finished</th>
                </tr>
              </thead>
              {projects.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={9}>No Great Library has been proposed on this map yet.</td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {projects.map(row => (
                    <tr key={row.id} data-id={row.id} data-status={row.status}>
                      <td data-tip={row.occupied ? "Site occupied by a foreign State" : undefined}>
                        {STATUS_ICON[row.status]} {STATUS_LABEL[row.status]}
                        {row.occupied ? " (occupied)" : ""}
                      </td>
                      <td>{row.stateName}</td>
                      <td>{row.burgName}</td>
                      <td>{row.phase}</td>
                      <td>
                        {row.status === "ruined" ? "—" : `${Math.round((row.progress / row.buildPoints) * 100)}%`}
                      </td>
                      <td>{Math.round(row.totalSpent)}</td>
                      <td>{row.status === "completed" ? `${Math.round(row.endowment * 100)}%` : "—"}</td>
                      <td>{row.startedYear}</td>
                      <td>{row.completedYear ?? row.ruinedYear ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </section>

        <section className="great-library-overview-dialog__section" aria-labelledby="greatLibraryEligibilityHeading">
          <h3 id="greatLibraryEligibilityHeading">States without a Great Library</h3>
          <p className="note">
            Every gate (culture, ruler, wealth, peace) must pass for a State to begin construction on its own next
            settle year (docs/plan/great-library.md KD-2/3/4).
          </p>
          <div className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>State</th>
                  <th data-tip={GATE_TIP.culture}>Culture</th>
                  <th data-tip={GATE_TIP.ruler}>Ruler</th>
                  <th data-tip={GATE_TIP.wealth}>Wealth</th>
                  <th data-tip={GATE_TIP.peace}>Peace</th>
                  <th data-tip="Culture.knowledgeValue">Knowledge</th>
                  <th data-tip="Ruler score (excellence x how much patronage values knowledge)">Ruler score</th>
                  <th>Treasury</th>
                </tr>
              </thead>
              {eligibility.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={8}>Every State already has an active or ruined Great Library project.</td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {eligibility.map(row => (
                    <tr key={row.stateId} data-state-id={row.stateId} data-eligible={row.eligible}>
                      <td>{row.stateName}</td>
                      <td>
                        <GateMark ok={row.cultureOk} tip={GATE_TIP.culture} />
                      </td>
                      <td>
                        <GateMark ok={row.rulerOk} tip={GATE_TIP.ruler} />
                      </td>
                      <td>
                        <GateMark ok={row.wealthOk} tip={GATE_TIP.wealth} />
                      </td>
                      <td>
                        <GateMark ok={row.peaceOk} tip={GATE_TIP.peace} />
                      </td>
                      <td>{row.knowledgeValue.toFixed(2)}</td>
                      <td>{row.rulerScore.toFixed(2)}</td>
                      <td>{Math.round(row.treasury)}</td>
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
            data-tip="Refresh projects and eligibility"
            className="icon-cw"
            onClick={refreshGreatLibraryOverview}
          />
        </div>
      </div>
    </Dialog>
  );
};
