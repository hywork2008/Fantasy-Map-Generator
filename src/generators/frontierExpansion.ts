import {
  createEmptyFrontierSimulationState,
  FRONTIER_STAGE,
  type FrontierProject,
  type FrontierSimulationState,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import type { RNGService } from "../utils/probabilityUtils";
import { FRONTIER_OUTPOST_MAX_DANGER } from "./dangerExpandPolicy";
import { assessFrontierSupport, getFrontierGovernance, statusForProject } from "./frontierGovernance";
import { incorporateEligibleFrontierSettlements } from "./frontierIncorporation";
import { allowsFrontierOutpost } from "./wildLandTags";

const SETUP_COST = 8;
const TREASURY_RESERVE = 12;
/** Population points, not literal people (0.5 is 500 people at the default scale). */
const MIN_COLONISTS = 0.5;
const MIN_OUTPOST_CAPACITY = 2;
const SETTLEMENT_SUPPORT_YEARS = 3;
const MAX_OUTPOST_DANGER = FRONTIER_OUTPOST_MAX_DANGER;
const SETUP_FOOD = 4;
const MAX_FRONTIER_HOPS = 6;
const SOURCE_RETENTION_RATIO = 0.65;
const MAX_FRONTIER_PROJECT_SLOTS = 3;
const FRONTIER_SECTOR_NAMES = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east"
];

export interface FrontierExpansionInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
  readonly rng: RNGService;
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
  /** Geographic expansion sector relative to the State centre. */
  readonly sector: string;
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
  const cells = world.pack?.cells;
  const states = world.pack?.states;
  if (!cells || !states || !isFrontierPattern(world.options?.initialSettlementPattern)) return [];
  const candidates: FrontierCandidateSummary[] = [];
  for (const state of states) {
    if (!state?.i || state.removed || getStateStartBlocker(state, simulation, state.i, cells, state.center)) continue;
    candidates.push(...getAvailableStateCandidates(state.i, cells, simulation.frontier, state.center));
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
  const cells = world.pack?.cells;
  const states = world.pack?.states;
  if (!cells || !states || !isFrontierPattern(world.options?.initialSettlementPattern)) return [];
  const blockers: FrontierCandidateBlockerSummary[] = [];
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const startBlocker = getStateStartBlocker(state, simulation, state.i, cells, state.center);
    if (startBlocker) {
      blockers.push({ stateId: state.i, reason: startBlocker });
      continue;
    }
    const allCandidates = getStateCandidates(state.i, cells, simulation.frontier, state.center);
    if (!getAvailableStateCandidates(state.i, cells, simulation.frontier, state.center).length) {
      if (allCandidates.length) {
        blockers.push({ stateId: state.i, reason: "All viable sites are in active frontier sectors" });
        continue;
      }
      const available = getBestReachableColonistPool(state.i, cells, simulation.frontier);
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
  readonly sector: string;
  readonly score: number;
};

type FrontierContribution = {
  readonly sourceCellId: number;
  readonly colonists: number;
  readonly hops: number;
  /** Sourced from the state's frontier applicant pool rather than a specific live cell. */
  readonly isPool?: boolean;
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
    if (!state?.i || state.removed || isAtWar(state) || hasSeriousFoodStress(state.foodStress)) continue;

    const slots = getFrontierProjectSlots(state.i, cells);
    let activeProjects = getActiveProjectCount(frontier, state.i);
    if (activeProjects >= slots) continue;
    const occupiedSectors = getActiveProjectSectors(frontier, state.i, cells, state.center);

    while (activeProjects < slots) {
      const requiredReserve = (activeProjects + 1) * (TREASURY_RESERVE + SETUP_COST);
      const priorBudget = frontier.budgetByState[state.i] ?? 0;
      if (priorBudget < requiredReserve || (state.treasury ?? 0) < SETUP_COST) break;

      // Re-evaluate after every transfer: no second project may spend the same
      // source-cell surplus claimed by the first one in this annual transaction.
      const candidate = selectCandidate(state.i, input, state.center, occupiedSectors);
      if (!candidate) break;

      const colonists = transferColonists(cells, candidate, frontier, state.i);
      if (colonists < MIN_COLONISTS) break;

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
      occupiedSectors.add(candidate.sector);
      activeProjects++;

      established.push(candidate.cellId);
      topics.add("simulation.states");
      topics.add("map.settlements");
    }
  }

  // Capture after this year's decisions. Next January evaluates the treasury
  // that was already known at this calendar boundary, never same-tick income.
  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    frontier.budgetByState[state.i] = Math.max(0, state.treasury ?? 0);
  }
  topics.add("simulation.states");

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

function selectCandidate(
  stateId: number,
  input: FrontierExpansionInput,
  stateCenter: number | undefined,
  occupiedSectors: ReadonlySet<string>
): FrontierCandidate | null {
  const { cells } = input.world.pack;
  const candidates = getStateCandidates(stateId, cells, input.simulation.frontier, stateCenter)
    .filter(candidate => !occupiedSectors.has(candidate.sector))
    .map(candidate => ({
      cellId: candidate.cellId,
      contributions: candidate.contributions,
      colonists: candidate.colonists,
      sector: candidate.sector,
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
  frontier: FrontierSimulationState,
  stateCenter: number | undefined
): readonly InternalFrontierCandidateSummary[] {
  const contributionsByTarget = new Map<number, FrontierContribution[]>();
  const poolAvailable = getFrontierApplicantPoolTotal(frontier, stateId);
  const pooledTargets = new Set<number>();

  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    const available = estimateSourceContribution(cells.pop[sourceCellId] ?? 0, cells.capacity[sourceCellId] ?? 0);
    if (available <= 0 && poolAvailable <= 0) continue;

    for (const { cellId, hops } of findReachableFrontier(cells, frontier, sourceCellId, stateId)) {
      if (!isEligibleTarget(cells, frontier, cellId)) continue;
      const contributions = contributionsByTarget.get(cellId) ?? [];
      if (available > 0) contributions.push({ sourceCellId, colonists: available, hops });
      // The applicant pool is state-wide, not tied to this source cell — add it once per
      // reachable target, ahead of live cells (hops: 0), so it drains before any village does.
      if (poolAvailable > 0 && !pooledTargets.has(cellId)) {
        contributions.push({ sourceCellId: -1, colonists: poolAvailable, hops: 0, isPool: true });
        pooledTargets.add(cellId);
      }
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
    const sourceCellIds = contributions.filter(contribution => !contribution.isPool).map(c => c.sourceCellId);
    const sourceCellId = sourceCellIds[0] ?? cellId;
    candidates.push({
      stateId,
      cellId,
      sourceCellId,
      sourceCellIds,
      contributions,
      colonists,
      sector: getFrontierSector(cellId, stateCenter, cells),
      score: scoreCandidate(cells, cellId, 0) - Math.min(...contributions.map(contribution => contribution.hops)) * 9,
      setupCost: SETUP_COST,
      requiredReserve: TREASURY_RESERVE + SETUP_COST
    });
  }
  return candidates;
}

function getAvailableStateCandidates(
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState,
  stateCenter: number | undefined
): readonly InternalFrontierCandidateSummary[] {
  const occupiedSectors = getActiveProjectSectors(frontier, stateId, cells, stateCenter);
  return getStateCandidates(stateId, cells, frontier, stateCenter).filter(
    candidate => !occupiedSectors.has(candidate.sector)
  );
}

function getBestReachableColonistPool(
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState
): number {
  const poolAvailable = getFrontierApplicantPoolTotal(frontier, stateId);
  const pools = new Map<number, number>();
  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    const available = estimateSourceContribution(cells.pop[sourceCellId] ?? 0, cells.capacity[sourceCellId] ?? 0);
    if (available <= 0 && poolAvailable <= 0) continue;
    for (const { cellId } of findReachableFrontier(cells, frontier, sourceCellId, stateId)) {
      if (!isEligibleTarget(cells, frontier, cellId)) continue;
      // The pool is state-wide (not per-source-cell); seed each target with it once, then
      // let every reaching source cell add its own live-cell contribution on top.
      const targetLimit = (cells.capacity[cellId] ?? 0) * 0.25;
      const base = pools.has(cellId) ? (pools.get(cellId) ?? 0) : poolAvailable;
      pools.set(cellId, Math.min(targetLimit, base + available));
    }
  }
  return Math.max(0, ...pools.values());
}

/** Total population points (both sexes) waiting in a state's frontier applicant pool. */
function getFrontierApplicantPoolTotal(frontier: FrontierSimulationState, stateId: number): number {
  const pool = frontier.applicantPoolByState[stateId];
  return pool ? pool.maleAdults + pool.femaleAdults : 0;
}

function getStateStartBlocker(
  state: { treasury?: number; foodStress?: number; diplomacy?: unknown },
  simulation: SimulationContext,
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  stateCenter: number | undefined
): string | null {
  const activeProjects = getActiveProjectCount(simulation.frontier, stateId);
  const slots = getFrontierProjectSlots(stateId, cells);
  if (activeProjects >= slots) return `All ${slots} frontier slots are active`;
  if (isAtWar(state)) return "At war";
  if (hasSeriousFoodStress(state.foodStress)) return "Severe food stress";
  const priorBudget = simulation.frontier.budgetByState[stateId] ?? 0;
  const requiredReserve = (activeProjects + 1) * (TREASURY_RESERVE + SETUP_COST);
  if (priorBudget < requiredReserve) return `Treasury reserve ${priorBudget.toFixed(0)} / ${requiredReserve}`;
  if ((state.treasury ?? 0) < SETUP_COST) return `Setup funds ${(state.treasury ?? 0).toFixed(0)} / ${SETUP_COST}`;
  void stateCenter;
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
  // monster_domain / wild_margin are not outpost targets (survival distance).
  const wildOk = cells.wildLand ? allowsFrontierOutpost(cells.wildLand[cellId]) : true;
  return (
    cells.state[cellId] === 0 &&
    cells.province[cellId] === 0 &&
    frontier.cellStages[cellId] === FRONTIER_STAGE.wilderness &&
    cells.capacity[cellId] >= MIN_OUTPOST_CAPACITY &&
    cells.danger[cellId] <= MAX_OUTPOST_DANGER &&
    wildOk
  );
}

function scoreCandidate(cells: WorldContext["pack"]["cells"], cellId: number, random: number): number {
  const waterAccess = cells.r[cellId] ? 20 : cells.harbor[cellId] ? 15 : cells.conf[cellId] ? 8 : 0;
  const terrainPenalty = cells.h[cellId] >= 70 ? 20 : cells.h[cellId] >= 55 ? 8 : 0;
  return (
    cells.capacity[cellId] + cells.s[cellId] * 2 + waterAccess - cells.danger[cellId] * 0.8 - terrainPenalty + random
  );
}

function transferColonists(
  cells: WorldContext["pack"]["cells"],
  candidate: FrontierCandidate,
  frontier: FrontierSimulationState,
  stateId: number
): number {
  if (candidate.colonists < MIN_COLONISTS) return 0;
  let transferred = 0;
  for (const contribution of candidate.contributions) {
    if (contribution.isPool) {
      transferred += transferFromApplicantPool(cells, candidate.cellId, frontier, stateId, contribution.colonists);
      continue;
    }
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

/**
 * Draws up to `requested` population points from the state's frontier applicant pool
 * (adults only, no children/elders — they were already adult-only when rural labour
 * released them) and lands them on the new outpost cell, split by the pool's own sex ratio.
 */
function transferFromApplicantPool(
  cells: WorldContext["pack"]["cells"],
  targetCellId: number,
  frontier: FrontierSimulationState,
  stateId: number,
  requested: number
): number {
  const pool = frontier.applicantPoolByState[stateId];
  const poolTotal = pool ? pool.maleAdults + pool.femaleAdults : 0;
  if (!pool || poolTotal <= 0) return 0;

  const colonists = Math.min(requested, poolTotal);
  if (colonists <= 0) return 0;
  const male = Math.min(pool.maleAdults, colonists * (pool.maleAdults / poolTotal));
  const female = colonists - male;

  pool.maleAdults -= male;
  pool.femaleAdults -= female;
  cells.maleAdults[targetCellId] += male;
  cells.femaleAdults[targetCellId] += female;
  cells.pop[targetCellId] += colonists;
  return colonists;
}

function estimateSourceContribution(sourcePopulation: number, sourceCapacity: number): number {
  const surplus = sourcePopulation - sourceCapacity * SOURCE_RETENTION_RATIO;
  return Math.max(0, Math.min(12, surplus * 0.5));
}

function ensureFrontierState(simulation: SimulationContext, cellCount: number): FrontierSimulationState {
  const frontier = simulation.frontier;
  if (frontier.cellStages.length === cellCount) return frontier;
  simulation.frontier = createEmptyFrontierSimulationState(cellCount);
  return simulation.frontier;
}

function isFrontierPattern(pattern: WorldContext["options"]["initialSettlementPattern"] | undefined): boolean {
  return pattern === "frontier" || pattern === "scattered";
}

/**
 * One slot is available to every State. Population and connected settlement
 * network unlock up to two additional, independently supplied frontier fronts.
 */
export function getFrontierProjectSlots(stateId: number, cells: WorldContext["pack"]["cells"]): number {
  let ruralPopulation = 0;
  let connectedCells = 0;
  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (cells.state[cellId] !== stateId) continue;
    ruralPopulation += cells.pop[cellId] ?? 0;
    if (Object.keys(cells.routes?.[cellId] ?? {}).length) connectedCells++;
  }
  return Math.min(MAX_FRONTIER_PROJECT_SLOTS, 1 + Math.floor(ruralPopulation / 50) + Math.floor(connectedCells / 12));
}

function getActiveProjectCount(frontier: FrontierSimulationState, stateId: number): number {
  return Object.values(frontier.projects).filter(project => project.stateId === stateId).length;
}

function getActiveProjectSectors(
  frontier: FrontierSimulationState,
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  stateCenter: number | undefined
): Set<string> {
  return new Set(
    Object.values(frontier.projects)
      .filter(project => project.stateId === stateId)
      .map(project => getFrontierSector(project.cellId, stateCenter, cells))
  );
}

function getFrontierSector(
  cellId: number,
  stateCenter: number | undefined,
  cells: WorldContext["pack"]["cells"]
): string {
  const center = stateCenter !== undefined ? cells.p?.[stateCenter] : undefined;
  const point = cells.p?.[cellId];
  if (!center || !point) return `local-${cellId}`;

  const angle = Math.atan2(point[1] - center[1], point[0] - center[0]);
  const sector = Math.floor((((angle + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8);
  return FRONTIER_SECTOR_NAMES[sector] ?? `local-${cellId}`;
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
