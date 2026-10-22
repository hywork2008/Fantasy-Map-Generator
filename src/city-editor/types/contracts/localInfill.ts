import type { Id, Point } from "../primitives";

export interface InfillLane {
  kind?: "farm-track" | "headland";
  faceId: Id;
  points: Point[];
  widthMeters: number;
}
