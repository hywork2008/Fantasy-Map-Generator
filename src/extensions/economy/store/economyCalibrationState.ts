import { bindStore } from "../../../store/bindStore";
import { economyCalibrationStore } from "../state/economyCalibrationStore";

export * from "../state/economyCalibrationStore";

/** React binding of the simulation-core store (docs/plan/simulation-core-separation.md S4). */
export const useEconomyCalibrationState = bindStore(economyCalibrationStore);
