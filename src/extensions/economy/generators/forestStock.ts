/**
 * Economy bridge for the host-owned forest stock.
 *
 * `pack.cells.forestCover` is immutable potential forest capacity; the sole
 * mutable source of timber is `simulation.cells.forestStock`, exposed through
 * `pack.cells.forestStock` for compatibility. Shipbuilding logging, Wood
 * supply, and natural regrowth therefore observe the same quantity instead of
 * maintaining a parallel depletion coefficient.
 */

import { getForestStockRatio, harvestForestStock, regrowForestStock } from "../../../generators/forestStock";
import { getCultivatedArea, getWorldContext, isEconomyContextReady } from "../economyContext";
import { calculatePhysicalAreaHectares } from "./agriculturalLandUse";

/**
 * Conversion from one market unit of Wood to the share of a fully forested
 * cell that must be harvested. The small value keeps ordinary rural forestry
 * renewable at low population while making dense timber demand visibly open
 * the landscape over time.
 */
export const FOREST_COVER_PER_WOOD_UNIT = 0.0002;

function getLiveCells() {
  return isEconomyContextReady() ? getWorldContext().pack.cells : null;
}

/**
 * Transfers as much requested Wood as the one canonical standing-timber stock
 * can supply. The returned amount is the market good quantity actually cut.
 */
export function harvestWood(cellId: number, requestedWood: number): number {
  const cells = getLiveCells();
  if (!cells || requestedWood <= 0 || !Number.isFinite(requestedWood)) return 0;
  const requestedCoverage = requestedWood * FOREST_COVER_PER_WOOD_UNIT;
  const harvestedCoverage = harvestForestStock(cells, cellId, requestedCoverage);
  return requestedCoverage > 0 ? requestedWood * (harvestedCoverage / requestedCoverage) : 0;
}

/** Applies a shipbuilding logging event to the same stock used by market Wood. */
export function registerLogHarvest(cellId: number, amount: number): boolean {
  return harvestWood(cellId, amount) > 0;
}

/** Current Wood supply multiplier for one cell, derived from standing timber. */
export function getForestStockMultiplier(cellId: number): number {
  const cells = getLiveCells();
  return cells ? getForestStockRatio(cells, cellId) : 1;
}

/**
 * Restores only unoccupied forest. Active crop area is protected from regrowth,
 * so a felled field remains open while a disused logging scar slowly closes.
 */
export function tickForestRegrowth(deltaYears: number): boolean {
  const cells = getLiveCells();
  if (!cells || deltaYears <= 0 || !Number.isFinite(deltaYears)) return false;

  const world = getWorldContext();
  const cultivatedArea = getCultivatedArea();
  let changed = false;
  for (const cellId of cells.i) {
    const physicalArea = calculatePhysicalAreaHectares(world, cellId);
    const protectedOpenCoverage =
      physicalArea > 0 && cultivatedArea.length === cells.i.length
        ? Math.max(0, Math.min(1, cultivatedArea[cellId] / physicalArea))
        : 0;
    changed ||= regrowForestStock(cells, cellId, deltaYears, protectedOpenCoverage);
  }
  return changed;
}
