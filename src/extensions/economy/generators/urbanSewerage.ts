import FlatQueue from "flatqueue";
import type { Burg, PackedGraph } from "../../hostTypes";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

export interface InheritedSewerRoute {
  id: string;
  burgId: number;
  outfallCell: number;
  outfallKind: "river" | "coast" | "storage";
  /** The downstream trunk this branch joins, when its own route does not reach the outfall. */
  joinsRouteId?: string;
  source: [number, number];
  destination: [number, number];
  /** Downhill packed-cell alignment, including its final river, coast, or trunk cell. */
  cellPath: number[];
  /** Rendered route points derived from cellPath. */
  points: [number, number][];
}

type SewerCells = Pick<PackedGraph["cells"], "f" | "h" | "haven" | "i" | "r" | "state"> & {
  /** Legacy simulation fixtures can omit geometry; fall back to packed-cell proximity there. */
  c?: PackedGraph["cells"]["c"];
  p?: PackedGraph["cells"]["p"];
  riverDownstream?: PackedGraph["cells"]["riverDownstream"];
};
type RiverMeta = Pick<PackedGraph["rivers"][number], "i" | "source"> &
  Partial<Pick<PackedGraph["rivers"][number], "cells" | "mouth">>;
type WaterFeature = Pick<PackedGraph["features"][number], "i" | "type" | "closed">;
type SewerOutfall = { cell: number; kind: InheritedSewerRoute["outfallKind"] };
type SewerRouteCandidate = { burg: Burg & { i: number }; system: UrbanWaterSystem };

export type GiantSewerClimateOptions = {
  /** Burgs whose winter freezes exposed treatment while their brief summer can run infiltration beds. */
  seasonalColdBurgIds?: ReadonlySet<number>;
  /** Needed to distinguish a river mouth in the ocean from a land terminus or closed lake. */
  features?: readonly WaterFeature[];
};

/**
 * Determine the Giant inherited trunk-sewer route for each served settlement.
 * Each route follows adjacent land cells at an equal or lower elevation. It stops at the first
 * reachable non-headwater river cell, coast, or existing sewer trunk; it never draws a straight
 * line through a river or another sewer to reach a more distant outlet.
 */
export function buildInheritedSewerRoutes(args: {
  burgs: readonly (Burg | undefined)[];
  cells: SewerCells;
  rivers?: readonly RiverMeta[];
  climate?: GiantSewerClimateOptions;
  systems: readonly UrbanWaterSystem[];
}): InheritedSewerRoute[] {
  const candidates: SewerRouteCandidate[] = [];
  for (const system of args.systems) {
    // Older saves used the combined waterworks flag; retain their trunk sewer when loading them.
    if (!(system.hasInheritedRomanSewer ?? system.hasInheritedRomanWaterworks)) continue;
    const burg = args.burgs[system.burgId];
    if (!burg?.i) continue;
    candidates.push({ burg: burg as Burg & { i: number }, system });
  }
  return hasSewerGraph(args.cells)
    ? buildDownhillSewerNetwork(candidates, args.cells, args.rivers, args.climate)
    : buildLegacySewerRoutes(candidates, args.cells, args.rivers, args.climate);
}

/** True if a gravity trunk sewer can reach a lower river or coast on the same landmass. */
export function hasSameLandSewerOutfall(
  burg: Burg,
  cells: SewerCells,
  rivers?: readonly RiverMeta[],
  climate?: GiantSewerClimateOptions
): boolean {
  if (hasSewerGraph(cells)) {
    const riverHeadCells = getRiverHeadCells(cells, rivers);
    const coastalOutlets = getCoastalOutletCells(cells);
    // Closed-basin avoidance used to apply only to seasonal-cold burgs (the taiga scenario docs/
    // plan/modern-urban-water-treatment-and-governance.md §9.4 was written for); a river vanishing
    // inland or into a closed lake is just as invalid an outfall in a warm climate (§2.2's table
    // forbids "closedBasin" river discharge in both thermal rows) — always compute it now.
    const closedRiverIds = getClosedRiverIds(cells, rivers, climate?.features);
    return Boolean(
      findDownhillSewerPath(burg, cells, rivers, riverHeadCells, coastalOutlets, closedRiverIds, new Map(), false)
    );
  }
  return chooseSameLandSewerOutfall(burg, cells, rivers, climate) !== undefined;
}

function chooseSameLandSewerOutfall(
  burg: Burg,
  cells: SewerCells,
  rivers?: readonly RiverMeta[],
  climate?: GiantSewerClimateOptions
): SewerOutfall | undefined {
  const landFeature = cells.f?.[burg.cell];
  const burgHeight = cells.h[burg.cell] ?? 0;
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  const sameLandLower = cellIds.filter(
    cell => (!cells.f || cells.f[cell] === landFeature) && (cells.h[cell] ?? 0) <= burgHeight
  );
  // The source cell is an inviolate headwater intake. A trunk sewer can join only the second
  // mapped cell or later, even when the source happens to be the closest river point.
  const riverHeadCells = getRiverHeadCells(cells, rivers);
  // Closed-basin avoidance and the storage fallback used to apply only to seasonal-cold burgs; a
  // river that vanishes inland or into a closed lake is just as invalid an outfall in a warm
  // climate, and the doc's warm-closedBasin row (§2.2) also prescribes local storage/infiltration
  // instead of river discharge — apply both regardless of thermal regime now.
  const closedRiverIds = getClosedRiverIds(cells, rivers, climate?.features);
  const river = sameLandLower.filter(
    cell => cells.r[cell] && !riverHeadCells.has(cell) && !closedRiverIds.has(cells.r[cell]!)
  );
  const coast = sameLandLower.filter(cell => cells.haven?.[cell]);
  const nearestRiver = nearestByDistance(river, burg, cells);
  const nearestCoast = nearestByDistance(coast, burg, cells);
  if (nearestRiver === undefined && nearestCoast === undefined) {
    const storage = chooseSameLandStorageSite(sameLandLower, burg, cells);
    return storage === undefined ? undefined : { cell: storage, kind: "storage" };
  }
  if (nearestRiver === undefined) return { cell: nearestCoast!, kind: "coast" };
  if (nearestCoast === undefined) return { cell: nearestRiver, kind: "river" };
  return distanceToBurg(nearestRiver, burg, cells) <= distanceToBurg(nearestCoast, burg, cells)
    ? { cell: nearestRiver, kind: "river" }
    : { cell: nearestCoast, kind: "coast" };
}

function chooseSameLandStorageSite(cells: Iterable<number>, burg: Burg, sewerCells: SewerCells): number | undefined {
  return nearestByDistance(
    Array.from(cells).filter(cell => cell !== burg.cell && !sewerCells.r[cell] && !sewerCells.haven?.[cell]),
    burg,
    sewerCells
  );
}

/**
 * Rivers whose mouth does not reach the open sea — elevated inland/desert terminus, a closed
 * (endorheic) lake, or a non-ocean feature (docs/plan/modern-urban-water-treatment-and-
 * governance.md §2.2's `closedBasin`). Originally private to this module's Giant-legacy sewer
 * routing; exported 2026-08-23 so urbanWaterSystem.ts can classify every burg's `basinKind`, not
 * just Giant/seasonal-cold ones.
 */
export function getClosedRiverIds(
  cells: SewerCells,
  rivers?: readonly RiverMeta[],
  features?: readonly WaterFeature[]
): Set<number> {
  const featureById = new Map(features?.map(feature => [feature.i, feature]));
  const closed = new Set<number>();
  for (const river of rivers ?? []) {
    if (!Number.isInteger(river.mouth) || river.mouth! < 0 || river.mouth! >= cells.r.length) continue;
    const mouth = river.mouth!;
    const feature = featureById.get(cells.f?.[mouth] ?? -1);
    if ((cells.h[mouth] ?? 0) >= 20 || (feature && (feature.type !== "ocean" || feature.closed))) closed.add(river.i);
  }
  return closed;
}

function getRiverHeadCells(cells: SewerCells, rivers?: readonly RiverMeta[]): Set<number> {
  const headCells = new Set<number>();
  const explicitRiverIds = new Set<number>();
  for (const river of rivers ?? []) {
    if (!Number.isInteger(river.source) || river.source < 0 || river.source >= cells.r.length) continue;
    headCells.add(river.source);
    explicitRiverIds.add(river.i);
  }

  // Legacy fixtures and old saves can lack River.source. Fall back to each river's highest packed
  // cell, which is the same headwater convention used by river generation.
  const highestByRiver = new Map<number, number>();
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  for (const cell of cellIds) {
    const riverId = cells.r[cell];
    if (!riverId || explicitRiverIds.has(riverId)) continue;
    const current = highestByRiver.get(riverId);
    if (
      current === undefined ||
      (cells.h[cell] ?? 0) > (cells.h[current] ?? 0) ||
      ((cells.h[cell] ?? 0) === (cells.h[current] ?? 0) && cell < current)
    ) {
      highestByRiver.set(riverId, cell);
    }
  }
  for (const cell of highestByRiver.values()) headCells.add(cell);
  return headCells;
}

/** `haven` points from a coastal land cell to its actual water cell; the latter is the outfall. */
function getCoastalOutletCells(cells: SewerCells): Set<number> {
  const outlets = new Set<number>();
  for (const cell of cells.i) {
    const outlet = cells.haven?.[cell];
    if (outlet && outlet >= 0 && outlet < cells.i.length) outlets.add(outlet);
  }
  return outlets;
}

function hasSewerGraph(cells: SewerCells): cells is SewerCells & Required<Pick<SewerCells, "c" | "p">> {
  return Boolean(cells.i?.length && cells.c?.length && cells.p?.length);
}

function buildDownhillSewerNetwork(
  candidates: readonly SewerRouteCandidate[],
  cells: SewerCells & Required<Pick<SewerCells, "c" | "p">>,
  rivers: readonly RiverMeta[] | undefined,
  climate: GiantSewerClimateOptions | undefined
): InheritedSewerRoute[] {
  const riverHeadCells = getRiverHeadCells(cells, rivers);
  const coastalOutlets = getCoastalOutletCells(cells);
  const trunksByCell = new Map<number, InheritedSewerRoute>();
  const routes: InheritedSewerRoute[] = [];
  // Closed-basin avoidance and the storage fallback used to apply only to seasonal-cold burgs; a
  // river that vanishes inland or into a closed lake is just as invalid an outfall in a warm
  // climate, and the doc's warm-closedBasin row (§2.2) also prescribes local storage/infiltration
  // instead of river discharge — apply both regardless of thermal regime now. Independent of any
  // one candidate burg, so hoisted out of the loop below.
  const closedRiverIds = getClosedRiverIds(cells, rivers, climate?.features);

  // Establish the low outlets first. Every higher settlement then sees those lines as a terminal
  // it can join, which makes a directed sewer tree rather than a set of parallel long drains.
  for (const { burg } of [...candidates].sort(
    (a, b) => (cells.h[a.burg.cell] ?? 0) - (cells.h[b.burg.cell] ?? 0) || a.burg.i - b.burg.i
  )) {
    const result =
      findDownhillSewerPath(burg, cells, rivers, riverHeadCells, coastalOutlets, closedRiverIds, trunksByCell, false) ??
      findDownhillSewerPath(burg, cells, rivers, riverHeadCells, coastalOutlets, closedRiverIds, trunksByCell, true);
    if (!result) continue;

    const trunk = result.joinCell === undefined ? undefined : trunksByCell.get(result.joinCell);
    const outfallCell = trunk?.outfallCell ?? result.outfall.cell;
    const outfallKind = trunk?.outfallKind ?? result.outfall.kind;
    const points = result.cellPath
      .map(cell => cells.p[cell])
      .filter((point): point is [number, number] => Boolean(point));
    if (!samePoint(points[0], [burg.x, burg.y])) points.unshift([burg.x, burg.y]);
    const destination = points.at(-1)!;
    const route: InheritedSewerRoute = {
      id: `roman-sewer-${burg.i}`,
      burgId: burg.i,
      outfallCell,
      outfallKind,
      joinsRouteId: trunk?.id,
      source: [burg.x, burg.y],
      destination,
      cellPath: result.cellPath,
      points
    };
    routes.push(route);
    for (const cell of result.cellPath) trunksByCell.set(cell, route);
  }
  return routes.sort((a, b) => a.burgId - b.burgId);
}

function buildLegacySewerRoutes(
  candidates: readonly SewerRouteCandidate[],
  cells: SewerCells,
  rivers: readonly RiverMeta[] | undefined,
  climate: GiantSewerClimateOptions | undefined
): InheritedSewerRoute[] {
  const routes: InheritedSewerRoute[] = [];
  for (const { burg } of candidates) {
    const outfall = chooseSameLandSewerOutfall(burg, cells, rivers, climate);
    const destination = outfall === undefined ? undefined : cells.p?.[outfall.cell];
    if (!outfall || !destination) continue;
    routes.push({
      id: `roman-sewer-${burg.i}`,
      burgId: burg.i,
      outfallCell: outfall.cell,
      outfallKind: outfall.kind,
      source: [burg.x, burg.y],
      destination: [destination[0], destination[1]],
      cellPath: [burg.cell, outfall.cell],
      points: [
        [burg.x, burg.y],
        [destination[0], destination[1]]
      ]
    });
  }
  return routes;
}

type DownhillSewerPath = { cellPath: number[]; outfall: SewerOutfall; joinCell?: number };

function findDownhillSewerPath(
  burg: Burg,
  cells: SewerCells & Required<Pick<SewerCells, "c" | "p">>,
  rivers: readonly RiverMeta[] | undefined,
  riverHeadCells: ReadonlySet<number>,
  coastalOutlets: ReadonlySet<number>,
  closedRiverIds: ReadonlySet<number>,
  trunksByCell: ReadonlyMap<number, InheritedSewerRoute>,
  allowStorage: boolean
): DownhillSewerPath | undefined {
  const start = burg.cell;
  const landFeature = cells.f[start];
  const directRiverOutfall = getDownstreamRiverOutfall(start, cells, rivers, riverHeadCells, closedRiverIds);
  if (directRiverOutfall !== undefined) {
    return { cellPath: [start, directRiverOutfall], outfall: { cell: directRiverOutfall, kind: "river" } };
  }
  const previous = new Int32Array(cells.i.length).fill(-1);
  const distance = new Float64Array(cells.i.length).fill(Infinity);
  const queue = new FlatQueue<number>();
  previous[start] = start;
  distance[start] = 0;
  queue.push(start, 0);

  while (queue.length) {
    const cell = queue.pop()!;
    const terminal = getSewerTerminal(
      cell,
      start,
      cells,
      riverHeadCells,
      coastalOutlets,
      closedRiverIds,
      trunksByCell,
      allowStorage
    );
    if (terminal) {
      return {
        cellPath: restoreCellPath(cell, start, previous),
        outfall: terminal.outfall,
        joinCell: terminal.joinCell
      };
    }
    // A river is an impermeable boundary for a sewer alignment. If it is not a valid lower
    // outfall (for example, a same-height reach), the route stops rather than crossing it.
    if (cell !== start && cells.r[cell]) continue;
    for (const neighbor of cells.c[cell] ?? []) {
      if (!isDownhillSewerLandCell(cell, neighbor, landFeature, cells)) continue;
      const nextDistance = distance[cell]! + cellDistance(cell, neighbor, cells, cell === start ? burg : undefined);
      if (nextDistance >= distance[neighbor]!) continue;
      distance[neighbor] = nextDistance;
      previous[neighbor] = cell;
      queue.push(neighbor, nextDistance);
    }
    const coast = cells.haven?.[cell];
    if (coast && coastalOutlets.has(coast) && (cells.h[coast] ?? 0) <= (cells.h[cell] ?? 0)) {
      const nextDistance = distance[cell]! + cellDistance(cell, coast, cells, cell === start ? burg : undefined);
      if (nextDistance < distance[coast]!) {
        distance[coast] = nextDistance;
        previous[coast] = cell;
        queue.push(coast, nextDistance);
      }
    }
  }
  return undefined;
}

function getSewerTerminal(
  cell: number,
  start: number,
  cells: SewerCells,
  riverHeadCells: ReadonlySet<number>,
  coastalOutlets: ReadonlySet<number>,
  closedRiverIds: ReadonlySet<number>,
  trunksByCell: ReadonlyMap<number, InheritedSewerRoute>,
  allowStorage: boolean
): { outfall: SewerOutfall; joinCell?: number } | undefined {
  if (cell !== start && trunksByCell.has(cell)) {
    const trunk = trunksByCell.get(cell)!;
    return { outfall: { cell: trunk.outfallCell, kind: trunk.outfallKind }, joinCell: cell };
  }
  if (
    cells.r[cell] &&
    !riverHeadCells.has(cell) &&
    !closedRiverIds.has(cells.r[cell]!) &&
    (cells.h[cell] ?? 0) < (cells.h[start] ?? 0)
  ) {
    return { outfall: { cell, kind: "river" } };
  }
  if (coastalOutlets.has(cell)) return { outfall: { cell, kind: "coast" } };
  if (allowStorage && cell !== start && !cells.r[cell] && !cells.haven?.[cell]) {
    return { outfall: { cell, kind: "storage" } };
  }
  return undefined;
}

function isDownhillSewerLandCell(from: number, to: number, landFeature: number, cells: SewerCells): boolean {
  if (cells.f[to] !== landFeature) return false;
  if ((cells.h[to] ?? 0) < 20 && !cells.r[to] && !cells.haven?.[to]) return false;
  return (cells.h[to] ?? 0) <= (cells.h[from] ?? 0);
}

function restoreCellPath(end: number, start: number, previous: Int32Array): number[] {
  const path = [end];
  for (let cell = end; cell !== start; ) {
    cell = previous[cell];
    if (cell < 0) return [];
    path.push(cell);
  }
  return path.reverse();
}

function cellDistance(
  from: number,
  to: number,
  cells: Required<Pick<SewerCells, "p">>,
  sourceBurg?: Pick<Burg, "x" | "y">
): number {
  if (sourceBurg) {
    const target = cells.p[to];
    return target ? Math.hypot(target[0] - sourceBurg.x, target[1] - sourceBurg.y) : 1;
  }
  const a = cells.p[from];
  const b = cells.p[to];
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 1;
}

function samePoint(a: Point | undefined, b: Point): boolean {
  return Boolean(a && a[0] === b[0] && a[1] === b[1]);
}

type Point = [number, number];

/** A settlement on a river source must discharge into that river's next cell, never sidestep into another basin. */
function getDownstreamRiverOutfall(
  source: number,
  cells: SewerCells,
  rivers: readonly RiverMeta[] | undefined,
  riverHeadCells: ReadonlySet<number>,
  closedRiverIds: ReadonlySet<number>
): number | undefined {
  const riverId = cells.r[source];
  if (!riverId || !riverHeadCells.has(source) || closedRiverIds.has(riverId)) return undefined;
  const downstream = cells.riverDownstream?.[source];
  if (isEligibleDownstreamRiverCell(downstream, source, riverId, cells, riverHeadCells)) return downstream;

  const river = rivers?.find(candidate => candidate.i === riverId);
  const index = river?.cells?.indexOf(source) ?? -1;
  const fromRiverPath = index >= 0 ? river?.cells?.[index + 1] : undefined;
  if (isEligibleDownstreamRiverCell(fromRiverPath, source, riverId, cells, riverHeadCells)) return fromRiverPath;

  return (cells.c?.[source] ?? [])
    .filter(cell => isEligibleDownstreamRiverCell(cell, source, riverId, cells, riverHeadCells))
    .sort(
      (a, b) =>
        cellDistance(source, a, cells as Required<Pick<SewerCells, "p">>) -
        cellDistance(source, b, cells as Required<Pick<SewerCells, "p">>)
    )[0];
}

function isEligibleDownstreamRiverCell(
  cell: number | undefined,
  source: number,
  riverId: number,
  cells: SewerCells,
  riverHeadCells: ReadonlySet<number>
): cell is number {
  return Boolean(
    cell !== undefined &&
      cell >= 0 &&
      cells.r[cell] === riverId &&
      !riverHeadCells.has(cell) &&
      (cells.h[cell] ?? 0) <= (cells.h[source] ?? 0)
  );
}

function nearestByDistance(candidates: Iterable<number>, burg: Burg, cells: SewerCells): number | undefined {
  return Array.from(candidates).sort(
    (a, b) => distanceToBurg(a, burg, cells) - distanceToBurg(b, burg, cells) || a - b
  )[0];
}

function distanceToBurg(cell: number, burg: Burg, cells: SewerCells): number {
  const point = cells.p?.[cell];
  if (!point) return Math.abs(cell - burg.cell);
  return Math.hypot(point[0] - burg.x, point[1] - burg.y);
}
