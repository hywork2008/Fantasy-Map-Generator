import { optionsStore } from "../state/optionsStore";
import { bindStore } from "./bindStore";

export * from "../state/optionsStore";

/** React binding of the simulation-core store (docs/plan/simulation-core-separation.md S4). */
export const useOptionsState = bindStore(optionsStore);
