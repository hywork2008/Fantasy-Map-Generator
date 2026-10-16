import type { RiverCurvePrecision } from "./riverCurveGeometry";
import type { RiverGeometryBounds } from "./riverGeometryBounds";
import type { PhysicalRiverGeometry } from "./riverPhysicalGeometry";
import type { RiverBankSampling } from "./riverPhysicalGeometryBuilder";

export interface WorldRiverGeometrySettings {
  curveAlpha: number;
  precision: RiverCurvePrecision;
  banks: RiverBankSampling;
  /** Source budget is separate from adaptive bank sampling. */
  maxSourcePoints: number;
}

export type WorldRiverGeometryResult = {
  riverId: number;
  geometryVersion: number;
  metersPerMapUnit: number;
  source: "points" | "cells";
  warnings: readonly "points-length-mismatch"[];
} & (
  | { geometry: PhysicalRiverGeometry; bounds: RiverGeometryBounds; sampleCount: number }
  | {
      reason:
        | "invalid-source"
        | "invalid-scale"
        | "source-budget"
        | "invalid-width"
        | "invalid-curve"
        | "integration-budget"
        | "invalid-survey"
        | "sampling-budget"
        | "unstable-axis"
        | "folded-banks";
    }
);
