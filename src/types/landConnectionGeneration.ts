import type { LandBudgetPolicy, LandSearchMeasurements } from "../generators/landConnectionBudgets.types";
import type { LandConnectionCalibration } from "../generators/landConnectionCalibration.types";
import type { NearbyConnectionSettings } from "../generators/landConnectionSelection.types";
import type { CrossingCandidateInput } from "../generators/riverCrossingCandidates";
import type { WorldDryConnectionSettings } from "../generators/worldDryLandConnections.types";
import type { PrioritizedLandAdoptionSettings } from "../generators/worldLandConnectionAdoption.types";
import type { WorldLandArchiveBudgets } from "../generators/worldLandConnectionArchive.types";
import type { WorldProposalSettings } from "../generators/worldLandConnectionProposals.types";
import type { RegisteredRouteSceneSettings } from "../renderers/registeredLandRouteScene.types";
import type { WorldFootprintPolicySettings } from "../services/worldLandFootprintPolicy.types";

/** Explicit, serializable engineering/selection contract. Absence retains legacy
 * generation until stage-6 default acceptance; no trial calibration is inferred.
 */
export interface WorldLandConnectionGenerationSettings {
  calibration: LandConnectionCalibration;
  nearby: NearbyConnectionSettings;
  measurements: LandSearchMeasurements;
  budgetPolicy: LandBudgetPolicy;
  settings: WorldProposalSettings;
  cellPolicySettings: WorldFootprintPolicySettings;
  dryBaseline: Omit<WorldDryConnectionSettings, "corridor">;
  allowedStateIds: readonly number[];
  maximumSupportedHeight: number;
  /** Missing engineering data forbids a bridge on that river. */
  capabilities: Readonly<Record<number, CrossingCandidateInput["capability"]>>;
  adoption: PrioritizedLandAdoptionSettings;
  archive: WorldLandArchiveBudgets;
  scene: Omit<RegisteredRouteSceneSettings, "metresPerUnit" | "originMeters" | "connectionIds">;
}
