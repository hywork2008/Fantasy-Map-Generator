import { recordManagedHarvest } from "../../../generators/landUse";
import { managedHarvestAllowance, recoveryYears } from "../../../generators/landUseActivities";
/**
 * Economy bridge for the host-owned forest stock.
 *
 * `pack.cells.forestCover` is immutable potential forest capacity; the sole
 * mutable source of timber is `simulation.cells.forestStock`, exposed through
 * `pack.cells.forestStock` for compatibility. Shipyard felling, Wood
 * supply, and natural regrowth therefore observe the same quantity instead of
 * maintaining a parallel depletion coefficient.
 */

import {
  getForestCapacity,
  getForestStockRatio,
  getWoodUnitsPerForestCoverage,
  harvestForestStock,
  regrowForestStock
} from "../../../generators/forestStock";
import { getMaintainedForestConversion } from "../../../generators/landUse";
import { getCultivatedArea, getSimulationYear, getWorldContext, isEconomyContextReady } from "../economyContext";
import { calculatePhysicalAreaHectares } from "./agriculturalLandUse";

/**
 * Wood units a given forest coverage of this cell holds: its hectares at the biome's standing
 * volume, in 10 m³ units (`WOOD_M3_PER_UNIT`). Felling takes hectares, so the same Wood empties the
 * same area of forest on any map (docs/plan/farm-labour-calibration.md §22).
 */
export function woodUnitsForCoverage(cellId: number, coverage: number): number {
  return isEconomyContextReady() ? coverage * getWoodUnitsPerForestCoverage(getWorldContext(), cellId) : 0;
}

/** Forest coverage of this cell that holds one Wood unit; Infinity where the cell holds none. */
function coveragePerWoodUnit(cellId: number): number {
  const units = getWoodUnitsPerForestCoverage(getWorldContext(), cellId);
  return units > 0 ? 1 / units : Infinity;
}

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
  const world = getWorldContext(),
    year = getSimulationYear();
  const perUnit = coveragePerWoodUnit(cellId);
  if (!Number.isFinite(perUnit)) return 0;
  const requestedCoverage = Math.min(
    requestedWood * perUnit,
    managedHarvestAllowance(world.pack.landUse, cellId, year) ?? Infinity
  );
  const harvestedCoverage = harvestForestStock(cells, cellId, requestedCoverage);
  recordManagedHarvest(world, cellId, year, harvestedCoverage);
  return harvestedCoverage / perUnit;
}

/** Wood `harvestWood()` could cut in this cell now, without cutting it. */
export function getFellableWood(cellId: number): number {
  const cells = getLiveCells();
  if (!cells?.forestStock) return 0;
  const capacity = getForestCapacity(cells, cellId);
  if (capacity <= 0) return 0;
  const standing = Math.max(0, Math.min(capacity, cells.forestStock[cellId] ?? capacity));
  const allowance = managedHarvestAllowance(getWorldContext().pack.landUse, cellId, getSimulationYear()) ?? Infinity;
  return woodUnitsForCoverage(cellId, Math.min(standing, allowance));
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
export function tickForestRegrowth(deltaYears: number, getRegrowthMultiplier?: (cellId: number) => number): boolean {
  const cells = getLiveCells();
  if (!cells || deltaYears <= 0 || !Number.isFinite(deltaYears)) return false;

  const world = getWorldContext();
  const cultivatedArea = getCultivatedArea();
  let changed = false;
  for (const cellId of cells.i) {
    const physicalArea = calculatePhysicalAreaHectares(world, cellId);
    const protectedOpenCoverage =
      getMaintainedForestConversion(world.pack.landUse, cellId) ??
      (physicalArea > 0 && cultivatedArea.length === cells.i.length
        ? Math.max(0, Math.min(1, cultivatedArea[cellId] / physicalArea))
        : 0);
    const recovered = regrowForestStock(
      cells,
      cellId,
      deltaYears,
      protectedOpenCoverage,
      (getRegrowthMultiplier?.(cellId) ?? 1) *
        (world.pack.landUse?.cells[cellId]
          ? 50 /
            recoveryYears(
              world.grid?.cells?.temp?.[cells.g?.[cellId] ?? cellId],
              world.grid?.cells?.prec?.[cells.g?.[cellId] ?? cellId]
            )
          : 1)
    );
    changed = recovered || changed;
  }
  return changed;
}
