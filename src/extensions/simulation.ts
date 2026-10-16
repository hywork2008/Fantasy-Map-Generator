import type { SimulationExtension } from "../types/extension-api";
import { charactersSimulation } from "./characters/simulation";
import { economySimulation } from "./economy/simulation";
import { nobilitySimulation } from "./nobility/simulation";
import { shipbuildingSimulation } from "./shipbuilding/simulation";

/**
 * The built-in extensions' simulation entries, in the order the browser registers them
 * (src/extensions/index.ts). Event listeners fire in registration order, so every host uses this
 * same order (docs/plan/simulation-core-separation.md §7, S5).
 */
export const BUILTIN_SIMULATION_EXTENSIONS: readonly SimulationExtension[] = [
  economySimulation,
  charactersSimulation,
  nobilitySimulation,
  shipbuildingSimulation
];
