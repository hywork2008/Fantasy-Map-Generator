import type { RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
import type {
  buildConstrainedLandNetwork,
  ConstrainedLandNetwork,
  NetworkEnvironment,
  NetworkRouteResult,
  NetworkSearchSettings
} from "./constrainedLandNetwork";
import type { LandConnectionAssessment, LandConnectionAssessmentSettings } from "./landConnectionAssessment";
import type { SharedFacilityGroup, SharedFacilitySelectionSettings } from "./landConnectionSelection.types";
import type { CrossingCandidateInput, ProvisionalRiverCrossing } from "./riverCrossingCandidates";
import type { SharedConnectionAssessment, SharedConnectionSettings } from "./sharedLandConnectionAssessment";
import type { WorldConnectionPair } from "./worldConnectionPair";
import type { WorldCrossingApproachSettings } from "./worldRiverCrossingApproaches.types";
import type {
  WorldCrossingCandidateReport,
  WorldCrossingCandidateSettings
} from "./worldRiverCrossingCandidates.types";

export interface WorldProposalEnvironment {
  nonRiverWater: readonly PhysicalWaterPolygon[];
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
  /** Whole occupied regions in metres, including bridge water: politics/diplomacy/allowed regions. */
  allowsPassageFootprint: (footprint: readonly RiverPoint[]) => boolean;
  capabilityAt: (riverId: number, arcLengthMeters: number) => CrossingCandidateInput["capability"];
  facilityCostsAt: (crossing: ProvisionalRiverCrossing) => { constructionCostMeters: number; useCostMeters: number };
  approachConstructionCostAt: (
    crossing: ProvisionalRiverCrossing,
    cityAId: number,
    cityBId: number,
    corridorLengthsMeters: readonly [number, number]
  ) => number;
}

export interface WorldProposalSettings {
  crossings: WorldCrossingCandidateSettings;
  approaches: Pick<WorldCrossingApproachSettings, "guides" | "corridor">;
  network: Pick<
    Parameters<typeof buildConstrainedLandNetwork>[0],
    "maxNodes" | "maxEdges" | "maxCorridorPieces" | "maxGuideNodes" | "maxGuideEdges"
  >;
  maxPairs: number;
  maxApproachAttempts: number;
  maxAssessmentSearches: number;
  firstConnectionId: number;
  search: NetworkSearchSettings;
  individual: LandConnectionAssessmentSettings;
  shared: SharedConnectionSettings;
  sharedSelection?: SharedFacilitySelectionSettings;
}

export interface WorldProposalDiagnostics {
  enumeration: WorldCrossingCandidateReport | null;
  approachAttempts: number;
  assessmentSearches: number;
  approachSearchPeak?: { labels: number; expansions: number };
  rejected: readonly {
    facilityId: number;
    connectionId?: number;
    cityAId?: number;
    cityBId?: number;
    reason: string;
  }[];
  individuals: readonly { pairId: number; assessment: LandConnectionAssessment }[];
  shared?: SharedConnectionAssessment;
  sharedGroups?: readonly { group: SharedFacilityGroup; assessment: SharedConnectionAssessment }[];
  groupSelection?: { checks: number; truncated: boolean };
  sharedBundleSearches?: readonly { pairId: number; result: NetworkRouteResult }[];
}

export type WorldLandProposalResult = (
  | { status: "evaluated"; network: ConstrainedLandNetwork }
  | {
      status: "unresolved";
      reason:
        | "invalid-input"
        | "pair-budget"
        | "candidate-enumeration"
        | "approach-budget"
        | "assessment-budget"
        | "unresolved-water"
        | "invalid-cost"
        | "invalid-network"
        | "assessment-unresolved";
    }
) & { diagnostics: WorldProposalDiagnostics };

export interface WorldLandProposalContext {
  network: ConstrainedLandNetwork;
  assessmentSearches: number;
  environment: NetworkEnvironment;
  baselineConnectionIds: readonly number[];
  pairs: readonly WorldConnectionPair[];
  settings: WorldProposalSettings;
  worldIdentity: string;
  sharedGroups: readonly SharedFacilityGroup[];
  reportAdoption: (kind: "individual" | "shared", id: number | undefined, facilityIds: readonly number[]) => void;
  nodePointAt: (id: number) => RiverPoint | null;
}

export type { WorldConnectionPair } from "./worldConnectionPair";
