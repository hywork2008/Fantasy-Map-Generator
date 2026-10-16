import type { ApproachCorridorSettings } from "./approachCorridorSearch";
import type { WorldDryGuideSettings } from "./worldDryLandRouteGraph.types";

export interface WorldDryConnectionSettings {
  guides: WorldDryGuideSettings;
  corridor: ApproachCorridorSettings;
  firstConnectionId: number;
  maxSearches: number;
}
