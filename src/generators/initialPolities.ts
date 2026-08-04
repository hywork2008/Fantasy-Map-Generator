import FlatQueue from "flatqueue";
import type { Burg, State } from "../types/models";
import type { SettlementFoundationPlan, SettlementNode } from "../types/settlementFoundation";
import { canStateClaimCell } from "./dangerExpandPolicy";

type NumberColumn = ArrayLike<number> & { [index: number]: number; fill(value: number): unknown };

export interface InitialPolityCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly h: ArrayLike<number>;
  readonly pop: ArrayLike<number>;
  readonly burg: ArrayLike<number>;
  readonly routes: Readonly<Record<number, Readonly<Record<number, number>>>>;
  readonly p: readonly (readonly [number, number])[];
  /** Optional danger field — high danger cells are not claimed as state territory. */
  readonly danger?: ArrayLike<number>;
  state: NumberColumn;
}

export interface InitialPolitiesInput {
  readonly plan: SettlementFoundationPlan;
  readonly cells: InitialPolityCells;
  readonly burgs: readonly Burg[];
  readonly states: readonly State[];
}

/**
 * Owns Foundation-map political control.
 *
 * Territory comes from:
 * 1. Materialized route corridors from each capital (movement network).
 * 2. The full Settlement Foundation region around capital seeds — so oikoumene
 *    land share becomes visible state land, **including every burg** inside that
 *    region. Leaving towns as unlinked neutral holes created Swiss-cheese maps
 *    (empty countryside claimed, cities neutral).
 *
 * Burgs *outside* any foundation region stay free. Wilderness stays unclaimed.
 */
export function assignInitialPolities({ plan, cells, burgs, states }: InitialPolitiesInput): void {
  const lockedStateAtCell = getLockedStateCells(cells, states);
  const stateAtRouteCell = assignRouteNetwork(states, burgs, cells, lockedStateAtCell);
  const nodesByRegion = groupNodesByRegion(plan);
  const capitalStateByCell = getCapitalStateByCell(states, burgs);
  cells.state.fill(0);

  for (const cellId of Array.from(cells.i)) {
    if (lockedStateAtCell[cellId]) cells.state[cellId] = lockedStateAtCell[cellId];
  }

  for (const [cellId, stateId] of stateAtRouteCell) {
    if (cells.h[cellId] < 20 || lockedStateAtCell[cellId]) continue;
    // Capitals / burgs stay claimed even if danger is high; pure wilderness cores stay out.
    const forceCore = !!cells.burg[cellId] || cells.pop[cellId] > 0;
    if (!forceCore && !canStateClaimCell(cells.danger?.[cellId])) continue;
    cells.state[cellId] = stateId;
  }

  // Paint each foundation region from capital / route seeds. Towns and hinterland
  // use the same nearest-seed rule so cities are not left as 1-cell neutral holes.
  for (const region of plan.regions) {
    const regionNodes = nodesByRegion.get(region.id) ?? [];
    const ownershipSeeds = collectRegionOwnershipSeeds(
      region,
      regionNodes,
      stateAtRouteCell,
      capitalStateByCell,
      cells,
      burgs
    );
    if (!ownershipSeeds.size) continue;

    for (const cellId of region.cells) {
      if (cells.h[cellId] < 20 || lockedStateAtCell[cellId]) continue;

      const burgId = cells.burg[cellId];
      const forceCore = !!burgId || cells.pop[cellId] > 0;
      if (!forceCore && !canStateClaimCell(cells.danger?.[cellId])) continue;

      const owner = nearestSeedOwner(cellId, ownershipSeeds, cells.p);
      if (owner) cells.state[cellId] = owner;
    }
  }

  // Remaining populated oikoumene cells (including towns) join the nearest capital
  // that already holds land in the same foundation region.
  claimOrphanPopulatedCells(plan, cells, states, burgs, lockedStateAtCell);

  fillEnclosedUnclaimedLand(cells);
  for (const burg of burgs) {
    if (!burg.i || burg.removed) continue;
    burg.state = cells.state[burg.cell];
    burg.stateHistory = [burg.state];
  }
}

/**
 * Maps the Polity density slider (`statesNumber`) to capital count.
 *
 * Important: do **not** scale capitals with foundation node count. Larger
 * oikoumene footprints create more village nodes; tying capitals to nodes/2
 * produced dozens of micro-states and made land-share changes look like no-ops.
 */
export function getInitialPolityCapitalCount(plan: SettlementFoundationPlan, statesNumber: number): number {
  if (!plan.nodes.length || statesNumber <= 0) return 0;
  const target = Math.max(1, Math.round(statesNumber));
  // Prefer at least one capital per foundation region when density is high enough,
  // but never exceed the user-requested polity count or available nodes.
  const minimumUseful = Math.min(target, Math.max(1, plan.regions.length));
  return Math.min(plan.nodes.length, Math.max(minimumUseful, target));
}

/**
 * Selects capital sites from Foundation nodes without turning one settlement
 * cluster into a row of adjacent States. Every regional center is considered
 * before village nodes, and each phase uses farthest-point selection.
 */
export function selectInitialPolityCapitalNodes(
  plan: SettlementFoundationPlan,
  points: readonly (readonly [number, number])[],
  count: number
): SettlementNode[] {
  if (count <= 0 || !plan.nodes.length) return [];

  const targetCount = Math.min(plan.nodes.length, Math.floor(count));
  const regionalCenters = plan.nodes.filter(node => node.role === "center");
  const selected = selectFarthestNodes(regionalCenters, points, Math.min(targetCount, regionalCenters.length));
  if (selected.length === targetCount) return selected;

  const selectedIds = new Set(selected.map(node => node.id));
  const remaining = plan.nodes.filter(node => !selectedIds.has(node.id));
  return [...selected, ...selectFarthestNodes(remaining, points, targetCount - selected.length, selected)];
}

function selectFarthestNodes(
  candidates: readonly SettlementNode[],
  points: readonly (readonly [number, number])[],
  count: number,
  initialSelection: readonly SettlementNode[] = []
): SettlementNode[] {
  if (count <= 0 || !candidates.length) return [];

  const result = [...initialSelection];
  const newlySelected: SettlementNode[] = [];
  const available = [...candidates];

  while (newlySelected.length < count && available.length) {
    const next = result.length
      ? available.reduce((best, candidate) =>
          compareCapitalCandidates(candidate, best, result, points) > 0 ? candidate : best
        )
      : available.reduce((best, candidate) => (compareNodePriority(candidate, best) > 0 ? candidate : best));
    result.push(next);
    newlySelected.push(next);
    available.splice(available.indexOf(next), 1);
  }

  return newlySelected;
}

function compareCapitalCandidates(
  candidate: SettlementNode,
  current: SettlementNode,
  selected: readonly SettlementNode[],
  points: readonly (readonly [number, number])[]
): number {
  const candidateDistance = nearestSquaredDistance(candidate, selected, points);
  const currentDistance = nearestSquaredDistance(current, selected, points);
  return candidateDistance - currentDistance || compareNodePriority(candidate, current);
}

function nearestSquaredDistance(
  node: SettlementNode,
  selected: readonly SettlementNode[],
  points: readonly (readonly [number, number])[]
): number {
  const [x, y] = points[node.cell];
  return Math.min(
    ...selected.map(other => {
      const [otherX, otherY] = points[other.cell];
      return (x - otherX) ** 2 + (y - otherY) ** 2;
    })
  );
}

function compareNodePriority(left: SettlementNode, right: SettlementNode): number {
  return left.score - right.score || right.id - left.id;
}

function assignRouteNetwork(
  states: readonly State[],
  burgs: readonly Burg[],
  cells: InitialPolityCells,
  lockedStateAtCell: Uint16Array
): Map<number, number> {
  type QueueEntry = { readonly cell: number; readonly state: number; readonly cost: number };
  const queue = new FlatQueue<QueueEntry>();
  const cost = new Float64Array(cells.i.length).fill(Infinity);
  const owner = new Uint16Array(cells.i.length);

  for (const state of states) {
    if (!state.i || state.removed) continue;
    const capital = burgs[state.capital ?? 0];
    if (!capital || capital.removed) continue;
    cost[capital.cell] = 0;
    owner[capital.cell] = state.i;
    queue.push({ cell: capital.cell, state: state.i, cost: 0 }, 0);
  }

  while (queue.length) {
    const current = queue.pop()!;
    if (current.cost !== cost[current.cell] || current.state !== owner[current.cell]) continue;
    for (const neighborKey of Object.keys(cells.routes[current.cell] ?? {})) {
      const neighbor = Number(neighborKey);
      if (lockedStateAtCell[neighbor] && lockedStateAtCell[neighbor] !== current.state) continue;
      const totalCost = current.cost + distanceBetween(current.cell, neighbor, cells.p);
      if (totalCost > cost[neighbor] || (totalCost === cost[neighbor] && current.state >= owner[neighbor])) continue;
      cost[neighbor] = totalCost;
      owner[neighbor] = current.state;
      queue.push({ cell: neighbor, state: current.state, cost: totalCost }, totalCost);
    }
  }

  const result = new Map<number, number>();
  for (const cellId of Array.from(cells.i)) if (owner[cellId]) result.set(cellId, owner[cellId]);
  return result;
}

function getLockedStateCells(cells: InitialPolityCells, states: readonly State[]): Uint16Array {
  const locked = new Uint16Array(cells.i.length);
  for (const cellId of Array.from(cells.i)) {
    const stateId = cells.state[cellId];
    if (stateId && states[stateId]?.lock) locked[cellId] = stateId;
  }
  return locked;
}

function getCapitalStateByCell(states: readonly State[], burgs: readonly Burg[]): Map<number, number> {
  const capitalStateByCell = new Map<number, number>();
  for (const state of states) {
    if (!state.i || state.removed) continue;
    const capital = burgs[state.capital ?? 0];
    if (!capital || capital.removed) continue;
    capitalStateByCell.set(capital.cell, state.i);
  }
  return capitalStateByCell;
}

function groupNodesByRegion(plan: SettlementFoundationPlan): Map<number, SettlementFoundationPlan["nodes"][number][]> {
  const nodesByRegion = new Map<number, SettlementFoundationPlan["nodes"][number][]>();
  for (const node of plan.nodes) {
    const nodes = nodesByRegion.get(node.regionId) ?? [];
    nodes.push(node);
    nodesByRegion.set(node.regionId, nodes);
  }
  return nodesByRegion;
}

/**
 * Ownership seeds for a region: route-served cells that already have a state,
 * plus any capital that sits in the region (even if routes are empty).
 */
function collectRegionOwnershipSeeds(
  region: SettlementFoundationPlan["regions"][number],
  regionNodes: readonly SettlementFoundationPlan["nodes"][number][],
  stateAtRouteCell: ReadonlyMap<number, number>,
  capitalStateByCell: ReadonlyMap<number, number>,
  cells: InitialPolityCells,
  burgs: readonly Burg[]
): Map<number, number> {
  const seeds = new Map<number, number>();
  const regionCells = new Set(region.cells);

  for (const node of regionNodes) {
    const owner = stateAtRouteCell.get(node.cell) ?? capitalStateByCell.get(node.cell);
    if (owner) seeds.set(node.cell, owner);
  }

  for (const cellId of region.cells) {
    const owner = stateAtRouteCell.get(cellId) ?? capitalStateByCell.get(cellId);
    if (owner) seeds.set(cellId, owner);
  }

  // Capitals inside the region are always seeds even when the route map is sparse.
  for (const burg of burgs) {
    if (!burg.i || burg.removed || !burg.capital) continue;
    if (!regionCells.has(burg.cell)) continue;
    const owner = capitalStateByCell.get(burg.cell);
    if (owner) seeds.set(burg.cell, owner);
  }

  // If the capital sits on a node just outside a tiny region.cells list, still allow
  // seeds from any capital whose state already owns a route cell that touches the region.
  if (!seeds.size) {
    for (const cellId of region.cells) {
      for (const neighbor of cells.c[cellId] ?? []) {
        const owner = stateAtRouteCell.get(neighbor) ?? capitalStateByCell.get(neighbor);
        if (owner) seeds.set(neighbor, owner);
      }
    }
  }

  return seeds;
}

function nearestSeedOwner(cellId: number, seeds: ReadonlyMap<number, number>, points: InitialPolityCells["p"]): number {
  const [x, y] = points[cellId];
  let result = 0;
  let distance = Infinity;
  for (const [seedCell, owner] of seeds) {
    if (!owner) continue;
    const [seedX, seedY] = points[seedCell];
    const candidateDistance = (x - seedX) ** 2 + (y - seedY) ** 2;
    if (candidateDistance >= distance) continue;
    result = owner;
    distance = candidateDistance;
  }
  return result;
}

/**
 * Fallback: populated foundation cells still neutral after region paint attach to
 * the nearest capital that holds any cell in the same region (towns included).
 */
function claimOrphanPopulatedCells(
  plan: SettlementFoundationPlan,
  cells: InitialPolityCells,
  states: readonly State[],
  burgs: readonly Burg[],
  lockedStateAtCell: Uint16Array
): void {
  const cellRegion = new Map<number, number>();
  for (const region of plan.regions) {
    for (const cellId of region.cells) cellRegion.set(cellId, region.id);
  }

  const capitalsByRegion = new Map<number, { cell: number; state: number }[]>();
  for (const state of states) {
    if (!state.i || state.removed) continue;
    const capital = burgs[state.capital ?? 0];
    if (!capital || capital.removed) continue;
    const regionId = cellRegion.get(capital.cell);
    if (regionId === undefined) continue;
    const list = capitalsByRegion.get(regionId) ?? [];
    list.push({ cell: capital.cell, state: state.i });
    capitalsByRegion.set(regionId, list);
  }

  for (const cellId of Array.from(cells.i)) {
    if (cells.state[cellId] || lockedStateAtCell[cellId]) continue;
    if (cells.h[cellId] < 20) continue;
    // Claim populated countryside and towns; empty wilderness stays free.
    const forceCore = !!cells.burg[cellId] || cells.pop[cellId] > 0;
    if (!forceCore) continue;
    const regionId = cellRegion.get(cellId);
    if (regionId === undefined) continue;

    const capitals = capitalsByRegion.get(regionId);
    if (!capitals?.length) continue;
    // Burgs always join their regional capital; high-danger empty land stays out.
    if (!cells.burg[cellId] && !canStateClaimCell(cells.danger?.[cellId])) continue;

    cells.state[cellId] = nearestSeedOwner(cellId, new Map(capitals.map(entry => [entry.cell, entry.state])), cells.p);
  }
}

function distanceBetween(from: number, to: number, points: InitialPolityCells["p"]): number {
  const [fromX, fromY] = points[from];
  const [toX, toY] = points[to];
  return Math.hypot(toX - fromX, toY - fromY);
}

/** Normalizes only small, completely enclosed wilderness pockets. */
function fillEnclosedUnclaimedLand(cells: InitialPolityCells): void {
  const checked = new Uint8Array(cells.i.length);
  for (const start of Array.from(cells.i)) {
    if (checked[start] || cells.state[start] || cells.h[start] < 20) continue;
    if (!canStateClaimCell(cells.danger?.[start])) continue;
    const pocket: number[] = [];
    const owners = new Set<number>();
    const queue = [start];
    checked[start] = 1;
    let hasOpenBoundary = false;
    while (queue.length) {
      const cellId = queue.pop();
      if (cellId === undefined) continue;
      if (cells.pop[cellId] > 0 || cells.burg[cellId]) {
        hasOpenBoundary = true;
        continue;
      }
      if (!canStateClaimCell(cells.danger?.[cellId])) {
        hasOpenBoundary = true; // danger core keeps the pocket open to wilderness
        continue;
      }
      pocket.push(cellId);
      for (const neighbor of cells.c[cellId]) {
        if (cells.h[neighbor] < 20) {
          hasOpenBoundary = true;
          continue;
        }
        const owner = cells.state[neighbor];
        if (owner) owners.add(owner);
        else if (!checked[neighbor]) {
          checked[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    const owner = owners.values().next().value as number | undefined;
    if (pocket.length > 3 || hasOpenBoundary || owners.size !== 1 || owner === undefined) continue;
    for (const cellId of pocket) cells.state[cellId] = owner;
  }
}
