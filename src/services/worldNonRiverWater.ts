import { clipPolygon } from "lineclip";
import type { WorldContext } from "../context/worldContext";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "./physicalWaterIndex";
import type { RiverPoint } from "./riverGeometry";
import { type PhysicalWaterPolygon, validWaterPolygon } from "./riverPhysicalGeometry";
import { worldCellRing } from "./worldCellGeometry";

export interface WorldWaterBudgets {
  maxCells: number;
  maxVertices: number;
}
export type WorldNonRiverWaterResult =
  | { water: readonly PhysicalWaterPolygon[]; index: PhysicalWaterIndex; cellIds: readonly number[] }
  | { reason: "invalid-input" | "invalid-cell" | "cell-budget" | "vertex-budget" };

/** The union of FMG's wet Voronoi cells is the physical lake/sea mask.
 * Keep cells as separate polygons: XORing adjacent cells or combining separate
 * lakes into rings would turn overlapping water into dry land. Islands remain
 * absent from the union. These boundaries never supply river bridge bank ports.
 * Rendering splines and feature display widths are not physical geometry.
 */
export function buildWorldNonRiverWater(
  world: Readonly<WorldContext>,
  unit: string,
  budgets: WorldWaterBudgets
): WorldNonRiverWaterResult {
  const scale = mapUnitMeters(world.distanceScale, unit);
  if (
    ![scale, world.graphWidth, world.graphHeight].every(v => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(world.graphWidth * scale) ||
    !Number.isFinite(world.graphHeight * scale) ||
    ![budgets.maxCells, budgets.maxVertices].every(v => Number.isSafeInteger(v) && v > 0)
  )
    return { reason: "invalid-input" };
  const cells = world.pack?.cells,
    positions = world.pack?.vertices?.p;
  if (
    !cells?.i ||
    !cells.h ||
    !cells.v ||
    !positions ||
    !cells.i.length ||
    cells.i.length !== cells.h.length ||
    cells.i.length !== cells.v.length
  )
    return { reason: "invalid-cell" };
  if (cells.i.length > budgets.maxCells) return { reason: "cell-budget" };
  const ids = Array.from(cells.i).sort((a, b) => a - b);
  const water: PhysicalWaterPolygon[] = [],
    cellIds: number[] = [];
  let vertices = 0,
    outputVertices = 0;
  for (let slot = 0; slot < ids.length; slot++) {
    const id = ids[slot],
      height = cells.h[id];
    // A missing/duplicate cell could conceal unknown water, even far from a query.
    if (id !== slot || !Number.isFinite(height)) return { reason: "invalid-cell" };
    if (height >= 20) continue;
    const refs = cells.v[id];
    if (!Array.isArray(refs) || refs.length < 3) return { reason: "invalid-cell" };
    vertices += refs.length;
    if (vertices > budgets.maxVertices) return { reason: "vertex-budget" };
    const polygon = worldCellRing(world, id, scale);
    if (!polygon || !validWaterPolygon({ id: -id - 1, rings: [polygon] })) return { reason: "invalid-cell" };
    // Border Voronoi polygons can extend beyond the map. Clip straight edges,
    // without the duplicate control points used for visual coastline splines.
    const clipped = clipPolygon(polygon, [0, 0, world.graphWidth * scale, world.graphHeight * scale]);
    const ring: RiverPoint[] = [];
    for (const p of clipped) {
      const previous = ring.at(-1);
      const point: RiverPoint = [p[0], p[1]];
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) ring.push(point);
    }
    if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]) ring.pop();
    outputVertices += ring.length;
    if (outputVertices > budgets.maxVertices) return { reason: "vertex-budget" };
    for (const p of ring) Object.freeze(p);
    water.push(Object.freeze({ id: -id - 1, rings: Object.freeze([Object.freeze(ring)]) }));
    cellIds.push(id);
  }
  const index = PhysicalWaterIndex.build(water, new PhysicalWaterValidationCache());
  return index
    ? Object.freeze({ water: Object.freeze(water), index, cellIds: Object.freeze(cellIds) })
    : { reason: "invalid-cell" };
}

/** Reuse only the same pack and the same complete mutable-input fingerprint.
 * Politics/city population do not alter water. Unit, mesh and height edits do.
 * Budget failures are keyed too, so increasing a budget permits a retry.
 */
export class WorldNonRiverWaterRegistry {
  private entries = new WeakMap<object, { key: string; result: WorldNonRiverWaterResult }>();
  get(world: Readonly<WorldContext>, unit: string, budgets: WorldWaterBudgets): WorldNonRiverWaterResult {
    const pack = world.pack;
    if (!pack) return { reason: "invalid-cell" };
    const key = JSON.stringify([
      mapUnitMeters(world.distanceScale, unit),
      world.graphWidth,
      world.graphHeight,
      pack.cells?.i,
      pack.cells?.h,
      pack.cells?.v,
      pack.vertices?.p,
      budgets
    ]);
    const cached = this.entries.get(pack);
    if (cached?.key === key) return cached.result;
    const result = buildWorldNonRiverWater(world, unit, budgets);
    Object.freeze(result);
    this.entries.set(pack, { key, result });
    return result;
  }
}
