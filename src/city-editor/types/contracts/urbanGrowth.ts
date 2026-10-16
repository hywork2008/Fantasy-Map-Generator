import type { Point } from "../primitives";
import type { OpenSpace } from "./parcelTypes";

export interface UrbanGrowthPlan {
  version: 1;
  requiredDwellings: number;
  outsideCap: number;
  outsideBudget: number;
  insideStoreys: number;
  regions: UrbanGrowthRegion[];
  fairs?: OpenSpace[];
  openWedges: Array<{ points: Point[]; widthMeters: number }>;
  outerEnclosedUrbanAreaShare: number | null;
  innerEnclosedAreaShare: number | null;
  absorbedClusters: Array<{ id: string; wallPhaseId: string; faceIds: string[] }>;
  reasons: string[];
}

export interface UrbanGrowthRegion {
  id: string;
  kind: "approachRibbon" | "anchorCluster";
  approachId?: string;
  roadGroupId?: string;
  gateVertexId?: string;
  points: Point[];
  weight: number;
  start: number;
  length: number;
  halfWidth: number;
  budget: number;
}
