import { isFantasyCulturesSet } from "../data/raceCivicStance";
import { getRaceById } from "../data/races";
import type { Burg, Culture, Race, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

type SovereigntyCells = Pick<PackedGraph["cells"], "c" | "h" | "i" | "p" | "r" | "state">;
type GiantWatershedCells = Pick<PackedGraph["cells"], "c" | "h" | "i" | "r">;
type River = PackedGraph["rivers"][number];

export interface GiantWaterSourceSovereigntyInput {
  burgs: Burg[];
  cells: SovereigntyCells;
  cultures: Culture[];
  culturesSet: string | undefined;
  races: Race[] | undefined;
  rivers: River[];
  states: State[];
}

/**
 * Make a Giant State possible only when it can occupy the map's highest river source and a
 * connected part of its mapped river-basin corridor. The whole watershed remains Giant cultural
 * homeland, but it must not turn one political State into remote territorial islands. Other Giant
 * States are converted to the normal human state culture, keeping this singular polity's core.
 *
 * The packed graph has no polygonal catchment field; `River.basin` and its river cells are the
 * authoritative basin proxy available during state generation.
 */
export function enforceGiantWaterSourceSovereignty(args: GiantWaterSourceSovereigntyInput): number | null {
  if (!isFantasyCulturesSet(args.culturesSet)) return null;
  const sourceCell = getHighestRiverSourceCell(args.cells, args.rivers);
  if (sourceCell === undefined) return demoteGiantStates(args);

  const giantStates = args.states.filter(state => state?.i && isGiantState(state, args.cultures, args.races));
  if (!giantStates.length) return null;

  // Keep this snapshot so detached watershed branches can return to their original polity.
  // Culture and population are intentionally untouched: Giants can inhabit every highland branch
  // without requiring that all of it belongs to their one formal State.
  const previousOwners = Array.from(args.cells.state);
  const basinCells = getWatershedCellsForSource(sourceCell, args.cells, args.rivers);
  const selected = giantStates
    .map(state => {
      const path = findLandPath(args.cells, args.burgs[state.capital]?.cell, sourceCell);
      if (!path) return null;
      const connectedBasin = connectedComponent(new Set([...path, ...basinCells]), sourceCell, args.cells);
      return { state, path, connectedBasin };
    })
    .filter((candidate): candidate is { state: State; path: number[]; connectedBasin: Set<number> } =>
      Boolean(candidate)
    )
    .filter(candidate =>
      [...candidate.connectedBasin].every(
        cell =>
          canClaimCell(args.cells, args.states, cell, candidate.state.i) &&
          !isForeignCapitalCell(cell, candidate.state.i, args.states, args.burgs)
      )
    )
    .sort((a, b) => a.path.length - b.path.length || a.state.i - b.state.i)[0];

  if (!selected) return demoteGiantStates(args);

  const giantStateId = selected.state.i;
  const prospectiveClaim = new Set<number>([
    ...selected.path,
    ...basinCells,
    ...Array.from(args.cells.i).filter(cell => previousOwners[cell] === giantStateId)
  ]);
  const core = connectedComponent(prospectiveClaim, sourceCell, args.cells);
  if (!core.size) return demoteGiantStates(args);

  // Only the component attached to the protected headwater becomes Nurkel. This makes
  // watershed membership a cultural / demographic rule rather than permission to create
  // detached political enclaves through other States.
  for (const cell of core) args.cells.state[cell] = giantStateId;
  for (const component of disconnectedComponents(prospectiveClaim, core, args.cells)) {
    const fallbackOwner = chooseDetachedFallbackOwner(component, previousOwners, giantStateId, args.cells);
    for (const cell of component) {
      args.cells.state[cell] = previousOwners[cell] === giantStateId ? fallbackOwner : previousOwners[cell];
    }
  }
  for (const burg of args.burgs) {
    if (!burg?.i || burg.removed) continue;
    burg.state = args.cells.state[burg.cell];
    burg.stateHistory = [burg.state];
  }

  const humanCulture = args.cultures.find(culture => getRaceById(args.races, culture?.race)?.key === "human")?.i;
  if (humanCulture !== undefined) {
    for (const state of giantStates) {
      if (state.i !== giantStateId) state.culture = humanCulture;
    }
  }
  return giantStateId;
}

/** The land-connected component of a candidate territorial claim. */
function connectedComponent(
  cellsToVisit: ReadonlySet<number>,
  start: number,
  cells: Pick<PackedGraph["cells"], "c">
): Set<number> {
  if (!cellsToVisit.has(start)) return new Set();
  const component = new Set<number>([start]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]!;
    for (const neighbor of cells.c[cell] ?? []) {
      if (!cellsToVisit.has(neighbor) || component.has(neighbor)) continue;
      component.add(neighbor);
      queue.push(neighbor);
    }
  }
  return component;
}

function disconnectedComponents(
  cellsToVisit: ReadonlySet<number>,
  core: ReadonlySet<number>,
  cells: Pick<PackedGraph["cells"], "c">
): Set<number>[] {
  const remaining = new Set(Array.from(cellsToVisit).filter(cell => !core.has(cell)));
  const components: Set<number>[] = [];
  while (remaining.size) {
    const start = remaining.values().next().value as number;
    const component = connectedComponent(remaining, start, cells);
    for (const cell of component) remaining.delete(cell);
    components.push(component);
  }
  return components;
}

/**
 * A former detached Giant holding is returned as one coherent local patch. Prefer the owner it
 * displaced; otherwise choose the State with the longest external boundary, or neutral land.
 */
function chooseDetachedFallbackOwner(
  component: ReadonlySet<number>,
  previousOwners: readonly number[],
  giantStateId: number,
  cells: SovereigntyCells
): number {
  const boundaryCounts = new Map<number, number>();
  const count = (owner: number) => {
    if (!owner || owner === giantStateId) return;
    boundaryCounts.set(owner, (boundaryCounts.get(owner) ?? 0) + 1);
  };

  for (const cell of component) {
    count(previousOwners[cell]!);
    for (const neighbor of cells.c[cell] ?? []) {
      if (!component.has(neighbor)) count(previousOwners[neighbor]!);
    }
  }

  return Array.from(boundaryCounts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

function demoteGiantStates(args: GiantWaterSourceSovereigntyInput): null {
  const humanCulture = args.cultures.find(culture => getRaceById(args.races, culture?.race)?.key === "human")?.i;
  if (humanCulture === undefined) return null;
  for (const state of args.states) {
    if (state?.i && isGiantState(state, args.cultures, args.races)) state.culture = humanCulture;
  }
  return null;
}

function isGiantState(state: State, cultures: readonly Culture[], races: readonly Race[] | undefined): boolean {
  const culture = cultures[state.culture] ?? cultures.find(candidate => candidate?.i === state.culture);
  return getRaceById(races, culture?.race)?.key === "giant";
}

/** Highest mapped river source, breaking equal-elevation ties by packed-cell id. */
export function getHighestRiverSourceCell(cells: GiantWatershedCells, rivers: readonly River[]): number | undefined {
  let source: number | undefined;
  const riverSources = rivers
    .map(river => river.source)
    .filter(
      (cell): cell is number => Number.isInteger(cell) && cell >= 0 && cell < cells.i.length && cells.h[cell] >= 20
    );
  // Manually edited or incomplete legacy rivers can lack a valid `source` field.
  // Their highest mapped river cell remains the best compatible fallback.
  const candidates = riverSources.length ? riverSources : Array.from(cells.i).filter(cell => Boolean(cells.r[cell]));
  for (const cell of candidates) {
    if (
      source === undefined ||
      cells.h[cell] > cells.h[source] ||
      (cells.h[cell] === cells.h[source] && cell < source)
    ) {
      source = cell;
    }
  }
  return source;
}

/** Land cells whose deterministic downhill path reaches the source river's basin. */
export function getWatershedCellsForSource(
  sourceCell: number,
  cells: GiantWatershedCells,
  rivers: readonly River[]
): number[] {
  const sourceRiverId = cells.r[sourceCell];
  const sourceRiver =
    rivers.find(river => river.i === sourceRiverId) ?? rivers.find(river => river.source === sourceCell);
  const basinId = sourceRiver ? basinRootId(sourceRiver, rivers) : sourceRiverId;
  const riverIds = new Set(rivers.filter(river => basinRootId(river, rivers) === basinId).map(river => river.i));
  const riverCells = new Set(Array.from(cells.i).filter(cell => cells.h[cell] >= 20 && riverIds.has(cells.r[cell])));
  riverCells.add(sourceCell);

  // Rivers are generated by repeatedly flowing to the lowest adjacent cell. Reuse that
  // deterministic terrain rule to claim the land which drains into this river basin.
  const drainsToBasin = new Int8Array(cells.i.length);
  for (const cell of riverCells) drainsToBasin[cell] = 1;
  const watershed = new Set(
    Array.from(cells.i).filter(cell => cellDrainsToBasin(cell, cells, riverCells, drainsToBasin))
  );
  fillEnclosedWatershedHoles(watershed, cells);
  return Array.from(watershed);
}

/**
 * Strict downhill tracing leaves an unassigned flat when it reaches an equal-height neighbour.
 * A land component surrounded entirely by the selected watershed is an internal drainage hollow,
 * not a separate polity-sized basin, so include it before political territory is derived.
 */
function fillEnclosedWatershedHoles(watershed: Set<number>, cells: GiantWatershedCells): void {
  const unvisited = new Set(Array.from(cells.i).filter(cell => cells.h[cell] >= 20 && !watershed.has(cell)));

  while (unvisited.size) {
    const start = unvisited.values().next().value as number;
    const component = connectedComponent(unvisited, start, cells);
    for (const cell of component) unvisited.delete(cell);

    const boundary = new Set<number>();
    for (const cell of component) {
      for (const neighbor of cells.c[cell] ?? []) {
        if (!component.has(neighbor)) boundary.add(neighbor);
      }
    }
    if (boundary.size && [...boundary].every(cell => watershed.has(cell))) {
      for (const cell of component) watershed.add(cell);
    }
  }
}

/** `basin` is assigned during Rivers.specify, which follows State generation. Follow parents meanwhile. */
function basinRootId(river: River, rivers: readonly River[]): number {
  if (river.basin) return river.basin;
  const visited = new Set<number>();
  let current = river;
  while (current.parent && current.parent !== current.i && !visited.has(current.i)) {
    visited.add(current.i);
    const parent = rivers.find(candidate => candidate.i === current.parent);
    if (!parent) break;
    current = parent;
  }
  return current.i;
}

function cellDrainsToBasin(
  start: number,
  cells: GiantWatershedCells,
  riverCells: ReadonlySet<number>,
  drainage: Int8Array
): boolean {
  if (cells.h[start] < 20) return false;
  const trail: number[] = [];
  let cell = start;
  while (true) {
    if (riverCells.has(cell) || drainage[cell] === 1) {
      for (const visited of trail) drainage[visited] = 1;
      return true;
    }
    if (drainage[cell] === -1 || cells.h[cell] < 20) {
      for (const visited of trail) drainage[visited] = -1;
      return false;
    }
    trail.push(cell);
    const neighbor = lowestNeighbor(cell, cells);
    if (neighbor === undefined || cells.h[neighbor] >= cells.h[cell]) {
      for (const visited of trail) drainage[visited] = -1;
      return false;
    }
    cell = neighbor;
  }
}

function lowestNeighbor(cell: number, cells: GiantWatershedCells): number | undefined {
  return cells.c[cell]?.reduce((lowest, neighbor) => (cells.h[neighbor] < cells.h[lowest] ? neighbor : lowest));
}

function canClaimCell(cells: SovereigntyCells, states: readonly State[], cell: number, stateId: number): boolean {
  const owner = cells.state[cell];
  return !owner || owner === stateId || !states[owner]?.lock;
}

function isForeignCapitalCell(
  cell: number,
  stateId: number,
  states: readonly State[],
  burgs: readonly Burg[]
): boolean {
  return states.some(state => state?.i && state.i !== stateId && burgs[state.capital]?.cell === cell);
}

/** Shortest land corridor from a State capital to the protected source. */
function findLandPath(cells: SovereigntyCells, fromCell: number | undefined, targetCell: number): number[] | null {
  if (fromCell === undefined || cells.h[fromCell] < 20 || cells.h[targetCell] < 20) return null;
  const previous = new Int32Array(cells.i.length).fill(-1);
  const queue = [fromCell];
  previous[fromCell] = fromCell;
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]!;
    if (cell === targetCell) break;
    for (const neighbor of cells.c[cell] ?? []) {
      if (cells.h[neighbor] < 20 || previous[neighbor] !== -1) continue;
      previous[neighbor] = cell;
      queue.push(neighbor);
    }
  }
  if (previous[targetCell] === -1) return null;
  const path: number[] = [];
  for (let cell = targetCell; ; cell = previous[cell]) {
    path.push(cell);
    if (cell === fromCell) return path.reverse();
  }
}
