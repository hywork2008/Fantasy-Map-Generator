import {
  FRONTIER_STAGE,
  type FrontierProject,
  type FrontierSimulationState,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import type { RNGService } from "../utils/probabilityUtils";

const SETUP_COST = 8;
const ANNUAL_UPKEEP = 1;
const TREASURY_RESERVE = 12;
const MIN_COLONISTS = 4;
const SETTLEMENT_SUPPORT_YEARS = 3;
const MAX_OUTPOST_DANGER = 120;
const MAX_SUPPORTED_OUTPOST_DANGER = 150;
const SETUP_FOOD = 4;
const ANNUAL_FOOD = 1;
const MAX_FRONTIER_HOPS = 6;

export interface FrontierExpansionInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
  readonly rng: RNGService;
  /** Materializes a trail from a new outpost to the existing movement network. */
  readonly connectRoute?: (cellId: number, stateId: number) => boolean;
}

export interface FrontierExpansionResult {
  readonly topics: readonly DataTopic[];
  readonly established: readonly number[];
  readonly abandoned: readonly number[];
  readonly settled: readonly number[];
}

type FrontierCandidate = {
  readonly cellId: number;
  readonly sourceCellId: number;
  readonly score: number;
};

/**
 * Phase 3's annual, pre-incorporation expansion loop. It owns only unclaimed
 * cell stages and population transfers; changing `cells.state` is deliberately
 * reserved for the Phase 4 incorporation transaction.
 */
export function advanceFrontierExpansion(input: FrontierExpansionInput): FrontierExpansionResult {
  const { world, simulation } = input;
  const cells = world.pack?.cells;
  if (!cells || !isFrontierPattern(world.options?.initialSettlementPattern)) return emptyResult();
  if (simulation.currentMonth !== 1 || simulation.currentDay !== 1) return emptyResult();

  const frontier = ensureFrontierState(simulation, cells.i.length);
  const year = simulation.currentYear;
  if (frontier.lastEvaluatedYear === year) return emptyResult();
  frontier.lastEvaluatedYear = year;

  const topics = new Set<DataTopic>(["simulation.cells"]);
  const established: number[] = [];
  const abandoned: number[] = [];
  const settled: number[] = [];
  let routeChanged = false;

  for (const project of Object.values(frontier.projects)) {
    const outcome = advanceProject(project, frontier, input, year);
    if (outcome === "abandoned") {
      abandoned.push(project.cellId);
      topics.add("map.settlements");
      topics.add("simulation.states");
    } else if (outcome === "settled") {
      settled.push(project.cellId);
      topics.add("map.settlements");
      topics.add("simulation.states");
    } else if (outcome === "maintained") {
      topics.add("simulation.states");
    }
  }

  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed || frontier.stateCooldownUntilYear[state.i] > year) continue;
    if (hasActiveProject(frontier, state.i) || isAtWar(state) || hasSeriousFoodStress(state.foodStress)) {
      continue;
    }

    const priorBudget = frontier.budgetByState[state.i] ?? 0;
    if (priorBudget < TREASURY_RESERVE + SETUP_COST || (state.treasury ?? 0) < SETUP_COST) continue;

    const candidate = selectCandidate(state.i, input);
    if (!candidate) continue;

    const colonists = transferColonists(cells, candidate.sourceCellId, candidate.cellId);
    if (colonists < MIN_COLONISTS) continue;

    state.treasury = Math.max(0, (state.treasury ?? 0) - SETUP_COST);
    consumeFood(state, SETUP_FOOD);
    frontier.cellStages[candidate.cellId] = FRONTIER_STAGE.outpost;
    frontier.projects[candidate.cellId] = {
      cellId: candidate.cellId,
      stateId: state.i,
      stage: FRONTIER_STAGE.outpost,
      establishedYear: year,
      supportYears: 0,
      failedSupportYears: 0
    };
    frontier.stateCooldownUntilYear[state.i] = year + 2;
    if (input.connectRoute?.(candidate.cellId, state.i)) routeChanged = true;

    established.push(candidate.cellId);
    topics.add("simulation.states");
    topics.add("map.settlements");
  }

  // Capture after this year's decisions. Next January evaluates the treasury
  // that was already known at this calendar boundary, never same-tick income.
  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    frontier.budgetByState[state.i] = Math.max(0, state.treasury ?? 0);
  }
  topics.add("simulation.states");
  if (routeChanged) topics.add("map.networks");

  return { topics: [...topics], established, abandoned, settled };
}

function advanceProject(
  project: FrontierProject,
  frontier: FrontierSimulationState,
  input: FrontierExpansionInput,
  year: number
): "none" | "maintained" | "paused" | "abandoned" | "settled" {
  if (project.stage !== FRONTIER_STAGE.outpost) return "none";

  const { cells } = input.world.pack;
  const state = input.world.pack.states?.[project.stateId];
  const priorBudget = frontier.budgetByState[project.stateId] ?? 0;
  const localPopulation = cells.pop[project.cellId] ?? 0;
  const localCapacity = cells.capacity[project.cellId] ?? 0;
  const danger = cells.danger[project.cellId] ?? 0;
  const canSupport =
    !!state &&
    !state.removed &&
    priorBudget >= TREASURY_RESERVE + ANNUAL_UPKEEP &&
    (state.treasury ?? 0) >= ANNUAL_UPKEEP &&
    hasProvisioningCapacity(cells, project.cellId, localPopulation) &&
    localCapacity >= localPopulation * 1.2 &&
    danger <= MAX_SUPPORTED_OUTPOST_DANGER;

  if (!canSupport) {
    project.failedSupportYears++;
    if (project.failedSupportYears < 3) return "paused";
    abandonProject(project, frontier, cells);
    return "abandoned";
  }

  state.treasury = Math.max(0, (state.treasury ?? 0) - ANNUAL_UPKEEP);
  consumeFood(state, ANNUAL_FOOD);
  project.supportYears++;
  project.failedSupportYears = 0;
  if (project.supportYears < SETTLEMENT_SUPPORT_YEARS) return "maintained";

  project.stage = FRONTIER_STAGE.settlement;
  frontier.cellStages[project.cellId] = FRONTIER_STAGE.settlement;
  // A settlement remains unclaimed (`state = province = 0`) until Phase 4.
  cells.state[project.cellId] = 0;
  cells.province[project.cellId] = 0;
  void year; // Kept in the signature so project transitions stay calendar-explicit.
  return "settled";
}

function abandonProject(
  project: FrontierProject,
  frontier: FrontierSimulationState,
  cells: WorldContext["pack"]["cells"]
): void {
  frontier.cellStages[project.cellId] = FRONTIER_STAGE.wilderness;
  cells.pop[project.cellId] = 0;
  cells.children[project.cellId] = 0;
  cells.maleAdults[project.cellId] = 0;
  cells.femaleAdults[project.cellId] = 0;
  cells.elders[project.cellId] = 0;
  cells.state[project.cellId] = 0;
  cells.province[project.cellId] = 0;
  delete frontier.projects[project.cellId];
}

function selectCandidate(stateId: number, input: FrontierExpansionInput): FrontierCandidate | null {
  const { cells } = input.world.pack;
  const candidates: FrontierCandidate[] = [];
  const frontier = input.simulation.frontier;

  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    const sourcePopulation = cells.pop[sourceCellId] ?? 0;
    const sourceCapacity = cells.capacity[sourceCellId] ?? 0;
    if (sourcePopulation < sourceCapacity * 0.73) continue;

    for (const { cellId, hops } of findReachableFrontier(cells, frontier, sourceCellId, stateId)) {
      const colonistCapacity = estimateColonistCapacity(sourcePopulation, sourceCapacity, cells.capacity[cellId] ?? 0);
      if (colonistCapacity < MIN_COLONISTS) continue;
      const score = scoreCandidate(cells, cellId, input.rng.rand()) - hops * 9;
      candidates.push({ cellId, sourceCellId, score });
    }
  }

  return (
    candidates.sort((a, b) => b.score - a.score || a.cellId - b.cellId || a.sourceCellId - b.sourceCellId)[0] ?? null
  );
}

function findReachableFrontier(
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState,
  sourceCellId: number,
  stateId: number
): Array<{ cellId: number; hops: number }> {
  const queue: Array<{ cellId: number; hops: number }> = [{ cellId: sourceCellId, hops: 0 }];
  const visited = new Set<number>([sourceCellId]);
  const candidates: Array<{ cellId: number; hops: number }> = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.hops >= MAX_FRONTIER_HOPS) continue;
    for (const cellId of cells.c[current.cellId] ?? []) {
      if (visited.has(cellId) || !isTraversableFrontierCell(cells, stateId, cellId)) continue;
      visited.add(cellId);
      const hops = current.hops + 1;
      if (isEligibleTarget(cells, frontier, cellId)) candidates.push({ cellId, hops });
      queue.push({ cellId, hops });
    }
  }

  return candidates;
}

function isTraversableFrontierCell(cells: WorldContext["pack"]["cells"], stateId: number, cellId: number): boolean {
  return cells.h[cellId] >= 20 && cells.s[cellId] > 0 && (!cells.state[cellId] || cells.state[cellId] === stateId);
}

function isEligibleTarget(
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState,
  cellId: number
): boolean {
  return (
    cells.state[cellId] === 0 &&
    cells.province[cellId] === 0 &&
    frontier.cellStages[cellId] === FRONTIER_STAGE.wilderness &&
    cells.capacity[cellId] >= MIN_COLONISTS * 2 &&
    cells.danger[cellId] <= MAX_OUTPOST_DANGER
  );
}

function scoreCandidate(cells: WorldContext["pack"]["cells"], cellId: number, random: number): number {
  const waterAccess = cells.r[cellId] ? 20 : cells.harbor[cellId] ? 15 : cells.conf[cellId] ? 8 : 0;
  const terrainPenalty = cells.h[cellId] >= 70 ? 20 : cells.h[cellId] >= 55 ? 8 : 0;
  return (
    cells.capacity[cellId] + cells.s[cellId] * 2 + waterAccess - cells.danger[cellId] * 0.8 - terrainPenalty + random
  );
}

function transferColonists(cells: WorldContext["pack"]["cells"], sourceCellId: number, targetCellId: number): number {
  const sourcePopulation = cells.pop[sourceCellId] ?? 0;
  const sourceCapacity = cells.capacity[sourceCellId] ?? 0;
  const targetCapacity = cells.capacity[targetCellId] ?? 0;
  const colonists = estimateColonistCapacity(sourcePopulation, sourceCapacity, targetCapacity);
  if (colonists < MIN_COLONISTS || sourcePopulation <= 0) return 0;

  const ratio = colonists / sourcePopulation;
  for (const column of ["children", "maleAdults", "femaleAdults", "elders"] as const) {
    const moved = cells[column][sourceCellId] * ratio;
    cells[column][sourceCellId] -= moved;
    cells[column][targetCellId] += moved;
  }
  cells.pop[sourceCellId] -= colonists;
  cells.pop[targetCellId] += colonists;
  return colonists;
}

function estimateColonistCapacity(sourcePopulation: number, sourceCapacity: number, targetCapacity: number): number {
  const surplus = sourcePopulation - sourceCapacity * 0.65;
  return Math.min(12, surplus * 0.5, targetCapacity * 0.25);
}

function ensureFrontierState(simulation: SimulationContext, cellCount: number): FrontierSimulationState {
  const frontier = simulation.frontier;
  if (frontier.cellStages.length === cellCount) return frontier;
  simulation.frontier = {
    cellStages: new Uint8Array(cellCount),
    projects: {},
    lastEvaluatedYear: null,
    budgetByState: {},
    stateCooldownUntilYear: {}
  };
  return simulation.frontier;
}

function isFrontierPattern(pattern: WorldContext["options"]["initialSettlementPattern"] | undefined): boolean {
  return pattern === "frontier" || pattern === "scattered";
}

function hasActiveProject(frontier: FrontierSimulationState, stateId: number): boolean {
  return Object.values(frontier.projects).some(
    project => project.stateId === stateId && project.stage === FRONTIER_STAGE.outpost
  );
}

function isAtWar(state: { diplomacy?: unknown } | undefined): boolean {
  return Array.isArray(state?.diplomacy) && state.diplomacy.includes("Enemy");
}

function hasSeriousFoodStress(foodStress: number | undefined): boolean {
  return typeof foodStress === "number" && foodStress >= 0.75;
}

/**
 * `foodStock` is a volatile market snapshot. Sustainable settlement is instead
 * gated by the cell's carrying capacity; a positive stock adds a consumable
 * reserve but a zero quarterly market snapshot cannot permanently freeze all
 * frontier work.
 */
function hasProvisioningCapacity(cells: WorldContext["pack"]["cells"], cellId: number, population: number): boolean {
  return (cells.capacity[cellId] ?? 0) >= Math.max(MIN_COLONISTS * 2, population * 1.2);
}

function consumeFood(state: { foodStock?: number }, amount: number): void {
  if (state.foodStock !== undefined) state.foodStock = Math.max(0, state.foodStock - amount);
}

function emptyResult(): FrontierExpansionResult {
  return { topics: [], established: [], abandoned: [], settled: [] };
}
