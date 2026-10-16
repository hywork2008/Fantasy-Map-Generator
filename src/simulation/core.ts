/**
 * Simulation core entry (docs/plan/simulation-core-separation.md §4.1).
 *
 * Everything statically reachable from this module (and from each extension's simulation entry)
 * is the simulation core and must stay free of DOM, rendering, React, three and UI stores —
 * enforced by `npm run lint:sim-boundary`. The SimulationHost (§5, S5) is the entry a runner uses;
 * the lower-level time advance surface stays exported for tests and the golden runner.
 */
export { simulationContext } from "../context/simulationContext";
export { worldContext } from "../context/worldContext";
export { BUILTIN_SIMULATION_EXTENSIONS } from "../extensions/simulation";
export {
  advanceTime,
  registerSimulationSystem,
  registerTimeTickHook,
  runTimeSimulation
} from "../generators/timeEngine";
export { advance, type DailyRunOptions, type DailyRunResult, runDaily, stepDay } from "../runtime/simulationRunner";
export { stepDaySimulation, worldRuntime } from "../runtime/worldRuntime";
export {
  createStaticEnablement,
  isSimulationExtensionEnabled,
  type SimulationExtensionEnablement
} from "./extensionEnablement";
export { createSimulationHost, type SimulationHost, type SimulationHostOptions } from "./host";
