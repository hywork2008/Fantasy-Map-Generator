import type { Id, Point } from "../document";

export interface InfillLane {
  faceId: Id;
  points: Point[];
  widthMeters: number;
}
