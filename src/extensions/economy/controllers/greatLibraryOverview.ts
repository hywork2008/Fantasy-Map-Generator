import { openDialog } from "../../hostUi";
import { getGreatLibraryProjects, getWorldContext } from "../economyContext";
import { isGreatLibraryProjectOccupied, resolveGreatLibraryEligibility } from "../generators/greatLibrary";
import { GREAT_LIBRARY_BUILD_POINTS } from "../generators/greatLibraryTypes";
import {
  type GreatLibraryOverviewEligibilityRow,
  type GreatLibraryOverviewProjectRow,
  setGreatLibraryOverviewState
} from "../store/greatLibraryOverviewState";

/** Read-only status board for map makers/players (docs/plan/great-library.md PR6). */
export function open(): void {
  openDialog("greatLibraryOverview");
  refreshGreatLibraryOverview();
}

export function refreshGreatLibraryOverview(): void {
  const world = getWorldContext();
  const states = world.pack.states ?? [];
  const burgs = world.pack.burgs ?? [];

  const projects = getGreatLibraryProjects();
  const activeProjectStateIds = new Set(
    projects.filter(project => project.status !== "ruined").map(project => project.stateId)
  );

  const projectRows: GreatLibraryOverviewProjectRow[] = projects
    .map((project): GreatLibraryOverviewProjectRow => {
      const state = states[project.stateId];
      const burg = burgs[project.burgId];
      return {
        id: project.id,
        stateName: state?.name ?? `State ${project.stateId}`,
        burgName: burg?.name ?? `Burg ${project.burgId}`,
        status: project.status,
        phase: project.phase,
        progress: project.progress,
        buildPoints: GREAT_LIBRARY_BUILD_POINTS,
        startedYear: project.startedYear,
        completedYear: project.completedYear,
        ruinedYear: project.ruinedYear,
        totalSpent: project.totalSpent,
        endowment: project.endowment,
        occupied: project.status !== "ruined" && isGreatLibraryProjectOccupied(project)
      };
    })
    .toSorted((a, b) => b.id - a.id);

  // Eligibility breakdown is informational only, and only meaningful for a State without an
  // active project — one already mid-project always fails the "already has one" gate trivially.
  const eligibilityRows: GreatLibraryOverviewEligibilityRow[] = states
    .filter((state): state is NonNullable<typeof state> => !!state?.i && !state.removed)
    .filter(state => !activeProjectStateIds.has(state.i))
    .map((state): GreatLibraryOverviewEligibilityRow => {
      const result = resolveGreatLibraryEligibility(state, false);
      return {
        stateId: state.i,
        stateName: state.name ?? `State ${state.i}`,
        eligible: result.eligible,
        cultureOk: result.cultureOk,
        rulerOk: result.rulerOk,
        wealthOk: result.wealthOk,
        peaceOk: result.peaceOk,
        knowledgeValue: result.scores.knowledgeValue,
        rulerScore: result.scores.rulerScore,
        learning: result.scores.learning,
        treasury: result.scores.treasury,
        projectedCoverage: result.scores.projectedCoverage
      };
    })
    .toSorted((a, b) => Number(b.eligible) - Number(a.eligible) || b.rulerScore - a.rulerScore);

  setGreatLibraryOverviewState({ projects: projectRows, eligibility: eligibilityRows });
}
