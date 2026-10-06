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
import { ensureCellClimateNormals } from "./cellClimateNormals";

export interface SeasonalClimateInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
}

export interface SeasonalClimateResult {
  readonly topics: readonly DataTopic[];
}

const displayRevisions = new WeakMap<WorldContext, { bucket: number; revision: number; output: Int8Array }>();

const NO_CHANGE: SeasonalClimateResult = { topics: [] };

/** Calendar bucket used to gate recomputation: one bucket per calendar month. */
function getMonthBucket(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** Updates the canonical monthly display after date or climate edits. Saved buckets are advisory only. */
export function advanceSeasonalClimate({ world, simulation }: SeasonalClimateInput): SeasonalClimateResult {
  const bucket = getMonthBucket(simulation.currentYear, simulation.currentMonth);
  const cells = world.grid?.cells;
  if (!cells?.i?.length || !cells.temp || world.grid.points?.length !== cells.i.length || !(world.graphHeight > 0))
    return NO_CHANGE;
  const climate = ensureCellClimateNormals(world, simulation.currentYear);
  const last = displayRevisions.get(world);
  if (last?.bucket === bucket && last.revision === climate.revision && last.output === cells.seasonalTemp)
    return NO_CHANGE;
  const n = cells.i.length;
  if (!cells.seasonalTemp || cells.seasonalTemp.length !== n) cells.seasonalTemp = new Int8Array(n);
  for (let cell = 0; cell < n; cell++) {
    cells.seasonalTemp[cell] = Math.round(minmax(climate.monthly[cell * 12 + simulation.currentMonth - 1], -128, 127));
  }
  displayRevisions.set(world, { bucket, revision: climate.revision, output: cells.seasonalTemp });

  simulation.lastSeasonalTempBucket = bucket;
  return { topics: ["simulation.cells"] };
}
