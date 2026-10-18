import type { WorldContext } from "../context/worldContext";
import type { PackedGraphCells } from "../types/PackedGraph";

/**
 * One Economy Wood unit is 10 m³ of solid roundwood, the same everywhere on every map. At the
 * Wood price (value 1, one Grain unit of ~465 kg) this matches early-modern prices: 220 kg of wheat
 * ≈ 30 shillings and a load of firewood ≈ 8–10 shillings (docs/plan/farm-labour-calibration.md §22).
 */
export const WOOD_M3_PER_UNIT = 10;

/**
 * Standing stem volume of closed forest (m³/ha) by biome. FAO's Global Forest Resources Assessment
 * 2020 gives 137 m³/ha as the world average growing stock; boreal forest is far lower, coastal
 * temperate rainforest far higher. Natural regrowth (`FOREST_REGROWTH_PER_YEAR`, about 2% a year)
 * then yields roughly 2 m³/ha a year in taiga and 4–5 in broadleaf forest, the 3.3 m³/ha that
 * Warde uses for English woodland (§22). Wood kind (oak or pine) is not tracked: the household fuel
 * rates come from regions that burned what grew there.
 */
export const STANDING_M3_PER_HA_BY_BIOME: Readonly<Record<string, number>> = {
  taiga: 100,
  temperateConiferousForest: 250,
  montaneForest: 200,
  temperateDeciduousForest: 200,
  centralEuropeanGreatForest: 300,
  temperateRainforest: 500,
  tropicalRainforest: 250,
  cloudForest: 200,
  tropicalSeasonalForest: 150,
  tropicalDryForest: 80,
  mangrove: 100,
  floodedForest: 150
};
export const DEFAULT_STANDING_M3_PER_HA = 150;

/** Land area of a cell in hectares, the same figure agriculture uses. */
function getCellHectares(world: Readonly<WorldContext>, cellId: number): number {
  const cells = world.pack.cells;
  if ((cells.h[cellId] ?? 0) < 20) return 0;
  const scale = Math.max(0, world.distanceScale || 1);
  return Math.max(0, cells.area?.[cellId] ?? 0) * scale * scale * 100;
}

/**
 * Wood units in the whole of a cell's forest at coverage 1 (its land area at closed forest).
 * Converts Wood units to `forestStock` coverage so felling takes hectares, not a share of a cell
 * whose size differs between maps.
 */
export function getWoodUnitsPerForestCoverage(world: Readonly<WorldContext>, cellId: number): number {
  const key = world.biomesData?.keys?.[world.pack.cells.biomeCode?.[cellId] ?? -1];
  const standing = (key && STANDING_M3_PER_HA_BY_BIOME[key]) || DEFAULT_STANDING_M3_PER_HA;
  return (getCellHectares(world, cellId) * standing) / WOOD_M3_PER_UNIT;
}

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
