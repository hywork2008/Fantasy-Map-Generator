/** Feed periods follow Economy's existing 30-day cadence, not the deferred execution date. */
import { getCadencePhase, setCadencePhase } from "../context/cadencePhases";
import { getSimulationMonth, getSimulationYear } from "../economyContext";

/** Call with zero when loading/preparing a world, before any advance changes its date. */
export function scheduleLivestockFeedPeriods(count: number): number[] {
  // Missing old-save state starts prospectively; never invent historical feed or losses.
  const next = getCadencePhase("livestockFeedNextPeriod") || getSimulationYear() * 12 + getSimulationMonth();
  const periods = Array.from({ length: count }, (_, index) => next + index);
  setCadencePhase("livestockFeedNextPeriod", next + count);
  return periods;
}
