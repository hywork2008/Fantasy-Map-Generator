import type { RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
import type { WorldRiverGeometryResult, WorldRiverGeometrySettings } from "../services/worldRiverGeometry.types";
import type {
  CrossingCandidateDimensions,
  CrossingCandidateInput,
  CrossingCandidateResult,
  ProvisionalRiverCrossing
} from "./riverCrossingCandidates";

export interface WorldCrossingCandidateSettings {
  geometry: WorldRiverGeometrySettings;
  dimensions: CrossingCandidateDimensions;
  spacingMeters: number;
  maxRivers: number;
  maxAttempts: number;
  /** Explicit allocation range; rejected attempts also consume a slot. */
  firstCandidateId: number;
  /** Optional bounded subdivision near measured narrow spans and city corridors. */
  refinement?: { maxCenters: number; levels: number; maxProjectionChecks: number };
}

export interface WorldCrossingCandidateEnvironment {
  /** Caller must supply physical lake/sea obstacles; registered rivers are added here. */
  nonRiverWater: readonly PhysicalWaterPolygon[];
  supportsDryFootprint: (riverId: number, footprint: readonly RiverPoint[]) => boolean;
  /** Collect vessel/technology requirements BEFORE candidate selection. */
  capabilityAt: (riverId: number, arcLengthMeters: number) => CrossingCandidateInput["capability"];
  corridors?: readonly { start: RiverPoint; end: RiverPoint }[];
  /** Bridge skew allowance at a river point (bridgeSkewPolicy.ts). When given, each
   * corridor's nearest coarse sample also gets one bridge turned toward the corridor,
   * within the allowance. Omitted: square crossings only. */
  skewLimitAt?: (point: RiverPoint) => number;
}

export interface WorldCrossingCandidateReport {
  status:
    | "complete"
    | "attempt-budget"
    | "river-budget"
    | "unresolved-water"
    | "invalid-settings"
    | "refinement-budget";
  geometries: readonly WorldRiverGeometryResult[];
  candidates: readonly ProvisionalRiverCrossing[];
  rejected: readonly {
    candidateId: number;
    riverId: number;
    arcLengthMeters: number;
    reason: Extract<CrossingCandidateResult, { reason: string }>["reason"];
  }[];
  attempts: number;
  nextCandidateId: number;
  waterSearch: { queries: number; visitedNodes: number; polygonTests: number; boundsTests: number };
}
