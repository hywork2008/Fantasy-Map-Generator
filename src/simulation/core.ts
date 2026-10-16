/**
 * Simulation core entry (docs/plan/simulation-core-separation.md §4.1).
 *
 * Everything statically reachable from this module (and from each extension's simulation entry)
 * is the simulation core and must stay free of DOM, rendering, React, three and UI stores —
 * enforced by `npm run lint:sim-boundary`. For now (S0) it only re-exports the existing time
 * advance surface; the SimulationHost (§5) lands here in S5.
 */
export { simulationContext } from "../context/simulationContext";
export { worldContext } from "../context/worldContext";
export {
  advanceTime,
  registerSimulationSystem,
  registerTimeTickHook,
  runTimeSimulation
} from "../generators/timeEngine";
export { advance, type DailyRunOptions, type DailyRunResult, runDaily, stepDay } from "../runtime/simulationRunner";
export { stepDaySimulation, worldRuntime } from "../runtime/worldRuntime";
