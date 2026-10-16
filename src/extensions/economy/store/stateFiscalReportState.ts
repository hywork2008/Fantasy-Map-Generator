import { bindStore } from "../../../store/bindStore";
import { stateFiscalReportStore } from "../state/stateFiscalReportStore";

export * from "../state/stateFiscalReportStore";

/** React binding of the simulation-core store (docs/plan/simulation-core-separation.md S4). */
export const useStateFiscalReportState = bindStore(stateFiscalReportStore);
