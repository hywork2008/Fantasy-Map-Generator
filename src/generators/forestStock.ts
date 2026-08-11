import type { PackedGraphCells } from "../types/PackedGraph";

/** Natural annual recovery of a fully cleared, non-cultivated forest cell. */
export const FOREST_REGROWTH_PER_YEAR = 0.02;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Returns the static, climate-derived forest capacity of a cell. */
export function getForestCapacity(cells: Readonly<PackedGraphCells>, cellId: number): number {
  return clamp01(cells.forestCover?.[cellId] ?? 0);
}

/**
 * Returns standing timber as a share of the cell's potential forest. Legacy maps
 * without the live column are interpreted as intact forest, not as bare land.
 */
export function getForestStockRatio(cells: Readonly<PackedGraphCells>, cellId: number): number {
  const capacity = getForestCapacity(cells, cellId);
  if (capacity <= 0) return 0;
  const stock = cells.forestStock?.[cellId];
  return stock === undefined ? 1 : clamp01(stock / capacity);
}

/** The cleared share of potential forest. This is a derived value, never a second state column. */
export function getForestClearingRate(cells: Readonly<PackedGraphCells>, cellId: number): number {
  const capacity = getForestCapacity(cells, cellId);
  return capacity > 0 ? 1 - getForestStockRatio(cells, cellId) : 0;
}

/** Seeds a newly generated world's forest stock from its potential forest capacity. */
export function initializeForestStock(cells: PackedGraphCells): void {
  const stock = cells.forestStock;
  if (!stock || stock.length !== cells.i.length) return;
  for (const cellId of cells.i) stock[cellId] = getForestCapacity(cells, cellId);
}

/**
 * Removes up to `requestedCoverage` of the cell's potential forest capacity.
 * Returns the coverage actually harvested, so callers can cap Wood output by
 * the timber that physically existed.
 */
export function harvestForestStock(cells: PackedGraphCells, cellId: number, requestedCoverage: number): number {
  const stock = cells.forestStock;
  if (!stock || requestedCoverage <= 0 || !Number.isFinite(requestedCoverage)) return 0;
  const capacity = getForestCapacity(cells, cellId);
  if (capacity <= 0) return 0;

  const current = Math.max(0, Math.min(capacity, stock[cellId] ?? capacity));
  const harvested = Math.min(current, requestedCoverage);
  if (harvested <= 0) return 0;
  stock[cellId] = current - harvested;
  return harvested;
}

/**
 * Restores standing timber only where land is not occupied by crops or other
 * permanent open uses. `protectedOpenCoverage` is measured against the whole
 * cell and therefore prevents forest recovery over active fields.
 */
export function regrowForestStock(
  cells: PackedGraphCells,
  cellId: number,
  deltaYears: number,
  protectedOpenCoverage = 0,
  regrowthMultiplier = 1
): boolean {
  const stock = cells.forestStock;
  if (!stock || deltaYears <= 0 || !Number.isFinite(deltaYears)) return false;
  const capacity = getForestCapacity(cells, cellId);
  if (capacity <= 0) return false;

  const recoverableCeiling = Math.max(0, capacity - clamp01(protectedOpenCoverage));
  const current = Math.max(0, Math.min(recoverableCeiling, stock[cellId] ?? capacity));
  const multiplier = Number.isFinite(regrowthMultiplier) ? Math.max(0, regrowthMultiplier) : 1;
  const next = Math.min(recoverableCeiling, current + capacity * FOREST_REGROWTH_PER_YEAR * deltaYears * multiplier);
  if (next <= current) return false;
  stock[cellId] = next;
  return true;
}
