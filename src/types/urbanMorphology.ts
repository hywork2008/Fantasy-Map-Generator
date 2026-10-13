/** Non-economic, seeded urban history shared by FMG archives and CE. */
export type GrowthSource = "explicit" | "observed" | "estimated";
export interface PopulationKnot {
  year: number;
  people: number;
  source: GrowthSource;
}
export interface UrbanWallPhase {
  id: string;
  year: number;
  source: GrowthSource;
  people: number;
  targetDwellings: number;
  absorbedClusterIds: string[];
}
export interface UrbanApproach {
  id: string;
  routeIds: number[];
  sourceIndex: number;
  weight: number;
  defense: number;
}
export interface UrbanMorphologyProfile {
  version: 1;
  modelVersion: "extramural-v1";
  seed: string;
  baselineYear: number;
  baselinePopulation: number;
  contextRevision: string;
  foundedYear: number;
  foundedSource: GrowthSource;
  polityAgeAtBaseline: number;
  polityPower: number;
  defensePressure: number;
  period: string;
  waterfrontResolved?: boolean;
  growthRegime?: "steady" | "postExpansion" | "rapid" | "declining";
  populationKnots: PopulationKnot[];
  wallPhases: UrbanWallPhase[];
  approaches: UrbanApproach[];
  anchors: Array<{ id: string; kind: "religious" | "cemetery" | "fair"; year: number; source: GrowthSource }>;
}
