import {
  addFrontierApplicants,
  createEmptyFrontierSimulationState,
  FRONTIER_STAGE,
  type FrontierProject,
  type FrontierSimulationState,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import { allowsGeneratedSeaLanes } from "../utils/frontierStartMode";
import { isFrontierExpansionPattern } from "../utils/initialSettlementPattern";
import { isTrueOceanHarborCell, isTrueOceanPortBurg } from "../utils/oceanPort";
import type { RNGService } from "../utils/probabilityUtils";
import { getCellPrecipitation, getCellWaterAccess } from "./cellWaterAccess";
import { FRONTIER_OUTPOST_MAX_DANGER } from "./dangerExpandPolicy";
import { assessFrontierSupport, getFrontierGovernance, statusForProject } from "./frontierGovernance";
import { type FrontierIncorporation, incorporateEligibleFrontierSettlements } from "./frontierIncorporation";
import { getCellSubsistenceCapacity } from "./subsistenceCapacity";
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
/**
 * Cost per hop of distance from the State's own territory, applied to every
 * land candidate's score. Founding and later corridor-claiming a settlement
 * are both instantaneous population/land transactions with no simulated
 * travel, escort, or elapsed time — nothing else in the scoring makes a
 * six-hop reach materially riskier or slower than a one-hop one. This term is
 * the only thing standing in for that missing cost, so it must be large
 * enough that a generic resource claim cannot make a maximal reach the
 * default outcome (see RESOURCE_CLAIM_* below). Precious metals (gold,
 * silver) are the exception: a guarded vein commits the State to the
 * corridor that shortens the remaining hop count, while this penalty still
 * prefers the next step over a jump.
 */
const LAND_HOP_PENALTY = 25;
const SOURCE_RETENTION_RATIO = 0.65;
const MAX_FRONTIER_PROJECT_SLOTS = 3;
/** A one- or two-cell rock cannot sustain the harbour town and hinterland an overseas colony requires. */
const MIN_SEABORNE_TARGET_LAND_CELLS = 8;
/** Overseas colonization needs a quiet beachhead, not a shore already in another State's immediate reach. */
const MIN_SEABORNE_FOREIGN_STATE_HOPS = 8;
/** Count of accessible unclaimed land cells needed to make the port a viable expansion base. */
const MIN_SEABORNE_HINTERLAND_CELLS = 12;
const SEABORNE_HINTERLAND_SEARCH_HOPS = 12;
/** Annual capital convoy: food, construction material, and escorted migrants for the active overseas frontier. */
const SEABORNE_SUPPLY_COST = 4;
const SEABORNE_SUPPLY_FOOD = 2;
const SEABORNE_SUPPLY_COLONISTS = 3;
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
  /** Full incorporation transactions, including a completed overseas harbour if one was founded. */
  readonly incorporations: readonly FrontierIncorporation[];
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
  /** Land expansion, or an expedition that founds an overseas harbour settlement. */
  readonly origin: "land" | "seaborne";
  /** Present only for seaborne expeditions. */
  readonly sourcePortCellId?: number;
  /** Discovered mineral site that this expedition advances toward. */
  readonly resourceClaimCellId?: number;
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
  if (!cells || !states || !isFrontierExpansionPattern(world.options?.initialSettlementPattern)) return [];
  const candidates: FrontierCandidateSummary[] = [];
  for (const state of states) {
    if (!state?.i || state.removed || getStateStartBlocker(state, simulation, state.i, cells, state.center)) continue;
    candidates.push(...getAvailableStateCandidates(state.i, world, simulation.frontier, state.center));
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
  if (!cells || !states || !isFrontierExpansionPattern(world.options?.initialSettlementPattern)) return [];
  const blockers: FrontierCandidateBlockerSummary[] = [];
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const startBlocker = getStateStartBlocker(state, simulation, state.i, cells, state.center);
    if (startBlocker) {
      blockers.push({ stateId: state.i, reason: startBlocker });
      continue;
    }
    const allCandidates = getStateCandidates(state.i, world, simulation.frontier, state.center);
    if (!getAvailableStateCandidates(state.i, world, simulation.frontier, state.center).length) {
      if (allCandidates.length) {
        blockers.push({ stateId: state.i, reason: "All viable sites are in active frontier sectors" });
        continue;
      }
      if (!canOpenSeaborneBeachhead(state.i, cells, simulation.frontier)) {
        blockers.push({ stateId: state.i, reason: "Existing overseas beachheads still have land to settle" });
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
  readonly origin: "land" | "seaborne";
  readonly sourcePortCellId?: number;
  readonly resourceClaimCellId?: number;
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
 * Capture each state's live treasury as the next January's protected reserve.
 * Must run before same-tick economy spending (population phase, or after
 * generate-post-core economy init) so Advance Time does not evaluate the
 * post-tax, post-upkeep remainder.
 */
export function snapshotFrontierBudgets(world: WorldContext, simulation: SimulationContext): boolean {
  const cells = world.pack?.cells;
  if (!cells || !isFrontierExpansionPattern(world.options?.initialSettlementPattern)) return false;
  const frontier = ensureFrontierState(simulation, cells.i.length);
  let changed = false;
  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    const next = Math.max(0, state.treasury ?? 0);
    if (frontier.budgetByState[state.i] !== next) {
      frontier.budgetByState[state.i] = next;
      changed = true;
    }
  }
  return changed;
}

function resolvedFrontierBudget(
  frontier: FrontierSimulationState,
  stateId: number,
  treasury: number | undefined
): number {
  return frontier.budgetByState[stateId] ?? Math.max(0, treasury ?? 0);
}

/**
 * Phase 3's annual, pre-incorporation expansion loop. It owns only unclaimed
 * cell stages and population transfers; changing `cells.state` is deliberately
 * reserved for the Phase 4 incorporation transaction.
 */
export function advanceFrontierExpansion(input: FrontierExpansionInput): FrontierExpansionResult {
  const { world, simulation } = input;
  const cells = world.pack?.cells;
  if (!cells || !isFrontierExpansionPattern(world.options?.initialSettlementPattern)) return emptyResult();
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
  let incorporations: readonly FrontierIncorporation[] = [];

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
    incorporations = incorporation.incorporations;
    for (const entry of incorporation.incorporations) incorporated.push(entry.settlementCellId);
    topics.add("simulation.states");
    topics.add("map.politics");
    topics.add("map.settlements");
    if (incorporation.incorporations.some(entry => entry.burgId !== undefined)) topics.add("simulation.burgs");
    if (incorporation.incorporations.some(entry => entry.routeAdded)) topics.add("map.networks");
  }

  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed || isAtWar(state)) continue;

    if (fundSeaborneBeachheadSupply(state.i, input, frontier)) topics.add("simulation.states");

    const slots = getFrontierProjectSlots(state.i, cells);
    let activeProjects = getActiveProjectCount(frontier, state.i);
    if (activeProjects >= slots) continue;
    const occupiedSectors = getActiveProjectSectors(frontier, state.i, cells, state.center);

    while (activeProjects < slots) {
      const requiredReserve = (activeProjects + 1) * (TREASURY_RESERVE + SETUP_COST);
      const priorBudget = resolvedFrontierBudget(frontier, state.i, state.treasury);
      // Eligibility uses the pre-economy snapshot. Same-tick tax and upkeep must
      // not zero the reserve that was already known at this calendar boundary.
      if (priorBudget < requiredReserve) break;
      if (hasActiveSeaborneProject(frontier, state.i)) break;

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
        origin: candidate.origin,
        sourcePortCellId: candidate.sourcePortCellId,
        resourceClaimCellId: candidate.resourceClaimCellId,
        stage: FRONTIER_STAGE.outpost,
        establishedYear: year,
        supportYears: 0,
        failedSupportYears: 0
      };
      if (candidate.resourceClaimCellId === candidate.cellId) {
        const claim = frontier.resourceClaimsByCell[candidate.cellId];
        if (claim?.stateId === state.i) claim.status = "settling";
      }
      occupiedSectors.add(candidate.sector);
      activeProjects++;

      established.push(candidate.cellId);
      topics.add("simulation.states");
      topics.add("map.settlements");
    }
  }

  return { topics: [...topics], established, abandoned, settled, incorporated, incorporations };
}

/**
 * A mature overseas harbour receives one annual convoy while it still has a
 * local frontier. The treasury payment represents grain and construction
 * materials; the escorted settlers enter the existing host-owned applicant
 * pool, so normal project rules still choose the exact next cell and perform
 * the population transfer transaction.
 */
function fundSeaborneBeachheadSupply(
  stateId: number,
  input: FrontierExpansionInput,
  frontier: FrontierSimulationState
): boolean {
  const { cells, states } = input.world.pack;
  const state = states[stateId];
  if (!state || state.removed) return false;
  const hasOpenBeachhead = (frontier.seaborneBeachheadsByState?.[stateId] ?? []).some(
    cellId => cells.state[cellId] === stateId && hasReachableBeachheadFrontier(cells, frontier, cellId, stateId)
  );
  if (!hasOpenBeachhead) return false;

  const priorBudget = resolvedFrontierBudget(frontier, stateId, state.treasury);
  if (priorBudget < TREASURY_RESERVE + SETUP_COST + SEABORNE_SUPPLY_COST) return false;

  state.treasury = Math.max(0, (state.treasury ?? 0) - SEABORNE_SUPPLY_COST);
  consumeFood(state, SEABORNE_SUPPLY_FOOD);
  addFrontierApplicants(frontier, stateId, SEABORNE_SUPPLY_COLONISTS / 2, SEABORNE_SUPPLY_COLONISTS / 2);
  return true;
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
  const priorBudget = resolvedFrontierBudget(frontier, project.stateId, state?.treasury);
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
  const candidates = getStateCandidates(stateId, input.world, input.simulation.frontier, stateCenter)
    .filter(candidate => !occupiedSectors.has(candidate.sector))
    .map(candidate => ({
      cellId: candidate.cellId,
      contributions: candidate.contributions,
      colonists: candidate.colonists,
      sector: candidate.sector,
      origin: candidate.origin,
      sourcePortCellId: candidate.sourcePortCellId,
      resourceClaimCellId: candidate.resourceClaimCellId,
      score: candidate.score + input.rng.rand()
    }));

  return candidates.sort((a, b) => b.score - a.score || a.cellId - b.cellId)[0] ?? null;
}

type InternalFrontierCandidateSummary = FrontierCandidateSummary & {
  readonly contributions: readonly FrontierContribution[];
};

function getStateCandidates(
  stateId: number,
  world: WorldContext,
  frontier: FrontierSimulationState,
  stateCenter: number | undefined
): readonly InternalFrontierCandidateSummary[] {
  const landCandidates = getLandStateCandidates(stateId, world, frontier, stateCenter);
  // Overseas colonization is an escape from a closed land frontier, not a
  // replacement for ordinary local settlement. A State first uses reachable
  // wilderness on its present landmass; only then may an ocean-going port
  // dispatch colonists to a different landmass on the same ocean.
  return landCandidates.length ? landCandidates : getSeaborneStateCandidates(stateId, world, frontier, stateCenter);
}

function getLandStateCandidates(
  stateId: number,
  world: WorldContext,
  frontier: FrontierSimulationState,
  stateCenter: number | undefined
): readonly InternalFrontierCandidateSummary[] {
  const { cells } = world.pack;
  const claimIndex = buildResourceClaimIndex(stateId, cells, frontier);

  // Frontier colonisation is a state-funded project, not a village-by-village
  // one. The applicant pool and every owned cell's local surplus are one
  // shared reserve — exactly how a seaborne expedition already draws on the
  // whole realm's surplus regardless of the crossing distance (see
  // getSeaborneStateCandidates below). A specific village's surplus is not
  // that village's private budget; the only geography constraint that
  // belongs to a specific target is *reachability* — can this unclaimed cell
  // be reached through the state's own or empty land within
  // MAX_FRONTIER_HOPS — not "did the money happen to originate nearby." A
  // per-source six-hop search here used to fragment a state's total surplus
  // across whichever handful of cells happened to sit within reach of each
  // individual target, so a state with plenty of aggregate surplus and
  // plenty of reachable open land could still find zero funded candidates
  // and fall through to an unnecessary overseas colony.
  const contributions: FrontierContribution[] = [];
  const poolAvailable = getFrontierApplicantPoolTotal(frontier, stateId);
  if (poolAvailable > 0) contributions.push({ sourceCellId: -1, colonists: poolAvailable, hops: 0, isPool: true });
  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    const available = estimateSourceContribution(
      cells.pop[sourceCellId] ?? 0,
      getCellSubsistenceCapacity(cells, sourceCellId)
    );
    if (available > 0) contributions.push({ sourceCellId, colonists: available, hops: 0 });
  }
  if (!contributions.length) return [];

  const candidates: InternalFrontierCandidateSummary[] = [];
  for (const { cellId, hops } of findReachableFrontierFromState(cells, frontier, stateId, claimIndex)) {
    const targetLimit = getFrontierTargetLimit(cells, cellId, claimIndex);
    let remaining = targetLimit;
    const limitedContributions: FrontierContribution[] = [];
    for (const contribution of [...contributions].sort(
      (a, b) => b.colonists - a.colonists || a.sourceCellId - b.sourceCellId
    )) {
      if (remaining <= 0) break;
      const colonists = Math.min(contribution.colonists, remaining);
      if (colonists <= 0) continue;
      limitedContributions.push({ ...contribution, colonists });
      remaining -= colonists;
    }
    const colonists = limitedContributions.reduce((total, contribution) => total + contribution.colonists, 0);
    if (colonists < MIN_COLONISTS) continue;
    const sourceCellIds = limitedContributions.filter(contribution => !contribution.isPool).map(c => c.sourceCellId);
    const sourceCellId = sourceCellIds[0] ?? cellId;
    candidates.push({
      stateId,
      cellId,
      sourceCellId,
      sourceCellIds,
      contributions: limitedContributions,
      colonists,
      sector: getFrontierSector(cellId, stateCenter, cells),
      origin: "land",
      resourceClaimCellId: claimIndex.nearestClaimCellId(cellId),
      score: scoreCandidate(world, cells, cellId, 0) + claimIndex.priority(cellId) - hops * LAND_HOP_PENALTY,
      setupCost: SETUP_COST,
      requiredReserve: TREASURY_RESERVE + SETUP_COST
    });
  }
  return candidates;
}

/**
 * Finds a substantial coastal wilderness site reachable from one of the
 * State's true ocean ports without assuming that a charted sea route already
 * exists. It may be on the State's original island when foreign territory has
 * cut its land frontier; the new settlement becomes the missing endpoint.
 */
function getSeaborneStateCandidates(
  stateId: number,
  world: WorldContext,
  frontier: FrontierSimulationState,
  stateCenter: number | undefined
): readonly InternalFrontierCandidateSummary[] {
  const { pack } = world;
  const { cells } = pack;
  if (!allowsGeneratedSeaLanes(world.options)) return [];
  // Saved maps from before coastal data existed cannot support a safe maritime
  // site selection. Keep their established land-frontier behaviour unchanged.
  if (!cells.f || !cells.haven || !cells.harbor || !cells.burg) return [];
  if (!canOpenSeaborneBeachhead(stateId, cells, frontier)) return [];

  const portsByOcean = new Map<number, number[]>();
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.state !== stateId || !isTrueOceanPortBurg(burg, pack)) continue;
    // isTrueOceanPortBurg guarantees this, but TypeScript cannot narrow an
    // optional Burg field through that helper's boolean return type.
    const oceanId = burg.port;
    if (!oceanId) continue;
    const ports = portsByOcean.get(oceanId) ?? [];
    ports.push(burg.cell);
    portsByOcean.set(oceanId, ports);
  }
  if (!portsByOcean.size) return [];

  const contributions: FrontierContribution[] = [];
  const poolAvailable = getFrontierApplicantPoolTotal(frontier, stateId);
  if (poolAvailable > 0) contributions.push({ sourceCellId: -1, colonists: poolAvailable, hops: 0, isPool: true });
  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    const available = estimateSourceContribution(
      cells.pop[sourceCellId] ?? 0,
      getCellSubsistenceCapacity(cells, sourceCellId)
    );
    if (available > 0) contributions.push({ sourceCellId, colonists: available, hops: 0 });
  }
  if (!contributions.length) return [];

  const candidates: InternalFrontierCandidateSummary[] = [];
  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isEligibleTarget(cells, frontier, cellId) || cells.burg[cellId]) continue;
    // The hinterland assessment is a twelve-hop graph search. Most eligible
    // wilderness cells cannot ever be an overseas landing site, so reject them
    // using the constant-time harbour and ocean checks before doing that search.
    if (!cells.harbor[cellId] || !isTrueOceanHarborCell(cellId, pack)) continue;
    const haven = cells.haven[cellId];
    if (!haven) continue;
    const departurePorts = portsByOcean.get(cells.f[haven]);
    if (!departurePorts?.length) continue;

    const targetLandCells = getSeaborneTargetLandCells(pack, cells.f[cellId]);
    if (targetLandCells < MIN_SEABORNE_TARGET_LAND_CELLS) continue;
    const hinterland = assessSeaborneHinterland(cells, cellId, stateId);
    if (
      hinterland.unclaimedLandCells < MIN_SEABORNE_HINTERLAND_CELLS ||
      hinterland.nearestForeignStateHops < MIN_SEABORNE_FOREIGN_STATE_HOPS
    ) {
      continue;
    }

    const targetLimit = getCellSubsistenceCapacity(cells, cellId) * 0.25;
    let remaining = targetLimit;
    const limitedContributions: FrontierContribution[] = [];
    for (const contribution of [...contributions].sort(
      (a, b) => b.colonists - a.colonists || a.sourceCellId - b.sourceCellId
    )) {
      if (remaining <= 0) break;
      const colonists = Math.min(contribution.colonists, remaining);
      if (colonists <= 0) continue;
      limitedContributions.push({ ...contribution, colonists });
      remaining -= colonists;
    }
    const colonists = limitedContributions.reduce((total, contribution) => total + contribution.colonists, 0);
    if (colonists < MIN_COLONISTS) continue;

    const sourcePortCellId = departurePorts
      .slice()
      .sort((a, b) => getCellDistance(cells, a, cellId) - getCellDistance(cells, b, cellId) || a - b)[0];
    if (sourcePortCellId === undefined) continue;
    const sourceCellIds = limitedContributions.filter(contribution => !contribution.isPool).map(c => c.sourceCellId);
    const distance = getCellDistance(cells, sourcePortCellId, cellId);
    candidates.push({
      stateId,
      cellId,
      sourceCellId: sourceCellIds[0] ?? sourcePortCellId,
      sourceCellIds,
      contributions: limitedContributions,
      colonists,
      sector: `sea-${getFrontierSector(cellId, stateCenter, cells)}`,
      origin: "seaborne",
      sourcePortCellId,
      // Prefer a colony with a real hinterland. Crossing distance is a soft
      // support cost, never a reason to settle a barren nearby islet instead.
      score:
        scoreCandidate(world, cells, cellId, 0) +
        getSeaborneHinterlandScore(targetLandCells) +
        Math.min(36, hinterland.unclaimedLandCells * 2) -
        distance / 250,
      setupCost: SETUP_COST,
      requiredReserve: TREASURY_RESERVE + SETUP_COST
    });
  }
  return candidates;
}

function getCellDistance(cells: WorldContext["pack"]["cells"], first: number, second: number): number {
  const firstPoint = cells.p?.[first];
  const secondPoint = cells.p?.[second];
  if (!firstPoint || !secondPoint) return 0;
  return Math.hypot(secondPoint[0] - firstPoint[0], secondPoint[1] - firstPoint[1]);
}

function getSeaborneTargetLandCells(world: WorldContext["pack"], featureId: number): number {
  const feature = world.features?.[featureId];
  return feature?.type === "island" ? feature.cells : 0;
}

function getSeaborneHinterlandScore(landCells: number): number {
  return Math.min(45, Math.log2(Math.max(1, landCells)) * 7);
}

function assessSeaborneHinterland(
  cells: WorldContext["pack"]["cells"],
  originCellId: number,
  stateId: number
): { unclaimedLandCells: number; nearestForeignStateHops: number } {
  const queue: Array<{ cellId: number; hops: number }> = [{ cellId: originCellId, hops: 0 }];
  const visited = new Set<number>([originCellId]);
  let unclaimedLandCells = 0;
  let nearestForeignStateHops = Infinity;

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    if (current.hops > SEABORNE_HINTERLAND_SEARCH_HOPS) continue;
    if (cells.state[current.cellId] === 0) unclaimedLandCells++;
    if (current.hops === SEABORNE_HINTERLAND_SEARCH_HOPS) continue;

    for (const neighborId of cells.c[current.cellId] ?? []) {
      if (cells.h[neighborId] < 20) continue;
      const hops = current.hops + 1;
      const owner = cells.state[neighborId];
      if (owner && owner !== stateId) {
        nearestForeignStateHops = Math.min(nearestForeignStateHops, hops);
        continue;
      }
      // The colonial hinterland is land that can be settled from the new port.
      // Do not route this estimate through a sponsoring State's separate realm.
      if (owner === stateId || visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ cellId: neighborId, hops });
    }
  }
  return { unclaimedLandCells, nearestForeignStateHops };
}

function getAvailableStateCandidates(
  stateId: number,
  world: WorldContext,
  frontier: FrontierSimulationState,
  stateCenter: number | undefined
): readonly InternalFrontierCandidateSummary[] {
  const { cells } = world.pack;
  const occupiedSectors = getActiveProjectSectors(frontier, stateId, cells, stateCenter);
  const hasActiveOverseasProject = hasActiveSeaborneProject(frontier, stateId);
  return getStateCandidates(stateId, world, frontier, stateCenter).filter(
    candidate =>
      !occupiedSectors.has(candidate.sector) &&
      // A State funds and protects one beachhead until it is incorporated.
      // This prevents a spare project slot from scattering colonies across
      // nearby islands in the same few years.
      !(hasActiveOverseasProject && candidate.origin === "seaborne")
  );
}

/**
 * Mirrors getLandStateCandidates's funding: the applicant pool and every
 * owned cell's surplus are one shared state-wide reserve, spendable on
 * whichever reachable target has the largest capacity headroom.
 */
function getBestReachableColonistPool(
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState
): number {
  const claimIndex = buildResourceClaimIndex(stateId, cells, frontier);
  let totalAvailable = getFrontierApplicantPoolTotal(frontier, stateId);
  for (let sourceCellId = 0; sourceCellId < cells.i.length; sourceCellId++) {
    if (cells.state[sourceCellId] !== stateId) continue;
    totalAvailable += estimateSourceContribution(
      cells.pop[sourceCellId] ?? 0,
      getCellSubsistenceCapacity(cells, sourceCellId)
    );
  }
  if (totalAvailable <= 0) return 0;

  let best = 0;
  for (const { cellId } of findReachableFrontierFromState(cells, frontier, stateId, claimIndex)) {
    const targetLimit = getFrontierTargetLimit(cells, cellId, claimIndex);
    best = Math.max(best, Math.min(totalAvailable, targetLimit));
  }
  return best;
}

/** Total population points (both sexes) waiting in a state's frontier applicant pool. */
function getFrontierApplicantPoolTotal(frontier: FrontierSimulationState, stateId: number): number {
  const pool = frontier.applicantPoolByState[stateId];
  return pool ? pool.maleAdults + pool.femaleAdults : 0;
}

function getStateStartBlocker(
  state: { treasury?: number; diplomacy?: unknown },
  simulation: SimulationContext,
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  stateCenter: number | undefined
): string | null {
  const activeProjects = getActiveProjectCount(simulation.frontier, stateId);
  const slots = getFrontierProjectSlots(stateId, cells);
  if (activeProjects >= slots) return `All ${slots} frontier slots are active`;
  if (isAtWar(state)) return "At war";
  const priorBudget = resolvedFrontierBudget(simulation.frontier, stateId, state.treasury);
  const requiredReserve = (activeProjects + 1) * (TREASURY_RESERVE + SETUP_COST);
  if (priorBudget < requiredReserve) return `Treasury reserve ${priorBudget.toFixed(0)} / ${requiredReserve}`;
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

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    if (current.hops >= MAX_FRONTIER_HOPS) continue;
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

/**
 * Returns every eligible frontier cell reached from the State's territory,
 * with the shortest hop count from any owned cell. This is used for a pooled
 * migrant reserve: unlike a village contribution, the pool has no individual
 * source cell and must not trigger one identical graph search per village.
 */
function findReachableFrontierFromState(
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState,
  stateId: number,
  claimIndex?: ResourceClaimIndex
): Array<{ cellId: number; hops: number }> {
  const queue: Array<{ cellId: number; hops: number }> = [];
  const visited = new Set<number>();
  const candidates: Array<{ cellId: number; hops: number }> = [];

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (cells.state[cellId] !== stateId) continue;
    visited.add(cellId);
    queue.push({ cellId, hops: 0 });
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    if (current.hops >= MAX_FRONTIER_HOPS) continue;
    for (const cellId of cells.c[current.cellId] ?? []) {
      if (visited.has(cellId) || !isTraversableFrontierCell(cells, stateId, cellId)) continue;
      visited.add(cellId);
      const hops = current.hops + 1;
      if (isEligibleTarget(cells, frontier, cellId, claimIndex)) candidates.push({ cellId, hops });
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
  cellId: number,
  claimIndex?: ResourceClaimIndex
): boolean {
  // Monster domains stay banned; the danger margin is allowed but scores worse.
  const wildOk = cells.wildLand ? allowsFrontierOutpost(cells.wildLand[cellId]) : true;
  const hasFarmCapacity = getCellSubsistenceCapacity(cells, cellId) >= MIN_OUTPOST_CAPACITY;
  // A guarded precious-metal vein (and the dry cells that shorten the
  // remaining walk to it) is a mining camp, not a farm. Local subsistence is
  // allowed to fall below the ordinary outpost floor; the sponsoring State
  // already ships SETUP_FOOD with the expedition.
  const miningApproach = claimIndex?.isPreciousMetalApproach(cellId) ?? false;
  return (
    cells.state[cellId] === 0 &&
    cells.province[cellId] === 0 &&
    frontier.cellStages[cellId] === FRONTIER_STAGE.wilderness &&
    (hasFarmCapacity || miningApproach) &&
    cells.danger[cellId] <= MAX_OUTPOST_DANGER &&
    wildOk
  );
}

function getFrontierTargetLimit(
  cells: WorldContext["pack"]["cells"],
  cellId: number,
  claimIndex: ResourceClaimIndex
): number {
  const farmLimit = getCellSubsistenceCapacity(cells, cellId) * 0.25;
  return claimIndex.isPreciousMetalApproach(cellId) ? Math.max(farmLimit, MIN_COLONISTS) : farmLimit;
}

function scoreCandidate(
  world: WorldContext,
  cells: WorldContext["pack"]["cells"],
  cellId: number,
  random: number
): number {
  const waterAccess = getCellWaterAccess(cells, cellId, getCellPrecipitation(world, cellId)).score;
  const terrainPenalty = cells.h[cellId] >= 70 ? 20 : cells.h[cellId] >= 55 ? 8 : 0;
  return (
    getCellSubsistenceCapacity(cells, cellId) +
    cells.s[cellId] * 2 +
    waterAccess -
    cells.danger[cellId] * 0.8 -
    terrainPenalty +
    random
  );
}

/** Full bonus for a candidate that IS the discovered resource cell. */
const RESOURCE_CLAIM_MATCH_BONUS = 90;
/** Ceiling of the tapering bonus for a candidate merely approaching a claim. */
const RESOURCE_CLAIM_APPROACH_BONUS = 70;
const RESOURCE_CLAIM_APPROACH_DECAY = 4;
/**
 * Gold and silver are valuable enough to justify a dry highland mining camp.
 * The match bonus must clear a river (+20), mountain terrain (up to 20), and
 * a large subsistence gap; the approach bonus is a flat corridor commitment
 * so the hop penalty still prefers the next cell over a six-hop jump.
 */
const PRECIOUS_METAL_CLAIM_MATCH_BONUS = 200;
const PRECIOUS_METAL_CLAIM_APPROACH_BONUS = 180;
/** Survey parties can spot a vein up to 20 hops out; walk far enough to reach the State. */
const RESOURCE_CLAIM_HOP_SEARCH = 24;

/** Commodities valuable enough to pull expansion toward a dry, riverless vein (see LAND_HOP_PENALTY). */
const PRECIOUS_METAL_COMMODITIES = new Set(["gold", "silver"]);

function isPreciousMetal(commodity: string): boolean {
  return PRECIOUS_METAL_COMMODITIES.has(commodity);
}

type ResourceClaimIndex = {
  readonly nearestClaimCellId: (candidateCellId: number) => number | undefined;
  readonly isPreciousMetalApproach: (cellId: number) => boolean;
  readonly priority: (cellId: number) => number;
};

/**
 * A claim is survey knowledge, not ownership. Ordinary minerals keep a
 * Euclidean taper that can tip a close call without making the farthest
 * reachable cell the default pick. Gold and silver are different: lode veins
 * sit on shield/orogen cells that usually have no river, so a farm-weighted
 * score walks a short way toward the find and then diverts to wetter land. A
 * guarded precious-metal claim therefore commits the State to any cell that
 * shortens the remaining hop count.
 *
 * regimentMovement.ts's getResourceGuardClaim() marches a disposable regiment
 * out to a freshly surveyed claim ("discovered" → "guardMarching" →
 * "guarding"). Before that regiment physically arrives, nothing is actually
 * holding the site — pulling colonist funding toward it already would be
 * the same unescorted population jump this priority exists to justify
 * against ordinary, closer land. Wait for "guarding" before it can pull.
 */
function buildResourceClaimIndex(
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState
): ResourceClaimIndex {
  const claims: Array<{ cellId: number; commodity: string; hopsFromCell: Map<number, number> }> = [];
  for (const claim of Object.values(frontier.resourceClaimsByCell)) {
    if (claim.stateId !== stateId || claim.status !== "guarding" || cells.state[claim.cellId] !== 0) continue;
    claims.push({
      cellId: claim.cellId,
      commodity: claim.commodity,
      hopsFromCell: buildHopDistancesFrom(cells, stateId, claim.cellId, RESOURCE_CLAIM_HOP_SEARCH)
    });
  }

  const stateHopsToClaim = new Map<number, number>();
  for (const claim of claims) {
    let best = Infinity;
    for (let cellId = 0; cellId < cells.i.length; cellId++) {
      if (cells.state[cellId] !== stateId) continue;
      const hops = claim.hopsFromCell.get(cellId);
      if (hops !== undefined && hops < best) best = hops;
    }
    if (best !== Infinity) stateHopsToClaim.set(claim.cellId, best);
  }

  const nearestClaimCellId = (candidateCellId: number): number | undefined => {
    const candidatePoint = cells.p?.[candidateCellId];
    if (!candidatePoint) return undefined;
    let bestCellId: number | undefined;
    let bestDistance = Infinity;
    for (const claim of claims) {
      const claimPoint = cells.p?.[claim.cellId];
      if (!claimPoint) continue;
      const distance = Math.hypot(candidatePoint[0] - claimPoint[0], candidatePoint[1] - claimPoint[1]);
      if (distance < bestDistance || (distance === bestDistance && claim.cellId < (bestCellId ?? Infinity))) {
        bestCellId = claim.cellId;
        bestDistance = distance;
      }
    }
    return bestCellId;
  };

  const claimByCellId = new Map(claims.map(claim => [claim.cellId, claim]));

  const isCloserToPreciousMetal = (cellId: number, claimCellId: number): boolean => {
    const claim = claimByCellId.get(claimCellId);
    if (!claim || !isPreciousMetal(claim.commodity)) return false;
    const remaining = stateHopsToClaim.get(claimCellId);
    const hopsToClaim = claim.hopsFromCell.get(cellId);
    return remaining !== undefined && hopsToClaim !== undefined && hopsToClaim < remaining;
  };

  return {
    nearestClaimCellId,
    isPreciousMetalApproach: cellId => {
      for (const claim of claims) {
        if (!isPreciousMetal(claim.commodity)) continue;
        if (claim.cellId === cellId || isCloserToPreciousMetal(cellId, claim.cellId)) return true;
      }
      return false;
    },
    priority: candidateCellId => {
      const claimCellId = nearestClaimCellId(candidateCellId);
      if (claimCellId === undefined) return 0;
      const claim = claimByCellId.get(claimCellId);
      if (!claim) return 0;
      const bonuses = getResourceClaimBonuses(claim.commodity);
      if (claimCellId === candidateCellId) return bonuses.match;
      if (isPreciousMetal(claim.commodity)) {
        return isCloserToPreciousMetal(candidateCellId, claimCellId) ? bonuses.approach : 0;
      }
      const candidatePoint = cells.p?.[candidateCellId];
      const claimPoint = cells.p?.[claimCellId];
      if (!candidatePoint || !claimPoint) return 0;
      const distance = Math.hypot(candidatePoint[0] - claimPoint[0], candidatePoint[1] - claimPoint[1]);
      return Math.max(0, bonuses.approach - distance / RESOURCE_CLAIM_APPROACH_DECAY);
    }
  };
}

function getResourceClaimBonuses(commodity: string): { match: number; approach: number } {
  return isPreciousMetal(commodity)
    ? { match: PRECIOUS_METAL_CLAIM_MATCH_BONUS, approach: PRECIOUS_METAL_CLAIM_APPROACH_BONUS }
    : { match: RESOURCE_CLAIM_MATCH_BONUS, approach: RESOURCE_CLAIM_APPROACH_BONUS };
}

function buildHopDistancesFrom(
  cells: WorldContext["pack"]["cells"],
  stateId: number,
  originCellId: number,
  maxHops: number
): Map<number, number> {
  const hops = new Map<number, number>([[originCellId, 0]]);
  const queue = [originCellId];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    const currentHops = hops.get(current) ?? 0;
    if (currentHops >= maxHops) continue;
    for (const neighborId of cells.c[current] ?? []) {
      if (hops.has(neighborId) || !isTraversableFrontierCell(cells, stateId, neighborId)) continue;
      hops.set(neighborId, currentHops + 1);
      queue.push(neighborId);
    }
  }
  return hops;
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

/** `sourceCapacity` is subsistence K, the same ceiling demography uses. */
function estimateSourceContribution(sourcePopulation: number, sourceCapacity: number): number {
  const surplus = sourcePopulation - sourceCapacity * SOURCE_RETENTION_RATIO;
  return Math.max(0, Math.min(12, surplus * 0.5));
}

function ensureFrontierState(simulation: SimulationContext, cellCount: number): FrontierSimulationState {
  const frontier = simulation.frontier;
  if (frontier.cellStages.length === cellCount) {
    // Archives created before seaborne colonization need this sparse ledger
    // added in place; replacing frontier would discard live projects.
    frontier.seaborneBeachheadsByState ??= {};
    return frontier;
  }
  simulation.frontier = createEmptyFrontierSimulationState(cellCount);
  return simulation.frontier;
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

function hasActiveSeaborneProject(frontier: FrontierSimulationState, stateId: number): boolean {
  return Object.values(frontier.projects).some(project => project.stateId === stateId && project.origin === "seaborne");
}

/**
 * A new overseas landing is permitted only after every prior overseas harbour
 * has exhausted its own immediately reachable frontier. This keeps a State
 * focused on developing the colony it already founded instead of hopping from
 * one contested coast to the next every few years.
 */
function canOpenSeaborneBeachhead(
  stateId: number,
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState
): boolean {
  const beachheads = frontier.seaborneBeachheadsByState?.[stateId] ?? [];
  return beachheads
    .filter(cellId => cells.state[cellId] === stateId)
    .every(cellId => !hasReachableBeachheadFrontier(cells, frontier, cellId, stateId));
}

function hasReachableBeachheadFrontier(
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState,
  beachheadCellId: number,
  stateId: number
): boolean {
  return findReachableFrontier(cells, frontier, beachheadCellId, stateId).some(({ cellId }) =>
    isEligibleTarget(cells, frontier, cellId)
  );
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

function consumeFood(state: { foodStock?: number }, amount: number): void {
  if (state.foodStock !== undefined) state.foodStock = Math.max(0, state.foodStock - amount);
}

function emptyResult(): FrontierExpansionResult {
  return { topics: [], established: [], abandoned: [], settled: [], incorporated: [], incorporations: [] };
}
