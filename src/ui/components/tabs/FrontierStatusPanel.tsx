import { useEffect, useState } from "react";
import { FRONTIER_STAGE } from "../../../context/simulationContext";
import {
  getFrontierCandidateBlockerSummaries,
  getFrontierCandidateSummaries
} from "../../../generators/frontierExpansion";
import { formatDisaster } from "../../../generators/frontierGovernance";

const STAGE_LABELS: Record<number, string> = {
  [FRONTIER_STAGE.wilderness]: "Wilderness",
  [FRONTIER_STAGE.outpost]: "Outpost",
  [FRONTIER_STAGE.settlement]: "Settlement",
  [FRONTIER_STAGE.incorporated]: "Incorporated"
};

/** A compact operational ledger: candidates, works, failures and the next legal transition. */
export function FrontierStatusPanel() {
  const [revision, setRevision] = useState(0);
  const { world, simulation } = window.fmg;

  useEffect(() => {
    const refresh = () => setRevision(current => current + 1);
    document.addEventListener("fmg:simulation-updated", refresh);
    return () => document.removeEventListener("fmg:simulation-updated", refresh);
  }, []);

  const candidates = getFrontierCandidateSummaries(world, simulation);
  const blockers = getFrontierCandidateBlockerSummaries(world, simulation);
  const projects = Object.values(simulation.frontier.projects).sort((a, b) => a.cellId - b.cellId);
  const isFrontierMap =
    world.options.initialSettlementPattern === "frontier" || world.options.initialSettlementPattern === "scattered";

  if (!isFrontierMap) return null;

  return (
    <section
      aria-label="Frontier operations"
      data-frontier-revision={revision}
      style={{ gridColumn: "1 / -1", display: "grid", gap: "6px" }}
    >
      <div data-tip="Annual frontier work uses state reserves. Public works reduce both support costs and disaster risk.">
        Frontier operations
      </div>
      {projects.length === 0 ? (
        <small>No active outposts. Fund a reserve above the candidate requirement, then advance to a new year.</small>
      ) : (
        projects.map(project => {
          const state = world.pack.states[project.stateId];
          const governance = simulation.frontier.governanceByState[project.stateId];
          const status = project.lastStatus;
          const nextStep =
            project.stage === FRONTIER_STAGE.outpost
              ? `${Math.max(0, 3 - project.supportYears)} supported year(s) to a settlement`
              : "A connected supply trail and one further year are required for incorporation";
          return (
            <div key={project.cellId} style={{ padding: "5px", borderLeft: "3px solid #7c6948" }}>
              <strong>{state?.name ?? `State ${project.stateId}`}</strong> · cell {project.cellId} ·{" "}
              {STAGE_LABELS[project.stage]}
              <br />
              <small>
                Policy: {governance?.policy ?? "balanced"}; works:{" "}
                {governance
                  ? Object.entries(governance.investments)
                      .filter(([, level]) => level > 0)
                      .map(([name, level]) => `${name} ${level}`)
                      .join(", ") || "none"
                  : "none"}
                {governance?.reliefSpent ? `; relief spent ${governance.reliefSpent}` : ""}
              </small>
              <br />
              <small>Next: {nextStep}</small>
              {status && (
                <small style={{ display: "block" }}>
                  Last annual result: {status.outcome}
                  {status.disaster ? ` — ${formatDisaster(status.disaster)} (recovery ${status.recoveryCost})` : ""}
                  {status.failureReasons.length ? `; ${status.failureReasons.join("; ")}` : ""}
                </small>
              )}
            </div>
          );
        })
      )}
      {candidates.length > 0 && (
        <div>
          <small>Viable candidates:</small>
          {candidates.slice(0, 3).map(candidate => {
            const state = world.pack.states[candidate.stateId];
            return (
              <small key={`${candidate.stateId}:${candidate.cellId}`} style={{ display: "block" }}>
                {state?.name ?? `State ${candidate.stateId}`}: cell {candidate.cellId} from{" "}
                {candidate.sourceCellIds.join(", ")} — {candidate.colonists.toFixed(1)} colonists; score{" "}
                {candidate.score.toFixed(0)}, setup {candidate.setupCost}, reserve {candidate.requiredReserve}
              </small>
            );
          })}
        </div>
      )}
      {blockers.length > 0 && (
        <div>
          <small>Blocked expansion:</small>
          {blockers.slice(0, 3).map(blocker => {
            const state = world.pack.states[blocker.stateId];
            return (
              <small key={blocker.stateId} style={{ display: "block" }}>
                {state?.name ?? `State ${blocker.stateId}`}: {blocker.reason}
              </small>
            );
          })}
        </div>
      )}
    </section>
  );
}
