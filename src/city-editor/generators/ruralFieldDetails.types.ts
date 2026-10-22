import type { RuralFieldSettings, RuralFieldSystem } from "../types/contracts/ruralFields";
import type { Point } from "../types/primitives";
import type { RuralFieldInput } from "./ruralFieldPlan";

export interface DetailedRuralFieldInput extends RuralFieldInput {
  profiler?: import("../utils/ruralFieldProfiler").RuralFieldProfiler;
  system: RuralFieldSystem;
  settings?: RuralFieldSettings;
  /** The physical domain can extend beyond this rendering window. */
  visibleFrame?: Point[];
  unsuitableAreaM2?: number;
}
