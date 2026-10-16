import type { WorldRiverGeometrySettings } from "../services/worldRiverGeometry.types";
import type { ApproachCorridorSettings } from "./approachCorridorSearch";
import type { LocalApproachGuideSettings } from "./localApproachGuides";
import type { CrossingCandidateDimensions } from "./riverCrossingCandidates";

export interface WorldCrossingApproachSettings {
  geometry: WorldRiverGeometrySettings;
  dimensions: CrossingCandidateDimensions;
  guides: LocalApproachGuideSettings;
  corridor: ApproachCorridorSettings;
  maxRivers: number;
}
