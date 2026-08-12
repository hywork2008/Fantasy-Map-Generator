import type { RNGService } from "../../../context/appServices";
import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import { getCultureKnowledgeValue, isStateInActiveConflict, stateHasEnemy } from "../../hostCore";
import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";
import {
  getAcademyKnowledgeStocks,
  getApi,
  getGreatLibraryLastSettledYear,
  getGreatLibraryNextId,
  getGreatLibraryProjects,
  getSimulationYear,
  getWorldContext,
  isEconomyContextReady,
  setAcademyKnowledgeStocks,
  setGreatLibraryLastSettledYear,
  setGreatLibraryNextId,
  setGreatLibraryProjects
} from "../economyContext";
import {
  checkGreatLibraryEligibility,
  checkGreatLibraryMaintain,
  commitmentScholarshipAffinity,
  type GreatLibraryRulerTraits,
  isGreatLibraryTheocracyState
} from "./greatLibraryEligibility";
import {
  GREAT_LIBRARY_BUDGET_SHARE,
  GREAT_LIBRARY_BUILD_POINTS,
  GREAT_LIBRARY_COMPLETION_ACADEMY_BOOST,
  GREAT_LIBRARY_COMPLETION_ENDOWMENT,
  GREAT_LIBRARY_CONQUEST_BUILDING_PROGRESS_MULT,
  GREAT_LIBRARY_CONQUEST_BUILDING_RUIN_CHANCE,
  GREAT_LIBRARY_CONQUEST_COMPLETED_ENDOWMENT_MULT,
  GREAT_LIBRARY_CONQUEST_COMPLETED_RUIN_CHANCE,
  GREAT_LIBRARY_ENDOWMENT_MAINTAIN_SPEND_FACTOR,
  GREAT_LIBRARY_FIRE_CHANCE_BUILDING,
  GREAT_LIBRARY_FIRE_CHANCE_COMPLETED,
  GREAT_LIBRARY_FIRE_CHANCE_PAUSED,
  GREAT_LIBRARY_FIRE_SEVERITY_WEIGHTS,
  GREAT_LIBRARY_PAUSE_DECAY_AFTER_YEARS,
  GREAT_LIBRARY_PAUSE_DECAY_RATE,
  GREAT_LIBRARY_PROGRESS_PER_FULL_COVERAGE,
  GREAT_LIBRARY_REBUILD_COOLDOWN_YEARS,
  GREAT_LIBRARY_TARGET_ANNUAL_SPEND,
  GREAT_LIBRARY_WARTIME_PROGRESS_FACTOR,
  type GreatLibraryEligibility,
  type GreatLibraryFireSeverity,
  type GreatLibraryPhase,
  type GreatLibraryProject,
  type GreatLibraryStatus
} from "./greatLibraryTypes";

/**
 * Royal-patronage Great Library system (docs/plan/great-library.md). One State-scoped
 * `GreatLibraryProject` per State at most, running through planning → building → (paused ⇄
 * building) → completed, with conquest/fire able to send it to a terminal "ruined" state at any
 * point after planning. Settles once per simulation year — see settleAnnual() for the exact
 * per-project state machine and docs/plan/great-library.md §年次フロー for the design rationale.
 */

type FireChanceStatus = "building" | "paused" | "completed";

/** Reads a ruler's raw traits for eligibility/maintain scoring (docs/plan/great-library.md KD-3). */
function resolveRulerTraits(state: State): GreatLibraryRulerTraits | undefined {
  if (!hasCharactersContext()) return undefined;
  const rulerId = getRulerId(state);
  if (rulerId === undefined) return undefined;
  const ruler = getCharacters().find(character => character.i === rulerId && !character.dead);
  if (!ruler) return undefined;

  return {
    learning: ruler.skills.learning,
    rationality: ruler.personality.rationality,
    zeal: ruler.personality.zeal,
    greed: ruler.personality.greed,
    piety: ruler.personality.piety,
    commitmentAffinity: commitmentScholarshipAffinity(ruler.backstory?.commitment)
  };
}

/** Public: full triple-condition + wealth + peace eligibility for a state, resolved from live context. */
export function resolveGreatLibraryEligibility(state: State, alreadyHasLibrary: boolean): GreatLibraryEligibility {
  const world = getWorldContext();
  const culture = world.pack.cultures?.[state.culture];
  const cultureKnowledgeValue = culture ? getCultureKnowledgeValue(culture) : 0;

  return checkGreatLibraryEligibility({
    cultureKnowledgeValue,
    ruler: resolveRulerTraits(state),
    isTheocracy: isGreatLibraryTheocracyState(state),
    treasury: state.treasury ?? 0,
    hasEnemyDiplomacy: stateHasEnemy(state),
    alreadyHasLibrary
  });
}

function phaseForProgress(progress: number): GreatLibraryPhase {
  const ratio = progress / GREAT_LIBRARY_BUILD_POINTS;
  if (ratio >= 1) return "inauguration";
  if (ratio >= 0.75) return "collection";
  if (ratio >= 0.25) return "structure";
  return "sitePrep";
}

function deriveLibraryName(burg: Burg | undefined): string {
  const cityName = burg?.name?.trim();
  return cityName ? `${cityName} Great Library` : "Unnamed Great Library";
}

function requestWebglRenderIfReady(): void {
  if (isEconomyContextReady()) getApi().requestWebglRender();
}

function greatLibraryMarkerIcon(status: GreatLibraryStatus): string {
  if (status === "completed") return "📚";
  if (status === "ruined") return "🏚️";
  return "🏗️"; // building/paused (planning never gets a marker — see syncGreatLibraryMarker)
}

function greatLibraryMarkerLegend(status: GreatLibraryStatus, cityName: string): string {
  switch (status) {
    case "building":
      return `A royal library rises at ${cityName}, funded by the crown's patronage.`;
    case "paused":
      return `Construction of the library at ${cityName} has stalled, awaiting renewed patronage.`;
    case "completed":
      return `A completed royal library at ${cityName}, drawing scholars from across the realm.`;
    case "ruined":
      return `The library at ${cityName} lies in ruins.`;
    default:
      return `A proposed royal library at ${cityName}.`;
  }
}

/**
 * Creates the project's marker on its first status change away from "planning" (§Marker作成経路),
 * or updates the existing one's icon/legend on every later status change. No-op when the
 * ExtensionAPI marker plumbing isn't available (economy context not ready, e.g. isolated unit
 * tests) or, for creation, when the site Burg can't be resolved.
 */
function syncGreatLibraryMarker(project: GreatLibraryProject, burg: Burg | undefined): GreatLibraryProject {
  if (!isEconomyContextReady()) return project;
  const api = getApi();

  const cityName = burg?.name?.trim() || "the capital";
  const icon = greatLibraryMarkerIcon(project.status);
  const legend = greatLibraryMarkerLegend(project.status, cityName);

  if (project.markerId === undefined) {
    if (!burg) return project;
    const created = api.createMapMarker({
      marker: { type: "greatLibrary", icon, cell: burg.cell, x: burg.x, y: burg.y },
      note: { name: project.name, legend }
    });
    return created ? { ...project, markerId: created.markerId } : project;
  }

  api.updateMapMarker(project.markerId, { icon, noteName: project.name, noteLegend: legend });
  return project;
}

/** Syncs the marker and requests a WebGL redraw, but only on an actual status transition. */
function finalizeStatusTransition(
  previousStatus: GreatLibraryStatus,
  result: GreatLibraryProject,
  burg: Burg | undefined
): GreatLibraryProject {
  if (result.status === previousStatus) return result;
  const synced = syncGreatLibraryMarker(result, burg);
  requestWebglRenderIfReady();
  return synced;
}

/** Site AcademyKnowledgeStock("administration") boost on completion — the v1 "main hull" bonus (KD-6). */
function applyGreatLibraryAcademyBoost(burgId: number): void {
  const stocks = getAcademyKnowledgeStocks();
  const existing = stocks.find(entry => entry.burgId === burgId && entry.domain === "administration");
  if (existing) {
    existing.stock = Math.min(1, existing.stock + GREAT_LIBRARY_COMPLETION_ACADEMY_BOOST);
    setAcademyKnowledgeStocks(stocks);
    return;
  }
  setAcademyKnowledgeStocks([
    ...stocks,
    { burgId, domain: "administration", stock: Math.min(1, GREAT_LIBRARY_COMPLETION_ACADEMY_BOOST) }
  ]);
}

function fireChanceFor(status: FireChanceStatus): number {
  if (status === "building") return GREAT_LIBRARY_FIRE_CHANCE_BUILDING;
  if (status === "paused") return GREAT_LIBRARY_FIRE_CHANCE_PAUSED;
  return GREAT_LIBRARY_FIRE_CHANCE_COMPLETED;
}

function rollFireSeverity(status: FireChanceStatus, rng: Pick<RNGService, "rand">): GreatLibraryFireSeverity {
  const useCompletedWeights = status === "completed";
  const total = GREAT_LIBRARY_FIRE_SEVERITY_WEIGHTS.reduce(
    (sum, entry) => sum + (useCompletedWeights ? entry.completedWeight : entry.buildingWeight),
    0
  );
  let roll = rng.rand() * total;
  for (const entry of GREAT_LIBRARY_FIRE_SEVERITY_WEIGHTS) {
    const weight = useCompletedWeights ? entry.completedWeight : entry.buildingWeight;
    if (roll < weight) return entry.severity;
    roll -= weight;
  }
  return GREAT_LIBRARY_FIRE_SEVERITY_WEIGHTS[GREAT_LIBRARY_FIRE_SEVERITY_WEIGHTS.length - 1].severity;
}

function findMostRecentRuinedYear(projects: readonly GreatLibraryProject[], stateId: number): number | null {
  let latest: number | null = null;
  for (const project of projects) {
    if (project.stateId !== stateId || project.status !== "ruined") continue;
    const ruinedYear = project.ruinedYear ?? project.completedYear ?? project.startedYear;
    if (latest === null || ruinedYear > latest) latest = ruinedYear;
  }
  return latest;
}

export class GreatLibraryModule {
  /** Runs at most once per simulation year (docs/plan/great-library.md §年次フロー). */
  settleAnnual(rng: Pick<RNGService, "P" | "rand">): boolean {
    const year = getSimulationYear();
    if (getGreatLibraryLastSettledYear() === year) return false;
    setGreatLibraryLastSettledYear(year);

    const world = getWorldContext();
    const states = world.pack.states;
    const burgs = world.pack.burgs;
    if (!states || !burgs) return true;

    const afterOrphanPass = this.orphanPass(getGreatLibraryProjects(), states, burgs, year);

    const next: GreatLibraryProject[] = [];
    for (const project of afterOrphanPass) {
      const settled = this.settleProject(project, states, burgs, year, rng);
      if (settled) next.push(settled);
    }

    // A fresh scan for states without any active (non-ruined) project — includes states whose
    // only project was just dropped/ruined above. New projects are appended, not settled, this
    // same call: a project only reaches "building" on the settle *after* the one that created it
    // (docs/plan/great-library.md §状態機械 Option C, "Year 0 planning: no spend, no progress").
    for (const state of states) {
      if (!state?.i || state.removed) continue;
      if (next.some(project => project.stateId === state.i && project.status !== "ruined")) continue;

      const lastRuinedYear = findMostRecentRuinedYear(next, state.i);
      if (lastRuinedYear !== null && year - lastRuinedYear < GREAT_LIBRARY_REBUILD_COOLDOWN_YEARS) continue;

      const capital = burgs[state.capital];
      if (!capital || capital.removed) continue;

      const eligibility = resolveGreatLibraryEligibility(state, false);
      if (!eligibility.eligible) continue;

      next.push(this.startProject(state, year));
    }

    setGreatLibraryProjects(next);
    return true;
  }

  /** Missing state/burg → drop a nameless "planning" project outright, ruin anything further along. */
  private orphanPass(
    projects: readonly GreatLibraryProject[],
    states: readonly State[],
    burgs: readonly Burg[],
    year: number
  ): GreatLibraryProject[] {
    const kept: GreatLibraryProject[] = [];
    for (const project of projects) {
      if (project.status === "ruined") {
        kept.push(project);
        continue;
      }
      const state = states[project.stateId];
      const burg = burgs[project.burgId];
      const orphaned = !state?.i || state.removed || !burg || burg.removed;
      if (!orphaned) {
        kept.push(project);
        continue;
      }
      if (project.status === "planning") continue;
      const ruined: GreatLibraryProject = { ...project, status: "ruined", ruinedYear: year };
      kept.push(finalizeStatusTransition(project.status, ruined, burg));
    }
    return kept;
  }

  private settleProject(
    project: GreatLibraryProject,
    states: readonly State[],
    burgs: readonly Burg[],
    year: number,
    rng: Pick<RNGService, "P" | "rand">
  ): GreatLibraryProject | null {
    if (project.status === "ruined") return project;

    const state = states[project.stateId];
    const burg = burgs[project.burgId];
    if (!state || !burg) {
      // orphanPass() already handles this in the common case; defensive fallback only.
      if (project.status === "planning") return null;
      return finalizeStatusTransition(project.status, { ...project, status: "ruined", ruinedYear: year }, burg);
    }

    // occupied: the site's Burg currently belongs to a different State than the one that
    // commissioned the project (docs/plan/great-library.md §征服・占領). Patronage never
    // auto-transfers, and an occupied project takes no action this year beyond what conquest's
    // one-shot disruption already applied (applyGreatLibraryConquestDisruption).
    const occupied = burg.state !== project.stateId;

    const previousStatus = project.status;
    let result: GreatLibraryProject | null;
    switch (project.status) {
      case "planning":
        result = this.settlePlanning(project, state, burg, year, rng);
        break;
      case "building":
        result = occupied ? project : this.tryBuildYear(project, state, year, rng);
        break;
      case "paused":
        result = occupied ? project : this.settlePaused(project, state, year, rng);
        break;
      case "completed":
        result = occupied ? project : this.settleCompleted(project, state, year, rng);
        break;
      default:
        result = project;
    }
    return result === null ? null : finalizeStatusTransition(previousStatus, result, burg);
  }

  private settlePlanning(
    project: GreatLibraryProject,
    state: State,
    burg: Burg,
    year: number,
    rng: Pick<RNGService, "P" | "rand">
  ): GreatLibraryProject | null {
    // Site conquered while still a nameless footing -> drop outright (docs/plan/great-library.md
    // §状態機械 transition table: "planning -> ruined: site conquered / orphan").
    if (burg.state !== project.stateId) return null;

    // Re-evaluate eligibility exactly as at start; a planning project that no longer qualifies is
    // cancelled silently rather than "ruined" — there is nothing built yet to ruin.
    const eligibility = resolveGreatLibraryEligibility(state, false);
    if (!eligibility.eligible) return null;

    const promoted: GreatLibraryProject = {
      ...project,
      status: "building",
      phase: "sitePrep",
      name: deriveLibraryName(burg)
    };
    return this.tryBuildYear(promoted, state, year, rng);
  }

  private tryBuildYear(
    project: GreatLibraryProject,
    state: State,
    year: number,
    rng: Pick<RNGService, "P" | "rand">
  ): GreatLibraryProject {
    const maintain = checkGreatLibraryMaintain({
      ruler: resolveRulerTraits(state),
      isTheocracy: isGreatLibraryTheocracyState(state),
      treasury: state.treasury ?? 0
    });
    if (!maintain.ok) {
      return { ...project, status: "paused", pausedSinceYear: year };
    }

    const availableTreasury = Math.max(0, state.treasury ?? 0);
    const spend = rn(Math.min(availableTreasury * GREAT_LIBRARY_BUDGET_SHARE, GREAT_LIBRARY_TARGET_ANNUAL_SPEND), 2);
    state.treasury = rn(Math.max(0, availableTreasury - spend), 2);

    const coverage = spend / GREAT_LIBRARY_TARGET_ANNUAL_SPEND;
    const wartimeFactor = isStateInActiveConflict(state.i) ? GREAT_LIBRARY_WARTIME_PROGRESS_FACTOR : 1;
    const progress = rn(project.progress + coverage * GREAT_LIBRARY_PROGRESS_PER_FULL_COVERAGE * wartimeFactor, 4);

    let updated: GreatLibraryProject = {
      ...project,
      status: "building",
      pausedSinceYear: undefined,
      progress,
      totalSpent: rn(project.totalSpent + spend, 2),
      phase: phaseForProgress(progress)
    };

    updated = this.rollFire(updated, "building", year, rng);
    if (updated.status !== "building") return updated; // caught fire and ruined this year

    if (updated.progress >= GREAT_LIBRARY_BUILD_POINTS) {
      updated = this.completeProject(updated, year);
    }
    return updated;
  }

  private completeProject(project: GreatLibraryProject, year: number): GreatLibraryProject {
    applyGreatLibraryAcademyBoost(project.burgId);
    return {
      ...project,
      status: "completed",
      phase: "inauguration",
      completedYear: year,
      endowment: Math.max(project.endowment, GREAT_LIBRARY_COMPLETION_ENDOWMENT)
    };
  }

  private settlePaused(
    project: GreatLibraryProject,
    state: State,
    year: number,
    rng: Pick<RNGService, "P" | "rand">
  ): GreatLibraryProject {
    const maintain = checkGreatLibraryMaintain({
      ruler: resolveRulerTraits(state),
      isTheocracy: isGreatLibraryTheocracyState(state),
      treasury: state.treasury ?? 0
    });
    if (maintain.ok) {
      // Resume: a single settle year satisfying maintain is enough (docs/plan/great-library.md
      // §Pause中の挙動), and the same year immediately runs a normal building year.
      const resumed: GreatLibraryProject = { ...project, status: "building", pausedSinceYear: undefined };
      return this.tryBuildYear(resumed, state, year, rng);
    }

    const decayed = this.applyPauseDecay(project, year);
    return this.rollFire(decayed, "paused", year, rng);
  }

  private applyPauseDecay(project: GreatLibraryProject, year: number): GreatLibraryProject {
    const pausedSinceYear = project.pausedSinceYear ?? year;
    const yearsPaused = year - pausedSinceYear;
    if (yearsPaused <= GREAT_LIBRARY_PAUSE_DECAY_AFTER_YEARS) {
      return { ...project, pausedSinceYear };
    }
    return {
      ...project,
      pausedSinceYear,
      progress: rn(Math.max(0, project.progress * (1 - GREAT_LIBRARY_PAUSE_DECAY_RATE)), 4)
    };
  }

  private settleCompleted(
    project: GreatLibraryProject,
    state: State,
    year: number,
    rng: Pick<RNGService, "P" | "rand">
  ): GreatLibraryProject {
    const spendCap = rn(GREAT_LIBRARY_TARGET_ANNUAL_SPEND * GREAT_LIBRARY_ENDOWMENT_MAINTAIN_SPEND_FACTOR, 2);
    const availableTreasury = Math.max(0, state.treasury ?? 0);
    const spend = Math.min(availableTreasury, spendCap);
    if (spend > 0) state.treasury = rn(availableTreasury - spend, 2);

    // Same EWMA shape as Academy/StateSecret's investment-driven stocks: coverage=1 (full upkeep
    // funded) nudges endowment toward 1, coverage=0 (treasury can't afford it) decays it toward 0.
    const coverage = spendCap > 0 ? spend / spendCap : 0;
    const endowment = rn(
      project.endowment * (1 - GREAT_LIBRARY_PAUSE_DECAY_RATE) + coverage * GREAT_LIBRARY_PAUSE_DECAY_RATE,
      4
    );

    const updated: GreatLibraryProject = { ...project, endowment, totalSpent: rn(project.totalSpent + spend, 2) };
    return this.rollFire(updated, "completed", year, rng);
  }

  private rollFire(
    project: GreatLibraryProject,
    status: FireChanceStatus,
    year: number,
    rng: Pick<RNGService, "P" | "rand">
  ): GreatLibraryProject {
    if (!rng.P(fireChanceFor(status))) return project;

    const severity = rollFireSeverity(status, rng);
    if (severity === "catastrophic") {
      return { ...project, status: "ruined", ruinedYear: year, endowment: 0 };
    }
    if (status === "completed") {
      const multiplier = severity === "minor" ? 0.9 : 0.7;
      return { ...project, endowment: rn(project.endowment * multiplier, 4) };
    }
    if (severity === "minor") {
      return { ...project, progress: rn(Math.max(0, project.progress - 1), 4) };
    }
    return { ...project, progress: rn(project.progress * 0.5, 4) };
  }

  private startProject(state: State, year: number): GreatLibraryProject {
    const id = getGreatLibraryNextId();
    setGreatLibraryNextId(id + 1);
    return {
      id,
      stateId: state.i,
      burgId: state.capital,
      status: "planning",
      phase: "sitePrep",
      progress: 0,
      startedYear: year,
      totalSpent: 0,
      endowment: 0,
      patronRulerId: getRulerId(state),
      name: "Proposed Great Library"
    };
  }
}

export const GreatLibrary = new GreatLibraryModule();

/** True while a Burg-scoped project's own State no longer controls the Burg it sits on. */
export function isGreatLibraryProjectOccupied(project: GreatLibraryProject): boolean {
  const burg = getWorldContext().pack.burgs?.[project.burgId];
  return !burg || burg.state !== project.stateId;
}

/**
 * Deterministic stand-in for a P(chance) roll, seeded from stable ids rather than a threaded rng
 * — the conquest hook (captureBurg -> applyConquestDisruption -> here) carries no RNGService, the
 * same constraint martialIndividualMastery.ts's aptitudeFromMartial() works around by seeding off
 * character.i. Reproducible for the same project/year, which is all a one-shot conquest event needs.
 */
function conquestRuinRoll(seedA: number, seedB: number, chance: number): boolean {
  const seed = ((seedA * 53 + seedB * 97 + 13) % 100) / 100;
  return seed < chance;
}

/**
 * One-shot disruption applied by conquestDisruption.ts's applyConquestDisruption() on a genuine
 * new conquest of a project's site Burg (docs/plan/great-library.md §征服・占領). Distinct from the
 * "occupied" no-op behavior in settleAnnual() above, which handles every *subsequent* settle year
 * while the site remains under foreign control.
 */
export function applyGreatLibraryConquestDisruption(burgId: number): void {
  const projects = getGreatLibraryProjects();
  const year = getSimulationYear();
  const burg = getWorldContext().pack.burgs?.[burgId];
  let changed = false;

  const next: GreatLibraryProject[] = [];
  for (const project of projects) {
    if (project.burgId !== burgId || project.status === "ruined") {
      next.push(project);
      continue;
    }
    changed = true;

    if (project.status === "planning") continue; // dropped outright, no name/investment yet

    if (project.status === "completed") {
      const endowment = rn(project.endowment * GREAT_LIBRARY_CONQUEST_COMPLETED_ENDOWMENT_MULT, 4);
      if (conquestRuinRoll(project.id, year, GREAT_LIBRARY_CONQUEST_COMPLETED_RUIN_CHANCE)) {
        next.push(
          finalizeStatusTransition("completed", { ...project, status: "ruined", ruinedYear: year, endowment: 0 }, burg)
        );
      } else {
        next.push({ ...project, endowment });
      }
      continue;
    }

    // building or paused
    const progress = rn(project.progress * GREAT_LIBRARY_CONQUEST_BUILDING_PROGRESS_MULT, 4);
    if (conquestRuinRoll(project.id, year, GREAT_LIBRARY_CONQUEST_BUILDING_RUIN_CHANCE)) {
      const previousStatus = project.status;
      next.push(
        finalizeStatusTransition(
          previousStatus,
          { ...project, status: "ruined", ruinedYear: year, progress, endowment: 0 },
          burg
        )
      );
    } else {
      next.push({ ...project, progress });
    }
  }

  if (changed) setGreatLibraryProjects(next);
}
