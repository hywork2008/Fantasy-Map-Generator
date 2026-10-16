import type { RiverPoint } from "../services/riverGeometry";
import type { LandConnectionAssessmentSettings } from "./landConnectionAssessment";

export interface WorldConnectionPair {
  id: number;
  cityAId: number;
  cityBId: number;
  weight: number;
  assessmentSettings?: Pick<LandConnectionAssessmentSettings, "maxConstructionCostMeters" | "maxRouteCostMeters">;
  unconnectedAllowanceMeters: number;
  startTangent?: RiverPoint;
  goalTangent?: RiverPoint;
}
