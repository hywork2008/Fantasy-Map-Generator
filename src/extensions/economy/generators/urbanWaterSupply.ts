import FlatQueue from "flatqueue";
import type { Burg, PackedGraph } from "../../hostTypes";
import { buildInheritedSewerRoutes, type GiantSewerClimateOptions } from "./urbanSewerage";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

type ServedBurg = Burg & { i: number };

// Height values are packed-map terrain steps, rather than metres. These limits deliberately
// permit shallow Roman cuttings while rejecting a route that simply draws through a mountain.
const MIN_DELIVERY_HEAD = 1;
const MIN_AQUEDUCT_GRADE = 0.012;
const MAX_AQUEDUCT_CUT_DEPTH = 6;
const CUTTING_COST = 12;
const VIADUCT_COST = 0.5;

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
  /** Cold-season service uses a covered conduit and winter cistern rather than an open channel. */
  requiresWinterCistern: boolean;
  /** Cell-by-cell shortest path from the existing tree to the served Burg. */
  cellPath: number[];
  points: [number, number][];
}

export interface InheritedWaterSupplyRouteInput {
  burgs: readonly (Burg | undefined)[];
  cells: Pick<PackedGraph["cells"], "c" | "f" | "h" | "haven" | "i" | "p" | "r" | "state">;
  rivers?: readonly (Pick<PackedGraph["rivers"][number], "i" | "source"> &
    Partial<Pick<PackedGraph["rivers"][number], "mouth">>)[];
  sewerClimate?: GiantSewerClimateOptions;
  systems: readonly UrbanWaterSystem[];
}

type GravityAqueductCells = Pick<PackedGraph["cells"], "c" | "f" | "h" | "i" | "p" | "r" | "state">;

/**
 * Derive visible aqueduct routes from existing Roman-waterworks records.
 *
 * These routes are deliberately deterministic and are not a new river. Each protected headwater
 * grows one gravity-feasible tree: first to the nearest served Burg, then from the existing tree
 * to the next nearest Burg. A route may use shallow cuttings and viaducts, but it cannot pass
 * through a mountain higher than its declining water level. The eventual RegionalWaterScheme can
 * replace these inherited segments with negotiated construction records.
 */
export function buildInheritedWaterSupplyRoutes({
  burgs,
  cells,
  rivers,
  sewerClimate,
  systems
}: InheritedWaterSupplyRouteInput): InheritedWaterSupplyRoute[] {
  const riverCells: number[] = [];
  for (let cell = 0; cell < cells.i.length; cell++) {
    if (cells.r[cell] && cells.p[cell]) riverCells.push(cell);
  }

  if (!riverCells.length) return [];

  const sewerOutfalls = buildInheritedSewerRoutes({ burgs, cells, rivers, climate: sewerClimate, systems }).map(
    route => route.outfallCell
  );
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
    return sourceCell === undefined
      ? []
      : buildAqueductTree(group, sourceCell, cells, sewerClimate?.seasonalColdBurgIds ?? new Set());
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
  cells: GravityAqueductCells,
  seasonalColdBurgIds: ReadonlySet<number>
): InheritedWaterSupplyRoute[] {
  const stateId = burgs[0]?.state ?? 0;
  const landFeature = cells.f[burgs[0]!.cell];
  const treeCells = new Set([intakeCell]);
  const pending = [...burgs].sort((a, b) => a.i - b.i);
  const routes: InheritedWaterSupplyRoute[] = [];

  while (pending.length) {
    const candidates = pending
      .map(burg => ({ burg, cellPath: shortestGravityPathToTree(burg.cell, treeCells, stateId, landFeature, cells) }))
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
      requiresWinterCistern: seasonalColdBurgIds.has(next.burg.i),
      cellPath: next.cellPath,
      points
    });
  }
  return routes;
}

/**
 * Find the least-engineering gravity route from any existing pipe cell. A branch may begin at a
 * lower point in the tree only when that point still has sufficient head for the served Burg.
 */
function shortestGravityPathToTree(
  fromCell: number,
  treeCells: ReadonlySet<number>,
  stateId: number,
  landFeature: number,
  cells: GravityAqueductCells
): number[] | null {
  const paths = Array.from(treeCells)
    .filter(sourceCell => (cells.h[sourceCell] ?? 0) >= (cells.h[fromCell] ?? 0) + MIN_DELIVERY_HEAD)
    .map(sourceCell => findGravityPath(sourceCell, fromCell, stateId, landFeature, cells))
    .filter((candidate): candidate is GravityPath => Boolean(candidate))
    .sort((a, b) => a.cost - b.cost || a.path.length - b.path.length || a.path[0]! - b.path[0]!);
  return paths[0]?.path ?? null;
}

type GravityPath = { path: number[]; cost: number };

/**
 * Dijkstra over valid Roman-style alignment. The design water level declines along the route;
 * terrain above it is cutting/tunnel work and terrain below it is a viaduct or embankment.
 */
function findGravityPath(
  sourceCell: number,
  targetCell: number,
  stateId: number,
  landFeature: number,
  cells: GravityAqueductCells
): GravityPath | null {
  const previous = new Int32Array(cells.i.length).fill(-1);
  const distance = new Float64Array(cells.i.length).fill(Infinity);
  const construction = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new FlatQueue<number>();
  const sourceHeight = cells.h[sourceCell] ?? 0;
  const targetHeight = cells.h[targetCell] ?? 0;
  previous[sourceCell] = sourceCell;
  distance[sourceCell] = 0;
  construction[sourceCell] = 0;
  queue.push(sourceCell, 0);

  while (queue.length) {
    const cell = queue.pop()!;
    if (cell === targetCell)
      return { path: restorePath(cell, sourceCell, previous).reverse(), cost: construction[cell]! };
    for (const neighbor of cells.c[cell] ?? []) {
      if (!isAqueductLandCell(neighbor, stateId, landFeature, cells)) continue;
      const edge = edgeLength(cell, neighbor, cells);
      const nextDistance = distance[cell]! + edge;
      const waterLevel = sourceHeight - nextDistance * MIN_AQUEDUCT_GRADE;
      if (waterLevel < targetHeight + MIN_DELIVERY_HEAD) continue;

      const terrainHeight = cells.h[neighbor] ?? 0;
      const cutting = Math.max(0, terrainHeight - waterLevel);
      if (cutting > MAX_AQUEDUCT_CUT_DEPTH) continue;
      const viaduct = Math.max(0, waterLevel - terrainHeight);
      const nextConstruction = construction[cell]! + edge + cutting * CUTTING_COST + viaduct * VIADUCT_COST;
      if (nextConstruction >= construction[neighbor]) continue;
      distance[neighbor] = nextDistance;
      construction[neighbor] = nextConstruction;
      previous[neighbor] = cell;
      queue.push(neighbor, nextConstruction);
    }
  }
  return null;
}

function isAqueductLandCell(cell: number, stateId: number, landFeature: number, cells: GravityAqueductCells): boolean {
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

function pathLength(path: readonly number[], cells: GravityAqueductCells): number {
  return path.slice(1).reduce((length, cell, index) => length + edgeLength(path[index]!, cell, cells), 0);
}

function edgeLength(from: number, to: number, cells: GravityAqueductCells): number {
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
  cells: Pick<PackedGraph["cells"], "c" | "f" | "h" | "i" | "p" | "r" | "state">
): boolean {
  const landFeature = cells.f?.[burg.cell];
  const burgHeight = cells.h[burg.cell] ?? 0;
  // Test fixtures and legacy adapters can omit `cells.i`; `r` is indexed by the same packed id.
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  // Geometry-less legacy adapters cannot validate a terrain profile. Preserve the older
  // same-land elevation check there; real maps always provide the graph and use findGravityPath.
  const canValidateRoute = Boolean(cells.i?.length && cells.c?.length && cells.p?.length);
  for (const cell of cellIds) {
    if (!cells.r[cell] || (cells.f && cells.f[cell] !== landFeature)) continue;
    if (burg.state && cells.state && cells.state[cell] !== burg.state) continue;
    if ((cells.h[cell] ?? 0) < burgHeight + MIN_DELIVERY_HEAD) continue;
    if (!canValidateRoute) return true;
    if (findGravityPath(cell, burg.cell, burg.state ?? 0, landFeature, cells)) return true;
  }
  return false;
}
