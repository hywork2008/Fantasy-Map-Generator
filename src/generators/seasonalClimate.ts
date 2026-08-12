/**
 * Live monthly climate: recomputes `grid.cells.seasonalTemp` from the generation-time
 * annual-average `grid.cells.temp`, the world's configured axial tilt, and the live
 * simulation calendar. `grid.cells.temp` itself is never rewritten.
 *
 * See docs/plan/seasonal-temperature-variation.md for the design rationale — in particular
 * why this is a separate field rather than overwriting `temp`, and why it self-gates on the
 * calendar month instead of using `SimulationSystem.cadence` (which counts `advanceTime()`
 * calls, not calendar months).
 */

import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import { minmax } from "../utils";
import { getSeasonalTemperatureOffset } from "../utils/seasonUtils";

export interface SeasonalClimateInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
}

export interface SeasonalClimateResult {
  readonly topics: readonly DataTopic[];
}

const NO_CHANGE: SeasonalClimateResult = { topics: [] };

/** Calendar bucket used to gate recomputation: one bucket per calendar month. */
function getMonthBucket(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/**
 * Recomputes `grid.cells.seasonalTemp` if the current calendar month differs from the last
 * time this ran (tracked by `simulation.lastSeasonalTempBucket`). No-ops otherwise. Mirrors
 * `settleTechnologyAnnual()`'s self-gating pattern (`src/generators/technologyProgress.ts`),
 * just keyed by month instead of year.
 *
 * Safe to call unconditionally after any tick, right after a map load, and once right after
 * generation (after `initSimulationClock()`) — it only does work when the month actually
 * changed since the last call.
 */
export function advanceSeasonalClimate({ world, simulation }: SeasonalClimateInput): SeasonalClimateResult {
  const bucket = getMonthBucket(simulation.currentYear, simulation.currentMonth);
  if (simulation.lastSeasonalTempBucket === bucket) return NO_CHANGE;

  const { grid, mapCoordinates, options, graphHeight } = world;
  const cells = grid?.cells;
  // Guards a not-yet-generated / minimal-fixture grid (e.g. unit tests that exercise the
  // tick pipeline without a real map). A real generated map always has a populated grid.
  if (!cells?.i?.length || !cells.temp) return NO_CHANGE;
  const { cellsX } = grid;
  const n = cells.i.length;
  if (!cells.seasonalTemp || cells.seasonalTemp.length !== n) {
    cells.seasonalTemp = new Int8Array(n);
  }
  const seasonalTemp = cells.seasonalTemp;

  const climate = {
    temperatureEquator: options.temperatureEquator,
    temperatureNorthPole: options.temperatureNorthPole,
    temperatureSouthPole: options.temperatureSouthPole
  };
  const latN = mapCoordinates.latN ?? 0;
  const latT = mapCoordinates.latT ?? 0;

  // One offset per grid row (same latitude-sampling shape as main.ts's calculateTemperatures()):
  // latitude is constant within a row, so the offset only needs computing once per row, not
  // once per cell.
  for (let rowCellId = 0; rowCellId < n; rowCellId += cellsX) {
    const [, y] = grid.points[rowCellId];
    const rowLatitude = latN - (y / graphHeight) * latT;
    const offset = getSeasonalTemperatureOffset(
      rowLatitude,
      simulation.currentYear,
      simulation.currentMonth,
      simulation.currentDay,
      climate,
      options.axialTilt
    );
    const rowEnd = Math.min(rowCellId + cellsX, n);
    for (let cellId = rowCellId; cellId < rowEnd; cellId++) {
      seasonalTemp[cellId] = minmax(cells.temp[cellId] + offset, -128, 127);
    }
  }

  simulation.lastSeasonalTempBucket = bucket;
  return { topics: ["simulation.cells"] };
}
