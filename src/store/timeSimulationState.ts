import { timeSimulationStore } from "../state/timeSimulationStore";
import { bindStore } from "./bindStore";

export * from "../state/timeSimulationStore";

/** React binding of the simulation-core store (docs/plan/simulation-core-separation.md S4). */
export const useTimeSimulationState = bindStore(timeSimulationStore);
