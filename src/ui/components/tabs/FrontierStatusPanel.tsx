import { useEffect, useState } from "react";
import { FRONTIER_STAGE, simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../../context/worldContext";
import {
  getFrontierCandidateBlockerSummaries,
  getFrontierCandidateSummaries,
  getFrontierProjectSlots
} from "../../../generators/frontierExpansion";
import { formatDisaster } from "../../../generators/frontierGovernance";
import { getThreatCullProjectSummaries } from "../../../generators/wildernessEcology";
import { isFrontierExpansionPattern } from "../../../utils/initialSettlementPattern";

const STAGE_LABELS: Record<number, string> = {
  [FRONTIER_STAGE.wilderness]: "Wilderness",
  [FRONTIER_STAGE.outpost]: "Outpost",
  [FRONTIER_STAGE.settlement]: "Settlement",
  [FRONTIER_STAGE.incorporated]: "Incorporated"
};

/** A compact operational ledger: candidates, works, failures and the next legal transition. */
export function FrontierStatusPanel() {
  const [revision, setRevision] = useState(0);
  const world = worldContext;
  const simulation = simulationContext;

  useEffect(() => {
    const refresh = () => setRevision(current => current + 1);
    document.addEventListener("fmg:simulation-updated", refresh);
    return () => document.removeEventListener("fmg:simulation-updated", refresh);
  }, []);

  // Mid-generation (New Map) wipes pack fields before politics/states exist again.
  // Never index pack.states while the graph is incomplete.
  const states = world.pack?.states;
  const packReady = Array.isArray(states) && Boolean(world.pack?.cells);

  if (!packReady) return null;

  const candidates = getFrontierCandidateSummaries(world, simulation);
  const blockers = getFrontierCandidateBlockerSummaries(world, simulation);
  const projects = Object.values(simulation.frontier?.projects ?? {}).sort((a, b) => a.cellId - b.cellId);
  const cullProjects = getThreatCullProjectSummaries(world, simulation);
  const activeProjectCountByState = projects.reduce<Record<number, number>>((counts, project) => {
    counts[project.stateId] = (counts[project.stateId] ?? 0) + 1;
    return counts;
  }, {});
  const isFrontierMap = isFrontierExpansionPattern(world.options.initialSettlementPattern);

  if (!isFrontierMap && cullProjects.length === 0) return null;

  return (
    <section
      aria-label="Frontier operations"
      data-frontier-revision={revision}
      style={{ gridColumn: "1 / -1", display: "grid", gap: "6px" }}
    >
      <div data-tip="Annual frontier work uses state reserves. Public works reduce both support costs and disaster risk. Hunt/cull projects lower local danger without claiming land; wilderness can rewild over years.">
        Frontier operations
      </div>
      {cullProjects.length > 0 && (
        <div>
          <small>Active hunts (cull danger only — no annexation):</small>
          {cullProjects.map(project => {
            const state = states[project.stateId];
            const monster =
              project.monsterId === null ? null : world.pack.monsters?.find(entry => entry.i === project.monsterId);
            return (
              <small key={`cull-${project.cellId}`} style={{ display: "block" }}>
                {state?.name ?? `State ${project.stateId}`}: cell {project.cellId}
                {monster ? ` · ${monster.type} (r${monster.rarity}, power ${monster.power})` : " · residual danger"}
                {" · "}
                {project.progressYears} year(s)
                {project.lastOutcome ? ` · ${project.lastOutcome}` : ""}
              </small>
            );
          })}
        </div>
      )}
      {!isFrontierMap ? null : projects.length === 0 ? (
        <small>No active outposts. Fund a reserve above the candidate requirement, then advance to a new year.</small>
      ) : (
        projects.map(project => {
          const state = states[project.stateId];
          const governance = simulation.frontier?.governanceByState?.[project.stateId];
          const slots = getFrontierProjectSlots(project.stateId, world.pack.cells);
          const status = project.lastStatus;
          const nextStep =
            project.stage === FRONTIER_STAGE.outpost
              ? `${Math.max(0, 3 - project.supportYears)} supported year(s) to a settlement`
              : project.origin === "seaborne"
                ? "One further year establishes an overseas province, harbour, and sea route"
                : "A connected supply trail and one further year are required for incorporation";
          return (
            <div key={project.cellId} style={{ padding: "5px", borderLeft: "3px solid #7c6948" }}>
              <strong>{state?.name ?? `State ${project.stateId}`}</strong> · cell {project.cellId} ·{" "}
              {project.origin === "seaborne" ? "Seaborne " : ""}
              {STAGE_LABELS[project.stage]} · fronts {activeProjectCountByState[project.stateId] ?? 0}/{slots}
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
      {isFrontierMap && candidates.length > 0 && (
        <div>
          <small>Viable candidates:</small>
          {candidates.slice(0, 3).map(candidate => {
            const state = states[candidate.stateId];
            return (
              <small key={`${candidate.stateId}:${candidate.cellId}`} style={{ display: "block" }}>
                {state?.name ?? `State ${candidate.stateId}`}: cell {candidate.cellId} from{" "}
                {candidate.sourceCellIds.join(", ")} — {(candidate.colonists * world.populationRate).toFixed(0)} people;
                {candidate.origin === "seaborne" ? " seaborne expedition;" : ""} {candidate.sector}; score{" "}
                {candidate.score.toFixed(0)}, setup {candidate.setupCost}, reserve {candidate.requiredReserve}
              </small>
            );
          })}
        </div>
      )}
      {isFrontierMap && blockers.length > 0 && (
        <div>
          <small>Blocked expansion:</small>
          {blockers.slice(0, 3).map(blocker => {
            const state = states[blocker.stateId];
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
