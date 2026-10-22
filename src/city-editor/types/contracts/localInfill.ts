import type { Id, Point } from "../document";

export interface InfillLane {
  kind?: "farm-track" | "headland";
  faceId: Id;
  points: Point[];
  widthMeters: number;
}
