import type { Burg, PackedGraph } from "../../hostTypes";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

export interface InheritedSewerRoute {
  id: string;
  burgId: number;
  outfallCell: number;
  outfallKind: "river" | "coast";
  source: [number, number];
  destination: [number, number];
}

type SewerCells = Pick<PackedGraph["cells"], "f" | "h" | "haven" | "i" | "r" | "state"> & {
  /** Legacy simulation fixtures can omit geometry; fall back to packed-cell proximity there. */
  p?: PackedGraph["cells"]["p"];
};
type RiverHead = Pick<PackedGraph["rivers"][number], "i" | "source">;

/**
 * Determine the Giant inherited trunk-sewer route for each served settlement.
 * Outfalls stay on the same landmass and must be no higher than the settlement. A river is used
 * only when it is nearer than the coast, preventing a remote river line from crossing lowland
 * that could discharge directly into the nearby sea.
 */
export function buildInheritedSewerRoutes(args: {
  burgs: readonly (Burg | undefined)[];
  cells: SewerCells;
  rivers?: readonly RiverHead[];
  systems: readonly UrbanWaterSystem[];
}): InheritedSewerRoute[] {
  const routes: InheritedSewerRoute[] = [];
  for (const system of args.systems) {
    // Older saves used the combined waterworks flag; retain their trunk sewer when loading them.
    if (!(system.hasInheritedRomanSewer ?? system.hasInheritedRomanWaterworks)) continue;
    const burg = args.burgs[system.burgId];
    if (!burg?.i) continue;
    const outfall = chooseSameLandSewerOutfall(burg, args.cells, args.rivers);
    if (outfall === undefined) continue;
    const destination = args.cells.p?.[outfall];
    if (!destination) continue;
    routes.push({
      id: `roman-sewer-${burg.i}`,
      burgId: burg.i,
      outfallCell: outfall,
      outfallKind: args.cells.r[outfall] ? "river" : "coast",
      source: [burg.x, burg.y],
      destination: [destination[0], destination[1]]
    });
  }
  return routes;
}

/** True if a gravity trunk sewer can reach a lower river or coast on the same landmass. */
export function hasSameLandSewerOutfall(burg: Burg, cells: SewerCells, rivers?: readonly RiverHead[]): boolean {
  return chooseSameLandSewerOutfall(burg, cells, rivers) !== undefined;
}

function chooseSameLandSewerOutfall(burg: Burg, cells: SewerCells, rivers?: readonly RiverHead[]): number | undefined {
  const landFeature = cells.f?.[burg.cell];
  const burgHeight = cells.h[burg.cell] ?? 0;
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  const sameLandLower = cellIds.filter(
    cell => (!cells.f || cells.f[cell] === landFeature) && (cells.h[cell] ?? 0) <= burgHeight
  );
  // The source cell is an inviolate headwater intake. A trunk sewer can join only the second
  // mapped cell or later, even when the source happens to be the closest river point.
  const riverHeadCells = getRiverHeadCells(cells, rivers);
  const river = sameLandLower.filter(cell => cells.r[cell] && !riverHeadCells.has(cell));
  const coast = sameLandLower.filter(cell => cells.haven?.[cell]);
  const nearestRiver = nearestByDistance(river, burg, cells);
  const nearestCoast = nearestByDistance(coast, burg, cells);
  if (nearestRiver === undefined) return nearestCoast;
  if (nearestCoast === undefined) return nearestRiver;
  return distanceToBurg(nearestRiver, burg, cells) <= distanceToBurg(nearestCoast, burg, cells)
    ? nearestRiver
    : nearestCoast;
}

function getRiverHeadCells(cells: SewerCells, rivers?: readonly RiverHead[]): Set<number> {
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
