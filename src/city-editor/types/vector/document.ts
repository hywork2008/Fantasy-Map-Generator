import type { HistoricalPeriod, Point } from "../primitives";
import type { VectorGeneration, VectorSite } from "./generation";
import type { VectorBuilding, VectorUrban } from "./urban";

export type VectorHandleMode = "corner" | "aligned" | "symmetric";
export type VectorSegment = (
  | { id: string; kind: "line"; from: Point; to: Point }
  | { id: string; kind: "cubic"; from: Point; control1: Point; control2: Point; to: Point }
) & { startMode?: VectorHandleMode };

export interface CurveAnchor {
  pathId: string;
  segmentId: string;
  t: number;
}

export type VectorPreset = {
  kind: "preset";
  center: Point;
  widthMeters: number;
  heightMeters: number;
  /** Bearing of the local width axis: north 0, clockwise. */
  bearingDegrees: number;
  cornerRadiusMeters?: number;
} & ({ preset: "ellipse" | "rectangle" } | { preset: "polygon"; sides: number });

export type VectorPathSource =
  | VectorPreset
  | {
      kind: "curve";
      closed: boolean;
      segments: VectorSegment[];
      freehandToleranceMeters?: number;
    };

export interface WidthStation {
  anchor: CurveAnchor;
  leftMeters: number;
  rightMeters: number;
}

export interface VectorPath {
  id: string;
  revision: number;
  role: "road" | "river" | "wall";
  origin: "imported" | "automatic" | "manual";
  editPolicy: "fixed" | "editable";
  source: VectorPathSource;
  width: { leftMeters: number; rightMeters: number; stations: WidthStation[]; interpolation?: "linear" };
}

export interface VectorNode {
  id: string;
  position: Point;
  anchors: CurveAnchor[];
}

export interface VectorRoadEdge {
  id: string;
  pathId: string;
  fromNodeId: string;
  toNodeId: string;
  from: CurveAnchor;
  to: CurveAnchor;
}

export interface VectorGate {
  id: string;
  wallPathId: string;
  nodeId: string;
  anchor: CurveAnchor;
  widthMeters: number;
  kind: "passage" | "water";
  circuitId?: string;
}

export interface VectorBridge {
  id: string;
  roadPathId: string;
  riverAnchor: CurveAnchor;
  from: CurveAnchor;
  to: CurveAnchor;
  structure: "stone" | "timber";
  dryLandingMeters: number;
  editPolicy: VectorPath["editPolicy"];
}

export interface VectorWallCircuit {
  id: string;
  pathId: string;
  parentCircuitId?: string;
}

export interface VectorRegion {
  use?: import("./urban").VectorUse;
  density?: number;
  maxHeightMeters?: number;
  id: string;
  kind: "district" | "reservation" | "forest" | "farm" | "park" | "cemetery";
  outer: Point[];
  holes: Point[][];
}

export interface VectorPlacement {
  id: string;
  modelId: string;
  position: Point;
  facingDegrees: number;
  origin: VectorPath["origin"];
  editPolicy: VectorPath["editPolicy"];
  site: { outer: Point[]; holes: Point[][] };
  accesses: CurveAnchor[];
  appearance?: {
    quality: import("../../../buildings/placementContract").PlacementQuality;
    palette?: import("../../../buildings/medieval/marketAppearance").MarketPalette;
    activity?: "market-day" | "closed";
  };
  building?: VectorBuilding;
  display?: {
    kind: "housing" | "facility" | "landmark" | "object";
    heightMeters: number;
    footprint: import("./generation").VectorPolygon[];
    provenance: "copied" | "massing";
    note: string;
    dwellings?: number;
  };
}

/** Saved geometry ledger. No editable cell mesh or render-time generation. */
export interface VectorCityDocument {
  format: "fmg-vector-city";
  version: 8;
  revision: number;
  frame: { extentMeters: number };
  context: {
    historicalPeriod: HistoricalPeriod;
    targetPopulation: number;
    bridgeSkewTier?: 0 | 1 | 2;
    /** Mesh-editor generation settings the city was requested with (native v8), without the FMG descriptor,
     * which the site keeps. Kept as given, so settings meshless cannot generate yet are shown, not lost. */
    requestedSettings?: Omit<import("../generation").GenerationSettings, "descriptor">;
  };
  paths: Record<string, VectorPath>;
  connections: {
    nodes: Record<string, VectorNode>;
    edges: Record<string, VectorRoadEdge>;
    gates: Record<string, VectorGate>;
    circuits: Record<string, VectorWallCircuit>;
    bridges: Record<string, VectorBridge>;
    wallRoads: Record<
      string,
      { id: string; pathId: string; outerCircuitId: string; innerCircuitId: string; clearanceMeters: number }
    >;
  };
  regions: Record<string, VectorRegion>;
  placements: Record<string, VectorPlacement>;
  site?: VectorSite;
  generation?: VectorGeneration;
  urban?: VectorUrban;
  environment?: import("./environment").VectorEnvironment;
  /** Generated districts, street blocks and houses (native v8). Houses here are not in `placements`. */
  fabric?: import("./fabric").VectorFabric;
  legacyCopy?: {
    sourceJson: string;
    report: { id: string; status: "converted" | "snapshot" | "unsupported"; category: string; reason: string }[];
  };
  recipe: { algorithm: "vector-city-v1"; seed: string };
}
