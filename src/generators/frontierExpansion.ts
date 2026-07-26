import {
  FRONTIER_STAGE,
  type FrontierProject,
  type FrontierSimulationState,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import type { RNGService } from "../utils/probabilityUtils";
import { assessFrontierSupport, getFrontierGovernance, statusForProject } from "./frontierGovernance";
import { incorporateEligibleFrontierSettlements } from "./frontierIncorporation";

const SETUP_COST = 8;
const TREASURY_RESERVE = 12;
/** Population points, not literal people (0.5 is 500 people at the default scale). */
const MIN_COLONISTS = 0.5;
const MIN_OUTPOST_CAPACITY = 2;
const SETTLEMENT_SUPPORT_YEARS = 3;
const MAX_OUTPOST_DANGER = 120;
const SETUP_FOOD = 4;
const MAX_FRONTIER_HOPS = 6;
const SOURCE_RETENTION_RATIO = 0.65;

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
  readonly incorporated: readonly number[];
}

/** Read-only projection for the Tools panel; it never consumes simulation RNG. */
export interface FrontierCandidateSummary {
  readonly stateId: number;
  readonly cellId: number;
  /** First contributing cell, retained for concise compatibility displays. */
  readonly sourceCellId: number;
  /** Every state-owned cell that will contribute to this expedition. */
  readonly sourceCellIds: readonly number[];
  /** Population points that will be transferred when the outpost is founded. */
  readonly colonists: number;
  readonly score: number;
  readonly setupCost: number;
  readonly requiredReserve: number;
}

/** A start condition preventing a State from founding an otherwise visible outpost. */
export interface FrontierCandidateBlockerSummary {
  readonly stateId: number;
  readonly reason: string;
}

export function getFrontierCandidateSummaries(
  world: WorldContext,
  simulation: SimulationContext
): readonly FrontierCandidateSummary[] {
  const { cells, states } = world.pack;
  if (!isFrontierPattern(world.options?.initialSettlementPattern)) return [];
  const candidates: FrontierCandidateSummary[] = [];
  for (const state of states ?? []) {
    if (!state?.i || state.removed || getStateStartBlocker(state, simulation, state.i)) continue;
    candidates.push(...getStateCandidates(state.i, cells, simulation.frontier));
  }
  return candidates.sort((a, b) => b.score - a.score || a.stateId - b.stateId || a.cellId - b.cellId).slice(0, 8);
}

/**
 * Explains why a State without a listed candidate cannot establish an outpost
 * this January. The panel consumes this rather than implying that a displayed
 * terrain score alone is an executable order.
 */
export function getFrontierCandidateBlockerSummaries(
  world: WorldContext,
  simulation: SimulationContext
): readonly FrontierCandidateBlockerSummary[] {
  if (!isFrontierPattern(world.options?.initialSettlementPattern)) return [];
  const blockers: FrontierCandidateBlockerSummary[] = [];
  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    const startBlocker = getStateStartBlocker(state, simulation, state.i);
    if (startBlocker) {
      blockers.push({ stateId: state.i, reason: startBlocker });
      continue;
    }
    if (!getStateCandidates(state.i, world.pack.cells, simulation.frontier).length) {
      const available = getBestReachableColonistPool(state.i, world.pack.cells, simulation.frontier);
      blockers.push({
        stateId: state.i,
        reason:
          available > 0
            ? `Population reserve ${available.toFixed(2)} / ${MIN_COLONISTS.toFixed(2)} points`
            : "No connected viable frontier site"
      });
    }
  }
  return blockers;
}

type FrontierCandidate = {
  readonly cellId: number;
  readonly contributions: readonly FrontierContribution[];
  readonly colonists: number;
  readonly score: number;
};

type FrontierContribution = {
  readonly sourceCellId: number;
  readonly colonists: number;
  readonly hops: number;
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
  const incorporated: number[] = [];
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

  const incorporation = incorporateEligibleFrontierSettlements(input);
  if (incorporation.incorporations.length) {
    for (const entry of incorporation.incorporations) incorporated.push(entry.settlementCellId);
    topics.add("simulation.states");
    topics.add("map.politics");
    topics.add("map.settlements");
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

    const colonists = transferColonists(cells, candidate);
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

  return { topics: [...topics], established, abandoned, settled, incorporated };
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
  const assessment = assessFrontierSupport(input.world, input.simulation, project, priorBudget, input.rng);

  if (!assessment.canSupport) {
    project.failedSupportYears++;
    project.lastStatus = statusForProject(project, assessment, year);
    if (project.failedSupportYears < 3) return "paused";
    project.lastStatus = { ...project.lastStatus, outcome: "abandoned" };
    abandonProject(project, frontier, cells);
    return "abandoned";
  }

  // The assessment has already accounted for infrastructure discounts and a
  // disaster's one-off recovery. The state remains the only treasury owner.
  state!.treasury = Math.max(0, (state!.treasury ?? 0) - assessment.upkeep - assessment.recoveryCost);
  if (assessment.recoveryCost) {
    getFrontierGovernance(input.simulation, project.stateId).reliefSpent += assessment.recoveryCost;
  }
  consumeFood(state!, assessment.food);
  project.supportYears++;
  project.failedSupportYears = 0;
  project.lastStatus = statusForProject(project, assessment, year);
  if (project.supportYears < SETTLEMENT_SUPPORT_YEARS) return "maintained";

  project.stage = FRONTIER_STAGE.settlement;
  frontier.cellStages[project.cellId] = FRONTIER_STAGE.settlement;
  // A settlement remains unclaimed (`state = province = 0`) until Phase 4.
  cells.state[project.cellId] = 0;
  cells.province[project.cellId] = 0;
  project.lastStatus = { ...project.lastStatus, outcome: "settled" };
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
  const candidates = getStateCandidates(stateId, cells, input.simulation.frontier).map(candidate => ({
    cellId: candidate.cellId,
    contributions: candidate.contributions,
    colonists: candidate.colonists,
    score: candidate.score + input.rng.rand()
  }));

  return candidates.sort((a, b) => b.score - a.score || a.cellId - b.cellId)[0] ?? null;
}

type InternalFrontierCandidateSummary = FrontierCandidateSummary & {
  readonly contributions: readonly FrontierContribution[];
};

function getStateCandidates(
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState
): readonly InternalFrontierCandidateSummary[] {
  const contributionsByTarget = new Map<number, FrontierContribution[]>();

  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    const available = estimateSourceContribution(cells.pop[sourceCellId] ?? 0, cells.capacity[sourceCellId] ?? 0);
    if (available <= 0) continue;

    for (const { cellId, hops } of findReachableFrontier(cells, frontier, sourceCellId, stateId)) {
      if (!isEligibleTarget(cells, frontier, cellId)) continue;
      const contributions = contributionsByTarget.get(cellId) ?? [];
      contributions.push({ sourceCellId, colonists: available, hops });
      contributionsByTarget.set(cellId, contributions);
    }
  }

  const candidates: InternalFrontierCandidateSummary[] = [];
  for (const [cellId, rawContributions] of contributionsByTarget) {
    const targetLimit = (cells.capacity[cellId] ?? 0) * 0.25;
    let remaining = targetLimit;
    const contributions: FrontierContribution[] = [];
    for (const contribution of [...rawContributions].sort(
      (a, b) => a.hops - b.hops || b.colonists - a.colonists || a.sourceCellId - b.sourceCellId
    )) {
      if (remaining <= 0) break;
      const colonists = Math.min(contribution.colonists, remaining);
      if (colonists <= 0) continue;
      contributions.push({ ...contribution, colonists });
      remaining -= colonists;
    }
    const colonists = contributions.reduce((total, contribution) => total + contribution.colonists, 0);
    if (colonists < MIN_COLONISTS) continue;
    const sourceCellIds = contributions.map(contribution => contribution.sourceCellId);
    const sourceCellId = sourceCellIds[0];
    if (sourceCellId === undefined) continue;
    candidates.push({
      stateId,
      cellId,
      sourceCellId,
      sourceCellIds,
      contributions,
      colonists,
      score: scoreCandidate(cells, cellId, 0) - Math.min(...contributions.map(contribution => contribution.hops)) * 9,
      setupCost: SETUP_COST,
      requiredReserve: TREASURY_RESERVE + SETUP_COST
    });
  }
  return candidates;
}

function getBestReachableColonistPool(
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState
): number {
  const pools = new Map<number, number>();
  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    const available = estimateSourceContribution(cells.pop[sourceCellId] ?? 0, cells.capacity[sourceCellId] ?? 0);
    if (available <= 0) continue;
    for (const { cellId } of findReachableFrontier(cells, frontier, sourceCellId, stateId)) {
      if (!isEligibleTarget(cells, frontier, cellId)) continue;
      const targetLimit = (cells.capacity[cellId] ?? 0) * 0.25;
      pools.set(cellId, Math.min(targetLimit, (pools.get(cellId) ?? 0) + available));
    }
  }
  return Math.max(0, ...pools.values());
}

function getStateStartBlocker(
  state: { treasury?: number; foodStress?: number; diplomacy?: unknown },
  simulation: SimulationContext,
  stateId: number
): string | null {
  if (hasActiveProject(simulation.frontier, stateId)) return "An outpost is already under support";
  if (isAtWar(state)) return "At war";
  if (hasSeriousFoodStress(state.foodStress)) return "Severe food stress";
  const priorBudget = simulation.frontier.budgetByState[stateId] ?? 0;
  if (priorBudget < TREASURY_RESERVE + SETUP_COST)
    return `Treasury reserve ${priorBudget.toFixed(0)} / ${TREASURY_RESERVE + SETUP_COST}`;
  if ((state.treasury ?? 0) < SETUP_COST) return `Setup funds ${(state.treasury ?? 0).toFixed(0)} / ${SETUP_COST}`;
  return null;
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
    cells.capacity[cellId] >= MIN_OUTPOST_CAPACITY &&
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

function transferColonists(cells: WorldContext["pack"]["cells"], candidate: FrontierCandidate): number {
  if (candidate.colonists < MIN_COLONISTS) return 0;
  let transferred = 0;
  for (const contribution of candidate.contributions) {
    const sourcePopulation = cells.pop[contribution.sourceCellId] ?? 0;
    if (sourcePopulation <= 0) continue;
    const colonists = Math.min(contribution.colonists, sourcePopulation);
    const ratio = colonists / sourcePopulation;
    for (const column of ["children", "maleAdults", "femaleAdults", "elders"] as const) {
      const moved = cells[column][contribution.sourceCellId] * ratio;
      cells[column][contribution.sourceCellId] -= moved;
      cells[column][candidate.cellId] += moved;
    }
    cells.pop[contribution.sourceCellId] -= colonists;
    cells.pop[candidate.cellId] += colonists;
    transferred += colonists;
  }
  return transferred;
}

function estimateSourceContribution(sourcePopulation: number, sourceCapacity: number): number {
  const surplus = sourcePopulation - sourceCapacity * SOURCE_RETENTION_RATIO;
  return Math.max(0, Math.min(12, surplus * 0.5));
}

function ensureFrontierState(simulation: SimulationContext, cellCount: number): FrontierSimulationState {
  const frontier = simulation.frontier;
  if (frontier.cellStages.length === cellCount) return frontier;
  simulation.frontier = {
    cellStages: new Uint8Array(cellCount),
    projects: {},
    lastEvaluatedYear: null,
    budgetByState: {},
    stateCooldownUntilYear: {},
    governanceByState: {}
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

function consumeFood(state: { foodStock?: number }, amount: number): void {
  if (state.foodStock !== undefined) state.foodStock = Math.max(0, state.foodStock - amount);
}

function emptyResult(): FrontierExpansionResult {
  return { topics: [], established: [], abandoned: [], settled: [], incorporated: [] };
}
