import type { Burg, PackedGraph } from "../../hostTypes";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

/** A gravity-fed aqueduct route rendered for a pre-existing Giant Roman waterworks system. */
export interface InheritedWaterSupplyRoute {
  id: string;
  burgId: number;
  stateId: number;
  sourceCell: number;
  source: [number, number];
  destination: [number, number];
}

export interface InheritedWaterSupplyRouteInput {
  burgs: readonly (Burg | undefined)[];
  cells: Pick<PackedGraph["cells"], "h" | "i" | "p" | "r" | "state">;
  systems: readonly UrbanWaterSystem[];
}

/**
 * Derive visible aqueduct routes from existing Roman-waterworks records.
 *
 * These routes are deliberately deterministic and are not a new river: an inherited Giant city
 * takes from the nearest river cell of its State that is at least as high as the city, falling
 * back to the nearest same-State river, then a cross-border river if necessary. The eventual
 * RegionalWaterScheme will replace this routing rule with negotiated sources and constructed
 * segments, while retaining the same source/destination shape for renderers.
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

  const routes: InheritedWaterSupplyRoute[] = [];
  for (const system of systems) {
    if (!system.hasInheritedRomanWaterworks) continue;
    const burg = burgs[system.burgId];
    if (!burg || !burg.i) continue;

    const sourceCell = chooseIntakeCell(burg, riverCells, cells);
    if (sourceCell === undefined) continue;
    const source = cells.p[sourceCell];
    if (!source) continue;

    routes.push({
      id: `roman-aqueduct-${burg.i}`,
      burgId: burg.i,
      stateId: burg.state ?? 0,
      sourceCell,
      source: [source[0], source[1]],
      destination: [burg.x, burg.y]
    });
  }
  return routes;
}

function chooseIntakeCell(
  burg: Burg,
  riverCells: readonly number[],
  cells: InheritedWaterSupplyRouteInput["cells"]
): number | undefined {
  const burgPoint: [number, number] = [burg.x, burg.y];
  const localStateRivers = burg.state ? riverCells.filter(cell => cells.state[cell] === burg.state) : [...riverCells];
  const candidates = localStateRivers.length ? localStateRivers : riverCells;
  const burgHeight = cells.h[burg.cell] ?? 0;
  const gravityCandidates = candidates.filter(cell => (cells.h[cell] ?? 0) >= burgHeight);
  return nearestCell(gravityCandidates.length ? gravityCandidates : candidates, burgPoint, cells.p);
}

function nearestCell(
  cells: readonly number[],
  target: [number, number],
  points: readonly [number, number][]
): number | undefined {
  let nearest: number | undefined;
  let nearestDistance = Infinity;
  for (const cell of cells) {
    const point = points[cell];
    if (!point) continue;
    const dx = point[0] - target[0];
    const dy = point[1] - target[1];
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance || (distance === nearestDistance && (nearest === undefined || cell < nearest))) {
      nearest = cell;
      nearestDistance = distance;
    }
  }
  return nearest;
}
