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
  cells: Pick<PackedGraph["cells"], "f" | "h" | "i" | "p" | "r" | "state">;
  systems: readonly UrbanWaterSystem[];
}

/**
 * Derive visible aqueduct routes from existing Roman-waterworks records.
 *
 * These routes are deliberately deterministic and are not a new river: an inherited Giant settlement
 * takes only from a river cell on the same landmass. It prefers the nearest same-State gravity
 * source, then another State's gravity source on that landmass. The eventual
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
  const sameLandRivers = riverCells.filter(cell => cells.f[cell] === cells.f[burg.cell]);
  if (!sameLandRivers.length) return undefined;
  const localStateRivers = burg.state
    ? sameLandRivers.filter(cell => cells.state[cell] === burg.state)
    : [...sameLandRivers];
  const burgHeight = cells.h[burg.cell] ?? 0;
  const localGravityCandidates = localStateRivers.filter(cell => (cells.h[cell] ?? 0) >= burgHeight);
  const allGravityCandidates = sameLandRivers.filter(cell => (cells.h[cell] ?? 0) >= burgHeight);
  const candidates = localGravityCandidates.length
    ? localGravityCandidates
    : allGravityCandidates.length
      ? allGravityCandidates
      : localStateRivers.length
        ? localStateRivers
        : riverCells;
  return nearestCell(candidates, burgPoint, cells.p);
}

/** True when a burg can take gravity water without crossing a sea or another landmass. */
export function hasSameLandGravityWaterSource(
  burg: Burg,
  cells: Pick<PackedGraph["cells"], "f" | "h" | "i" | "r">
): boolean {
  const landFeature = cells.f?.[burg.cell];
  const burgHeight = cells.h[burg.cell] ?? 0;
  // Test fixtures and legacy adapters can omit `cells.i`; `r` is indexed by the same packed id.
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  for (const cell of cellIds) {
    if (!cells.r[cell] || (cells.f && cells.f[cell] !== landFeature)) continue;
    if ((cells.h[cell] ?? 0) >= burgHeight) return true;
  }
  return false;
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
