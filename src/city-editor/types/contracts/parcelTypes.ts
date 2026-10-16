import type { Id, Point } from "../primitives";

export interface OpenSpace {
  id: Id;
  faceId: Id;
  parcelId?: Id;
  kind: OpenSpaceKind;
  polygon: Point[];
  access: "private" | "shared";
}

export type OpenSpaceKind =
  | "backyard"
  | "kitchen-garden"
  | "workyard"
  | "courtyard"
  | "formal-garden"
  | "loading-yard"
  | "quay";
