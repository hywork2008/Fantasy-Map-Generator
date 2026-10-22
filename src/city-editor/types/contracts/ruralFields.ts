import type { Id, Point } from "../primitives";
import type { InfillLane } from "./localInfill";

/** Rendering/generation profiles, not claims about land tenure in the economy. */
export type RuralFieldSystem = "open-field" | "bocage" | "planned" | "mechanized";
export interface RuralFieldSettings {
  mode?: "manual" | "background" | "off";
  range?: "near-city" | "whole-frame";
  direction?: "all" | "north" | "east" | "south" | "west";
  coveragePercent?: number;
  system?: RuralFieldSystem;
  rotationYear?: number;
  gardenRadiusMeters?: number;
  /** Approximate access-search cell count; lower values reduce work, not path width. */
  targetAccessCells?: number;
}
export interface RuralLandQuality {
  /** Measured or explicitly supplied fractions; absent means unknown. */
  soilQuality?: number;
  wetness?: number;
}
export type RuralShortfallReason = "terrain" | "access" | "space" | "minimum-plot";

export interface FarmPlot {
  plotId?: string;
  orientationRadians?: number;
  managementGroupId?: string;
  system?: RuralFieldSystem | "market-garden";
  cropState?: "winter-crop" | "spring-crop" | "fallow" | "horticulture" | "crop";
  rotationGroup?: number;
  holdingPolygon?: Point[];
  clippedByFrame?: boolean;
  tenureStrips?: Point[][];
  boundaryKind?: "hedge" | "wall";
  boundaries?: Point[][];
  sourceFaceIds?: Id[];
  faceId: Id;
  polygon: Point[];
  rows: Point[][];
  kind?: "open-field" | "kitchen-garden";
}

export interface RuralFieldDiagnostics {
  requestedAreaM2?: number;
  candidateAreaM2: number;
  reachableAreaM2: number;
  cultivatedAreaM2: number;
  shortfallAreaM2: number;
  gridMeters: number;
  orientationRadians: number;
  fixedAreaM2?: number;
  overBudgetAreaM2?: number;
  profile?: RuralFieldSystem;
  shortfallReason?: RuralShortfallReason;
  unsuitableAreaM2?: number;
  suitableCapacityM2?: number;
  suitabilitySource?: "survey" | "biome-estimate" | "unknown";
}

/** A generated stage snapshot, invalidated when its generation inputs change. */
export interface RuralFieldSnapshot {
  fingerprint: string;
  farms: FarmPlot[];
  lanes: InfillLane[];
  ruralFields?: RuralFieldDiagnostics;
}
