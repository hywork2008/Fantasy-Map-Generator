import type { Point } from "../document";

export interface PopulationGenerationSettings {
  version: 1;
  source: "manual" | "fmg" | "ce-override";
  targetPopulation: number;
  housingDisplay: "auto" | "detailed" | "cluster-10" | "cluster-20";
  frameMode: "auto" | "manual";
  profileId: "medieval-v1";
  profileVersion: 1;
  /** Mesh cell width. Absent = 50 m. Coarser cells route roads and walls on a smaller
   * mesh and draw 50 m street blocks inside each cell (giant-city plan §10). */
  meshCellMeters?: 50 | 100 | 150 | 200;
}
export interface PopulationPlan {
  version: 1;
  settings: PopulationGenerationSettings;
  period: string;
  requiredDwellings: number;
  targetAreaM2: number;
  estimatedBuildings: number;
  residentialFootprintM2: number;
  cellWidthMeters: number;
  equivalent50mCells: number;
  extentMeters: number;
  cityRadiusMeters: number;
  displayDwellings: 1 | 10 | 20;
  housingFit?: { storeys: number; parcelAreaM2: number; pass: 1 | 2 | 3; exhausted?: boolean };
}
export interface ResidentialCluster {
  id: string;
  regionId: string;
  faceIds: string[];
  polygon: Point[];
  templateCounts: Record<string, number>;
  residentialFootprintM2: number;
  capacityDwellings: number;
  assignedDwellings: number;
  assignedPopulation: number;
}
export interface PopulationReport {
  targetPopulation: number;
  assignedPopulation: number;
  unplacedPopulation: number;
  estimatedBuildings: number;
  displayGroups: number;
  wallEnvelopeAreaM2: number | null;
  coreLandAreaM2: number;
  outsideDevelopedAreaM2: number;
  residentialFootprintM2: number;
  frameAreaM2: number;
  reasons: string[];
}
