import { fastAdvanceStore } from "../state/fastAdvanceStore";
import { bindStore } from "./bindStore";

export * from "../state/fastAdvanceStore";

/** React binding of the simulation-core store (docs/plan/simulation-core-separation.md S4). */
export const useFastAdvanceState = bindStore(fastAdvanceStore);
