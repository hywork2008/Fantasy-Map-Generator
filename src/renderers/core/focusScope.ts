import type { FocusScope } from "../../context/viewContext";
import type { PackedGraph } from "../../types/PackedGraph";

/** True when no scope is active, or the packed-graph cell belongs to the focused state/province. */
export function isCellInScope(focusScope: FocusScope | null, cellId: number): boolean {
  return !focusScope || focusScope.cellIds.has(cellId);
}

/** Same as {@link isCellInScope} but for raw-grid cell indices (see FocusScope.gridCellIds). */
export function isGridCellInScope(focusScope: FocusScope | null, gridCellId: number): boolean {
  return !focusScope || focusScope.gridCellIds.has(gridCellId);
}

/**
 * Returns `pack` unchanged when no scope is active. Otherwise returns a shallow clone whose
 * `cells.i` only enumerates the focused cells, so cell-walking algorithms (e.g. getIsolines'
 * flood fill) start from a fraction of the cells instead of the whole map. All other typed
 * arrays keep referencing the same underlying data — this never mutates `pack`.
 */
export function getScopedGraph(pack: PackedGraph, focusScope: FocusScope | null): PackedGraph {
  if (!focusScope) return pack;
  return { ...pack, cells: { ...pack.cells, i: Uint32Array.from(focusScope.cellIds) } };
}

/**
 * Wraps a getIsolines `getType` callback so out-of-scope cells report a falsy type. This makes
 * the flood fill treat the scope boundary the same way it treats a coastline — it stops there
 * instead of bleeding into a same-type neighbor outside the focused state/province.
 */
export function scopedGetType(
  focusScope: FocusScope | null,
  getType: (cellId: number) => number | string | null | undefined | false
): (cellId: number) => number | string | null | undefined | false {
  if (!focusScope) return getType;
  return cellId => (focusScope.cellIds.has(cellId) ? getType(cellId) : null);
}
