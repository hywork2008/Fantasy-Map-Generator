import { uiPreferencesStore } from "../state/uiPreferencesStore";
import { bindStore } from "./bindStore";

export * from "../state/uiPreferencesStore";

/** React binding of the simulation-core store (docs/plan/simulation-core-separation.md S4). */
export const useUiPreferencesState = bindStore(uiPreferencesStore);
