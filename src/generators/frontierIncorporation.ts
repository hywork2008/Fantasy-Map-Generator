import { FRONTIER_STAGE, type FrontierSimulationState, type SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { Province, State } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { Burgs } from "./burgs-generator";
import { canStateClaimCell } from "./dangerExpandPolicy";
import { Provinces } from "./provinces-generator";
import { States } from "./states-generator";
import { assignWildLandTags, isMonsterDomain } from "./wildLandTags";

/** A supported outpost that still has residents may incorporate; 4 was higher than a typical transfer. */
const MIN_SETTLEMENT_POPULATION = 1;
const MIN_SETTLEMENT_SUPPORT_YEARS = 3;
const MAX_ADMINISTRATIVE_CORRIDOR_HOPS = 8;

export interface FrontierIncorporationInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
}

export interface FrontierIncorporation {
  readonly settlementCellId: number;
  readonly stateId: number;
  readonly origin: "land" | "seaborne";
  /** Newly claimed cells, including the settlement and its supply corridor. */
  readonly cellIds: readonly number[];
  readonly provinceId: number;
  /** A seaborne incorporation establishes this harbour burg immediately. */
  burgId?: number;
  /** True when the new harbour opened a sea-route segment. */
  routeAdded?: boolean;
}

export interface FrontierIncorporationResult {
  readonly incorporations: readonly FrontierIncorporation[];
}

/**
 * Phase 4's ownership transaction. A settled frontier project is promoted only
 * through a short, passable administrative corridor; the transaction claims
 * that corridor, assigns it to a province, then refreshes every political
 * aggregate before its caller publishes a single commit.
 */
export function incorporateEligibleFrontierSettlements(input: FrontierIncorporationInput): FrontierIncorporationResult {
  const { world, simulation } = input;
  const { cells, states } = world.pack;
  const frontier = simulation.frontier;
  const incorporations: FrontierIncorporation[] = [];

  for (const project of Object.values(frontier.projects)) {
    if (!isEligibleSettlement(project, frontier, cells, states, simulation.currentYear)) continue;

    const origin = project.origin ?? "land";
    // A seaborne project has already demonstrated its supply corridor through
    // its departure port. It forms an overseas province instead of fabricating
    // a land connection across another State or open water.
    const corridor =
      origin === "seaborne"
        ? [project.cellId]
        : findAdministrativeCorridor(cells, frontier, project.cellId, project.stateId);
    if (!corridor) continue;

    const provinceId = getOrCreateAdministrativeProvince(world, project.stateId, project.cellId, corridor);
    // Never annex monster_domain cores along the corridor (survival distance).
    const claimedCellIds = corridor.filter(
      cellId =>
        cells.state[cellId] === 0 &&
        canStateClaimCell(cells.danger?.[cellId]) &&
        !isMonsterDomain(cells.wildLand?.[cellId])
    );
    // Settlement must itself be claimable; otherwise abandon this incorporation.
    if (
      cells.state[project.cellId] === 0 &&
      (!canStateClaimCell(cells.danger?.[project.cellId]) || isMonsterDomain(cells.wildLand?.[project.cellId]))
    ) {
      continue;
    }
    for (const cellId of claimedCellIds) {
      cells.state[cellId] = project.stateId;
      cells.province[cellId] = provinceId;
      frontier.cellStages[cellId] = FRONTIER_STAGE.incorporated;
    }

    if (origin === "seaborne") {
      const beachheads = frontier.seaborneBeachheadsByState[project.stateId] ?? [];
      if (!beachheads.includes(project.cellId)) beachheads.push(project.cellId);
      frontier.seaborneBeachheadsByState[project.stateId] = beachheads;
    }

    delete frontier.projects[project.cellId];
    incorporations.push({
      settlementCellId: project.cellId,
      stateId: project.stateId,
      origin,
      cellIds: claimedCellIds,
      provinceId
    });
  }

  if (incorporations.length) {
    recomputePoliticalAggregates(world);
    for (const incorporation of incorporations) {
      if (incorporation.origin !== "seaborne" || cells.burg[incorporation.settlementCellId]) continue;
      const point = cells.p?.[incorporation.settlementCellId];
      if (!point) continue;
      const founded = Burgs.add(point, { routeStateId: incorporation.stateId, developPort: true });
      incorporation.burgId = founded.burgId;
      incorporation.routeAdded = Boolean(founded.newRoute);
    }
    assignWildLandTags(cells);
  }
  return { incorporations };
}

function isEligibleSettlement(
  project: FrontierSimulationState["projects"][number],
  frontier: FrontierSimulationState,
  cells: WorldContext["pack"]["cells"],
  states: State[],
  year: number
): boolean {
  const state = states[project.stateId];
  return (
    project.stage === FRONTIER_STAGE.settlement &&
    frontier.cellStages[project.cellId] === FRONTIER_STAGE.settlement &&
    !!state &&
    !state?.removed &&
    cells.state[project.cellId] === 0 &&
    cells.province[project.cellId] === 0 &&
    (cells.pop[project.cellId] ?? 0) >= MIN_SETTLEMENT_POPULATION &&
    project.supportYears >= MIN_SETTLEMENT_SUPPORT_YEARS &&
    year > project.establishedYear + MIN_SETTLEMENT_SUPPORT_YEARS
  );
}

/**
 * Administrative incorporation requires a short land corridor, but not a
 * route. Frontier settlements remain roadless until a burg is established;
 * using cell adjacency here preserves that rule without stranding a settlement
 * outside its sponsoring State forever.
 */
function findAdministrativeCorridor(
  cells: WorldContext["pack"]["cells"],
  frontier: FrontierSimulationState,
  settlementCellId: number,
  stateId: number
): number[] | null {
  const queue: Array<{ cellId: number; path: number[] }> = [{ cellId: settlementCellId, path: [settlementCellId] }];
  const visited = new Set<number>([settlementCellId]);

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (cells.state[current.cellId] === stateId) return current.path;
    if (current.path.length > MAX_ADMINISTRATIVE_CORRIDOR_HOPS) continue;

    for (const neighborId of cells.c[current.cellId] ?? []) {
      if (visited.has(neighborId)) continue;
      if (cells.h[neighborId] < 20) continue;
      const neighborState = cells.state[neighborId];
      if (neighborState !== 0 && neighborState !== stateId) continue;
      // Unclaimed cells still hosting another active frontier project (outpost
      // or settlement) must not be swallowed as corridor land — that would
      // desync frontier.cellStages from that project's own stage.
      if (neighborState === 0 && frontier.cellStages[neighborId] !== FRONTIER_STAGE.wilderness) continue;
      visited.add(neighborId);
      queue.push({ cellId: neighborId, path: [...current.path, neighborId] });
    }
  }

  return null;
}

function getOrCreateAdministrativeProvince(
  world: WorldContext,
  stateId: number,
  settlementCellId: number,
  corridor: readonly number[]
): number {
  const { cells, provinces, states } = world.pack;
  const state = states[stateId];
  const connectedStateCell = corridor.find(cellId => cells.state[cellId] === stateId);
  const connectedProvinceId = connectedStateCell === undefined ? 0 : cells.province[connectedStateCell];
  if (connectedProvinceId && provinces[connectedProvinceId] && !provinces[connectedProvinceId].removed) {
    return connectedProvinceId;
  }

  const provinceId = provinces.length;
  const name = `${state.name} Frontier`;
  const province: Province = {
    i: provinceId,
    state: stateId,
    center: settlementCellId,
    burg: 0,
    name,
    formName: "Frontier",
    fullName: name,
    color: state.color ?? "#999999",
    coa: null,
    burgs: []
  };
  provinces.push(province);
  if (!state.provinces) state.provinces = [];
  state.provinces.push(provinceId);
  return provinceId;
}

function recomputePoliticalAggregates(world: WorldContext): void {
  // WorldContext structurally contains the generator's pure WorldState input.
  const state = world as WorldState;
  States.collectStatistics(state);
  States.findNeighbors(world);
  Provinces.collectStatistics(state);
}
