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

type SewerCells = Pick<PackedGraph["cells"], "f" | "h" | "haven" | "i" | "p" | "r" | "state">;

/**
 * Determine the Giant inherited trunk-sewer route for each served settlement.
 * Outfalls stay on the same landmass and must be no higher than the settlement, so the display
 * cannot imply a submarine sewer or an uphill gravity drain.
 */
export function buildInheritedSewerRoutes(args: {
  burgs: readonly (Burg | undefined)[];
  cells: SewerCells;
  systems: readonly UrbanWaterSystem[];
}): InheritedSewerRoute[] {
  const routes: InheritedSewerRoute[] = [];
  for (const system of args.systems) {
    // Older saves used the combined waterworks flag; retain their trunk sewer when loading them.
    if (!(system.hasInheritedRomanSewer ?? system.hasInheritedRomanWaterworks)) continue;
    const burg = args.burgs[system.burgId];
    if (!burg?.i) continue;
    const outfall = chooseSameLandSewerOutfall(burg, args.cells);
    if (outfall === undefined) continue;
    const destination = args.cells.p[outfall];
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
export function hasSameLandSewerOutfall(
  burg: Burg,
  cells: Pick<PackedGraph["cells"], "f" | "h" | "haven" | "i" | "r" | "state">
): boolean {
  return chooseSameLandSewerOutfall(burg, cells) !== undefined;
}

function chooseSameLandSewerOutfall(burg: Burg, cells: Omit<SewerCells, "p">): number | undefined {
  const landFeature = cells.f?.[burg.cell];
  const burgHeight = cells.h[burg.cell] ?? 0;
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  const sameLandLower = cellIds.filter(
    cell => (!cells.f || cells.f[cell] === landFeature) && (cells.h[cell] ?? 0) <= burgHeight
  );
  const localRiver = burg.state
    ? sameLandLower.filter(cell => cells.r[cell] && (!cells.state || cells.state[cell] === burg.state))
    : [];
  const river = localRiver.length ? localRiver : sameLandLower.filter(cell => cells.r[cell]);
  if (river.length) return nearestByCellId(river, burg.cell);

  const coast = sameLandLower.filter(cell => cells.haven?.[cell]);
  return coast.length ? nearestByCellId(coast, burg.cell) : undefined;
}

function nearestByCellId(cells: Iterable<number>, fromCell: number): number {
  return Array.from(cells).sort((a, b) => Math.abs(a - fromCell) - Math.abs(b - fromCell) || a - b)[0]!;
}
