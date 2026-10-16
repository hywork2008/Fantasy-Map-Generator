import { bindStore } from "../../../store/bindStore";
import { playerCharacterStore } from "../state/playerCharacterStore";

export * from "../state/playerCharacterStore";

/** React binding of the simulation-core store (docs/plan/simulation-core-separation.md S4). */
export const usePlayerCharacterState = bindStore(playerCharacterStore);
