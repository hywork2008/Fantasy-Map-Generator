import type { WorldContext } from "../context/worldContext";
import type { LandConnectionAssessmentSettings } from "./landConnectionAssessment";
import type { ProvisionalRiverCrossing } from "./riverCrossingCandidates";
import { getSettlementBaseSize } from "./settlementSuitability";
import type { WorldConnectionPair } from "./worldLandConnectionProposals";

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

export function validateLandConnectionCalibration(settings: LandConnectionCalibration): void {
  if (
    !Object.values(settings).every(value => Number.isFinite(value) && value >= 0) ||
    settings.baseSizeReference <= 0 ||
    settings.maximumImportance < 1 ||
    settings.bridgeUseCostMeters <= 0
  )
    throw new Error("invalid-land-connection-calibration");
}

/** A bottleneck importance avoids a tiny outpost inheriting a capital's full
 * construction allowance. Every credit is finite and saturated. */
export function calibrateLandConnectionPair(
  id: number,
  a: ConnectionCityImportance,
  b: ConnectionCityImportance,
  settings: LandConnectionCalibration,
  assessment: LandConnectionAssessmentSettings
): WorldConnectionPair {
  validateLandConnectionCalibration(settings);
  if (
    ![id, a.id, b.id].every(value => Number.isSafeInteger(value) && value >= 0) ||
    a.id === b.id ||
    a.id === 0 ||
    b.id === 0 ||
    ![a.baseSize, b.baseSize].every(value => Number.isFinite(value) && value >= 0)
  )
    throw new Error("invalid-connection-city");
  const importance = (city: ConnectionCityImportance) =>
    Math.min(
      settings.maximumImportance,
      1 +
        Math.sqrt(city.baseSize / settings.baseSizeReference) +
        (city.capital ? settings.capitalBonus : 0) +
        (city.port ? settings.portBonus : 0)
    );
  const weight = Math.min(importance(a), importance(b));
  const allowance = Math.min(settings.maximumAllowanceMeters, settings.allowanceMeters * weight);
  return {
    id,
    cityAId: a.id,
    cityBId: b.id,
    weight,
    unconnectedAllowanceMeters: allowance,
    assessmentSettings: {
      maxConstructionCostMeters: Math.min(
        assessment.maxConstructionCostMeters,
        settings.maximumConstructionMeters,
        settings.constructionAllowanceMeters * weight
      ),
      maxRouteCostMeters: Math.min(assessment.maxRouteCostMeters, allowance / weight)
    }
  };
}

/** Long spans grow superlinearly. Only the physical D→D deck is charged;
 * displayed extensions never enter construction or use costs. */
export function calibrateBridgeCosts(
  crossing: Pick<ProvisionalRiverCrossing, "deckLengthMeters">,
  roadWidthMeters: number,
  settings: LandConnectionCalibration
): { constructionCostMeters: number; useCostMeters: number } {
  validateLandConnectionCalibration(settings);
  const length = crossing.deckLengthMeters;
  if (![length, roadWidthMeters].every(value => Number.isFinite(value) && value > 0))
    throw new Error("invalid-bridge-dimensions");
  const constructionCostMeters =
    settings.bridgeFixedCostMeters +
    length * roadWidthMeters * settings.bridgeCostPerSquareMeter +
    length * length * roadWidthMeters * settings.bridgeLongSpanCostPerCubicMeter;
  const useCostMeters = settings.bridgeUseCostMeters + length * settings.bridgeUseCostPerMeter;
  if (![constructionCostMeters, useCostMeters].every(Number.isFinite)) throw new Error("invalid-calibrated-cost");
  return { constructionCostMeters, useCostMeters };
}

/** Charge both confirmed outer corridors. Fixed straight approaches already
 * belonging to the facility are excluded; shared assessment counts each new
 * connection once, even when the bridge itself is already built. */
export function calibrateApproachCost(
  corridorLengthsMeters: readonly [number, number],
  roadWidthMeters: number,
  settings: LandConnectionCalibration
): number {
  validateLandConnectionCalibration(settings);
  if (
    !corridorLengthsMeters.every(value => Number.isFinite(value) && value >= 0) ||
    !Number.isFinite(roadWidthMeters) ||
    roadWidthMeters <= 0
  )
    throw new Error("invalid-approach-dimensions");
  const cost =
    (corridorLengthsMeters[0] + corridorLengthsMeters[1]) * roadWidthMeters * settings.approachCostPerSquareMeter;
  if (!Number.isFinite(cost)) throw new Error("invalid-calibrated-cost");
  return cost;
}

/** Current world adapter: ignores final population and never changes the city. */
export function calibrateWorldLandConnectionPair(
  world: Readonly<WorldContext>,
  id: number,
  cityAId: number,
  cityBId: number,
  settings: LandConnectionCalibration,
  assessment: LandConnectionAssessmentSettings
): WorldConnectionPair {
  const readCity = (cityId: number): ConnectionCityImportance => {
    const burg = world.pack.burgs[cityId];
    if (!burg || burg.i !== cityId || burg.removed) throw new Error("invalid-connection-city");
    return {
      id: cityId,
      baseSize: getSettlementBaseSize(
        world.pack.cells,
        burg.cell,
        world.grid.cells.temp,
        world.grid.cells.prec,
        world.pack.features
      ),
      capital: Boolean(burg.capital),
      port: Boolean(burg.port)
    };
  };
  return calibrateLandConnectionPair(id, readCity(cityAId), readCity(cityBId), settings, assessment);
}
