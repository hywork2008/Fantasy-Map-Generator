import type { LandConnectionCalibration } from "./landConnectionCalibration";

/** Trial profiles for reproducible coefficient comparisons. Not implicit
 * generation defaults; complete-world stage-6 acceptance remains necessary. */
const balanced: LandConnectionCalibration = {
  baseSizeReference: 100,
  maximumImportance: 4,
  capitalBonus: 1,
  portBonus: 0.5,
  allowanceMeters: 150000,
  maximumAllowanceMeters: 450000,
  constructionAllowanceMeters: 30000,
  maximumConstructionMeters: 90000,
  bridgeFixedCostMeters: 20,
  bridgeCostPerSquareMeter: 2,
  bridgeLongSpanCostPerCubicMeter: 0.1,
  bridgeUseCostMeters: 5,
  bridgeUseCostPerMeter: 0.2,
  approachCostPerSquareMeter: 0.5
};
export const LAND_CONNECTION_CALIBRATION_PROFILES: Readonly<Record<string, Readonly<LandConnectionCalibration>>> =
  Object.freeze({
    lenient: Object.freeze({
      ...balanced,
      bridgeFixedCostMeters: 10,
      bridgeCostPerSquareMeter: 0.5,
      bridgeLongSpanCostPerCubicMeter: 0.02,
      approachCostPerSquareMeter: 0.2
    }),
    balanced: Object.freeze(balanced),
    conservative: Object.freeze({
      ...balanced,
      constructionAllowanceMeters: 15000,
      maximumConstructionMeters: 45000,
      bridgeFixedCostMeters: 40,
      bridgeCostPerSquareMeter: 4,
      bridgeLongSpanCostPerCubicMeter: 0.2,
      approachCostPerSquareMeter: 1
    })
  });
