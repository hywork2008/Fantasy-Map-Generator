import type { Burg, State } from "../types/models";
import type { SettlementFoundationPlan, SettlementNode } from "../types/settlementFoundation";
import { normalizeInitialPolityRealmSize } from "../utils/initialPolityScope";
import { canStateClaimCell } from "./dangerExpandPolicy";

type NumberColumn = ArrayLike<number> & { [index: number]: number; fill(value: number): unknown };

type MutableNumberColumn = ArrayLike<number> & { [index: number]: number };

export interface InitialPolityCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly h: ArrayLike<number>;
  readonly pop: MutableNumberColumn;
  readonly children?: MutableNumberColumn;
  readonly maleAdults?: MutableNumberColumn;
  readonly femaleAdults?: MutableNumberColumn;
  readonly elders?: MutableNumberColumn;
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
  /** Starting realm size in cells (1 = capital only). Defaults to 30. */
  readonly realmSize?: number;
}

/**
 * Owns Foundation-map political control.
 *
 * Territory is a compact blob of up to `realmSize` land cells around each
 * capital, clipped to that capital's Settlement Foundation region. Oikoumene
 * land share still decides how much countryside is populated; this function
 * only decides how much of it starts as state land.
 *
 * `realmSize === 1` is capital-only. Burgs outside the blob stay free.
 * Unclaimed oikoumene hinterland is then depopulated: a one-cell start cannot
 * expand if nameless neighbours already sit on the local food capacity.
 */
export function assignInitialPolities({ plan, cells, burgs, states, realmSize }: InitialPolitiesInput): void {
  const size = normalizeInitialPolityRealmSize(realmSize);
  if (size <= 1) {
    assignCapitalOnlyPolities(cells, burgs, states);
  } else {
    assignCompactStartingRealms(plan, cells, burgs, states, size);
  }
  clearUnclaimedOikoumenePopulation(cells);
}

/**
 * Frontier / marches keep people only on state land (and later on live frontier
 * expeditions). Stateless rural stock next to a capital races that capital for
 * the same subsistence K; if the natives fill it first, the state can never
 * send a colonist party.
 */
export function clearUnclaimedOikoumenePopulation(
  cells: Pick<InitialPolityCells, "i" | "state" | "pop" | "children" | "maleAdults" | "femaleAdults" | "elders">,
  keepCell?: (cellId: number) => boolean
): number {
  let cleared = 0;
  for (const cellId of Array.from(cells.i)) {
    if (cells.state[cellId]) continue;
    if (keepCell?.(cellId)) continue;
    if (!((cells.pop[cellId] ?? 0) > 0)) continue;
    cells.pop[cellId] = 0;
    if (cells.children) cells.children[cellId] = 0;
    if (cells.maleAdults) cells.maleAdults[cellId] = 0;
    if (cells.femaleAdults) cells.femaleAdults[cellId] = 0;
    if (cells.elders) cells.elders[cellId] = 0;
    cleared += 1;
  }
  return cleared;
}

function assignCompactStartingRealms(
  plan: SettlementFoundationPlan,
  cells: InitialPolityCells,
  burgs: readonly Burg[],
  states: readonly State[],
  realmSize: number
): void {
  const lockedStateAtCell = getLockedStateCells(cells, states);
  cells.state.fill(0);
  for (const cellId of Array.from(cells.i)) {
    if (lockedStateAtCell[cellId]) cells.state[cellId] = lockedStateAtCell[cellId];
  }

  const claimed = new Set<number>();
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const capital = burgs[state.capital ?? 0];
    if (!capital || capital.removed) continue;
    if (lockedStateAtCell[capital.cell] && lockedStateAtCell[capital.cell] !== state.i) continue;
    const allowed = getFoundationRegionCells(plan, capital.cell);
    const realm = collectStartingRealmCells(cells, capital.cell, realmSize, allowed, claimed);
    for (const cellId of realm) {
      if (lockedStateAtCell[cellId] && lockedStateAtCell[cellId] !== state.i) continue;
      cells.state[cellId] = state.i;
      claimed.add(cellId);
    }
  }

  for (const burg of burgs) {
    if (!burg.i || burg.removed) continue;
    burg.state = cells.state[burg.cell];
    burg.stateHistory = [burg.state];
  }
}

/**
 * Compact land blob around a capital, staying inside `allowedCells` when given
 * (the capital's foundation region). Already-claimed cells are skipped so
 * neighbouring States do not steal each other's cores.
 */
export function collectStartingRealmCells(
  cells: Pick<InitialPolityCells, "c" | "h" | "danger">,
  capitalCell: number,
  maxCells: number,
  allowedCells?: ReadonlySet<number>,
  alreadyClaimed?: ReadonlySet<number>
): number[] {
  const limit = Math.max(1, maxCells);
  const selected: number[] = [];
  const queued = new Set<number>([capitalCell]);
  const queue = [capitalCell];

  while (queue.length && selected.length < limit) {
    const cellId = queue.shift();
    if (cellId === undefined) break;
    if ((cells.h[cellId] ?? 0) < 20) continue;
    if (alreadyClaimed?.has(cellId) && cellId !== capitalCell) continue;
    if (allowedCells && !allowedCells.has(cellId) && cellId !== capitalCell) continue;
    if (cellId !== capitalCell && !canStateClaimCell(cells.danger?.[cellId])) continue;
    selected.push(cellId);
    for (const neighbor of cells.c[cellId] ?? []) {
      if (queued.has(neighbor)) continue;
      if ((cells.h[neighbor] ?? 0) < 20) continue;
      if (allowedCells && !allowedCells.has(neighbor)) continue;
      queued.add(neighbor);
      queue.push(neighbor);
    }
  }
  return selected;
}

function getFoundationRegionCells(plan: SettlementFoundationPlan, capitalCell: number): Set<number> | undefined {
  const region = plan.regions.find(entry => entry.cells.includes(capitalCell));
  return region ? new Set(region.cells) : undefined;
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
  count: number,
  options?: { maxPerRegion?: number }
): SettlementNode[] {
  if (count <= 0 || !plan.nodes.length) return [];

  const targetCount = Math.min(plan.nodes.length, Math.floor(count));
  const maxPerRegion = options?.maxPerRegion ?? Number.POSITIVE_INFINITY;
  const regionalCenters = plan.nodes.filter(node => node.role === "center");
  const selected = takeFarthestCapitals(regionalCenters, points, targetCount, [], maxPerRegion);
  if (selected.length === targetCount) return selected;

  const selectedIds = new Set(selected.map(node => node.id));
  const remaining = plan.nodes.filter(node => !selectedIds.has(node.id));
  const spaced = takeFarthestCapitals(remaining, points, targetCount - selected.length, selected, maxPerRegion);
  if (selected.length + spaced.length === targetCount) return [...selected, ...spaced];

  const used = new Set([...selected, ...spaced].map(node => node.id));
  const leftovers = plan.nodes.filter(node => !used.has(node.id));
  return [
    ...selected,
    ...spaced,
    ...selectFarthestNodes(leftovers, points, targetCount - selected.length - spaced.length, [...selected, ...spaced])
  ];
}

function takeFarthestCapitals(
  candidates: readonly SettlementNode[],
  points: readonly (readonly [number, number])[],
  count: number,
  alreadySelected: readonly SettlementNode[],
  maxPerRegion: number
): SettlementNode[] {
  const regionCounts = new Map<number, number>();
  for (const node of alreadySelected) {
    regionCounts.set(node.regionId, (regionCounts.get(node.regionId) ?? 0) + 1);
  }
  const eligible = candidates.filter(node => (regionCounts.get(node.regionId) ?? 0) < maxPerRegion);
  return selectFarthestNodes(eligible, points, count, alreadySelected);
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

/** Each State owns only its capital cell. Hinterland and extra towns stay unclaimed. */
function assignCapitalOnlyPolities(cells: InitialPolityCells, burgs: readonly Burg[], states: readonly State[]): void {
  const lockedStateAtCell = getLockedStateCells(cells, states);
  cells.state.fill(0);
  for (const cellId of Array.from(cells.i)) {
    if (lockedStateAtCell[cellId]) cells.state[cellId] = lockedStateAtCell[cellId];
  }
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const capital = burgs[state.capital ?? 0];
    if (!capital || capital.removed) continue;
    if (lockedStateAtCell[capital.cell] && lockedStateAtCell[capital.cell] !== state.i) continue;
    cells.state[capital.cell] = state.i;
  }
  for (const burg of burgs) {
    if (!burg.i || burg.removed) continue;
    burg.state = cells.state[burg.cell];
    burg.stateHistory = [burg.state];
  }
}

function getLockedStateCells(cells: InitialPolityCells, states: readonly State[]): Uint16Array {
  const locked = new Uint16Array(cells.i.length);
  for (const cellId of Array.from(cells.i)) {
    const stateId = cells.state[cellId];
    if (stateId && states[stateId]?.lock) locked[cellId] = stateId;
  }
  return locked;
}
