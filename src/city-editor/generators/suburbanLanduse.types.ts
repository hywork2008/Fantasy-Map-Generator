import type { Id, Point } from "../types/primitives";

export type SuburbanProfile = "trade" | "granary" | "frontier" | "rural";

export interface ApproachBand {
  groupId: Id;
  /** Gate end first, then the road out to the map boundary. */
  points: Point[];
  profile: SuburbanProfile;
  clearance: number;
  length: number;
  gateVertexId?: Id;
}
