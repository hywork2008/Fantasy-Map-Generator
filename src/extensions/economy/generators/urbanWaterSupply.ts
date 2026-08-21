import FlatQueue from "flatqueue";
import type { Burg, PackedGraph } from "../../hostTypes";
import { buildInheritedSewerRoutes } from "./urbanSewerage";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

type ServedBurg = Burg & { i: number };

/** A gravity-fed aqueduct route rendered for a pre-existing Giant Roman waterworks system. */
export interface InheritedWaterSupplyRoute {
  id: string;
  burgId: number;
  stateId: number;
  /** Protected source for the whole same-State, same-land aqueduct tree. */
  intakeCell: number;
  /** Existing tree cell where this branch begins. */
  sourceCell: number;
  source: [number, number];
  destination: [number, number];
  /** Cell-by-cell shortest path from the existing tree to the served Burg. */
  cellPath: number[];
  points: [number, number][];
}

export interface InheritedWaterSupplyRouteInput {
  burgs: readonly (Burg | undefined)[];
  cells: Pick<PackedGraph["cells"], "c" | "f" | "h" | "haven" | "i" | "p" | "r" | "state">;
  systems: readonly UrbanWaterSystem[];
}

/**
 * Derive visible aqueduct routes from existing Roman-waterworks records.
 *
 * These routes are deliberately deterministic and are not a new river. Each protected headwater
 * grows one shortest-path tree: first to the nearest served Burg, then from the existing tree to
 * the next nearest Burg. Heights are not a routing cost, so the display remains an engineering
 * plan rather than an invented second river. The eventual RegionalWaterScheme can replace these
 * inherited segments with negotiated construction records.
 */
export function buildInheritedWaterSupplyRoutes({
  burgs,
  cells,
  systems
}: InheritedWaterSupplyRouteInput): InheritedWaterSupplyRoute[] {
  const riverCells: number[] = [];
  for (let cell = 0; cell < cells.i.length; cell++) {
    if (cells.r[cell] && cells.p[cell]) riverCells.push(cell);
  }

  if (!riverCells.length) return [];

  const sewerOutfalls = buildInheritedSewerRoutes({ burgs, cells, systems }).map(route => route.outfallCell);
  const servedGroups = new Map<string, ServedBurg[]>();
  for (const system of systems) {
    if (!system.hasInheritedRomanWaterworks) continue;
    const burg = burgs[system.burgId];
    if (!burg?.i) continue;
    const key = `${burg.state ?? 0}:${cells.f[burg.cell]}`;
    servedGroups.set(key, [...(servedGroups.get(key) ?? []), burg as ServedBurg]);
  }

  return Array.from(servedGroups.values()).flatMap(group => {
    const sourceCell = chooseProtectedIntakeCell(group, riverCells, cells, sewerOutfalls);
    return sourceCell === undefined ? [] : buildAqueductTree(group, sourceCell, cells);
  });
}

function chooseProtectedIntakeCell(
  burgs: readonly ServedBurg[],
  riverCells: readonly number[],
  cells: InheritedWaterSupplyRouteInput["cells"],
  sewerOutfalls: readonly number[]
): number | undefined {
  const representative = burgs[0];
  if (!representative) return undefined;
  const sameLandRivers = riverCells.filter(cell => cells.f[cell] === cells.f[representative.cell]);
  if (!sameLandRivers.length) return undefined;
  // A source cannot be protected if another State owns it. Giant public works therefore never
  // substitute a foreign river merely to make a line appear on the map.
  const stateRivers = representative.state
    ? sameLandRivers.filter(cell => cells.state[cell] === representative.state)
    : sameLandRivers;
  const protectedCandidates = stateRivers.filter(
    cell => !sewerOutfalls.some(outfall => canReachDownstream(outfall, cell, cells))
  );
  if (!protectedCandidates.length) return undefined;

  return [...protectedCandidates].sort((a, b) => {
    const elevationDelta = (cells.h[b] ?? 0) - (cells.h[a] ?? 0);
    return elevationDelta || a - b;
  })[0];
}

function buildAqueductTree(
  burgs: readonly ServedBurg[],
  intakeCell: number,
  cells: InheritedWaterSupplyRouteInput["cells"]
): InheritedWaterSupplyRoute[] {
  const stateId = burgs[0]?.state ?? 0;
  const landFeature = cells.f[burgs[0]!.cell];
  const treeCells = new Set([intakeCell]);
  const pending = [...burgs].sort((a, b) => a.i - b.i);
  const routes: InheritedWaterSupplyRoute[] = [];

  while (pending.length) {
    const candidates = pending
      .map(burg => ({ burg, cellPath: shortestPathToTree(burg.cell, treeCells, stateId, landFeature, cells) }))
      .filter((candidate): candidate is { burg: ServedBurg; cellPath: number[] } => Boolean(candidate.cellPath))
      .sort((a, b) => pathLength(a.cellPath, cells) - pathLength(b.cellPath, cells) || a.burg.i - b.burg.i);
    const next = candidates[0];
    if (!next) break;

    const pendingIndex = pending.findIndex(burg => burg.i === next.burg.i);
    pending.splice(pendingIndex, 1);
    for (const cell of next.cellPath) treeCells.add(cell);
    if (next.cellPath.length < 2) continue;

    const sourceCell = next.cellPath[0]!;
    const source = cells.p[sourceCell];
    if (!source) continue;
    const points = next.cellPath
      .map(cell => cells.p[cell])
      .filter((point): point is [number, number] => Boolean(point))
      .map(point => [point[0], point[1]] as [number, number]);
    const destination: [number, number] = [next.burg.x, next.burg.y];
    if (!samePoint(points.at(-1), destination)) points.push(destination);
    routes.push({
      id: `roman-aqueduct-${stateId}-${intakeCell}-${next.burg.i}`,
      burgId: next.burg.i,
      stateId,
      intakeCell,
      sourceCell,
      source: [source[0], source[1]],
      destination,
      cellPath: next.cellPath,
      points
    });
  }
  return routes;
}

/** Nearest existing aqueduct cell, using geography only: elevation never contributes to the cost. */
function shortestPathToTree(
  fromCell: number,
  treeCells: ReadonlySet<number>,
  stateId: number,
  landFeature: number,
  cells: InheritedWaterSupplyRouteInput["cells"]
): number[] | null {
  const previous = new Int32Array(cells.i.length).fill(-1);
  const distance = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new FlatQueue<number>();
  previous[fromCell] = fromCell;
  distance[fromCell] = 0;
  queue.push(fromCell, 0);

  while (queue.length) {
    const cell = queue.pop()!;
    if (treeCells.has(cell)) return restorePath(cell, fromCell, previous);
    for (const neighbor of cells.c[cell] ?? []) {
      if (!isAqueductLandCell(neighbor, stateId, landFeature, cells)) continue;
      const nextDistance = distance[cell] + edgeLength(cell, neighbor, cells);
      if (nextDistance >= distance[neighbor]) continue;
      distance[neighbor] = nextDistance;
      previous[neighbor] = cell;
      queue.push(neighbor, nextDistance);
    }
  }
  return null;
}

function isAqueductLandCell(
  cell: number,
  stateId: number,
  landFeature: number,
  cells: InheritedWaterSupplyRouteInput["cells"]
): boolean {
  return cells.h[cell] >= 20 && cells.f[cell] === landFeature && (!stateId || cells.state[cell] === stateId);
}

function restorePath(end: number, start: number, previous: Int32Array): number[] {
  const path = [end];
  for (let cell = end; cell !== start; ) {
    cell = previous[cell];
    if (cell === -1) return [];
    path.push(cell);
  }
  return path;
}

function pathLength(path: readonly number[], cells: InheritedWaterSupplyRouteInput["cells"]): number {
  return path.slice(1).reduce((length, cell, index) => length + edgeLength(path[index]!, cell, cells), 0);
}

function edgeLength(from: number, to: number, cells: InheritedWaterSupplyRouteInput["cells"]): number {
  const a = cells.p[from];
  const b = cells.p[to];
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 1;
}

function samePoint(a: [number, number] | undefined, b: [number, number]): boolean {
  return Boolean(a && a[0] === b[0] && a[1] === b[1]);
}

/** Whether water discharged at `from` can flow downstream into `target` on the same river graph. */
function canReachDownstream(from: number, target: number, cells: InheritedWaterSupplyRouteInput["cells"]): boolean {
  if (from === target) return true;
  // Packed river paths are consistently high → low; use height as the safe fallback until a
  // persisted RegionalWaterScheme carries full catchment topology.
  if (cells.r[from] !== cells.r[target]) return false;
  return (cells.h[from] ?? 0) >= (cells.h[target] ?? 0);
}

/** True when a burg can take gravity water without crossing a sea or another landmass. */
export function hasSameLandGravityWaterSource(
  burg: Burg,
  cells: Pick<PackedGraph["cells"], "f" | "h" | "i" | "r" | "state">
): boolean {
  const landFeature = cells.f?.[burg.cell];
  const burgHeight = cells.h[burg.cell] ?? 0;
  // Test fixtures and legacy adapters can omit `cells.i`; `r` is indexed by the same packed id.
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  for (const cell of cellIds) {
    if (!cells.r[cell] || (cells.f && cells.f[cell] !== landFeature)) continue;
    if (burg.state && cells.state && cells.state[cell] !== burg.state) continue;
    if ((cells.h[cell] ?? 0) >= burgHeight) return true;
  }
  return false;
}
