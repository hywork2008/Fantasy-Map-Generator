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
 * Owns Foundation-map political control. Only materialized movement links can
 * connect settlements; terrain adjacency never creates an administrative path.
 */
export function assignInitialPolities({ plan, cells, burgs, states }: InitialPolitiesInput): void {
  const lockedStateAtCell = getLockedStateCells(cells, states);
  const stateAtRouteCell = assignRouteNetwork(states, burgs, cells, lockedStateAtCell);
  const nodesByRegion = groupNodesByRegion(plan);
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

  // Regions are the compact service areas selected by Phase 1. Their local
  // cells join the nearest node only after that node is served by the network.
  for (const region of plan.regions) {
    const regionNodes = nodesByRegion.get(region.id) ?? [];
    const servedNodes = regionNodes.filter(node => stateAtRouteCell.has(node.cell));
    if (!servedNodes.length) continue;
    for (const cellId of region.cells) {
      if (cells.h[cellId] < 20 || lockedStateAtCell[cellId]) continue;
      const forceCore = !!cells.burg[cellId] || cells.pop[cellId] > 0;
      if (!forceCore && !canStateClaimCell(cells.danger?.[cellId])) continue;
      const owner = nearestNodeOwner(cellId, regionNodes, stateAtRouteCell, cells.p);
      if (owner) cells.state[cellId] = owner;
    }
  }

  fillEnclosedUnclaimedLand(cells);
  for (const burg of burgs) {
    if (!burg.i || burg.removed) continue;
    burg.state = cells.state[burg.cell];
    burg.stateHistory = [burg.state];
  }
}

/** Uses States number as density/capacity for the settlement network. */
export function getInitialPolityCapitalCount(plan: SettlementFoundationPlan, statesNumber: number): number {
  if (!plan.nodes.length || statesNumber <= 0) return 0;
  const networkCapacity = Math.max(plan.regions.length, Math.ceil(plan.nodes.length / 2));
  const density = Math.max(0, Math.min(1, statesNumber / 15));
  return Math.min(plan.nodes.length, Math.max(plan.regions.length, Math.round(networkCapacity * density)));
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

function groupNodesByRegion(plan: SettlementFoundationPlan): Map<number, SettlementFoundationPlan["nodes"][number][]> {
  const nodesByRegion = new Map<number, SettlementFoundationPlan["nodes"][number][]>();
  for (const node of plan.nodes) {
    const nodes = nodesByRegion.get(node.regionId) ?? [];
    nodes.push(node);
    nodesByRegion.set(node.regionId, nodes);
  }
  return nodesByRegion;
}

function nearestNodeOwner(
  cellId: number,
  nodes: readonly SettlementFoundationPlan["nodes"][number][],
  owner: ReadonlyMap<number, number>,
  points: InitialPolityCells["p"]
): number {
  const [x, y] = points[cellId];
  let result = 0;
  let distance = Infinity;
  for (const node of nodes) {
    const [nodeX, nodeY] = points[node.cell];
    const candidateDistance = (x - nodeX) ** 2 + (y - nodeY) ** 2;
    if (candidateDistance >= distance) continue;
    result = owner.get(node.cell) ?? 0;
    distance = candidateDistance;
  }
  return result;
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
