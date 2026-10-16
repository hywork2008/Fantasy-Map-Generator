/** Explicit game coefficients. These scores are not travel time or currency.
 * Geometry precision and engineering capability are deliberately separate. */
export interface LandConnectionCalibration {
  baseSizeReference: number;
  maximumImportance: number;
  capitalBonus: number;
  portBonus: number;
  allowanceMeters: number;
  maximumAllowanceMeters: number;
  constructionAllowanceMeters: number;
  maximumConstructionMeters: number;
  bridgeFixedCostMeters: number;
  bridgeCostPerSquareMeter: number;
  bridgeLongSpanCostPerCubicMeter: number;
  bridgeUseCostMeters: number;
  bridgeUseCostPerMeter: number;
  approachCostPerSquareMeter: number;
}

export interface ConnectionCityImportance {
  id: number;
  /** Shared food/climate base size, available before population is finalized. */
  baseSize: number;
  capital: boolean;
  port: boolean;
}
