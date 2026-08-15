import {
  FRONTIER_INVESTMENTS,
  FRONTIER_STAGE,
  type FrontierDisaster,
  type FrontierProject,
  type FrontierProjectStatus,
  type FrontierStateGovernance,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { RNGService } from "../utils/probabilityUtils";
import { getCellSubsistenceCapacity } from "./subsistenceCapacity";

const INVESTMENT_COST = 6;
const EMERGENCY_RELIEF_COST = 3;

export interface FrontierSupportAssessment {
  readonly canSupport: boolean;
  readonly upkeep: number;
  readonly food: number;
  readonly disaster?: FrontierDisaster;
  readonly recoveryCost: number;
  readonly failureReasons: readonly string[];
}

export function getFrontierGovernance(simulation: SimulationContext, stateId: number): FrontierStateGovernance {
  const existing = simulation.frontier.governanceByState[stateId];
  if (existing) return existing;
  const governance: FrontierStateGovernance = {
    policy: "balanced",
    investments: { granary: 0, well: 0, road: 0, fort: 0, sanitation: 0 },
    lastEvaluatedYear: null,
    reliefSpent: 0
  };
  simulation.frontier.governanceByState[stateId] = governance;
  return governance;
}

/**
 * Applies a visible, annual public-works choice. The host owns the effects;
 * Nobility merely selects the policy and calls this helper when it is enabled.
 */
export function advanceFrontierGovernance(
  world: WorldContext,
  simulation: SimulationContext,
  rng: RNGService
): boolean {
  if (simulation.currentMonth !== 1 || simulation.currentDay !== 1) return false;
  let changed = false;
  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    const governance = getFrontierGovernance(simulation, state.i);
    if (governance.lastEvaluatedYear === simulation.currentYear) continue;
    governance.lastEvaluatedYear = simulation.currentYear;
    governance.policy = choosePolicy(world, simulation, state.i);
    const investment = chooseInvestment(world, simulation, state.i, governance.policy, rng);
    if (investment && (state.treasury ?? 0) >= INVESTMENT_COST + 12) {
      state.treasury = Math.max(0, (state.treasury ?? 0) - INVESTMENT_COST);
      governance.investments[investment]++;
    }
    changed = true;
  }
  return changed;
}

export function assessFrontierSupport(
  world: WorldContext,
  simulation: SimulationContext,
  project: FrontierProject,
  priorBudget: number,
  rng: RNGService
): FrontierSupportAssessment {
  const { cells, states } = world.pack;
  const state = states[project.stateId];
  const governance = getFrontierGovernance(simulation, project.stateId);
  const population = cells.pop[project.cellId] ?? 0;
  const capacity = getCellSubsistenceCapacity(cells, project.cellId);
  const danger = cells.danger[project.cellId] ?? 0;
  const disaster = rollDisaster(cells, project.cellId, population, capacity, danger, governance, rng);
  const recoveryCost = disaster ? Math.max(1, EMERGENCY_RELIEF_COST - mitigationFor(disaster, governance)) : 0;
  const upkeep = Math.max(0, 1 - Math.min(1, governance.investments.road));
  const food = Math.max(0, 1 - Math.min(1, governance.investments.granary));
  const failureReasons: string[] = [];

  if (!state || state.removed) failureReasons.push("The sponsoring state no longer exists");
  // Judge the calendar-boundary reserve, not the post-economy cash remaining
  // after same-tick taxes and department upkeep.
  if (priorBudget < 12 + upkeep + recoveryCost) failureReasons.push("The state lacks its protected frontier reserve");
  if (capacity < population * 1.2) failureReasons.push("Local food capacity is too low for the settlement");
  if (danger > 150 + governance.investments.fort * 12)
    failureReasons.push("Local danger exceeds the fort and patrol cover");
  if (disaster && recoveryCost > 0 && priorBudget < 12 + upkeep + recoveryCost) {
    failureReasons.push(`${formatDisaster(disaster)} recovery cannot be funded`);
  }

  return { canSupport: failureReasons.length === 0, upkeep, food, disaster, recoveryCost, failureReasons };
}

export function statusForProject(
  project: FrontierProject,
  assessment: FrontierSupportAssessment | null,
  year: number
): FrontierProjectStatus {
  if (!assessment) {
    return project.lastStatus ?? { year, outcome: "paused", failureReasons: [], recoveryCost: 0 };
  }
  return {
    year,
    outcome: assessment.canSupport ? "maintained" : "paused",
    failureReasons: assessment.failureReasons,
    disaster: assessment.disaster,
    recoveryCost: assessment.recoveryCost
  };
}

export function formatDisaster(disaster: FrontierDisaster): string {
  return { drought: "Drought", flood: "Flood", epidemic: "Epidemic", bandits: "Bandit raids" }[disaster];
}

function choosePolicy(
  world: WorldContext,
  simulation: SimulationContext,
  stateId: number
): FrontierStateGovernance["policy"] {
  const projects = Object.values(simulation.frontier.projects).filter(project => project.stateId === stateId);
  const hasRecoveryNeed = projects.some(
    project => project.lastStatus?.failureReasons.length || project.lastStatus?.disaster
  );
  if (hasRecoveryNeed) return "recovery";
  const hasOutpost = projects.some(project => project.stage === FRONTIER_STAGE.outpost);
  if (hasOutpost) return "defense";
  const state = world.pack.states[stateId];
  return (state?.treasury ?? 0) >= 30 ? "expansion" : "balanced";
}

function chooseInvestment(
  world: WorldContext,
  simulation: SimulationContext,
  stateId: number,
  policy: FrontierStateGovernance["policy"],
  rng: RNGService
): (typeof FRONTIER_INVESTMENTS)[number] | null {
  const projects = Object.values(simulation.frontier.projects).filter(project => project.stateId === stateId);
  if (!projects.length && policy !== "expansion") return null;
  const governance = getFrontierGovernance(simulation, stateId);
  const firstProject = projects[0];
  const cells = world.pack.cells;
  if (firstProject) {
    const cellId = firstProject.cellId;
    if ((cells.danger[cellId] ?? 0) > 100) return "fort";
    if ((cells.fl?.[cellId] ?? 0) >= 100) return "road";
    if ((cells.s[cellId] ?? 0) < 30) return "well";
    if ((cells.pop[cellId] ?? 0) > getCellSubsistenceCapacity(cells, cellId) * 0.8) return "sanitation";
  }
  const candidates = FRONTIER_INVESTMENTS.filter(
    key => governance.investments[key] === Math.min(...FRONTIER_INVESTMENTS.map(k => governance.investments[k]))
  );
  return candidates[Math.floor(rng.rand() * candidates.length)] ?? null;
}

function rollDisaster(
  cells: WorldContext["pack"]["cells"],
  cellId: number,
  population: number,
  capacity: number,
  danger: number,
  governance: FrontierStateGovernance,
  rng: RNGService
): FrontierDisaster | undefined {
  const risks: Array<{ disaster: FrontierDisaster; risk: number }> = [
    { disaster: "drought", risk: ((cells.s[cellId] ?? 0) < 30 ? 0.12 : 0.025) - governance.investments.well * 0.02 },
    { disaster: "flood", risk: ((cells.fl?.[cellId] ?? 0) >= 100 ? 0.12 : 0.015) - governance.investments.road * 0.01 },
    {
      disaster: "epidemic",
      risk: (population > capacity * 0.8 ? 0.1 : 0.015) - governance.investments.sanitation * 0.02
    },
    { disaster: "bandits", risk: Math.max(0, danger - governance.investments.fort * 18) / 1500 }
  ];
  const totalRisk = risks.reduce((sum, item) => sum + Math.max(0, item.risk), 0);
  const roll = rng.rand();
  if (roll >= totalRisk) return undefined;
  let cursor = 0;
  for (const item of risks) {
    cursor += Math.max(0, item.risk);
    if (roll < cursor) return item.disaster;
  }
  return undefined;
}

function mitigationFor(disaster: FrontierDisaster, governance: FrontierStateGovernance): number {
  switch (disaster) {
    case "drought":
      return governance.investments.well + governance.investments.granary;
    case "flood":
      return governance.investments.road;
    case "epidemic":
      return governance.investments.sanitation + governance.investments.well;
    case "bandits":
      return governance.investments.fort;
  }
}
