import type { Burg, PackedGraph } from "../../hostTypes";
import { buildInheritedSewerRoutes } from "./urbanSewerage";
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
  cells: Pick<PackedGraph["cells"], "f" | "h" | "haven" | "i" | "p" | "r" | "state">;
  systems: readonly UrbanWaterSystem[];
}

/**
 * Derive visible aqueduct routes from existing Roman-waterworks records.
 *
 * These routes are deliberately deterministic and are not a new river: an inherited Giant settlement
 * takes only from a protected headwater in its own State and landmass. It selects the highest
 * usable source rather than the nearest river cell, so the aqueduct can be long. The eventual
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

  const sewerOutfalls = buildInheritedSewerRoutes({ burgs, cells, systems }).map(route => route.outfallCell);
  const routes: InheritedWaterSupplyRoute[] = [];
  for (const system of systems) {
    if (!system.hasInheritedRomanWaterworks) continue;
    const burg = burgs[system.burgId];
    if (!burg || !burg.i) continue;

    const sourceCell = chooseProtectedIntakeCell(burg, riverCells, cells, sewerOutfalls);
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

function chooseProtectedIntakeCell(
  burg: Burg,
  riverCells: readonly number[],
  cells: InheritedWaterSupplyRouteInput["cells"],
  sewerOutfalls: readonly number[]
): number | undefined {
  const burgPoint: [number, number] = [burg.x, burg.y];
  const sameLandRivers = riverCells.filter(cell => cells.f[cell] === cells.f[burg.cell]);
  if (!sameLandRivers.length) return undefined;
  // A source cannot be protected if another State owns it. Giant public works therefore never
  // substitute a foreign river merely to make a line appear on the map.
  const stateRivers = burg.state ? sameLandRivers.filter(cell => cells.state[cell] === burg.state) : sameLandRivers;
  const burgHeight = cells.h[burg.cell] ?? 0;
  const gravityCandidates = stateRivers.filter(cell => (cells.h[cell] ?? 0) >= burgHeight);
  const protectedCandidates = gravityCandidates.filter(
    cell => !sewerOutfalls.some(outfall => canReachDownstream(outfall, cell, cells))
  );
  if (!protectedCandidates.length) return undefined;

  return [...protectedCandidates].sort((a, b) => {
    const elevationDelta = (cells.h[b] ?? 0) - (cells.h[a] ?? 0);
    return elevationDelta || distanceSquared(cells.p[a], burgPoint) - distanceSquared(cells.p[b], burgPoint) || a - b;
  })[0];
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

function distanceSquared(point: [number, number] | undefined, target: [number, number]): number {
  if (!point) return Infinity;
  const dx = point[0] - target[0];
  const dy = point[1] - target[1];
  return dx * dx + dy * dy;
}
